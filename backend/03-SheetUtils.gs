/**
 * 03-SheetUtils.gs — Generic Google Sheet CRUD helpers
 *
 * PURPOSE: Low-level, schema-driven data layer. Every service file
 * reads/writes the spreadsheet exclusively through these helpers so
 * that column mapping lives in exactly one place (01-Schemas.gs).
 *
 *   readAll_(name)                -> array of row objects
 *   appendRow_(name, obj)         -> append one row (missing keys -> '')
 *   findRowNum_(name, id, value)  -> physical row number or -1
 *   updateRow_(name, id, value, patch) -> patch selected columns
 *   nextId_(prefix)               -> e.g. 'CA-1A2B3C4D'
 *   safeParse_(str, fallback)     -> tolerant JSON.parse
 */

// ============================================================
//  GENERIC SHEET HELPERS
// ============================================================

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}
function headers_(name) { return SCHEMAS[name]; }

function readAll_(name) {
  const sh = sheet_(name);
  const lastRow = sh.getLastRow();
  const cols = headers_(name).length;
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  const heads = headers_(name);
  return values
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      const obj = {};
      heads.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
}

function appendRow_(name, obj) {
  const sh = sheet_(name);
  const heads = headers_(name);
  const row = heads.map(function (h) { return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : ''; });
  sh.appendRow(row);
  return obj;
}

function findRowNum_(name, idField, idValue) {
  const sh = sheet_(name);
  const heads = headers_(name);
  const idCol = heads.indexOf(idField) + 1;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sh.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(idValue)) return i + 2;
  }
  return -1;
}

function updateRow_(name, idField, idValue, patch) {
  const rowNum = findRowNum_(name, idField, idValue);
  if (rowNum === -1) return false;
  const sh = sheet_(name);
  const heads = headers_(name);
  Object.keys(patch).forEach(function (key) {
    const col = heads.indexOf(key);
    if (col > -1) sh.getRange(rowNum, col + 1).setValue(patch[key]);
  });
  return true;
}

function nextId_(prefix) {
  return prefix + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

/**
 * safeParse_ - JSON.parse that never throws.
 * Used for the *JSON columns (manpowerJSON, photosJSON, ...).
 */
function safeParse_(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; }
}

/**
 * fmtDate_ (v3) - Normalizes a date-ish cell value to a plain
 * 'yyyy-MM-dd' string in the SCRIPT timezone.
 *
 * WHY: readAll_ uses Range.getValues(), which returns a JavaScript
 * Date object for any cell Google Sheets has auto-formatted as a
 * date. When such a Date is sent to the browser it serializes to a
 * UTC ISO string (e.g. Manila midnight -> "...T16:00:00.000Z"), and
 * the frontend's date math then fails ("No dates" on the Gantt).
 * Converting here — with the script timezone — keeps the calendar
 * day correct and gives every client a clean, unambiguous string.
 * Plain string cells (already 'yyyy-MM-dd') pass through unchanged.
 */
function fmtDate_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}