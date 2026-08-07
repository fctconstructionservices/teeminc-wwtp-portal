/**
 * 31-PurchaseRequestService.gs — Purchase Requests (v11 BATCH G1)
 *
 * PURPOSE: Every purchase now starts here. The PR is the CONTROL POINT —
 * it is where spend is stopped, before any money moves — and the parent
 * record for whichever way it is eventually paid.
 *
 * ── THE TWO PATHS ────────────────────────────────────────────
 *
 * An approved PR is fulfilled one of two ways:
 *
 *   PURCHASE ORDER  credit from a supplier; produces a payable with a
 *                   due date from the supplier's terms  (Batch G2)
 *   CASH ADVANCE    spot purchase paid on the day; the system CREATES
 *                   the cash advance from the PR
 *
 * The second matters more than it looks. Cash Advance is not being
 * replaced — payroll, fuel, permits and incidentals still use it, and
 * turning those into "purchase requests" would be nonsense. What changes
 * is that BUYING no longer starts there. And because the cash advance is
 * generated from the approved PR, nobody types the same figures twice
 * and there is no second approval to chase: the advance rides on the
 * PR's approval.
 *
 * ── THE BUDGET CHECK ─────────────────────────────────────────
 *
 * This system already knows the estimate for every SOW item, which
 * off-the-shelf procurement software cannot. So a PR is checked against
 * it before approval, while it can still be stopped.
 *
 * It WARNS, it does not BLOCK. Sites genuinely do need to overspend a
 * line sometimes, and a system that refuses gets worked around — someone
 * codes the purchase to whichever SOW item still has budget, and then
 * the cost data is worse than if it had been let through. Better to let
 * it pass with the overrun visible to the people approving it.
 */

var PR_STATUSES = ['Draft', 'Pending', 'Approved', 'Rejected', 'Ordered', 'Closed', 'Cancelled'];

/** nextPrNumber_ - PR-<year>-#### , sequential within the year. */
function nextPrNumber_() {
  ensureSheet_('PurchaseRequests');
  var year = new Date().getFullYear();
  var max = 0;
  readAll_('PurchaseRequests').forEach(function (p) {
    var m = String(p.id || '').match(/^PR-(\d{4})-(\d+)$/);
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
  });
  return 'PR-' + year + '-' + String(max + 1).padStart(4, '0');
}

/**
 * sowMaterialBudget_ - The estimated MATERIALS cost for one SOW item,
 * from its approved estimate. This is what a purchase is measured
 * against — not the SOW's whole budget, which also covers labour,
 * equipment and indirects that a material purchase has no claim on.
 */
function sowMaterialBudget_(projectId, sowId) {
  var groups = readAll_('EstimateGroups').filter(function (g) {
    return g.projectId === projectId && String(g.sowId) === String(sowId);
  });
  if (!groups.length) return null;   // null means "no estimate to check against"
  var ids = {};
  groups.forEach(function (g) { ids[String(g.id)] = true; });
  var total = 0;
  readAll_('EstimateMaterials').forEach(function (m) {
    if (ids[String(m.groupId)]) total += parseFloat(m.cost) || 0;
  });
  return r2_(total);
}

/**
 * sowMaterialCommitted_ - What has already been spent OR committed on
 * materials for this SOW item.
 *
 * COMMITTED, not just spent: a PR that is approved but not yet
 * delivered has not cost anything, but the money is promised. Checking
 * a new request only against actual spend would let you approve three
 * requests that each look affordable and together blow the budget —
 * the classic way procurement overruns happen quietly.
 */
function sowMaterialCommitted_(projectId, sowId, excludePrId) {
  ensureSheet_('PurchaseRequests');
  ensureSheet_('PRLines');

  var counted = { pending: true, approved: true, ordered: true };
  var prIds = {};
  readAll_('PurchaseRequests').forEach(function (pr) {
    if (pr.projectId !== projectId) return;
    if (String(pr.sowId) !== String(sowId)) return;
    if (excludePrId && pr.id === excludePrId) return;
    if (!counted[low_(pr.status)]) return;
    prIds[pr.id] = true;
  });

  var total = 0;
  readAll_('PRLines').forEach(function (l) {
    if (prIds[l.prId]) total += parseFloat(l.amount) || 0;
  });
  return r2_(total);
}

/**
 * checkPrBudget - The budget check, computed server-side so the warning
 * on screen and the one the approvers see cannot disagree.
 *
 * Returns { state, budget, committed, requested, after, overBy, message }
 * state: 'no-estimate' | 'ok' | 'near' | 'over'
 */
function checkPrBudget(projectId, sowId, requested, excludePrId) {
  readMany_(['EstimateGroups', 'EstimateMaterials', 'PurchaseRequests', 'PRLines']);
  var req = r2_(requested);
  var budget = sowMaterialBudget_(projectId, sowId);

  if (budget === null || budget <= 0) {
    return {
      state: 'no-estimate', budget: 0, committed: 0, requested: req, after: req, overBy: 0,
      message: 'No approved materials estimate exists for ' + sowId +
        ', so this request cannot be checked against a budget. Approve the estimate first if you want that control.'
    };
  }

  var committed = sowMaterialCommitted_(projectId, sowId, excludePrId);
  var after = r2_(committed + req);
  var pct = Math.round(after / budget * 1000) / 10;

  if (after > budget) {
    return {
      state: 'over', budget: budget, committed: committed, requested: req, after: after,
      overBy: r2_(after - budget), pct: pct,
      message: 'This request puts materials spend on ' + sowId + ' at ' + fmtMoney_(after) +
        ' against an estimated ' + fmtMoney_(budget) + ' — over by ' + fmtMoney_(after - budget) +
        '. It can still be submitted, but approvers will see this and the overrun will need a variation order or a reason.'
    };
  }
  if (after > budget * 0.9) {
    return {
      state: 'near', budget: budget, committed: committed, requested: req, after: after,
      overBy: 0, pct: pct,
      message: 'This brings materials spend on ' + sowId + ' to ' + fmtMoney_(after) + ' of ' +
        fmtMoney_(budget) + ' estimated — ' + pct + '%. Only ' + fmtMoney_(budget - after) +
        ' is left for the rest of this scope item.'
    };
  }
  return {
    state: 'ok', budget: budget, committed: committed, requested: req, after: after,
    overBy: 0, pct: pct,
    message: 'Materials spend on ' + sowId + ' becomes ' + fmtMoney_(after) + ' of ' +
      fmtMoney_(budget) + ' estimated — ' + pct + '%.'
  };
}

/** getPurchaseRequests - list, newest first, with lines and budget state. */
function getPurchaseRequests(projectId) {
  ensureSheet_('PurchaseRequests');
  ensureSheet_('PRLines');
  readMany_(['PurchaseRequests', 'PRLines', 'Projects', 'Suppliers',
    'EstimateGroups', 'EstimateMaterials']);

  var projects = {};
  readAll_('Projects').forEach(function (p) { projects[p.id] = p.name; });

  var linesByPr = {};
  readAll_('PRLines').forEach(function (l) {
    (linesByPr[l.prId] = linesByPr[l.prId] || []).push(l);
  });

  var rows = readAll_('PurchaseRequests').filter(function (pr) {
    return !projectId || pr.projectId === projectId;
  });

  rows.forEach(function (pr) {
    pr.lines = (linesByPr[pr.id] || []).sort(function (a, b) {
      return (parseInt(a.sortOrder, 10) || 0) - (parseInt(b.sortOrder, 10) || 0);
    });
    pr.projectName = projects[pr.projectId] || pr.projectId;
    pr.lineCount = pr.lines.length;
    pr.qtyOrderedPct = _prOrderedPct_(pr.lines);
  });
  rows.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return sanitizeDatesDeep_(rows);
}

/** _prOrderedPct_ - how much of a PR has been turned into POs (G2). */
function _prOrderedPct_(lines) {
  var want = 0, got = 0;
  (lines || []).forEach(function (l) {
    want += parseFloat(l.qty) || 0;
    got += parseFloat(l.qtyOrdered) || 0;
  });
  return want > 0 ? Math.round(got / want * 100) : 0;
}

/**
 * submitPurchaseRequest - Creates the PR and its lines.
 * Goes through the SAME approval engine as everything else: four admins
 * unanimous, no self-approval, any rejection fails it — and a Super
 * Admin's own request is auto-approved, exactly as cash advances have
 * behaved since Batch A.
 */
function submitPurchaseRequest(data) {
  requireLogin_();
  ensureSheet_('PurchaseRequests');
  ensureSheet_('PRLines');

  if (!data || !data.projectId) throw new Error('Select a project.');
  assertProjectEditor_(data.projectId);
  if (!data.sowId) throw new Error('Select the SOW item this purchase is charged to.');
  if (!String(data.justification || '').trim()) {
    throw new Error('A justification is required — approvers read it first.');
  }

  var lines = (Array.isArray(data.lines) ? data.lines : []).map(function (l, i) {
    var qty = parseFloat(l.qty) || 0;
    var rate = parseFloat(l.rate) || 0;
    return {
      materialId: String(l.materialId || ''),
      itemName: String(l.itemName || '').trim(),
      unit: String(l.unit || ''),
      qty: qty, rate: rate, amount: r2_(qty * rate),
      notes: String(l.notes || ''),
      sortOrder: i
    };
  }).filter(function (l) { return l.itemName && l.qty > 0; });

  if (!lines.length) throw new Error('Add at least one item with a quantity.');

  var total = r2_(lines.reduce(function (s, l) { return s + l.amount; }, 0));
  var route = low_(data.route) === 'cash' ? 'cash' : 'po';

  // The budget state is STORED, not just shown. An approver looking at
  // this next week must see the same warning the requester saw — a
  // check recomputed later would silently change as other requests land.
  var budget = checkPrBudget(data.projectId, data.sowId, total);

  var id = nextPrNumber_();
  appendRow_('PurchaseRequests', {
    id: id,
    projectId: data.projectId,
    sowId: String(data.sowId),
    title: String(data.title || '').trim() || ('Purchase request ' + id),
    justification: String(data.justification).trim(),
    route: route,
    preferredSupplierId: String(data.preferredSupplierId || ''),
    dateNeeded: data.dateNeeded ? fmtDate_(data.dateNeeded) : '',
    deliverTo: String(data.deliverTo || ''),
    totalAmount: total,
    budgetState: budget.state,
    budgetMessage: budget.message,
    status: low_(data.status) === 'draft' ? 'Draft' : 'Pending',
    requestor: currentUserName_(),
    requestorEmail: currentUserEmail_().toLowerCase(),
    approvalsJSON: '[]',
    cashAdvanceId: '',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  lines.forEach(function (l) {
    appendRow_('PRLines', {
      id: nextId_('PRL'),
      prId: id,
      materialId: l.materialId,
      itemName: l.itemName,
      unit: l.unit,
      qty: l.qty,
      rate: l.rate,
      amount: l.amount,
      qtyOrdered: 0,
      qtyReceived: 0,
      notes: l.notes,
      sortOrder: l.sortOrder
    });
  });

  logActivity_('Purchase request ' + id + ' (' + fmtMoney_(total) + ', ' + lines.length +
    ' item(s)) raised by ' + currentUserName_() + ' against ' + data.sowId +
    (budget.state === 'over' ? ' — OVER the materials estimate by ' + fmtMoney_(budget.overBy) : ''),
    budget.state === 'over' ? 'a' : 'blue', id);

  if (low_(data.status) === 'draft') {
    return { success: true, id: id, budget: budget, status: 'Draft' };
  }
  var autoApproved = autoApproveIfSuper_(id, 'PurchaseRequest');
  return { success: true, id: id, budget: budget, autoApproved: autoApproved };
}

/** updatePurchaseRequest - drafts only. Once submitted it is frozen. */
function updatePurchaseRequest(id, data) {
  var pr = readAll_('PurchaseRequests').find(function (p) { return p.id === id; });
  if (!pr) throw new Error('Purchase request not found.');
  assertProjectEditor_(pr.projectId);
  if (low_(pr.status) !== 'draft') {
    throw new Error('Only a draft can be edited. This request is ' + pr.status +
      ' — cancel it and raise a new one if it needs to change.');
  }

  var upd = { updatedAt: new Date() };
  ['title', 'justification', 'deliverTo', 'preferredSupplierId', 'sowId']
    .forEach(function (f) { if (data[f] !== undefined) upd[f] = String(data[f]); });
  if (data.dateNeeded !== undefined) upd.dateNeeded = data.dateNeeded ? fmtDate_(data.dateNeeded) : '';
  if (data.route !== undefined) upd.route = low_(data.route) === 'cash' ? 'cash' : 'po';

  if (Array.isArray(data.lines)) {
    deleteRowsWhere_('PRLines', { prId: id });
    var total = 0;
    data.lines.forEach(function (l, i) {
      var qty = parseFloat(l.qty) || 0, rate = parseFloat(l.rate) || 0;
      var name = String(l.itemName || '').trim();
      if (!name || qty <= 0) return;
      var amt = r2_(qty * rate);
      total += amt;
      appendRow_('PRLines', {
        id: nextId_('PRL'), prId: id, materialId: String(l.materialId || ''),
        itemName: name, unit: String(l.unit || ''), qty: qty, rate: rate, amount: amt,
        qtyOrdered: 0, qtyReceived: 0, notes: String(l.notes || ''), sortOrder: i
      });
    });
    upd.totalAmount = r2_(total);
    var b = checkPrBudget(pr.projectId, upd.sowId || pr.sowId, upd.totalAmount, id);
    upd.budgetState = b.state;
    upd.budgetMessage = b.message;
  }

  updateRow_('PurchaseRequests', 'id', id, upd);
  logActivity_('Purchase request ' + id + ' updated', 'g', id);
  return { success: true };
}

/** submitDraftPurchaseRequest - moves a draft into approval. */
function submitDraftPurchaseRequest(id) {
  var pr = readAll_('PurchaseRequests').find(function (p) { return p.id === id; });
  if (!pr) throw new Error('Purchase request not found.');
  assertProjectEditor_(pr.projectId);
  if (low_(pr.status) !== 'draft') throw new Error('This request is already ' + pr.status + '.');
  if (low_(pr.requestorEmail) !== currentUserEmail_().toLowerCase()) {
    throw new Error('Only the requester can submit their own draft.');
  }
  updateRow_('PurchaseRequests', 'id', id, { status: 'Pending', updatedAt: new Date() });
  logActivity_('Purchase request ' + id + ' submitted for approval', 'blue', id);
  var autoApproved = autoApproveIfSuper_(id, 'PurchaseRequest');
  return { success: true, autoApproved: autoApproved };
}

/**
 * approvePurchaseRequest - Called by finalizeDecision_ once the
 * approval is final. This is where the CASH path branches: an approved
 * cash-route PR generates its own cash advance, already approved,
 * because the PR's approval WAS the approval. Asking for a second one
 * would be asking the same four people the same question twice.
 */
function approvePurchaseRequest(id) {
  var pr = readAll_('PurchaseRequests').find(function (p) { return p.id === id; });
  if (!pr) throw new Error('Purchase request not found.');

  updateRow_('PurchaseRequests', 'id', id, { status: 'Approved', updatedAt: new Date() });

  if (low_(pr.route) !== 'cash') {
    logActivity_('Purchase request ' + id + ' approved — ready to raise a purchase order', 'g', id);
    return { success: true, status: 'Approved', route: 'po' };
  }

  var caId = nextId_('CA');
  appendRow_('CashAdvanceRequests', {
    id: caId,
    type: 'Cash Advance',
    projectId: pr.projectId,
    requestor: pr.requestor,
    requestorEmail: pr.requestorEmail,
    amount: parseFloat(pr.totalAmount) || 0,
    description: 'Purchase request ' + id + ' — ' + pr.title,
    scope: pr.sowId,
    attachmentsJSON: '[]',
    payloadJSON: JSON.stringify({ requestType: 'Purchase', purchaseRequestId: id }),
    status: 'Pending',
    createdAt: new Date(),
    dateNeeded: pr.dateNeeded || '',
    sowId: pr.sowId
  });
  updateRow_('PurchaseRequests', 'id', id, { cashAdvanceId: caId });

  // The PR's approval carries. approveCashAdvance() produces the
  // CashRelease that the cash side of the system expects, so nothing
  // downstream has to know this advance came from a PR.
  approveCashAdvance(caId);

  logActivity_('Purchase request ' + id + ' approved — cash advance ' + caId + ' created and approved on it',
    'g', id);
  return { success: true, status: 'Approved', route: 'cash', cashAdvanceId: caId };
}

function cancelPurchaseRequest(id, reason) {
  var pr = readAll_('PurchaseRequests').find(function (p) { return p.id === id; });
  if (!pr) throw new Error('Purchase request not found.');
  assertProjectEditor_(pr.projectId);
  if (low_(pr.status) === 'ordered' || low_(pr.status) === 'closed') {
    throw new Error('This request has already been ordered against and cannot be cancelled.');
  }
  updateRow_('PurchaseRequests', 'id', id, {
    status: 'Cancelled',
    cancelReason: String(reason || ''),
    updatedAt: new Date()
  });
  logActivity_('Purchase request ' + id + ' cancelled' + (reason ? ' — ' + reason : ''), 'a', id);
  return { success: true };
}

/** deletePurchaseRequest - Super Admin, drafts and cancelled only. */
function deletePurchaseRequest(id) {
  requireSuperAdmin_('deleting a purchase request');
  var pr = readAll_('PurchaseRequests').find(function (p) { return p.id === id; });
  if (!pr) throw new Error('Purchase request not found.');
  var st = low_(pr.status);
  if (st !== 'draft' && st !== 'cancelled' && st !== 'rejected') {
    throw new Error('Only a draft, cancelled or rejected request can be deleted. Cancel it first.');
  }
  var n = deleteRowsWhere_('PRLines', { prId: id });
  deleteRow_('PurchaseRequests', 'id', id);
  logActivity_('Purchase request ' + id + ' deleted (' + n + ' line(s)) by ' + currentUserName_(), 'a', id);
  return { success: true, lines: n };
}
