/**
 * 12-SearchService.gs — Global search (v8)
 *
 * PURPOSE: Case-insensitive substring search across projects and all
 * request/catalog sheets. v8: each result now carries TYPE-SPECIFIC
 * fields plus a `detail` payload, so the frontend can render the right
 * columns per result type and open a detail modal on click.
 */

// ============================================================
//  SEARCH
// ============================================================

function search(query) {
  query = String(query || '').toLowerCase().trim();
  if (!query) return [];
  var hit_ = function () {
    for (var i = 0; i < arguments.length; i++) {
      if (String(arguments[i] || '').toLowerCase().indexOf(query) > -1) return true;
    }
    return false;
  };
  var results = [];

  readAll_('Projects').forEach(function (p) {
    if (!hit_(p.id, p.name, p.location)) return;
    // v11 BATCH F2: quotations and lost bids are NOT filtered out here.
    // Search is the one place you actively want to find an old bid —
    // "what did we quote this client last year" is the question. They
    // are labelled instead, so the result is never mistaken for a live
    // project.
    var isQuote = !isLiveProject_(p);
    results.push({
      type: isQuote ? (String(p.status).toLowerCase() === 'lost' ? 'Lost Bid' : 'Quotation') : 'Project',
      id: p.id, label: p.name,
      status: p.status || '', projectId: p.id,
      detail: { 'Project ID': p.id, 'Name': p.name, 'Status': p.status || '—',
        'Location': p.location || '—', 'Start': fmtDate_(p.startDate), 'End': fmtDate_(p.endDate) }
    });
  });

  readAll_('CashAdvanceRequests').forEach(function (r) {
    if (!hit_(r.id, r.description, r.requestor, r.projectId)) return;
    results.push({
      type: 'Cash Advance', id: r.id, label: r.description || '',
      requestor: r.requestor || '', projectId: r.projectId || '',
      amount: parseFloat(r.amount) || 0, status: r.status || '',
      date: fmtDate_(r.createdAt),
      detail: { 'Request ID': r.id, 'Requestor': r.requestor || '—', 'Project': r.projectId || '—',
        'Amount': '₱' + fmtMoney_(parseFloat(r.amount) || 0), 'Purpose': r.description || '—',
        'Scope': r.scope || '—', 'Status': r.status || '—', 'Date Needed': fmtDate_(r.dateNeeded),
        'Created': fmtDate_(r.createdAt) }
    });
  });

  readAll_('CashRelease').forEach(function (r) {
    if (!hit_(r.id, r.description, r.requestor, r.projectId, r.originalRequestId)) return;
    results.push({
      type: 'Cash Release', id: r.id, label: r.description || '',
      requestor: r.requestor || '', projectId: r.projectId || '',
      amount: parseFloat(r.amount) || 0, status: r.status || '',
      date: fmtDate_(r.createdAt),
      detail: { 'Release ID': r.id, 'From Request': r.originalRequestId || '—',
        'Requestor': r.requestor || '—', 'Project': r.projectId || '—',
        'Amount': '₱' + fmtMoney_(parseFloat(r.amount) || 0), 'Description': r.description || '—',
        'Status': r.status || '—', 'Released By': r.releasedBy || '—', 'Released At': fmtDate_(r.releasedAt) }
    });
  });

  readAll_('IncomingCashRequests').forEach(function (r) {
    if (!hit_(r.id, r.description, r.requestor, r.projectId, r.reference)) return;
    results.push({
      type: 'Incoming Cash', id: r.id, label: r.description || '',
      requestor: r.requestor || '', projectId: r.projectId || '',
      amount: parseFloat(r.amount) || 0, status: r.status || '',
      date: fmtDate_(r.transactionDate || r.createdAt),
      detail: { 'ID': r.id, 'Requestor': r.requestor || '—', 'Project': r.projectId || '—',
        'Amount': '₱' + fmtMoney_(parseFloat(r.amount) || 0), 'Description': r.description || '—',
        'Payment Method': r.paymentMethod || '—', 'Reference': r.reference || '—',
        'Transaction Date': fmtDate_(r.transactionDate), 'Status': r.status || '—' }
    });
  });

  readAll_('Liquidations').forEach(function (l) {
    if (!hit_(l.id, l.description, l.requestor, l.projectId, l.cashAdvanceId, l.receiptNo)) return;
    results.push({
      type: 'Liquidation', id: l.id, label: l.description || '',
      requestor: l.requestor || '', projectId: l.projectId || '',
      amount: parseFloat(l.amount) || 0, status: l.status || '',
      date: fmtDate_(l.createdAt),
      detail: { 'Liquidation ID': l.id, 'Cash Advance': l.cashAdvanceId || '—',
        'Requestor': l.requestor || '—', 'Project': l.projectId || '—',
        'Amount': '₱' + fmtMoney_(parseFloat(l.amount) || 0), 'Description': l.description || '—',
        'Receipt No.': l.receiptNo || '—', 'Status': l.status || '—', 'Created': fmtDate_(l.createdAt) }
    });
  });

  readAll_('Materials').forEach(function (m) {
    if (!hit_(m.id, m.name, m.brand, m.specs, m.category, m.model)) return;
    results.push({
      type: 'Material', id: m.id, label: m.name || m.brand || '',
      status: m.status || '', category: m.category || '', brand: m.brand || '',
      unit: m.unit || '',
      detail: { 'Material ID': m.id, 'Name': m.name || '—', 'Brand': m.brand || '—',
        'Category': (m.category || '—') + (m.subcategory ? ' → ' + m.subcategory : ''),
        'Unit': m.unit || '—', 'Specs': m.specs || '—', 'Grade': m.grade || '—',
        'Size': m.size || '—', 'Status': m.status || '—' },
      image: m.image || ''
    });
  });

  readAll_('Equipment').forEach(function (e) {
    if (!hit_(e.id, e.name, e.brand, e.model, e.category, e.serial)) return;
    results.push({
      type: 'Equipment', id: e.id, label: (e.brand || '') + (e.model ? ' — ' + e.model : ''),
      status: e.status || '', category: e.category || '', brand: e.brand || '',
      unit: e.unit || '',
      detail: { 'Equipment ID': e.id, 'Brand': e.brand || '—', 'Model': e.model || '—',
        'Category': e.category || '—', 'Serial': e.serial || '—', 'Capacity': e.capacity || '—',
        'Power Source': e.powerSource || '—', 'Ownership': e.ownership || '—',
        'Condition': e.condition || '—', 'Status': e.status || '—' },
      image: e.image || ''
    });
  });

  readAll_('Manpower').forEach(function (m) {
    if (!hit_(m.id, m.role, m.classification, m.code)) return;
    results.push({
      type: 'Manpower Role', id: m.id, label: m.role || '',
      status: m.status || '', category: m.classification || '',
      detail: { 'ID': m.id, 'Role / Trade': m.role || '—', 'Classification': m.classification || '—',
        'Code': m.code || '—', 'Notes': m.notes || '—', 'Status': m.status || '—' }
    });
  });

  readAll_('Personnel').forEach(function (p) {
    if (!hit_(p.id, p.name, p.role, p.classification)) return;
    results.push({
      type: 'Personnel', id: p.id, label: p.name || '',
      status: p.status || 'active', category: p.role || '',
      detail: { 'ID': p.id, 'Name': p.name || '—', 'Position / Role': p.role || '—',
        'Classification': p.classification || '—', 'Contact': String(p.contactNumber || '—'),
        'Notes': p.notes || '—', 'Status': p.status || 'active' }
    });
  });

  readAll_('Billings').forEach(function (b) {
    if (!hit_(b.id, b.billingNo, b.projectId)) return;
    results.push({
      type: 'Billing', id: b.id, label: b.billingNo || '',
      projectId: b.projectId || '', amount: parseFloat(b.netAmount) || 0,
      status: b.status || '', date: fmtDate_(b.createdAt),
      detail: { 'Billing ID': b.id, 'Billing #': b.billingNo || '—', 'Project': b.projectId || '—',
        'Period': String(b.period || '—'), '% Range': (parseFloat(b.prevPct) || 0) + '% → ' + (parseFloat(b.currentPct) || 0) + '%',
        'Gross': '₱' + fmtMoney_(parseFloat(b.grossAmount) || 0),
        'Retention': '₱' + fmtMoney_(parseFloat(b.retentionAmount) || 0),
        'Net': '₱' + fmtMoney_(parseFloat(b.netAmount) || 0), 'Status': b.status || '—' }
    });
  });

  readAll_('Transfers').forEach(function (t) {
    if (!hit_(t.id, t.item, t.fromLoc, t.toLoc)) return;
    results.push({
      type: 'Transfer', id: t.id, label: t.item || '',
      status: t.status || '', date: fmtDate_(t.transferDate),
      detail: { 'Transfer ID': t.id, 'Item': t.item || '—', 'Type': t.itemType || '—',
        'Qty': (parseFloat(t.qty) || 0) + ' ' + (t.unit || ''),
        'From': t.fromLoc || '—', 'To': t.toLoc || '—', 'Reason': t.reason || '—',
        'Date': fmtDate_(t.transferDate), 'Status': t.status || '—' }
    });
  });

  // ── v11 BATCH I3: THE RECORDS THAT WERE MISSING ──
  // Search covered the sheets that existed when it was written and was
  // never extended as the system grew. Everything from Batch D onward
  // was invisible to it: safety records, punchlist, drawings, OT
  // requests, purchase requests, purchase orders, goods receipts,
  // supplier invoices, suppliers, quotations and lessons learned.
  //
  // A search box that silently omits half the system is worse than no
  // search box — you conclude the record does not exist.
  //
  // Each block is guarded with getSheetByName because these sheets are
  // created on first use; a project that has never raised a purchase
  // order simply has no PurchaseOrders sheet yet.
  var has_ = function (n) { return !!ss_().getSheetByName(n); };

  if (has_('SafetyRecords')) {
    readAll_('SafetyRecords').forEach(function (r) {
      if (!hit_(r.id, r.recordType, r.description, r.personsInvolved, r.projectId)) return;
      results.push({
        type: 'Safety', id: r.id, label: r.recordType || '',
        projectId: r.projectId || '', status: r.status || '', date: fmtDate_(r.recordDate),
        detail: { 'Record ID': r.id, 'Type': r.recordType || '—', 'Date': fmtDate_(r.recordDate),
          'Project': r.projectId || '—', 'Description': r.description || '—',
          'Severity': r.severity || '—', 'Persons': r.personsInvolved || '—',
          'Action taken': r.actionTaken || '—', 'Status': r.status || '—' }
      });
    });
  }

  if (has_('Punchlist')) {
    readAll_('Punchlist').forEach(function (r) {
      if (!hit_(r.id, r.description, r.sowId, r.projectId)) return;
      results.push({
        type: 'Punchlist', id: r.id, label: r.description || '',
        projectId: r.projectId || '', status: r.status || '', date: fmtDate_(r.dateRaised),
        detail: { 'Item': r.id, 'SOW': r.sowId || '—', 'Description': r.description || '—',
          'Severity': r.severity || '—', 'Raised': fmtDate_(r.dateRaised), 'Status': r.status || '—' }
      });
    });
  }

  if (has_('Drawings')) {
    readAll_('Drawings').forEach(function (r) {
      if (!hit_(r.id, r.drawingNo, r.title, r.discipline, r.projectId)) return;
      results.push({
        type: 'Drawing', id: r.id, label: r.drawingNo || r.title || '',
        projectId: r.projectId || '', status: r.revision || '', date: fmtDate_(r.dateIssued),
        detail: { 'Drawing': r.drawingNo || '—', 'Title': r.title || '—',
          'Revision': r.revision || '—', 'Discipline': r.discipline || '—',
          'Issued': fmtDate_(r.dateIssued) }
      });
    });
  }

  if (has_('OTRequests')) {
    readAll_('OTRequests').forEach(function (r) {
      if (!hit_(r.id, r.reason, r.requestedBy, r.projectId)) return;
      results.push({
        type: 'OT Request', id: r.id, label: r.reason || '',
        projectId: r.projectId || '', status: r.status || '', date: fmtDate_(r.otDate),
        detail: { 'Request ID': r.id, 'Date': fmtDate_(r.otDate),
          'Hours': (r.otStart || '') + ' – ' + (r.otEnd || ''),
          'Reason': r.reason || '—', 'Requested by': r.requestedBy || '—', 'Status': r.status || '—' }
      });
    });
  }

  if (has_('PurchaseRequests')) {
    readAll_('PurchaseRequests').forEach(function (r) {
      if (!hit_(r.id, r.title, r.justification, r.sowId, r.projectId, r.requestor)) return;
      results.push({
        type: 'Purchase Request', id: r.id, label: r.title || '',
        projectId: r.projectId || '', amount: parseFloat(r.totalAmount) || 0,
        status: r.status || '', date: fmtDate_(r.createdAt),
        detail: { 'PR No.': r.id, 'Title': r.title || '—', 'Project': r.projectId || '—',
          'SOW': r.sowId || '—', 'Amount': '₱' + fmtMoney_(parseFloat(r.totalAmount) || 0),
          'Route': low_(r.route) === 'cash' ? 'Cash advance' : 'Purchase order',
          'Description': r.justification || '—',
          'Requested by': r.requestor || '—', 'Status': r.status || '—' }
      });
    });
  }

  if (has_('PurchaseOrders')) {
    var suppById_ = {};
    if (has_('Suppliers')) {
      readAll_('Suppliers').forEach(function (x) { suppById_[x.id] = x.name; });
    }
    readAll_('PurchaseOrders').forEach(function (r) {
      var sname = suppById_[r.supplierId] || r.supplierId || '';
      if (!hit_(r.id, r.prId, sname, r.sowId, r.projectId)) return;
      results.push({
        type: 'Purchase Order', id: r.id, label: sname,
        projectId: r.projectId || '', amount: parseFloat(r.grossAmount) || 0,
        status: r.status || '', date: fmtDate_(r.issuedAt),
        detail: { 'PO No.': r.id, 'Supplier': sname || '—', 'From request': r.prId || '—',
          'Project': r.projectId || '—', 'SOW': r.sowId || '—',
          'Gross': '₱' + fmtMoney_(parseFloat(r.grossAmount) || 0),
          'Expected': fmtDate_(r.expectedDate), 'Status': r.status || '—' }
      });
    });
  }

  if (has_('Receipts')) {
    readAll_('Receipts').forEach(function (r) {
      if (!hit_(r.id, r.poId, r.deliveryRef, r.sowId, r.projectId)) return;
      results.push({
        type: 'Goods Receipt', id: r.id, label: r.deliveryRef || r.poId || '',
        projectId: r.projectId || '', amount: parseFloat(r.grossAmount) || 0,
        status: r.status || '', date: fmtDate_(r.receiptDate),
        detail: { 'Receipt': r.id, 'Against PO': r.poId || '—', 'Delivery ref': r.deliveryRef || '—',
          'Received': fmtDate_(r.receiptDate), 'SOW': r.sowId || '—',
          'Value': '₱' + fmtMoney_(parseFloat(r.grossAmount) || 0), 'Status': r.status || '—' }
      });
    });
  }

  if (has_('SupplierInvoices')) {
    readAll_('SupplierInvoices').forEach(function (r) {
      if (!hit_(r.id, r.invoiceNo, r.poId, r.projectId)) return;
      var bal = (parseFloat(r.grossAmount) || 0) - (parseFloat(r.paidAmount) || 0);
      results.push({
        type: 'Supplier Invoice', id: r.id, label: r.invoiceNo || r.id,
        projectId: r.projectId || '', amount: parseFloat(r.grossAmount) || 0,
        status: r.status || '', date: fmtDate_(r.invoiceDate),
        detail: { 'Invoice': r.invoiceNo || r.id, 'Against PO': r.poId || '—',
          'Gross': '₱' + fmtMoney_(parseFloat(r.grossAmount) || 0),
          'Paid': '₱' + fmtMoney_(parseFloat(r.paidAmount) || 0),
          'Balance': '₱' + fmtMoney_(bal), 'Due': fmtDate_(r.dueDate), 'Status': r.status || '—' }
      });
    });
  }

  if (has_('Suppliers')) {
    readAll_('Suppliers').forEach(function (r) {
      if (!hit_(r.id, r.name, r.contactPerson, r.tin, r.category)) return;
      results.push({
        type: 'Supplier', id: r.id, label: r.name || '',
        status: r.status || '', date: fmtDate_(r.createdAt),
        detail: { 'Supplier': r.name || '—', 'Contact': r.contactPerson || '—',
          'Number': r.contactNumber || '—', 'TIN': r.tin || '—',
          'Terms': supplierTermsLabel_(r.termsDays), 'Category': r.category || '—',
          'Status': r.status || '—' }
      });
    });
  }

  if (has_('Quotations')) {
    readAll_('Quotations').forEach(function (r) {
      if (!hit_(r.id, r.title, r.clientName, r.projectId)) return;
      results.push({
        type: 'Quotation', id: r.id, label: r.title || '',
        projectId: r.projectId || '', amount: parseFloat(r.quotedValue) || 0,
        status: r.status || '', date: fmtDate_(r.createdAt),
        detail: { 'Quote No.': r.id, 'Title': r.title || '—', 'Client': r.clientName || '—',
          'Revision': r.revision || '—',
          'Quoted': '₱' + fmtMoney_(parseFloat(r.quotedValue) || 0),
          'Valid until': fmtDate_(r.validUntil), 'Status': r.status || '—' }
      });
    });
  }

  if (has_('LessonsLearned')) {
    readAll_('LessonsLearned').forEach(function (r) {
      if (!hit_(r.id, r.title, r.category, r.projectName, r.recommendation)) return;
      results.push({
        type: 'Lesson', id: r.id, label: r.title || '',
        projectId: r.projectId || '', status: r.category || '', date: fmtDate_(r.capturedAt),
        detail: { 'Lesson': r.title || '—', 'Category': r.category || '—',
          'Project': r.projectName || '—', 'Recommendation': r.recommendation || '—',
          'Captured': fmtDate_(r.capturedAt) }
      });
    });
  }

  return results;
}
