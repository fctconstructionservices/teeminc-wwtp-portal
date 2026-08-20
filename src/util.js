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
export function dayOf(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
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
