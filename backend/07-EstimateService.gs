/**
 * 07-EstimateService.gs — SOW cost estimates
 *
 * PURPOSE: Saving and approving per-SOW estimates. Each SOW has one
 * EstimateGroups row; its line items live in EstimateMaterials /
 * EstimateLabor / EstimateEquipment / EstimateIndirect keyed by
 * groupId. saveEstimates() replaces all children of a group
 * (delete-then-insert) so the sheet always mirrors the editor state.
 *
 * On approval, the computed group total is written back to the
 * SOW item's budget — this is the SOW Budget <-> Estimates link.
 */

// ============================================================
//  ESTIMATES
// ============================================================

function saveEstimates(projectId, groups) {
  assertProjectEditor_(projectId);   // v6.6
  // v6.6 PERF: read the group index ONCE for the whole save
  const allGroups = readAll_('EstimateGroups');
  const bySow = {};
  allGroups.forEach(function (row) {
    if (row.projectId === projectId) bySow[row.sowId] = row;
  });
  groups.forEach(function (g) {
    let groupRow = bySow[g.sowId];
    let groupId;
    if (groupRow) {
      groupId = groupRow.id;
      updateRow_('EstimateGroups', 'id', groupId, { sowDescription: g.sowDescription });
    } else {
      groupId = nextId_('EG');
      appendRow_('EstimateGroups', {
        id: groupId, projectId: projectId, sowId: g.sowId,
        sowDescription: g.sowDescription, status: 'draft'
      });
    }
    replaceGroupChildren_('EstimateMaterials', groupId, g.materials || [], ['material', 'materialName', 'desc', 'qty', 'rate', 'cost', 'unit']);
    replaceGroupChildren_('EstimateLabor', groupId, g.labor || [], ['role', 'desc', 'qty', 'duration', 'rate', 'cost']);
    replaceGroupChildren_('EstimateEquipment', groupId, g.equipment || [], ['equipment', 'equipName', 'desc', 'qty', 'duration', 'rate', 'cost', 'unit']);
    replaceGroupChildren_('EstimateIndirect', groupId, g.indirect || [], ['desc', 'type', 'amount', 'multiplier']);
  });
  return { success: true };
}

/**
 * replaceGroupChildren_ (rewritten v6.6 for speed) - The old version
 * issued one deleteRow per removed line and one appendRow per new line —
 * a 30-item estimate cost ~40 separate write round-trips, which is why
 * submitting felt slow (and slow saves invite double-clicks and errors).
 * Now: ONE read of the sheet, rebuild in memory (drop this group's rows,
 * append the new ones), ONE clear + ONE setValues. Three calls total per
 * sheet regardless of item count.
 */
function replaceGroupChildren_(sheetName, groupId, items, fields) {
  const sh = sheet_(sheetName);
  const heads = headers_(sheetName);
  const groupIdx = heads.indexOf('groupId');
  const lastRow = sh.getLastRow();

  // read once; keep every row that is NOT this group's
  let kept = [];
  if (lastRow >= 2) {
    const values = sh.getRange(2, 1, lastRow - 1, heads.length).getValues();
    kept = values.filter(function (row) {
      return String(row[groupIdx]) !== String(groupId) && row.join('') !== '';
    });
  }

  // build the group's new rows in memory
  const fresh = (items || []).map(function (item) {
    const obj = { id: item.id || nextId_('EI'), groupId: groupId };
    fields.forEach(function (f) { obj[f] = item[f]; });
    return heads.map(function (h) {
      return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
    });
  });

  const all = kept.concat(fresh);
  if (lastRow >= 2) sh.getRange(2, 1, lastRow - 1, heads.length).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, heads.length).setValues(all);
  _invalidateRead_(sheetName);   // bypassed appendRow_, so invalidate manually
}

function submitEstimatesForApproval(projectId, sowId) {
  assertProjectEditor_(projectId);   // v6.6
  const g = readAll_('EstimateGroups').find(function (row) { return row.projectId === projectId && row.sowId === sowId; });
  if (!g) throw new Error('Estimate group not found');
  updateRow_('EstimateGroups', 'id', g.id, { status: 'pending', submittedBy: currentUserEmail_() });
  logActivity_('Estimate for ' + sowId + ' submitted for approval by ' + currentUserName_(), 'g');
  return { success: true };
}

function approveEstimates(projectId, sowId) {
  const g = readAll_('EstimateGroups').find(function (row) { return row.projectId === projectId && row.sowId === sowId; });
  let newBudget = null;
  if (g) {
    updateRow_('EstimateGroups', 'id', g.id, { status: 'approved' });
    // v3: the write-back respects the SOW item's budgetMode —
    //   auto     -> materials + labor + equipment
    //   indirect -> indirect costs only
    //   manual   -> hands off; the user typed the budget themselves
    const sow = readAll_('SOWItems').find(function (s) { return s.id === sowId && s.projectId === projectId; });
    const mode = (sow && sow.budgetMode) || 'auto';
    if (mode !== 'manual') {
      newBudget = computeEstimateGroupTotalByMode_(g.id, mode);
      updateRow_('SOWItems', 'id', sowId, { budget: newBudget });
    }
  }
  logActivity_('Estimate for ' + sowId + ' approved' + (newBudget !== null ? ' — SOW budget set to ₱' + newBudget.toFixed(2) : ''), 'g');
  return { success: true, budget: newBudget };
}

function computeEstimateGroupTotal_(groupId) {
  const matSum = readAll_('EstimateMaterials').filter(function (m) { return m.groupId === groupId; })
    .reduce(function (s, m) { return s + (parseFloat(m.cost) || 0); }, 0);
  const laborSum = readAll_('EstimateLabor').filter(function (l) { return l.groupId === groupId; })
    .reduce(function (s, l) { return s + (parseFloat(l.cost) || 0); }, 0);
  const eqSum = readAll_('EstimateEquipment').filter(function (e) { return e.groupId === groupId; })
    .reduce(function (s, e) { return s + (parseFloat(e.cost) || 0); }, 0);
  const indSum = readAll_('EstimateIndirect').filter(function (i) { return i.groupId === groupId; })
    .reduce(function (s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
  return matSum + laborSum + eqSum + indSum;
}


/**
 * computeEstimateGroupTotalByMode_ (v3) - Group total filtered by the
 * SOW budgetMode. 'auto' = direct costs (materials+labor+equipment);
 * 'indirect' = indirect costs only. Used by getProjectData (live
 * display), updateSOWBudget and approveEstimates (write-back).
 */
function computeEstimateGroupTotalByMode_(groupId, mode) {
  if (mode === 'indirect') {
    return readAll_('EstimateIndirect').filter(function (i) { return i.groupId === groupId; })
      .reduce(function (s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
  }
  // 'auto': direct costs only
  const matSum = readAll_('EstimateMaterials').filter(function (m) { return m.groupId === groupId; })
    .reduce(function (s, m) { return s + (parseFloat(m.cost) || 0); }, 0);
  const laborSum = readAll_('EstimateLabor').filter(function (l) { return l.groupId === groupId; })
    .reduce(function (s, l) { return s + (parseFloat(l.cost) || 0); }, 0);
  const eqSum = readAll_('EstimateEquipment').filter(function (e) { return e.groupId === groupId; })
    .reduce(function (s, e) { return s + (parseFloat(e.cost) || 0); }, 0);
  return matSum + laborSum + eqSum;
}