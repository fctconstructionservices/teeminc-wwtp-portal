/**
 * 40-DocumentService.gs — The project's filing cabinet. (v20)
 *
 * ── WHAT THIS IS FOR, AND WHY IT IS NOT "DRAWINGS" ──────────
 *
 * Drawings already have a register, because a drawing has a number and
 * a revision and those govern what gets built. Everything ELSE that
 * arrives about a project has nowhere to live: the signed contract, the
 * notice to proceed, a permit, a client's email confirming a change, a
 * scanned delivery receipt, a geotechnical report.
 *
 * Those currently sit in somebody's inbox. When they matter — and they
 * matter precisely when there is a disagreement — the person who
 * received them may not be reachable, or may not remember which email
 * it was.
 *
 * ── THE ONE DECISION THAT SHAPES THIS ───────────────────────
 *
 * A document is NEVER edited and NEVER overwritten.
 *
 * If a revised contract arrives, it is uploaded as a NEW VERSION of the
 * same document, and the old one stays underneath it. That is the whole
 * value: in a dispute the question is almost never "what does the
 * contract say" — it is "what did it say in March, and when did it
 * change". A register that quietly replaces files cannot answer that,
 * and looks authoritative while failing to.
 *
 * Superseded versions are marked, not deleted.
 */

var DOC_CATEGORIES = [
  'Contract', 'Notice to Proceed', 'Permit / Clearance', 'Client Correspondence',
  'Variation / Change Order', 'Technical Report', 'Insurance / Bond',
  'Certificate', 'Delivery Receipt', 'Photo / Site Record', 'Other'
];

/** getProjectDocuments - the register, newest first, versions grouped. */
function getProjectDocuments(projectId) {
  requireLogin_();
  ensureSheet_('ProjectDocuments');
  readMany_(['ProjectDocuments', 'Users']);

  var users = {};
  readAll_('Users').forEach(function (u) {
    users[String(u.email).toLowerCase()] = u.name || u.email;
  });

  var rows = readAll_('ProjectDocuments')
    .filter(function (d) { return d.projectId === projectId; })
    .map(function (d) {
      return {
        id: d.id,
        docNo: d.docNo || '',
        title: d.title || '',
        category: d.category || 'Other',
        description: d.description || '',
        fileUrl: d.fileUrl || '',
        fileName: d.fileName || '',
        receivedFrom: d.receivedFrom || '',
        receivedDate: docDay_(d.receivedDate),
        version: parseInt(d.version, 10) || 1,
        supersedes: d.supersedes || '',
        superseded: String(d.superseded || '').toUpperCase() === 'TRUE',
        confidential: String(d.confidential || '').toUpperCase() === 'TRUE',
        uploadedBy: d.uploadedBy || '',
        uploadedByName: users[String(d.uploadedBy).toLowerCase()] || d.uploadedBy || '',
        uploadedAt: d.uploadedAt
      };
    });

  // Confidential documents are visible to approvers and above only. A
  // signed contract with the client's pricing in it is not something a
  // site foreman needs, and "everyone can see everything" is how a
  // register stops being used for the documents that matter most.
  var role = currentUserRole_();
  if (role !== 'superadmin' && role !== 'admin' && role !== 'approver') {
    rows = rows.filter(function (d) { return !d.confidential; });
  }

  rows.sort(function (a, b) {
    // Current versions first, then newest received.
    if (a.superseded !== b.superseded) return a.superseded ? 1 : -1;
    return String(b.receivedDate).localeCompare(String(a.receivedDate));
  });

  var byCategory = {};
  rows.forEach(function (d) {
    if (d.superseded) return;
    byCategory[d.category] = (byCategory[d.category] || 0) + 1;
  });

  return sanitizeDatesDeep_({
    documents: rows,
    byCategory: byCategory,
    categories: DOC_CATEGORIES,
    total: rows.filter(function (d) { return !d.superseded; }).length
  });
}

/**
 * addProjectDocument - files a new document, or a new version of one.
 *
 * data: { projectId, title, category, description, receivedFrom,
 *         receivedDate, confidential, supersedes,
 *         fileBase64, fileName, fileMime }
 */
function addProjectDocument(data) {
  assertProjectEditor_(data && data.projectId);
  ensureSheet_('ProjectDocuments');

  var title = String((data && data.title) || '').trim();
  if (!title) throw new Error('Give the document a title.');
  if (!data.fileBase64 || !data.fileName) {
    throw new Error('Attach the file. A register entry with no document behind it is a note, not a record.');
  }

  var cat = DOC_CATEGORIES.indexOf(String(data.category)) > -1 ? data.category : 'Other';

  var version = 1;
  var confidential = !!data.confidential;
  var supersedes = String(data.supersedes || '').trim();
  if (supersedes) {
    var prev = readAll_('ProjectDocuments').find(function (d) { return d.id === supersedes; });
    if (!prev) throw new Error('The document being replaced could not be found.');
    if (prev.projectId !== data.projectId) {
      throw new Error('That document belongs to a different project.');
    }
    version = (parseInt(prev.version, 10) || 1) + 1;

    // ── CONFIDENTIALITY IS INHERITED ──
    // A revision of a confidential contract is still a confidential
    // contract. Without this, uploading a new version silently exposes
    // it to everyone — and nobody would notice, because the person
    // uploading it can see it either way.
    //
    // It can only be RAISED here, never lowered by omission. Removing
    // the marking has to be a deliberate edit on the document itself.
    if (String(prev.confidential || '').toUpperCase() === 'TRUE') confidential = true;
    // Marked, not deleted. In a dispute the question is rarely "what
    // does it say" but "what did it say in March, and when did it
    // change" — and a register that overwrites cannot answer that.
    updateRow_('ProjectDocuments', 'id', supersedes, { superseded: 'TRUE' });
  }

  var up = uploadImage(data.fileBase64, data.fileName, data.fileMime || '');
  if (!up || !up.url) throw new Error('The file could not be uploaded. Try again, or use a smaller file.');

  var id = nextId_('DOC');
  appendRow_('ProjectDocuments', {
    id: id,
    projectId: data.projectId,
    docNo: String(data.docNo || '').trim(),
    title: title,
    category: cat,
    description: String(data.description || ''),
    fileUrl: up.url,
    fileName: data.fileName,
    receivedFrom: String(data.receivedFrom || ''),
    // Stored as text so Sheets does not convert it to a date value —
    // the same trap that made every assigned task invisible in v18.
    receivedDate: "'" + (docDay_(data.receivedDate) ||
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')),
    version: version,
    supersedes: supersedes,
    superseded: '',
    confidential: confidential ? 'TRUE' : '',
    uploadedBy: currentUserEmail_().toLowerCase(),
    uploadedAt: new Date()
  });

  logActivity_('Document filed on ' + data.projectId + ' — "' + title + '" (' + cat + ')' +
    (supersedes ? ', version ' + version + ', superseding ' + supersedes : ''),
    'blue', data.projectId);

  return { success: true, id: id, version: version };
}

/** updateProjectDocument - metadata only. The FILE is never replaced;
 *  a new file is a new version, which is the point of the register. */
function updateProjectDocument(id, data) {
  var doc = readAll_('ProjectDocuments').find(function (d) { return d.id === id; });
  if (!doc) throw new Error('Document not found.');
  assertProjectEditor_(doc.projectId);

  var patch = {};
  if (data.title !== undefined && String(data.title).trim()) patch.title = String(data.title).trim();
  if (data.docNo !== undefined) patch.docNo = String(data.docNo).trim();
  if (data.description !== undefined) patch.description = String(data.description);
  if (data.receivedFrom !== undefined) patch.receivedFrom = String(data.receivedFrom);
  if (data.category !== undefined && DOC_CATEGORIES.indexOf(String(data.category)) > -1) {
    patch.category = data.category;
  }
  if (data.confidential !== undefined) patch.confidential = data.confidential ? 'TRUE' : '';
  updateRow_('ProjectDocuments', 'id', id, patch);
  return { success: true };
}

/**
 * deleteProjectDocument - Super Admin only, and never a superseded one.
 *
 * A superseded document is the history the register exists to keep.
 * Deleting it leaves a version 2 that claims to replace something no
 * longer there, which reads as a gap somebody is hiding.
 */
function deleteProjectDocument(id) {
  requireSuperAdmin_('deleting a project document');
  var doc = readAll_('ProjectDocuments').find(function (d) { return d.id === id; });
  if (!doc) throw new Error('Document not found.');
  if (String(doc.superseded || '').toUpperCase() === 'TRUE') {
    throw new Error('A superseded document is the history this register exists to keep. ' +
      'It cannot be deleted.');
  }
  if (String(doc.supersedes || '').trim()) {
    // Deleting version 2 puts version 1 back in force rather than
    // leaving the project with no current copy at all.
    updateRow_('ProjectDocuments', 'id', doc.supersedes, { superseded: '' });
  }
  deleteRow_('ProjectDocuments', 'id', id);
  logActivity_('Document deleted from ' + doc.projectId + ' — "' + doc.title + '"',
    'a', doc.projectId);
  return { success: true };
}

/** docDay_ - a date as YYYY-MM-DD whatever shape it arrives in. */
function docDay_(v) {
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
