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

/**
 * ══ v6.5 PERFORMANCE: batched reads ══
 *
 * Every readAll_ is a separate round-trip to the Sheets service, so a
 * page that touches 16 sheets pays 16 round-trips before it can render.
 * readMany_ fetches them together and memoizes the result for the rest
 * of the request, so repeated reads of the same sheet inside one
 * execution are free.
 *
 * Correctness note: the memo lives ONLY for the current execution (it is
 * reset by _resetReadCache_ at the start of each API call), so a request
 * can never serve data written by an earlier request. Any write inside a
 * request drops that sheet from the memo, so later reads see the change.
 */
var _READ_MEMO_ = {};

function _resetReadCache_() { _READ_MEMO_ = {}; }
function _invalidateRead_(name) { if (_READ_MEMO_) delete _READ_MEMO_[name]; }

/**
 * readMany_ - Loads several sheets in one pass and returns
 * { SheetName: [rows] }. Uses a single spreadsheet handle and pulls each
 * sheet's data range back-to-back, which Apps Script pipelines far more
 * efficiently than scattered getRange calls across a function body.
 */
function readMany_(names) {
  const out = {};
  const need = [];
  names.forEach(function (n) {
    if (_READ_MEMO_[n]) out[n] = _READ_MEMO_[n];
    else need.push(n);
  });
  if (need.length === 0) return out;

  const ss = ss_();
  const pending = [];
  // Phase 1: resolve sheets and queue ranges (no values fetched yet)
  need.forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (!sh) { out[n] = []; _READ_MEMO_[n] = []; return; }
    const lastRow = sh.getLastRow();
    const heads = headers_(n);
    if (lastRow < 2 || !heads || !heads.length) { out[n] = []; _READ_MEMO_[n] = []; return; }
    pending.push({ name: n, range: sh.getRange(2, 1, lastRow - 1, heads.length), heads: heads });
  });

  // Phase 2: fetch values — consecutive getValues on an already-open
  // spreadsheet are served from one flush instead of one per call.
  pending.forEach(function (item) {
    const values = item.range.getValues();
    const heads = item.heads;
    const rows = [];
    for (var r = 0; r < values.length; r++) {
      const row = values[r];
      var blank = true;
      for (var c = 0; c < row.length; c++) { if (row[c] !== '' && row[c] !== null) { blank = false; break; } }
      if (blank) continue;
      const obj = {};
      for (var h = 0; h < heads.length; h++) obj[heads[h]] = row[h];
      rows.push(obj);
    }
    out[item.name] = rows;
    _READ_MEMO_[item.name] = rows;
  });
  return out;
}

function readAll_(name) {
  // v6.5: serve from the per-request memo when the sheet was already
  // loaded by a readMany_ batch (or an earlier readAll_ in this call).
  if (_READ_MEMO_[name]) return _READ_MEMO_[name];
  return _readAllUncached_(name);
}

function _readAllUncached_(name) {
  const sh = sheet_(name);
  const lastRow = sh.getLastRow();
  const cols = headers_(name).length;
  if (lastRow < 2) { _READ_MEMO_[name] = []; return []; }
  const values = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  const heads = headers_(name);
  const rows = values
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      const obj = {};
      heads.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
  _READ_MEMO_[name] = rows;
  return rows;
}

function appendRow_(name, obj) {
  const sh = sheet_(name);
  const heads = headers_(name);
  const row = heads.map(function (h) { return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : ''; });
  sh.appendRow(row);
  _invalidateRead_(name);   // v6.5: later reads in this request must see the new row
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
  _invalidateRead_(name);   // v6.5
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

/**
 * fmtMoney_ (v5) - Backend money formatting with comma grouping and two
 * decimals ("12,345.60"), for any peso string composed server-side (KPI
 * cards, gauges). Manual grouping — Apps Script's toLocaleString is not
 * reliable for this.
 */
function fmtMoney_(n) {
  var v = Number(n) || 0;
  var neg = v < 0 ? '-' : '';
  v = Math.abs(v);
  var parts = v.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg + parts[0] + '.' + parts[1];
}

/**
 * deleteRow_ (v6.4) - Physically removes the row whose idField matches.
 * Returns true when a row was deleted.
 */
function deleteRow_(name, idField, idValue) {
  const rowNum = findRowNum_(name, idField, idValue);
  if (rowNum === -1) return false;
  sheet_(name).deleteRow(rowNum);
  _invalidateRead_(name);   // v6.5
  return true;
}
/**
 * fmtDateTime_ (v9) - Like fmtDate_ but keeps the TIME part when the
 * value actually has one ('yyyy-MM-dd HH:mm'). Pure dates stay clean
 * 'yyyy-MM-dd'. Used for createdAt/timestamps shown in the UI.
 */
function fmtDateTime_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var tz = Session.getScriptTimeZone();
    // v9.1 TIME-CELL FIX: when a plain time like "17:00" is written to a
    // cell, Sheets converts it to a Date anchored at 1899-12-30. Reading
    // it back and formatting as a date produced garbage like
    // "1899-12-30 17:00" (seen on OT start/end). Any Date from before
    // 1901 IS a time value — format it as HH:mm only.
    if (v.getFullYear() < 1901) {
      return Utilities.formatDate(v, tz, 'HH:mm');
    }
    var hasTime = v.getHours() + v.getMinutes() + v.getSeconds() > 0;
    return Utilities.formatDate(v, tz, hasTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  }
  return String(v);
}

/**
 * sanitizeDatesDeep_ (v9 — item 7 fix) - Recursively converts every
 * Date object inside a payload (object/array, any nesting) into a
 * clean script-timezone string via fmtDateTime_.
 *
 * WHY: readAll_ returns JS Date objects for any cell Sheets has
 * auto-formatted as a date (createdAt, date, billingDate, ...). When
 * such payloads were returned raw — as the Approvals dashboard did —
 * JSON serialization produced UTC ISO strings ("2026-07-20T16:00:00.000Z"),
 * which (a) display as ugly raw ISO text and (b) show the WRONG
 * calendar day for PH time (UTC+8). Passing every outbound approval
 * payload through this eliminates the whole bug class at the source.
 */
function sanitizeDatesDeep_(v) {
  if (v === null || v === undefined) return v;
  if (Object.prototype.toString.call(v) === '[object Date]') return fmtDateTime_(v);
  if (Array.isArray(v)) return v.map(sanitizeDatesDeep_);
  if (typeof v === 'object') {
    var out = {};
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = sanitizeDatesDeep_(v[k]);
    return out;
  }
  return v;
}
