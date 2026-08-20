import { all, first, run } from './db.js';
import { dayOf, logActivity, low, nextId, nowIso, num, requireRole, safeParseArray } from './util.js';

async function nextSequentialId(env, table, prefix) {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const rows = await all(env, `SELECT id FROM "${table}" WHERE id LIKE ?`, like);
  const max = rows.reduce((m, r) => {
    const n = parseInt(String(r.id).split('-').pop(), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}

async function replacePrLines(env, prId, lines) {
  await run(env, 'DELETE FROM PRLines WHERE prId = ?', prId);
  let total = 0;
  let order = 0;
  for (const l of lines || []) {
    const amount = num(l.amount) || num(l.qty) * num(l.rate);
    total += amount;
    await run(
      env,
      `INSERT INTO PRLines (id, prId, materialId, itemName, unit, qty, rate, amount,
         qtyOrdered, qtyReceived, notes, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      l.id || nextId('PRL'), prId, l.materialId || '', l.itemName || '', l.unit || '',
      num(l.qty), num(l.rate), amount, l.notes || '', String(order++)
    );
  }
  return total;
}

async function upsertPurchaseRequest(env, identity, data, status) {
  const d = data || {};
  const id = d.id || await nextSequentialId(env, 'PurchaseRequests', 'PR');
  const exists = d.id ? await first(env, 'SELECT id FROM PurchaseRequests WHERE id = ?', d.id) : null;
  const total = await replacePrLines(env, id, d.lines);

  if (exists) {
    await run(
      env,
      `UPDATE PurchaseRequests SET projectId = ?, sowId = ?, title = ?, justification = ?, route = ?,
         preferredSupplierId = ?, dateNeeded = ?, deliverTo = ?, totalAmount = ?, status = ?, updatedAt = ?
       WHERE id = ?`,
      d.projectId || '', d.sowId || '', d.title || '', d.justification || '', d.route || 'po',
      d.preferredSupplierId || '', dayOf(d.dateNeeded), d.deliverTo || '', total, status, nowIso(), id
    );
  } else {
    await run(
      env,
      `INSERT INTO PurchaseRequests (id, projectId, sowId, title, justification, route,
         preferredSupplierId, dateNeeded, deliverTo, totalAmount, budgetState, budgetMessage,
         status, requestor, requestorEmail, approvalsJSON, cashAdvanceId, cancelReason,
         createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, '[]', '', '', ?, ?)`,
      id, d.projectId || '', d.sowId || '', d.title || '', d.justification || '', d.route || 'po',
      d.preferredSupplierId || '', dayOf(d.dateNeeded), d.deliverTo || '', total, status,
      identity.user.name || identity.email, low(identity.email), nowIso(), nowIso()
    );
  }
  return { id, total };
}

export async function submitPurchaseRequest(env, identity, data) {
  const { id } = await upsertPurchaseRequest(env, identity, data, 'Pending');
  await logActivity(env, identity.email, `Purchase request ${id} submitted.`, 'blue');
  return { success: true, id };
}

export async function submitDraftPurchaseRequest(env, identity, data) {
  const { id } = await upsertPurchaseRequest(env, identity, data, 'Draft');
  return { success: true, id };
}

export async function updatePurchaseRequest(env, identity, id, data) {
  const existing = await first(env, 'SELECT status FROM PurchaseRequests WHERE id = ?', id);
  if (!existing) throw new Error('That purchase request no longer exists.');
  const { total } = await upsertPurchaseRequest(env, identity, { ...(data || {}), id }, existing.status);
  return { success: true, total };
}

export async function cancelPurchaseRequest(env, identity, id, reason) {
  await run(
    env, "UPDATE PurchaseRequests SET status = 'Cancelled', cancelReason = ?, updatedAt = ? WHERE id = ?",
    reason || '', nowIso(), id
  );
  await logActivity(env, identity.email, `Purchase request ${id} cancelled.`, 'a');
  return { success: true };
}

export async function deletePurchaseRequest(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'deleting a purchase request');
  await run(env, 'DELETE FROM PRLines WHERE prId = ?', id);
  await run(env, 'DELETE FROM PurchaseRequests WHERE id = ?', id);
  await logActivity(env, identity.email, `Purchase request ${id} deleted.`, 'a');
  return { success: true };
}

// ─── PURCHASE ORDERS ───────────────────────────────────────────

export async function createPurchaseOrder(env, identity, data) {
  requireRole(identity, ['superadmin', 'admin'], 'creating a purchase order');
  const d = data || {};
  const id = await nextSequentialId(env, 'PurchaseOrders', 'PO');

  let gross = 0;
  let order = 0;
  const lines = d.lines || [];
  for (const l of lines) gross += num(l.amount) || num(l.qty) * num(l.rate);

  const supplier = d.supplierId
    ? await first(env, 'SELECT vatRegistered, pricesIncludeVat FROM Suppliers WHERE id = ?', d.supplierId)
    : null;
  const vatable = supplier && Number(supplier.vatRegistered) === 1;
  const net = vatable ? gross / 1.12 : gross;
  const vat = gross - net;

  await run(
    env,
    `INSERT INTO PurchaseOrders (id, prId, projectId, sowId, supplierId, grossAmount, netAmount,
       vatAmount, expectedDate, deliverTo, notes, status, overPrBy, issuedBy, issuedAt,
       createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Issued', '0', ?, ?, ?, ?)`,
    id, d.prId || '', d.projectId || '', d.sowId || '', d.supplierId || '',
    gross, net, vat, dayOf(d.expectedDate), d.deliverTo || '', d.notes || '',
    low(identity.email), nowIso(), nowIso(), nowIso()
  );

  for (const l of lines) {
    const amount = num(l.amount) || num(l.qty) * num(l.rate);
    await run(
      env,
      `INSERT INTO POLines (id, poId, prLineId, materialId, itemName, unit, qty, rate, amount,
         qtyReceived, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      nextId('POL'), id, l.prLineId || '', l.materialId || '', l.itemName || '', l.unit || '',
      num(l.qty), num(l.rate), amount, String(order++)
    );
    if (l.prLineId) {
      await run(env, 'UPDATE PRLines SET qtyOrdered = qtyOrdered + ? WHERE id = ?', num(l.qty), l.prLineId);
    }
  }

  if (d.prId) await run(env, "UPDATE PurchaseRequests SET status = 'Ordered', updatedAt = ? WHERE id = ?", nowIso(), d.prId);
  await logActivity(env, identity.email, `Purchase order ${id} issued.`, 'g');
  return { success: true, id };
}

export async function cancelPurchaseOrder(env, identity, id, reason) {
  requireRole(identity, ['superadmin', 'admin'], 'cancelling a purchase order');
  await run(env, "UPDATE PurchaseOrders SET status = 'Cancelled', notes = ?, updatedAt = ? WHERE id = ?", reason || '', nowIso(), id);
  await logActivity(env, identity.email, `Purchase order ${id} cancelled.`, 'a');
  return { success: true };
}

// ─── RECEIVING ─────────────────────────────────────────────────

export async function receiveGoods(env, identity, data) {
  const d = data || {};
  const id = await nextSequentialId(env, 'Receipts', 'RCT');
  const lines = d.lines || [];
  let gross = 0;
  for (const l of lines) gross += num(l.amount) || num(l.qty) * num(l.rate);

  const po = d.poId ? await first(env, 'SELECT * FROM PurchaseOrders WHERE id = ?', d.poId) : null;
  const vatRatio = po && num(po.grossAmount) > 0 ? num(po.vatAmount) / num(po.grossAmount) : 0;
  const vat = gross * vatRatio;

  await run(
    env,
    `INSERT INTO Receipts (id, poId, prId, projectId, sowId, supplierId, receiptDate, deliveryRef,
       grossAmount, netAmount, vatAmount, linesJSON, notes, status, receivedBy, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Received', ?, ?, ?)`,
    id, d.poId || '', po ? po.prId : (d.prId || ''), d.projectId || (po ? po.projectId : ''),
    d.sowId || (po ? po.sowId : ''), d.supplierId || (po ? po.supplierId : ''),
    dayOf(d.receiptDate) || dayOf(nowIso()), d.deliveryRef || '', gross, gross - vat, vat,
    JSON.stringify(lines), d.notes || '', low(identity.email), nowIso(), nowIso()
  );

  for (const l of lines) {
    if (l.poLineId) await run(env, 'UPDATE POLines SET qtyReceived = qtyReceived + ? WHERE id = ?', num(l.qty), l.poLineId);
    if (l.prLineId) await run(env, 'UPDATE PRLines SET qtyReceived = qtyReceived + ? WHERE id = ?', num(l.qty), l.prLineId);
  }
  if (d.poId) await run(env, "UPDATE PurchaseOrders SET status = 'Received', updatedAt = ? WHERE id = ?", nowIso(), d.poId);
  await logActivity(env, identity.email, `Goods receipt ${id} recorded.`, 'g');
  return { success: true, id };
}

export async function cancelReceipt(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'cancelling a receipt');
  const r = await first(env, 'SELECT * FROM Receipts WHERE id = ?', id);
  if (!r) throw new Error('That receipt no longer exists.');
  // Put the received quantities back, otherwise the PO looks fulfilled.
  for (const l of safeParseArray(r.linesJSON)) {
    if (l.poLineId) await run(env, 'UPDATE POLines SET qtyReceived = qtyReceived - ? WHERE id = ?', num(l.qty), l.poLineId);
    if (l.prLineId) await run(env, 'UPDATE PRLines SET qtyReceived = qtyReceived - ? WHERE id = ?', num(l.qty), l.prLineId);
  }
  await run(env, "UPDATE Receipts SET status = 'Cancelled', updatedAt = ? WHERE id = ?", nowIso(), id);
  await logActivity(env, identity.email, `Receipt ${id} cancelled.`, 'a');
  return { success: true };
}

// ─── SUPPLIER INVOICES / PAYABLES ──────────────────────────────

export async function recordSupplierInvoice(env, identity, data) {
  const d = data || {};
  const id = await nextSequentialId(env, 'SupplierInvoices', 'SI');

  let dueDate = dayOf(d.dueDate);
  if (!dueDate && d.supplierId) {
    const s = await first(env, 'SELECT termsDays FROM Suppliers WHERE id = ?', d.supplierId);
    const days = num(s && s.termsDays);
    const base = dayOf(d.deliveryDate) || dayOf(nowIso());
    const dt = new Date(base);
    dt.setDate(dt.getDate() + days);
    dueDate = dt.toISOString().slice(0, 10);
  }

  const gross = num(d.grossAmount);
  const vat = num(d.vatAmount);
  await run(
    env,
    `INSERT INTO SupplierInvoices (id, poId, prId, projectId, sowId, supplierId, invoiceNo,
       invoiceDate, deliveryDate, dueDate, grossAmount, netAmount, vatAmount, paidAmount,
       receiptIdsJSON, paymentsJSON, notes, status, paidDate, recordedBy, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '[]', ?, 'Unpaid', '', ?, ?, ?)`,
    id, d.poId || '', d.prId || '', d.projectId || '', d.sowId || '', d.supplierId || '',
    d.invoiceNo || '', dayOf(d.invoiceDate), dayOf(d.deliveryDate), dueDate,
    gross, gross - vat, vat, JSON.stringify(d.receiptIds || []), d.notes || '',
    low(identity.email), nowIso(), nowIso()
  );
  await logActivity(env, identity.email, `Supplier invoice ${id} recorded.`, 'blue');
  return { success: true, id };
}

export async function paySupplierInvoice(env, identity, id, payment) {
  requireRole(identity, ['superadmin', 'admin'], 'paying a supplier invoice');
  const inv = await first(env, 'SELECT * FROM SupplierInvoices WHERE id = ?', id);
  if (!inv) throw new Error('That invoice no longer exists.');

  const p = payment || {};
  const amount = num(p.amount);
  if (amount <= 0) throw new Error('A payment needs an amount.');

  const payments = safeParseArray(inv.paymentsJSON);
  payments.push({
    amount, method: p.method || '', reference: p.reference || '',
    date: dayOf(p.date) || dayOf(nowIso()), by: low(identity.email),
  });
  const paid = num(inv.paidAmount) + amount;
  const fullyPaid = paid >= num(inv.grossAmount) - 0.005;

  await run(
    env,
    'UPDATE SupplierInvoices SET paidAmount = ?, paymentsJSON = ?, status = ?, paidDate = ?, updatedAt = ? WHERE id = ?',
    paid, JSON.stringify(payments), fullyPaid ? 'Paid' : 'Partially Paid',
    fullyPaid ? dayOf(nowIso()) : '', nowIso(), id
  );
  await logActivity(env, identity.email, `Payment recorded against invoice ${id}.`, 'g');
  return { success: true, paid, fullyPaid };
}

export async function cancelSupplierInvoice(env, identity, id, reason) {
  requireRole(identity, ['superadmin', 'admin'], 'cancelling a supplier invoice');
  await run(env, "UPDATE SupplierInvoices SET status = 'Cancelled', notes = ?, updatedAt = ? WHERE id = ?", reason || '', nowIso(), id);
  await logActivity(env, identity.email, `Supplier invoice ${id} cancelled.`, 'a');
  return { success: true };
}
