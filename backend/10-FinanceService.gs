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
  requireLogin_();   // v7.0
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
  // v11 BATCH A: a Super Admin's own request needs nobody's signature.
  var autoApproved = autoApproveIfSuper_(id, 'CashAdvance');
  return { success: true, requestId: id, fileUrl: fileUrl, fileName: fileName, autoApproved: autoApproved };
}

function approveCashAdvance(id) {
  requireApprover_('approving a cash advance');   // v7.0
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
  requireAdmin_('releasing cash');   // v7.0
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
  // ══ v7.0 SECURITY ══ The reviewer used to be whatever email the
  // browser sent, so anyone could review cash releases as somebody else.
  // Identity now comes from the session; the parameter is ignored and
  // kept only so older clients don't break on the call signature.
  requireAdmin_('reviewing a cash release');
  reviewerEmail = currentUserEmail_();

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
  requireLogin_();   // v7.0
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
    createdAt: new Date(),
    // v10: manually recorded incoming cash is FUNDING (owner capital,
    // partner injection, loan). Client collections are only ever created
    // by marking a billing paid, which tags them 'Client Collection'.
    // This is what keeps portfolio "Collected" honest.
    sourceType: 'Funding'
  });

  logActivity_('Incoming cash (funding) ₱' + payload.amount + ' recorded by ' + currentUserName_() + projectName + ' (pending approval)', 'blue', id);
  // v11 BATCH A: Super Admin bypass.
  var autoApproved = autoApproveIfSuper_(id, 'IncomingCash');
  return { success: true, requestId: id, fileUrl: fileUrl, fileName: fileName, autoApproved: autoApproved };
}

function approveIncomingCash(id) {
  requireApprover_('approving incoming cash');   // v7.0
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
  requireLogin_();   // v7.0
  const id = nextId_('LIQ');
  const uploaded = uploadAttachmentIfAny_(payload);
  const fileUrl = uploaded.fileUrl;
  const fileName = uploaded.fileName;

  // v4: derive the projectId from the linked cash advance so liquidations
  // always carry the right project even if the form didn't send it.
  var srcCa = readAll_('CashAdvanceRequests').find(function (r) { return r.id === payload.requestId; });
  var derivedProject = payload.projectId || (srcCa ? srcCa.projectId : '');

  appendRow_('Liquidations', {
    id: id,
    cashAdvanceId: payload.requestId || '',
    projectId: derivedProject,
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
  // v11 BATCH A: Super Admin bypass. Goes through the engine so the
  // over-liquidation reimbursement logic in approveLiquidation() runs.
  var autoApproved = autoApproveIfSuper_(id, 'Liquidation');
  return { success: true, id: id, autoApproved: autoApproved };
}

function approveLiquidation(id) {
  requireApprover_('approving a liquidation');   // v7.0
  const liq = readAll_('Liquidations').find(function (l) { return l.id === id; });
  if (!liq) throw new Error('Liquidation record not found.');
  if (liq.status !== 'Pending') throw new Error('Liquidation is not pending.');

  updateRow_('Liquidations', 'id', id, {
    status: 'Approved',
    reviewedBy: currentUserEmail_()
  });
  logActivity_('Liquidation ' + id + ' approved', 'g', id);

  // ── v4 item 6: auto-reimbursement when liquidation exceeds the advance ──
  // If the approved liquidations for this cash advance now total MORE than
  // the amount originally requested, the company owes the requestor the
  // excess. Create a Reimbursement-type cash advance for exactly that
  // excess (same project + SOW), attach this liquidation's receipt, set
  // date-needed to +3 days, and auto-submit it for admin approval.
  try {
    var caId = liq.cashAdvanceId;
    if (caId) {
      var ca = readAll_('CashAdvanceRequests').find(function (r) { return r.id === caId; });
      if (ca) {
        var requested = parseFloat(ca.amount) || 0;
        var approvedLiqs = readAll_('Liquidations').filter(function (l) {
          return l.cashAdvanceId === caId && l.status === 'Approved';
        });
        var newTotal = approvedLiqs.reduce(function (s, l) { return s + (parseFloat(l.amount) || 0); }, 0);
        var prevTotal = newTotal - (parseFloat(liq.amount) || 0);
        // excess introduced by THIS liquidation (never reimburse the same peso twice)
        var excess = newTotal - Math.max(requested, prevTotal);
        if (excess > 0.009) {
          createReimbursementCA_(ca, liq, excess);
        }
      }
    }
  } catch (e) {
    logActivity_('Reimbursement auto-create skipped for ' + id + ': ' + e.message, 'a', id);
  }

  return { success: true };
}

/**
 * createReimbursementCA_ (v4) - Auto-generates a Reimbursement-type cash
 * advance for the amount a liquidation exceeded its advance. Same project
 * and SOW as the source advance; attachment copied from the liquidation
 * that caused the overage; date-needed = +3 days; auto-submitted (Pending)
 * for admin approval.
 */
function createReimbursementCA_(sourceCa, liq, excess) {
  var tz = Session.getScriptTimeZone();
  var dateNeeded = Utilities.formatDate(new Date(Date.now() + 3 * 86400000), tz, 'yyyy-MM-dd');
  var id = nextId_('CA');
  appendRow_('CashAdvanceRequests', {
    id: id,
    type: 'Cash Advance',
    projectId: sourceCa.projectId || '',
    requestor: sourceCa.requestor || currentUserName_(),
    requestorEmail: sourceCa.requestorEmail || currentUserEmail_(),
    amount: Math.round(excess * 100) / 100,
    description: 'Auto-reimbursement: liquidation ' + liq.id + ' exceeded advance ' + sourceCa.id + ' by ₱' + excess.toFixed(2) + '.',
    scope: sourceCa.scope || '',
    attachmentsJSON: liq.attachmentsJSON || '[]',
    payloadJSON: JSON.stringify({ requestType: 'Reimbursement', dateNeeded: dateNeeded, sourceLiquidationId: liq.id, sourceAdvanceId: sourceCa.id }),
    status: 'Pending',
    createdAt: new Date(),
    dateNeeded: dateNeeded,
    sowId: sourceCa.sowId || ''
  });
  logActivity_('Auto-reimbursement ' + id + ' (₱' + excess.toFixed(2) + ') created from liquidation ' + liq.id + ' — submitted for approval', 'blue', id);
  return id;
}

/**
 * liquidationTotalForCA_ (v4) - Sum of APPROVED liquidations against a
 * cash advance. Used to decide when an advance is fully liquidated.
 */
function liquidationTotalForCA_(caId, allLiquidations) {
  var liqs = allLiquidations || readAll_('Liquidations');
  return liqs
    .filter(function (l) { return l.cashAdvanceId === caId && l.status === 'Approved'; })
    .reduce(function (s, l) { return s + (parseFloat(l.amount) || 0); }, 0);
}

/**
 * getReleasesToLiquidate (v4 item 4 + 5) - Reviewed cash releases whose
 * cash advance is NOT yet fully liquidated. This is what the Liquidate
 * Cash Advance screen lists automatically; an entry disappears once its
 * approved liquidations total >= the amount requested.
 */
function getReleasesToLiquidate() {
  // v5 (item 11): kanya-kanyang liquidation — a user only sees THEIR OWN
  // advances awaiting liquidation, since they are the one accountable.
  var me = currentUserEmail_().toLowerCase();
  var releases = readAll_('CashRelease').filter(function (r) { return r.status === 'Reviewed'; });
  var cas = readAll_('CashAdvanceRequests');
  var liqs = readAll_('Liquidations');
  var out = [];
  releases.forEach(function (r) {
    var caId = r.originalRequestId;
    if (!caId) return;
    var ca = cas.find(function (x) { return x.id === caId; });
    if (!ca) return;
    if (String(ca.requestorEmail || '').toLowerCase() !== me) return;
    var requested = parseFloat(ca.amount) || 0;
    var liquidated = liquidationTotalForCA_(caId, liqs);
    if (liquidated >= requested) return; // item 5: fully liquidated -> drop
    out.push({
      cashAdvanceId: caId,
      releaseId: r.id,
      projectId: r.projectId || ca.projectId || '',
      requestor: r.requestor || ca.requestor || '',
      requested: requested,
      liquidated: liquidated,
      remaining: requested - liquidated,
      sowId: ca.sowId || '',
      releasedAt: r.releasedAt || r.createdAt || ''
    });
  });
  return out;
}

function rejectLiquidation(id) {
  requireApprover_('rejecting a liquidation');   // v7.0
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
  // v6.5 PERF: one batched pass for the finance dashboard
  readMany_(['Projects', 'IncomingCashRequests', 'CashRelease', 'SOWItems',
    'CashAdvanceRequests', 'Liquidations']);   // SOWItems: v6.6 forecast

  // v11 BATCH F2: a quotation would otherwise sit in the cashflow
  // forecast at zero and drag every projection down.
  const projects = readAll_('Projects').filter(isLiveProject_);
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
    { label: 'Total Revenue', value: '₱' + fmtMoney_(totalRevenue), sub: 'All projects', cls: 'good' },
    { label: 'Total Expenses', value: '₱' + fmtMoney_(totalExpenses), sub: 'All projects', cls: '' },
    { label: 'Cash Position', value: '₱' + fmtMoney_(cashPosition), sub: 'Revenue - Expenses', cls: 'good' },
    { label: 'Pending Requests', value: String(pendingCA.length), sub: '₱' + fmtMoney_(pendingAmount) + ' total', cls: 'warn' }
  ];

  // ══ v6.6 CASHFLOW v2 ══
  // Window = actual project span (earliest start → latest end, ≤ 24
  // months, always including today) instead of a fixed 6 months, plus a
  // Gantt-driven forecast: each non-milestone SOW's remaining spend
  // (budget − reviewed releases) spread per-day across its remaining
  // schedule, aggregated over ALL projects. A weekly series (16 weeks
  // around today, clamped to the span) is returned alongside monthly.
  const sowAll = readAll_('SOWItems');
  const caByIdCf = {};
  readAll_('CashAdvanceRequests').forEach(function (c) { caByIdCf[c.id] = c; });
  const sowActual = {};
  allReleases.forEach(function (r) {
    if (r.status !== 'Reviewed') return;
    const ca = caByIdCf[r.originalRequestId];
    if (!ca) return;
    const pl = safeParse_(ca.payloadJSON, {});
    if (!pl.sowId) return;
    sowActual[pl.sowId] = (sowActual[pl.sowId] || 0) + Number(r.amount || 0);
  });

  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const spanDs = [today0];
  projects.forEach(function (p) {
    [p.startDate, p.endDate].forEach(function (x) {
      const d = new Date(fmtDate_(x)); if (!isNaN(d)) spanDs.push(d);
    });
  });
  sowAll.forEach(function (s) {
    [s.startDate, s.endDate].forEach(function (x) {
      const d = new Date(x); if (!isNaN(d)) spanDs.push(d);
    });
  });
  let cfStart = new Date(Math.min.apply(null, spanDs.map(function (d) { return d.getTime(); })));
  let cfEnd = new Date(Math.max.apply(null, spanDs.map(function (d) { return d.getTime(); })));
  cfStart = new Date(cfStart.getFullYear(), cfStart.getMonth(), 1);
  cfEnd = new Date(cfEnd.getFullYear(), cfEnd.getMonth(), 1);
  const months = [];
  for (let d = new Date(cfStart); d <= cfEnd && months.length < 24; d.setMonth(d.getMonth() + 1)) {
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  const MNs = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nowKeyCf = today0.getFullYear() * 12 + today0.getMonth();

  const inflow = months.map(function (m) {
    return allIncoming.filter(function (c) {
      const cd = new Date(fmtDate_(c.transactionDate || c.createdAt));
      return cd.getFullYear() === m.year && cd.getMonth() === m.month && c.status === 'Approved';
    }).reduce(function (s, c) { return s + Number(c.amount || 0); }, 0);
  });
  const outflow = months.map(function (m) {
    return allReleases.filter(function (r) {
      const rd = new Date(fmtDate_(r.releasedAt || r.createdAt));
      return rd.getFullYear() === m.year && rd.getMonth() === m.month && r.status === 'Reviewed';
    }).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  });

  // Gantt forecast helper: allocate remaining spend of every SOW into an
  // arbitrary list of [bucketStart, bucketEnd] date pairs.
  const allocProjected_ = function (buckets) {
    const out = buckets.map(function () { return 0; });
    sowAll.forEach(function (s) {
      if (String(s.isMilestone) === 'true') return;
      const remaining = Math.max((parseFloat(s.budget) || 0) - (sowActual[s.id] || 0), 0);
      if (remaining <= 0) return;
      const sEnd = new Date(s.endDate);
      if (isNaN(sEnd)) return;
      let from = new Date(Math.max(today0.getTime(), new Date(s.startDate).getTime() || today0.getTime()));
      if (sEnd < today0) {
        // overdue: lands in whichever bucket holds today
        for (var i = 0; i < buckets.length; i++) {
          if (today0 >= buckets[i][0] && today0 <= buckets[i][1]) { out[i] += remaining; break; }
        }
        return;
      }
      const days = Math.max(Math.round((sEnd - from) / 86400000) + 1, 1);
      const perDay = remaining / days;
      buckets.forEach(function (b, i) {
        const a = Math.max(from.getTime(), b[0].getTime());
        const z = Math.min(sEnd.getTime(), b[1].getTime());
        if (z < a) return;
        out[i] += perDay * (Math.round((z - a) / 86400000) + 1);
      });
    });
    return out;
  };

  const monthBuckets = months.map(function (m) {
    return [new Date(m.year, m.month, 1), new Date(m.year, m.month + 1, 0)];
  });
  const projRaw = allocProjected_(monthBuckets);

  // ── v11 BATCH G2: SUPPLIER CREDIT IS NOW IN THE FORECAST ──
  // This forecast has never known about money owed to suppliers — it
  // only ever saw cash already released, so a large payable was
  // invisible until the day it landed. Every unpaid invoice balance is
  // now a dated outflow in the month it falls due.
  //
  // These are COMMITTED, unlike the Gantt-derived projection, which is
  // an estimate of future spend. A payable is not a forecast: it is a
  // bill with a date on it.
  const payableByMonth = payableOutflowByMonth_();
  const payableOutflow = months.map(function (m) {
    return Math.round(payableByMonth[m.year + '-' + m.month] || 0);
  });

  const projectedOutflow = months.map(function (m, i) {
    return (m.year * 12 + m.month) >= nowKeyCf
      ? Math.round(projRaw[i] + (payableOutflow[i] || 0))
      : null;
  });

  // Weekly: 6 weeks back + 10 weeks forward from this week's Monday
  const monday = new Date(today0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weeks = [];
  for (let w = -6; w < 10; w++) {
    const ws = new Date(monday); ws.setDate(ws.getDate() + w * 7);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    weeks.push([ws, we]);
  }
  const wkLabels = weeks.map(function (b) { return MNs[b[0].getMonth()] + ' ' + b[0].getDate(); });
  const wkInflow = weeks.map(function (b) {
    return allIncoming.filter(function (c) {
      const cd = new Date(fmtDate_(c.transactionDate || c.createdAt));
      return c.status === 'Approved' && cd >= b[0] && cd <= b[1];
    }).reduce(function (s, c) { return s + Number(c.amount || 0); }, 0);
  });
  const wkOutflow = weeks.map(function (b) {
    return allReleases.filter(function (r) {
      const rd = new Date(fmtDate_(r.releasedAt || r.createdAt));
      return r.status === 'Reviewed' && rd >= b[0] && rd <= b[1];
    }).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  });
  const wkProjRaw = allocProjected_(weeks);
  const wkProjected = weeks.map(function (b, i) {
    return b[1] >= today0 ? Math.round(wkProjRaw[i]) : null;
  });

  // opening balance for each window (all movement before its first bucket)
  const openBefore_ = function (cutoff) {
    const oi = allIncoming.filter(function (c) {
      return c.status === 'Approved' && new Date(fmtDate_(c.transactionDate || c.createdAt)) < cutoff;
    }).reduce(function (s, c) { return s + Number(c.amount || 0); }, 0);
    const oo = allReleases.filter(function (r) {
      return r.status === 'Reviewed' && new Date(fmtDate_(r.releasedAt || r.createdAt)) < cutoff;
    }).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
    return oi - oo;
  };

  const cashflow = {
    labels: months.map(function (m) { return MNs[m.month] + ' ' + String(m.year).slice(2); }),
    inflow: inflow,
    outflow: outflow,
    projectedOutflow: projectedOutflow,
    // v11 BATCH G2: broken out so the chart can show what part of the
    // projection is a committed bill rather than an estimate.
    payableOutflow: payableOutflow,
    nowIndex: months.findIndex(function (m) { return m.year * 12 + m.month === nowKeyCf; }),
    openingBalance: openBefore_(new Date(months[0].year, months[0].month, 1)),
    weekly: {
      labels: wkLabels,
      inflow: wkInflow,
      outflow: wkOutflow,
      projectedOutflow: wkProjected,
      nowIndex: weeks.findIndex(function (b) { return today0 >= b[0] && today0 <= b[1]; }),
      openingBalance: openBefore_(weeks[0][0])
    }
  };

  const budgetVsActual = {
    labels: projects.map(function (p) { return p.name; }),
    budget: projects.map(function (p) {
      const items = sowItems.filter(function (s) { return s.projectId === p.id; });
      return items.reduce(function (s, i) { return s + Number(i.budget || 0); }, 0);
    }),
    actual: projects.map(function (p) {
      // v4 FIX: the SOWItems 'actual' column is stale (actual is computed
      // live in getProjectData, never written back). Use the real actual
      // cost = sum of Reviewed cash releases for the project.
      return getTotalReleasedCashForProject(p.id);
    })
  };

  // v6 (item 3): breakdown now groups every Reviewed release by the
  // TYPE OF REQUEST on its originating cash advance (same options as the
  // request form) — showing where the money actually goes company-wide.
  const typeGroups = {};
  const caByIdBd = {};
  readAll_('CashAdvanceRequests').forEach(function (c) { caByIdBd[c.id] = c; });
  allReleases.filter(function (r) { return r.status === 'Reviewed'; }).forEach(function (r) {
    var rtype = 'Other';
    var ca = caByIdBd[r.originalRequestId];
    if (ca) {
      var pl = safeParse_(ca.payloadJSON, {});
      rtype = pl.requestType || 'Other';
    }
    typeGroups[rtype] = (typeGroups[rtype] || 0) + Number(r.amount || 0);
  });
  const breakdownKeys = Object.keys(typeGroups);
  const breakdownTotal = Object.values(typeGroups).reduce(function (s, v) { return s + v; }, 0) || 1;
  const breakdown = {
    labels: breakdownKeys.length ? breakdownKeys : ['No data'],
    values: breakdownKeys.length ? breakdownKeys.map(function (k) { return Math.round((typeGroups[k] / breakdownTotal) * 100); }) : [100]
  };

  // ── v4 item 8: Cash Advance LIQUIDATION aging ──
  // Basis = released (Reviewed) advances that are not yet fully liquidated,
  // aged by how long since release — i.e. how long they've gone unliquidated.
  const toLiquidate = getReleasesToLiquidate();
  const buckets = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 };
  toLiquidate.forEach(function (r) {
    const base = r.releasedAt ? new Date(r.releasedAt) : now;
    const days = Math.floor((now - base) / (1000 * 60 * 60 * 24));
    const amt = Number(r.remaining || 0);
    if (days <= 30) buckets['0-30 days'] += amt;
    else if (days <= 60) buckets['31-60 days'] += amt;
    else if (days <= 90) buckets['61-90 days'] += amt;
    else buckets['90+ days'] += amt;
  });
  const aging = { labels: Object.keys(buckets), values: Object.values(buckets) };

  const costStatus = projects.map(function (p) {
    const items = sowItems.filter(function (s) { return s.projectId === p.id; });
    const budget = items.reduce(function (s, i) { return s + Number(i.budget || 0); }, 0);
    // v4 FIX: actual now comes from Reviewed cash releases, not the stale
    // SOWItems 'actual' column (which is only computed live in getProjectData).
    const actual = getTotalReleasedCashForProject(p.id);
    const pct = budget > 0 ? (actual / budget) * 100 : 0;
    const status = pct >= 100 ? 'Over Budget' : pct >= 85 ? 'At Risk' : 'On Track';
    const cls = pct >= 100 ? 'danger' : pct >= 85 ? 'warn' : 'good';
    return { project: p.name, budget: budget, actual: actual, status: status, cls: cls };
  });

  return { kpis: kpis, cashflow: cashflow, budgetVsActual: budgetVsActual, breakdown: breakdown, aging: aging, costStatus: costStatus };
}