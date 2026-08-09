/**
 * 34-DuplicateService.gs — Copying a project or a quotation (v12)
 *
 * WHY. Most quotations are a variation on one you have already priced:
 * the same lagoon liner, one cell instead of two, no anchor trench.
 * Re-typing forty SOW items and their estimates to change three of them
 * is how quoting becomes the bottleneck — and how a transcription error
 * gets into a price you are held to.
 *
 * ── WHAT IS COPIED, AND WHAT IS DELIBERATELY NOT ─────────────
 *
 * COPIED — the things that describe the WORK:
 *   · SOW items, with their hierarchy, quantities and budgets
 *   · estimates: groups, materials, labour, equipment, indirects
 *   · the schedule, offset so it starts when the new job starts
 *
 * NOT COPIED — the things that describe a HISTORY:
 *   · billings, cash advances, liquidations, releases
 *   · daily records, safety records, punchlist, drawings
 *   · purchase requests, orders, receipts, invoices
 *   · approvals and signatures
 *   · progress and actual cost
 *
 * That split is the whole design. A copy inherits what you PLANNED and
 * none of what HAPPENED. Carrying an approval across would mean four
 * admins had signed off a document they have never seen; carrying
 * progress across would mean a brand-new job opening at 62% complete.
 *
 * Estimates come across as DRAFT, never approved, for the same reason.
 * The prices are a starting point to review, not a decision already
 * taken — and reviewing them is exactly the step that makes a copy safe.
 */

/** duplicateProject - copies a project or quotation into a new one. */
function duplicateProject(sourceId, opts) {
  requireApprover_('duplicating a project');
  opts = opts || {};

  var src = readAll_('Projects').find(function (p) { return p.id === sourceId; });
  if (!src) throw new Error('Project not found.');
  assertProjectEditor_(sourceId);

  var asQuotation = opts.asQuotation !== false;   // default: a new quotation
  var newName = String(opts.name || '').trim();
  if (!newName) throw new Error('Give the copy a name.');

  if (readAll_('Projects').some(function (p) {
    return low_(p.name) === low_(newName) && low_(p.status) !== 'lost';
  })) {
    throw new Error('A project or quotation named "' + newName + '" already exists.');
  }

  var newId = nextId_(asQuotation ? 'QTN' : 'PRJ');
  var today = new Date();

  // ── the schedule offset ──
  // Dates are shifted by the gap between the two start dates, so the
  // shape of the programme survives. Copying the dates verbatim would
  // hand you a schedule that started last March.
  var srcStart = src.startDate ? new Date(src.startDate) : null;
  var newStart = opts.startDate ? new Date(opts.startDate) : today;
  var shiftDays = (srcStart && !isNaN(srcStart) && !isNaN(newStart))
    ? Math.round((newStart - srcStart) / 86400000)
    : 0;
  var shift_ = function (d) {
    if (!d) return '';
    var x = new Date(d);
    if (isNaN(x)) return '';
    x.setDate(x.getDate() + shiftDays);
    return fmtDate_(x);
  };

  appendRow_('Projects', {
    id: newId,
    name: newName,
    clientName: String(opts.clientName !== undefined ? opts.clientName : (src.clientName || '')),
    location: String(opts.location !== undefined ? opts.location : (src.location || '')),
    description: String(src.description || ''),
    contractValue: asQuotation ? 0 : (parseFloat(src.contractValue) || 0),
    quotedValue: asQuotation ? (parseFloat(src.quotedValue) || parseFloat(src.contractValue) || 0) : 0,
    retentionPct: src.retentionPct || '',
    downpaymentPct: src.downpaymentPct || '',
    startDate: fmtDate_(newStart),
    endDate: shift_(src.endDate),
    status: asQuotation ? 'Quotation' : 'Ongoing',
    revision: asQuotation ? 'A' : '',
    editorsJSON: src.editorsJSON || '[]',
    copiedFrom: sourceId,
    createdBy: currentUserEmail_().toLowerCase(),
    createdAt: today,
    updatedAt: today
  });

  // ── SOW items ──
  var sows = readAll_('SOWItems').filter(function (s) { return s.projectId === sourceId; });
  sows.forEach(function (s) {
    appendRow_('SOWItems', {
      id: s.id, projectId: newId,
      description: s.description, budget: s.budget, actual: 0,
      startDate: shift_(s.startDate), endDate: shift_(s.endDate),
      status: '', qty: s.qty, unit: s.unit,
      budgetMode: s.budgetMode, predecessors: s.predecessors,
      isMilestone: s.isMilestone,
      // No baseline: a baseline records what you committed to on a job
      // that has begun. A copy has committed to nothing yet.
      baselineStart: '', baselineEnd: '',
      sortOrder: s.sortOrder, isTitle: s.isTitle
    });
  });

  // ── estimates ──
  var groups = readAll_('EstimateGroups').filter(function (g) { return g.projectId === sourceId; });
  var mats = readAll_('EstimateMaterials');
  var labs = readAll_('EstimateLabor');
  var eqs = readAll_('EstimateEquipment');
  var inds = readAll_('EstimateIndirect');
  var lines = 0;

  groups.forEach(function (g) {
    var gid = nextId_('EG');
    appendRow_('EstimateGroups', {
      id: gid, projectId: newId, sowId: g.sowId, sowDescription: g.sowDescription,
      // ALWAYS draft. The prices are a starting point to review, not a
      // decision already taken, and reviewing them is the step that
      // makes a copy safe to quote from.
      status: 'draft', submittedBy: '', approvedAt: '',
      createdAt: today, updatedAt: today
    });
    mats.forEach(function (r) {
      if (String(r.groupId) !== String(g.id)) return;
      appendRow_('EstimateMaterials', Object.assign({}, r, { id: nextId_('EM'), groupId: gid }));
      lines++;
    });
    labs.forEach(function (r) {
      if (String(r.groupId) !== String(g.id)) return;
      appendRow_('EstimateLabor', Object.assign({}, r, { id: nextId_('EL'), groupId: gid }));
      lines++;
    });
    eqs.forEach(function (r) {
      if (String(r.groupId) !== String(g.id)) return;
      appendRow_('EstimateEquipment', Object.assign({}, r, { id: nextId_('EE'), groupId: gid }));
      lines++;
    });
    inds.forEach(function (r) {
      if (String(r.groupId) !== String(g.id)) return;
      appendRow_('EstimateIndirect', Object.assign({}, r, { id: nextId_('EI'), groupId: gid }));
      lines++;
    });
  });

  logActivity_((asQuotation ? 'Quotation ' : 'Project ') + newId + ' "' + newName +
    '" copied from ' + sourceId + ' — ' + sows.length + ' SOW item(s), ' +
    groups.length + ' estimate group(s), ' + lines + ' priced line(s). ' +
    'Estimates copied as DRAFT; no history, progress or approvals carried over.',
    'blue', newId);

  return {
    success: true, id: newId, name: newName,
    sowItems: sows.length, estimateGroups: groups.length, estimateLines: lines,
    shiftedDays: shiftDays, asQuotation: asQuotation
  };
}

/**
 * duplicatePreview - what a copy WOULD bring across, without doing it.
 * Read-only, so the confirm dialog can state real counts rather than a
 * vague promise about "the scope and estimates".
 */
function duplicatePreview(sourceId) {
  var src = readAll_('Projects').find(function (p) { return p.id === sourceId; });
  if (!src) throw new Error('Project not found.');

  var sows = readAll_('SOWItems').filter(function (s) { return s.projectId === sourceId; });
  var groups = readAll_('EstimateGroups').filter(function (g) { return g.projectId === sourceId; });
  var gids = {};
  groups.forEach(function (g) { gids[String(g.id)] = true; });

  var lines = 0, value = 0;
  ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment'].forEach(function (sheet) {
    readAll_(sheet).forEach(function (r) {
      if (!gids[String(r.groupId)]) return;
      lines++; value += parseFloat(r.cost) || 0;
    });
  });
  readAll_('EstimateIndirect').forEach(function (r) {
    if (!gids[String(r.groupId)]) return;
    lines++; value += parseFloat(r.amount) || 0;
  });

  return {
    sourceName: src.name,
    sourceStatus: src.status,
    sowItems: sows.length,
    titles: buildSowTree_(sows).filter(function (s) { return s.isHeading; }).length,
    estimateGroups: groups.length,
    estimateLines: lines,
    estimateValue: Math.round(value * 100) / 100,
    approvedGroups: groups.filter(function (g) { return low_(g.status) === 'approved'; }).length
  };
}
