/**
 * 11-ApprovalService.gs — Central approval workflow
 *
 * PURPOSE: The approvals inbox and the single decision engine.
 *
 * decideItem_() enforces, per request type: self-approval ban,
 * status guards, one-vote-per-approver (Approvals sheet), and the
 * "all admins except the requestor" consensus rule.
 *
 * SCALABILITY: To make a NEW request type approvable, add one
 * `if (type === '...')` block in decideItem_() and include it in
 * getPendingApprovals()/getMy*Requests().
 *
 * ── v11 BATCH A CHANGES ──────────────────────────────────────
 * 1. SUPER ADMIN BYPASS. autoApproveIfSuper_() finalizes a request
 *    the instant a super admin files it, so the super admin never
 *    waits on anybody. decideItem_() also now checks isForce BEFORE
 *    the self-approval guard — previously the guard ran first, so a
 *    super admin literally could not force-approve their own request
 *    even though the UI showed the button.
 * 2. getRequestById() gained the EstimateGroups and Billings lookups
 *    it never had. Those two types appear in the pending inbox, so
 *    clicking one always returned null -> "Request not found."
 * 3. Billings now appear in the approvals inbox and in every
 *    My Requests tab, instead of only inside the project's own
 *    Billings tab.
 * 4. getMyPendingRequests() no longer leaks OTHER people's pending
 *    estimates into your own "My Requests" list (the estimates
 *    filter had no email condition at all).
 * 5. Status comparisons are case-insensitive everywhere, so legacy
 *    'Approved' rows stop disappearing from the Approved tab.
 */

// ============================================================
//  APPROVALS
// ============================================================

function getPendingApprovals() {
  // v6.5 PERF: one batched pass — this runs on every page navigation
  // (approval badge), so it was the most frequent multi-read call.
  readMany_(['Users', 'Approvals', 'CashAdvanceRequests', 'CashRelease',
    'IncomingCashRequests', 'Liquidations', 'Materials', 'Equipment',
    'Manpower', 'DailyRecords', 'EstimateGroups', 'OTRequests', 'Billings',
    'Projects', 'EstimateMaterials', 'EstimateLabor', 'EstimateEquipment',
    'EstimateIndirect']);

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
  // ── v11 BATCH G1: PURCHASE REQUESTS ──
  // Every purchase now starts as a PR, so this is the busiest section of
  // the inbox. Lines are attached because an approver deciding on a
  // purchase needs to see WHAT is being bought, not just a total.
  var prLinesByPr = {};
  if (ss_().getSheetByName('PRLines')) {
    readAll_('PRLines').forEach(function (l) {
      (prLinesByPr[l.prId] = prLinesByPr[l.prId] || []).push(l);
    });
  }
  var purchaseRequests = [];
  if (ss_().getSheetByName('PurchaseRequests')) {
    purchaseRequests = readAll_('PurchaseRequests').filter(function (r) {
      return low_(r.status) === 'pending' && low_(r.requestorEmail) !== userEmail;
    }).map(function (r) {
      return {
        id: r.id, type: 'PurchaseRequest', projectId: r.projectId,
        requestor: r.requestor, requestorEmail: r.requestorEmail,
        amount: parseFloat(r.totalAmount) || 0,
        description: r.title, scope: r.sowId, status: r.status,
        createdAt: r.createdAt, dateNeeded: r.dateNeeded,
        route: r.route, budgetState: r.budgetState, budgetMessage: r.budgetMessage,
        lines: prLinesByPr[r.id] || [], attachmentsJSON: '[]'
      };
    });
  }

  const notMine_ = function (list) {
    return isSuper ? list : list.filter(function (it) { return !myDecided[it.id]; });
  };

  // Cash Advances
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) {
    return low_(r.status) === 'pending' && low_(r.requestorEmail) !== userEmail;
  }).map(function (r) {
    return { id: r.id, type: 'CashAdvance', projectId: r.projectId, requestor: r.requestor, requestorEmail: r.requestorEmail, amount: r.amount, description: r.description, scope: r.scope, status: r.status, createdAt: r.createdAt, attachmentsJSON: r.attachmentsJSON };
  });

  // Cash Releases (For Review) - Admin only
  let releases = [];
  if (isAdmin && userRecord.role !== 'superadmin') {
    releases = readAll_('CashRelease').filter(function (r) {
      return r.status === 'For Review' && r.releasedBy && low_(r.releasedBy) !== userEmail
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
        reviewedByJSON: r.reviewedByJSON || '[]',
        attachmentsJSON: r.attachmentsJSON
      };
    });
  }

  // Liquidations
  const liquidations = readAll_('Liquidations').filter(function (l) {
    return low_(l.status) === 'pending' && low_(l.requestorEmail) !== userEmail;
  }).map(function (l) {
    return { id: l.id, type: 'Liquidation', projectId: l.projectId, requestor: l.requestor, requestorEmail: l.requestorEmail, amount: l.amount, description: l.description, status: l.status, createdAt: l.createdAt, attachmentsJSON: l.attachmentsJSON };
  });

  // v3: Incoming Cash requests now appear in the approvals inbox
  const incomingCash = readAll_('IncomingCashRequests').filter(function (r) {
    return low_(r.status) === 'pending' && r.requestorEmail && low_(r.requestorEmail) !== userEmail;
  }).map(function (r) {
    return { id: r.id, type: 'IncomingCash', projectId: r.projectId, requestor: r.requestor, requestorEmail: r.requestorEmail, amount: r.amount, description: r.description, paymentMethod: r.paymentMethod, reference: r.reference, status: r.status, createdAt: r.createdAt, attachmentsJSON: r.attachmentsJSON };
  });

  // Materials, Equipment, DailyRecords, Estimates
  const materials = readAll_('Materials').filter(function (m) {
    return low_(m.status) === 'pending' && m.requestedBy && low_(m.requestedBy) !== userEmail;
  }).map(function (m) { m.type = 'Material'; return m; });
  const equipment = readAll_('Equipment').filter(function (e) {
    return low_(e.status) === 'pending' && e.requestedBy && low_(e.requestedBy) !== userEmail;
  }).map(function (e) { e.type = 'Equipment'; return e; });
  const dailyRecords = liveDailyRecords_().filter(function (d) {
    return low_(d.status) === 'pending' && d.createdBy && low_(d.createdBy) !== userEmail;
  }).map(function (d) { d.type = 'DailyRecord'; return d; });
  // v5 (item 13): exclude the submitter — same rule as every other type.
  const estimates = readAll_('EstimateGroups').filter(function (g) {
    return low_(g.status) === 'pending' && low_(g.submittedBy) !== userEmail;
  }).map(function (g) {
    g.type = 'Estimate';
    g.estimateTotal = estimateGroupTotal_(g.id);
    return g;
  });

  // v3: pending manpower role requests (same flow as materials)
  const manpower = readAll_('Manpower').filter(function (m) {
    return low_(m.status) === 'pending' && m.requestedBy && low_(m.requestedBy) !== userEmail;
  }).map(function (m) { m.type = 'Manpower'; return m; });

  // ── v11 BATCH A: BILLINGS IN THE INBOX ──
  // Billings were created with status 'Pending' and had a full
  // 'Billing' case in resolveApprovalItem_/finalizeDecision_, but they
  // were never listed here. The only Approve button in the whole system
  // lived inside the project's Billings tab, so there was no badge, no
  // notification, and a downpayment could sit unapproved forever while
  // looking like the workflow was broken.
  const projectNames_ = {};
  readAll_('Projects').forEach(function (p) { projectNames_[p.id] = p.name; });
  const billings = readAll_('Billings').filter(function (b) {
    return low_(b.status) === 'pending' && low_(b.submittedBy) !== userEmail;
  }).map(function (b) {
    b.type = 'Billing';
    b.projectName = projectNames_[b.projectId] || b.projectId;
    return b;
  });

  // v9: pending OVERTIME requests (multi-sig like everything else)
  const otRequests = readAll_('OTRequests').filter(function (o) {
    return low_(o.status) === 'pending' && o.requestedBy && low_(o.requestedBy) !== userEmail;
  }).map(function (o) {
    o.type = 'OTRequest';
    o.sowIds = safeParse_(o.sowIdsJSON, []);
    return o;
  });

  // v10: attach parsed attachments to every pending item so the list can
  // show a paperclip count and the modal can render them immediately.
  [cashAdvances, releases, incomingCash, liquidations, materials, equipment, dailyRecords].forEach(function (arr) {
    (arr || []).forEach(function (r) { r.attachments = attachmentsOf_(r); });
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
    billings: notMine_(billings),
    otRequests: notMine_(otRequests),
    purchaseRequests: notMine_(purchaseRequests)   // v11 BATCH G1
  });
}

/**
 * myRequests_ (v11) - One filter used by all three "My Requests" tabs.
 * `want` is 'pending' | 'approved' | 'rejected'; every comparison is
 * lowercased so legacy rows written as 'Pending'/'Approved' behave the
 * same as rows written as 'pending'/'approved'.
 */
function myRequests_(want) {
  readMany_(['CashAdvanceRequests', 'CashRelease', 'IncomingCashRequests',
    'Liquidations', 'Materials', 'Equipment', 'Manpower', 'DailyRecords',
    'EstimateGroups', 'OTRequests', 'Billings', 'PurchaseRequests']);

  const email = currentUserEmail_().toLowerCase();
  const is_ = function (v) { return low_(v) === want; };
  const mine_ = function (v) { return low_(v) === email; };

  const pick = function (sheet, type, ownerField, statusField) {
    statusField = statusField || 'status';
    return readAll_(sheet).filter(function (r) {
      return mine_(r[ownerField]) && is_(r[statusField]);
    }).map(function (r) { r.type = type; return r; });
  };

  const out = [].concat(
    pick('CashAdvanceRequests', 'CashAdvance', 'requestorEmail'),
    pick('IncomingCashRequests', 'IncomingCash', 'requestorEmail'),
    pick('Liquidations', 'Liquidation', 'requestorEmail'),
    pick('Materials', 'Material', 'requestedBy'),
    pick('Equipment', 'Equipment', 'requestedBy'),
    pick('Manpower', 'Manpower', 'requestedBy'),
    pick('DailyRecords', 'DailyRecord', 'createdBy'),
    pick('OTRequests', 'OTRequest', 'requestedBy'),
    pick('PurchaseRequests', 'PurchaseRequest', 'requestorEmail'),   // v11 BATCH G1
    // ── v11 BATCH A FIX ──
    // The old getMyPendingRequests() filtered estimates on status ALONE
    // (`g.status === 'pending'`), with no email condition, so every user
    // saw every other user's pending estimates listed as their own
    // request. submittedBy is the correct owner column.
    pick('EstimateGroups', 'Estimate', 'submittedBy'),
    pick('Billings', 'Billing', 'submittedBy')
  );

  // CashRelease uses 'For Review' rather than 'Pending' for its live state.
  if (want === 'pending') {
    readAll_('CashRelease').filter(function (r) {
      return mine_(r.requestorEmail) && ['pending', 'for review'].indexOf(low_(r.status)) > -1;
    }).forEach(function (r) { r.type = 'CashRelease'; out.push(r); });
  }

  out.forEach(function (r) {
    r.attachments = attachmentsOf_(r);
    if (r.type === 'OTRequest') r.sowIds = safeParse_(r.sowIdsJSON, []);
  });
  return sanitizeDatesDeep_(out);
}

function getMyPendingRequests() { return myRequests_('pending'); }
function getMyApprovedRequests() { return myRequests_('approved'); }
function getMyRejectedRequests() { return myRequests_('rejected'); }

/**
 * estimateGroupTotal_ (v11) - Sum of every line item in an estimate
 * group. Used so the approvals inbox and the detail modal can show the
 * amount an approver is actually signing off on.
 */
function estimateGroupTotal_(groupId) {
  var total = 0;
  ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment'].forEach(function (sheet) {
    readAll_(sheet).forEach(function (r) {
      if (String(r.groupId) === String(groupId)) total += parseFloat(r.cost) || 0;
    });
  });
  readAll_('EstimateIndirect').forEach(function (r) {
    if (String(r.groupId) === String(groupId)) total += parseFloat(r.amount) || 0;
  });
  return Math.round(total * 100) / 100;
}

/**
 * estimateGroupLines_ (v11) - The four line-item arrays of a group, so
 * the approval modal can show WHAT is being approved without needing
 * the Estimates tab to have been opened first.
 */
function estimateGroupLines_(groupId) {
  var of_ = function (sheet) {
    return readAll_(sheet).filter(function (r) { return String(r.groupId) === String(groupId); });
  };
  return {
    materials: of_('EstimateMaterials'),
    labor: of_('EstimateLabor'),
    equipment: of_('EstimateEquipment'),
    indirect: of_('EstimateIndirect')
  };
}

function getRequestById(id) {
  // v9.2: every result is TAGGED with its type (the detail modal and
  // its approve/reject buttons need it — raw rows have no such field,
  // which rendered as "undefined" and broke type-dependent rendering)
  // and passed through sanitizeDatesDeep_ (clean dates/times).
  //
  // ── v11 BATCH A FIX ──
  // EstimateGroups and Billings were MISSING from this table. Both types
  // are listed in getPendingApprovals(), so clicking either one in the
  // inbox called getRequestById(), fell off the end of the loop, and
  // returned null — which the frontend reported as "Request not found."
  var lookups = [
    ['CashAdvanceRequests', 'CashAdvance'],
    ['CashRelease', 'CashRelease'],
    ['IncomingCashRequests', 'IncomingCash'],
    ['Liquidations', 'Liquidation'],
    ['Materials', 'Material'],
    ['Equipment', 'Equipment'],
    ['DailyRecords', 'DailyRecord'],
    ['Manpower', 'Manpower'],
    ['OTRequests', 'OTRequest'],
    ['EstimateGroups', 'Estimate'],
    ['Billings', 'Billing'],
    ['PurchaseRequests', 'PurchaseRequest']   // v11 BATCH G1
  ];
  for (var i = 0; i < lookups.length; i++) {
    var req = readAll_(lookups[i][0]).find(function (r) { return r.id === id; });
    if (req) {
      req.type = lookups[i][1];
      if (req.type === 'OTRequest') req.sowIds = safeParse_(req.sowIdsJSON, []);
      if (req.type === 'Estimate') {
        req.lines = estimateGroupLines_(req.id);
        req.amount = estimateGroupTotal_(req.id);
        req.scope = req.sowId;
        req.description = req.sowDescription;
        req.requestor = req.submittedBy;
      }
      // ── v11 BATCH H2 ──
      // The Daily Site Record modal used to show five fields — date,
      // weather, remarks — and told you to open the project tab for the
      // rest. An approver was therefore signing off a record they could
      // not see, which is the one thing an approval screen must not do.
      // Every JSON column is parsed here so the modal can show the WHOLE
      // record, exactly as the project's own Daily Records tab does.
      if (req.type === 'DailyRecord') {
        // v13.1: the same shared helper the project payload uses, so
        // the two paths to this record cannot disagree about whose
        // signature belongs on which row.
        req.manpower = attachSignatures_(safeParse_(req.manpowerJSON, []));
        req.equipment = safeParse_(req.equipmentJSON, []);
        req.workAccomplished = safeParse_(req.workAccomplishedJSON, []);
        req.materialsDelivered = safeParse_(req.materialsDeliveredJSON, []);
        req.materialsUsed = safeParse_(req.materialsUsedJSON, []);
        req.issues = safeParse_(req.issuesJSON, []);
        req.visitors = safeParse_(req.visitorsJSON, []);
        req.photos = safeParse_(req.photosJSON, []);
        var dproj = readAll_('Projects').find(function (p) { return p.id === req.projectId; });
        if (dproj) { req.projectName = dproj.name; req.projectLocation = dproj.location; }
      }

      // Billing showed the four money lines but nothing to check them
      // against. An approver could not tell whether the downpayment
      // recoupment was right without opening the project — so the
      // contract basis and the billing history come with it now.
      if (req.type === 'Billing') {
        var bproj = readAll_('Projects').find(function (p) { return p.id === req.projectId; });
        if (bproj) {
          req.projectName = bproj.name;
          req.contractValue = parseFloat(bproj.contractValue) || 0;
          req.retentionPct = parseFloat(bproj.retentionPct) || 0;
          req.downpaymentPct = parseFloat(bproj.downpaymentPct) || 0;
        }
        req.priorBillings = readAll_('Billings')
          .filter(function (b) {
            return b.projectId === req.projectId && b.id !== req.id &&
                   low_(b.status) !== 'rejected';
          })
          .map(function (b) {
            return {
              id: b.id, billingNo: b.billingNo, billingType: b.billingType,
              period: b.period, currentPct: b.currentPct,
              grossAmount: parseFloat(b.grossAmount) || 0,
              dpRecoupment: parseFloat(b.dpRecoupment) || 0,
              netAmount: parseFloat(b.netAmount) || 0, status: b.status
            };
          })
          .sort(function (a, b) { return String(a.billingNo).localeCompare(String(b.billingNo)); });
      }

      if (req.type === 'PurchaseRequest') {
        // v11 BATCH G1: the detail modal needs the line items and the
        // stored budget warning — an approver must see the same warning
        // the requester saw, not one recomputed since.
        req.lines = readAll_('PRLines').filter(function (l) { return l.prId === req.id; })
          .sort(function (a, b) { return (parseInt(a.sortOrder, 10) || 0) - (parseInt(b.sortOrder, 10) || 0); });
        req.amount = parseFloat(req.totalAmount) || 0;
        req.scope = req.sowId;
        req.description = req.title;
      }
      if (req.type === 'Billing') {
        req.amount = parseFloat(req.netAmount) || 0;
        req.requestor = req.submittedBy;
        req.description = (req.billingType || 'Progress') + ' billing ' +
          (req.billingNo || '') + ' — ' + (req.period || '');
      }
      if (req.type === 'DailyRecord') {
        req.requestor = req.createdBy;
        req.description = req.remarks || req.notes || '';
      }
      // project display name, so the modal never shows a bare id
      if (req.projectId) {
        var pr = readAll_('Projects').find(function (p) { return p.id === req.projectId; });
        if (pr) req.projectName = pr.name;
      }
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
 * ── SUPER ADMIN BYPASS (v11 BATCH A) ─────────────────────────
 *
 * autoApproveIfSuper_ - Called by every "submit/request" function
 * immediately after the row is written. If a SUPER ADMIN filed it, the
 * request is finalized on the spot: no pending state, no waiting on the
 * other admins, no entry in anybody's inbox.
 *
 * WHY IT ROUTES THROUGH finalizeDecision_ INSTEAD OF JUST SETTING
 * status = 'Approved': approval is never only a status change. A cash
 * advance approval also creates the CashRelease row; an estimate
 * approval writes the total back into the SOW budget. Setting the
 * status directly would leave those side effects undone and silently
 * corrupt the downstream numbers. Reusing the engine keeps the super
 * admin path and the normal path byte-for-byte identical in effect.
 *
 * A signature row is still written to the Approvals sheet so the audit
 * trail shows WHO approved it and that it was an auto-approval.
 *
 * Returns true if it auto-approved, false otherwise. Never throws — a
 * failure here must not lose the request the user just filed.
 */
function autoApproveIfSuper_(id, type) {
  try {
    if (currentUserRole_() !== 'superadmin') return false;
    var meta = resolveApprovalItem_(id, type);
    if (!meta.found || !meta.isPending) return false;

    appendRow_('Approvals', {
      requestId: id,
      approver: currentUserEmail_().toLowerCase(),
      decision: 'Approved',
      timestamp: new Date(),
      remarks: 'Auto-approved on submission (Super Admin)'
    });
    finalizeDecision_(id, type, 'Approved', meta);
    logActivity_(type + ' ' + id + ' auto-approved — filed by Super Admin ' +
      currentUserName_(), 'g', id);
    return true;
  } catch (e) {
    // The row is already saved; leaving it Pending is recoverable,
    // throwing here would make the user think the submission failed.
    logActivity_('Super Admin auto-approval of ' + type + ' ' + id +
      ' failed: ' + e.message + ' — left pending', 'a', id);
    return false;
  }
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
      const bySow = groups.find(function (g) { return g.sowId === id && low_(g.status) === 'pending'; })
        || groups.find(function (g) { return g.sowId === id; });
      if (bySow) id = bySow.id;
    }
  }

  const meta = resolveApprovalItem_(id, type);
  if (!meta.found) throw new Error(meta.msg || 'Request not found.');
  if (!meta.isPending) throw new Error(meta.notPendingMsg || 'Request is not pending.');

  // ── v11 BATCH A FIX: ORDER OF THESE TWO BLOCKS ──
  // The self-approval guard used to sit ABOVE the isForce branch, so it
  // ran first and threw for the super admin too. The UI showed "Force
  // Approve" on the super admin's own request and the server then
  // refused it — the exact "wala nang approval dapat" complaint.
  // A force decision is by definition an override, so it is checked
  // first. The guard still applies to every normal admin.
  if (isForce) {
    return finalizeDecision_(id, type, decision, meta);
  }

  if (meta.submitter && meta.submitter === approver) {
    throw new Error('Self-approval is not allowed.');
  }

  // Cash Release keeps its own dedicated review flow (reviewedByJSON).
  if (type === 'CashRelease') {
    return reviewRelease(id, approver);
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
 * v11: every isPending test is now case-insensitive.
 */
function resolveApprovalItem_(id, type) {
  var r;
  switch (type) {
    case 'CashAdvance':
      r = readAll_('CashAdvanceRequests').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.requestorEmail), obj: r }
               : { found: false, msg: 'Cash advance request not found.' };
    case 'PurchaseRequest':   // v11 BATCH G1
      r = readAll_('PurchaseRequests').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.requestorEmail), obj: r }
               : { found: false, msg: 'Purchase request not found.' };
    case 'CashRelease':
      r = readAll_('CashRelease').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'for review', submitter: low_(r.releasedBy), obj: r }
               : { found: false, msg: 'Cash release record not found.' };
    case 'IncomingCash':
    case 'Incoming Cash':
      r = readAll_('IncomingCashRequests').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.requestorEmail), obj: r }
               : { found: false, msg: 'Incoming cash request not found.' };
    case 'Liquidation':
      r = readAll_('Liquidations').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.requestorEmail), obj: r }
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
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.createdBy), obj: r }
               : { found: false, msg: 'Daily record not found.' };
    case 'Estimate':
      r = readAll_('EstimateGroups').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.submittedBy), obj: r }
               : { found: false, msg: 'Estimate group not found.' };
    case 'Billing':
      r = readAll_('Billings').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.submittedBy), obj: r }
               : { found: false, msg: 'Billing not found.' };
    case 'OTRequest':
      // v9: overtime authorization for a project/date (multi-sig)
      r = readAll_('OTRequests').find(function (x) { return x.id === id; });
      return r ? { found: true, isPending: low_(r.status) === 'pending', submitter: low_(r.requestedBy), obj: r }
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

    // v11 BATCH G1: approving a cash-route PR also creates and approves
    // its cash advance — see approvePurchaseRequest().
    case 'PurchaseRequest':
      if (approved) return approvePurchaseRequest(id);
      updateRow_('PurchaseRequests', 'id', id, { status: 'Rejected' });
      logActivity_('Purchase request ' + id + ' rejected', 'a', id);
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
  return decideItem_(id, type, 'Approved', true);
}

function forceReject(id, type) {
  requireSuperAdmin_('force rejection');   // v7.0
  return decideItem_(id, type, 'Rejected', true);
}
