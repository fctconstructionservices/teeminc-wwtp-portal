import { all, first, run } from './db.js';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;
const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function deriveHash(password, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return toHex(bits);
}

async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await deriveHash(password, saltBytes), salt: toHex(saltBytes) };
}

// The old Apps Script backend hashed as SHA256(salt + '::' + password), hex-encoded.
// Accounts imported from that system still carry hashes in that scheme; verifying
// against it here (and upgrading to PBKDF2 below on a successful legacy match)
// mirrors the lazy-upgrade the old system itself did for its own legacy scheme.
async function legacyHash(password, salt) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}::${password}`));
  return toHex(digest);
}

async function verifyPassword(password, hash, salt) {
  const computed = await deriveHash(password, fromHex(salt));
  if (constantTimeEquals(computed, hash)) return { ok: true, legacy: false };

  const legacyComputed = await legacyHash(password, salt);
  if (constantTimeEquals(legacyComputed, hash)) return { ok: true, legacy: true };

  return { ok: false };
}

function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function newToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

function nowIso() {
  return new Date().toISOString();
}

function toPublicUser(u) {
  return { email: u.email, name: u.name, role: u.role, roleLabel: u.roleLabel, loggedIn: true };
}

async function logActivity(env, actor, text, type) {
  await run(
    env,
    "INSERT INTO ActivityLog (timestamp, text, type, refId) VALUES (?, ?, ?, '')",
    nowIso(), `[${actor}] ${text}`, type || 'blue'
  );
}

async function checkLoginLockout(env, email) {
  const row = await first(env, 'SELECT lockedUntil FROM LoginAttempts WHERE lower(email) = ?', email);
  if (row && row.lockedUntil && row.lockedUntil > nowIso()) {
    const minutesLeft = Math.max(1, Math.ceil((new Date(row.lockedUntil).getTime() - Date.now()) / 60000));
    throw new Error(`Too many failed attempts. Try again in ${minutesLeft} minute(s).`);
  }
}

async function recordLoginFailure(env, email) {
  const row = await first(env, 'SELECT failCount FROM LoginAttempts WHERE lower(email) = ?', email);
  const now = nowIso();
  if (!row) {
    await run(
      env,
      "INSERT INTO LoginAttempts (email, failCount, firstFailAt, lastFailAt, lockedUntil) VALUES (?, 1, ?, ?, '')",
      email, now, now
    );
    return;
  }
  const failCount = (Number(row.failCount) || 0) + 1;
  const lockedUntil = failCount >= LOGIN_MAX_ATTEMPTS
    ? new Date(Date.now() + LOGIN_LOCKOUT_MS).toISOString()
    : '';
  await run(
    env,
    'UPDATE LoginAttempts SET failCount = ?, lastFailAt = ?, lockedUntil = ? WHERE lower(email) = ?',
    failCount, now, lockedUntil, email
  );
}

async function clearLoginFailures(env, email) {
  await run(env, 'DELETE FROM LoginAttempts WHERE lower(email) = ?', email);
}

export async function loginWithPassword(env, _identity, email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !password) throw new Error(GENERIC_LOGIN_ERROR);

  await checkLoginLockout(env, email);

  const user = await first(env, 'SELECT * FROM Users WHERE lower(email) = ?', email);
  if (!user || !user.passwordHash || !user.passwordSalt) {
    await recordLoginFailure(env, email);
    throw new Error(GENERIC_LOGIN_ERROR);
  }

  const result = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!result.ok) {
    await recordLoginFailure(env, email);
    throw new Error(GENERIC_LOGIN_ERROR);
  }

  if (result.legacy) {
    const upgraded = await hashPassword(password);
    await run(env, 'UPDATE Users SET passwordHash = ?, passwordSalt = ? WHERE lower(email) = ?', upgraded.hash, upgraded.salt, email);
  }

  await clearLoginFailures(env, email);

  const token = newToken();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await run(
    env,
    "INSERT INTO Sessions (token, email, createdAt, lastSeen, expiresAt, revoked, viewAs) VALUES (?, ?, ?, ?, ?, 0, '')",
    token, email, now, now, expiresAt
  );
  await logActivity(env, email, `${user.name || email} logged in.`, 'blue');

  return { token, user: toPublicUser(user) };
}

export async function resolveSession(env, token) {
  if (!token) return null;
  const session = await first(env, 'SELECT * FROM Sessions WHERE token = ?', token);
  if (!session || Number(session.revoked) === 1) return null;
  if (!session.expiresAt || session.expiresAt <= nowIso()) return null;

  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await run(env, 'UPDATE Sessions SET lastSeen = ?, expiresAt = ? WHERE token = ?', now, expiresAt, token);

  const realUser = await first(env, 'SELECT * FROM Users WHERE lower(email) = ?', session.email);
  if (!realUser) return null;

  let actingUser = realUser;
  let impersonating = false;
  if (session.viewAs && realUser.role === 'superadmin') {
    const target = await first(env, 'SELECT * FROM Users WHERE lower(email) = ?', session.viewAs);
    if (target) {
      actingUser = target;
      impersonating = true;
    }
  }

  return {
    token,
    email: actingUser.email,
    role: actingUser.role,
    realEmail: realUser.email,
    impersonating,
    user: toPublicUser(actingUser),
    realUser: toPublicUser(realUser),
  };
}

export async function whoAmI(env, identity) {
  return { user: identity.user, realUser: identity.realUser, impersonating: identity.impersonating };
}

export async function logout(env, identity) {
  await run(env, 'UPDATE Sessions SET revoked = 1 WHERE token = ?', identity.token);
  return { loggedOut: true };
}

export async function createFirstUser(env, _identity, email, name, password, setupSecret) {
  if (!env.SETUP_SECRET || setupSecret !== env.SETUP_SECRET) {
    throw new Error('Not authorized.');
  }

  email = String(email || '').trim().toLowerCase();
  name = String(name || '').trim();
  if (!email || !name || !password) throw new Error('email, name, and password are required.');

  const countRow = await first(env, 'SELECT COUNT(*) AS n FROM Users');
  if (countRow && countRow.n > 0) throw new Error('Setup already completed — a user already exists.');

  const { hash, salt } = await hashPassword(password);
  await run(
    env,
    "INSERT INTO Users (email, name, password, role, roleLabel, passwordHash, passwordSalt) VALUES (?, ?, '', 'superadmin', 'Super Admin', ?, ?)",
    email, name, hash, salt
  );
  await logActivity(env, email, `${name} created as the first Super Admin.`, 'g');

  return { email, role: 'superadmin' };
}

export function requireRole(identity, roles, label) {
  if (!identity || roles.indexOf(identity.role) === -1) {
    throw new Error(`Not allowed: ${label || 'this action'} requires ${roles.join(' or ')} access.`);
  }
}
