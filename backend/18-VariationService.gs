/**
 * 18-VariationService.gs — Variation Orders (v6)
 *
 * FLOW: request → 'For Client' → admin/superadmin records the client's
 * decision → 'Client-Approved' or 'Rejected'.
 *
 * EFFECT (non-destructive, computed live in getProjectData):
 *   · Client-Approved VO amounts are ADDED to the affected SOW item's
 *     budget (deductive VOs subtract), so weights, EVM and billings all
 *     follow automatically.
 *   · The revised contract value (contractValue + approved VOs) is what
 *     the Billings tab bills against.
 * Nothing is overwritten on the SOW row itself, so budgetMode recomputes
 * never fight the adjustment.
 */

function requestVariationOrder(projectId, data) {
  assertProjectEditor_(projectId);   // v6.6
  // v6.3 gate: a VO modifies the contract, so the base contract must be
  // fully defined first (all estimates approved, all budgets set).
  assertContractReady_(projectId, 'submit a variation order');

  var sowId = String(data && data.sowId || '').trim();
  var description = String(data && data.description || '').trim();
  var amount = parseFloat(data && data.amount);
  if (!sowId) throw new Error('Affected SOW item is required.');
  if (!description) throw new Error('Description is required.');
  if (isNaN(amount) || amount === 0) throw new Error('Amount is required (negative for deductive VOs).');

  var sow = readAll_('SOWItems').find(function (s) { return s.id === sowId && s.projectId === projectId; });
  if (!sow) throw new Error('SOW item not found in this project.');

  var id = nextId_('VO');
  appendRow_('VariationOrders', {
    id: id,
    projectId: projectId,
    sowId: sowId,
    description: description,
    amount: Math.round(amount * 100) / 100,
    status: 'For Client',
    requestedBy: currentUserEmail_(),
    createdAt: new Date(),
    decidedAt: ''
  });
  logActivity_('Variation order ' + id + ' (' + (amount >= 0 ? '+' : '') + '₱' + fmtMoney_(amount) + ', ' + sowId + ') submitted for client approval', 'blue', id);
  return { success: true, id: id };
}

function decideVariationOrder_(id, decision) {
  var user = readAll_('Users').find(function (u) {
    return u.email.toLowerCase() === currentUserEmail_().toLowerCase();
  });
  if (!user || (user.role !== 'superadmin' && user.role !== 'admin')) {
    throw new Error('Only admins can record the client decision.');
  }
  var vo = readAll_('VariationOrders').find(function (v) { return v.id === id; });
  if (!vo) throw new Error('Variation order not found.');
  if (vo.status !== 'For Client') throw new Error('Variation order is not awaiting the client.');

  updateRow_('VariationOrders', 'id', id, { status: decision, decidedAt: new Date() });
  logActivity_('Variation order ' + id + ' ' + decision + (decision === 'Client-Approved' ? ' — SOW ' + vo.sowId + ' budget and contract value adjusted' : ''), decision === 'Client-Approved' ? 'g' : 'a', id);
  return { success: true, status: decision };
}

function approveVariationOrder(id) { return decideVariationOrder_(id, 'Client-Approved'); }
function rejectVariationOrder(id) { return decideVariationOrder_(id, 'Rejected'); }