/**
 * 20-SessionService.gs — Authentication sessions (v7.0)
 *
 * WHY THIS EXISTS
 * Before this, the browser told the server who it was on every request
 * (`userEmail` in the payload) and the server believed it. Anyone could
 * edit that value and act as anybody — so every role check in the system
 * was decorative. Now the browser holds only an opaque random TOKEN; the
 * server decides identity by looking that token up here. A token cannot
 * be guessed or forged, so role checks finally mean something.
 *
 * SLIDING EXPIRY (8h): lastSeen is refreshed on every authenticated call
 * and expiresAt moves with it, so an actively working user is never cut
 * off mid-task; only 8 hours of INACTIVITY ends a session.
 *
 * PASSWORDS are stored as salted SHA-256 hashes. Legacy plaintext rows
 * still authenticate once, and are silently upgraded to a hash on that
 * first successful login (so nobody has to reset anything).
 *
 * IMPERSONATION ("view as") lets a Super Admin see the app exactly as
 * another user does — necessary for support and for verifying
 * permissions without holding anyone's credentials. The real identity is
 * never lost: it stays on the session row and is written into every
 * activity log entry as "real (as viewed)".
 */

var SESSION_TTL_MS = 8 * 60 * 60 * 1000;   // 8 hours of inactivity

// ─────────────────────────── hashing ───────────────────────────

function makeSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function hashPassword_(password, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + '::' + String(password),
    Utilities.Charset.UTF_8
  );
  return raw.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/** constantTimeEquals_ - avoids leaking hash content through timing. */
function constantTimeEquals_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─────────────────────────── sessions ───────────────────────────

function newToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

/**
 * loginWithPassword - Validates credentials and issues a session token.
 * Returns the token plus the user profile the UI needs.
 */
function loginWithPassword(email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !password) throw new Error('Email and password are required.');

  var users = readAll_('Users');
  var record = users.find(function (u) { return String(u.email).toLowerCase() === email; });
  // Same message for unknown email and wrong password: revealing which
  // one was wrong tells an attacker which accounts exist.
  var GENERIC = 'Invalid email or password.';
  if (!record) throw new Error(GENERIC);

  var ok = false;
  if (record.passwordHash && record.passwordSalt) {
    ok = constantTimeEquals_(hashPassword_(password, record.passwordSalt), record.passwordHash);
  } else if (record.password) {
    // legacy plaintext — accept once, then upgrade
    ok = String(record.password) === String(password);
    if (ok) {
      var salt = makeSalt_();
      updateRow_('Users', 'email', record.email, {
        passwordHash: hashPassword_(password, salt),
        passwordSalt: salt,
        password: ''            // clear the plaintext
      });
    }
  }
  if (!ok) throw new Error(GENERIC);

  var now = new Date();
  var token = newToken_();
  appendRow_('Sessions', {
    token: token,
    email: String(record.email).toLowerCase(),
    createdAt: now,
    lastSeen: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    revoked: ''
  });
  cleanupSessions_();
  logActivity_('Login: ' + record.email, 'blue');

  return {
    token: token,
    user: {
      email: record.email,
      name: record.name,
      role: record.role,
      roleLabel: record.roleLabel,
      loggedIn: true
    }
  };
}

/**
 * resolveSession_ - Given a token, returns { email, role, realEmail,
 * realRole, impersonating } or null. Refreshes the sliding window.
 * Called by doPost before any action runs.
 */
function resolveSession_(token) {
  token = String(token || '').trim();
  if (!token) return null;

  var rows = readAll_('Sessions');
  var s = rows.find(function (r) { return String(r.token) === token; });
  if (!s) return null;
  if (String(s.revoked) === 'true') return null;

  var now = new Date();
  var exp = new Date(s.expiresAt);
  if (isNaN(exp) || now > exp) return null;

  var users = readAll_('Users');
  var realEmail = String(s.email).toLowerCase();
  var realUser = users.find(function (u) { return String(u.email).toLowerCase() === realEmail; });
  if (!realUser) return null;

  // slide the window forward
  updateRow_('Sessions', 'token', token, {
    lastSeen: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS)
  });

  var actingEmail = realEmail;
  var actingRole = realUser.role;
  var impersonating = false;
  var viewAs = String(s.viewAs || '').toLowerCase();
  if (viewAs && realUser.role === 'superadmin' && viewAs !== realEmail) {
    var target = users.find(function (u) { return String(u.email).toLowerCase() === viewAs; });
    if (target) {
      actingEmail = String(target.email).toLowerCase();
      actingRole = target.role;
      impersonating = true;
    }
  }

  return {
    email: actingEmail,
    role: actingRole,
    realEmail: realEmail,
    realRole: realUser.role,
    impersonating: impersonating
  };
}

function logout(token) {
  token = String(token || '').trim();
  if (token) {
    var s = readAll_('Sessions').find(function (r) { return String(r.token) === token; });
    if (s) {
      updateRow_('Sessions', 'token', token, { revoked: 'true' });
      logActivity_('Logout: ' + s.email, 'blue');
    }
  }
  return { success: true };
}

/** cleanupSessions_ - drops expired/revoked rows so the sheet stays small. */
function cleanupSessions_() {
  var now = new Date();
  var rows = readAll_('Sessions');
  if (rows.length < 60) return;                     // only sweep when it grows
  rows.forEach(function (r) {
    var exp = new Date(r.expiresAt);
    if (String(r.revoked) === 'true' || isNaN(exp) || now > new Date(exp.getTime() + 86400000)) {
      deleteRow_('Sessions', 'token', r.token);
    }
  });
}

// ─────────────────────── impersonation ───────────────────────

/**
 * setViewAs - Super Admin only. Stores the impersonation target on the
 * session row (never on the client, which must not be able to choose who
 * it is). Pass an empty email to stop impersonating.
 */
function setViewAs(targetEmail) {
  var real = CURRENT_REQUEST_REAL_EMAIL;
  var users = readAll_('Users');
  var realUser = users.find(function (u) { return String(u.email).toLowerCase() === String(real).toLowerCase(); });
  if (!realUser || realUser.role !== 'superadmin') {
    throw new Error('Only the Super Admin can use View As.');
  }
  var token = CURRENT_REQUEST_TOKEN;
  if (!token) throw new Error('No active session.');

  var target = String(targetEmail || '').trim().toLowerCase();
  if (target) {
    var t = users.find(function (u) { return String(u.email).toLowerCase() === target; });
    if (!t) throw new Error('User not found.');
    updateRow_('Sessions', 'token', token, { viewAs: target });
    logActivity_('View As started: ' + realUser.email + ' viewing as ' + target, 'a');
    return { success: true, viewAs: target, name: t.name, role: t.role };
  }
  updateRow_('Sessions', 'token', token, { viewAs: '' });
  logActivity_('View As stopped: ' + realUser.email, 'blue');
  return { success: true, viewAs: '' };
}

/** getViewAsUsers - the picker list (Super Admin only). */
function getViewAsUsers() {
  var real = CURRENT_REQUEST_REAL_EMAIL;
  var users = readAll_('Users');
  var realUser = users.find(function (u) { return String(u.email).toLowerCase() === String(real).toLowerCase(); });
  if (!realUser || realUser.role !== 'superadmin') {
    throw new Error('Only the Super Admin can use View As.');
  }
  return users
    .filter(function (u) { return String(u.email).toLowerCase() !== String(real).toLowerCase(); })
    .map(function (u) { return { email: u.email, name: u.name || u.email, role: u.role }; });
}

/** whoAmI - lets the UI restore state (and show the impersonation banner). */
function whoAmI() {
  var users = readAll_('Users');
  var acting = users.find(function (u) {
    return String(u.email).toLowerCase() === String(CURRENT_REQUEST_USER_EMAIL).toLowerCase();
  });
  var real = users.find(function (u) {
    return String(u.email).toLowerCase() === String(CURRENT_REQUEST_REAL_EMAIL).toLowerCase();
  });
  if (!acting || !real) throw new Error('Session expired.');
  return {
    user: { email: acting.email, name: acting.name, role: acting.role, roleLabel: acting.roleLabel, loggedIn: true },
    realUser: { email: real.email, name: real.name, role: real.role },
    impersonating: String(acting.email).toLowerCase() !== String(real.email).toLowerCase()
  };
}