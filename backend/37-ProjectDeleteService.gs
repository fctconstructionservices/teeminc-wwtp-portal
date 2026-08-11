/**
 * 37-ProjectDeleteService.gs — Removing a project, completely. (v16)
 *
 * ── WHY THIS DID NOT EXIST UNTIL NOW ─────────────────────────
 *
 * Deleting the Projects row is the easy part and the wrong part. A live
 * project has rows in TWENTY-FOUR other sheets, and removing only the
 * header leaves ORPHANED MONEY: cash releases belonging to no project,
 * payables with no source, estimate lines pointing at a group that is
 * gone. Those rows still reach the portfolio totals and the cashflow,
 * so the system does not break visibly — it is quietly, permanently
 * slightly wrong, and nobody can work out why.
 *
 * That is worse than not being able to delete at all, which is why I
 * left it out. This does it properly.
 *
 * ── WHAT THIS IS FOR, AND WHAT IT IS NOT ─────────────────────
 *
 * It is for a project that should never have existed: a test, a
 * duplicate, a mis-keyed entry.
 *
 * It is NOT the right tool for a real project that ended. A cancelled
 * job still owes suppliers and still has cash out; a finished one is
 * needed for tax, warranty and any future dispute. Those get ARCHIVED
 * — see archiveProject below — which takes them out of every live list
 * while leaving the books intact.
 *
 * Nothing here can bring a deleted project back. The confirmation asks
 * for the project NAME rather than a yes/no because a name has to be
 * read and typed, and by the time someone has typed "BF2/NF2 Lagoon
 * Liner" they have noticed which project they are about to destroy.
 */

/**
 * PROJECT_LINKS - every sheet that hangs off a project.
 *
 * Kept as data rather than as code, so adding a sheet to the system is
 * one line here instead of a delete path somebody forgets. A forgotten
 * sheet is exactly how orphaned money happens.
 */
var PROJECT_DIRECT = ['SOWItems', 'DailyRecords', 'EstimateGroups', 'CashAdvanceRequests',
  'CashRelease', 'Liquidations', 'IncomingCashRequests', 'OTRequests', 'Punchlist',
  'PurchaseRequests', 'PurchaseOrders', 'Receipts', 'SupplierInvoices',
  'Quotations', 'LessonsLearned', 'SafetyRecords', 'Drawings', 'Billings',
  'VariationOrders', 'Comments'];

/**
 * previewProjectDelete - what would go. Read-only.
 *
 * Shown before anything happens because "delete this project" means
 * very little; "delete 3 billings worth ₱1.2M and 47 daily records"
 * means something a person can actually decide about.
 */
function previewProjectDelete(projectId) {
  requireSuperAdmin_('deleting a project');
  var proj = readAll_('Projects').find(function (p) { return p.id === projectId; });
  if (!proj) throw new Error('Project not found.');

  var counts = {}, total = 0;
  PROJECT_DIRECT.forEach(function (sheet) {
    if (!ss_().getSheetByName(sheet)) return;
    var n = readAll_(sheet).filter(function (r) { return r.projectId === projectId; }).length;
    if (n) { counts[sheet] = n; total += n; }
  });

  // Indirect rows: estimate lines hang off groups, PR/PO lines off their
  // headers. They carry no projectId of their own, so a delete that only
  // matched on projectId would leave every one of them behind.
  var groupIds = readAll_('EstimateGroups')
    .filter(function (g) { return g.projectId === projectId; })
    .map(function (g) { return String(g.id); });
  var estLines = 0;
  ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment', 'EstimateIndirect'].forEach(function (sheet) {
    estLines += readAll_(sheet).filter(function (r) {
      return groupIds.indexOf(String(r.groupId)) > -1; }).length;
  });
  if (estLines) { counts.EstimateLines = estLines; total += estLines; }

  var prIds = readAll_('PurchaseRequests')
    .filter(function (r) { return r.projectId === projectId; })
    .map(function (r) { return String(r.id); });
  var prLines = ss_().getSheetByName('PRLines')
    ? readAll_('PRLines').filter(function (l) { return prIds.indexOf(String(l.prId)) > -1; }).length : 0;
  if (prLines) { counts.PRLines = prLines; total += prLines; }

  var poIds = ss_().getSheetByName('PurchaseOrders')
    ? readAll_('PurchaseOrders').filter(function (r) { return r.projectId === projectId; })
        .map(function (r) { return String(r.id); }) : [];
  var poLines = ss_().getSheetByName('POLines')
    ? readAll_('POLines').filter(function (l) { return poIds.indexOf(String(l.poId)) > -1; }).length : 0;
  if (poLines) { counts.POLines = poLines; total += poLines; }

  // The money is reported separately from the row count, because three
  // billings and ₱1.2M are different facts and only the second one
  // makes somebody stop.
  var money = {
    billed: readAll_('Billings').filter(function (b) { return b.projectId === projectId; })
      .reduce(function (s, b) { return s + (parseFloat(b.netAmount) || 0); }, 0),
    cashOut: readAll_('CashRelease').filter(function (r) {
      return r.projectId === projectId && low_(r.status) === 'reviewed'; })
      .reduce(function (s, r) { return s + (parseFloat(r.amount) || 0); }, 0),
    collected: readAll_('IncomingCashRequests').filter(function (r) {
      return r.projectId === projectId && low_(r.status) === 'approved'; })
      .reduce(function (s, r) { return s + (parseFloat(r.amount) || 0); }, 0)
  };

  return {
    id: proj.id, name: proj.name, status: proj.status,
    counts: counts, totalRows: total, money: money,
    hasMoney: (money.billed + money.cashOut + money.collected) > 0
  };
}

/**
 * deleteProject - removes the project and everything attached to it.
 *
 * Super Admin only, and the caller must pass the project's exact name.
 * A yes/no dialog is dismissed by reflex; a name has to be read.
 */
function deleteProject(projectId, confirmName) {
  requireSuperAdmin_('deleting a project');
  var proj = readAll_('Projects').find(function (p) { return p.id === projectId; });
  if (!proj) throw new Error('Project not found.');

  if (String(confirmName || '').trim() !== String(proj.name).trim()) {
    throw new Error('Type the project name exactly to confirm: "' + proj.name + '"');
  }

  var preview = previewProjectDelete(projectId);

  // Order matters: children before parents, so a failure part-way
  // through leaves fewer orphans rather than more.
  var groupIds = readAll_('EstimateGroups')
    .filter(function (g) { return g.projectId === projectId; })
    .map(function (g) { return String(g.id); });
  ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment', 'EstimateIndirect'].forEach(function (sheet) {
    if (groupIds.length) deleteRowsByValues_(sheet, 'groupId', groupIds);
  });

  var prIds = readAll_('PurchaseRequests')
    .filter(function (r) { return r.projectId === projectId; })
    .map(function (r) { return String(r.id); });
  if (prIds.length && ss_().getSheetByName('PRLines')) deleteRowsByValues_('PRLines', 'prId', prIds);

  var poIds = ss_().getSheetByName('PurchaseOrders')
    ? readAll_('PurchaseOrders').filter(function (r) { return r.projectId === projectId; })
        .map(function (r) { return String(r.id); }) : [];
  if (poIds.length && ss_().getSheetByName('POLines')) deleteRowsByValues_('POLines', 'poId', poIds);

  // Approval signatures are keyed on the request id, not the project,
  // so they are collected from every request this project owned.
  var reqIds = [];
  ['CashAdvanceRequests', 'CashRelease', 'Liquidations', 'IncomingCashRequests',
   'OTRequests', 'Billings', 'PurchaseRequests', 'DailyRecords'].forEach(function (sheet) {
    if (!ss_().getSheetByName(sheet)) return;
    readAll_(sheet).forEach(function (r) {
      if (r.projectId === projectId && r.id) reqIds.push(String(r.id));
    });
  });
  if (reqIds.length) deleteRowsByValues_('Approvals', 'requestId', reqIds);
  if (groupIds.length) deleteRowsByValues_('Approvals', 'requestId', groupIds);

  PROJECT_DIRECT.forEach(function (sheet) {
    if (!ss_().getSheetByName(sheet)) return;
    deleteRowsWhere_(sheet, { projectId: projectId });
  });

  deleteRow_('Projects', 'id', projectId);

  logActivity_('PROJECT DELETED — "' + proj.name + '" (' + projectId + ') and ' +
    preview.totalRows + ' attached row(s) removed by ' + currentUserName_() +
    (preview.hasMoney
      ? '. This project held money: ' + fmtMoney_(preview.money.billed) + ' billed, ' +
        fmtMoney_(preview.money.cashOut) + ' released, ' +
        fmtMoney_(preview.money.collected) + ' collected.'
      : '. No money was attached.'), 'a', projectId);

  return { success: true, name: proj.name, rowsRemoved: preview.totalRows, money: preview.money };
}

/**
 * archiveProject - the right answer for a real project that ended.
 *
 * Takes it out of every live list — the dashboard, the portfolio, the
 * cashflow, the project picker — while leaving every row where it is.
 * A finished job is still needed for tax, warranty and any dispute, and
 * a cancelled one still owes suppliers.
 *
 * isLiveProject_ already excludes anything that is not Ongoing, so this
 * needs no changes anywhere else.
 */
function archiveProject(projectId, reason) {
  requireSuperAdmin_('archiving a project');
  var proj = readAll_('Projects').find(function (p) { return p.id === projectId; });
  if (!proj) throw new Error('Project not found.');
  if (low_(proj.status) === 'archived') throw new Error('That project is already archived.');

  updateRow_('Projects', 'id', projectId, {
    status: 'Archived',
    archivedAt: new Date(),
    archiveReason: String(reason || ''),
    previousStatus: proj.status || ''
  });
  logActivity_('Project "' + proj.name + '" archived by ' + currentUserName_() +
    (reason ? ' — ' + reason : '') + '. All records kept.', 'a', projectId);
  return { success: true, name: proj.name };
}

/** unarchiveProject - puts it back where it was. */
function unarchiveProject(projectId) {
  requireSuperAdmin_('restoring a project');
  var proj = readAll_('Projects').find(function (p) { return p.id === projectId; });
  if (!proj) throw new Error('Project not found.');
  updateRow_('Projects', 'id', projectId, {
    status: proj.previousStatus || 'Ongoing',
    archivedAt: '', archiveReason: ''
  });
  logActivity_('Project "' + proj.name + '" restored by ' + currentUserName_(), 'g', projectId);
  return { success: true };
}
