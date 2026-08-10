/**
 * 16-ManpowerService.gs — Manpower role catalog (v3)
 *
 * PURPOSE: The manpower database (Option A: roles/trades, not
 * individual workers). Mirrors 08-MaterialService.gs:
 * request -> 'Pending' -> 'approved' (decided through the central
 * engine in 11-ApprovalService.gs, self-approval banned).
 *
 * Consumed by:
 *   - Daily Site Report manpower Role dropdown
 *   - Estimates labor Role dropdown
 *   - Gantt resource assignment
 *
 * classification is free-form but conventionally one of:
 * 'Skilled' | 'Semi-Skilled' | 'Laborer' | 'Supervision'.
 */

function getAllManpower() { return readAll_('Manpower'); }

function getManpower(status) {
  return readAll_('Manpower').filter(function (m) { return m.status === status; });
}

function requestManpower(data) {
  requireLogin_();   // v7.0
  const role = String(data && data.role || '').trim();
  if (!role) throw new Error('Role / Trade name is required.');

  const dup = readAll_('Manpower').find(function (m) {
    return String(m.role).trim().toLowerCase() === role.toLowerCase() && m.status !== 'rejected';
  });
  if (dup) throw new Error('Role "' + role + '" already exists (' + dup.status + ').');

  const id = nextId_('MP');
  appendRow_('Manpower', {
    id: id,
    code: data.code || id,
    role: role,
    classification: data.classification || '',
    notes: data.notes || '',
    status: 'pending',   // v6.1: lowercase, consistent with approved/rejected
    requestedBy: currentUserEmail_(),
    createdAt: new Date()
  });
  logActivity_('Manpower role "' + role + '" requested by ' + currentUserName_(), 'blue', id);
  // v11 BATCH A: Super Admin bypass.
  var autoApproved = autoApproveIfSuper_(id, 'Manpower');
  return { success: true, id: id, autoApproved: autoApproved };
}

function searchManpower(query) {
  query = String(query || '').toLowerCase();
  return readAll_('Manpower').filter(function (m) {
    return (m.role && m.role.toLowerCase().indexOf(query) > -1) ||
      (m.code && String(m.code).toLowerCase().indexOf(query) > -1) ||
      (m.classification && String(m.classification).toLowerCase().indexOf(query) > -1);
  });
}

// ============================================================
//  v8 — PERSONNEL DIRECTORY (actual people, not roles)
// ============================================================
//  The role catalog above is for PLANNING (Estimates use approved
//  roles). Personnel are the REAL NAMES used on site — foremen,
//  masons, laborers by name — for actual site execution. This is
//  operational data, so it is direct-entry (no multi-sig): any
//  logged-in user may add, admins may edit/deactivate.

function getAllPersonnel() {
  requireLogin_();
  return readAll_('Personnel').map(function (p) {
    return {
      id: p.id,
      name: p.name || '',
      role: p.role || '',
      classification: p.classification || '',
      contactNumber: String(p.contactNumber || ''),
      dailyRate: parseFloat(p.dailyRate) || 0,
      notes: p.notes || '',
      status: (p.status || 'active').toLowerCase(),
      addedBy: p.addedBy || '',
      createdAt: p.createdAt ? fmtDate_(p.createdAt) : '',
      // ── v13.1 FIX ──
      // These were being written to the sheet and then dropped on the
      // way out. This function builds an explicit object rather than
      // returning the row, so a new column is invisible to the whole
      // frontend until it is added HERE too — which is why the photo
      // never appeared and the signature never reached a report.
      image: p.image || '',
      signature: p.signature || ''
    };
  });
}

function addPersonnel(data) {
  requireLogin_();
  var name = String(data && data.name || '').trim();
  if (!name) throw new Error('Person\'s name is required.');
  var dup = readAll_('Personnel').find(function (p) {
    return String(p.name).trim().toLowerCase() === name.toLowerCase() &&
      (p.status || 'active').toLowerCase() === 'active';
  });
  if (dup) throw new Error('"' + name + '" is already in the Personnel directory (' + dup.id + ').');
  var id = nextId_('PRS');
  appendRow_('Personnel', {
    id: id,
    name: name,
    role: String(data.role || '').trim(),
    classification: String(data.classification || '').trim(),
    contactNumber: String(data.contactNumber || '').trim(),
    dailyRate: parseFloat(data.dailyRate) || 0,
    notes: String(data.notes || '').trim(),
    image: String(data.image || ''),       // v11 BATCH H3
    signature: String(data.signature || ''),   // v13
    status: 'active',
    addedBy: currentUserEmail_(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  logActivity_('Personnel "' + name + '" added by ' + currentUserName_(), 'blue', id);
  return { success: true, id: id };
}

function updatePersonnel(id, data) {
  requireLogin_();
  var me = currentUserEmail_().toLowerCase();
  var user = readAll_('Users').find(function (u) { return u.email.toLowerCase() === me; });
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    throw new Error('Only admins can edit personnel records.');
  }
  var rec = readAll_('Personnel').find(function (p) { return p.id === id; });
  if (!rec) throw new Error('Personnel record not found.');
  var patch = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = String(data.name).trim();
  if (data.role !== undefined) patch.role = String(data.role).trim();
  if (data.classification !== undefined) patch.classification = String(data.classification).trim();
  if (data.contactNumber !== undefined) patch.contactNumber = String(data.contactNumber).trim();
  if (data.dailyRate !== undefined) patch.dailyRate = parseFloat(data.dailyRate) || 0;
  if (data.notes !== undefined) patch.notes = String(data.notes).trim();
  // v11 BATCH H3: only written when a NEW photo was uploaded. Sending an
  // empty string on every edit would wipe the existing one, which is
  // how photo fields quietly disappear after a routine rate change.
  if (data.image !== undefined && String(data.image).trim() !== '') {
    patch.image = String(data.image).trim();
  }
  // v13: same guard. Sending an empty signature on a routine rate change
  // would wipe it from every report that already relies on it.
  if (data.signature !== undefined && String(data.signature).trim() !== '') {
    patch.signature = String(data.signature).trim();
  }
  if (data.status !== undefined) patch.status = String(data.status).toLowerCase() === 'inactive' ? 'inactive' : 'active';
  updateRow_('Personnel', 'id', id, patch);
  logActivity_('Personnel ' + id + ' updated by ' + currentUserName_(), 'blue', id);
  return { success: true };
}


/**
 * attachSignatures_ (v13.1) - Puts each worker's signature on their
 * manpower row.
 *
 * WHY IT IS A SHARED HELPER. v13 did this inline in getRequestById, so
 * the approvals modal showed signatures and the project payload — which
 * every report is built from — did not. Two paths to the same record,
 * and only one of them was fixed. One helper, called from both.
 *
 * Matched by personnel id FIRST, then by name. Rows typed as free text
 * have no id, and those are exactly the people most likely to be
 * missing from a signed sheet otherwise.
 */
function attachSignatures_(rows, people) {
  if (!rows || !rows.length) return rows || [];
  var list = people || readAll_('Personnel');
  rows.forEach(function (m) {
    var hit = list.find(function (p) {
      return (m.personnelId && String(p.id) === String(m.personnelId)) ||
        (m.name && String(p.name || '').trim().toLowerCase() ===
                   String(m.name).trim().toLowerCase());
    });
    m.signature = hit ? (hit.signature || '') : '';
    if (!m.name && hit) m.name = hit.name;
  });
  return rows;
}
