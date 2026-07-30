/**
 * 11-ApprovalService.gs — Central approval workflow
 *
 * PURPOSE: The approvals inbox and the single decision engine.
 *
 * decideItem_() enforces, per request type: self-approval ban,
 * status guards, one-vote-per-approver (Approvals sheet), and the
 * "all admins/approvers except the requestor" consensus rule for
 * cash advances. forceApprove/forceReject are superadmin-only
 * overrides that reuse the same engine.
 *
 * SCALABILITY: To make a NEW request type approvable, add one
 * `if (type === '...')` block in decideItem_() and include it in
 * getPendingApprovals()/getMy*Requests().
 */

// ============================================================
//  APPROVALS
// ============================================================

function getPendingApprovals() {
  // v6.5 PERF: one batched pass — this runs on every page navigation
  // (approval badge), so it was the most frequent multi-read call.
  readMany_(['Users', 'Approvals', 'CashAdvanceRequests', 'CashRelease',
    'IncomingCashRequests', 'Liquidations', 'Materials', 'Equipment',
    'Manpower', 'DailyRecords', 'EstimateGroups', 'OTRequests']);

  const userEmail = currentUserEmail_().toLowerCase();
  const userRecord = readAll_('Users').find(function (u) { 
    return u.email.toLowerCase() === userEmail; 
  });
  const isAdmin = userRecord && (userRecord.role === 'admin' || userRecord.role === 'superadmin');
  const isSuper = userRecord && userRecord.role === 'superadmin';

  // v4 multi-sig: set of requestIds THIS user has already signed. An item
  // leaves an admin's queue once they've signed, but a super admin (who
  // only force-decides) keeps seeing everything so they can override.
  const myDecided = {};
  if (!isSuper) {
    readAll_('Approvals').forEach(function (a) {
      if (low_(a.approver) === userEmail) myDecided[a.requestId] = true;
    });
  }
  const notMine_ = function (list) {
    return isSuper ? list : list.filter(function (it) { return !myDecided[it.id]; });
  };

  // Cash Advances
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) {
    return r.status === 'Pending' && r.requestorEmail.toLowerCase() !== userEmail;
  }).map(function (r) {
    return { id: r.id, type: 'CashAdvance', projectId: r.projectId, requestor: r.requestor, requestorEmail: r.requestorEmail, amount: r.amount, description: r.description, status: r.status, createdAt: r.createdAt };
  });

  // Cash Releases (For Review) - Admin only
  let releases = [];
  if (isAdmin && userRecord.role !== 'superadmin') {
    releases = readAll_('CashRelease').filter(function (r) {
      return r.status === 'For Review' && r.releasedBy && r.releasedBy.toLowerCase() !== userEmail
        && (function () {
          // v4 per-admin visibility: hide releases this admin already reviewed.
          var rv = [];
          try { rv = JSON.parse(r.reviewedByJSON || '[]'); } catch (e) { rv = []; }
          return rv.indexOf(userEmail) === -1;
        })();
    }).map(function (r) {
      return { 
        id: r.id, 
        type: 'CashRelease', 
        projectId: r.projectId, 
        requestor: r.requestor, 
        requestorEmail: r.requestorEmail, 
        amount: r.amount, 
        description: r.description, 
        status: r.status, 
        createdAt: r.createdAt,
        releasedBy: r.releasedBy,
        reviewedByJSON: r.reviewedByJSON || '[]'
      };
    });
  }

  // Liquidations
  const liquidations = readAll_('Liquidations').filter(function (l) {
    return l.status === 'Pending' && l.requestorEmail.toLowerCase() !== userEmail;
  }).map(function (l) {
    return { id: l.id, type: 'Liquidation', projectId: l.projectId, requestor: l.requestor, requestorEmail: l.requestorEmail, amount: l.amount, description: l.description, status: l.status, createdAt: l.createdAt };
  });

  // v3: Incoming Cash requests now appear in the approvals inbox
  const incomingCash = readAll_('IncomingCashRequests').filter(function (r) {
    return r.status === 'Pending' && r.requestorEmail && r.requestorEmail.toLowerCase() !== userEmail;
  }).map(function (r) {
    return { id: r.id, type: 'IncomingCash', projectId: r.projectId, requestor: r.requestor, requestorEmail: r.requestorEmail, amount: r.amount, description: r.description, paymentMethod: r.paymentMethod, reference: r.reference, status: r.status, createdAt: r.createdAt };
  });

  // Materials, Equipment, DailyRecords, Estimates
  const materials = readAll_('Materials').filter(function (m) { 
    return low_(m.status) === 'pending' && m.requestedBy && m.requestedBy.toLowerCase() !== userEmail; 
  });
  const equipment = readAll_('Equipment').filter(function (e) { 
    return low_(e.status) === 'pending' && e.requestedBy && e.requestedBy.toLowerCase() !== userEmail; 
  });
  const dailyRecords = liveDailyRecords_().filter(function (d) { 
    return d.status === 'pending' && d.createdBy && d.createdBy.toLowerCase() !== userEmail; 
  });
  // v5 (item 13): exclude the submitter — same rule as every other type.
  const estimates = readAll_('EstimateGroups').filter(function (g) { 
    return g.status === 'pending' &&
      String(g.submittedBy || '').toLowerCase() !== userEmail; 
  });

  // v3: pending manpower role requests (same flow as materials)
  const manpower = readAll_('Manpower').filter(function (m) {
    return low_(m.status) === 'pending' && m.requestedBy && m.requestedBy.toLowerCase() !== userEmail;
  });

  // v10: attach parsed attachments to every pending item so the list can
  // show a paperclip count and the modal can render them immediately.
  [cashAdvances, releases, incomingCash, liquidations, materials, equipment].forEach(function (arr) {
    (arr || []).forEach(function (r) { r.attachments = attachmentsOf_(r); });
  });

  // v9: pending OVERTIME requests (multi-sig like everything else)
  const otRequests = readAll_('OTRequests').filter(function (o) {
    return o.status === 'Pending' && o.requestedBy && o.requestedBy.toLowerCase() !== userEmail;
  }).map(function (o) {
    o.type = 'OTRequest';
    o.sowIds = safeParse_(o.sowIdsJSON, []);
    return o;
  });

  // v9 (item 7): sanitize EVERY outbound date so the dashboard never
  // receives raw Date objects (UTC ISO strings / wrong-day bug).
  return sanitizeDatesDeep_({
    cashAdvances: notMine_(cashAdvances),
    releases: notMine_(releases),
    incomingCash: notMine_(incomingCash),
    liquidations: notMine_(liquidations),
    materials: notMine_(materials),
    equipment: notMine_(equipment),
    manpower: notMine_(manpower),
    dailyRecords: notMine_(dailyRecords),
    estimates: notMine_(estimates),
    otRequests: notMine_(otRequests)
  });
}

function getMyPendingRequests() {
  const email = currentUserEmail_().toLowerCase();
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Pending'; 
  }).map(function(r) { r.type = 'CashAdvance'; return r; });
  
  const releases = readAll_('CashRelease').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Pending'; 
  }).map(function(r) { r.type = 'CashRelease'; return r; });
  
  const incoming = readAll_('IncomingCashRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Pending'; 
  }).map(function(r) { r.type = 'IncomingCash'; return r; });
  
  const liquidations = readAll_('Liquidations').filter(function (l) { 
    return l.requestorEmail && l.requestorEmail.toLowerCase() === email && l.status === 'Pending'; 
  }).map(function(l) { l.type = 'Liquidation'; return l; });
  
  const materials = readAll_('Materials').filter(function (m) { 
    return m.requestedBy && m.requestedBy.toLowerCase() === email && low_(m.status) === 'pending'; 
  }).map(function(m) { m.type = 'Material'; return m; });
  
  const equipment = readAll_('Equipment').filter(function (e) { 
    return e.requestedBy && e.requestedBy.toLowerCase() === email && low_(e.status) === 'pending'; 
  }).map(function(e) { e.type = 'Equipment'; return e; });
  
  const dailyRecords = liveDailyRecords_().filter(function (d) { 
    return d.createdBy && d.createdBy.toLowerCase() === email && d.status === 'pending'; 
  }).map(function(d) { d.type = 'DailyRecord'; return d; });
  
  const estimates = readAll_('EstimateGroups').filter(function (g) { 
    return g.status === 'pending'; 
  }).map(function(g) { g.type = 'Estimate'; return g; });

  const manpower = readAll_('Manpower').filter(function (m) {
    return m.requestedBy && m.requestedBy.toLowerCase() === email && low_(m.status) === 'pending';
  }).map(function(m) { m.type = 'Manpower'; return m; });

  const ot = readAll_('OTRequests').filter(function (o) {
    return o.requestedBy && o.requestedBy.toLowerCase() === email && o.status === 'Pending';
  }).map(function(o) { o.type = 'OTRequest'; return o; });

  return sanitizeDatesDeep_([].concat(cashAdvances, releases, incoming, liquidations, materials, equipment, manpower, dailyRecords, estimates, ot));
}

function getMyApprovedRequests() {
  const email = currentUserEmail_().toLowerCase();
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Approved'; 
  }).map(function(r) { r.type = 'CashAdvance'; return r; });
  
  const incoming = readAll_('IncomingCashRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Approved'; 
  }).map(function(r) { r.type = 'IncomingCash'; return r; });
  
  const liquidations = readAll_('Liquidations').filter(function (l) { 
    return l.requestorEmail && l.requestorEmail.toLowerCase() === email && l.status === 'Approved'; 
  }).map(function(l) { l.type = 'Liquidation'; return l; });
  
  const materials = readAll_('Materials').filter(function (m) { 
    return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'approved'; 
  }).map(function(m) { m.type = 'Material'; return m; });
  
  const equipment = readAll_('Equipment').filter(function (e) { 
    return e.requestedBy && e.requestedBy.toLowerCase() === email && e.status === 'approved'; 
  }).map(function(e) { e.type = 'Equipment'; return e; });
  
  const dailyRecords = liveDailyRecords_().filter(function (d) { 
    return d.createdBy && d.createdBy.toLowerCase() === email && d.status === 'approved'; 
  }).map(function(d) { d.type = 'DailyRecord'; return d; });

  const manpower = readAll_('Manpower').filter(function (m) {
    return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'approved';
  }).map(function(m) { m.type = 'Manpower'; return m; });
  
  const ot = readAll_('OTRequests').filter(function (o) {
    return o.requestedBy && o.requestedBy.toLowerCase() === email && o.status === 'Approved';
  }).map(function(o) { o.type = 'OTRequest'; return o; });

  return sanitizeDatesDeep_([].concat(cashAdvances, incoming, liquidations, materials, equipment, manpower, dailyRecords, ot));
}

function getMyRejectedRequests() {
  const email = currentUserEmail_().toLowerCase();
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Rejected'; 
  }).map(function(r) { r.type = 'CashAdvance'; return r; });
  
  const incoming = readAll_('IncomingCashRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Rejected'; 
  }).map(function(r) { r.type = 'IncomingCash'; return r; });
  
  const liquidations = readAll_('Liquidations').filter(function (l) { 
    return l.requestorEmail && l.requestorEmail.toLowerCase() === email && l.status === 'Rejected'; 
  }).map(function(l) { l.type = 'Liquidation'; return l; });
  
  const materials = readAll_('Materials').filter(function (m) { 
    return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'rejected'; 
  }).map(function(m) { m.type = 'Material'; return m; });
  
  const equipment = readAll_('Equipment').filter(function (e) { 
    return e.requestedBy && e.requestedBy.toLowerCase() === email && e.status === 'rejected'; 
  }).map(function(e) { e.type = 'Equipment'; return e; });
  
  const dailyRecords = liveDailyRecords_().filter(function (d) { 
    return d.createdBy && d.createdBy.toLowerCase() === email && d.status === 'rejected'; 
  }).map(function(d) { d.type = 'DailyRecord'; return d; });

  const manpower = readAll_('Manpower').filter(function (m) {
    return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'rejected';
  }).map(function(m) { m.type = 'Manpower'; return m; });
  
  const ot = readAll_('OTRequests').filter(function (o) {
    return o.requestedBy && o.requestedBy.toLowerCase() === email && o.status === 'Rejected';
  }).map(function(o) { o.type = 'OTRequest'; return o; });

  return sanitizeDatesDeep_([].concat(cashAdvances, incoming, liquidations, materials, equipment, manpower, dailyRecords, ot));
}

function getRequestById(id) {
  // v9.2: every result is TAGGED with its type (the detail modal and
  // its approve/reject buttons need it — raw rows have no such field,
  // which rendered as "undefined" and broke type-dependent rendering)
  // and passed through sanitizeDatesDeep_ (clean dates/times).
  var lookups = [
    ['CashAdvanceRequests', 'CashAdvance'],
    ['CashRelease', 'CashRelease'],
    ['IncomingCashRequests', 'IncomingCash'],
    ['Liquidations', 'Liquidation'],
    ['Materials', 'Material'],
    ['Equipment', 'Equipment'],
    ['DailyRecords', 'DailyRecord'],
    ['Manpower', 'Manpower'],
    ['OTRequests', 'OTRequest']
  ];
  for (var i = 0; i < lookups.length; i++) {
    var req = readAll_(lookups[i][0]).find(function (r) { return r.id === id; });
    if (req) {
      req.type = lookups[i][1];
      if (req.type === 'OTRequest') req.sowIds = safeParse_(req.sowIdsJSON, []);
      // v10 ATTACHMENT FIX: the row carries attachmentsJSON (a STRING);
      // the detail modal looked for a parsed `attachments` ARRAY, so
      // uploaded receipts and photos never rendered anywhere. Parse it
      // here so every modal receives real objects: [{url, name}].
      req.attachments = attachmentsOf_(req);
      return sanitizeDatesDeep_(req);
    }
  }
  return null;
}

/**
 * attachmentsOf_ (v10) - Normalizes any row's attachment field into a
 * clean [{ url, name }] array. Handles the attachmentsJSON string used
 * by cash/liquidation rows, the single `image` column used by the
 * catalog and site-ops rows, and rows that already hold an array.
 */
function attachmentsOf_(row) {
  var out = [];
  if (!row) return out;
  var raw = row.attachments !== undefined ? row.attachments : row.attachmentsJSON;
  if (Array.isArray(raw)) out = raw.slice();
  else if (typeof raw === 'string' && raw) out = safeParse_(raw, []);
  // single-image columns used elsewhere in the system
  ['image', 'beforeImage', 'afterImage', 'fileUrl', 'receiptUrl'].forEach(function (f) {
    if (row[f] && String(row[f]).indexOf('http') === 0) {
      var label = f === 'beforeImage' ? 'Before' : f === 'afterImage' ? 'After'
                : f === 'fileUrl' ? (row.fileName || 'File') : f === 'receiptUrl' ? 'Receipt' : 'Photo';
      out.push({ url: row[f], name: label });
    }
  });
  return out.filter(function (a) { return a && a.url; });
}

function approveItem(id, type) {
  requireApprover_('approving a request');   // v7.0
  return decideItem_(id, type, 'Approved');
}

function rejectItem(id, type) {
  requireApprover_('rejecting a request');   // v7.0
  return decideItem_(id, type, 'Rejected');
}

/**
 * ── APPROVAL ENGINE (v4: multi-signature for ALL types) ──
 *
 * MODEL (mirrors Cash Release, generalized to every type):
 *   • Required signers = every user with role 'admin' (super admins are
 *     EXCLUDED and can only force-approve/reject), minus the submitter.
 *   • Each admin signs once; their signature is recorded in the central
 *     Approvals sheet (requestId, approver, decision, timestamp).
 *   • An item leaves an admin's pending queue the moment THAT admin has
 *     signed, but stays visible to admins who haven't signed yet.
 *   • The item FINALIZES (takes effect) only when ALL required admins
 *     have approved. A single Rejected sign-off rejects it immediately.
 *   • Super Admin force-approve/reject finalizes at once, bypassing the
 *     signature count.
 */
function decideItem_(id, type, decision, isForce) {
  const approver = currentUserEmail_().toLowerCase();

  // v6.6 FIX: some callers historically passed the SOW id for estimates
  // instead of the estimate GROUP id ("Estimate group not found").
  // Translate here so signatures, finalization, and the Approvals sheet
  // all consistently use the canonical group id.
  if (type === 'Estimate') {
    const groups = readAll_('EstimateGroups');
    if (!groups.some(function (g) { return g.id === id; })) {
      const bySow = groups.find(function (g) { return g.sowId === id && g.status === 'pending'; })
        || groups.find(function (g) { return g.sowId === id; });
      if (bySow) id = bySow.id;
    }
  }

  const meta = resolveApprovalItem_(id, type);
  if (!meta.found) throw new Error(meta.msg || 'Request not found.');
  if (!meta.isPending) throw new Error(meta.notPendingMsg || 'Request is not pending.');
  if (meta.submitter && meta.submitter === approver) {
    throw new Error('Self-approval is not allowed.');
  }

  // Cash Release keeps its own dedicated review flow (reviewedByJSON).
  if (type === 'CashRelease') {
    return reviewRelease(id, approver);
  }

  // Super Admin force: finalize immediately, no signature tracking.
  if (isForce) {
    return finalizeDecision_(id, type, decision, meta);
  }

  // Normal admin path — cannot sign twice.
  if (hasDecided_(id, approver)) {
    throw new Error('You have already decided on this request.');
  }
  appendRow_('Approvals', {
    requestId: id, approver: approver, decision: decision,
    timestamp: new Date(), remarks: ''
  });

  // One rejection rejects the whole item.
  if (decision === 'Rejected') {
    return finalizeDecision_(id, type, 'Rejected', meta);
  }

  // Approval finalizes only when every required admin has approved.
  if (allSignersApproved_(id, meta.submitter)) {
    return finalizeDecision_(id, type, 'Approved', meta);
  }

  logActivity_(type + ' ' + id + ' approved by ' + currentUserName_() + ' — awaiting other admins', 'blue', id);
  return { success: true, status: 'pending', awaiting: true };
}

/**
 * resolveApprovalItem_ - Uniform lookup for any approvable type.
 * Returns { found, isPending, submitter (lowercased email) }.
 */
function resolveApprovalItem_(id, type) {
  var r, subField;
  switch (type) {
    case 'CashAdvance':
      r = readAll_('CashAdvanceRequests').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: r.status === 'Pending', submitter: low_(r.requestorEmail), obj: r }
               : { found: false, msg: 'Cash advance request not found.' };
    case 'CashRelease':
      r = readAll_('CashRelease').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: r.status === 'For Review', submitter: low_(r.releasedBy), obj: r }
               : { found: false, msg: 'Cash release record not found.' };
    case 'IncomingCash':
    case 'Incoming Cash':
      r = readAll_('IncomingCashRequests').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: r.status === 'Pending', submitter: low_(r.requestorEmail), obj: r }
               : { found: false, msg: 'Incoming cash request not found.' };
    case 'Liquidation':
      r = readAll_('Liquidations').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: r.status === 'Pending', submitter: low_(r.requestorEmail), obj: r }
               : { found: false, msg: 'Liquidation record not found.' };
    // v6.1: pending checks are case-insensitive — requestMaterial and
    // friends now write lowercase 'pending' (matching 'approved' /
    // 'rejected'), while rows created before the change hold 'Pending'.
    case 'Material':
      r = readAll_('Materials').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.requestedBy), obj: r }
               : { found: false, msg: 'Material not found.' };
    case 'Equipment':
      r = readAll_('Equipment').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.requestedBy), obj: r }
               : { found: false, msg: 'Equipment not found.' };
    case 'Manpower':
      r = readAll_('Manpower').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.requestedBy), obj: r }
               : { found: false, msg: 'Manpower role not found.' };
    case 'DailyRecord':
      r = readAll_('DailyRecords').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: r.status === 'pending', submitter: low_(r.createdBy), obj: r }
               : { found: false, msg: 'Daily record not found.' };
    case 'Estimate':
      r = readAll_('EstimateGroups').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: r.status === 'pending', submitter: low_(r.submittedBy), obj: r }
               : { found: false, msg: 'Estimate group not found.' };
    case 'Billing':
      r = readAll_('Billings').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: r.status === 'Pending', submitter: low_(r.submittedBy), obj: r }
               : { found: false, msg: 'Billing not found.' };
    case 'OTRequest':
      // v9: overtime authorization for a project/date (multi-sig)
      r = readAll_('OTRequests').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: r.status === 'Pending', submitter: low_(r.requestedBy), obj: r }
               : { found: false, msg: 'OT request not found.' };
    default:
      return { found: false, msg: 'Invalid type for approval: ' + type };
  }
}

/**
 * finalizeDecision_ - Applies the real effect once a decision is final
 * (all admins approved, a rejection, or a super-admin force).
 */
function finalizeDecision_(id, type, decision, meta) {
  var approved = decision === 'Approved';
  switch (type) {
    case 'CashAdvance':
      if (approved) return approveCashAdvance(id);
      updateRow_('CashAdvanceRequests', 'id', id, { status: 'Rejected' });
      logActivity_('Cash advance ' + id + ' rejected', 'a', id);
      return { success: true, status: 'Rejected' };

    case 'IncomingCash':
      if (approved) return approveIncomingCash(id);
      updateRow_('IncomingCashRequests', 'id', id, { status: 'Rejected' });
      logActivity_('Incoming cash ' + id + ' rejected', 'a', id);
      return { success: true, status: 'Rejected' };

    case 'Liquidation':
      return approved ? approveLiquidation(id) : rejectLiquidation(id);

    case 'Material':
      updateRow_('Materials', 'id', id, { status: approved ? 'approved' : 'rejected' });
      logActivity_('Material ' + id + ' ' + (approved ? 'approved' : 'rejected'), approved ? 'g' : 'a', id);
      return { success: true };

    case 'Equipment':
      updateRow_('Equipment', 'id', id, { status: approved ? 'approved' : 'rejected' });
      logActivity_('Equipment ' + id + ' ' + (approved ? 'approved' : 'rejected'), approved ? 'g' : 'a', id);
      return { success: true };

    case 'Manpower':
      updateRow_('Manpower', 'id', id, { status: approved ? 'approved' : 'rejected' });
      logActivity_('Manpower role ' + id + ' ' + (approved ? 'approved' : 'rejected'), approved ? 'g' : 'a', id);
      return { success: true };

    case 'DailyRecord':
      updateRow_('DailyRecords', 'id', id, { status: approved ? 'approved' : 'rejected' });
      logActivity_('Daily record ' + id + ' ' + (approved ? 'approved' : 'rejected'), approved ? 'g' : 'a', id);
      return { success: true };

    case 'Billing':
      updateRow_('Billings', 'id', id, { status: approved ? 'Approved' : 'Rejected' });
      logActivity_('Billing ' + id + ' ' + (approved ? 'approved — ready to send/collect' : 'rejected'), approved ? 'g' : 'a', id);
      return { success: true };

    case 'OTRequest':
      // v9: once approved, the OT window unlocks the OT time in/out
      // fields on the Daily Site Record for that project + date.
      updateRow_('OTRequests', 'id', id, { status: approved ? 'Approved' : 'Rejected' });
      logActivity_('OT request ' + id + ' ' + (approved ? 'approved — OT fields unlocked for its date' : 'rejected'), approved ? 'g' : 'a', id);
      return { success: true };

    case 'Estimate':
      var eg = readAll_('EstimateGroups').find(function (g) { return g.id === id; });
      if (!eg) throw new Error('Estimate group not found.');
      if (approved) return approveEstimates(eg.projectId, eg.sowId);
      updateRow_('EstimateGroups', 'id', id, { status: 'draft' });
      logActivity_('Estimate for ' + eg.sowId + ' rejected — returned to draft', 'a', id);
      return { success: true, status: 'draft' };

    default:
      throw new Error('Invalid type for approval: ' + type);
  }
}

// ── Multi-signature helpers ──
function low_(v) { return String(v || '').toLowerCase(); }

/** requiredSigners_ - every admin-role user, minus the submitter. */
function requiredSigners_(submitterEmail) {
  var sub = low_(submitterEmail);
  return readAll_('Users')
    .filter(function (u) { return u.role === 'admin'; })
    .map(function (u) { return low_(u.email); })
    .filter(function (e) { return e && e !== sub; });
}

/** hasDecided_ - has this approver already signed this request? */
function hasDecided_(id, approver) {
  approver = low_(approver);
  return readAll_('Approvals').some(function (a) {
    return a.requestId === id && low_(a.approver) === approver;
  });
}

/** allSignersApproved_ - have ALL required admins approved this item? */
function allSignersApproved_(id, submitterEmail) {
  var required = requiredSigners_(submitterEmail);
  if (required.length === 0) return true; // no other admins -> first approval is final
  var approvedBy = readAll_('Approvals')
    .filter(function (a) { return a.requestId === id && a.decision === 'Approved'; })
    .map(function (a) { return low_(a.approver); });
  return required.every(function (e) { return approvedBy.indexOf(e) !== -1; });
}

// ─── SUPER ADMIN FORCE APPROVE/REJECT ─────────────────────────

function forceApprove(id, type) {
  requireSuperAdmin_('force approval');   // v7.0
  const user = readAll_('Users').find(function (u) { 
    return String(u.email).toLowerCase() === currentUserEmail_().toLowerCase(); 
  });
  if (!user || user.role !== 'superadmin') {
    throw new Error('Only the Super Admin can force-approve.');
  }
  return decideItem_(id, type, 'Approved', true);
}

function forceReject(id, type) {
  requireSuperAdmin_('force rejection');   // v7.0
  const user = readAll_('Users').find(function (u) { 
    return String(u.email).toLowerCase() === currentUserEmail_().toLowerCase(); 
  });
  if (!user || user.role !== 'superadmin') {
    throw new Error('Only the Super Admin can force-reject.');
  }
  return decideItem_(id, type, 'Rejected', true);
}