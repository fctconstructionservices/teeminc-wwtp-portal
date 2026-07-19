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
  // v7.0: prefix the actor so impersonated actions stay traceable
  var actor = (typeof actorLabel_ === 'function') ? actorLabel_() : '';
  appendRow_('ActivityLog', {
    timestamp: new Date(),
    text: (actor ? '[' + actor + '] ' : '') + text,
    type: type || 'blue',
    refId: refId || ''
  });
}

function currentUserEmail_() {
  return CURRENT_REQUEST_USER_EMAIL || '';
}

/**
 * ══ v7.0 ROLE GUARDS ══
 * The role now comes from the session (server-side), so these are real
 * checks rather than hints. Several approval endpoints previously had NO
 * check at all — hiding a button in the UI is not access control, since
 * anyone could call the endpoint directly.
 */
function currentUserRole_() {
  if (CURRENT_REQUEST_ROLE) return CURRENT_REQUEST_ROLE;
  var u = readAll_('Users').find(function (r) {
    return String(r.email).toLowerCase() === currentUserEmail_().toLowerCase();
  });
  return u ? u.role : '';
}

function requireLogin_() {
  if (!currentUserEmail_()) throw new Error('You must be logged in.');
  return currentUserEmail_();
}

function requireRole_(roles, label) {
  requireLogin_();
  var role = currentUserRole_();
  if (roles.indexOf(role) === -1) {
    throw new Error('Not allowed: ' + (label || 'this action') + ' requires ' + roles.join(' or ') + ' access.');
  }
  return role;
}

function requireApprover_(label) { return requireRole_(['superadmin', 'admin', 'approver'], label); }
function requireAdmin_(label) { return requireRole_(['superadmin', 'admin'], label); }
function requireSuperAdmin_(label) { return requireRole_(['superadmin'], label); }

/** actorLabel_ - audit string that preserves the real identity. */
function actorLabel_() {
  if (CURRENT_REQUEST_IMPERSONATING) {
    return CURRENT_REQUEST_REAL_EMAIL + ' (as ' + CURRENT_REQUEST_USER_EMAIL + ')';
  }
  return CURRENT_REQUEST_USER_EMAIL || 'system';
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