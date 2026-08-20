import { batchAll, all, first, run } from './db.js';
import { dayOf, isAdmin, logActivity, low, nextId, nowIso, num, safeParse, safeParseArray, today } from './util.js';
import { actualCostBySow, buildProgressIndex, progressAsOf, releaseCost, receiptCost } from './costs.js';
import { buildSowTree } from './sowtree.js';
import { buildProjectSeries } from './series.js';

function parseDailyRecord(d) {
  return {
    ...d,
    manpower: safeParseArray(d.manpowerJSON),
    equipment: safeParseArray(d.equipmentJSON),
    workAccomplished: safeParseArray(d.workAccomplishedJSON),
    materialsDelivered: safeParseArray(d.materialsDeliveredJSON),
    materialsUsed: safeParseArray(d.materialsUsedJSON),
    issues: safeParseArray(d.issuesJSON),
    visitors: safeParseArray(d.visitorsJSON),
    photos: safeParseArray(d.photosJSON),
    date: dayOf(d.date),
  };
}

function projectEditors(proj) {
  return safeParseArray(proj.editorsJSON).map((e) => low(e));
}

function canEditProject(identity, proj) {
  if (isAdmin(identity)) return true;
  return projectEditors(proj).includes(low(identity.email));
}

export async function getProjectDataCached(env, identity, projectId) {
  const proj = await first(env, 'SELECT * FROM Projects WHERE id = ?', projectId);
  if (!proj) throw new Error('That project no longer exists.');

  // Everything the page needs in ONE round trip. The estimate children
  // are fetched by subquery rather than by ids read from the group rows,
  // because needing those ids first would cost a second trip — and the
  // cost-basis tables likewise ride along instead of being fetched after.
  const [
    client, sowRows, dailyRows, groupRows, billingRows, voRows,
    cashAdvRows, releaseRows, liquidationRows, incomingRows, transferRows,
    otRows, punchRows, safetyRows, drawingRows, personnelRows, qaqcRows,
    mats, labor, equip, indirect,
    basisReleases, basisLiquidations, basisReceipts,
  ] = await batchAll(env, [
    ['SELECT * FROM ClientLists WHERE id = ?', proj.clientId || ''],
    ['SELECT * FROM SOWItems WHERE projectId = ? ORDER BY sortOrder', projectId],
    ["SELECT * FROM DailyRecords WHERE projectId = ? AND (deletedAt IS NULL OR deletedAt = '') ORDER BY date DESC", projectId],
    ['SELECT * FROM EstimateGroups WHERE projectId = ?', projectId],
    ['SELECT * FROM Billings WHERE projectId = ? ORDER BY createdAt', projectId],
    ['SELECT * FROM VariationOrders WHERE projectId = ? ORDER BY createdAt', projectId],
    ['SELECT * FROM CashAdvanceRequests WHERE projectId = ? ORDER BY createdAt DESC', projectId],
    ['SELECT * FROM CashRelease WHERE projectId = ? ORDER BY createdAt DESC', projectId],
    ['SELECT * FROM Liquidations WHERE projectId = ? ORDER BY createdAt DESC', projectId],
    ['SELECT * FROM IncomingCashRequests WHERE projectId = ? ORDER BY createdAt DESC', projectId],
    ['SELECT * FROM Transfers WHERE fromLoc = ? OR toLoc = ? ORDER BY createdAt DESC', projectId, projectId],
    ['SELECT * FROM OTRequests WHERE projectId = ? ORDER BY createdAt DESC', projectId],
    ['SELECT * FROM Punchlist WHERE projectId = ? ORDER BY createdAt DESC', projectId],
    ['SELECT * FROM SafetyRecords WHERE projectId = ? ORDER BY createdAt DESC', projectId],
    ['SELECT * FROM Drawings WHERE projectId = ? ORDER BY createdAt DESC', projectId],
    "SELECT * FROM Personnel WHERE lower(status) = 'active' ORDER BY name",
    ['SELECT * FROM QaqcRecords WHERE projectId = ?', projectId],
    ['SELECT * FROM EstimateMaterials WHERE groupId IN (SELECT id FROM EstimateGroups WHERE projectId = ?)', projectId],
    ['SELECT * FROM EstimateLabor WHERE groupId IN (SELECT id FROM EstimateGroups WHERE projectId = ?)', projectId],
    ['SELECT * FROM EstimateEquipment WHERE groupId IN (SELECT id FROM EstimateGroups WHERE projectId = ?)', projectId],
    ['SELECT * FROM EstimateIndirect WHERE groupId IN (SELECT id FROM EstimateGroups WHERE projectId = ?)', projectId],
    "SELECT * FROM CashRelease WHERE lower(status) = 'reviewed'",
    "SELECT cashAdvanceId, amount FROM Liquidations WHERE lower(status) = 'approved'",
    "SELECT * FROM Receipts WHERE lower(status) != 'cancelled'",
  ]);

  const dailyRecords = dailyRows.map(parseDailyRecord);
  const progressIndex = buildProgressIndex(dailyRecords);

  // ── Estimates, grouped from the rows already fetched above ──
  const bucket = (rows) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.groupId)) m.set(r.groupId, []);
      m.get(r.groupId).push(r);
    }
    return m;
  };
  const bm = bucket(mats), bl = bucket(labor), be = bucket(equip), bi = bucket(indirect);
  const estimateGroups = groupRows.map((g) => {
    const materials = bm.get(g.id) || [];
    const laborRows = bl.get(g.id) || [];
    const equipment = be.get(g.id) || [];
    const indirects = bi.get(g.id) || [];
    const total = [...materials, ...laborRows, ...equipment].reduce((t, r) => t + num(r.cost), 0)
      + indirects.reduce((t, r) => t + num(r.amount), 0);
    return { ...g, materials, labor: laborRows, equipment, indirect: indirects, total };
  });

  // ── Money ──
  const billings = billingRows.map((b) => ({ ...b, grossAmount: num(b.grossAmount), netAmount: num(b.netAmount), retentionAmount: num(b.retentionAmount) }));
  const approvedVOs = voRows.filter((v) => low(v.status) === 'approved');
  const contractValue = num(proj.contractValue);
  const contractValueRevised = contractValue + approvedVOs.reduce((t, v) => t + num(v.amount), 0);

  const revenue = incomingRows.filter((r) => low(r.status) === 'approved').reduce((t, r) => t + num(r.amount), 0);
  // `expenses` is what the job has COST (accrual); `cashPosition` is real
  // money, so it uses cash actually released. Before accrual those were
  // the same number, and quietly disagreeing later is worse than either.
  const liqByCA = new Map();
  for (const l of basisLiquidations) {
    if (!l.cashAdvanceId) continue;
    liqByCA.set(l.cashAdvanceId, (liqByCA.get(l.cashAdvanceId) || 0) + num(l.amount));
  }
  const basis = { releases: basisReleases, receipts: basisReceipts, liqByCA };
  const sowCost = actualCostBySow(basis, projectId);
  const accruedCost = Math.round(
    (basis.releases.filter((r) => r.projectId === projectId).reduce((t, r) => t + releaseCost(r, basis.liqByCA), 0)
      + basis.receipts.filter((r) => r.projectId === projectId).reduce((t, r) => t + receiptCost(r), 0)) * 100
  ) / 100;
  const expenses = accruedCost;
  const cashOut = releaseRows.filter((r) => low(r.status) === 'reviewed').reduce((t, r) => t + num(r.amount), 0);

  // ── SOW items, with live progress, cost and contract basis ──
  const estimateBySow = new Map();
  for (const g of estimateGroups) {
    if (low(g.status) !== 'approved') continue;
    estimateBySow.set(String(g.sowId), (estimateBySow.get(String(g.sowId)) || 0) + num(g.total));
  }
  const voBySow = new Map();
  for (const v of approvedVOs) {
    voBySow.set(String(v.sowId), (voBySow.get(String(v.sowId)) || 0) + num(v.amount));
  }

  const todayStr = today();
  const sowItemsFlat = sowRows.map((s) => ({
    ...s,
    budget: num(s.budget),
    actual: sowCost.get(String(s.id)) || 0,
    qty: num(s.qty),
    startDate: dayOf(s.startDate),
    endDate: dayOf(s.endDate),
    baselineStart: dayOf(s.baselineStart),
    baselineEnd: dayOf(s.baselineEnd),
    isTitle: !!s.isTitle && String(s.isTitle) !== 'false',
    isMilestone: !!s.isMilestone && String(s.isMilestone) !== 'false',
    progress: progressAsOf(progressIndex, s.id, todayStr),
    estimateTotal: estimateBySow.get(String(s.id)) || 0,
    voAdjustment: voBySow.get(String(s.id)) || 0,
  }));

  // Depth-first, with level/isHeading/rollups — the print, the SOW tab,
  // the Timeline and the import preview all render from these.
  const sowItems = buildSowTree(sowItemsFlat);

  // A heading is a section label: it carries no cost of its own, so
  // every total below counts leaves only, never a heading as well.
  const workItems = sowItems.filter((s) => !s.isHeading);

  const totalBudget = workItems.reduce((t, s) => t + s.budget, 0);
  const totalProgress = totalBudget > 0
    ? workItems.reduce((t, s) => t + s.progress * s.budget, 0) / totalBudget
    : (workItems.length ? workItems.reduce((t, s) => t + s.progress, 0) / workItems.length : 0);

  // Cost grouped by the request type recorded on the advance.
  const costByTypeMap = {};
  for (const r of cashAdvRows) {
    if (!['released', 'approved'].includes(low(r.status))) continue;
    const payload = safeParse(r.payloadJSON, {}) || {};
    const key = payload.requestType || r.type || 'Other';
    costByTypeMap[key] = (costByTypeMap[key] || 0) + num(r.amount);
  }
  const costByType = Object.keys(costByTypeMap).map((k) => ({ type: k, amount: costByTypeMap[k] }));

  // ── Cashflow + earned value, monthly AND weekly ──
  //
  // Both intervals are built from the same per-day spreading, so the
  // weekly view is a real re-bucketing rather than the monthly numbers
  // relabelled — which is what it was before, and why toggling the
  // view appeared to do nothing.
  const spanDates = [dayOf(proj.startDate), dayOf(proj.endDate), today()];
  for (const s of sowItems) { spanDates.push(s.startDate, s.endDate); }
  for (const r of incomingRows) if (low(r.status) === 'approved') spanDates.push(dayOf(r.transactionDate) || dayOf(r.createdAt));
  for (const r of releaseRows) if (low(r.status) === 'reviewed') spanDates.push(dayOf(r.releasedAt) || dayOf(r.createdAt));

  // Money already committed but not yet paid: it is not on the Gantt,
  // so without it the projection understates what is about to go out.
  const pendingCommitments = cashAdvRows
    .filter((r) => low(r.status) === 'pending')
    .map((r) => ({ amount: num(r.amount), dateNeeded: dayOf(r.dateNeeded), createdAt: dayOf(r.createdAt) }));

  const seriesInput = {
    now: new Date(),
    sowItems,
    incoming: incomingRows.filter((r) => low(r.status) === 'approved'),
    releases: releaseRows.filter((r) => low(r.status) === 'reviewed'),
    pendingRequests: pendingCommitments,
    progressIndex,
    progressAsOf,
    spanDates: spanDates.filter(Boolean),
    accruedCost,
  };
  const monthly = buildProjectSeries({ ...seriesInput, mode: 'monthly' });
  const weekly = buildProjectSeries({ ...seriesInput, mode: 'weekly' });
  const projectCashflow = monthly.cashflow;
  const evm = monthly.evm;

  // ── Materials and equipment on site, from the daily records ──
  const siteMaterialMap = new Map();
  for (const d of dailyRecords) {
    for (const m of d.materialsDelivered) {
      const key = m.material || m.name || m.itemName || '';
      if (!key) continue;
      const cur = siteMaterialMap.get(key) || { material: key, unit: m.unit || '', delivered: 0, used: 0 };
      cur.delivered += num(m.qty);
      siteMaterialMap.set(key, cur);
    }
    for (const m of d.materialsUsed) {
      const key = m.material || m.name || m.itemName || '';
      if (!key) continue;
      const cur = siteMaterialMap.get(key) || { material: key, unit: m.unit || '', delivered: 0, used: 0 };
      cur.used += num(m.qty);
      siteMaterialMap.set(key, cur);
    }
  }
  const siteMaterials = [...siteMaterialMap.values()].map((m) => ({ ...m, balance: m.delivered - m.used }));

  const equipMap = new Map();
  const downtimeLog = [];
  for (const d of dailyRecords) {
    for (const e of d.equipment) {
      const key = e.equipment || e.name || '';
      if (!key) continue;
      const cur = equipMap.get(key) || { equipment: key, days: 0, hours: 0, downtime: 0 };
      cur.days += 1;
      cur.hours += num(e.hours);
      if (e.status && low(e.status) !== 'operational') {
        cur.downtime += 1;
        downtimeLog.push({ date: d.date, equipment: key, status: e.status, remarks: e.remarks || '' });
      }
      equipMap.set(key, cur);
    }
  }
  const equipmentSummary = [...equipMap.values()];
  const equipmentOnSite = equipmentSummary.map((e) => e.equipment);

  // ── QA/QC split by kind, the shape the tab expects ──
  const qaqc = { inspections: [], ncrs: [], tests: [] };
  for (const r of qaqcRows) {
    const kind = low(r.kind);
    if (kind === 'ncr') qaqc.ncrs.push(r);
    else if (kind === 'test') qaqc.tests.push(r);
    else qaqc.inspections.push(r);
  }

  const photos = [];
  for (const d of dailyRecords) {
    for (const p of d.photos) photos.push(typeof p === 'string' ? p : p.url);
    for (const w of d.workAccomplished) if (w.image) photos.push(w.image);
    for (const i of d.issues) if (i.image) photos.push(i.image);
  }

  /**
   * contractReadiness - can this project be billed yet, and if not, WHICH
   * scope items are holding it up.
   *
   * It has to name them. Billing, the Timeline and Variation Orders all
   * print the blocking list, so a bare true/false leaves someone staring
   * at a disabled button with nothing to act on — and the three screens
   * read `.unapproved.length` directly, so a boolean here is not merely
   * unhelpful, it throws.
   *
   * Headings and milestones are excluded: a heading carries no estimate
   * and no budget by design, so counting it would block billing on every
   * project that uses a structured bill of quantities.
   */
  const billable = sowItems.filter((s) => !s.isHeading && !s.isMilestone);
  const unapproved = [];
  const zeroBudget = [];
  for (const s of billable) {
    const g = estimateGroups.find((x) => String(x.sowId).trim() === String(s.id).trim());
    if (!g || low(g.status) !== 'approved' || num(g.total) <= 0) unapproved.push(s.id);
    if (!(s.budget > 0)) zeroBudget.push(s.id);
  }
  const contractReady = {
    ready: billable.length > 0 && unapproved.length === 0 && zeroBudget.length === 0,
    hasItems: billable.length > 0,
    unapproved,
    zeroBudget,
  };

  return {
    name: proj.name,
    status: proj.status,
    clientId: proj.clientId || '',
    clientName: client[0] ? client[0].name : '',
    location: proj.location || '',
    startDate: dayOf(proj.startDate),
    endDate: dayOf(proj.endDate),
    totalProgress: Math.round(totalProgress * 10) / 10,
    siteMaterials,
    transfers: transferRows,
    otRequests: otRows,
    punchlist: punchRows,
    safetyRecords: safetyRows,
    drawings: drawingRows.map((d) => ({ ...d, previewUrls: safeParseArray(d.previewUrls) })),
    personnel: personnelRows,
    qaqc,
    equipmentOnSite,
    equipmentSummary,
    downtimeLog: downtimeLog.slice(0, 40),
    costByType,
    projectCashflow,
    projectCashflowWeekly: weekly.cashflow,
    evm,
    evmWeekly: weekly.evm,
    billings,
    variationOrders: voRows.slice().reverse(),
    contractValue,
    retentionPct: num(proj.retentionPct),
    downpaymentPct: num(proj.downpaymentPct),
    contractValueRevised,
    contractReady,
    editors: projectEditors(proj),
    canEdit: canEditProject(identity, proj),
    revenue,
    expenses,
    cashPosition: revenue - cashOut,
    cashAdvanceRequests: cashAdvRows,
    cashReleases: releaseRows,
    liquidations: liquidationRows,
    incomingCash: incomingRows,
    sowItems,
    dailyRecords,
    estimates: { groups: estimateGroups },
    photos,
  };
}

export async function getSOWItemsForProject(env, _identity, projectId) {
  const rows = await all(env, 'SELECT * FROM SOWItems WHERE projectId = ? ORDER BY sortOrder', projectId);
  // Same annotated, depth-first tree the project payload carries, so a
  // caller that fetches scope on its own sees identical headings/levels.
  return buildSowTree(rows.map((s) => ({
    ...s,
    budget: num(s.budget),
    actual: num(s.actual),
    qty: num(s.qty),
    startDate: dayOf(s.startDate),
    endDate: dayOf(s.endDate),
    isTitle: !!s.isTitle && String(s.isTitle) !== 'false',
  })));
}

export async function getOTRequests(env, _identity, projectId) {
  if (projectId) return all(env, 'SELECT * FROM OTRequests WHERE projectId = ? ORDER BY createdAt DESC', projectId);
  return all(env, 'SELECT * FROM OTRequests ORDER BY createdAt DESC');
}

export async function getProjectDocuments(env, _identity, projectId) {
  return all(env, 'SELECT * FROM ProjectDocuments WHERE projectId = ? ORDER BY uploadedAt DESC', projectId);
}

export async function listDeletedRecords(env, _identity, projectId) {
  return all(
    env,
    "SELECT * FROM DailyRecords WHERE projectId = ? AND deletedAt IS NOT NULL AND deletedAt != '' ORDER BY deletedAt DESC",
    projectId
  );
}

export async function getDPLedger(env, _identity, projectId) {
  const proj = await first(env, 'SELECT contractValue, downpaymentPct FROM Projects WHERE id = ?', projectId);
  if (!proj) throw new Error('That project no longer exists.');
  const rows = await all(env, 'SELECT * FROM Billings WHERE projectId = ? ORDER BY createdAt', projectId);
  const advance = num(proj.contractValue) * num(proj.downpaymentPct);
  const recouped = rows.reduce((t, b) => t + num(b.dpRecoupment), 0);
  return { advance, recouped, balance: advance - recouped, billings: rows };
}

export async function setProjectEditors(env, identity, projectId, emails) {
  if (!isAdmin(identity)) throw new Error('Only an admin can change project editors.');
  const list = (Array.isArray(emails) ? emails : []).map((e) => low(e)).filter(Boolean);
  await run(env, 'UPDATE Projects SET editorsJSON = ? WHERE id = ?', JSON.stringify(list), projectId);
  await logActivity(env, identity.email, `Editors updated for project ${projectId}.`, 'blue');
  return { success: true, editors: list };
}

export async function updateProjectContract(env, identity, projectId, contractValue, retentionPct) {
  if (!isAdmin(identity)) throw new Error('Only an admin can change the contract.');
  await run(
    env, 'UPDATE Projects SET contractValue = ?, retentionPct = ? WHERE id = ?',
    num(contractValue), num(retentionPct), projectId
  );
  await logActivity(env, identity.email, `Contract updated for project ${projectId}.`, 'blue');
  return { success: true };
}

export async function addProject(env, identity, id, name, clientId, location, startDate, endDate) {
  if (!isAdmin(identity)) throw new Error('Only an admin can add a project.');
  if (!id || !name) throw new Error('A project needs an id and a name.');
  const existing = await first(env, 'SELECT id FROM Projects WHERE id = ?', id);
  if (existing) throw new Error('A project with that id already exists.');

  await run(
    env,
    `INSERT INTO Projects (id, name, status, revenue, expenses, cashPosition, clientId, location,
       startDate, endDate, contractValue, retentionPct, editorsJSON, downpaymentPct, copiedFrom,
       archivedAt, archiveReason, previousStatus, vatPct, vatRegistered)
     VALUES (?, ?, 'Ongoing', 0, 0, 0, ?, ?, ?, ?, 0, 0.1, '[]', 0, '', '', '', '', 0, 0)`,
    id, name, clientId || '', location || '', dayOf(startDate), dayOf(endDate)
  );
  await logActivity(env, identity.email, `Project "${name}" created.`, 'g');
  return { success: true, id };
}

export async function archiveProject(env, identity, projectId, reason) {
  if (!isAdmin(identity)) throw new Error('Only an admin can archive a project.');
  const proj = await first(env, 'SELECT status FROM Projects WHERE id = ?', projectId);
  if (!proj) throw new Error('That project no longer exists.');
  await run(
    env,
    "UPDATE Projects SET archivedAt = ?, archiveReason = ?, previousStatus = ?, status = 'Archived' WHERE id = ?",
    nowIso(), reason || '', proj.status || '', projectId
  );
  await logActivity(env, identity.email, `Project ${projectId} archived.`, 'a');
  return { success: true };
}

export async function unarchiveProject(env, identity, projectId) {
  if (!isAdmin(identity)) throw new Error('Only an admin can restore a project.');
  const proj = await first(env, 'SELECT previousStatus FROM Projects WHERE id = ?', projectId);
  if (!proj) throw new Error('That project no longer exists.');
  await run(
    env,
    "UPDATE Projects SET archivedAt = '', archiveReason = '', status = ? WHERE id = ?",
    proj.previousStatus || 'Ongoing', projectId
  );
  await logActivity(env, identity.email, `Project ${projectId} restored.`, 'g');
  return { success: true };
}
