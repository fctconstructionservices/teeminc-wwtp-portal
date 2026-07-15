/**
 * 10-FinanceService.gs — Cash advance, release, incoming cash, liquidation
 *
 * PURPOSE: All money flows and the Finance dashboard.
 *
 * STATUS FLOWS (preserved exactly):
 *   Cash Advance : Pending -> Approved -> auto-copied to CashRelease (Pending)
 *   Cash Release : Pending -> For Review -> Reviewed (all admins except releaser)
 *   Incoming Cash: Pending -> Approved/Rejected
 *   Liquidation  : Pending -> Approved/Rejected
 *
 * getFinanceData() builds the KPI cards, 6-month cashflow, budget vs
 * actual, breakdown, aging buckets and per-project cost status.
 */

// ============================================================
//  FINANCIAL HELPERS
// ============================================================

function getTotalIncomingCashForProject(projectId) {
  const allIncoming = readAll_('IncomingCashRequests');
  return allIncoming
    .filter(function (c) { return c.projectId === projectId && c.status === 'Approved'; })
    .reduce(function (sum, c) { return sum + (parseFloat(c.amount) || 0); }, 0);
}

function getTotalReleasedCashForProject(projectId) {
  const allReleased = readAll_('CashRelease');
  return allReleased
    .filter(function (r) { return r.projectId === projectId && r.status === 'Reviewed'; })
    .reduce(function (sum, r) { return sum + (parseFloat(r.amount) || 0); }, 0);
}

// ============================================================
//  CASH ADVANCE
// ============================================================

function submitCashAdvance(payload) {
  const uploaded = uploadAttachmentIfAny_(payload);
  const fileUrl = uploaded.fileUrl;
  const fileName = uploaded.fileName;

  const id = nextId_('CA');
  var projectName = '';
  if (payload.project) {
    var projects = readAll_('Projects');
    var proj = projects.find(function(p) { return p.id === payload.project || p.name === payload.project; });
    projectName = proj ? ' for ' + proj.name : ' for ' + payload.project;
  }

  appendRow_('CashAdvanceRequests', {
    id: id,
    type: 'Cash Advance',
    projectId: payload.project || '',
    requestor: currentUserName_(),
    requestorEmail: currentUserEmail_(),
    amount: payload.amount,
    description: payload.description || '',
    scope: payload.scopeOfWork || '',
    attachmentsJSON: JSON.stringify(fileUrl ? [{ url: fileUrl, name: fileName }] : []),
    payloadJSON: JSON.stringify({
      requestType: payload.requestType || '',
      dateNeeded: payload.dateNeeded || ''
    }),
    status: 'Pending',
    createdAt: new Date(),
    dateNeeded: payload.dateNeeded || "",
    sowId: payload.sowId || ''   // v3: links this CA to a SOW item so its release feeds the SOW "actual"
  });

  logActivity_('Cash advance ₱' + payload.amount + ' requested by ' + currentUserName_() + projectName, 'blue', id);
  return { success: true, requestId: id, fileUrl: fileUrl, fileName: fileName };
}

function approveCashAdvance(id) {
  const ca = readAll_('CashAdvanceRequests').find(function (r) { return r.id === id; });
  if (!ca) throw new Error('Cash advance request not found.');
  if (ca.status !== 'Pending') throw new Error('Request is not pending.');

  updateRow_('CashAdvanceRequests', 'id', id, { status: 'Approved' });

  const releaseId = nextId_('REL');
  appendRow_('CashRelease', {
    id: releaseId,
    originalRequestId: id,
    projectId: ca.projectId || '',
    requestor: ca.requestor,
    requestorEmail: ca.requestorEmail,
    amount: ca.amount,
    description: ca.description,
    scope: ca.scope,
    status: 'Pending',
    createdAt: new Date(),
    releasedBy: '',
    releasedAt: '',
    reviewedByJSON: '[]',
    sowId: ca.sowId || ''   // v3: inherited so Reviewed releases roll up into the SOW actual
  });

  logActivity_('Cash advance ' + id + ' approved and copied to CashRelease as ' + releaseId + ' (Pending)', 'g', id);
  return { success: true, releaseId: releaseId };
}

// ============================================================
//  CASH RELEASE
// ============================================================

function getPendingCashReleases() {
  return readAll_('CashRelease').filter(function (r) { return r.status === 'Pending'; });
}

function submitRelease(payload) {
  const releaseId = payload.releaseId;
  const releaseAmount = parseFloat(payload.amount) || 0;

  const allReleases = readAll_('CashRelease');
  const release = allReleases.find(function (r) { return r.id === releaseId && r.status === 'Pending'; });
  if (!release) throw new Error('Pending release record not found.');

  const approvedAmount = parseFloat(release.amount) || 0;
  if (releaseAmount > approvedAmount) {
    throw new Error('Release amount (₱' + releaseAmount.toFixed(2) + ') exceeds approved amount (₱' + approvedAmount.toFixed(2) + ').');
  }

  updateRow_('CashRelease', 'id', releaseId, {
    status: 'For Review',
    releasedBy: currentUserEmail_(),
    releasedAt: new Date(),
    amount: releaseAmount
  });

  const caId = release.originalRequestId;
  if (caId) {
    updateRow_('CashAdvanceRequests', 'id', caId, { status: 'Released' });
  }

  logActivity_('Release of ₱' + releaseAmount + ' for ' + releaseId + ' submitted by ' + currentUserName_() + ' (For Review)', 'blue', releaseId);
  return { success: true, releaseId: releaseId };
}

function reviewRelease(releaseId, reviewerEmail) {
  const release = readAll_('CashRelease').find(function (r) { return r.id === releaseId && r.status === 'For Review'; });
  if (!release) throw new Error('Release record not found or not in For Review status.');

  if (release.releasedBy && release.releasedBy.toLowerCase() === reviewerEmail.toLowerCase()) {
    throw new Error('Self-review is not allowed.');
  }

  let reviewedBy = [];
  try {
    reviewedBy = JSON.parse(release.reviewedByJSON || '[]');
  } catch (e) { reviewedBy = []; }

  if (reviewedBy.indexOf(reviewerEmail.toLowerCase()) === -1) {
    reviewedBy.push(reviewerEmail.toLowerCase());
  }

  updateRow_('CashRelease', 'id', releaseId, { reviewedByJSON: JSON.stringify(reviewedBy) });

  const admins = getAllAdminsExceptSuperAdmin_();
  const requiredReviewers = admins.filter(function (admin) {
    return admin !== release.releasedBy.toLowerCase();
  });

  const allReviewed = requiredReviewers.every(function (admin) {
    return reviewedBy.indexOf(admin) !== -1;
  });

  if (allReviewed) {
    updateRow_('CashRelease', 'id', releaseId, { status: 'Reviewed' });
    logActivity_('Release ' + releaseId + ' fully reviewed and released', 'g', releaseId);
    return { success: true, status: 'Reviewed' };
  } else {
    logActivity_('Release ' + releaseId + ' reviewed by ' + reviewerEmail, 'blue', releaseId);
    return { success: true, status: 'For Review' };
  }
}

// ============================================================
//  INCOMING CASH
// ============================================================

function submitIncomingCash(payload) {
  const uploaded = uploadAttachmentIfAny_(payload);
  const fileUrl = uploaded.fileUrl;
  const fileName = uploaded.fileName;

  const id = nextId_('IC');
  var projectName = '';
  if (payload.project) {
    var projects = readAll_('Projects');
    var proj = projects.find(function(p) { return p.id === payload.project || p.name === payload.project; });
    projectName = proj ? ' for ' + proj.name : ' for ' + payload.project;
  }

  appendRow_('IncomingCashRequests', {
    id: id,
    type: payload.type || 'Cash Injection',
    projectId: payload.project || '',
    requestor: currentUserName_(),
    requestorEmail: currentUserEmail_(),
    amount: payload.amount,
    description: payload.description || '',
    paymentMethod: payload.method || '',
    reference: payload.reference || '',
    transactionDate: payload.date || '',
    attachmentsJSON: JSON.stringify(fileUrl ? [{ url: fileUrl, name: fileName }] : []),
    status: 'Pending',
    createdAt: new Date()
  });

  logActivity_('Incoming cash ₱' + payload.amount + ' recorded by ' + currentUserName_() + projectName + ' (pending approval)', 'blue', id);
  return { success: true, requestId: id, fileUrl: fileUrl, fileName: fileName };
}

function approveIncomingCash(id) {
  const req = readAll_('IncomingCashRequests').find(function (r) { return r.id === id; });
  if (!req) throw new Error('Request not found.');
  if (req.status !== 'Pending') throw new Error('Request is not pending.');

  updateRow_('IncomingCashRequests', 'id', id, { status: 'Approved' });
  logActivity_('Incoming cash ₱' + req.amount + ' approved', 'g', id);
  return { success: true };
}

// ============================================================
//  LIQUIDATION
// ============================================================

function submitLiquidation(payload) {
  const id = nextId_('LIQ');
  const uploaded = uploadAttachmentIfAny_(payload);
  const fileUrl = uploaded.fileUrl;
  const fileName = uploaded.fileName;

  appendRow_('Liquidations', {
    id: id,
    cashAdvanceId: payload.requestId || '',
    projectId: payload.projectId || '',
    requestor: currentUserName_(),
    requestorEmail: currentUserEmail_(),
    amount: payload.amount,
    description: payload.description || '',
    receiptNo: payload.receiptNo || '',
    attachmentsJSON: JSON.stringify(fileUrl ? [{ url: fileUrl, name: fileName }] : []),
    status: 'Pending',
    createdAt: new Date(),
    reviewedBy: ''
  });

  logActivity_('Liquidation ' + id + ' submitted (₱' + payload.amount + ' by ' + currentUserName_() + ')', 'blue', id);
  return { success: true, id: id };
}

function approveLiquidation(id) {
  const liq = readAll_('Liquidations').find(function (l) { return l.id === id; });
  if (!liq) throw new Error('Liquidation record not found.');
  if (liq.status !== 'Pending') throw new Error('Liquidation is not pending.');

  updateRow_('Liquidations', 'id', id, {
    status: 'Approved',
    reviewedBy: currentUserEmail_()
  });
  logActivity_('Liquidation ' + id + ' approved', 'g', id);
  return { success: true };
}

function rejectLiquidation(id) {
  const liq = readAll_('Liquidations').find(function (l) { return l.id === id; });
  if (!liq) throw new Error('Liquidation record not found.');
  if (liq.status !== 'Pending') throw new Error('Liquidation is not pending.');

  updateRow_('Liquidations', 'id', id, {
    status: 'Rejected',
    reviewedBy: currentUserEmail_()
  });
  logActivity_('Liquidation ' + id + ' rejected', 'a', id);
  return { success: true };
}

// ============================================================
//  FINANCE
// ============================================================

function getFinanceData() {
  const projects = readAll_('Projects');
  const allIncoming = readAll_('IncomingCashRequests');
  const allReleases = readAll_('CashRelease');
  const sowItems = readAll_('SOWItems');
  const now = new Date();

  let totalRevenue = 0;
  let totalExpenses = 0;
  projects.forEach(function (p) {
    totalRevenue += getTotalIncomingCashForProject(p.id);
    totalExpenses += getTotalReleasedCashForProject(p.id);
  });
  const cashPosition = totalRevenue - totalExpenses;

  const pendingCA = readAll_('CashAdvanceRequests').filter(function (r) { return r.status === 'Pending'; });
  const pendingAmount = pendingCA.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);

  const kpis = [
    { label: 'Total Revenue', value: '₱' + totalRevenue.toFixed(2), sub: 'All projects', cls: 'good' },
    { label: 'Total Expenses', value: '₱' + totalExpenses.toFixed(2), sub: 'All projects', cls: '' },
    { label: 'Cash Position', value: '₱' + cashPosition.toFixed(2), sub: 'Revenue - Expenses', cls: 'good' },
    { label: 'Pending Requests', value: String(pendingCA.length), sub: '₱' + pendingAmount.toFixed(2) + ' total', cls: 'warn' }
  ];

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM'), year: d.getFullYear(), month: d.getMonth() });
  }
  const inflow = months.map(function (m) {
    return allIncoming.filter(function (c) {
      const cd = new Date(c.transactionDate || c.createdAt);
      return cd.getFullYear() === m.year && cd.getMonth() === m.month && c.status === 'Approved';
    }).reduce(function (s, c) { return s + Number(c.amount || 0); }, 0);
  });
  const outflow = months.map(function (m) {
    return allReleases.filter(function (r) {
      const rd = new Date(r.releasedAt || r.createdAt);
      return rd.getFullYear() === m.year && rd.getMonth() === m.month && r.status === 'Reviewed';
    }).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  });
  const cashflow = { labels: months.map(function (m) { return m.label; }), inflow: inflow, outflow: outflow, projectedFrom: months.length };

  const budgetVsActual = {
    labels: projects.map(function (p) { return p.name; }),
    budget: projects.map(function (p) {
      const items = sowItems.filter(function (s) { return s.projectId === p.id; });
      return items.reduce(function (s, i) { return s + Number(i.budget || 0); }, 0);
    }),
    actual: projects.map(function (p) {
      const items = sowItems.filter(function (s) { return s.projectId === p.id; });
      return items.reduce(function (s, i) { return s + Number(i.actual || 0); }, 0);
    })
  };

  const typeGroups = {};
  allIncoming.filter(function (c) { return c.status === 'Approved'; }).forEach(function (c) {
    typeGroups['Incoming'] = (typeGroups['Incoming'] || 0) + Number(c.amount || 0);
  });
  allReleases.filter(function (r) { return r.status === 'Reviewed'; }).forEach(function (r) {
    typeGroups['Release'] = (typeGroups['Release'] || 0) + Number(r.amount || 0);
  });
  const breakdownKeys = Object.keys(typeGroups);
  const breakdownTotal = Object.values(typeGroups).reduce(function (s, v) { return s + v; }, 0) || 1;
  const breakdown = {
    labels: breakdownKeys.length ? breakdownKeys : ['No data'],
    values: breakdownKeys.length ? breakdownKeys.map(function (k) { return Math.round((typeGroups[k] / breakdownTotal) * 100); }) : [100]
  };

  const pendingCAForAging = readAll_('CashAdvanceRequests').filter(function (r) { return r.status === 'Pending'; });
  const buckets = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 };
  pendingCAForAging.forEach(function (r) {
    const days = Math.floor((now - new Date(r.createdAt)) / (1000 * 60 * 60 * 24));
    const amt = Number(r.amount || 0);
    if (days <= 30) buckets['0-30 days'] += amt;
    else if (days <= 60) buckets['31-60 days'] += amt;
    else if (days <= 90) buckets['61-90 days'] += amt;
    else buckets['90+ days'] += amt;
  });
  const aging = { labels: Object.keys(buckets), values: Object.values(buckets) };

  const costStatus = projects.map(function (p) {
    const items = sowItems.filter(function (s) { return s.projectId === p.id; });
    const budget = items.reduce(function (s, i) { return s + Number(i.budget || 0); }, 0);
    const actual = items.reduce(function (s, i) { return s + Number(i.actual || 0); }, 0);
    const pct = budget > 0 ? (actual / budget) * 100 : 0;
    const status = pct >= 100 ? 'Over Budget' : pct >= 85 ? 'At Risk' : 'On Track';
    const cls = pct >= 100 ? 'danger' : pct >= 85 ? 'warn' : 'good';
    return { project: p.name, budget: budget, actual: actual, status: status, cls: cls };
  });

  return { kpis: kpis, cashflow: cashflow, budgetVsActual: budgetVsActual, breakdown: breakdown, aging: aging, costStatus: costStatus };
}
