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

/**
 * liveDailyRecords_ (v7.5) - Every daily record EXCEPT soft-deleted ones.
 *
 * Soft delete only works if deleted rows disappear from every read path;
 * a single missed filter would leave "deleted" records still counting
 * toward progress, stock and earned value. Centralising the rule here
 * means new code gets it by default instead of having to remember.
 */
function liveDailyRecords_() {
  return liveDailyRecords_().filter(function (d) { return !d.deletedAt; });
}

function addDailyRecord(projectId, data) {
  assertProjectEditor_(projectId);   // v6.6
  // ─── v3 SERVER-SIDE GUARD: one non-rejected record per date ───
  // The frontend also checks this, but the sheet is the source of
  // truth — two users submitting the same date simultaneously (or a
  // stale browser tab) must not be able to create duplicates.
  // v5 FIX: dates read back from Sheets arrive as Date objects (long ISO
  // when stringified), so a raw string compare against the form's
  // 'yyyy-MM-dd' NEVER matched — the guard silently let duplicates in.
  // Normalizing both sides with fmtDate_ makes the compare reliable.
  const wanted = fmtDate_(data.date);
  const dup = liveDailyRecords_().find(function (d) {
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
    liveDailyRecords_().forEach(function (d) {
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
  const rec = readAll_('DailyRecords').find(function (d) { return d.id === recordId; });
  if (!rec) throw new Error('Record not found.');
  assertProjectEditor_(rec.projectId);   // v6.6
  updateRow_('DailyRecords', 'id', recordId, { status: 'pending' });
  logActivity_('Daily record ' + recordId + ' submitted for approval', 'g', recordId);
  return { success: true };
}

function approveDailyRecord(recordId) {
  requireApprover_('approving a daily record');   // v7.0
  updateRow_('DailyRecords', 'id', recordId, { status: 'approved' });
  logActivity_('Daily record ' + recordId + ' approved', 'g', recordId);
  return { success: true };
}

function rejectDailyRecord(recordId) {
  requireApprover_('rejecting a daily record');   // v7.0
  updateRow_('DailyRecords', 'id', recordId, { status: 'rejected' });
  logActivity_('Daily record ' + recordId + ' rejected', 'a', recordId);
  return { success: true };
}

function getPendingDailyRecords() {
  return liveDailyRecords_().filter(function (d) { return d.status === 'pending'; });
}

/**
 * updateDailyRecord (v6.4) - Edits a DRAFT record in place. Only the
 * creator (or the Super Admin) may edit, and only while still a draft —
 * once submitted, the record is frozen for the approval trail.
 * The duplicate-date and site-stock guards both run again, excluding
 * this record's own previous entries. Newly uploaded photos are APPENDED
 * to the ones already saved (existing photos are never lost on edit).
 */
function updateDailyRecord(recordId, data) {
  const rec = readAll_('DailyRecords').find(function (d) { return d.id === recordId; });
  if (!rec) throw new Error('Daily record not found.');
  if (rec.status !== 'draft') throw new Error('Only draft records can be edited.');
  assertProjectEditor_(rec.projectId);   // v6.6

  const me = currentUserEmail_().toLowerCase();
  const user = readAll_('Users').find(function (u) { return u.email.toLowerCase() === me; });
  const isSuper = user && user.role === 'superadmin';
  if (String(rec.createdBy || '').toLowerCase() !== me && !isSuper) {
    throw new Error('Only the creator can edit this draft.');
  }

  const projectId = rec.projectId;

  // duplicate-date guard, excluding this record itself
  const wanted = fmtDate_(data.date);
  const dup = liveDailyRecords_().find(function (d) {
    return d.id !== recordId && d.projectId === projectId &&
      fmtDate_(d.date) === wanted && d.status !== 'rejected';
  });
  if (dup) throw new Error('There is already a record for ' + wanted + '.');

  // site-stock guard, with this record's own old rows excluded
  const usedRows = data.materialsUsed || [];
  if (usedRows.length) {
    const stock = {};
    liveDailyRecords_().forEach(function (d) {
      if (d.id === recordId) return;   // exclude self — its new rows are validated below
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

  // new photo uploads are appended to what the draft already holds
  const existingPhotos = safeParse_(rec.photosJSON, []);
  const mergedPhotos = existingPhotos.concat((data.photos || []).filter(function (u) {
    return u && existingPhotos.indexOf(u) === -1;
  }));

  updateRow_('DailyRecords', 'id', recordId, {
    date: data.date,
    weatherAM: data.weatherAM || '',
    weatherPM: data.weatherPM || '',
    manpowerJSON: JSON.stringify(data.manpower || []),
    equipmentJSON: JSON.stringify(data.equipment || []),
    workAccomplishedJSON: JSON.stringify(data.workAccomplished || []),
    materialsDeliveredJSON: JSON.stringify(data.materialsDelivered || []),
    materialsUsedJSON: JSON.stringify(data.materialsUsed || []),
    issuesJSON: JSON.stringify(data.issues || []),
    visitorsJSON: JSON.stringify(data.visitors || []),
    photosJSON: JSON.stringify(mergedPhotos)
  });
  logActivity_('Daily record ' + recordId + ' (draft) updated', 'blue', recordId);
  return { success: true };
}

/**
 * deleteDailyRecord (soft delete, v7.5) - Marks a DRAFT record as deleted
 * instead of removing the row.
 *
 * The previous behaviour destroyed the row immediately, so a misclick was
 * unrecoverable unless a spreadsheet backup happened to exist. Records now
 * disappear from every view but remain on the sheet, restorable by a Super
 * Admin for 30 days, after which purgeDeletedRecords() clears them.
 *
 * Only the creator or the Super Admin may delete, and only while the
 * record is still a draft - submitted records stay for the approval trail.
 */
function deleteDailyRecord(recordId) {
  const rec = readAll_('DailyRecords').find(function (d) { return d.id === recordId; });
  if (!rec) throw new Error('Daily record not found.');
  if (rec.status !== 'draft') throw new Error('Only draft records can be deleted.');
  if (rec.deletedAt) throw new Error('This record is already deleted.');

  const me = currentUserEmail_().toLowerCase();
  const user = readAll_('Users').find(function (u) { return u.email.toLowerCase() === me; });
  const isSuper = user && user.role === 'superadmin';
  if (String(rec.createdBy || '').toLowerCase() !== me && !isSuper) {
    throw new Error('Only the creator can delete this draft.');
  }

  updateRow_('DailyRecords', 'id', recordId, {
    deletedAt: new Date(),
    deletedBy: currentUserEmail_()
  });
  logActivity_('Daily record ' + recordId + ' (draft, ' + fmtDate_(rec.date) + ') deleted - recoverable for 30 days', 'a', recordId);
  return { success: true };
}

/**
 * listDeletedRecords (v7.5) - Super Admin view of what can still be
 * restored, newest first, with the days remaining before purge.
 */
function listDeletedRecords(projectId) {
  requireSuperAdmin_('viewing deleted records');
  const now = new Date();
  return readAll_('DailyRecords')
    .filter(function (d) {
      if (!d.deletedAt) return false;
      return !projectId || d.projectId === projectId;
    })
    .map(function (d) {
      const del = new Date(d.deletedAt);
      const age = isNaN(del) ? 0 : Math.floor((now - del) / 86400000);
      return {
        id: d.id,
        projectId: d.projectId,
        date: fmtDate_(d.date),
        createdBy: d.createdBy || '',
        deletedAt: fmtDate_(d.deletedAt),
        deletedBy: d.deletedBy || '',
        daysLeft: Math.max(0, 30 - age)
      };
    })
    .sort(function (a, b) { return a.deletedAt < b.deletedAt ? 1 : -1; });
}

/**
 * restoreDailyRecord (v7.5) - Brings a soft-deleted draft back.
 *
 * The duplicate-date rule is re-checked at restore time: another record
 * may have been created for the same date while this one was deleted, and
 * restoring blindly would break the one-record-per-date guarantee.
 */
function restoreDailyRecord(recordId) {
  requireSuperAdmin_('restoring a deleted record');
  const rec = readAll_('DailyRecords').find(function (d) { return d.id === recordId; });
  if (!rec) throw new Error('Daily record not found.');
  if (!rec.deletedAt) throw new Error('This record is not deleted.');

  const wanted = fmtDate_(rec.date);
  const clash = readAll_('DailyRecords').find(function (d) {
    return d.id !== recordId && d.projectId === rec.projectId &&
      !d.deletedAt && fmtDate_(d.date) === wanted && d.status !== 'rejected';
  });
  if (clash) {
    throw new Error('Cannot restore: another record already exists for ' + wanted +
      ' (' + clash.id + '). Remove or re-date that record first.');
  }

  updateRow_('DailyRecords', 'id', recordId, { deletedAt: '', deletedBy: '' });
  logActivity_('Daily record ' + recordId + ' (' + wanted + ') restored', 'g', recordId);
  return { success: true };
}

/**
 * purgeDeletedRecords (v7.5) - Permanently removes records deleted more
 * than 30 days ago. Safe to run from a daily trigger, or manually.
 */
function purgeDeletedRecords() {
  const cutoff = new Date(new Date().getTime() - 30 * 86400000);
  const old = readAll_('DailyRecords').filter(function (d) {
    if (!d.deletedAt) return false;
    const del = new Date(d.deletedAt);
    return !isNaN(del) && del < cutoff;
  });
  old.forEach(function (d) { deleteRow_('DailyRecords', 'id', d.id); });
  if (old.length) logActivity_('Purged ' + old.length + ' record(s) deleted over 30 days ago', 'a');
  return { success: true, purged: old.length };
}