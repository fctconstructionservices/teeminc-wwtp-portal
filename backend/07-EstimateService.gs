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
    // ── v22.2 FIX: KEYED ON THE NORMALISED ID ──
    // This keyed on the raw value. A sowId stored as the number 1.1 and
    // one stored as the text "1.1" are two different keys, so an
    // existing group was not found and a SECOND one was created beside
    // it — the duplicate you see on the Estimates tab after an import.
    if (row.projectId === projectId) bySow[_cellKey_(row.sowId)] = row;
  });

  // ── v11 BATCH I1: HEADINGS ARE REFUSED HERE ──
  // Filtering heading groups out on READ was not enough: this function
  // recreates a group for whatever the client sends, so a title kept
  // getting a fresh row on every save and the problem came straight
  // back. The guard belongs on the WRITE, where it is authoritative
  // whatever the client believes.
  const headingIds = {};
  buildSowTree_(readAll_('SOWItems').filter(function (x) {
    return x.projectId === projectId;
  })).forEach(function (x) { if (x.isHeading) headingIds[_cellKey_(x.id)] = true; });

  const gHeads = headers_('EstimateGroups');
  const targets = [];
  const newGroupRows = [];
  const refused = [];
  (groups || []).forEach(function (g) {
    if (headingIds[_cellKey_(g.sowId)]) { refused.push(g.sowId); return; }
    const row = bySow[_cellKey_(g.sowId)];
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
      // v22.2: this writes rows in bulk rather than through appendRow_,
      // so the identifier guard has to be applied here too. Without it
      // the sowId is stored as a number, stops matching its SOW item,
      // and the next save creates ANOTHER group beside this one.
      newGroupRows.push(gHeads.map(function (h) {
        var v = (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
        return _textIfIdentifier_(h, v);
      }));
    }
    targets.push({ groupId: groupId, g: g });
  });

  // Old data self-heals: a stale group belonging to a heading is removed
  // ONLY when it is empty. One holding priced lines is left for a person
  // to move — deleting money to tidy a display is not a trade worth
  // making, and the SOW tab's "Check titles" reports those.
  Object.keys(headingIds).forEach(function (sid) {
    var row = bySow[_cellKey_(sid)];
    if (!row) return;
    var lines = 0;
    ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment'].forEach(function (sheet) {
      readAll_(sheet).forEach(function (r) { if (String(r.groupId) === String(row.id)) lines++; });
    });
    readAll_('EstimateIndirect').forEach(function (r) { if (String(r.groupId) === String(row.id)) lines++; });
    if (lines === 0) deleteRow_('EstimateGroups', 'id', row.id);
  });

  if (newGroupRows.length) {
    const gsh = sheet_('EstimateGroups');
    gsh.getRange(gsh.getLastRow() + 1, 1, newGroupRows.length, gHeads.length).setValues(newGroupRows);
    _invalidateRead_('EstimateGroups');
  }
  if (!targets.length) return { success: true, saved: 0, refused: refused };

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
  return { success: true, saved: targets.length, refused: refused };
}


function submitEstimatesForApproval(projectId, sowId) {
  assertProjectEditor_(projectId);   // v6.6
  const g = readAll_('EstimateGroups').find(function (row) { return row.projectId === projectId && row.sowId === sowId; });
  if (!g) throw new Error('Estimate group not found');
  updateRow_('EstimateGroups', 'id', g.id, { status: 'pending', submittedBy: currentUserEmail_() });

  // ── v11 BATCH I1: SUPER ADMIN AUTO-APPROVE ──
  // Every other request type has behaved this way since Batch A, but
  // estimates were missed — so a Super Admin submitted an estimate and
  // then had to wait for approvers who, by the system's own rules,
  // could never be needed. The approval routes through approveEstimates
  // so the budget write-back and the activity log happen exactly as they
  // do for a normal approval; short-circuiting the status would skip
  // both and leave the SOW budget unwritten.
  if (currentUserRole_() === 'superadmin') {
    approveEstimates(projectId, sowId);
    logActivity_('Estimate for ' + sowId + ' approved on submission by Super Admin ' +
      currentUserName_(), 'g');
    return { success: true, autoApproved: true };
  }

  logActivity_('Estimate for ' + sowId + ' submitted for approval by ' + currentUserName_(), 'g');
  return { success: true, autoApproved: false };
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