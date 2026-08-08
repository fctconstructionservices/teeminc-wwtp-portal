/**
 * 32-PurchaseOrderService.gs — PO · Receiving · Payables (v11 BATCH G2)
 *
 * Completes the procurement chain started in G1:
 *
 *   PR → approved → PO to a supplier → goods received → invoice → paid
 *
 * ── THE THREE DECISIONS THAT SHAPE THIS FILE ─────────────────
 *
 * 1. RECEIVING IS WHAT CREATES COST.
 *    Under accrual, a goods receipt is a cost event, not a clerical
 *    one — the moment it is saved, the SOW's actual cost moves, CPI
 *    moves, and the retrospective's cost findings move. So receiving is
 *    restricted to project editors, and a receipt carries the SOW id
 *    inherited from the PR line so cost lands on the right scope item.
 *
 * 2. THE PAYABLE IS SEPARATE FROM THE RECEIPT.
 *    Goods often arrive weeks before the invoice does. Recording cost on
 *    receipt but the debt on invoice is exactly what accrual is for: the
 *    job knows what it has consumed even while the paperwork lags. The
 *    gap between them is reported as "received, not invoiced", because
 *    an unbilled delivery is money you owe and have not been asked for
 *    yet — the kind of thing that ambushes a cashflow.
 *
 * 3. ONE PR CAN BECOME SEVERAL POs.
 *    Ten items, three suppliers winning different lines, is normal. Each
 *    PR line tracks qtyOrdered so what is still unordered stays visible
 *    instead of being silently forgotten or double-ordered.
 *
 * ── THE PO-VS-PR TOLERANCE ───────────────────────────────────
 * A PO that exceeds its PR by more than 5% needs re-approval. Without
 * that, PR approval is theatre: you approve ₱100k and order ₱400k. 5%
 * absorbs a rate that moved between quoting and ordering without
 * reopening the whole approval for a rounding difference.
 */

var PO_OVER_TOLERANCE = 0.05;

// ============================================================
//  PURCHASE ORDERS
// ============================================================

function nextPoNumber_() {
  ensureSheet_('PurchaseOrders');
  var year = new Date().getFullYear();
  var max = 0;
  readAll_('PurchaseOrders').forEach(function (p) {
    var m = String(p.id || '').match(/^PO-(\d{4})-(\d+)$/);
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
  });
  return 'PO-' + year + '-' + String(max + 1).padStart(4, '0');
}

/** getPurchaseOrders - POs with lines, receipt progress and supplier. */
function getPurchaseOrders(projectId) {
  ensureSheet_('PurchaseOrders');
  ensureSheet_('POLines');
  readMany_(['PurchaseOrders', 'POLines', 'Suppliers', 'Projects',
    'Receipts', 'SupplierInvoices']);

  var suppliers = {};
  readAll_('Suppliers').forEach(function (s) { suppliers[s.id] = s; });
  var projects = {};
  readAll_('Projects').forEach(function (p) { projects[p.id] = p.name; });

  var linesByPo = {};
  readAll_('POLines').forEach(function (l) {
    (linesByPo[l.poId] = linesByPo[l.poId] || []).push(l);
  });

  var invByPo = {};
  if (ss_().getSheetByName('SupplierInvoices')) {
    readAll_('SupplierInvoices').forEach(function (i) {
      if (low_(i.status) === 'cancelled') return;
      (invByPo[i.poId] = invByPo[i.poId] || []).push(i);
    });
  }

  var rows = readAll_('PurchaseOrders').filter(function (po) {
    return !projectId || po.projectId === projectId;
  });

  rows.forEach(function (po) {
    var s = suppliers[po.supplierId] || {};
    po.supplierName = s.name || po.supplierId;
    po.termsDays = parseInt(s.termsDays, 10) || 0;
    po.termsLabel = supplierTermsLabel_(s.termsDays);
    po.projectName = projects[po.projectId] || po.projectId;
    po.lines = (linesByPo[po.id] || []).sort(function (a, b) {
      return (parseInt(a.sortOrder, 10) || 0) - (parseInt(b.sortOrder, 10) || 0);
    });
    var want = 0, got = 0;
    po.lines.forEach(function (l) {
      want += parseFloat(l.qty) || 0;
      got += parseFloat(l.qtyReceived) || 0;
    });
    po.receivedPct = want > 0 ? Math.round(got / want * 100) : 0;
    var invs = invByPo[po.id] || [];
    po.invoicedAmount = r2_(invs.reduce(function (s2, i) { return s2 + (parseFloat(i.grossAmount) || 0); }, 0));
    po.invoiceCount = invs.length;
  });

  rows.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return sanitizeDatesDeep_(rows);
}

/**
 * createPurchaseOrder - Raises a PO against an APPROVED purchase
 * request, for a subset of its lines.
 *
 * data: { prId, supplierId, lines:[{prLineId, qty, rate}],
 *         expectedDate, deliverTo, notes }
 */
function createPurchaseOrder(data) {
  requireApprover_('raising a purchase order');
  ensureSheet_('PurchaseOrders');
  ensureSheet_('POLines');

  if (!data || !data.prId) throw new Error('A purchase order must come from a purchase request.');
  var pr = readAll_('PurchaseRequests').find(function (p) { return p.id === data.prId; });
  if (!pr) throw new Error('Purchase request not found.');
  assertProjectEditor_(pr.projectId);

  var st = low_(pr.status);
  if (st !== 'approved' && st !== 'ordered') {
    throw new Error('Only an approved purchase request can be ordered against. ' +
      pr.id + ' is ' + pr.status + '.');
  }
  if (low_(pr.route) === 'cash') {
    throw new Error(pr.id + ' is a cash purchase — it already has a cash advance. ' +
      'Raise a new request on the purchase-order route if it needs a supplier.');
  }

  var supplier = supplierById_(data.supplierId);
  if (!supplier) throw new Error('Select a supplier.');
  if (low_(supplier.status) === 'inactive') {
    throw new Error(supplier.name + ' is marked inactive.');
  }

  var prLines = {};
  readAll_('PRLines').forEach(function (l) { if (l.prId === pr.id) prLines[l.id] = l; });

  var lines = [];
  (Array.isArray(data.lines) ? data.lines : []).forEach(function (l, i) {
    var src = prLines[l.prLineId];
    if (!src) return;
    var qty = parseFloat(l.qty) || 0;
    if (qty <= 0) return;

    // Ordering more than was requested is the quiet way a PR's approval
    // gets bypassed one line at a time.
    var already = parseFloat(src.qtyOrdered) || 0;
    var remaining = (parseFloat(src.qty) || 0) - already;
    if (qty > remaining + 0.0001) {
      throw new Error('"' + src.itemName + '": only ' + remaining + ' ' + (src.unit || '') +
        ' remain unordered on ' + pr.id + ', but ' + qty + ' was entered.');
    }
    var rate = l.rate !== undefined && l.rate !== '' ? parseFloat(l.rate) : (parseFloat(src.rate) || 0);
    lines.push({
      prLineId: src.id, materialId: src.materialId, itemName: src.itemName,
      unit: src.unit, qty: qty, rate: rate, amount: r2_(qty * rate), sortOrder: i
    });
  });

  if (!lines.length) throw new Error('Select at least one item and quantity to order.');

  var gross = r2_(lines.reduce(function (s, l) { return s + l.amount; }, 0));
  var v = splitVat_(gross, !!supplier.pricesIncludeVat, !!supplier.vatRegistered);

  // PO-vs-PR tolerance. Without it, PR approval is theatre.
  var prTotal = parseFloat(pr.totalAmount) || 0;
  var alreadyOrdered = readAll_('PurchaseOrders')
    .filter(function (p) { return p.prId === pr.id && low_(p.status) !== 'cancelled'; })
    .reduce(function (s, p) { return s + (parseFloat(p.grossAmount) || 0); }, 0);
  var afterThis = alreadyOrdered + v.gross;
  var overTolerance = prTotal > 0 && afterThis > prTotal * (1 + PO_OVER_TOLERANCE);

  var id = nextPoNumber_();
  appendRow_('PurchaseOrders', {
    id: id,
    prId: pr.id,
    projectId: pr.projectId,
    sowId: pr.sowId,
    supplierId: supplier.id,
    grossAmount: v.gross,
    netAmount: v.net,
    vatAmount: v.vat,
    expectedDate: data.expectedDate ? fmtDate_(data.expectedDate) : '',
    deliverTo: String(data.deliverTo || pr.deliverTo || ''),
    notes: String(data.notes || ''),
    // A PO over its PR's tolerance is held rather than issued. Issuing
    // it and asking forgiveness later is how the control quietly dies.
    status: overTolerance ? 'Pending Approval' : 'Issued',
    overPrBy: overTolerance ? r2_(afterThis - prTotal) : 0,
    issuedBy: currentUserEmail_().toLowerCase(),
    issuedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  });

  lines.forEach(function (l) {
    appendRow_('POLines', {
      id: nextId_('POL'), poId: id, prLineId: l.prLineId, materialId: l.materialId,
      itemName: l.itemName, unit: l.unit, qty: l.qty, rate: l.rate, amount: l.amount,
      qtyReceived: 0, sortOrder: l.sortOrder
    });
    // reserve the quantity on the PR line
    var src = prLines[l.prLineId];
    updateRow_('PRLines', 'id', l.prLineId, {
      qtyOrdered: (parseFloat(src.qtyOrdered) || 0) + l.qty
    });
  });

  _syncPrOrderedStatus_(pr.id);

  logActivity_('Purchase order ' + id + ' raised on ' + supplier.name + ' for ' +
    fmtMoney_(v.gross) + ' against ' + pr.id +
    (overTolerance ? ' — HELD: exceeds the purchase request by ' + fmtMoney_(afterThis - prTotal) : ''),
    overTolerance ? 'a' : 'blue', id);

  return {
    success: true, id: id, grossAmount: v.gross, netAmount: v.net, vatAmount: v.vat,
    heldForApproval: overTolerance,
    dueDateIfDeliveredToday: supplierDueDate_(supplier.id, new Date())
  };
}

/** _syncPrOrderedStatus_ - flips a PR to Ordered once fully covered. */
function _syncPrOrderedStatus_(prId) {
  var lines = readAll_('PRLines').filter(function (l) { return l.prId === prId; });
  if (!lines.length) return;
  var fully = lines.every(function (l) {
    return (parseFloat(l.qtyOrdered) || 0) >= (parseFloat(l.qty) || 0) - 0.0001;
  });
  var pr = readAll_('PurchaseRequests').find(function (p) { return p.id === prId; });
  if (!pr) return;
  var want = fully ? 'Ordered' : 'Approved';
  if (pr.status !== want && ['approved', 'ordered'].indexOf(low_(pr.status)) > -1) {
    updateRow_('PurchaseRequests', 'id', prId, { status: want, updatedAt: new Date() });
  }
}

/** approvePurchaseOrder - releases a PO held for exceeding its PR. */
function approvePurchaseOrder(id) {
  requireApprover_('approving an over-request purchase order');
  var po = readAll_('PurchaseOrders').find(function (p) { return p.id === id; });
  if (!po) throw new Error('Purchase order not found.');
  if (low_(po.status) !== 'pending approval') {
    throw new Error('This purchase order is ' + po.status + ', not awaiting approval.');
  }
  if (low_(po.issuedBy) === currentUserEmail_().toLowerCase() && currentUserRole_() !== 'superadmin') {
    throw new Error('You raised this purchase order, so someone else must approve the overrun.');
  }
  updateRow_('PurchaseOrders', 'id', id, { status: 'Issued', updatedAt: new Date() });
  logActivity_('Purchase order ' + id + ' overrun of ' + fmtMoney_(po.overPrBy) +
    ' approved by ' + currentUserName_(), 'g', id);
  return { success: true };
}

/** cancelPurchaseOrder - releases the reserved quantities back to the PR. */
function cancelPurchaseOrder(id, reason) {
  requireApprover_('cancelling a purchase order');
  var po = readAll_('PurchaseOrders').find(function (p) { return p.id === id; });
  if (!po) throw new Error('Purchase order not found.');
  if (low_(po.status) === 'cancelled') throw new Error('Already cancelled.');

  var lines = readAll_('POLines').filter(function (l) { return l.poId === id; });
  var received = lines.reduce(function (s, l) { return s + (parseFloat(l.qtyReceived) || 0); }, 0);
  if (received > 0) {
    throw new Error('Goods have already been received against this order. ' +
      'Cancelling it would leave stock and cost with no order behind them — raise a return instead.');
  }

  lines.forEach(function (l) {
    var src = readAll_('PRLines').find(function (x) { return x.id === l.prLineId; });
    if (!src) return;
    updateRow_('PRLines', 'id', l.prLineId, {
      qtyOrdered: Math.max(0, (parseFloat(src.qtyOrdered) || 0) - (parseFloat(l.qty) || 0))
    });
  });

  updateRow_('PurchaseOrders', 'id', id, {
    status: 'Cancelled', notes: String(reason || po.notes || ''), updatedAt: new Date()
  });
  _syncPrOrderedStatus_(po.prId);
  logActivity_('Purchase order ' + id + ' cancelled' + (reason ? ' — ' + reason : '') +
    '; quantities released back to ' + po.prId, 'a', id);
  return { success: true };
}

// ============================================================
//  RECEIVING — this is where COST is created
// ============================================================

/**
 * receiveGoods - Records a delivery against a PO.
 *
 * THIS IS A COST EVENT. The moment it saves, the SOW's actual cost
 * moves, CPI moves, and the project's expenses move. It is not clerical,
 * which is why it needs project-editor rights.
 *
 * Cost is booked NET of recoverable input VAT when the company is
 * VAT-registered — input VAT is reclaimed, so charging it to the job
 * would overstate the job by 12%.
 *
 * data: { poId, receiptDate, deliveryRef, lines:[{poLineId, qty}], notes }
 */
function receiveGoods(data) {
  ensureSheet_('Receipts');
  if (!data || !data.poId) throw new Error('Select the purchase order being delivered against.');

  var po = readAll_('PurchaseOrders').find(function (p) { return p.id === data.poId; });
  if (!po) throw new Error('Purchase order not found.');
  assertProjectEditor_(po.projectId);
  if (low_(po.status) === 'cancelled') throw new Error('This purchase order was cancelled.');
  if (low_(po.status) === 'pending approval') {
    throw new Error('This purchase order is held for approval because it exceeds its purchase request. ' +
      'It cannot be received against until that is resolved.');
  }

  var supplier = supplierById_(po.supplierId) || {};
  var poLines = {};
  readAll_('POLines').forEach(function (l) { if (l.poId === po.id) poLines[l.id] = l; });

  var recLines = [];
  var gross = 0;
  (Array.isArray(data.lines) ? data.lines : []).forEach(function (l) {
    var src = poLines[l.poLineId];
    if (!src) return;
    var qty = parseFloat(l.qty) || 0;
    if (qty <= 0) return;
    var already = parseFloat(src.qtyReceived) || 0;
    var remaining = (parseFloat(src.qty) || 0) - already;
    // Over-receipt is how phantom stock and phantom cost appear.
    if (qty > remaining + 0.0001) {
      throw new Error('"' + src.itemName + '": only ' + remaining + ' ' + (src.unit || '') +
        ' remain outstanding on this order, but ' + qty + ' was entered.');
    }
    var rate = parseFloat(src.rate) || 0;
    var amt = r2_(qty * rate);
    gross += amt;
    recLines.push({
      poLineId: src.id, materialId: src.materialId, itemName: src.itemName,
      unit: src.unit, qty: qty, rate: rate, amount: amt
    });
  });

  if (!recLines.length) throw new Error('Enter the quantity received for at least one item.');

  var v = splitVat_(gross, !!supplier.pricesIncludeVat, !!supplier.vatRegistered);
  var receiptDate = data.receiptDate ? fmtDate_(data.receiptDate) : fmtDate_(new Date());
  var id = nextId_('GRN');

  appendRow_('Receipts', {
    id: id,
    poId: po.id,
    prId: po.prId,
    projectId: po.projectId,
    sowId: po.sowId,
    supplierId: po.supplierId,
    receiptDate: receiptDate,
    deliveryRef: String(data.deliveryRef || ''),
    grossAmount: v.gross,
    netAmount: v.net,
    vatAmount: v.vat,
    linesJSON: JSON.stringify(recLines),
    notes: String(data.notes || ''),
    status: 'Received',
    receivedBy: currentUserEmail_().toLowerCase(),
    createdAt: new Date(),
    updatedAt: new Date()
  });

  recLines.forEach(function (l) {
    var src = poLines[l.poLineId];
    updateRow_('POLines', 'id', l.poLineId, {
      qtyReceived: (parseFloat(src.qtyReceived) || 0) + l.qty
    });
    if (l.prLineId) {
      var pl = readAll_('PRLines').find(function (x) { return x.id === src.prLineId; });
      if (pl) updateRow_('PRLines', 'id', src.prLineId, {
        qtyReceived: (parseFloat(pl.qtyReceived) || 0) + l.qty
      });
    }
  });

  _syncPoReceivedStatus_(po.id);

  logActivity_('Goods received ' + id + ' on ' + po.id + ' — ' + fmtMoney_(v.gross) +
    ' (' + recLines.length + ' item(s)); cost booked to ' + po.sowId, 'g', id);

  return {
    success: true, id: id, netAmount: v.net, grossAmount: v.gross, vatAmount: v.vat,
    dueDate: supplierDueDate_(po.supplierId, receiptDate)
  };
}

function _syncPoReceivedStatus_(poId) {
  var lines = readAll_('POLines').filter(function (l) { return l.poId === poId; });
  if (!lines.length) return;
  var fully = lines.every(function (l) {
    return (parseFloat(l.qtyReceived) || 0) >= (parseFloat(l.qty) || 0) - 0.0001;
  });
  var any = lines.some(function (l) { return (parseFloat(l.qtyReceived) || 0) > 0; });
  var po = readAll_('PurchaseOrders').find(function (p) { return p.id === poId; });
  if (!po || low_(po.status) === 'cancelled') return;
  var want = fully ? 'Received' : any ? 'Partly Received' : 'Issued';
  if (po.status !== want) updateRow_('PurchaseOrders', 'id', poId, { status: want, updatedAt: new Date() });
}

function getReceipts(projectId) {
  ensureSheet_('Receipts');
  return sanitizeDatesDeep_(
    readAll_('Receipts')
      .filter(function (r) { return !projectId || r.projectId === projectId; })
      .map(function (r) { r.lines = safeParse_(r.linesJSON, []); return r; })
      .sort(function (a, b) { return new Date(b.receiptDate) - new Date(a.receiptDate); })
  );
}

/**
 * cancelReceipt - Reverses a receipt. Super Admin only, because it
 * removes cost that has already been reported.
 */
function cancelReceipt(id, reason) {
  requireSuperAdmin_('cancelling a goods receipt');
  var r = readAll_('Receipts').find(function (x) { return x.id === id; });
  if (!r) throw new Error('Receipt not found.');
  if (low_(r.status) === 'cancelled') throw new Error('Already cancelled.');

  var invoiced = ss_().getSheetByName('SupplierInvoices')
    ? readAll_('SupplierInvoices').filter(function (i) {
        return low_(i.status) !== 'cancelled' &&
          safeParse_(i.receiptIdsJSON, []).indexOf(id) > -1;
      }).length
    : 0;
  if (invoiced) {
    throw new Error('This receipt is already covered by a supplier invoice. ' +
      'Cancel or amend the invoice first, or the payable would no longer match anything received.');
  }

  safeParse_(r.linesJSON, []).forEach(function (l) {
    var pol = readAll_('POLines').find(function (x) { return x.id === l.poLineId; });
    if (!pol) return;
    updateRow_('POLines', 'id', l.poLineId, {
      qtyReceived: Math.max(0, (parseFloat(pol.qtyReceived) || 0) - (parseFloat(l.qty) || 0))
    });
  });

  updateRow_('Receipts', 'id', id, {
    status: 'Cancelled', notes: String(reason || r.notes || ''), updatedAt: new Date()
  });
  _syncPoReceivedStatus_(r.poId);
  logActivity_('Goods receipt ' + id + ' CANCELLED by ' + currentUserName_() +
    ' — ' + fmtMoney_(r.netAmount) + ' of cost reversed' + (reason ? ': ' + reason : ''), 'a', id);
  return { success: true };
}

// ============================================================
//  SUPPLIER INVOICES — the payable
// ============================================================

/**
 * recordSupplierInvoice - Books the debt. Separate from the receipt
 * because goods routinely arrive weeks before the invoice does.
 *
 * The due date comes from the supplier's terms applied to the DELIVERY
 * date, not the invoice date — that is what the terms actually mean, and
 * dating from the invoice would let a slow-invoicing supplier quietly
 * extend their own credit.
 */
function recordSupplierInvoice(data) {
  requireApprover_('recording a supplier invoice');
  ensureSheet_('SupplierInvoices');

  if (!data || !data.poId) throw new Error('Select the purchase order this invoice covers.');
  var po = readAll_('PurchaseOrders').find(function (p) { return p.id === data.poId; });
  if (!po) throw new Error('Purchase order not found.');
  assertProjectEditor_(po.projectId);

  var receiptIds = Array.isArray(data.receiptIds) ? data.receiptIds : [];
  var receipts = readAll_('Receipts').filter(function (r) {
    return r.poId === po.id && low_(r.status) !== 'cancelled' &&
      (!receiptIds.length || receiptIds.indexOf(r.id) > -1);
  });
  if (!receipts.length) {
    throw new Error('Nothing has been received against ' + po.id +
      ' yet. Record the delivery first — an invoice for goods that never arrived is not a payable, it is a dispute.');
  }

  var supplier = supplierById_(po.supplierId) || {};
  var gross = data.grossAmount !== undefined && data.grossAmount !== ''
    ? r2_(data.grossAmount)
    : r2_(receipts.reduce(function (s, r) { return s + (parseFloat(r.grossAmount) || 0); }, 0));
  if (gross <= 0) throw new Error('Enter the invoice amount.');

  var v = splitVat_(gross, !!supplier.pricesIncludeVat, !!supplier.vatRegistered);

  // terms run from DELIVERY, so use the latest receipt covered
  var lastDelivery = receipts.map(function (r) { return String(r.receiptDate); }).sort().pop();
  var due = data.dueDate ? fmtDate_(data.dueDate) : supplierDueDate_(po.supplierId, lastDelivery);

  var id = nextId_('SI');
  appendRow_('SupplierInvoices', {
    id: id,
    poId: po.id,
    prId: po.prId,
    projectId: po.projectId,
    sowId: po.sowId,
    supplierId: po.supplierId,
    invoiceNo: String(data.invoiceNo || ''),
    invoiceDate: data.invoiceDate ? fmtDate_(data.invoiceDate) : fmtDate_(new Date()),
    deliveryDate: lastDelivery,
    dueDate: due,
    grossAmount: v.gross,
    netAmount: v.net,
    vatAmount: v.vat,
    paidAmount: 0,
    receiptIdsJSON: JSON.stringify(receipts.map(function (r) { return r.id; })),
    paymentsJSON: '[]',
    notes: String(data.notes || ''),
    status: 'Unpaid',
    recordedBy: currentUserEmail_().toLowerCase(),
    createdAt: new Date(),
    updatedAt: new Date()
  });

  logActivity_('Supplier invoice ' + (data.invoiceNo || id) + ' recorded — ' +
    (supplier.name || po.supplierId) + ', ' + fmtMoney_(v.gross) + ', due ' + due, 'blue', id);
  return { success: true, id: id, dueDate: due, grossAmount: v.gross };
}

/**
 * paySupplierInvoice - Records a payment, in full or in part.
 *
 * This is CASH OUT, not cost — the cost landed when the goods were
 * received. Paying does not touch the SOW's actual cost, and that is
 * the whole point of accrual.
 */
function paySupplierInvoice(id, data) {
  requireApprover_('paying a supplier invoice');
  data = data || {};
  var inv = readAll_('SupplierInvoices').find(function (i) { return i.id === id; });
  if (!inv) throw new Error('Invoice not found.');
  assertProjectEditor_(inv.projectId);
  if (low_(inv.status) === 'cancelled') throw new Error('This invoice was cancelled.');

  var balance = r2_((parseFloat(inv.grossAmount) || 0) - (parseFloat(inv.paidAmount) || 0));
  if (balance <= 0.005) throw new Error('This invoice is already fully paid.');

  var amount = data.amount !== undefined && data.amount !== '' ? r2_(data.amount) : balance;
  if (amount <= 0) throw new Error('Enter the payment amount.');
  if (amount > balance + 0.005) {
    throw new Error('Payment of ' + fmtMoney_(amount) + ' exceeds the outstanding balance of ' +
      fmtMoney_(balance) + '.');
  }

  var payments = safeParse_(inv.paymentsJSON, []);
  payments.push({
    date: data.paymentDate ? fmtDate_(data.paymentDate) : fmtDate_(new Date()),
    amount: amount,
    method: String(data.method || ''),
    reference: String(data.reference || ''),
    paidBy: currentUserEmail_().toLowerCase()
  });

  var paid = r2_((parseFloat(inv.paidAmount) || 0) + amount);
  var fully = paid >= (parseFloat(inv.grossAmount) || 0) - 0.005;

  updateRow_('SupplierInvoices', 'id', id, {
    paidAmount: paid,
    paymentsJSON: JSON.stringify(payments),
    status: fully ? 'Paid' : 'Partly Paid',
    paidDate: fully ? (data.paymentDate ? fmtDate_(data.paymentDate) : fmtDate_(new Date())) : '',
    updatedAt: new Date()
  });

  logActivity_('Supplier invoice ' + (inv.invoiceNo || id) + ' paid ' + fmtMoney_(amount) +
    (fully ? ' — settled in full' : ' — ' + fmtMoney_(balance - amount) + ' still outstanding'), 'g', id);
  return { success: true, paid: paid, balance: r2_(balance - amount), fullyPaid: fully };
}

function cancelSupplierInvoice(id, reason) {
  requireSuperAdmin_('cancelling a supplier invoice');
  var inv = readAll_('SupplierInvoices').find(function (i) { return i.id === id; });
  if (!inv) throw new Error('Invoice not found.');
  if ((parseFloat(inv.paidAmount) || 0) > 0) {
    throw new Error('Payments have been made against this invoice. Cancelling it would leave ' +
      fmtMoney_(inv.paidAmount) + ' of payment with nothing behind it.');
  }
  updateRow_('SupplierInvoices', 'id', id, {
    status: 'Cancelled', notes: String(reason || inv.notes || ''), updatedAt: new Date()
  });
  logActivity_('Supplier invoice ' + (inv.invoiceNo || id) + ' cancelled by ' + currentUserName_(), 'a', id);
  return { success: true };
}

// ============================================================
//  PAYABLES — who is owed, and when
// ============================================================

/**
 * getPayables - The whole point of the supplier record.
 *
 * Includes RECEIVED-BUT-NOT-INVOICED as a distinct bucket. That value
 * is already counted as cost and is money you owe — you simply have not
 * been asked for it yet. Leaving it out of a payables view is how a
 * cashflow gets ambushed by an invoice for goods delivered six weeks
 * ago.
 */
function getPayables() {
  ensureSheet_('SupplierInvoices');
  ensureSheet_('Receipts');
  readMany_(['SupplierInvoices', 'Receipts', 'Suppliers', 'Projects',
    'PurchaseOrders']);

  var suppliers = {};
  readAll_('Suppliers').forEach(function (s) { suppliers[s.id] = s; });
  var projects = {};
  readAll_('Projects').forEach(function (p) { projects[p.id] = p.name; });

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var dayMs = 86400000;

  var invoices = readAll_('SupplierInvoices')
    .filter(function (i) { return low_(i.status) !== 'cancelled'; })
    .map(function (i) {
      var s = suppliers[i.supplierId] || {};
      var gross = parseFloat(i.grossAmount) || 0;
      var paid = parseFloat(i.paidAmount) || 0;
      i.balance = r2_(gross - paid);
      i.supplierName = s.name || i.supplierId;
      i.termsLabel = supplierTermsLabel_(s.termsDays);
      i.projectName = projects[i.projectId] || i.projectId;
      i.payments = safeParse_(i.paymentsJSON, []);

      var due = i.dueDate ? new Date(i.dueDate) : null;
      if (due && !isNaN(due)) {
        due.setHours(0, 0, 0, 0);
        i.daysToDue = Math.round((due - today) / dayMs);
        i.bucket = i.balance <= 0.005 ? 'paid'
          : i.daysToDue < 0 ? 'overdue'
          : i.daysToDue <= 7 ? 'week'
          : i.daysToDue <= 30 ? 'month' : 'later';
      } else {
        i.daysToDue = null;
        i.bucket = i.balance <= 0.005 ? 'paid' : 'later';
      }
      return i;
    });

  // Received but not yet invoiced.
  var invoicedReceipts = {};
  invoices.forEach(function (i) {
    safeParse_(i.receiptIdsJSON, []).forEach(function (rid) { invoicedReceipts[rid] = true; });
  });
  var uninvoiced = readAll_('Receipts')
    .filter(function (r) { return low_(r.status) !== 'cancelled' && !invoicedReceipts[r.id]; })
    .map(function (r) {
      var s = suppliers[r.supplierId] || {};
      return {
        id: r.id, poId: r.poId, projectId: r.projectId, projectName: projects[r.projectId] || r.projectId,
        sowId: r.sowId, supplierId: r.supplierId, supplierName: s.name || r.supplierId,
        termsLabel: supplierTermsLabel_(s.termsDays),
        receiptDate: r.receiptDate, deliveryRef: r.deliveryRef,
        grossAmount: parseFloat(r.grossAmount) || 0,
        balance: parseFloat(r.grossAmount) || 0,
        expectedDue: supplierDueDate_(r.supplierId, r.receiptDate),
        bucket: 'uninvoiced', status: 'Received, not invoiced'
      };
    });

  var open = invoices.filter(function (i) { return i.balance > 0.005; });
  var sum = function (list) {
    return r2_(list.reduce(function (s, x) { return s + (parseFloat(x.balance) || 0); }, 0));
  };

  return sanitizeDatesDeep_({
    invoices: invoices.sort(function (a, b) {
      if (a.balance <= 0.005 && b.balance > 0.005) return 1;
      if (b.balance <= 0.005 && a.balance > 0.005) return -1;
      return String(a.dueDate).localeCompare(String(b.dueDate));
    }),
    uninvoiced: uninvoiced.sort(function (a, b) {
      return String(a.receiptDate).localeCompare(String(b.receiptDate));
    }),
    summary: {
      overdue: sum(open.filter(function (i) { return i.bucket === 'overdue'; })),
      overdueCount: open.filter(function (i) { return i.bucket === 'overdue'; }).length,
      dueWeek: sum(open.filter(function (i) { return i.bucket === 'week'; })),
      dueWeekCount: open.filter(function (i) { return i.bucket === 'week'; }).length,
      dueMonth: sum(open.filter(function (i) { return i.bucket === 'month'; })),
      outstanding: sum(open),
      openCount: open.length,
      supplierCount: Object.keys(open.reduce(function (m, i) { m[i.supplierId] = 1; return m; }, {})).length,
      uninvoiced: sum(uninvoiced),
      uninvoicedCount: uninvoiced.length
    }
  });
}

/**
 * payableOutflowByMonth_ - Dated obligations for the cashflow forecast.
 *
 * The forecast has never known about supplier credit: it only ever saw
 * cash already released, so a large payable was invisible until the day
 * it landed. Every unpaid balance is now a dated outflow.
 */
function payableOutflowByMonth_(projectId) {
  if (!ss_().getSheetByName('SupplierInvoices')) return {};
  var out = {};
  readAll_('SupplierInvoices').forEach(function (i) {
    if (low_(i.status) === 'cancelled') return;
    if (projectId && i.projectId !== projectId) return;
    var bal = (parseFloat(i.grossAmount) || 0) - (parseFloat(i.paidAmount) || 0);
    if (bal <= 0.005) return;
    var d = i.dueDate ? new Date(i.dueDate) : null;
    if (!d || isNaN(d)) return;
    var key = d.getFullYear() + '-' + d.getMonth();
    out[key] = (out[key] || 0) + bal;
  });
  return out;
}
