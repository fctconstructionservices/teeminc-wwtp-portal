/**
 * 17-BillingService.gs — Progress Billings (v6)
 *
 * FLOW: Generate from progress → 'Pending' → multi-sig admin approval
 * (type 'Billing' in 11-ApprovalService) → 'Approved' → markBillingPaid
 * → 'Paid' + an Approved IncomingCash entry is auto-created so the
 * collection flows into project revenue through the existing money
 * pipeline (no double encoding).
 *
 * AMOUNTS: gross = (currentPct − prevPct)/100 × revised contract value
 * (contractValue + client-approved VOs); retention = gross × retentionPct
 * (project setting, default 10%); net = gross − retention.
 */

/**
 * contractReadiness_ (v6.3) - The contract basis is COMPLETE only when
 * every non-milestone SOW item has (a) an APPROVED estimate with a
 * non-zero total, and (b) a non-zero budget (internal control set).
 * Billing and variation orders are gated on this, since both bill or
 * modify a contract that must first be fully defined.
 */
function contractReadiness_(projectId) {
  // v11 BATCH H5: headings are excluded here too. They carry no estimate
  // and no budget by design, so counting them would block billing on
  // every project that uses a structured bill of quantities. The tree is
  // built with the same helper the rest of the system uses, so this
  // gate and the Timeline warning can never disagree.
  var allSows = buildSowTree_(readAll_('SOWItems').filter(function (s) {
    return s.projectId === projectId;
  }));
  var sows = allSows.filter(function (s) {
    return String(s.isMilestone) !== 'true' && !s.isHeading;
  });
  var groups = readAll_('EstimateGroups').filter(function (g) { return g.projectId === projectId; });
  var bySow = {};
  groups.forEach(function (g) { bySow[g.sowId] = g; });
  var allMat = readAll_('EstimateMaterials');
  var allLabor = readAll_('EstimateLabor');
  var allEq = readAll_('EstimateEquipment');
  var allInd = readAll_('EstimateIndirect');
  var groupTotal_ = function (gid) {
    var sum = 0;
    allMat.forEach(function (m) { if (m.groupId === gid) sum += parseFloat(m.cost) || 0; });
    allLabor.forEach(function (l) { if (l.groupId === gid) sum += parseFloat(l.cost) || 0; });
    allEq.forEach(function (e) { if (e.groupId === gid) sum += parseFloat(e.cost) || 0; });
    allInd.forEach(function (i) { if (i.groupId === gid) sum += parseFloat(i.amount) || 0; });
    return sum;
  };
  var unapproved = [], zeroBudget = [];
  sows.forEach(function (s) {
    var g = bySow[s.id];
    if (!g || g.status !== 'approved' || groupTotal_(g.id) <= 0) unapproved.push(s.id);
    if (!(parseFloat(s.budget) > 0)) zeroBudget.push(s.id);
  });
  return {
    ready: sows.length > 0 && unapproved.length === 0 && zeroBudget.length === 0,
    hasItems: sows.length > 0,
    unapproved: unapproved,
    zeroBudget: zeroBudget
  };
}

/** assertContractReady_ - throws a readable error when the gate is closed. */
function assertContractReady_(projectId, actionLabel) {
  var r = contractReadiness_(projectId);
  if (r.ready) return;
  var parts = [];
  if (!r.hasItems) parts.push('no SOW items yet');
  if (r.unapproved.length) parts.push(r.unapproved.length + ' estimate(s) not yet approved or empty (' + r.unapproved.slice(0, 4).join(', ') + (r.unapproved.length > 4 ? '…' : '') + ')');
  if (r.zeroBudget.length) parts.push(r.zeroBudget.length + ' SOW item(s) without budget (' + r.zeroBudget.slice(0, 4).join(', ') + (r.zeroBudget.length > 4 ? '…' : '') + ')');
  throw new Error('Cannot ' + actionLabel + ' — the contract basis is incomplete: ' + parts.join('; ') + '. Approve all estimates and set every SOW budget first.');
}

function updateProjectContract(projectId, contractValue, retentionPct) {
  var user = readAll_('Users').find(function (u) {
    return u.email.toLowerCase() === currentUserEmail_().toLowerCase();
  });
  if (!user || user.role !== 'superadmin') {
    throw new Error('Only Super Admin can set the contract value.');
  }
  var cv = parseFloat(contractValue) || 0;
  var rp = parseFloat(retentionPct);
  if (isNaN(rp) || rp < 0 || rp > 0.5) rp = 0.10;
  var found = findRowNum_('Projects', 'id', projectId);
  if (found === -1) throw new Error('Project not found.');
  updateRow_('Projects', 'id', projectId, { contractValue: cv, retentionPct: rp });
  logActivity_('Contract value for ' + projectId + ' set to ₱' + fmtMoney_(cv) + ' (retention ' + (rp * 100) + '%)', 'blue', projectId);
  return { success: true, contractValue: cv, retentionPct: rp };
}

/** revisedContractValue_ - contractValue + all Client-Approved VOs. */
function revisedContractValue_(projectId, proj, vos) {
  var base = parseFloat((proj && proj.contractValue) || 0) || 0;
  var voSum = (vos || readAll_('VariationOrders'))
    .filter(function (v) { return v.projectId === projectId && v.status === 'Client-Approved'; })
    .reduce(function (s, v) { return s + (parseFloat(v.amount) || 0); }, 0);
  return base + voSum;
}

/**
 * createBilling - Generates the next progress billing.
 * currentPct comes from the caller (the project page's budget-weighted
 * progress); it must exceed the last billed %. Status starts 'Pending'
 * and needs the full admin multi-signature to become 'Approved'.
 */
function createBilling(projectId, currentPct, period) {
  var proj = readAll_('Projects').find(function (p) { return p.id === projectId; });
  if (!proj) throw new Error('Project not found.');
  assertProjectEditor_(projectId);   // v6.6
  assertContractReady_(projectId, 'generate a billing');   // v6.3 gate

  var pct = parseFloat(currentPct);
  if (isNaN(pct) || pct <= 0 || pct > 100) throw new Error('Invalid accomplishment %.');

  var existing = readAll_('Billings').filter(function (b) {
    return b.projectId === projectId && b.status !== 'Rejected';
  });
  var prevPct = existing.reduce(function (mx, b) { return Math.max(mx, parseFloat(b.currentPct) || 0); }, 0);
  if (pct <= prevPct) {
    throw new Error('Accomplishment (' + pct + '%) must exceed the last billed ' + prevPct + '%.');
  }

  var revised = revisedContractValue_(projectId, proj, null);
  if (revised <= 0) throw new Error('Set the project Contract Value first (Billings tab).');

  var rp = parseFloat(proj.retentionPct);
  if (isNaN(rp) || rp < 0 || rp > 0.5) rp = 0.10;

  // ── v18 FIX: ACCOMPLISHMENT IS BILLED ON THE VAT-EXCLUSIVE VALUE ──
  // The contract value is what the client agreed to pay, VAT included.
  // Applying the accomplishment percentage to that figure charges VAT
  // on VAT: the progress amount already contains the tax, and then
  // output VAT is added on top of it again.
  //
  // The percentage applies to the NET value; VAT is added back once, at
  // the end, as its own line — which is how a SWA reads and how BIR
  // expects an invoice to be built.
  var vatPct = parseFloat(proj.vatPct);
  if (isNaN(vatPct) || vatPct < 0 || vatPct > 0.25) vatPct = 0.12;
  // A project can be non-VAT or zero-rated. Defaulting to VAT-registered
  // is right for most work here, but it has to be overridable.
  if (String(proj.vatRegistered || 'TRUE').toUpperCase() === 'FALSE') vatPct = 0;

  var contractNet = vatPct > 0 ? revised / (1 + vatPct) : revised;

  var gross = (pct - prevPct) / 100 * contractNet;   // VAT-exclusive
  var retention = gross * rp;

  // ── DOWNPAYMENT RECOUPMENT ──
  // A downpayment is an ADVANCE against the contract, not extra income.
  // If it were not deducted the client would pay for the same work
  // twice: once through the advance and again in full in this billing.
  //
  // ── v11 BATCH H5: FULL RECOUPMENT AT THE FIRST PROGRESS BILLING ──
  // v10 recouped dpPct × each billing's gross, spreading the advance
  // across the whole job. That is one accepted practice, but it is not
  // the one in use here, and it produced a net payable that looked right
  // per billing while leaving the advance outstanding for months.
  //
  // The rule now: the ENTIRE outstanding advance is deducted from the
  // FIRST progress billing, capped at what that billing can absorb.
  // If the first billing is smaller than the advance, the remainder
  // carries to the next one, and so on until it is worked off.
  //
  // The cap matters. Without it a ₱300,000 advance against a ₱200,000
  // first billing would produce a NEGATIVE net payable — an invoice
  // asking the client for a refund, which is not a billing, it is a
  // credit note, and this system does not issue those.
  var dp = dpLedger_(projectId, proj);
  var recoup = 0;
  if (dp.outstanding > 0) {
    // never more than the advance, and never more than this billing
    // is worth after retention
    // Capped against what this billing is actually worth once VAT is on
    // it — the same basis the advance was collected on. Without the cap
    // a large advance against a small first billing produces a negative
    // amount due, which is a credit note, and this system does not
    // issue those.
    recoup = Math.min(dp.outstanding, Math.max(0, gross - retention + gross * vatPct));
  }

  // ── THE ORDER OF OPERATIONS, AND WHY IT IS THIS ORDER ──
  //
  // VAT is charged on the ACCOMPLISHMENT. Retention is withheld cash,
  // not a discount, so the tax is due on the work whether or not the
  // retention has been released.
  //
  // The downpayment recoupment comes off LAST, after VAT — because the
  // advance was itself collected VAT-inclusive. Deducting a
  // VAT-inclusive advance from a VAT-exclusive subtotal would recoup
  // more than was ever advanced, and the difference would quietly
  // accumulate across every billing on the job.
  var vatAmount = gross * vatPct;
  var net = gross - retention + vatAmount - recoup;

  // count only PROGRESS billings when numbering, so the DP does not
  // consume PB-0001
  var progressCount = existing.filter(function (b) {
    return String(b.billingType || 'Progress') !== 'Downpayment';
  }).length;
  var billingNo = 'PB-' + ('0000' + (progressCount + 1)).slice(-4);
  var id = nextId_('BIL');
  appendRow_('Billings', {
    id: id,
    projectId: projectId,
    billingNo: billingNo,
    period: period || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM yyyy'),
    prevPct: prevPct,
    currentPct: pct,
    grossAmount: Math.round(gross * 100) / 100,      // VAT-exclusive
    vatAmount: Math.round(vatAmount * 100) / 100,
    vatPct: vatPct,
    retentionAmount: Math.round(retention * 100) / 100,
    netAmount: Math.round(net * 100) / 100,
    status: 'Pending',
    submittedBy: currentUserEmail_(),
    createdAt: new Date(),
    paidAt: '',
    billingType: 'Progress',
    dpRecoupment: Math.round(recoup * 100) / 100
  });
  logActivity_('Progress billing ' + billingNo + ' (₱' + fmtMoney_(net) + ' net' +
    (recoup > 0 ? ', less ₱' + fmtMoney_(recoup) + ' DP recoupment' : '') +
    ') generated for ' + projectId + ' — for approval', 'blue', id);
  // v11 BATCH A: Super Admin bypass — billing is immediately approved
  // and ready to send/collect.
  var autoApproved = autoApproveIfSuper_(id, 'Billing');
  return { success: true, id: id, billingNo: billingNo, net: net, dpRecoupment: recoup, autoApproved: autoApproved };
}

/**
 * dpLedger_ (v10) - The downpayment position of a project:
 *   { pct, advance, recouped, outstanding, pendingAdvance }
 * advance   = the APPROVED or PAID Downpayment billing's gross
 * recouped  = sum of dpRecoupment across non-rejected progress billings
 * The ledger is derived, never stored, so it cannot drift.
 *
 * v11 BATCH A FIX: `advance` used to count ANY downpayment billing that
 * was not Rejected — including one still sitting Pending approval. That
 * meant progress billings started deducting recoupment against money the
 * client had not agreed to advance yet, quietly under-billing the client.
 * Only an Approved or Paid downpayment is real. A still-pending one is
 * reported separately as `pendingAdvance` so the Billings tab can show
 * it without it affecting any arithmetic. Nothing is lost by waiting:
 * once the DP is approved, `outstanding` rises and the following
 * progress billings recoup the difference automatically.
 */
function dpLedger_(projectId, proj) {
  proj = proj || readAll_('Projects').find(function (p) { return p.id === projectId; }) || {};
  var pct = parseFloat(proj.downpaymentPct);
  if (isNaN(pct) || pct < 0 || pct > 0.6) pct = 0;
  var bills = readAll_('Billings').filter(function (b) {
    return b.projectId === projectId && String(b.status) !== 'Rejected';
  });
  var isDP = function (b) { return b.billingType === 'Downpayment'; };
  // ── v18 FIX: RECOUP ONLY WHAT HAS ACTUALLY BEEN RECEIVED ──
  // This counted an advance as recoupable once the downpayment billing
  // was APPROVED. Approved means the invoice has been issued, not that
  // the client has paid it — so the first progress billing deducted
  // money that had never arrived, and the net came out too low against
  // a client who still owed the advance.
  //
  // Only 'Paid' counts now. markBillingPaid is what sets it, and that
  // is also what creates the IncomingCash entry, so the two views of
  // the same money finally agree.
  var received = function (b) { return String(b.status || '').toLowerCase() === 'paid'; };
  var invoicedNotPaid = function (b) {
    var st = String(b.status || '').toLowerCase();
    return st === 'approved' || st === 'pending';
  };
  var advance = bills.filter(function (b) { return isDP(b) && received(b); })
    .reduce(function (s, b) { return s + (parseFloat(b.grossAmount) || 0); }, 0);
  // Surfaced separately so the sheet can say WHY an advance was not
  // deducted, rather than the reader assuming it was forgotten.
  var pendingAdvance = bills.filter(function (b) { return isDP(b) && invoicedNotPaid(b); })
    .reduce(function (s, b) { return s + (parseFloat(b.grossAmount) || 0); }, 0);
  var recouped = bills.reduce(function (s, b) { return s + (parseFloat(b.dpRecoupment) || 0); }, 0);
  return {
    pct: pct,
    advance: Math.round(advance * 100) / 100,
    pendingAdvance: Math.round(pendingAdvance * 100) / 100,
    recouped: Math.round(recouped * 100) / 100,
    outstanding: Math.round(Math.max(0, advance - recouped) * 100) / 100
  };
}

/** getDPLedger - exposed to the UI for the Billings tab panel. */
function getDPLedger(projectId) {
  requireLogin_();
  return dpLedger_(projectId);
}

/**
 * setDownpaymentPct - Super Admin sets the contract's downpayment %.
 * Stored as a fraction (0.15 = 15%).
 */
function setDownpaymentPct(projectId, pct) {
  requireSuperAdmin_('setting the downpayment percentage');
  var v = parseFloat(pct);
  if (isNaN(v) || v < 0 || v > 0.6) throw new Error('Downpayment must be between 0% and 60%.');
  updateRow_('Projects', 'id', projectId, { downpaymentPct: v });
  logActivity_('Downpayment set to ' + (v * 100).toFixed(1) + '% for ' + projectId, 'blue', projectId);
  return { success: true, downpaymentPct: v };
}

/**
 * createDownpaymentBilling (v10) - The client's advance at project
 * start, recorded as the FIRST billing so it flows through the same
 * approval and collection path as everything else. It sits at 0%
 * accomplishment: it bills no work, it only draws the advance.
 * Retention does NOT apply to a downpayment.
 */
function createDownpaymentBilling(projectId, period) {
  var proj = readAll_('Projects').find(function (p) { return p.id === projectId; });
  if (!proj) throw new Error('Project not found.');
  assertProjectEditor_(projectId);
  assertContractReady_(projectId, 'record a downpayment');

  var dp = dpLedger_(projectId, proj);
  if (dp.pct <= 0) throw new Error('Set the Downpayment % for this contract first.');
  if (dp.advance > 0) throw new Error('A downpayment has already been recorded for this project.');

  var revised = revisedContractValue_(projectId, proj, null);
  if (revised <= 0) throw new Error('Set the project Contract Value first (Billings tab).');

  var gross = revised * dp.pct;
  var id = nextId_('BIL');
  appendRow_('Billings', {
    id: id,
    projectId: projectId,
    billingNo: 'DP-0001',
    period: period || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM yyyy'),
    prevPct: 0,
    currentPct: 0,           // an advance bills no accomplishment
    grossAmount: Math.round(gross * 100) / 100,
    retentionAmount: 0,      // retention applies to progress work only
    netAmount: Math.round(gross * 100) / 100,
    status: 'Pending',
    submittedBy: currentUserEmail_(),
    createdAt: new Date(),
    paidAt: '',
    billingType: 'Downpayment',
    dpRecoupment: 0
  });
  logActivity_('Downpayment DP-0001 (' + (dp.pct * 100).toFixed(1) + '% = ₱' +
    fmtMoney_(gross) + ') recorded for ' + projectId + ' — for approval', 'blue', id);
  // v11 BATCH A: Super Admin bypass.
  var autoApproved = autoApproveIfSuper_(id, 'Billing');
  return { success: true, id: id, billingNo: 'DP-0001', net: gross, autoApproved: autoApproved };
}

/**
 * markBillingPaid - Records the client's payment. Creates an APPROVED
 * IncomingCash entry for the net amount so it flows straight into
 * project revenue (payment is a fact, not a request).
 */
function markBillingPaid(id) {
  var user = readAll_('Users').find(function (u) {
    return u.email.toLowerCase() === currentUserEmail_().toLowerCase();
  });
  if (!user || (user.role !== 'superadmin' && user.role !== 'admin')) {
    throw new Error('Only admins can mark a billing as paid.');
  }
  var b = readAll_('Billings').find(function (x) { return x.id === id; });
  if (!b) throw new Error('Billing not found.');
  if (b.status !== 'Approved') throw new Error('Billing must be Approved before it can be marked Paid.');

  updateRow_('Billings', 'id', id, { status: 'Paid', paidAt: new Date() });

  var icId = nextId_('IC');
  appendRow_('IncomingCashRequests', {
    id: icId,
    type: 'Incoming Cash',
    projectId: b.projectId,
    requestor: currentUserName_(),
    requestorEmail: currentUserEmail_(),
    amount: parseFloat(b.netAmount) || 0,
    description: (b.billingType === 'Downpayment'
      ? 'Downpayment — ' + b.billingNo + ' (' + b.period + ')'
      : 'Collection — ' + b.billingNo + ' (' + b.period + ', ' + b.currentPct + '% accomplishment)'),
    paymentMethod: b.billingType === 'Downpayment' ? 'Downpayment' : 'Billing Collection',
    // v10: explicit source so portfolio "Collected" counts client money
    // only — owner capital stays classified as Funding.
    sourceType: 'Client Collection',
    reference: b.billingNo,
    transactionDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    attachmentsJSON: '[]',
    status: 'Approved',
    createdAt: new Date()
  });
  logActivity_('Billing ' + b.billingNo + ' PAID — ₱' + fmtMoney_(b.netAmount) + ' posted to ' + b.projectId + ' revenue (' + icId + ')', 'g', id);
  return { success: true, incomingCashId: icId };
}


/**
 * reviseBilling (v6.1) - The client evaluated a DIFFERENT accomplishment
 * than what was billed (usually lower). The original billing is marked
 * Rejected (kept for the audit trail, tagged as superseded) and a fresh
 * billing is created at the client-approved %, same period, billingNo +
 * '-R', with amounts recomputed against the same previous baseline. The
 * new billing starts Pending so it goes through the full admin
 * multi-signature again — the amounts changed, so the signatures must too.
 */
function reviseBilling(id, clientPct) {
  var user = readAll_('Users').find(function (u) {
    return u.email.toLowerCase() === currentUserEmail_().toLowerCase();
  });
  if (!user || (user.role !== 'superadmin' && user.role !== 'admin')) {
    throw new Error('Only admins can revise a billing.');
  }
  var b = readAll_('Billings').find(function (x) { return x.id === id; });
  if (!b) throw new Error('Billing not found.');
  if (b.status === 'Paid') throw new Error('A paid billing can no longer be revised.');
  if (b.status === 'Rejected') throw new Error('This billing is already rejected/superseded.');

  assertProjectEditor_(b.projectId);   // v6.6
  assertContractReady_(b.projectId, 'revise a billing');   // v6.3 gate

  var pct = parseFloat(clientPct);
  var prevPct = parseFloat(b.prevPct) || 0;
  if (isNaN(pct) || pct <= prevPct || pct > 100) {
    throw new Error('Client-approved % must be above the previous billed ' + prevPct + '% and at most 100%.');
  }

  var proj = readAll_('Projects').find(function (p) { return p.id === b.projectId; });
  if (!proj) throw new Error('Project not found.');
  var revised = revisedContractValue_(b.projectId, proj, null);
  var rp = parseFloat(proj.retentionPct);
  if (isNaN(rp) || rp < 0 || rp > 0.5) rp = 0.10;

  // supersede the original
  updateRow_('Billings', 'id', id, { status: 'Rejected' });

  // v18: the revise path bills on the same VAT-exclusive basis as the
  // original. Leaving it on the gross would mean a revised billing came
  // out higher than the one it replaced, for no reason anyone could see.
  var vatPct = parseFloat(proj.vatPct);
  if (isNaN(vatPct) || vatPct < 0 || vatPct > 0.25) vatPct = 0.12;
  if (String(proj.vatRegistered || 'TRUE').toUpperCase() === 'FALSE') vatPct = 0;
  var contractNet = vatPct > 0 ? revised / (1 + vatPct) : revised;

  var gross = (pct - prevPct) / 100 * contractNet;
  var retention = gross * rp;
  var vatAmount = gross * vatPct;
  var net = gross - retention + vatAmount;
  var newId = nextId_('BIL');
  appendRow_('Billings', {
    id: newId,
    projectId: b.projectId,
    billingNo: b.billingNo + '-R',
    period: b.period,
    prevPct: prevPct,
    currentPct: pct,
    grossAmount: Math.round(gross * 100) / 100,
    retentionAmount: Math.round(retention * 100) / 100,
    netAmount: Math.round(net * 100) / 100,
    status: 'Pending',
    submittedBy: currentUserEmail_(),
    createdAt: new Date(),
    paidAt: ''
  });
  logActivity_('Billing ' + b.billingNo + ' superseded by client evaluation — revised to ' + pct + '% as ' + b.billingNo + '-R (₱' + fmtMoney_(net) + ' net), for approval', 'blue', newId);
  return { success: true, id: newId, billingNo: b.billingNo + '-R' };
}
/**
 * deleteBilling (v8) - Super Admin only. Removes a billing that is NOT
 * yet finalized (Pending only — Approved/Paid billings are financial
 * history and must never be deleted; Rejected/Superseded rows are kept
 * as an audit trail). Lets a wrongly-generated billing be redone
 * cleanly before any admin signs it... or after rejection via revise.
 */
function deleteBilling(id) {
  var me = currentUserEmail_().toLowerCase();
  var user = readAll_('Users').find(function (u) { return u.email.toLowerCase() === me; });
  if (!user || user.role !== 'superadmin') throw new Error('Only the Super Admin can delete a billing.');
  var b = readAll_('Billings').find(function (x) { return x.id === id; });
  if (!b) throw new Error('Billing not found.');
  if (b.status !== 'Pending') {
    throw new Error('Only PENDING billings can be deleted. "' + b.status + '" billings are kept as history (use Revise % instead).');
  }
  var rowNum = findRowNum_('Billings', 'id', id);
  if (rowNum > -1) sheet_('Billings').deleteRow(rowNum);
  logActivity_('Billing ' + (b.billingNo || id) + ' DELETED by Super Admin (was Pending)', 'a', id);
  return { success: true };
}
