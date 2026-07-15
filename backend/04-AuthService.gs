/**
 * 04-AuthService.gs — Authentication, users, roles, activity log
 *
 * PURPOSE: Login validation and the current-user / role helpers used
 * by every approval workflow, plus the central activity logger.
 *
 * ROLES (Users sheet, column "role"):
 *   superadmin -> full control, force approve/reject, add projects
 *   admin      -> approver + reviewer of cash releases
 *   approver   -> can approve requests
 *   (anything else is request-only on the frontend)
 */

function logActivity_(text, type, refId) {
  appendRow_('ActivityLog', {
    timestamp: new Date(),
    text: text,
    type: type || 'blue',
    refId: refId || ''
  });
}

function currentUserEmail_() {
  return CURRENT_REQUEST_USER_EMAIL || '';
}

function currentUserName_() {
  const email = currentUserEmail_();
  const u = readAll_('Users').find(function (row) { return String(row.email).toLowerCase() === String(email).toLowerCase(); });
  return u ? u.name : (email || 'Unknown User');
}

function getAllAdminsExceptSuperAdmin_() {
  return readAll_('Users')
    .filter(function (u) { return u.role === 'admin'; })
    .map(function (u) { return String(u.email).toLowerCase(); });
}

function getAdminEmails_() {
  return readAll_('Users')
    .filter(function (u) { return u.role === 'admin' || u.role === 'approver'; })
    .map(function (u) { return String(u.email).toLowerCase(); });
}

// ============================================================
//  AUTH
// ============================================================

function loginUser(email, password) {
  email = String(email || '').trim().toLowerCase();
  const users = readAll_('Users');
  const record = users.find(function (u) { return String(u.email).toLowerCase() === email; });
  if (!record) {
    throw new Error('This email is not registered. Please contact your administrator for access.');
  }
  if (String(record.password) !== String(password)) {
    throw new Error('Invalid password. Please try again.');
  }
  return {
    email: record.email,
    name: record.name,
    role: record.role,
    roleLabel: record.roleLabel,
    loggedIn: true
  };
}
