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

  var gross = (pct - prevPct) / 100 * revised;
  var retention = gross * rp;
  var net = gross - retention;

  var billingNo = 'PB-' + ('0000' + (existing.length + 1)).slice(-4);
  var id = nextId_('BIL');
  appendRow_('Billings', {
    id: id,
    projectId: projectId,
    billingNo: billingNo,
    period: period || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM yyyy'),
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
  logActivity_('Progress billing ' + billingNo + ' (₱' + fmtMoney_(net) + ' net) generated for ' + projectId + ' — for approval', 'blue', id);
  return { success: true, id: id, billingNo: billingNo, net: net };
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
    description: 'Collection — ' + b.billingNo + ' (' + b.period + ', ' + b.currentPct + '% accomplishment)',
    paymentMethod: 'Billing Collection',
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

  var gross = (pct - prevPct) / 100 * revised;
  var retention = gross * rp;
  var net = gross - retention;
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