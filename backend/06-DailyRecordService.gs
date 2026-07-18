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
  // ─── v3 SERVER-SIDE GUARD: one non-rejected record per date ───
  // The frontend also checks this, but the sheet is the source of
  // truth — two users submitting the same date simultaneously (or a
  // stale browser tab) must not be able to create duplicates.
  // v5 FIX: dates read back from Sheets arrive as Date objects (long ISO
  // when stringified), so a raw string compare against the form's
  // 'yyyy-MM-dd' NEVER matched — the guard silently let duplicates in.
  // Normalizing both sides with fmtDate_ makes the compare reliable.
  const wanted = fmtDate_(data.date);
  const dup = readAll_('DailyRecords').find(function (d) {
    return d.projectId === projectId &&
      fmtDate_(d.date) === wanted &&
      d.status !== 'rejected';
  });
  if (dup) {
    throw new Error('A daily record for ' + data.date + ' already exists (' + (dup.status || 'draft') + '). Only one record per date is allowed unless the existing one was rejected.');
  }

  // ─── v3 PHOTO FIX ───
  // The frontend uploads photos through uploadImage() and sends Drive
  // URLs here, but this function used to base64-decode everything —
  // silently failing on URLs, which is why photosJSON was always
  // empty. URLs are now stored directly; raw base64 (legacy path) is
  // still decoded and uploaded.
  const photoUrls = [];
  if (data.photos && data.photos.length) {
    data.photos.forEach(function (photo, index) {
      if (typeof photo === 'string' && photo.indexOf('http') === 0) {
        photoUrls.push(photo);              // already a Drive URL
        return;
      }
      try {
        const blob = Utilities.newBlob(
          Utilities.base64Decode(photo),
          'image/jpeg',
          'daily_photo_' + Date.now() + '_' + index + '.jpg'
        );
        const folder = getOrCreateAttachmentsFolder_();
        const file = folder.createFile(blob);
        // v5: share + embeddable thumbnail URL (see driveImageUrl_)
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        photoUrls.push(driveImageUrl_(file.getId()));
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
  // ── v6: materials-used cannot exceed what remains on site ──
  // Site stock per material = Σ delivered − Σ used across every
  // non-rejected record of this project (this new record excluded).
  const usedRows = data.materialsUsed || [];
  if (usedRows.length) {
    const stock = {};
    readAll_('DailyRecords').forEach(function (d) {
      if (d.projectId !== projectId || d.status === 'rejected') return;
      safeParse_(d.materialsDeliveredJSON, []).forEach(function (m) {
        if (!m.material) return;
        stock[m.material] = (stock[m.material] || 0) + (parseFloat(m.qty) || 0);
      });
      safeParse_(d.materialsUsedJSON, []).forEach(function (m) {
        if (!m.material) return;
        stock[m.material] = (stock[m.material] || 0) - (parseFloat(m.qty) || 0);
      });
    });
    // deliveries on THIS record add to what may be consumed today
    (data.materialsDelivered || []).forEach(function (m) {
      if (!m.material) return;
      stock[m.material] = (stock[m.material] || 0) + (parseFloat(m.qty) || 0);
    });
    const wantedUse = {};
    usedRows.forEach(function (m) {
      if (!m.material) return;
      wantedUse[m.material] = (wantedUse[m.material] || 0) + (parseFloat(m.qty) || 0);
    });
    Object.keys(wantedUse).forEach(function (mat) {
      const avail = stock[mat] || 0;
      if (wantedUse[mat] > avail + 0.0001) {
        throw new Error('Materials Used exceeds site stock for "' + mat + '": only ' + avail + ' remaining.');
      }
    });
  }

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
    materialsUsedJSON: JSON.stringify(data.materialsUsed || []),   // v6
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