/**
 * 06-DailyRecordService.gs — Daily site records
 *
 * PURPOSE: Creation and approval lifecycle of daily site records.
 * Row payloads (manpower, equipment, work accomplished, issues,
 * visitors, photos) are stored as JSON strings in *JSON columns.
 * Photos arrive as base64 and are uploaded to Drive first
 * (see 13-FileService.gs); only URLs are stored in the sheet.
 *
 * NOTE: the four lifecycle functions below are not yet registered
 * in API_ACTIONS (02-Api.gs) — see the note there.
 */

// ============================================================
//  DAILY RECORDS
// ============================================================

function addDailyRecord(projectId, data) {
  const photoUrls = [];
  if (data.photos && data.photos.length) {
    data.photos.forEach(function (photoBase64, index) {
      try {
        const blob = Utilities.newBlob(
          Utilities.base64Decode(photoBase64),
          'image/jpeg',
          'daily_photo_' + Date.now() + '_' + index + '.jpg'
        );
        const folder = getOrCreateAttachmentsFolder_();
        const file = folder.createFile(blob);
        photoUrls.push(file.getUrl());
      } catch (e) {}
    });
  }

  const workAccomplishedWithUrls = (data.workAccomplished || []).map(function (w) {
    if (w.image && w.image.startsWith && !w.image.startsWith('data:')) return w;
    return w;
  });
  const issuesWithUrls = (data.issues || []).map(function (iss) {
    if (iss.image && iss.image.startsWith && !iss.image.startsWith('data:')) return iss;
    return iss;
  });

  const recordId = nextId_('DR');
  appendRow_('DailyRecords', {
    id: recordId,
    projectId: projectId,
    date: data.date,
    weatherAM: data.weatherAM,
    weatherPM: data.weatherPM,
    status: data.status || 'draft',
    manpowerJSON: JSON.stringify(data.manpower || []),
    equipmentJSON: JSON.stringify(data.equipment || []),
    workAccomplishedJSON: JSON.stringify(workAccomplishedWithUrls),
    materialsDeliveredJSON: JSON.stringify(data.materialsDelivered || []),
    issuesJSON: JSON.stringify(issuesWithUrls),
    visitorsJSON: JSON.stringify(data.visitors || []),
    photosJSON: JSON.stringify(photoUrls),
    createdBy: currentUserEmail_(),
    createdAt: new Date()
  });
  logActivity_('Daily record added for ' + projectId + ' (' + data.date + ') by ' + currentUserName_(), 'blue', recordId);
  return { success: true, id: recordId };
}

function submitDailyRecordForApproval(recordId) {
  updateRow_('DailyRecords', 'id', recordId, { status: 'pending' });
  logActivity_('Daily record ' + recordId + ' submitted for approval', 'g', recordId);
  return { success: true };
}

function approveDailyRecord(recordId) {
  updateRow_('DailyRecords', 'id', recordId, { status: 'approved' });
  logActivity_('Daily record ' + recordId + ' approved', 'g', recordId);
  return { success: true };
}

function rejectDailyRecord(recordId) {
  updateRow_('DailyRecords', 'id', recordId, { status: 'rejected' });
  logActivity_('Daily record ' + recordId + ' rejected', 'a', recordId);
  return { success: true };
}

function getPendingDailyRecords() {
  return readAll_('DailyRecords').filter(function (d) { return d.status === 'pending'; });
}
