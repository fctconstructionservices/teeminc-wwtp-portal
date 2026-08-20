import { batchAll } from './db.js';
import { actualCostByProject, costBasisAll, isLiveProject } from './costs.js';
import { dayOf, low, num, safeParse, safeParseArray } from './util.js';
import { buildProjectSeries } from './series.js';

function money(n) {
  return Math.round(num(n)).toLocaleString('en-PH');
}

export async function getFinanceData(env) {
  const [projectRows, incoming, releases, sowItems, cashAdv] = await batchAll(env, [
    'SELECT * FROM Projects',
    'SELECT * FROM IncomingCashRequests',
    'SELECT * FROM CashRelease',
    'SELECT * FROM SOWItems',
    'SELECT * FROM CashAdvanceRequests',
  ]);
  const basis = await costBasisAll(env);
  const costByProject = actualCostByProject(basis);

  const projects = projectRows.filter(isLiveProject);
  const liveIds = new Set(projects.map((p) => p.id));

  const approvedIn = incoming.filter((r) => low(r.status) === 'approved' && liveIds.has(r.projectId));
  const reviewedOut = releases.filter((r) => low(r.status) === 'reviewed' && liveIds.has(r.projectId));

  const totalRevenue = approvedIn.reduce((t, r) => t + num(r.amount), 0);
  const totalExpenses = reviewedOut.reduce((t, r) => t + num(r.amount), 0);
  const pendingCA = cashAdv.filter((r) => low(r.status) === 'pending');
  const pendingAmount = pendingCA.reduce((t, r) => t + num(r.amount), 0);

  const kpis = [
    { label: 'Total Revenue', value: '₱' + money(totalRevenue), sub: 'All projects', cls: 'good' },
    { label: 'Total Expenses', value: '₱' + money(totalExpenses), sub: 'All projects', cls: '' },
    { label: 'Cash Position', value: '₱' + money(totalRevenue - totalExpenses), sub: 'Revenue - Expenses', cls: 'good' },
    { label: 'Pending Requests', value: String(pendingCA.length), sub: '₱' + money(pendingAmount) + ' total', cls: 'warn' },
  ];

  // ── Cashflow across every live project, monthly AND weekly ──
  // Built by the same per-day spreading the project page uses, so the
  // two never disagree and the weekly toggle is a real re-bucketing
  // rather than the monthly figures relabelled.
  const estimateBySow = await estimateTotalsBySow(env);
  const scopeItems = sowItems
    .filter((s) => liveIds.has(s.projectId))
    .filter((s) => !(s.isTitle && String(s.isTitle) !== 'false'))
    .map((s) => ({
      id: `${s.projectId}::${s.id}`,
      startDate: dayOf(s.startDate),
      endDate: dayOf(s.endDate),
      budget: num(s.budget),
      estimateTotal: estimateBySow.get(`${s.projectId}::${s.id}`) || 0,
      voAdjustment: 0,
      progress: 0,
      isHeading: false,
      isMilestone: false,
    }));

  const pendingCommitments = cashAdv
    .filter((r) => low(r.status) === 'pending')
    .map((r) => ({ amount: num(r.amount), dateNeeded: dayOf(r.dateNeeded), createdAt: dayOf(r.createdAt) }));

  const spanDates = [];
  for (const r of approvedIn) spanDates.push(dayOf(r.transactionDate) || dayOf(r.createdAt));
  for (const r of reviewedOut) spanDates.push(dayOf(r.releasedAt) || dayOf(r.createdAt));
  for (const s of scopeItems) { spanDates.push(s.startDate); spanDates.push(s.endDate); }
  for (const p of projects) { spanDates.push(dayOf(p.startDate)); spanDates.push(dayOf(p.endDate)); }

  const seriesInput = {
    now: new Date(),
    sowItems: scopeItems,
    incoming: approvedIn,
    releases: reviewedOut,
    pendingRequests: pendingCommitments,
    progressIndex: new Map(),
    progressAsOf: () => 0,
    spanDates: spanDates.filter(Boolean),
    accruedCost: totalExpenses,
  };
  const monthlySeries = buildProjectSeries({ ...seriesInput, mode: 'monthly' });
  const weeklySeries = buildProjectSeries({ ...seriesInput, mode: 'weekly' });

  const cashflow = { ...monthlySeries.cashflow, weekly: weeklySeries.cashflow };

  // ── Budget vs actual, per live project ──
  const budgetByProject = new Map();
  for (const s of sowItems) {
    if (s.isTitle && String(s.isTitle) !== 'false') continue;
    budgetByProject.set(s.projectId, (budgetByProject.get(s.projectId) || 0) + num(s.budget));
  }
  const budgetVsActual = {
    labels: projects.map((p) => p.name),
    budget: projects.map((p) => Math.round(budgetByProject.get(p.id) || 0)),
    actual: projects.map((p) => Math.round(costByProject.get(p.id) || 0)),
  };

  // ── Spend breakdown by request type ──
  const typeGroups = {};
  for (const r of cashAdv) {
    if (!['released', 'approved'].includes(low(r.status))) continue;
    const payload = safeParse(r.payloadJSON, {}) || {};
    const key = payload.requestType || r.type || 'Other';
    typeGroups[key] = (typeGroups[key] || 0) + num(r.amount);
  }
  const bKeys = Object.keys(typeGroups);
  const bTotal = bKeys.reduce((t, k) => t + typeGroups[k], 0) || 1;
  const breakdown = {
    labels: bKeys.length ? bKeys : ['No data'],
    values: bKeys.length ? bKeys.map((k) => Math.round((typeGroups[k] / bTotal) * 100)) : [100],
  };

  // ── Liquidation aging: released advances not yet liquidated ──
  const liquidations = await batchAll(env, ['SELECT cashAdvanceId, amount, status FROM Liquidations']);
  const liqDone = new Map();
  for (const l of liquidations[0]) {
    if (low(l.status) === 'rejected') continue;
    liqDone.set(l.cashAdvanceId, (liqDone.get(l.cashAdvanceId) || 0) + num(l.amount));
  }
  const buckets = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 };
  const now = Date.now();
  for (const r of releases) {
    if (low(r.status) !== 'reviewed') continue;
    const remaining = num(r.amount) - (liqDone.get(r.originalRequestId) || 0);
    if (remaining <= 0.005) continue;
    const base = new Date(r.releasedAt || r.createdAt).getTime();
    const days = Number.isFinite(base) ? Math.floor((now - base) / 86400000) : 0;
    if (days <= 30) buckets['0-30 days'] += remaining;
    else if (days <= 60) buckets['31-60 days'] += remaining;
    else if (days <= 90) buckets['61-90 days'] += remaining;
    else buckets['90+ days'] += remaining;
  }
  const aging = { labels: Object.keys(buckets), values: Object.values(buckets).map(Math.round) };

  const costStatus = projects.map((p) => {
    const budget = budgetByProject.get(p.id) || 0;
    const actual = costByProject.get(p.id) || 0;
    const pct = budget > 0 ? (actual / budget) * 100 : 0;
    return {
      project: p.name,
      budget: Math.round(budget),
      actual: Math.round(actual),
      status: pct >= 100 ? 'Over Budget' : pct >= 85 ? 'At Risk' : 'On Track',
      cls: pct >= 100 ? 'danger' : pct >= 85 ? 'warn' : 'good',
    };
  });

  return { kpis, cashflow, budgetVsActual, breakdown, aging, costStatus };
}

function supplierTermsLabel(days) {
  const d = parseInt(days, 10);
  if (!d) return 'Cash on delivery';
  return d + ' days from delivery';
}

export async function getPayables(env) {
  const [invoiceRows, receipts, suppliers, projects] = await batchAll(env, [
    'SELECT * FROM SupplierInvoices',
    "SELECT * FROM Receipts WHERE lower(status) != 'cancelled'",
    'SELECT id, name, termsDays FROM Suppliers',
    'SELECT id, name FROM Projects',
  ]);

  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const r2 = (n) => Math.round(n * 100) / 100;

  const invoices = invoiceRows
    .filter((i) => low(i.status) !== 'cancelled')
    .map((i) => {
      const s = supplierById.get(i.supplierId) || {};
      const balance = r2(num(i.grossAmount) - num(i.paidAmount));
      const due = i.dueDate ? new Date(i.dueDate) : null;
      let daysToDue = null;
      let bucket;
      if (due && !Number.isNaN(due.getTime())) {
        due.setHours(0, 0, 0, 0);
        daysToDue = Math.round((due - today) / 86400000);
        bucket = balance <= 0.005 ? 'paid'
          : daysToDue < 0 ? 'overdue'
            : daysToDue <= 7 ? 'week'
              : daysToDue <= 30 ? 'month' : 'later';
      } else {
        bucket = balance <= 0.005 ? 'paid' : 'later';
      }
      return {
        ...i,
        balance,
        supplierName: s.name || i.supplierId,
        termsLabel: supplierTermsLabel(s.termsDays),
        projectName: projectName.get(i.projectId) || i.projectId,
        payments: safeParseArray(i.paymentsJSON),
        receiptIds: safeParseArray(i.receiptIdsJSON),
        daysToDue,
        bucket,
      };
    });

  // Received but not yet invoiced — the other half of what is owed.
  const invoiced = new Set();
  for (const i of invoices) for (const rid of i.receiptIds) invoiced.add(rid);
  const uninvoiced = receipts
    .filter((r) => !invoiced.has(r.id))
    .map((r) => ({
      ...r,
      balance: r2(num(r.grossAmount)),
      supplierName: (supplierById.get(r.supplierId) || {}).name || r.supplierId,
      projectName: projectName.get(r.projectId) || r.projectId,
      lines: safeParseArray(r.linesJSON),
    }));

  const open = invoices.filter((i) => i.balance > 0.005);
  const sum = (list) => r2(list.reduce((t, x) => t + num(x.balance), 0));

  return {
    invoices: invoices.sort((a, b) => {
      if (a.balance <= 0.005 && b.balance > 0.005) return 1;
      if (b.balance <= 0.005 && a.balance > 0.005) return -1;
      return String(a.dueDate).localeCompare(String(b.dueDate));
    }),
    uninvoiced: uninvoiced.sort((a, b) => String(a.receiptDate).localeCompare(String(b.receiptDate))),
    summary: {
      overdue: sum(open.filter((i) => i.bucket === 'overdue')),
      overdueCount: open.filter((i) => i.bucket === 'overdue').length,
      dueWeek: sum(open.filter((i) => i.bucket === 'week')),
      dueWeekCount: open.filter((i) => i.bucket === 'week').length,
      dueMonth: sum(open.filter((i) => i.bucket === 'month')),
      outstanding: sum(open),
      openCount: open.length,
      supplierCount: new Set(open.map((i) => i.supplierId)).size,
      uninvoiced: sum(uninvoiced),
      uninvoicedCount: uninvoiced.length,
    },
  };
}

/**
 * estimateTotalsBySow - approved estimate value per project::sow.
 *
 * The finance projection prices scheduled work at what it was ESTIMATED
 * to cost, not what it was budgeted, because the budget is an internal
 * allowance that many scopes never get.
 */
async function estimateTotalsBySow(env) {
  const [groups, mats, labor, equip, indirect] = await batchAll(env, [
    "SELECT id, projectId, sowId FROM EstimateGroups WHERE lower(status) = 'approved'",
    "SELECT groupId, cost FROM EstimateMaterials WHERE groupId IN (SELECT id FROM EstimateGroups WHERE lower(status) = 'approved')",
    "SELECT groupId, cost FROM EstimateLabor WHERE groupId IN (SELECT id FROM EstimateGroups WHERE lower(status) = 'approved')",
    "SELECT groupId, cost FROM EstimateEquipment WHERE groupId IN (SELECT id FROM EstimateGroups WHERE lower(status) = 'approved')",
    "SELECT groupId, amount FROM EstimateIndirect WHERE groupId IN (SELECT id FROM EstimateGroups WHERE lower(status) = 'approved')",
  ]);

  const byGroup = new Map();
  const add = (rows, key) => {
    for (const r of rows) byGroup.set(r.groupId, (byGroup.get(r.groupId) || 0) + num(r[key]));
  };
  add(mats, 'cost'); add(labor, 'cost'); add(equip, 'cost'); add(indirect, 'amount');

  const out = new Map();
  for (const g of groups) {
    const key = `${g.projectId}::${g.sowId}`;
    out.set(key, (out.get(key) || 0) + (byGroup.get(g.id) || 0));
  }
  return out;
}
