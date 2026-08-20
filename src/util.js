import { run } from './db.js';

export function nowIso() {
  return new Date().toISOString();
}

export function low(v) {
  return String(v == null ? '' : v).toLowerCase();
}

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** safeParse - tolerant JSON.parse for the *JSON text columns. */
export function safeParse(json, fallback) {
  if (json === undefined || json === null || json === '') return fallback;
  if (typeof json === 'object') return json;
  try {
    const v = JSON.parse(json);
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export function safeParseArray(json) {
  const v = safeParse(json, []);
  return Array.isArray(v) ? v : [];
}

/** nextId - matches the old PREFIX-XXXXXXXX shape so ids stay uniform. */
export function nextId(prefix) {
  const hex = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${prefix}-${hex}`;
}

/**
 * dayOf - a date column may hold a full ISO timestamp or a bare
 * yyyy-MM-dd. Both must compare as the same day, which is the bug the
 * old backend hit when Sheets silently turned '2026-08-20' into a Date.
 */
/**
 * THE BUSINESS RUNS ON MANILA TIME; THE DATES ARE STORED IN UTC.
 *
 * Apps Script wrote a date-only value at local midnight, which lands in
 * the sheet as the previous day at 16:00 UTC — someone typing
 * "2026-08-14" produced "2026-08-13T16:00:00.000Z". Taking the first ten
 * characters of that reports the day BEFORE the one they typed, for
 * every dated record in the system.
 *
 * A fixed +8 is correct rather than lazy: the Philippines has observed
 * no daylight saving since 1978, so there is no shift to track.
 */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export function dayOf(v) {
  if (!v) return '';
  const s = String(v);
  // A bare date carries no timezone — it is already the day intended.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export function today() {
  return new Date(Date.now() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export async function logActivity(env, actor, text, type) {
  await run(
    env,
    "INSERT INTO ActivityLog (timestamp, text, type, refId) VALUES (?, ?, ?, '')",
    nowIso(), `[${actor}] ${text}`, type || 'blue'
  );
}

export function isAdmin(identity) {
  return identity && (identity.role === 'superadmin' || identity.role === 'admin');
}

export function isSuperAdmin(identity) {
  return identity && identity.role === 'superadmin';
}

export function requireRole(identity, roles, label) {
  if (!identity || roles.indexOf(identity.role) === -1) {
    throw new Error(`Not allowed: ${label || 'this action'} requires ${roles.join(' or ')} access.`);
  }
}
