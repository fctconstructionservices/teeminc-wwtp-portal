/**
 * 41-QaqcService.gs — Quality records beyond the punchlist. (v21)
 *
 * The punchlist already exists and is untouched. This adds the three
 * records that had nowhere to live, and which together are what you
 * produce when a client asks how quality was controlled:
 *
 *   · INSPECTION REQUEST — asking to be inspected before covering work
 *     up. The date they responded, or did not, settles "we were never
 *     told" — and that argument is worth more than the inspection.
 *
 *   · NON-CONFORMANCE — work off specification, raised formally, with a
 *     disposition. A punch item is a snag; an NCR is a contractual
 *     event, and conflating the two is how a real defect gets closed by
 *     someone ticking a box.
 *
 *   · TEST RESULT — cylinders, compaction, welds. These lived in a
 *     folder, which means a failed result was invisible on the project
 *     until somebody went looking.
 *
 * ── ONE TABLE, NOT THREE ────────────────────────────────────
 *
 * All three share a shape: a reference, a scope, a date, a status and
 * an attachment. Three sheets would mean three read paths, three
 * report sections and three chances to forget one — the same reasoning
 * that made the discussion service one table keyed on record type.
 */

var QAQC_KINDS = ['inspection', 'ncr', 'test'];

/** getQaqcRecords - all three sets for a project, newest first. */
function getQaqcRecords(projectId) {
  requireLogin_();
  ensureSheet_('QaqcRecords');

  var rows = readAll_('QaqcRecords')
    .filter(function (r) { return r.projectId === projectId; })
    .map(function (r) {
      return {
        id: r.id, kind: r.kind, sowId: r.sowId || '',
        description: r.description || '',
        requestedDate: qaDay_(r.date), raisedDate: qaDay_(r.date), testDate: qaDay_(r.date),
        requiredDate: qaDay_(r.requiredDate),
        inspectedDate: qaDay_(r.closedDate), closedDate: qaDay_(r.closedDate),
        disposition: r.disposition || '', rootCause: r.rootCause || '',
        testType: r.testType || '', sampleRef: r.sampleRef || '',
        value: r.value || '', unit: r.unit || '', requiredValue: r.requiredValue || '',
        result: r.result || '', status: r.status || '',
        fileUrl: r.fileUrl || '', fileName: r.fileName || '',
        createdBy: r.createdBy || '', createdAt: r.createdAt
      };
    })
    .sort(function (a, b) { return String(b.requestedDate).localeCompare(String(a.requestedDate)); });

  return sanitizeDatesDeep_({
    inspections: rows.filter(function (r) { return r.kind === 'inspection'; }),
    ncrs: rows.filter(function (r) { return r.kind === 'ncr'; }),
    tests: rows.filter(function (r) { return r.kind === 'test'; })
  });
}

/** saveQaqcRecord - creates one of the three. */
function saveQaqcRecord(data) {
  assertProjectEditor_(data && data.projectId);
  ensureSheet_('QaqcRecords');

  var kind = String((data && data.kind) || '');
  if (QAQC_KINDS.indexOf(kind) === -1) throw new Error('Unknown QA/QC record type.');

  var date = qaDay_(data.date);
  if (!date) throw new Error('Pick a date.');

  if (kind === 'test') {
    if (!String(data.value || '').trim()) throw new Error('Enter the test result.');
  } else if (!String(data.description || '').trim()) {
    throw new Error('Describe it.');
  }

  var url = '', fname = '';
  if (data.fileBase64 && data.fileName) {
    var up = uploadImage(data.fileBase64, data.fileName, data.fileMime || '');
    if (up && up.url) { url = up.url; fname = data.fileName; }
  }

  // The opening status is derived, not asked for. A form that asks
  // somebody to choose "Open" when raising a non-conformance is asking a
  // question with one sensible answer.
  var status = kind === 'test'
    ? (String(data.result) === 'Fail' ? 'Fail' : 'Pass')
    : (kind === 'ncr' ? 'Open' : 'Requested');

  var prefix = { inspection: 'IR', ncr: 'NCR', test: 'TST' }[kind];
  var id = nextId_(prefix);

  appendRow_('QaqcRecords', {
    id: id, projectId: data.projectId, kind: kind,
    sowId: String(data.sowId || ''),
    description: String(data.description || ''),
    // Stored as text so Sheets does not convert it to a date value —
    // the trap that made every assigned task invisible in v18.
    date: "'" + date,
    requiredDate: data.requiredDate ? "'" + qaDay_(data.requiredDate) : '',
    closedDate: '',
    disposition: String(data.disposition || ''),
    rootCause: String(data.rootCause || ''),
    testType: String(data.testType || ''),
    sampleRef: String(data.sampleRef || ''),
    value: String(data.value || ''),
    unit: String(data.unit || ''),
    requiredValue: String(data.requiredValue || ''),
    result: kind === 'test' ? String(data.result || 'Pass') : '',
    status: status,
    fileUrl: url, fileName: fname,
    createdBy: currentUserEmail_().toLowerCase(),
    createdAt: new Date()
  });

  logActivity_(prefix + ' ' + id + ' raised on ' + data.projectId +
    (data.sowId ? ' against ' + data.sowId : '') +
    (status === 'Fail' ? ' — FAILED' : ''),
    status === 'Fail' || status === 'Open' ? 'a' : 'blue', data.projectId);

  return { success: true, id: id };
}

/** closeQaqcRecord - inspection passed, or NCR resolved. */
function closeQaqcRecord(id, outcome, note) {
  var r = readAll_('QaqcRecords').find(function (x) { return x.id === id; });
  if (!r) throw new Error('Record not found.');
  assertProjectEditor_(r.projectId);

  var patch = {
    closedDate: "'" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  };

  if (r.kind === 'inspection') {
    patch.status = String(outcome) === 'Fail' ? 'Rejected' : 'Inspected';
  } else if (r.kind === 'ncr') {
    // An NCR cannot be closed without saying what was done about it.
    // Closing one with no disposition records that a problem stopped
    // being tracked, not that it was resolved.
    if (!String(r.disposition || '').trim() && !String(note || '').trim()) {
      throw new Error('Say how it was resolved before closing it — rework, repair, ' +
        'use as is, or reject.');
    }
    if (note) patch.disposition = String(note);
    patch.status = 'Closed';
  }

  updateRow_('QaqcRecords', 'id', id, patch);
  logActivity_(id + ' closed' + (outcome ? ' — ' + outcome : ''), 'g', r.projectId);
  return { success: true };
}

/** qaDay_ - a date as YYYY-MM-DD whatever shape it arrives in. */
function qaDay_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim().replace(/^'/, '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
