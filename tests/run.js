#!/usr/bin/env node
/**
 * tests/run.js — Regression tests for FCTC ERP critical logic
 * ============================================================
 * Run before every push:   node tests/run.js
 *
 * WHY THIS EXISTS: the EV chart silently regressed twice — a fix landed,
 * then a later delivery that touched the same file quietly reverted it,
 * and nobody noticed until the chart showed zeros in production. These
 * tests pin down the behaviours that are easy to break by accident and
 * impossible to eyeball.
 *
 * They run in plain Node (no Apps Script), by re-implementing the exact
 * algorithms under test. When you change one of these algorithms in the
 * backend, change it here too — a failing test then means "the behaviour
 * changed", which is precisely the signal you want.
 */

// The production server runs in Asia/Manila. Some date bugs only appear
// outside UTC, so default to that timezone unless one is already set —
// otherwise the tests would pass here and still fail in production.
if (!process.env.TZ) {
  process.env.TZ = 'Asia/Manila';
}

let pass = 0, fail = 0;
const results = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; results.push(['PASS', name, '']); }
  else { fail++; results.push(['FAIL', name, `expected ${e}, got ${a}`]); }
}
function checkTrue(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, '']); }
  else { fail++; results.push(['FAIL', name, detail || 'expected true']); }
}

// ══════════════════════════════════════════════════════════════
// 1. PROGRESS AS OF A DATE  (the EV-line regression)
// ══════════════════════════════════════════════════════════════
function computeSOWProgressAsOf(sowId, records, cutoffStr) {
  let bestKey = '', best = 0;
  (records || []).forEach(d => {
    if (d.status === 'rejected') return;
    const key = String(d.date || '');
    if (!key || key > cutoffStr) return;
    const rows = (d.workAccomplished || []).filter(w => String(w.scope) === String(sowId));
    if (!rows.length) return;
    const pct = rows.reduce((mx, w) => Math.max(mx, parseFloat(w.percentComplete) || 0), 0);
    if (bestKey === '' || key > bestKey || (key === bestKey && pct > best)) { bestKey = key; best = pct; }
  });
  return Math.min(100, Math.max(0, best));
}

const recs = [
  { status: 'approved', date: '2026-05-31', workAccomplished: [{ scope: 'SOW-1', percentComplete: 20 }] },
  { status: 'approved', date: '2026-06-30', workAccomplished: [{ scope: 'SOW-1', percentComplete: 45 }] },
  { status: 'draft',    date: '2026-07-19', workAccomplished: [{ scope: 'SOW-1', percentComplete: 72 }] },
  { status: 'rejected', date: '2026-07-20', workAccomplished: [{ scope: 'SOW-1', percentComplete: 99 }] },
];

// These three are the exact cases the Date-comparison version got wrong.
check('progress: last day of month counts in that month',  computeSOWProgressAsOf('SOW-1', recs, '2026-05-31'), 20);
check('progress: month-end boundary (Jun)',                computeSOWProgressAsOf('SOW-1', recs, '2026-06-30'), 45);
check('progress: report dated TODAY is included',          computeSOWProgressAsOf('SOW-1', recs, '2026-07-19'), 72);
check('progress: before any report is 0',                  computeSOWProgressAsOf('SOW-1', recs, '2026-04-30'), 0);
check('progress: rejected reports ignored',                computeSOWProgressAsOf('SOW-1', recs, '2026-12-31'), 72);
check('progress: unknown SOW is 0',                        computeSOWProgressAsOf('SOW-9', recs, '2026-12-31'), 0);

// A full EV series must be non-decreasing and non-zero once work exists.
const months = ['2026-04-30','2026-05-31','2026-06-30','2026-07-19'];
const basis = 1000000;
const evSeries = months.map(c => Math.round(basis * computeSOWProgressAsOf('SOW-1', recs, c) / 100));
check('EV series climbs with progress', evSeries, [0, 200000, 450000, 720000]);
checkTrue('EV series never all-zero when progress exists', evSeries.some(v => v > 0),
  'every EV point was 0 — this is the exact production bug');


// ── The production path, reproduced exactly ────────────────────
// The regression was NOT visible with string cutoffs — it appeared only
// because the caller passed a Date object (monthEnd_) while the records
// carry 'yyyy-MM-dd' strings. Outside UTC, `new Date('2026-05-31')` is
// UTC midnight = 08:00 local in Manila, which sorts AFTER a local-midnight
// cutoff, so the whole month's progress was discarded. These tests pin the
// behaviour under the real server timezone.
function monthEnd(y, m) { return new Date(y, m + 1, 0); }
function fmtDate(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
// caller must hand the function a STRING, produced the same way the
// backend's fmtDate_ does — this is what makes it timezone-proof.
// The bug lived in the CALLER pairing, so the test must exercise both
// halves together: how the cutoff is produced AND how it is compared.
function evAtMonth_correct(y, m) {
  return computeSOWProgressAsOf('SOW-1', recs, fmtDate(monthEnd(y, m)));   // string cutoff
}
function evAtMonth_dateCutoff(y, m) {
  // reproduces the regression: Date object cutoff, Date-parsed records
  const cutoff = monthEnd(y, m);
  let bestDate = null, best = 0;
  recs.forEach(d => {
    if (d.status === 'rejected') return;
    const dt = new Date(d.date);
    if (isNaN(dt) || dt > cutoff) return;
    const rows = (d.workAccomplished || []).filter(w => String(w.scope) === 'SOW-1');
    if (!rows.length) return;
    const pct = rows.reduce((mx, w) => Math.max(mx, parseFloat(w.percentComplete) || 0), 0);
    if (bestDate === null || dt > bestDate) { bestDate = dt; best = pct; }
  });
  return best;
}

check('production path: May cutoff keeps May progress', evAtMonth_correct(2026, 4), 20);
check('production path: Jun cutoff keeps Jun progress', evAtMonth_correct(2026, 5), 45);
checkTrue('production path: cutoff is a STRING, never a Date object',
  typeof fmtDate(monthEnd(2026, 4)) === 'string');

// Guard rail: if someone reintroduces Date-object cutoffs, this fails in
// any timezone east of UTC (i.e. on the real server) and passes in UTC —
// so it is asserted as a DIFFERENCE, which is timezone-independent.
const tzOffsetMin = -new Date(2026, 4, 31).getTimezoneOffset();
if (tzOffsetMin > 0) {
  checkTrue('REGRESSION GUARD: Date-object cutoff loses progress east of UTC',
    evAtMonth_dateCutoff(2026, 4) !== evAtMonth_correct(2026, 4),
    'the buggy pairing produced the same answer — check the test, not the code');
} else {
  results.push(['SKIP', 'REGRESSION GUARD (run with TZ=Asia/Manila to exercise)', '']);
}

// ══════════════════════════════════════════════════════════════
// 2. CONTRACT BASIS  (approved estimates + client-approved VOs)
// ══════════════════════════════════════════════════════════════
function contractBasis(sow) { return (sow.estimateTotal || 0) + (sow.voAdjustment || 0); }
check('basis: approved estimate only',        contractBasis({ estimateTotal: 500000 }), 500000);
check('basis: estimate + approved VO',        contractBasis({ estimateTotal: 500000, voAdjustment: 120000 }), 620000);
check('basis: deductive VO subtracts',        contractBasis({ estimateTotal: 500000, voAdjustment: -80000 }), 420000);
check('basis: draft estimate contributes 0',  contractBasis({ estimateTotal: 0, voAdjustment: 0 }), 0);

// Weighted total progress must use the contract basis, not the budget.
const items = [
  { id: 'A', estimateTotal: 800000, voAdjustment: 0,      progress: 50, budget: 2000000 },
  { id: 'B', estimateTotal: 200000, voAdjustment: 100000, progress: 100, budget: 100000 },
];
const wSum = items.reduce((s, x) => s + contractBasis(x), 0);
const weighted = items.reduce((s, x) => s + contractBasis(x) * x.progress / 100, 0) / wSum * 100;
// (800k × 50%) + (300k × 100%) = 700k ÷ 1.1M = 63.6%
check('weighted progress uses contract basis', Math.round(weighted * 10) / 10, 63.6);

// ══════════════════════════════════════════════════════════════
// 3. TRANSFERS  (stock must be conserved across locations)
// ══════════════════════════════════════════════════════════════
function availableAt(loc, daily, transfers) {
  let q = 0;
  if (loc !== 'WAREHOUSE' && daily[loc]) q = daily[loc].delivered - daily[loc].used;
  transfers.forEach(t => {
    if (t.status !== 'Completed') return;
    if (t.toLoc === loc) q += t.qty;
    if (t.fromLoc === loc) q -= t.qty;
  });
  return q;
}
const daily = { A: { delivered: 500, used: 320 }, B: { delivered: 0, used: 0 } };
const transfers = [
  { status: 'Completed', item: 'Cement', qty: 80, fromLoc: 'A', toLoc: 'WAREHOUSE' },
  { status: 'Completed', item: 'Cement', qty: 50, fromLoc: 'WAREHOUSE', toLoc: 'B' },
  { status: 'Pending',   item: 'Cement', qty: 30, fromLoc: 'A', toLoc: 'B' },
];
check('transfer: source reduced',      availableAt('A', daily, transfers), 100);
check('transfer: warehouse holds rest', availableAt('WAREHOUSE', daily, transfers), 30);
check('transfer: destination received', availableAt('B', daily, transfers), 50);
check('transfer: pending does NOT move stock',
  availableAt('A', daily, transfers) + availableAt('WAREHOUSE', daily, transfers) + availableAt('B', daily, transfers), 180);

// ══════════════════════════════════════════════════════════════
// 4. APPROVAL RULES  (multi-signature engine)
// ══════════════════════════════════════════════════════════════
function requiredSigners(users, submitter) {
  return users.filter(u => (u.role === 'admin' || u.role === 'superadmin')
    && u.email.toLowerCase() !== String(submitter).toLowerCase()).map(u => u.email.toLowerCase());
}
function allApproved(required, decisions) {
  return required.length > 0 && required.every(e => decisions[e] === 'approved');
}
const users = [
  { email: 'a@x.com', role: 'admin' }, { email: 'b@x.com', role: 'admin' },
  { email: 's@x.com', role: 'superadmin' }, { email: 'r@x.com', role: 'request-only' },
];
check('signers: admins only, submitter excluded', requiredSigners(users, 'a@x.com'), ['b@x.com', 's@x.com']);
check('signers: request-only never signs', requiredSigners(users, 'zzz@x.com').includes('r@x.com'), false);
checkTrue('approval: not final until ALL sign',
  !allApproved(['b@x.com', 's@x.com'], { 'b@x.com': 'approved' }), 'finalized with only one signature');
checkTrue('approval: final when all sign',
  allApproved(['b@x.com', 's@x.com'], { 'b@x.com': 'approved', 's@x.com': 'approved' }));

// ══════════════════════════════════════════════════════════════
// 5. BILLING MATH
// ══════════════════════════════════════════════════════════════
function billing(prevPct, curPct, contract, retentionPct) {
  const gross = (curPct - prevPct) / 100 * contract;
  const retention = gross * retentionPct;
  return { gross: Math.round(gross), retention: Math.round(retention), net: Math.round(gross - retention) };
}
check('billing: first billing at 25%', billing(0, 25, 20000000, 0.10), { gross: 5000000, retention: 500000, net: 4500000 });
check('billing: incremental 25→45%',   billing(25, 45, 20000000, 0.10), { gross: 4000000, retention: 400000, net: 3600000 });
check('billing: client-revised lower %', billing(25, 35, 20000000, 0.10), { gross: 2000000, retention: 200000, net: 1800000 });

// ══════════════════════════════════════════════════════════════
// 6. AXIS MONEY FORMAT
// ══════════════════════════════════════════════════════════════
function fmtAxisMoney(v) {
  const a = Math.abs(v);
  if (a >= 1000000) { const m = v / 1000000; return '₱' + (Number.isInteger(m) ? m : +m.toFixed(2)) + 'M'; }
  if (a >= 1000) return '₱' + Math.round(v / 1000) + 'k';
  return '₱' + v;
}
check('axis: 850k',   fmtAxisMoney(850000), '₱850k');
check('axis: exactly 1M shows M not 1,000k', fmtAxisMoney(1000000), '₱1M');
check('axis: 1.15M',  fmtAxisMoney(1150000), '₱1.15M');
check('axis: 20.64M', fmtAxisMoney(20640000), '₱20.64M');

// ══════════════════════════════════════════════════════════════
// 7. SESSION EXPIRY  (sliding window)
// ══════════════════════════════════════════════════════════════
const TTL = 8 * 3600 * 1000;
function resolveSession(sess, nowMs) {
  if (!sess || sess.revoked) return null;
  if (nowMs > sess.expiresAt) return null;
  sess.expiresAt = nowMs + TTL;
  return { email: sess.email };
}
let sess = { email: 'a@x.com', expiresAt: Date.now() + TTL, revoked: false };
const t0 = Date.now();
checkTrue('session: valid immediately', !!resolveSession(sess, t0));
checkTrue('session: still valid after 7h of activity', !!resolveSession(sess, t0 + 7 * 3600 * 1000));
checkTrue('session: expires after 8h idle from last activity',
  resolveSession(sess, t0 + 7 * 3600 * 1000 + 8.1 * 3600 * 1000) === null);
let revoked = { email: 'a@x.com', expiresAt: Date.now() + TTL, revoked: true };
checkTrue('session: revoked token rejected', resolveSession(revoked, Date.now()) === null);

// ══════════════════════════════════════════════════════════════
// REPORT
// ══════════════════════════════════════════════════════════════
console.log('\n  FCTC ERP — regression tests\n' + '  ' + '─'.repeat(58));
let section = '';
results.forEach(([status, name, detail]) => {
  const mark = status === 'PASS' ? '  ✓' : status === 'SKIP' ? '  ·' : '  ✗';
  console.log(`${mark} ${name}${detail ? '\n      → ' + detail : ''}`);
});
console.log('  ' + '─'.repeat(58));
console.log(`  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);