/**
 * 23-SiteOpsService.gs — Site operations (v9)
 *
 * PURPOSE: Four project-level operational registers:
 *   1. OT REQUESTS  — overtime authorization. The OT time in/out
 *      fields on the Daily Site Record stay LOCKED until an APPROVED
 *      OT request exists for that project + date. Multi-sig approval
 *      through the standard engine (11-ApprovalService type
 *      'OTRequest'): all admins approve, requester excluded, Super
 *      Admin can force.
 *   2. PUNCHLIST    — defects / for-correction items with before &
 *      after photos and an Open → Closed lifecycle.
 *   3. SAFETY       — toolbox talks, inspections, incidents,
 *      near-misses, violations.
 *   4. DRAWINGS     — drawing/plan register with Drive file uploads
 *      and simple revision control (same drawingNo supersedes).
 */

// ============================================================
//  1. OVERTIME REQUESTS
// ============================================================

/**
 * requestOT - Files an overtime authorization request.
 * data: { projectId, otDate, otStart, otEnd, sowIds:[...], reason }
 */
function requestOT(data) {
  assertProjectEditor_(data.projectId);
  if (!data.projectId || !data.otDate) throw new Error('Project and OT date are required.');
  if (!data.otStart || !data.otEnd) throw new Error('OT start and end times are required.');
  if (!data.reason) throw new Error('Reason for OT is required.');
  var sowIds = Array.isArray(data.sowIds) ? data.sowIds.filter(String) : [];
  if (!sowIds.length) throw new Error('Select at least one affected SOW.');

  var email = currentUserEmail_().toLowerCase();
  var otDate = fmtDate_(data.otDate);

  // One live OT authorization per project per date — edit/refile only
  // after a rejection.
  var dup = readAll_('OTRequests').some(function (o) {
    return o.projectId === data.projectId && fmtDate_(o.otDate) === otDate &&
      (o.status === 'Pending' || o.status === 'Approved');
  });
  if (dup) throw new Error('There is already a pending/approved OT request for ' + otDate + ' on this project.');

  var id = nextId_('OT');
  appendRow_('OTRequests', {
    id: id,
    projectId: data.projectId,
    otDate: otDate,
    otStart: String(data.otStart),
    otEnd: String(data.otEnd),
    sowIdsJSON: JSON.stringify(sowIds),
    reason: String(data.reason),
    status: 'Pending',
    requestedBy: email,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  logActivity_('OT request ' + id + ' filed for ' + otDate + ' (' + data.otStart + '–' + data.otEnd + ')', 'g', id);
  return { success: true, id: id };
}

/** getOTRequests - All OT requests for a project (sanitized dates). */
function getOTRequests(projectId) {
  return sanitizeDatesDeep_(
    readAll_('OTRequests')
      .filter(function (o) { return o.projectId === projectId; })
      .map(function (o) {
        o.otDate = fmtDate_(o.otDate);
        o.sowIds = safeParse_(o.sowIdsJSON, []);
        return o;
      })
  );
}

/**
 * approvedOTFor_ - Internal: the APPROVED OT request for a
 * project+date, or null. Used by the daily record guard.
 */
function approvedOTFor_(projectId, date) {
  var wanted = fmtDate_(date);
  return readAll_('OTRequests').find(function (o) {
    return o.projectId === projectId && fmtDate_(o.otDate) === wanted && o.status === 'Approved';
  }) || null;
}

// ============================================================
//  2. PUNCHLIST
// ============================================================

/**
 * addPunchlistItem - data: { projectId, item, location, sowId,
 * priority, assignedTo, dueDate, remarks, beforeImage (base64 or url) }
 */
function addPunchlistItem(data) {
  assertProjectEditor_(data.projectId);
  if (!data.projectId || !data.item) throw new Error('Project and item description are required.');
  var id = nextId_('PL');
  appendRow_('Punchlist', {
    id: id,
    projectId: data.projectId,
    item: String(data.item),
    location: String(data.location || ''),
    sowId: String(data.sowId || ''),
    priority: String(data.priority || 'Medium'),
    assignedTo: String(data.assignedTo || ''),
    dueDate: fmtDate_(data.dueDate || ''),
    status: 'Open',
    beforeImage: String(data.beforeImage || ''),
    afterImage: '',
    remarks: String(data.remarks || ''),
    raisedBy: currentUserEmail_().toLowerCase(),
    closedBy: '',
    closedAt: '',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  logActivity_('Punchlist item ' + id + ' raised: ' + data.item, 'a', id);
  return { success: true, id: id };
}

/**
 * updatePunchlistItem - Edit fields; closing requires an AFTER image
 * (proof of rectification) unless a super admin overrides.
 */
function updatePunchlistItem(id, data) {
  var row = readAll_('Punchlist').find(function (p) { return p.id === id; });
  if (!row) throw new Error('Punchlist item not found.');
  assertProjectEditor_(row.projectId);

  var upd = { updatedAt: new Date() };
  ['item', 'location', 'sowId', 'priority', 'assignedTo', 'remarks', 'beforeImage', 'afterImage']
    .forEach(function (f) { if (data[f] !== undefined) upd[f] = String(data[f]); });
  if (data.dueDate !== undefined) upd.dueDate = fmtDate_(data.dueDate);

  if (data.status !== undefined) {
    if (data.status === 'Closed') {
      var after = data.afterImage !== undefined ? data.afterImage : row.afterImage;
      if (!after && currentUserRole_() !== 'superadmin') {
        throw new Error('Attach an AFTER photo (proof of rectification) before closing, or ask the Super Admin to close it.');
      }
      upd.status = 'Closed';
      upd.closedBy = currentUserEmail_().toLowerCase();
      upd.closedAt = new Date();
    } else {
      upd.status = String(data.status);
      if (data.status === 'Open') { upd.closedBy = ''; upd.closedAt = ''; }
    }
  }
  updateRow_('Punchlist', 'id', id, upd);
  logActivity_('Punchlist item ' + id + ' updated' + (upd.status ? ' → ' + upd.status : ''), 'g', id);
  return { success: true };
}

/** deletePunchlistItem - Super Admin only. */
function deletePunchlistItem(id) {
  requireSuperAdmin_('deleting a punchlist item');
  deleteRow_('Punchlist', 'id', id);
  logActivity_('Punchlist item ' + id + ' deleted by Super Admin', 'a', id);
  return { success: true };
}

/** getPunchlist - All punchlist items for a project. */
function getPunchlist(projectId) {
  return sanitizeDatesDeep_(
    readAll_('Punchlist').filter(function (p) { return p.projectId === projectId; })
  );
}

// ============================================================
//  3. SAFETY RECORDS
// ============================================================

/**
 * addSafetyRecord - data: { projectId, recordType, recordDate,
 * description, severity, personsInvolved, actionTaken, image }
 * recordType: Toolbox Talk | Inspection | Incident | Near Miss | Violation
 */
function addSafetyRecord(data) {
  assertProjectEditor_(data.projectId);
  if (!data.projectId || !data.recordType || !data.description) {
    throw new Error('Project, record type, and description are required.');
  }
  var id = nextId_('SF');
  appendRow_('SafetyRecords', {
    id: id,
    projectId: data.projectId,
    recordType: String(data.recordType),
    recordDate: fmtDate_(data.recordDate || new Date()),
    description: String(data.description),
    severity: String(data.severity || ''),
    personsInvolved: String(data.personsInvolved || ''),
    actionTaken: String(data.actionTaken || ''),
    image: String(data.image || ''),
    status: String(data.status || 'Open'),
    reportedBy: currentUserEmail_().toLowerCase(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  logActivity_('Safety record ' + id + ' (' + data.recordType + ') filed', 'a', id);
  return { success: true, id: id };
}

/** updateSafetyRecord - Edit / close a safety record. */
function updateSafetyRecord(id, data) {
  var row = readAll_('SafetyRecords').find(function (r) { return r.id === id; });
  if (!row) throw new Error('Safety record not found.');
  assertProjectEditor_(row.projectId);
  var upd = { updatedAt: new Date() };
  ['recordType', 'description', 'severity', 'personsInvolved', 'actionTaken', 'image', 'status']
    .forEach(function (f) { if (data[f] !== undefined) upd[f] = String(data[f]); });
  if (data.recordDate !== undefined) upd.recordDate = fmtDate_(data.recordDate);
  updateRow_('SafetyRecords', 'id', id, upd);
  logActivity_('Safety record ' + id + ' updated', 'g', id);
  return { success: true };
}

/** getSafetyRecords - All safety records for a project. */
function getSafetyRecords(projectId) {
  return sanitizeDatesDeep_(
    readAll_('SafetyRecords').filter(function (r) { return r.projectId === projectId; })
      .map(function (r) { r.recordDate = fmtDate_(r.recordDate); return r; })
  );
}

// ============================================================
//  4. DRAWING PLANS
// ============================================================

/**
 * addDrawing - Registers a drawing. data: { projectId, drawingNo,
 * title, discipline, revision, drawingDate, remarks, fileBase64,
 * fileName, fileMimeType }. The file uploads to the shared Drive
 * attachments folder; images get an embeddable thumbnail URL, other
 * types (PDF/DWG) get the Drive viewer URL.
 * Same drawingNo → older rows are marked Superseded automatically.
 */
function addDrawing(data) {
  assertProjectEditor_(data.projectId);
  if (!data.projectId || !data.drawingNo || !data.title) {
    throw new Error('Project, drawing number, and title are required.');
  }

  var fileUrl = '', fileName = '';
  if (data.fileBase64 && data.fileName) {
    var mime = data.fileMimeType || 'application/octet-stream';
    if (mime.indexOf('image/') === 0) {
      var img = uploadImage(data.fileBase64, data.fileName, mime);
      fileUrl = img.url;
    } else {
      var up = uploadAttachmentIfAny_({ fileBase64: data.fileBase64, fileName: data.fileName, fileMimeType: mime });
      if (!up.fileUrl) throw new Error('Drawing file upload failed — try again.');
      fileUrl = up.fileUrl;
    }
    fileName = data.fileName;
  }

  // Revision control: same drawingNo on the same project supersedes.
  readAll_('Drawings').forEach(function (d) {
    if (d.projectId === data.projectId &&
        String(d.drawingNo).toLowerCase() === String(data.drawingNo).toLowerCase() &&
        d.status === 'Current') {
      updateRow_('Drawings', 'id', d.id, { status: 'Superseded', updatedAt: new Date() });
    }
  });

  var id = nextId_('DWG');
  appendRow_('Drawings', {
    id: id,
    projectId: data.projectId,
    drawingNo: String(data.drawingNo),
    title: String(data.title),
    discipline: String(data.discipline || ''),
    revision: String(data.revision || '0'),
    drawingDate: fmtDate_(data.drawingDate || ''),
    fileUrl: fileUrl,
    fileName: fileName,
    remarks: String(data.remarks || ''),
    status: 'Current',
    uploadedBy: currentUserEmail_().toLowerCase(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  logActivity_('Drawing ' + data.drawingNo + ' rev ' + (data.revision || '0') + ' uploaded (' + id + ')', 'g', id);
  return { success: true, id: id, fileUrl: fileUrl };
}

/** deleteDrawing - Super Admin only. */
function deleteDrawing(id) {
  requireSuperAdmin_('deleting a drawing');
  deleteRow_('Drawings', 'id', id);
  logActivity_('Drawing ' + id + ' deleted by Super Admin', 'a', id);
  return { success: true };
}

/** getDrawings - All drawings for a project (Current + Superseded). */
function getDrawings(projectId) {
  return sanitizeDatesDeep_(
    readAll_('Drawings').filter(function (d) { return d.projectId === projectId; })
      .map(function (d) { d.drawingDate = fmtDate_(d.drawingDate); return d; })
  );
}
