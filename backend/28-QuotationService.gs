/**
 * 28-QuotationService.gs — Quotation lifecycle (v11 BATCH F2)
 *
 * PURPOSE: Item 9. Work that is still being quoted needs a status of its
 * own, its own reference number, and a clean transition to Ongoing the
 * day it is awarded.
 *
 * ── THE DESIGN DECISION THAT MATTERS ─────────────────────────
 *
 * A quotation IS a project row with status 'Quotation'.
 *
 * The obvious alternative was a parallel set of sheets — QuotationSOW,
 * QuotationEstimateMaterials, QuotationEstimateLabor and so on — and
 * then copying everything across on award. That would have meant five
 * duplicated sheets, a duplicated estimate editor, and a copy routine
 * that silently drifts out of step with the real one the first time
 * either side changes.
 *
 * Instead, creating a quotation creates a Projects row with status
 * 'Quotation'. Every tool already built — the SOW Budget tab, the
 * Estimates editor, the DUPA print, the Timeline — works on it
 * unchanged, because they all key on projectId and neither knows nor
 * cares what the status says.
 *
 * AWARDING THEREFORE COPIES NOTHING. It flips the status to 'Ongoing',
 * writes the contract value, and saves the current schedule as the
 * baseline. The SOW and estimates you priced during tendering ARE the
 * project's baseline — which is what you want, and is impossible to get
 * wrong because nothing moved.
 *
 * THE COST OF THIS CHOICE, stated plainly: a quotation occupies a row in
 * Projects from day one, so every list of projects has to filter it out.
 * isLiveProject_() does that in one place and is applied at each surface.
 * That is a smaller and more visible price than a copy routine.
 *
 * REVISIONS are snapshots, not forks. Revising records the current
 * priced position into QuotationRevisions and bumps the letter; the
 * working SOW and estimates stay live and editable. A quotation goes
 * through five revisions in a fortnight, and forking the whole estimate
 * each time would leave five near-identical copies nobody can diff.
 */

var QUOTE_STATUSES = ['Draft', 'Sent', 'Under Negotiation', 'Won', 'Lost'];

/**
 * isLiveProject_ - true for a real, awarded project.
 *
 * Quotations and lost bids live in the Projects sheet but are not
 * projects. Every list, dashboard, dropdown and metric must exclude
 * them, or an unwon tender would sit in your portfolio revenue at zero
 * and drag every average down.
 */
function isLiveProject_(p) {
  var s = String((p && p.status) || '').toLowerCase();
  return s !== 'quotation' && s !== 'lost';
}

/** nextQuoteNumber_ - QTN-<year>-#### , sequential within the year. */
function nextQuoteNumber_() {
  ensureSheet_('Quotations');
  var year = new Date().getFullYear();
  var prefix = 'QTN-' + year + '-';
  var max = 0;
  readAll_('Quotations').forEach(function (q) {
    var m = String(q.id || '').match(/^QTN-(\d{4})-(\d+)$/);
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
  });
  return prefix + String(max + 1).padStart(4, '0');
}

/**
 * quotationCost_ - What the job is estimated to COST, from the estimate
 * line items already entered against this quotation's SOW.
 *
 * Shown next to the quoted PRICE so the margin is visible while you are
 * still deciding the number — which is the one moment it can still be
 * changed.
 */
function quotationCost_(projectId) {
  var groups = readAll_('EstimateGroups').filter(function (g) { return g.projectId === projectId; });
  if (!groups.length) return 0;
  var ids = {};
  groups.forEach(function (g) { ids[String(g.id)] = true; });
  var total = 0;
  ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment'].forEach(function (sheet) {
    readAll_(sheet).forEach(function (r) {
      if (ids[String(r.groupId)]) total += parseFloat(r.cost) || 0;
    });
  });
  readAll_('EstimateIndirect').forEach(function (r) {
    if (ids[String(r.groupId)]) total += parseFloat(r.amount) || 0;
  });
  return Math.round(total * 100) / 100;
}

/** getQuotations - every quotation, newest first, with live cost + margin. */
function getQuotations() {
  ensureSheet_('Quotations');
  ensureSheet_('QuotationRevisions');
  readMany_(['Quotations', 'QuotationRevisions', 'Projects', 'SOWItems',
    'EstimateGroups', 'EstimateMaterials', 'EstimateLabor',
    'EstimateEquipment', 'EstimateIndirect', 'ClientLists']);

  var projects = {};
  readAll_('Projects').forEach(function (p) { projects[p.id] = p; });
  var revCount = {};
  readAll_('QuotationRevisions').forEach(function (r) {
    revCount[r.quotationId] = (revCount[r.quotationId] || 0) + 1;
  });
  var sowCount = {};
  readAll_('SOWItems').forEach(function (s) {
    sowCount[s.projectId] = (sowCount[s.projectId] || 0) + 1;
  });

  var rows = readAll_('Quotations').map(function (q) {
    var cost = quotationCost_(q.projectId);
    var price = parseFloat(q.quotedValue) || 0;
    q.estimatedCost = cost;
    q.margin = price - cost;
    q.marginPct = price > 0 ? Math.round((price - cost) / price * 1000) / 10 : 0;
    q.sowCount = sowCount[q.projectId] || 0;
    q.revisionCount = revCount[q.id] || 0;
    q.projectStatus = (projects[q.projectId] || {}).status || '';
    return q;
  });
  rows.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return sanitizeDatesDeep_(rows);
}

/**
 * createQuotation - Creates the Quotations row AND its shell Projects
 * row, so the SOW and Estimates tabs work on it immediately.
 *
 * `projectId` is the id the eventual PROJECT will carry. It is asked for
 * up front and never changes, because renaming a project id afterwards
 * would have to cascade through SOWItems, all four estimate sheets,
 * billings, variations and daily records — the same class of bug fixed
 * in Batch B. Better to choose it once.
 */
function createQuotation(data) {
  requireApprover_('creating a quotation');
  ensureSheet_('Quotations');
  ensureSheet_('QuotationRevisions');

  if (!data || !data.title) throw new Error('A title is required.');

  var quoteId = String(data.id || '').trim() || nextQuoteNumber_();
  if (readAll_('Quotations').some(function (q) { return q.id === quoteId; })) {
    throw new Error('Quotation number "' + quoteId + '" already exists.');
  }

  var projectId = String(data.projectId || '').trim() || quoteId;
  if (!/^[A-Za-z0-9._\- ]{1,40}$/.test(projectId)) {
    throw new Error('Project ID may only contain letters, numbers, dots, dashes, underscores and spaces (max 40).');
  }
  if (readAll_('Projects').some(function (p) { return p.id === projectId; })) {
    throw new Error('Project ID "' + projectId + '" is already in use.');
  }

  var client = data.clientId
    ? readAll_('ClientLists').find(function (c) { return c.id === data.clientId; })
    : null;
  if (data.clientId && !client) throw new Error('Selected client not found.');

  // the shell project — status 'Quotation' keeps it out of every
  // project list while making every project tool available to it
  appendRow_('Projects', {
    id: projectId,
    name: String(data.title),
    status: 'Quotation',
    revenue: 0, expenses: 0, cashPosition: 0,
    clientId: data.clientId || '',
    location: data.location || '',
    startDate: '', endDate: '',
    contractValue: 0,
    retentionPct: data.retentionPct !== undefined ? parseFloat(data.retentionPct) : 0.10,
    downpaymentPct: data.downpaymentPct !== undefined ? parseFloat(data.downpaymentPct) : 0
  });

  appendRow_('Quotations', {
    id: quoteId,
    projectId: projectId,
    clientId: data.clientId || '',
    clientName: client ? client.name : String(data.clientName || ''),
    title: String(data.title),
    status: 'Draft',
    revision: 'A',
    quotedValue: parseFloat(data.quotedValue) || 0,
    validUntil: data.validUntil || '',
    scopeNotes: String(data.scopeNotes || ''),
    exclusions: String(data.exclusions || ''),
    preparedBy: currentUserEmail_().toLowerCase(),
    sentDate: '',
    decisionDate: '',
    decisionNote: '',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  logActivity_('Quotation ' + quoteId + ' created for ' +
    (client ? client.name : 'a client') + ' — "' + data.title + '"', 'blue', quoteId);
  return { success: true, id: quoteId, projectId: projectId };
}

/** updateQuotation - commercial fields. Locked once the bid is decided. */
function updateQuotation(id, data) {
  var q = readAll_('Quotations').find(function (x) { return x.id === id; });
  if (!q) throw new Error('Quotation not found.');
  assertProjectEditor_(q.projectId);
  if (q.status === 'Won' || q.status === 'Lost') {
    throw new Error('This quotation has been decided (' + q.status + ') and can no longer be edited.');
  }

  var upd = { updatedAt: new Date() };
  ['title', 'scopeNotes', 'exclusions', 'clientName'].forEach(function (f) {
    if (data[f] !== undefined) upd[f] = String(data[f]);
  });
  if (data.quotedValue !== undefined) upd.quotedValue = parseFloat(data.quotedValue) || 0;
  if (data.validUntil !== undefined) upd.validUntil = data.validUntil;
  if (data.clientId !== undefined) {
    var c = readAll_('ClientLists').find(function (x) { return x.id === data.clientId; });
    upd.clientId = data.clientId;
    if (c) upd.clientName = c.name;
  }
  updateRow_('Quotations', 'id', id, upd);

  // keep the shell project's display fields in step
  var pPatch = {};
  if (data.title !== undefined) pPatch.name = String(data.title);
  if (data.clientId !== undefined) pPatch.clientId = data.clientId;
  if (data.location !== undefined) pPatch.location = String(data.location);
  if (Object.keys(pPatch).length) updateRow_('Projects', 'id', q.projectId, pPatch);

  logActivity_('Quotation ' + id + ' updated', 'g', id);
  return { success: true };
}

/**
 * setQuotationStatus - Draft / Sent / Under Negotiation only.
 * Won and Lost are decisions with consequences, so they go through
 * awardQuotation() and loseQuotation() rather than a status dropdown.
 */
function setQuotationStatus(id, status) {
  var q = readAll_('Quotations').find(function (x) { return x.id === id; });
  if (!q) throw new Error('Quotation not found.');
  assertProjectEditor_(q.projectId);
  if (['Draft', 'Sent', 'Under Negotiation'].indexOf(status) === -1) {
    throw new Error('Use Award or Mark as Lost to record a decision.');
  }
  if (q.status === 'Won' || q.status === 'Lost') {
    throw new Error('This quotation has already been decided.');
  }
  var upd = { status: status, updatedAt: new Date() };
  if (status === 'Sent' && !q.sentDate) upd.sentDate = fmtDate_(new Date());
  updateRow_('Quotations', 'id', id, upd);
  logActivity_('Quotation ' + id + ' marked ' + status, 'blue', id);
  return { success: true };
}

/**
 * reviseQuotation - Snapshots the current priced position and bumps the
 * revision letter.
 *
 * A snapshot, NOT a fork. A quotation can go through five revisions in a
 * fortnight; forking the whole SOW and estimate each time would leave
 * five near-identical copies nobody can diff and no clear "current"
 * version. The working copy stays live; the snapshot records what was
 * quoted at that point, so you can answer "what did we send them in
 * rev B" later.
 */
function reviseQuotation(id, note) {
  var q = readAll_('Quotations').find(function (x) { return x.id === id; });
  if (!q) throw new Error('Quotation not found.');
  assertProjectEditor_(q.projectId);
  if (q.status === 'Won' || q.status === 'Lost') {
    throw new Error('This quotation has been decided and can no longer be revised.');
  }
  ensureSheet_('QuotationRevisions');

  var sow = readAll_('SOWItems')
    .filter(function (s) { return s.projectId === q.projectId; })
    .map(function (s) {
      return { id: s.id, description: s.description, qty: parseFloat(s.qty) || 0,
               unit: s.unit || '', budget: parseFloat(s.budget) || 0 };
    });

  appendRow_('QuotationRevisions', {
    id: nextId_('QR'),
    quotationId: id,
    revision: q.revision || 'A',
    quotedValue: parseFloat(q.quotedValue) || 0,
    estimatedCost: quotationCost_(q.projectId),
    sowCount: sow.length,
    snapshotJSON: JSON.stringify(sow),
    note: String(note || ''),
    createdBy: currentUserEmail_().toLowerCase(),
    createdAt: new Date()
  });

  var next = _nextRevisionLetter_(q.revision || 'A');
  updateRow_('Quotations', 'id', id, { revision: next, updatedAt: new Date() });
  logActivity_('Quotation ' + id + ' revision ' + (q.revision || 'A') +
    ' snapshotted — now working on revision ' + next, 'blue', id);
  return { success: true, revision: next };
}

/** _nextRevisionLetter_ - A..Z then AA, AB, ... */
function _nextRevisionLetter_(cur) {
  cur = String(cur || 'A').toUpperCase().replace(/[^A-Z]/g, '') || 'A';
  var chars = cur.split('');
  var i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] === 'Z') { chars[i] = 'A'; i--; }
    else { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join(''); }
  }
  return 'A' + chars.join('');
}

function getQuotationRevisions(id) {
  ensureSheet_('QuotationRevisions');
  return sanitizeDatesDeep_(
    readAll_('QuotationRevisions')
      .filter(function (r) { return r.quotationId === id; })
      .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
      .map(function (r) { r.snapshot = safeParse_(r.snapshotJSON, []); return r; })
  );
}

/**
 * awardQuotation - The transition Darwin asked about: how a quotation
 * becomes an ongoing project cleanly.
 *
 * NOTHING IS COPIED. The SOW and estimates were built against this
 * project id from the start, so they are already the project's. Award:
 *
 *   1. checks the quotation is actually ready to become a project
 *   2. writes the contract value from the awarded amount
 *   3. sets the project's start and finish from the SOW schedule
 *   4. SAVES THE BASELINE — the priced schedule becomes the yardstick
 *      every later variance is measured against. Doing it here is the
 *      only moment it is unambiguously correct: it is what the client
 *      agreed to
 *   5. flips the status to Ongoing
 *
 * Guards, because this is a one-way door:
 *   · must have at least one SOW item — an empty project is not a project
 *   · awarded amount must be positive
 *   · a quotation already decided cannot be re-decided
 */
function awardQuotation(id, data) {
  requireApprover_('awarding a quotation');
  data = data || {};
  var q = readAll_('Quotations').find(function (x) { return x.id === id; });
  if (!q) throw new Error('Quotation not found.');
  if (q.status === 'Won') throw new Error('This quotation has already been awarded.');
  if (q.status === 'Lost') throw new Error('This quotation was marked lost. Create a new one to re-bid.');

  var proj = readAll_('Projects').find(function (p) { return p.id === q.projectId; });
  if (!proj) throw new Error('The quotation\'s project record is missing.');

  var sow = readAll_('SOWItems').filter(function (s) { return s.projectId === q.projectId; });
  if (!sow.length) {
    throw new Error('Add at least one SOW item before awarding — an awarded project with no scope cannot be budgeted, scheduled or billed.');
  }

  var awarded = data.awardedValue !== undefined
    ? parseFloat(data.awardedValue)
    : parseFloat(q.quotedValue);
  if (!awarded || awarded <= 0) {
    throw new Error('Enter the awarded contract value.');
  }

  // project dates from the priced schedule
  var starts = [], ends = [];
  sow.forEach(function (s) {
    if (s.startDate) starts.push(String(s.startDate));
    if (s.endDate) ends.push(String(s.endDate));
  });
  starts.sort(); ends.sort();

  var pPatch = {
    status: 'Ongoing',
    contractValue: awarded
  };
  if (data.startDate) pPatch.startDate = data.startDate;
  else if (starts.length) pPatch.startDate = starts[0];
  if (data.endDate) pPatch.endDate = data.endDate;
  else if (ends.length) pPatch.endDate = ends[ends.length - 1];
  if (data.retentionPct !== undefined) pPatch.retentionPct = parseFloat(data.retentionPct);
  if (data.downpaymentPct !== undefined) pPatch.downpaymentPct = parseFloat(data.downpaymentPct);
  updateRow_('Projects', 'id', q.projectId, pPatch);

  // the priced schedule becomes the baseline
  var baselined = 0;
  sow.forEach(function (s) {
    if (!s.startDate && !s.endDate) return;
    updateRowWhere_('SOWItems', { id: s.id, projectId: q.projectId }, {
      baselineStart: s.startDate || '',
      baselineEnd: s.endDate || ''
    });
    baselined++;
  });

  updateRow_('Quotations', 'id', id, {
    status: 'Won',
    quotedValue: awarded,
    decisionDate: fmtDate_(data.decisionDate || new Date()),
    decisionNote: String(data.decisionNote || ''),
    updatedAt: new Date()
  });

  logActivity_('Quotation ' + id + ' AWARDED — ' + q.projectId + ' is now Ongoing at ' +
    fmtMoney_(awarded) + '; baseline saved for ' + baselined + ' SOW item(s)', 'g', q.projectId);

  return {
    success: true,
    projectId: q.projectId,
    contractValue: awarded,
    baselinedItems: baselined,
    sowCount: sow.length
  };
}

/**
 * loseQuotation - Records a lost bid. The project row stays, with status
 * 'Lost', so the estimate is still there to learn from: what you priced
 * and what it lost to is the most useful thing you have next time the
 * same client tenders.
 */
function loseQuotation(id, data) {
  requireApprover_('recording a lost quotation');
  data = data || {};
  var q = readAll_('Quotations').find(function (x) { return x.id === id; });
  if (!q) throw new Error('Quotation not found.');
  if (q.status === 'Won') throw new Error('This quotation was awarded and cannot be marked lost.');
  if (q.status === 'Lost') throw new Error('This quotation is already marked lost.');

  updateRow_('Quotations', 'id', id, {
    status: 'Lost',
    decisionDate: fmtDate_(data.decisionDate || new Date()),
    decisionNote: String(data.decisionNote || ''),
    updatedAt: new Date()
  });
  updateRow_('Projects', 'id', q.projectId, { status: 'Lost' });

  logActivity_('Quotation ' + id + ' marked LOST' +
    (data.decisionNote ? ' — ' + data.decisionNote : ''), 'a', id);
  return { success: true };
}

/**
 * deleteQuotation - Super Admin only, and only while undecided. Removes
 * the quotation, its revisions, the shell project and everything priced
 * against it.
 *
 * An awarded quotation is deliberately NOT deletable: it is the
 * commercial origin of a live project and deleting it would leave that
 * project with no record of what was agreed.
 */
function deleteQuotation(id) {
  requireSuperAdmin_('deleting a quotation');
  var q = readAll_('Quotations').find(function (x) { return x.id === id; });
  if (!q) throw new Error('Quotation not found.');
  if (q.status === 'Won') {
    throw new Error('This quotation was awarded and is the commercial record of a live project. It cannot be deleted.');
  }

  var groupIds = readAll_('EstimateGroups')
    .filter(function (g) { return g.projectId === q.projectId; })
    .map(function (g) { return g.id; });
  var lines = 0;
  ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment', 'EstimateIndirect']
    .forEach(function (sheet) { lines += deleteRowsByValues_(sheet, 'groupId', groupIds); });
  groupIds.forEach(function (gid) { deleteRow_('EstimateGroups', 'id', gid); });

  var sowRemoved = deleteRowsWhere_('SOWItems', { projectId: q.projectId });
  deleteRowsWhere_('QuotationRevisions', { quotationId: id });
  deleteRow_('Projects', 'id', q.projectId);
  deleteRow_('Quotations', 'id', id);

  logActivity_('Quotation ' + id + ' deleted — ' + sowRemoved + ' SOW item(s), ' +
    groupIds.length + ' estimate group(s), ' + lines + ' line item(s) removed', 'a', id);
  return { success: true, sowRemoved: sowRemoved, lineItems: lines };
}
