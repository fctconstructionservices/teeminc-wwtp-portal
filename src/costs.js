import { batchAll } from './db.js';
import { low, num, safeParse } from './util.js';

/**
 * THE COST BASIS — one definition of "what has this job cost".
 *
 * Two different actual-cost numbers on one screen is a bug users report
 * as "the system is wrong", and they would be right. Every surface that
 * needs cost (project page, finance, portfolio, CPI) goes through here.
 *
 * A release costs the greater of what was released and what was
 * liquidated against it: an under-liquidated advance still left the
 * account, and an over-liquidation means the job consumed more than was
 * advanced.
 */
export function releaseCost(rel, liqByCA) {
  const released = num(rel.amount);
  const liquidated = liqByCA.get(rel.originalRequestId) || 0;
  return Math.max(released, liquidated);
}

export function receiptCost(r) {
  const net = Number(r.netAmount);
  return Number.isFinite(net) && r.netAmount !== '' && r.netAmount !== null ? net : num(r.grossAmount);
}

/** costBasisAll - the raw rows every cost calculation is built from. */
export async function costBasisAll(env) {
  const [releases, liquidations, receipts] = await batchAll(env, [
    "SELECT * FROM CashRelease WHERE lower(status) = 'reviewed'",
    "SELECT * FROM Liquidations WHERE lower(status) = 'approved'",
    "SELECT * FROM Receipts WHERE lower(status) != 'cancelled'",
  ]);

  const liqByCA = new Map();
  for (const l of liquidations) {
    if (!l.cashAdvanceId) continue;
    liqByCA.set(l.cashAdvanceId, (liqByCA.get(l.cashAdvanceId) || 0) + num(l.amount));
  }
  return { releases, receipts, liqByCA };
}

/** actualCostByProject - accrued cost per project id. */
export function actualCostByProject(basis) {
  const out = new Map();
  const add = (pid, v) => out.set(pid, (out.get(pid) || 0) + v);
  for (const r of basis.releases) add(r.projectId, releaseCost(r, basis.liqByCA));
  for (const r of basis.receipts) add(r.projectId, receiptCost(r));
  for (const [k, v] of out) out.set(k, Math.round(v * 100) / 100);
  return out;
}

/** actualCostBySow - accrued cost per scope item, within one project. */
export function actualCostBySow(basis, projectId) {
  const out = new Map();
  const add = (sowId, v) => {
    const key = String(sowId || '');
    out.set(key, (out.get(key) || 0) + v);
  };
  for (const r of basis.releases) {
    if (r.projectId !== projectId) continue;
    add(r.sowId, releaseCost(r, basis.liqByCA));
  }
  for (const r of basis.receipts) {
    if (r.projectId !== projectId) continue;
    add(r.sowId, receiptCost(r));
  }
  return out;
}

/**
 * isLiveProject - a quotation or a lost bid sits in the Projects table
 * but is not a project. Counting one drags every average and forecast
 * toward zero, and puts a card on the dashboard for work nobody won.
 */
export function isLiveProject(p) {
  const s = low(p && p.status);
  return s !== 'quotation' && s !== 'lost';
}

/**
 * buildProgressIndex - each scope's reported progress over time, sorted,
 * so "what was complete as of date X" is a search rather than a rescan
 * of every daily record.
 */
export function buildProgressIndex(dailyRecords) {
  const bySow = new Map();
  for (const d of dailyRecords) {
    if (low(d.status) === 'rejected') continue;
    const day = String(d.date || '').slice(0, 10);
    if (!day) continue;
    for (const w of d.workAccomplished || []) {
      const key = String(w.scope || '');
      if (!key) continue;
      if (!bySow.has(key)) bySow.set(key, []);
      bySow.get(key).push({ day, pct: num(w.percentComplete) });
    }
  }
  for (const arr of bySow.values()) arr.sort((a, b) => (a.day < b.day ? -1 : 1));
  return bySow;
}

/** progressAsOf - the latest reported percentage on or before `cut`. */
export function progressAsOf(index, sowId, cut) {
  const arr = index.get(String(sowId));
  if (!arr || !arr.length) return 0;
  let best = 0;
  for (const e of arr) {
    if (e.day > cut) break;
    best = e.pct;
  }
  return Math.min(100, Math.max(0, best));
}

export { safeParse };
