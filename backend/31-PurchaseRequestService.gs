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
 * sowMaterialBudget_ - What a purchase against this SOW item should be
 * measured against.
 *
 * ── v11 BATCH G1.1 FIX ───────────────────────────────────────
 * The first version summed ONLY the estimate's MATERIALS lines. The
 * reasoning was sound — a material purchase has no claim on the labour
 * and equipment in the estimate — but it fails badly in practice:
 *
 *   · an estimate priced as a lump sum, or as labour and equipment with
 *     materials folded in, has no materials lines at all
 *   · so the total came back 0, the check reported "no estimate", and
 *     the control silently did nothing on exactly the scope items that
 *     were properly estimated
 *
 * It now DEGRADES instead of giving up, and reports which basis it
 * used so the number on screen is never unexplained:
 *
 *   1. materials lines, when they exist   — the most precise
 *   2. the estimate group total           — when the estimate is not
 *                                           broken down by category
 *   3. the SOW item's own budget          — when there is no estimate
 *                                           but there is a budget
 *   4. nothing to check against
 *
 * Returns { amount, basis, label } or null.
 *
 * Ids are TRIMMED on both sides. A SOW id typed into a sheet with a
 * trailing space matches nothing, and that failure is invisible.
 */
function sowMaterialBudget_(projectId, sowId) {
  var key = String(sowId == null ? '' : sowId).trim();
  if (!key) return null;

  var groups = readAll_('EstimateGroups').filter(function (g) {
    return String(g.projectId).trim() === String(projectId).trim() &&
           String(g.sowId).trim() === key;
  });

  if (groups.length) {
    var ids = {};
    groups.forEach(function (g) { ids[String(g.id)] = true; });

    var mat = 0;
    readAll_('EstimateMaterials').forEach(function (m) {
      if (ids[String(m.groupId)]) mat += parseFloat(m.cost) || 0;
    });
    if (mat > 0) {
      return { amount: r2_(mat), basis: 'materials',
               label: 'the materials in its estimate' };
    }

    // No materials lines — fall back to the whole estimate rather than
    // reporting "no estimate" on a scope item that plainly has one.
    var whole = 0;
    ['EstimateLabor', 'EstimateEquipment'].forEach(function (sheet) {
      readAll_(sheet).forEach(function (r) {
        if (ids[String(r.groupId)]) whole += parseFloat(r.cost) || 0;
      });
    });
    readAll_('EstimateIndirect').forEach(function (r) {
      if (ids[String(r.groupId)]) whole += parseFloat(r.amount) || 0;
    });
    if (whole > 0) {
      return { amount: r2_(whole), basis: 'estimate',
               label: 'its full estimate (no separate materials lines)' };
    }
  }

  // No usable estimate: fall back to the SOW's own budget.
  var sow = readAll_('SOWItems').find(function (x) {
    return String(x.projectId).trim() === String(projectId).trim() &&
           String(x.id).trim() === key;
  });
  var budget = sow ? parseFloat(sow.budget) || 0 : 0;
  if (budget > 0) {
    return { amount: r2_(budget), basis: 'budget',
             label: 'its SOW budget (no estimate priced yet)' };
  }
  return null;
}

/**
 * sowMaterialCommitted_ - Everything already SPENT or COMMITTED against
 * this SOW item, from every source.
 *
 * ── v11 BATCH H1 FIX ─────────────────────────────────────────
 * The first version counted ONLY open purchase requests. That made the
 * check almost useless in practice: a scope item could already have had
 * most of its budget drawn down through cash advances, and a new
 * purchase request would still read green because none of that spending
 * was visible to it. The control was measuring against a budget that
 * had already been eaten.
 *
 * Three sources now, and they must not double-count each other:
 *
 *   1. ACTUAL COST — from the shared accrual helper (30-CostBasis.gs).
 *      Cash advances that have been released, and goods received.
 *   2. PENDING CASH ADVANCES — requested but not yet released. Real
 *      exposure: approved tomorrow, spent the day after.
 *   3. OPEN PURCHASE REQUESTS — approved or awaiting approval, not yet
 *      delivered. The money is promised but nothing has cost anything.
 *
 * THE DOUBLE-COUNT TRAP, and how it is avoided: an approved cash-route
 * PR generates its own cash advance (see approvePurchaseRequest). That
 * advance would then be counted a second time — once as the PR, once as
 * the advance. So a PR that has spawned an advance is skipped here, and
 * the advance is counted instead, because the advance is the one that
 * turns into real money.
 */
function sowMaterialCommitted_(projectId, sowId, excludePrId) {
  ensureSheet_('PurchaseRequests');
  ensureSheet_('PRLines');

  var pid = String(projectId).trim();
  var key = String(sowId == null ? '' : sowId).trim();

  // 1. what this scope item has actually cost so far
  var spent = sowActualCost_(pid, key);

  // 2. cash advances requested but not yet released
  var pendingCash = 0;
  readAll_('CashAdvanceRequests').forEach(function (ca) {
    if (String(ca.projectId).trim() !== pid) return;
    if (String(ca.sowId || ca.scope || '').trim() !== key) return;
    if (low_(ca.status) !== 'pending') return;
    pendingCash += parseFloat(ca.amount) || 0;
  });

  // 3. open purchase requests, minus any that already became an advance
  var counted = { pending: true, approved: true, ordered: true };
  var prIds = {};
  readAll_('PurchaseRequests').forEach(function (pr) {
    if (String(pr.projectId).trim() !== pid) return;
    if (String(pr.sowId).trim() !== key) return;
    if (excludePrId && pr.id === excludePrId) return;
    if (!counted[low_(pr.status)]) return;
    // its cash advance is already counted in (1) or (2)
    if (pr.cashAdvanceId) return;
    prIds[pr.id] = true;
  });

  var openPr = 0;
  readAll_('PRLines').forEach(function (l) {
    if (prIds[l.prId]) openPr += parseFloat(l.amount) || 0;
  });

  return r2_(spent + pendingCash + openPr);
}

/**
 * sowCommitmentBreakdown_ - The same figure, itemised, so the warning
 * can say WHERE the budget went rather than just that it is gone.
 * A number a person cannot decompose is a number they argue with.
 */
function sowCommitmentBreakdown_(projectId, sowId, excludePrId) {
  var pid = String(projectId).trim();
  var key = String(sowId == null ? '' : sowId).trim();

  var spent = sowActualCost_(pid, key);

  var pendingCash = 0;
  readAll_('CashAdvanceRequests').forEach(function (ca) {
    if (String(ca.projectId).trim() !== pid) return;
    if (String(ca.sowId || ca.scope || '').trim() !== key) return;
    if (low_(ca.status) !== 'pending') return;
    pendingCash += parseFloat(ca.amount) || 0;
  });

  var counted = { pending: true, approved: true, ordered: true };
  var prIds = {};
  readAll_('PurchaseRequests').forEach(function (pr) {
    if (String(pr.projectId).trim() !== pid) return;
    if (String(pr.sowId).trim() !== key) return;
    if (excludePrId && pr.id === excludePrId) return;
    if (!counted[low_(pr.status)]) return;
    if (pr.cashAdvanceId) return;
    prIds[pr.id] = true;
  });
  var openPr = 0;
  readAll_('PRLines').forEach(function (l) {
    if (prIds[l.prId]) openPr += parseFloat(l.amount) || 0;
  });

  return {
    spent: r2_(spent),
    pendingCash: r2_(pendingCash),
    openRequests: r2_(openPr),
    total: r2_(spent + pendingCash + openPr)
  };
}

/**
 * checkPrBudget - The budget check, computed server-side so the warning
 * on screen and the one the approvers see cannot disagree.
 *
 * Returns { state, budget, committed, requested, after, overBy, message }
 * state: 'no-estimate' | 'ok' | 'near' | 'over'
 */
function checkPrBudget(projectId, sowId, requested, excludePrId) {
  readMany_(['EstimateGroups', 'EstimateMaterials', 'EstimateLabor',
    'EstimateEquipment', 'EstimateIndirect', 'SOWItems',
    'PurchaseRequests', 'PRLines',
    // v11 BATCH H1: cash spending counts against the same budget
    'CashAdvanceRequests', 'CashRelease', 'Liquidations']);
  var req = r2_(requested);
  var key = String(sowId == null ? '' : sowId).trim();
  var b = sowMaterialBudget_(projectId, key);

  if (!b || b.amount <= 0) {
    // v11 BATCH G1.1: say what was actually looked for and what was
    // found. The old message claimed no APPROVED estimate existed —
    // which this function never checked — and gave no way to tell
    // whether the estimate was missing, empty, or simply not matching
    // on the id.
    var groupExists = readAll_('EstimateGroups').some(function (g) {
      return String(g.projectId).trim() === String(projectId).trim() &&
             String(g.sowId).trim() === key;
    });
    var sowExists = readAll_('SOWItems').some(function (x) {
      return String(x.projectId).trim() === String(projectId).trim() &&
             String(x.id).trim() === key;
    });
    var why = !sowExists
      ? 'No SOW item "' + key + '" was found on this project — check the id matches exactly, including any trailing dot or space.'
      : groupExists
        ? 'An estimate exists for ' + key + ' but every line on it prices at zero, and the SOW item has no budget set either.'
        : 'There is no estimate for ' + key + ' and no budget on the SOW item.';
    return {
      state: 'no-estimate', basis: 'none', basisLabel: '',
      budget: 0, committed: 0, requested: req, after: req, overBy: 0,
      message: why + ' This request cannot be checked against anything, so it will go for approval unchecked.'
    };
  }

  var budget = b.amount;
  var bd = sowCommitmentBreakdown_(projectId, key, excludePrId);
  var committed = bd.total;
  var after = r2_(committed + req);
  var pct = Math.round(after / budget * 1000) / 10;
  var against = fmtMoney_(budget) + ' — ' + b.label;

  // Say WHERE the budget went. A figure a person cannot decompose is a
  // figure they argue with instead of acting on.
  var parts = [];
  if (bd.spent > 0) parts.push(fmtMoney_(bd.spent) + ' already spent');
  if (bd.pendingCash > 0) parts.push(fmtMoney_(bd.pendingCash) + ' in cash advances awaiting release');
  if (bd.openRequests > 0) parts.push(fmtMoney_(bd.openRequests) + ' in other open requests');
  var where = parts.length ? ' Committed so far: ' + parts.join(', ') + '.' : '';

  if (after > budget) {
    return {
      state: 'over', basis: b.basis, basisLabel: b.label, breakdown: bd,
      budget: budget, committed: committed, requested: req, after: after,
      overBy: r2_(after - budget), pct: pct,
      message: 'This request puts committed spend on ' + key + ' at ' + fmtMoney_(after) +
        ' against ' + against + ' — over by ' + fmtMoney_(after - budget) + '.' + where +
        ' It can still be submitted, but approvers will see this and the overrun will need a variation order or a reason.'
    };
  }
  if (after > budget * 0.9) {
    return {
      state: 'near', basis: b.basis, basisLabel: b.label, breakdown: bd,
      budget: budget, committed: committed, requested: req, after: after,
      overBy: 0, pct: pct,
      message: 'This brings committed spend on ' + key + ' to ' + fmtMoney_(after) + ' of ' +
        against + ' — ' + pct + '%. Only ' + fmtMoney_(budget - after) +
        ' is left for the rest of this scope item.'
    };
  }
  return {
    state: 'ok', basis: b.basis, basisLabel: b.label, breakdown: bd,
    budget: budget, committed: committed, requested: req, after: after,
    overBy: 0, pct: pct,
    message: 'Committed spend on ' + key + ' becomes ' + fmtMoney_(after) + ' of ' +
      against + ' — ' + pct + '%.' + where
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

/**
 * cancelPurchaseRequest - Cancels the request AND whatever it created.
 *
 * ── v11 BATCH I3: THE CASH ADVANCE WENT WITH IT ──
 * An approved cash-route PR generates its own cash advance, which in
 * turn produces a cash release. Cancelling the request used to change
 * only the request: the advance stayed approved and the release stayed
 * sitting in Release Cash, waiting to be handed over for a purchase
 * that had been called off. Someone would have released real money
 * against a cancelled request, and nothing in the system would have
 * objected.
 *
 * Cancelling therefore walks the chain it created and rejects it.
 *
 * WHAT IT WILL NOT DO: reverse money that has already moved. A release
 * marked Reviewed means the cash is out; that is a liquidation or a
 * return, not a cancellation, and the request is refused with the
 * reason rather than being half-undone.
 */
function cancelPurchaseRequest(id, reason) {
  var pr = readAll_('PurchaseRequests').find(function (p) { return p.id === id; });
  if (!pr) throw new Error('Purchase request not found.');
  assertProjectEditor_(pr.projectId);
  if (low_(pr.status) === 'ordered' || low_(pr.status) === 'closed') {
    throw new Error('This request has already been ordered against and cannot be cancelled.');
  }

  var caId = String(pr.cashAdvanceId || '').trim();
  var releasesCancelled = 0;
  var advanceCancelled = false;

  if (caId) {
    var releases = readAll_('CashRelease').filter(function (r) {
      return String(r.originalRequestId) === caId;
    });

    // Cash already handed over cannot be un-handed by cancelling a form.
    var spent = releases.filter(function (r) { return low_(r.status) === 'reviewed'; });
    if (spent.length) {
      var amt = spent.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0);
      throw new Error('Cash advance ' + caId + ' has already been released (' + fmtMoney_(amt) +
        '). Cancelling the request would not bring that money back — liquidate it or record a return first. ' +
        'Nothing has been changed.');
    }

    releases.forEach(function (r) {
      if (low_(r.status) === 'rejected') return;
      updateRow_('CashRelease', 'id', r.id, {
        status: 'Rejected',
        description: String(r.description || '') + ' — cancelled with ' + id
      });
      releasesCancelled++;
    });

    var ca = readAll_('CashAdvanceRequests').find(function (c) { return c.id === caId; });
    if (ca && low_(ca.status) !== 'rejected') {
      updateRow_('CashAdvanceRequests', 'id', caId, {
        status: 'Rejected',
        description: String(ca.description || '') + ' — cancelled with ' + id
      });
      advanceCancelled = true;
    }
  }

  updateRow_('PurchaseRequests', 'id', id, {
    status: 'Cancelled',
    cancelReason: String(reason || ''),
    updatedAt: new Date()
  });

  logActivity_('Purchase request ' + id + ' cancelled' + (reason ? ' — ' + reason : '') +
    (advanceCancelled ? '; cash advance ' + caId + ' rejected' : '') +
    (releasesCancelled ? '; ' + releasesCancelled + ' pending cash release(s) rejected' : ''),
    'a', id);

  return {
    success: true,
    cashAdvanceCancelled: advanceCancelled,
    releasesCancelled: releasesCancelled,
    cashAdvanceId: caId
  };
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