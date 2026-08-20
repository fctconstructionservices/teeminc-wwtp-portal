import { batchAll } from './db.js';
import { isLiveProject } from './costs.js';

function safeParseArray(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function formatLogTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function ring(value, fraction, label, color) {
  const circumference = 100.5;
  const clamped = Math.max(0, Math.min(1, fraction));
  return { value, label, color, dashOffset: circumference * (1 - clamped) };
}

/** sumByProject - turn a GROUP BY projectId result into a lookup. */
function sumByProject(rows) {
  const map = new Map();
  for (const r of rows) map.set(String(r.projectId), Number(r.total) || 0);
  return map;
}

const PENDING_REQUEST_SOURCES = [
  ['CashAdvanceRequests', 'requestor', 'amount'],
  ['CashRelease', 'requestor', 'amount'],
  ['IncomingCashRequests', 'requestor', 'amount'],
  ['Liquidations', 'requestor', 'amount'],
  ['PurchaseRequests', 'requestor', 'totalAmount'],
  ['Billings', 'submittedBy', 'grossAmount'],
];

const PENDING_REQUEST_SQL = PENDING_REQUEST_SOURCES.map(
  ([table, requestorCol, amountCol]) =>
    `SELECT id, projectId, "${requestorCol}" AS requestor, "${amountCol}" AS amount, status FROM "${table}" WHERE lower(status) = 'pending'`
);

export async function getHomeDataCached(env, _identity) {
  // Projects.revenue/expenses/cashPosition are never written back in the
  // source data — the old backend derived them from the money-movement
  // tables on every read. Do the same, but as three GROUP BY aggregates
  // rather than three queries per project, and send the whole dashboard
  // as a single batch so it costs one round trip instead of ~26.
  const [
    projectRows, billedRows, incomingRows, releasedRows, logRows, ...pendingResults
  ] = await batchAll(env, [
    "SELECT id, name, status, editorsJSON FROM Projects WHERE archivedAt IS NULL OR archivedAt = '' ORDER BY name",
    "SELECT projectId, SUM(netAmount) AS total FROM Billings WHERE lower(status) = 'paid' GROUP BY projectId",
    "SELECT projectId, SUM(amount) AS total FROM IncomingCashRequests WHERE lower(status) = 'approved' GROUP BY projectId",
    "SELECT projectId, SUM(amount) AS total FROM CashRelease WHERE lower(status) IN ('released', 'reviewed') GROUP BY projectId",
    'SELECT text, type, timestamp FROM ActivityLog ORDER BY timestamp DESC LIMIT 20',
    ...PENDING_REQUEST_SQL,
    // Finance Overview tiles — appended last, peeled off below.
    "SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM CashAdvanceRequests WHERE lower(status) = 'pending'",
    "SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM CashRelease WHERE lower(status) IN ('pending', 'for review')",
    "SELECT originalRequestId, amount FROM CashRelease WHERE lower(status) = 'reviewed'",
    "SELECT cashAdvanceId, amount FROM Liquidations WHERE lower(status) != 'rejected'",
  ]);

  const liqRows = pendingResults.pop();
  const reviewedReleases = pendingResults.pop();
  const pendingReleaseRow = pendingResults.pop()[0] || { n: 0, total: 0 };
  const pendingApprovalRow = pendingResults.pop()[0] || { n: 0, total: 0 };

  const billed = sumByProject(billedRows);
  const incoming = sumByProject(incomingRows);
  const released = sumByProject(releasedRows);

  // A quotation or a lost bid lives in the Projects table but is not a
  // project — showing one as a dashboard card puts work nobody won in
  // front of everyone, and drags the gauges toward zero.
  const projects = projectRows.filter(isLiveProject).map((p) => {
    const id = String(p.id);
    const revenue = (billed.get(id) || 0) + (incoming.get(id) || 0);
    const expenses = released.get(id) || 0;
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      revenue,
      expenses,
      cashPosition: revenue - expenses,
      editors: safeParseArray(p.editorsJSON),
    };
  });

  const pendingRequests = pendingResults.flat();

  // ── Finance Overview ──
  // Counting projects here said nothing about money; these four are the
  // questions actually being asked of the dashboard: what is waiting on
  // me, what is waiting to be paid out, what has gone unliquidated too
  // long, and how much is actually left.
  const liquidated = new Map();
  for (const l of liqRows) {
    if (!l.cashAdvanceId) continue;
    liquidated.set(l.cashAdvanceId, (liquidated.get(l.cashAdvanceId) || 0) + Number(l.amount || 0));
  }
  const overdueLiq = reviewedReleases.reduce((t, r) => {
    const remaining = Number(r.amount || 0) - (liquidated.get(r.originalRequestId) || 0);
    return remaining > 0.005 ? t + remaining : t;
  }, 0);

  const liquidCash = projects.reduce((t, p) => t + p.cashPosition, 0);
  const peso = (n) => '₱' + Math.round(n).toLocaleString('en-PH');

  const gauges = [
    ring(Number(pendingApprovalRow.n) || 0, Math.min((Number(pendingApprovalRow.n) || 0) / 10, 1), 'Pending Approval', '#c2860f'),
    ring(Number(pendingReleaseRow.n) || 0, Math.min((Number(pendingReleaseRow.n) || 0) / 10, 1), 'Pending Release', '#e15412'),
    ring(peso(overdueLiq), overdueLiq > 0 ? 1 : 0, 'Overdue for Liquidation', '#b23a2e'),
    ring(peso(liquidCash), liquidCash > 0 ? 1 : 0, 'Liquid Cash', '#2f7a46'),
  ];

  const logs = logRows.map((r) => ({ text: r.text, type: r.type, time: formatLogTime(r.timestamp) }));

  return { projects, gauges, pendingRequests, logs };
}

const PENDING_APPROVAL_SOURCES = [
  ['cashAdvances', "SELECT * FROM CashAdvanceRequests WHERE lower(status) = 'pending'"],
  ['releases', "SELECT * FROM CashRelease WHERE lower(status) = 'pending'"],
  ['incomingCash', "SELECT * FROM IncomingCashRequests WHERE lower(status) = 'pending'"],
  ['liquidations', "SELECT * FROM Liquidations WHERE lower(status) = 'pending'"],
  ['materials', "SELECT * FROM Materials WHERE lower(status) = 'pending'"],
  ['equipment', "SELECT * FROM Equipment WHERE lower(status) = 'pending'"],
  ['manpower', "SELECT * FROM Manpower WHERE lower(status) = 'pending'"],
  ['estimates', "SELECT * FROM EstimateGroups WHERE lower(status) IN ('pending', 'submitted')"],
  ['billings', "SELECT * FROM Billings WHERE lower(status) = 'pending'"],
  ['dailyRecords', "SELECT * FROM DailyRecords WHERE lower(status) = 'pending'"],
  ['otRequests', "SELECT * FROM OTRequests WHERE lower(status) = 'pending'"],
  ['purchaseRequests', "SELECT * FROM PurchaseRequests WHERE lower(status) = 'pending'"],
];

export async function getPendingApprovals(env, _identity) {
  const results = await batchAll(env, PENDING_APPROVAL_SOURCES.map(([, sql]) => sql));
  const out = {};
  PENDING_APPROVAL_SOURCES.forEach(([key], i) => { out[key] = results[i]; });
  return out;
}
