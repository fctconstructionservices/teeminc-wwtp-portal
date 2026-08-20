import { batchAll } from './db.js';
import { actualCostByProject, buildProgressIndex, costBasisAll, isLiveProject, progressAsOf } from './costs.js';
import { dayOf, low, num, safeParseArray, today } from './util.js';

const STALE_DAYS = 7;

export async function getPortfolioDataCached(env) {
  const [projectRows, clients, sowItems, dailyRows, billings, incoming, releases, vos, groups] =
    await batchAll(env, [
      'SELECT * FROM Projects',
      'SELECT id, name FROM ClientLists',
      'SELECT * FROM SOWItems',
      "SELECT projectId, date, status, workAccomplishedJSON FROM DailyRecords WHERE deletedAt IS NULL OR deletedAt = ''",
      'SELECT projectId, grossAmount, netAmount, status FROM Billings',
      'SELECT projectId, amount, status, sourceType FROM IncomingCashRequests',
      'SELECT projectId, amount, status FROM CashRelease',
      "SELECT projectId, sowId, amount, status FROM VariationOrders WHERE lower(status) = 'approved'",
      'SELECT id, projectId, sowId, status FROM EstimateGroups',
    ]);

  const basis = await costBasisAll(env);
  const costByProject = actualCostByProject(basis);

  // Estimate value per group, for the contract-basis earned value.
  const approvedGroupIds = groups.filter((g) => low(g.status) === 'approved').map((g) => g.id);
  const estimateBySow = new Map();
  if (approvedGroupIds.length) {
    const ph = approvedGroupIds.map(() => '?').join(',');
    const [mats, labor, equip, indirect] = await batchAll(env, [
      [`SELECT groupId, cost FROM EstimateMaterials WHERE groupId IN (${ph})`, ...approvedGroupIds],
      [`SELECT groupId, cost FROM EstimateLabor WHERE groupId IN (${ph})`, ...approvedGroupIds],
      [`SELECT groupId, cost FROM EstimateEquipment WHERE groupId IN (${ph})`, ...approvedGroupIds],
      [`SELECT groupId, amount FROM EstimateIndirect WHERE groupId IN (${ph})`, ...approvedGroupIds],
    ]);
    const totalByGroup = new Map();
    const add = (rows, key) => {
      for (const r of rows) totalByGroup.set(r.groupId, (totalByGroup.get(r.groupId) || 0) + num(r[key]));
    };
    add(mats, 'cost'); add(labor, 'cost'); add(equip, 'cost'); add(indirect, 'amount');
    for (const g of groups) {
      if (low(g.status) !== 'approved') continue;
      const key = `${g.projectId}::${g.sowId}`;
      estimateBySow.set(key, (estimateBySow.get(key) || 0) + (totalByGroup.get(g.id) || 0));
    }
  }

  const voBySow = new Map();
  const voByProject = new Map();
  for (const v of vos) {
    voBySow.set(`${v.projectId}::${v.sowId}`, (voBySow.get(`${v.projectId}::${v.sowId}`) || 0) + num(v.amount));
    voByProject.set(v.projectId, (voByProject.get(v.projectId) || 0) + num(v.amount));
  }

  const dailyByProject = new Map();
  for (const d of dailyRows) {
    if (!dailyByProject.has(d.projectId)) dailyByProject.set(d.projectId, []);
    dailyByProject.get(d.projectId).push({
      status: d.status, date: dayOf(d.date), workAccomplished: safeParseArray(d.workAccomplishedJSON),
    });
  }

  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const todayStr = today();
  const nowMs = Date.now();

  const projects = projectRows.filter(isLiveProject);
  const rows = [];
  const attention = [];
  let totalContract = 0, totalVO = 0, totalBilled = 0, totalCollected = 0, totalFunding = 0;

  for (const p of projects) {
    const items = sowItems.filter((s) => s.projectId === p.id && (!s.isTitle || String(s.isTitle) === 'false'));
    const daily = dailyByProject.get(p.id) || [];
    const index = buildProgressIndex(daily);

    let budgetSum = 0, earned = 0, plannedToDate = 0, weighted = 0;
    for (const s of items) {
      const budget = num(s.budget);
      budgetSum += budget;
      const prog = progressAsOf(index, s.id, todayStr);
      weighted += prog * budget;

      const contractBasis = (estimateBySow.get(`${p.id}::${s.id}`) || 0) + (voBySow.get(`${p.id}::${s.id}`) || 0);
      earned += contractBasis * (prog / 100);

      const sS = new Date(s.startDate), sE = new Date(s.endDate);
      if (!Number.isNaN(sS.getTime()) && !Number.isNaN(sE.getTime())) {
        if (nowMs >= sE.getTime()) plannedToDate += budget;
        else if (nowMs > sS.getTime()) plannedToDate += budget * ((nowMs - sS.getTime()) / Math.max(sE.getTime() - sS.getTime(), 1));
      }
    }
    const progress = budgetSum > 0 ? weighted / budgetSum : (items.length ? items.reduce((t, s) => t + progressAsOf(index, s.id, todayStr), 0) / items.length : 0);

    const actualCost = costByProject.get(p.id) || 0;
    const cashOut = releases.filter((r) => r.projectId === p.id && low(r.status) === 'reviewed').reduce((t, r) => t + num(r.amount), 0);
    const billedGross = billings.filter((b) => b.projectId === p.id && low(b.status) !== 'rejected').reduce((t, b) => t + num(b.grossAmount), 0);

    // Client money only — the incoming table also holds owner capital
    // and loans, which are funding, not revenue.
    const projIncoming = incoming.filter((r) => r.projectId === p.id && low(r.status) === 'approved');
    const collected = projIncoming.filter((r) => low(r.sourceType) !== 'funding').reduce((t, r) => t + num(r.amount), 0);
    const funding = projIncoming.filter((r) => low(r.sourceType) === 'funding').reduce((t, r) => t + num(r.amount), 0);

    const contract = num(p.contractValue) + (voByProject.get(p.id) || 0);
    const spi = plannedToDate > 0 ? earned / plannedToDate : null;
    const cpi = actualCost > 0 ? earned / actualCost : null;

    let health = 'Healthy', healthClass = 'good';
    if ((spi !== null && spi < 0.85) || (cpi !== null && cpi < 0.85)) { health = 'At Risk'; healthClass = 'danger'; }
    else if ((spi !== null && spi < 0.95) || (cpi !== null && cpi < 0.95)) { health = 'Watch'; healthClass = 'warn'; }

    if (cpi !== null && cpi < 0.85) {
      attention.push({ severity: 1, icon: 'wallet', projectId: p.id, projectName: p.name, text: 'Cost overrun (CPI ' + cpi.toFixed(2) + ')', tab: 'reports' });
    }
    if (spi !== null && spi < 0.85) {
      attention.push({ severity: 2, icon: 'clock', projectId: p.id, projectName: p.name, text: 'Behind schedule (SPI ' + spi.toFixed(2) + ')', tab: 'gantt' });
    }
    if (daily.length) {
      const lastKey = daily.reduce((mx, d) => (d.date > mx ? d.date : mx), '');
      if (lastKey) {
        const gap = Math.round((nowMs - new Date(lastKey).getTime()) / 86400000);
        if (gap >= STALE_DAYS) {
          attention.push({ severity: gap >= 10 ? 2 : 3, icon: 'calendar', projectId: p.id, projectName: p.name, text: `No daily report for ${gap} days`, tab: 'daily' });
        }
      }
    }

    totalContract += contract;
    totalVO += voByProject.get(p.id) || 0;
    totalBilled += billedGross;
    totalCollected += collected;
    totalFunding += funding;

    rows.push({
      id: p.id,
      name: p.name,
      status: p.status || 'Ongoing',
      client: clientName.get(p.clientId) || '',
      progress: Math.round(progress * 10) / 10,
      spi: spi === null ? null : Math.round(spi * 100) / 100,
      cpi: cpi === null ? null : Math.round(cpi * 100) / 100,
      contract: Math.round(contract),
      billed: Math.round(billedGross),
      collected: Math.round(collected),
      actualCost: Math.round(actualCost),
      funding: Math.round(funding),
      cashPosition: Math.round(collected + funding - cashOut),
      health,
      healthClass,
    });
  }

  attention.sort((a, b) => a.severity - b.severity);

  return {
    summary: {
      activeProjects: rows.filter((r) => low(r.status) !== 'completed').length,
      totalProjects: rows.length,
      totalContract: Math.round(totalContract),
      totalVO: Math.round(totalVO),
      totalBilled: Math.round(totalBilled),
      totalCollected: Math.round(totalCollected),
      totalFunding: Math.round(totalFunding),
      uncollected: Math.round(totalBilled - totalCollected),
      attentionCount: attention.length,
      urgentCount: attention.filter((a) => a.severity === 1).length,
    },
    attention: attention.slice(0, 20),
    projects: rows,
  };
}
