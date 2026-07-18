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
  return { success: true, id: id };
}

function searchManpower(query) {
  query = String(query || '').toLowerCase();
  return readAll_('Manpower').filter(function (m) {
    return (m.role && m.role.toLowerCase().indexOf(query) > -1) ||
      (m.code && String(m.code).toLowerCase().indexOf(query) > -1) ||
      (m.classification && String(m.classification).toLowerCase().indexOf(query) > -1);
  });
}