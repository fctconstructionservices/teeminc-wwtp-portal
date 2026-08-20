import { all, batchAll, first, run } from './db.js';
import { dayOf, isAdmin, logActivity, low, nextId, nowIso, num, requireRole, safeParseArray } from './util.js';

// ─── CASH ──────────────────────────────────────────────────────

export async function submitCashAdvance(env, identity, payload) {
  const d = payload || {};
  if (!d.projectId) throw new Error('A cash advance needs a project.');
  if (!num(d.amount)) throw new Error('A cash advance needs an amount.');
  const id = nextId('CA');
  await run(
    env,
    `INSERT INTO CashAdvanceRequests (id, type, projectId, requestor, requestorEmail, amount,
       description, scope, attachmentsJSON, payloadJSON, status, createdAt, dateNeeded, sowId)
     VALUES (?, 'Cash Advance', ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
    id, d.projectId, identity.user.name || identity.email, low(identity.email), num(d.amount),
    d.description || '', d.scope || d.sowId || '', JSON.stringify(d.attachments || []),
    JSON.stringify(d.payload || { requestType: d.requestType || '', dateNeeded: d.dateNeeded || '' }),
    nowIso(), dayOf(d.dateNeeded), d.sowId || d.scope || ''
  );
  await logActivity(env, identity.email, `Cash advance ${id} submitted for ${d.projectId}.`, 'blue');
  return { success: true, id };
}

export async function submitRelease(env, identity, payload) {
  const d = payload || {};
  requireRole(identity, ['superadmin', 'admin'], 'releasing cash');
  const id = nextId('CR');
  await run(
    env,
    `INSERT INTO CashRelease (id, originalRequestId, projectId, requestor, requestorEmail, amount,
       description, scope, status, createdAt, releasedBy, releasedAt, reviewedByJSON, sowId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'For Review', ?, ?, '', '[]', ?)`,
    id, d.originalRequestId || '', d.projectId || '', d.requestor || '', low(d.requestorEmail || ''),
    num(d.amount), d.description || '', d.scope || '', nowIso(), low(identity.email), d.sowId || ''
  );
  if (d.originalRequestId) {
    await run(env, "UPDATE CashAdvanceRequests SET status = 'Released' WHERE id = ?", d.originalRequestId);
  }
  await logActivity(env, identity.email, `Cash release ${id} submitted for review.`, 'blue');
  return { success: true, id };
}

export async function submitIncomingCash(env, identity, payload) {
  const d = payload || {};
  if (!num(d.amount)) throw new Error('Incoming cash needs an amount.');
  const id = nextId('IC');
  await run(
    env,
    `INSERT INTO IncomingCashRequests (id, type, projectId, requestor, requestorEmail, amount,
       description, paymentMethod, reference, transactionDate, attachmentsJSON, status, createdAt, sourceType)
     VALUES (?, 'Incoming Cash', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
    id, d.projectId || '', identity.user.name || identity.email, low(identity.email), num(d.amount),
    d.description || '', d.paymentMethod || '', d.reference || '', dayOf(d.transactionDate),
    JSON.stringify(d.attachments || []), nowIso(), d.sourceType || ''
  );
  await logActivity(env, identity.email, `Incoming cash ${id} recorded.`, 'blue');
  return { success: true, id };
}

export async function submitLiquidation(env, identity, payload) {
  const d = payload || {};
  if (!num(d.amount)) throw new Error('A liquidation needs an amount.');
  const id = nextId('LQ');
  await run(
    env,
    `INSERT INTO Liquidations (id, cashAdvanceId, projectId, requestor, requestorEmail, amount,
       description, receiptNo, attachmentsJSON, status, createdAt, reviewedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, '')`,
    id, d.cashAdvanceId || '', d.projectId || '', identity.user.name || identity.email,
    low(identity.email), num(d.amount), d.description || '', d.receiptNo || '',
    JSON.stringify(d.attachments || []), nowIso()
  );
  await logActivity(env, identity.email, `Liquidation ${id} submitted.`, 'blue');
  return { success: true, id };
}

// ─── TRANSFERS ─────────────────────────────────────────────────

async function insertTransfer(env, identity, d) {
  const id = nextId('TRF');
  await run(
    env,
    `INSERT INTO Transfers (id, fromLoc, toLoc, itemType, item, unit, qty, reason, transferDate,
       status, requestedBy, createdAt, decidedBy, decidedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, '', '')`,
    id, d.fromLoc || '', d.toLoc || '', d.itemType || '', d.item || '', d.unit || '',
    num(d.qty), d.reason || '', dayOf(d.transferDate) || dayOf(nowIso()),
    low(identity.email), nowIso()
  );
  return id;
}

export async function requestTransfer(env, identity, data) {
  const id = await insertTransfer(env, identity, data || {});
  await logActivity(env, identity.email, `Transfer ${id} requested.`, 'blue');
  return { success: true, id };
}

export async function requestTransferBatch(env, identity, data) {
  const d = data || {};
  const items = Array.isArray(d.items) ? d.items : [];
  if (!items.length) throw new Error('Nothing to transfer.');
  const ids = [];
  for (const item of items) {
    ids.push(await insertTransfer(env, identity, { ...d, ...item }));
  }
  await logActivity(env, identity.email, `${ids.length} transfers requested.`, 'blue');
  return { success: true, ids };
}

// ─── DAILY RECORDS ─────────────────────────────────────────────

function dailyColumns(d) {
  return [
    d.date ? dayOf(d.date) : '', d.weatherAM || '', d.weatherPM || '',
    JSON.stringify(d.manpower || []), JSON.stringify(d.equipment || []),
    JSON.stringify(d.workAccomplished || []), JSON.stringify(d.materialsDelivered || []),
    JSON.stringify(d.issues || []), JSON.stringify(d.visitors || []),
    JSON.stringify(d.photos || []), JSON.stringify(d.materialsUsed || []),
  ];
}

export async function addDailyRecord(env, identity, projectId, data) {
  const d = data || {};
  if (!projectId) throw new Error('A daily record needs a project.');
  const id = nextId('DR');
  const c = dailyColumns(d);
  await run(
    env,
    `INSERT INTO DailyRecords (id, projectId, date, weatherAM, weatherPM, status, manpowerJSON,
       equipmentJSON, workAccomplishedJSON, materialsDeliveredJSON, issuesJSON, visitorsJSON,
       photosJSON, createdBy, createdAt, materialsUsedJSON, deletedAt, deletedBy)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')`,
    id, projectId, c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9],
    low(identity.email), nowIso(), c[10]
  );
  await logActivity(env, identity.email, `Daily record ${id} created for ${projectId}.`, 'blue');
  return { success: true, id };
}

export async function updateDailyRecord(env, identity, recordId, data) {
  const d = data || {};
  const existing = await first(env, 'SELECT * FROM DailyRecords WHERE id = ?', recordId);
  if (!existing) throw new Error('That daily record no longer exists.');
  const c = dailyColumns(d);
  await run(
    env,
    `UPDATE DailyRecords SET date = ?, weatherAM = ?, weatherPM = ?, manpowerJSON = ?,
       equipmentJSON = ?, workAccomplishedJSON = ?, materialsDeliveredJSON = ?, issuesJSON = ?,
       visitorsJSON = ?, photosJSON = ?, materialsUsedJSON = ? WHERE id = ?`,
    c[0] || existing.date, c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], recordId
  );
  return { success: true };
}

export async function submitDailyRecordForApproval(env, identity, recordId) {
  await run(env, "UPDATE DailyRecords SET status = 'pending' WHERE id = ?", recordId);
  await logActivity(env, identity.email, `Daily record ${recordId} submitted for approval.`, 'blue');
  return { success: true };
}

export async function deleteDailyRecord(env, identity, recordId) {
  // Soft delete: a removed daily record is still evidence of what was
  // reported, so it is hidden rather than destroyed.
  await run(
    env, 'UPDATE DailyRecords SET deletedAt = ?, deletedBy = ? WHERE id = ?',
    nowIso(), low(identity.email), recordId
  );
  await logActivity(env, identity.email, `Daily record ${recordId} deleted.`, 'a');
  return { success: true };
}

export async function restoreDailyRecord(env, identity, recordId) {
  await run(env, "UPDATE DailyRecords SET deletedAt = '', deletedBy = '' WHERE id = ?", recordId);
  await logActivity(env, identity.email, `Daily record ${recordId} restored.`, 'g');
  return { success: true };
}

// ─── SOW ITEMS ─────────────────────────────────────────────────

export async function addSOWItem(env, identity, projectId, data) {
  const d = data || {};
  if (!d.id) throw new Error('A scope item needs an id.');
  const existing = await first(env, 'SELECT id FROM SOWItems WHERE projectId = ? AND id = ?', projectId, d.id);
  if (existing) throw new Error('A scope item with that id already exists in this project.');

  const maxRow = await first(env, 'SELECT MAX(CAST(sortOrder AS INTEGER)) AS m FROM SOWItems WHERE projectId = ?', projectId);
  const sortOrder = (num(maxRow && maxRow.m) || 0) + 1000;

  await run(
    env,
    `INSERT INTO SOWItems (id, projectId, description, budget, actual, startDate, endDate, status,
       qty, unit, budgetMode, predecessors, isMilestone, baselineStart, baselineEnd, sortOrder, isTitle)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)`,
    d.id, projectId, d.description || '', num(d.budget), dayOf(d.startDate), dayOf(d.endDate),
    d.status || 'On Track', num(d.qty), d.unit || '', d.budgetMode || 'manual',
    d.predecessors || '', d.isMilestone ? '1' : '', String(sortOrder), d.isTitle ? '1' : ''
  );
  await logActivity(env, identity.email, `Scope item ${d.id} added to ${projectId}.`, 'blue');
  return { success: true, id: d.id };
}

export async function updateSOWItem(env, identity, projectId, sowId, data) {
  const d = data || {};
  const existing = await first(env, 'SELECT * FROM SOWItems WHERE projectId = ? AND id = ?', projectId, sowId);
  if (!existing) throw new Error('That scope item no longer exists.');
  await run(
    env,
    `UPDATE SOWItems SET description = ?, budget = ?, startDate = ?, endDate = ?, status = ?,
       qty = ?, unit = ?, predecessors = ?, isMilestone = ? WHERE projectId = ? AND id = ?`,
    d.description ?? existing.description,
    d.budget === undefined ? existing.budget : num(d.budget),
    d.startDate === undefined ? existing.startDate : dayOf(d.startDate),
    d.endDate === undefined ? existing.endDate : dayOf(d.endDate),
    d.status ?? existing.status,
    d.qty === undefined ? existing.qty : num(d.qty),
    d.unit ?? existing.unit,
    d.predecessors ?? existing.predecessors,
    d.isMilestone === undefined ? existing.isMilestone : (d.isMilestone ? '1' : ''),
    projectId, sowId
  );
  return { success: true };
}

export async function deleteSOWItem(env, identity, projectId, sowId) {
  await run(env, 'DELETE FROM SOWItems WHERE projectId = ? AND id = ?', projectId, sowId);
  await logActivity(env, identity.email, `Scope item ${sowId} deleted from ${projectId}.`, 'a');
  return { success: true };
}

/**
 * updateSOWBudget - set a scope's budget, or where it is derived from.
 *
 * Only 'manual' takes the typed figure. 'auto' and 'indirect' are
 * DERIVED from the approved estimate and recomputed here — writing the
 * manual field for them set every budget to zero, because the manual
 * input is hidden (and therefore empty) whenever those modes are chosen.
 *
 *   auto     direct costs — materials + labour + equipment
 *   indirect indirect costs only
 */
export async function updateSOWBudget(env, identity, projectId, sowId, mode, manualAmount) {
  const chosen = ['auto', 'indirect', 'manual'].includes(mode) ? mode : 'manual';

  const item = await first(env, 'SELECT id FROM SOWItems WHERE projectId = ? AND id = ?', projectId, sowId);
  if (!item) throw new Error('That scope item is not in this project.');

  let budget;
  if (chosen === 'manual') {
    budget = num(manualAmount);
  } else {
    const group = await first(
      env, 'SELECT id FROM EstimateGroups WHERE projectId = ? AND sowId = ?', projectId, sowId
    );
    if (!group) {
      budget = 0;
    } else if (chosen === 'indirect') {
      const rows = await all(env, 'SELECT amount FROM EstimateIndirect WHERE groupId = ?', group.id);
      budget = rows.reduce((t, r) => t + num(r.amount), 0);
    } else {
      const [mats, labor, equip] = await batchAll(env, [
        ['SELECT cost FROM EstimateMaterials WHERE groupId = ?', group.id],
        ['SELECT cost FROM EstimateLabor WHERE groupId = ?', group.id],
        ['SELECT cost FROM EstimateEquipment WHERE groupId = ?', group.id],
      ]);
      budget = [...mats, ...labor, ...equip].reduce((t, r) => t + num(r.cost), 0);
    }
  }
  budget = Math.round(budget * 100) / 100;

  await run(
    env, 'UPDATE SOWItems SET budgetMode = ?, budget = ? WHERE projectId = ? AND id = ?',
    chosen, budget, projectId, sowId
  );
  await logActivity(env, identity.email, `Scope ${sowId} budget set to ${budget.toFixed(2)} (${chosen}).`, 'blue');
  // The dialog reports the figure back, so returning it is not optional.
  return { success: true, budget, mode: chosen };
}

export async function setSowItemKind(env, identity, projectId, sowId, isTitle) {
  await run(env, 'UPDATE SOWItems SET isTitle = ? WHERE projectId = ? AND id = ?', isTitle ? '1' : '', projectId, sowId);
  return { success: true };
}

export async function moveSOWItem(env, identity, projectId, sowId, direction) {
  const rows = await all(env, 'SELECT id, sortOrder FROM SOWItems WHERE projectId = ? ORDER BY CAST(sortOrder AS INTEGER)', projectId);
  const idx = rows.findIndex((r) => String(r.id) === String(sowId));
  if (idx < 0) throw new Error('That scope item no longer exists.');
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= rows.length) return { success: true, moved: false };

  const a = rows[idx], b = rows[swapWith];
  await run(env, 'UPDATE SOWItems SET sortOrder = ? WHERE projectId = ? AND id = ?', String(b.sortOrder), projectId, a.id);
  await run(env, 'UPDATE SOWItems SET sortOrder = ? WHERE projectId = ? AND id = ?', String(a.sortOrder), projectId, b.id);
  return { success: true, moved: true };
}

export async function saveBaseline(env, identity, projectId) {
  await run(
    env,
    'UPDATE SOWItems SET baselineStart = startDate, baselineEnd = endDate WHERE projectId = ?',
    projectId
  );
  await logActivity(env, identity.email, `Schedule baseline saved for ${projectId}.`, 'blue');
  return { success: true };
}

// ─── ESTIMATES ─────────────────────────────────────────────────

export async function saveEstimates(env, identity, projectId, groups) {
  const list = Array.isArray(groups) ? groups : [];
  for (const g of list) {
    const groupId = g.id || nextId('EG');
    const exists = await first(env, 'SELECT id FROM EstimateGroups WHERE id = ?', groupId);
    if (exists) {
      await run(
        env, 'UPDATE EstimateGroups SET sowId = ?, sowDescription = ? WHERE id = ?',
        g.sowId || '', g.sowDescription || '', groupId
      );
    } else {
      await run(
        env,
        `INSERT INTO EstimateGroups (id, projectId, sowId, sowDescription, status, submittedBy)
         VALUES (?, ?, ?, ?, 'draft', ?)`,
        groupId, projectId, g.sowId || '', g.sowDescription || '', low(identity.email)
      );
    }

    // Children are replaced wholesale: the editor sends the complete
    // list, so a diff would only risk leaving orphans behind.
    await run(env, 'DELETE FROM EstimateMaterials WHERE groupId = ?', groupId);
    await run(env, 'DELETE FROM EstimateLabor WHERE groupId = ?', groupId);
    await run(env, 'DELETE FROM EstimateEquipment WHERE groupId = ?', groupId);
    await run(env, 'DELETE FROM EstimateIndirect WHERE groupId = ?', groupId);

    for (const m of g.materials || []) {
      await run(
        env,
        `INSERT INTO EstimateMaterials (id, groupId, material, materialName, desc, qty, rate, cost, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        m.id || nextId('EM'), groupId, m.material || '', m.materialName || '', m.desc || '',
        num(m.qty), num(m.rate), num(m.cost), m.unit || ''
      );
    }
    for (const l of g.labor || []) {
      await run(
        env,
        `INSERT INTO EstimateLabor (id, groupId, role, desc, qty, duration, rate, cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        l.id || nextId('EL'), groupId, l.role || '', l.desc || '', num(l.qty),
        String(l.duration ?? ''), num(l.rate), num(l.cost)
      );
    }
    for (const e of g.equipment || []) {
      await run(
        env,
        `INSERT INTO EstimateEquipment (id, groupId, equipment, equipName, desc, qty, duration, rate, cost, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        e.id || nextId('EE'), groupId, e.equipment || '', e.equipName || '', e.desc || '',
        num(e.qty), String(e.duration ?? ''), num(e.rate), num(e.cost), e.unit || ''
      );
    }
    for (const i of g.indirect || []) {
      await run(
        env,
        `INSERT INTO EstimateIndirect (id, groupId, desc, type, amount, multiplier)
         VALUES (?, ?, ?, ?, ?, ?)`,
        i.id || nextId('EI'), groupId, i.desc || '', i.type || '', num(i.amount), String(i.multiplier ?? '')
      );
    }
  }
  await logActivity(env, identity.email, `Estimates saved for ${projectId}.`, 'blue');
  return { success: true };
}

export async function submitEstimatesForApproval(env, identity, projectId, sowId) {
  const group = await first(
    env, 'SELECT id FROM EstimateGroups WHERE projectId = ? AND sowId = ?', projectId, sowId
  );
  if (!group) throw new Error('No estimate to submit for that scope.');
  await run(
    env, "UPDATE EstimateGroups SET status = 'pending', submittedBy = ? WHERE id = ?",
    low(identity.email), group.id
  );
  await logActivity(env, identity.email, `Estimate for ${sowId} submitted for approval.`, 'blue');
  return { success: true, id: group.id };
}

export async function approveEstimates(env, identity, projectId, sowId) {
  requireRole(identity, ['superadmin', 'admin', 'approver'], 'approving estimates');
  const group = await first(
    env, 'SELECT id FROM EstimateGroups WHERE projectId = ? AND sowId = ?', projectId, sowId
  );
  if (!group) throw new Error('No estimate found for that scope.');
  await run(env, "UPDATE EstimateGroups SET status = 'approved' WHERE id = ?", group.id);
  await logActivity(env, identity.email, `Estimate for ${sowId} approved.`, 'g');
  return { success: true };
}

// ─── SITE OPS: OT, punchlist, safety, drawings ─────────────────

export async function requestOT(env, identity, data) {
  const d = data || {};
  const id = nextId('OT');
  await run(
    env,
    `INSERT INTO OTRequests (id, projectId, otDate, otStart, otEnd, sowIdsJSON, reason, status,
       requestedBy, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
    id, d.projectId || '', dayOf(d.otDate), d.otStart || '', d.otEnd || '',
    JSON.stringify(d.sowIds || []), d.reason || '', low(identity.email), nowIso(), nowIso()
  );
  await logActivity(env, identity.email, `Overtime request ${id} submitted.`, 'blue');
  return { success: true, id };
}

export async function addPunchlistItem(env, identity, data) {
  const d = data || {};
  const id = nextId('PL');
  await run(
    env,
    `INSERT INTO Punchlist (id, projectId, item, location, sowId, priority, assignedTo, dueDate,
       status, beforeImage, afterImage, remarks, raisedBy, closedBy, closedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, '', ?, ?, '', '', ?, ?)`,
    id, d.projectId || '', d.item || '', d.location || '', d.sowId || '', d.priority || 'normal',
    d.assignedTo || '', dayOf(d.dueDate), d.beforeImage || '', d.remarks || '',
    low(identity.email), nowIso(), nowIso()
  );
  return { success: true, id };
}

export async function updatePunchlistItem(env, identity, id, data) {
  const d = data || {};
  const existing = await first(env, 'SELECT * FROM Punchlist WHERE id = ?', id);
  if (!existing) throw new Error('That punchlist item no longer exists.');
  const closing = d.status && low(d.status) === 'closed' && low(existing.status) !== 'closed';
  await run(
    env,
    `UPDATE Punchlist SET item = ?, location = ?, sowId = ?, priority = ?, assignedTo = ?,
       dueDate = ?, status = ?, beforeImage = ?, afterImage = ?, remarks = ?, closedBy = ?,
       closedAt = ?, updatedAt = ? WHERE id = ?`,
    d.item ?? existing.item, d.location ?? existing.location, d.sowId ?? existing.sowId,
    d.priority ?? existing.priority, d.assignedTo ?? existing.assignedTo,
    d.dueDate === undefined ? existing.dueDate : dayOf(d.dueDate),
    d.status ?? existing.status, d.beforeImage ?? existing.beforeImage,
    d.afterImage ?? existing.afterImage, d.remarks ?? existing.remarks,
    closing ? low(identity.email) : existing.closedBy,
    closing ? nowIso() : existing.closedAt, nowIso(), id
  );
  return { success: true };
}

export async function deletePunchlistItem(env, identity, id) {
  await run(env, 'DELETE FROM Punchlist WHERE id = ?', id);
  return { success: true };
}

export async function addSafetyRecord(env, identity, data) {
  const d = data || {};
  const id = nextId('SAF');
  await run(
    env,
    `INSERT INTO SafetyRecords (id, projectId, recordType, recordDate, description, severity,
       personsInvolved, actionTaken, image, attachmentsJSON, status, reportedBy, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, d.projectId || '', d.recordType || '', dayOf(d.recordDate), d.description || '',
    d.severity || '', d.personsInvolved || '', d.actionTaken || '', d.image || '',
    JSON.stringify(d.attachments || []), d.status || 'Open', low(identity.email), nowIso(), nowIso()
  );
  return { success: true, id };
}

export async function updateSafetyRecord(env, identity, id, data) {
  const d = data || {};
  const existing = await first(env, 'SELECT * FROM SafetyRecords WHERE id = ?', id);
  if (!existing) throw new Error('That safety record no longer exists.');
  await run(
    env,
    `UPDATE SafetyRecords SET recordType = ?, recordDate = ?, description = ?, severity = ?,
       personsInvolved = ?, actionTaken = ?, image = ?, attachmentsJSON = ?, status = ?, updatedAt = ?
     WHERE id = ?`,
    d.recordType ?? existing.recordType,
    d.recordDate === undefined ? existing.recordDate : dayOf(d.recordDate),
    d.description ?? existing.description, d.severity ?? existing.severity,
    d.personsInvolved ?? existing.personsInvolved, d.actionTaken ?? existing.actionTaken,
    d.image ?? existing.image,
    d.attachments === undefined ? existing.attachmentsJSON : JSON.stringify(d.attachments),
    d.status ?? existing.status, nowIso(), id
  );
  return { success: true };
}

export async function deleteSafetyRecord(env, identity, id) {
  await run(env, 'DELETE FROM SafetyRecords WHERE id = ?', id);
  return { success: true };
}

export async function addDrawing(env, identity, data) {
  const d = data || {};
  const id = nextId('DWG');
  await run(
    env,
    `INSERT INTO Drawings (id, projectId, drawingNo, title, discipline, revision, drawingDate,
       fileUrl, fileName, remarks, status, uploadedBy, createdAt, updatedAt, previewUrls)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, d.projectId || '', d.drawingNo || '', d.title || '', d.discipline || '',
    d.revision || '', dayOf(d.drawingDate), d.fileUrl || '', d.fileName || '',
    d.remarks || '', d.status || 'Current', low(identity.email), nowIso(), nowIso(),
    JSON.stringify(d.previewUrls || [])
  );
  return { success: true, id };
}

export async function deleteDrawing(env, identity, id) {
  await run(env, 'DELETE FROM Drawings WHERE id = ?', id);
  return { success: true };
}

// ─── QA/QC ─────────────────────────────────────────────────────

export async function saveQaqcRecord(env, identity, data) {
  const d = data || {};
  const id = d.id || nextId('QC');
  const exists = d.id ? await first(env, 'SELECT id FROM QaqcRecords WHERE id = ?', d.id) : null;
  if (exists) {
    await run(
      env,
      `UPDATE QaqcRecords SET kind = ?, sowId = ?, description = ?, date = ?, requiredDate = ?,
         disposition = ?, rootCause = ?, testType = ?, sampleRef = ?, value = ?, unit = ?,
         requiredValue = ?, result = ?, status = ?, fileUrl = ?, fileName = ? WHERE id = ?`,
      d.kind || '', d.sowId || '', d.description || '', dayOf(d.date), dayOf(d.requiredDate),
      d.disposition || '', d.rootCause || '', d.testType || '', d.sampleRef || '',
      d.value || '', d.unit || '', num(d.requiredValue), d.result || '',
      d.status || 'Open', d.fileUrl || '', d.fileName || '', d.id
    );
    return { success: true, id: d.id };
  }
  await run(
    env,
    `INSERT INTO QaqcRecords (id, projectId, kind, sowId, description, date, requiredDate,
       closedDate, disposition, rootCause, testType, sampleRef, value, unit, requiredValue,
       result, status, fileUrl, fileName, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, d.projectId || '', d.kind || '', d.sowId || '', d.description || '', dayOf(d.date),
    dayOf(d.requiredDate), d.disposition || '', d.rootCause || '', d.testType || '',
    d.sampleRef || '', d.value || '', d.unit || '', num(d.requiredValue), d.result || '',
    d.status || 'Open', d.fileUrl || '', d.fileName || '', low(identity.email), nowIso()
  );
  return { success: true, id };
}

export async function closeQaqcRecord(env, identity, id, outcome, note) {
  await run(
    env,
    "UPDATE QaqcRecords SET status = 'Closed', closedDate = ?, result = ?, disposition = ? WHERE id = ?",
    nowIso(), outcome || '', note || '', id
  );
  await logActivity(env, identity.email, `QA/QC record ${id} closed.`, 'g');
  return { success: true };
}

// ─── PROJECT DOCUMENTS ─────────────────────────────────────────

export async function addProjectDocument(env, identity, data) {
  const d = data || {};
  const id = nextId('DOC');
  await run(
    env,
    `INSERT INTO ProjectDocuments (id, projectId, docNo, title, category, description, fileUrl,
       fileName, receivedFrom, receivedDate, version, supersedes, superseded, confidential,
       uploadedBy, uploadedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    id, d.projectId || '', d.docNo || '', d.title || '', d.category || '', d.description || '',
    d.fileUrl || '', d.fileName || '', d.receivedFrom || '', dayOf(d.receivedDate),
    num(d.version) || 1, d.supersedes || '', d.confidential ? 1 : 0, low(identity.email), nowIso()
  );
  // A revision is a new row; the one it replaces is marked, not edited.
  if (d.supersedes) await run(env, 'UPDATE ProjectDocuments SET superseded = 1 WHERE id = ?', d.supersedes);
  return { success: true, id };
}

export async function updateProjectDocument(env, identity, id, data) {
  const d = data || {};
  const existing = await first(env, 'SELECT * FROM ProjectDocuments WHERE id = ?', id);
  if (!existing) throw new Error('That document no longer exists.');
  await run(
    env,
    `UPDATE ProjectDocuments SET docNo = ?, title = ?, category = ?, description = ?,
       receivedFrom = ?, receivedDate = ?, confidential = ? WHERE id = ?`,
    d.docNo ?? existing.docNo, d.title ?? existing.title, d.category ?? existing.category,
    d.description ?? existing.description, d.receivedFrom ?? existing.receivedFrom,
    d.receivedDate === undefined ? existing.receivedDate : dayOf(d.receivedDate),
    d.confidential === undefined ? existing.confidential : (d.confidential ? 1 : 0), id
  );
  return { success: true };
}

export async function deleteProjectDocument(env, identity, id) {
  await run(env, 'DELETE FROM ProjectDocuments WHERE id = ?', id);
  return { success: true };
}

// ─── BILLINGS / VARIATION ORDERS ───────────────────────────────

export async function createBilling(env, identity, projectId, currentPct, period) {
  requireRole(identity, ['superadmin', 'admin'], 'creating a billing');
  const proj = await first(env, 'SELECT * FROM Projects WHERE id = ?', projectId);
  if (!proj) throw new Error('That project no longer exists.');

  const [vos, billings] = await Promise.all([
    all(env, "SELECT amount FROM VariationOrders WHERE projectId = ? AND lower(status) = 'approved'", projectId),
    all(env, 'SELECT currentPct FROM Billings WHERE projectId = ?', projectId),
  ]);
  const revised = num(proj.contractValue) + vos.reduce((t, v) => t + num(v.amount), 0);
  const prevPct = billings.reduce((mx, b) => Math.max(mx, num(b.currentPct)), 0);
  const pct = num(currentPct);
  if (pct <= prevPct) throw new Error(`Percentage must exceed the previous billing (${prevPct}%).`);

  const gross = revised * ((pct - prevPct) / 100);
  const retention = gross * num(proj.retentionPct);
  const id = nextId('BIL');

  await run(
    env,
    `INSERT INTO Billings (id, projectId, billingNo, period, prevPct, currentPct, grossAmount,
       retentionAmount, netAmount, status, submittedBy, createdAt, paidAt, billingType,
       dpRecoupment, vatAmount, vatPct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, '', 'Progress', '', 0, 0)`,
    id, projectId, String(billings.length + 1), period || '', prevPct, pct,
    gross, retention, gross - retention, low(identity.email), nowIso()
  );
  await logActivity(env, identity.email, `Billing ${id} created for ${projectId}.`, 'blue');
  return { success: true, id };
}

export async function markBillingPaid(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'marking a billing paid');
  const b = await first(env, 'SELECT * FROM Billings WHERE id = ?', id);
  if (!b) throw new Error('That billing no longer exists.');

  await run(env, "UPDATE Billings SET status = 'Paid', paidAt = ? WHERE id = ?", nowIso(), id);
  // Payment flows into the cash pipeline as approved incoming cash, so
  // revenue is recorded in exactly one place rather than double-entered.
  await run(
    env,
    `INSERT INTO IncomingCashRequests (id, type, projectId, requestor, requestorEmail, amount,
       description, paymentMethod, reference, transactionDate, attachmentsJSON, status, createdAt, sourceType)
     VALUES (?, 'Incoming Cash', ?, ?, ?, ?, ?, '', ?, ?, '[]', 'Approved', ?, 'Client Collection')`,
    nextId('IC'), b.projectId, identity.user.name || identity.email, low(identity.email),
    num(b.netAmount), `Payment for billing ${b.billingNo || id}`, id, dayOf(nowIso()), nowIso()
  );
  await logActivity(env, identity.email, `Billing ${id} marked paid.`, 'g');
  return { success: true };
}

export async function reviseBilling(env, identity, id, clientPct) {
  requireRole(identity, ['superadmin', 'admin'], 'revising a billing');
  const b = await first(env, 'SELECT * FROM Billings WHERE id = ?', id);
  if (!b) throw new Error('That billing no longer exists.');
  const proj = await first(env, 'SELECT contractValue, retentionPct FROM Projects WHERE id = ?', b.projectId);
  const pct = num(clientPct);
  const gross = num(proj.contractValue) * ((pct - num(b.prevPct)) / 100);
  const retention = gross * num(proj.retentionPct);
  await run(
    env,
    'UPDATE Billings SET currentPct = ?, grossAmount = ?, retentionAmount = ?, netAmount = ? WHERE id = ?',
    pct, gross, retention, gross - retention, id
  );
  return { success: true };
}

export async function deleteBilling(env, identity, id) {
  requireRole(identity, ['superadmin'], 'deleting a billing');
  await run(env, 'DELETE FROM Billings WHERE id = ?', id);
  await logActivity(env, identity.email, `Billing ${id} deleted.`, 'a');
  return { success: true };
}

export async function setDownpaymentPct(env, identity, projectId, pct) {
  requireRole(identity, ['superadmin', 'admin'], 'setting the downpayment');
  await run(env, 'UPDATE Projects SET downpaymentPct = ? WHERE id = ?', num(pct), projectId);
  return { success: true };
}

export async function createDownpaymentBilling(env, identity, projectId, period) {
  requireRole(identity, ['superadmin', 'admin'], 'creating a downpayment billing');
  const proj = await first(env, 'SELECT * FROM Projects WHERE id = ?', projectId);
  if (!proj) throw new Error('That project no longer exists.');
  const amount = num(proj.contractValue) * num(proj.downpaymentPct);
  if (amount <= 0) throw new Error('Set a downpayment percentage and contract value first.');

  const id = nextId('BIL');
  await run(
    env,
    `INSERT INTO Billings (id, projectId, billingNo, period, prevPct, currentPct, grossAmount,
       retentionAmount, netAmount, status, submittedBy, createdAt, paidAt, billingType,
       dpRecoupment, vatAmount, vatPct)
     VALUES (?, ?, 'DP', ?, 0, 0, ?, 0, ?, 'Pending', ?, ?, '', 'Downpayment', '', 0, 0)`,
    id, projectId, period || '', amount, amount, low(identity.email), nowIso()
  );
  await logActivity(env, identity.email, `Downpayment billing ${id} created.`, 'blue');
  return { success: true, id };
}

export async function requestVariationOrder(env, identity, projectId, data) {
  const d = data || {};
  const id = nextId('VO');
  await run(
    env,
    `INSERT INTO VariationOrders (id, projectId, sowId, description, amount, status, requestedBy, createdAt, decidedAt)
     VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, '')`,
    id, projectId, d.sowId || '', d.description || '', num(d.amount), low(identity.email), nowIso()
  );
  await logActivity(env, identity.email, `Variation order ${id} requested.`, 'blue');
  return { success: true, id };
}

// ─── QUOTATIONS ────────────────────────────────────────────────

export async function createQuotation(env, identity, data) {
  const d = data || {};
  const id = nextId('QTN');
  await run(
    env,
    `INSERT INTO Quotations (id, projectId, clientId, clientName, title, status, revision,
       quotedValue, validUntil, scopeNotes, exclusions, preparedBy, sentDate, decisionDate,
       decisionNote, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'Draft', '0', ?, ?, ?, ?, ?, '', '', '', ?, ?)`,
    id, d.projectId || '', d.clientId || '', d.clientName || '', d.title || '',
    num(d.quotedValue), dayOf(d.validUntil), d.scopeNotes || '', d.exclusions || '',
    low(identity.email), nowIso(), nowIso()
  );
  return { success: true, id };
}

export async function updateQuotation(env, identity, id, data) {
  const d = data || {};
  const existing = await first(env, 'SELECT * FROM Quotations WHERE id = ?', id);
  if (!existing) throw new Error('That quotation no longer exists.');
  await run(
    env,
    `UPDATE Quotations SET title = ?, clientId = ?, clientName = ?, quotedValue = ?, validUntil = ?,
       scopeNotes = ?, exclusions = ?, updatedAt = ? WHERE id = ?`,
    d.title ?? existing.title, d.clientId ?? existing.clientId, d.clientName ?? existing.clientName,
    d.quotedValue === undefined ? existing.quotedValue : num(d.quotedValue),
    d.validUntil === undefined ? existing.validUntil : dayOf(d.validUntil),
    d.scopeNotes ?? existing.scopeNotes, d.exclusions ?? existing.exclusions, nowIso(), id
  );
  return { success: true };
}

export async function setQuotationStatus(env, identity, id, status) {
  await run(env, 'UPDATE Quotations SET status = ?, updatedAt = ? WHERE id = ?', status || 'Draft', nowIso(), id);
  return { success: true };
}

export async function awardQuotation(env, identity, id, note) {
  await run(
    env, "UPDATE Quotations SET status = 'Awarded', decisionDate = ?, decisionNote = ?, updatedAt = ? WHERE id = ?",
    dayOf(nowIso()), note || '', nowIso(), id
  );
  await logActivity(env, identity.email, `Quotation ${id} awarded.`, 'g');
  return { success: true };
}

export async function loseQuotation(env, identity, id, note) {
  await run(
    env, "UPDATE Quotations SET status = 'Lost', decisionDate = ?, decisionNote = ?, updatedAt = ? WHERE id = ?",
    dayOf(nowIso()), note || '', nowIso(), id
  );
  return { success: true };
}

export async function deleteQuotation(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'deleting a quotation');
  await run(env, 'DELETE FROM QuotationRevisions WHERE quotationId = ?', id);
  await run(env, 'DELETE FROM Quotations WHERE id = ?', id);
  return { success: true };
}

export async function reviseQuotation(env, identity, id, note) {
  const q = await first(env, 'SELECT * FROM Quotations WHERE id = ?', id);
  if (!q) throw new Error('That quotation no longer exists.');
  const rev = num(q.revision) + 1;
  await run(
    env,
    `INSERT INTO QuotationRevisions (id, quotationId, revision, quotedValue, estimatedCost,
       sowCount, snapshotJSON, note, createdBy, createdAt)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
    nextId('QRV'), id, String(rev), num(q.quotedValue), JSON.stringify(q), note || '',
    low(identity.email), nowIso()
  );
  await run(env, 'UPDATE Quotations SET revision = ?, updatedAt = ? WHERE id = ?', String(rev), nowIso(), id);
  return { success: true, revision: rev };
}

// ─── LESSONS LEARNED ───────────────────────────────────────────

export async function addLesson(env, identity, data) {
  const d = data || {};
  const id = nextId('LL');
  await run(
    env,
    `INSERT INTO LessonsLearned (id, projectId, projectName, source, category, title, whatHappened,
       rootCause, impact, recommendation, metricsJSON, findingsJSON, suggestionsJSON, capturedBy,
       capturedAt, updatedAt)
     VALUES (?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, '{}', '[]', '[]', ?, ?, ?)`,
    id, d.projectId || '', d.projectName || '', d.category || '', d.title || '',
    d.whatHappened || '', d.rootCause || '', d.impact || '', d.recommendation || '',
    low(identity.email), nowIso(), nowIso()
  );
  return { success: true, id };
}

export async function updateLesson(env, identity, id, data) {
  const d = data || {};
  const existing = await first(env, 'SELECT * FROM LessonsLearned WHERE id = ?', id);
  if (!existing) throw new Error('That lesson no longer exists.');
  await run(
    env,
    `UPDATE LessonsLearned SET category = ?, title = ?, whatHappened = ?, rootCause = ?,
       impact = ?, recommendation = ?, updatedAt = ? WHERE id = ?`,
    d.category ?? existing.category, d.title ?? existing.title,
    d.whatHappened ?? existing.whatHappened, d.rootCause ?? existing.rootCause,
    d.impact ?? existing.impact, d.recommendation ?? existing.recommendation, nowIso(), id
  );
  return { success: true };
}

export async function deleteLesson(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'deleting a lesson');
  await run(env, 'DELETE FROM LessonsLearned WHERE id = ?', id);
  return { success: true };
}

export async function saveProjectRetrospective(env, identity, data) {
  return addLesson(env, identity, { ...(data || {}), source: 'auto' });
}
