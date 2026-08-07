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

  return results;
}
