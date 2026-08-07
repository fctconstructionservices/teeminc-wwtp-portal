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
  // ══ v6.7 PERF REWRITE ══
  // The old version looped per GROUP, and each group rewrote all four
  // child sheets — submitting on a 10-group project meant ~120 whole-
  // sheet operations. Now the batching is per SHEET across every group
  // in the payload: each of the four child sheets gets exactly ONE read,
  // ONE clear, ONE write, no matter how many groups are being saved.
  // Locked groups (pending/approved) are skipped entirely — their line
  // items are frozen by the approval flow and must not be rewritten.
  const allGroups = readAll_('EstimateGroups');
  const bySow = {};
  allGroups.forEach(function (row) {
    if (row.projectId === projectId) bySow[row.sowId] = row;
  });

  const gHeads = headers_('EstimateGroups');
  const targets = [];
  const newGroupRows = [];
  (groups || []).forEach(function (g) {
    const row = bySow[g.sowId];
    if (row && (row.status === 'approved' || row.status === 'pending')) return;   // locked
    let groupId;
    if (row) {
      groupId = row.id;
      if (String(row.sowDescription || '') !== String(g.sowDescription || '')) {
        updateRow_('EstimateGroups', 'id', groupId, { sowDescription: g.sowDescription });
      }
    } else {
      groupId = nextId_('EG');
      const obj = { id: groupId, projectId: projectId, sowId: g.sowId, sowDescription: g.sowDescription, status: 'draft' };
      newGroupRows.push(gHeads.map(function (h) {
        return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
      }));
    }
    targets.push({ groupId: groupId, g: g });
  });

  if (newGroupRows.length) {
    const gsh = sheet_('EstimateGroups');
    gsh.getRange(gsh.getLastRow() + 1, 1, newGroupRows.length, gHeads.length).setValues(newGroupRows);
    _invalidateRead_('EstimateGroups');
  }
  if (!targets.length) return { success: true, saved: 0 };

  const targetIds = {};
  targets.forEach(function (t) { targetIds[String(t.groupId)] = true; });

  const SPECS = [
    ['EstimateMaterials', 'materials', ['material', 'materialName', 'desc', 'qty', 'rate', 'cost', 'unit']],
    ['EstimateLabor', 'labor', ['role', 'desc', 'qty', 'duration', 'rate', 'cost']],
    ['EstimateEquipment', 'equipment', ['equipment', 'equipName', 'desc', 'qty', 'duration', 'rate', 'cost', 'unit']],
    ['EstimateIndirect', 'indirect', ['desc', 'type', 'amount', 'multiplier']]
  ];
  SPECS.forEach(function (spec) {
    const sheetName = spec[0], key = spec[1], fields = spec[2];
    const sh = sheet_(sheetName);
    const heads = headers_(sheetName);
    const gi = heads.indexOf('groupId');
    const lastRow = sh.getLastRow();

    let kept = [];
    if (lastRow >= 2) {
      kept = sh.getRange(2, 1, lastRow - 1, heads.length).getValues().filter(function (r) {
        return !targetIds[String(r[gi])] && r.join('') !== '';
      });
    }
    const fresh = [];
    targets.forEach(function (t) {
      (t.g[key] || []).forEach(function (item) {
        const obj = { id: item.id || nextId_('EI'), groupId: t.groupId };
        fields.forEach(function (f) { obj[f] = item[f]; });
        fresh.push(heads.map(function (h) {
          return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
        }));
      });
    });
    const all = kept.concat(fresh);
    if (lastRow >= 2) sh.getRange(2, 1, lastRow - 1, heads.length).clearContent();
    if (all.length) sh.getRange(2, 1, all.length, heads.length).setValues(all);
    _invalidateRead_(sheetName);
  });
  return { success: true, saved: targets.length };
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
  requireApprover_('approving estimates');   // v7.0
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
      // v11 BATCH B: scoped to id + projectId. SOW ids are hand-typed
      // and repeat across projects, so approving an estimate here could
      // overwrite the budget of the same-numbered SOW in another project.
      updateRowWhere_('SOWItems', { id: sowId, projectId: projectId }, { budget: newBudget });
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