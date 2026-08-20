import { all, first, run } from './db.js';
import { isSuperAdmin, logActivity, low, nowIso, num, requireRole } from './util.js';

/**
 * ONE DECISION ENGINE, N RESOLVABLE TYPES.
 *
 * Roughly ten request types share the same multi-signature workflow.
 * Adding a type means adding one entry here, not reimplementing
 * consensus — which is how the old backend avoided ten subtly
 * different approval rules.
 *
 * `pending` is the status that counts as awaiting a decision;
 * `approved`/`rejected` are what the row becomes. Comparisons are
 * case-insensitive because rows exist in both cases: older ones were
 * written 'Pending', newer ones 'pending'.
 */
const TYPES = {
  CashAdvance: { table: 'CashAdvanceRequests', submitter: 'requestorEmail', pending: 'pending', approved: 'Approved', rejected: 'Rejected', label: 'Cash advance request' },
  PurchaseRequest: { table: 'PurchaseRequests', submitter: 'requestorEmail', pending: 'pending', approved: 'Approved', rejected: 'Rejected', label: 'Purchase request' },
  CashRelease: { table: 'CashRelease', submitter: 'releasedBy', pending: 'for review', approved: 'Released', rejected: 'Rejected', label: 'Cash release record' },
  IncomingCash: { table: 'IncomingCashRequests', submitter: 'requestorEmail', pending: 'pending', approved: 'Approved', rejected: 'Rejected', label: 'Incoming cash request' },
  'Incoming Cash': { table: 'IncomingCashRequests', submitter: 'requestorEmail', pending: 'pending', approved: 'Approved', rejected: 'Rejected', label: 'Incoming cash request' },
  Liquidation: { table: 'Liquidations', submitter: 'requestorEmail', pending: 'pending', approved: 'Approved', rejected: 'Rejected', label: 'Liquidation record' },
  Material: { table: 'Materials', submitter: 'requestedBy', pending: 'pending', approved: 'approved', rejected: 'rejected', label: 'Material' },
  Equipment: { table: 'Equipment', submitter: 'requestedBy', pending: 'pending', approved: 'approved', rejected: 'rejected', label: 'Equipment' },
  Manpower: { table: 'Manpower', submitter: 'requestedBy', pending: 'pending', approved: 'approved', rejected: 'rejected', label: 'Manpower role' },
  DailyRecord: { table: 'DailyRecords', submitter: 'createdBy', pending: 'pending', approved: 'approved', rejected: 'rejected', label: 'Daily record' },
  Estimate: { table: 'EstimateGroups', submitter: 'submittedBy', pending: 'pending', approved: 'approved', rejected: 'draft', label: 'Estimate group' },
  Billing: { table: 'Billings', submitter: 'submittedBy', pending: 'pending', approved: 'Approved', rejected: 'Rejected', label: 'Billing' },
  OTRequest: { table: 'OTRequests', submitter: 'requestedBy', pending: 'pending', approved: 'Approved', rejected: 'Rejected', label: 'Overtime request' },
};

function typeOf(type) {
  const t = TYPES[type];
  if (!t) throw new Error('Unknown request type: ' + type);
  return t;
}

async function resolveItem(env, id, type) {
  const t = typeOf(type);
  const row = await first(env, `SELECT * FROM "${t.table}" WHERE id = ?`, id);
  if (!row) throw new Error(`${t.label} not found.`);
  return { t, row, isPending: low(row.status) === t.pending, submitter: low(row[t.submitter]) };
}

/** requiredSigners - every admin except whoever submitted it. */
async function requiredSigners(env, submitterEmail) {
  const rows = await all(env, "SELECT email FROM Users WHERE lower(role) = 'admin'");
  return rows.map((u) => low(u.email)).filter((e) => e && e !== low(submitterEmail));
}

async function allSignersApproved(env, id, submitterEmail) {
  const required = await requiredSigners(env, submitterEmail);
  if (!required.length) return true; // no other admins -> the first approval is final
  const rows = await all(env, "SELECT approver FROM Approvals WHERE requestId = ? AND decision = 'Approved'", id);
  const approvedBy = new Set(rows.map((a) => low(a.approver)));
  return required.every((e) => approvedBy.has(e));
}

async function hasDecided(env, id, approver) {
  const row = await first(env, 'SELECT approver FROM Approvals WHERE requestId = ? AND lower(approver) = ?', id, low(approver));
  return !!row;
}

async function finalize(env, identity, id, type, decision, meta) {
  const t = meta ? meta.t : typeOf(type);
  const approved = decision === 'Approved';
  const status = approved ? t.approved : t.rejected;
  await run(env, `UPDATE "${t.table}" SET status = ? WHERE id = ?`, status, id);

  // A paid/approved billing feeds the cash pipeline, mirroring what the
  // old BillingService did on final approval.
  await logActivity(env, identity.email, `${type} ${id} ${approved ? 'approved' : 'rejected'}.`, approved ? 'g' : 'a');
  return { success: true, status };
}

async function decideItem(env, identity, id, type, decision, isForce) {
  const approver = low(identity.email);

  // Some callers historically passed the SOW id for estimates instead of
  // the estimate GROUP id. Translate so signatures, finalisation and the
  // Approvals log all use the canonical group id.
  if (type === 'Estimate') {
    const direct = await first(env, 'SELECT id FROM EstimateGroups WHERE id = ?', id);
    if (!direct) {
      const bySow = await first(
        env,
        "SELECT id FROM EstimateGroups WHERE sowId = ? ORDER BY CASE WHEN lower(status) = 'pending' THEN 0 ELSE 1 END",
        id
      );
      if (bySow) id = bySow.id;
    }
  }

  const meta = await resolveItem(env, id, type);
  if (!meta.isPending) throw new Error(`That ${meta.t.label.toLowerCase()} is not awaiting a decision.`);

  // A force decision is by definition an override, so it is checked
  // BEFORE the self-approval guard — otherwise the guard fires for the
  // super admin too and the UI offers a button the server refuses.
  if (isForce) return finalize(env, identity, id, type, decision, meta);

  if (meta.submitter && meta.submitter === approver) {
    throw new Error('Self-approval is not allowed.');
  }

  if (await hasDecided(env, id, approver)) {
    throw new Error('You have already decided on this request.');
  }
  await run(
    env,
    "INSERT INTO Approvals (requestId, approver, decision, timestamp, remarks) VALUES (?, ?, ?, ?, '')",
    id, approver, decision, nowIso()
  );

  // One rejection rejects the whole item.
  if (decision === 'Rejected') return finalize(env, identity, id, type, 'Rejected', meta);

  if (await allSignersApproved(env, id, meta.submitter)) {
    return finalize(env, identity, id, type, 'Approved', meta);
  }

  await logActivity(env, identity.email, `${type} ${id} approved — awaiting other admins.`, 'blue');
  return { success: true, status: 'pending', awaiting: true };
}

export async function approveItem(env, identity, id, type) {
  requireRole(identity, ['superadmin', 'admin', 'approver'], 'approving a request');
  return decideItem(env, identity, id, type, 'Approved', false);
}

export async function rejectItem(env, identity, id, type) {
  requireRole(identity, ['superadmin', 'admin', 'approver'], 'rejecting a request');
  return decideItem(env, identity, id, type, 'Rejected', false);
}

export async function forceApprove(env, identity, id, type) {
  requireRole(identity, ['superadmin'], 'force-approving a request');
  return decideItem(env, identity, id, type, 'Approved', true);
}

export async function forceReject(env, identity, id, type) {
  requireRole(identity, ['superadmin'], 'force-rejecting a request');
  return decideItem(env, identity, id, type, 'Rejected', true);
}

// ─── Thin wrappers the frontend calls by their own names ───────

export const approveCashAdvance = (env, i, id) => approveItem(env, i, id, 'CashAdvance');
export const approveIncomingCash = (env, i, id) => approveItem(env, i, id, 'IncomingCash');
export const approveLiquidation = (env, i, id) => approveItem(env, i, id, 'Liquidation');
export const rejectLiquidation = (env, i, id) => rejectItem(env, i, id, 'Liquidation');
export const approveDailyRecord = (env, i, id) => approveItem(env, i, id, 'DailyRecord');
export const rejectDailyRecord = (env, i, id) => rejectItem(env, i, id, 'DailyRecord');
export const approvePurchaseOrder = (env, i, id) => approveItem(env, i, id, 'PurchaseRequest');

/**
 * reviewRelease - Cash Release keeps its own flow: several reviewers
 * sign the same record, and the money is only marked Released once the
 * required set has signed.
 */
export async function reviewRelease(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'reviewing a cash release');
  const row = await first(env, 'SELECT * FROM CashRelease WHERE id = ?', id);
  if (!row) throw new Error('Cash release record not found.');

  const me = low(identity.email);
  let reviewers;
  try {
    reviewers = JSON.parse(row.reviewedByJSON || '[]');
    if (!Array.isArray(reviewers)) reviewers = [];
  } catch { reviewers = []; }

  if (reviewers.map(low).includes(me)) throw new Error('You have already reviewed this release.');
  reviewers.push(me);

  const required = await requiredSigners(env, row.releasedBy);
  const done = required.length === 0 || required.every((e) => reviewers.map(low).includes(e));

  await run(
    env,
    'UPDATE CashRelease SET reviewedByJSON = ?, status = ?, releasedAt = ? WHERE id = ?',
    JSON.stringify(reviewers), done ? 'Released' : 'For Review',
    done ? nowIso() : (row.releasedAt || ''), id
  );
  await logActivity(env, identity.email, `Cash release ${id} reviewed${done ? ' and released' : ''}.`, done ? 'g' : 'blue');
  return { success: true, status: done ? 'Released' : 'For Review', awaiting: !done };
}

// ─── Variation orders and transfers use a simpler direct decision ──

export async function approveVariationOrder(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'approving a variation order');
  await run(env, "UPDATE VariationOrders SET status = 'Approved', decidedAt = ? WHERE id = ?", nowIso(), id);
  await logActivity(env, identity.email, `Variation order ${id} approved.`, 'g');
  return { success: true };
}

export async function rejectVariationOrder(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'rejecting a variation order');
  await run(env, "UPDATE VariationOrders SET status = 'Rejected', decidedAt = ? WHERE id = ?", nowIso(), id);
  await logActivity(env, identity.email, `Variation order ${id} rejected.`, 'a');
  return { success: true };
}

export async function approveTransfer(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'approving a transfer');
  await run(
    env, "UPDATE Transfers SET status = 'Approved', decidedBy = ?, decidedAt = ? WHERE id = ?",
    low(identity.email), nowIso(), id
  );
  await logActivity(env, identity.email, `Transfer ${id} approved.`, 'g');
  return { success: true };
}

export async function rejectTransfer(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'rejecting a transfer');
  await run(
    env, "UPDATE Transfers SET status = 'Rejected', decidedBy = ?, decidedAt = ? WHERE id = ?",
    low(identity.email), nowIso(), id
  );
  await logActivity(env, identity.email, `Transfer ${id} rejected.`, 'a');
  return { success: true };
}
