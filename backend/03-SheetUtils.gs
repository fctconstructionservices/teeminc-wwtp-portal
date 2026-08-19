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
 * ensureColumns_ (v11 BATCH I1b) - Adds any schema column that is
 * missing from the sheet's physical header row.
 *
 * WHY THIS EXISTS. Every schema addition so far has come with a note
 * saying "add this header by hand". A forgotten manual step is a
 * feature that silently does nothing: reads are positional, so the
 * value is written and read back fine — until someone sorts, filters or
 * inserts a column in that sheet, at which point data lands under the
 * wrong heading with no error anywhere.
 *
 * Called from ensureSheet_, so it runs on the paths that already touch
 * a sheet before writing. It only ever APPENDS headers — it never
 * reorders or renames, because either of those would move existing data
 * under a different meaning.
 */
function ensureColumns_(name, sh) {
  var want = SCHEMAS[name];
  if (!want || !want.length) return;
  sh = sh || ss_().getSheetByName(name);
  if (!sh) return;

  var lastCol = sh.getLastColumn();
  var have = lastCol > 0
    ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); })
    : [];

  // Only append what is genuinely absent, and keep schema order for the
  // new ones so the sheet stays readable.
  var missing = want.filter(function (h) { return have.indexOf(h) === -1; });
  if (!missing.length) return;

  sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
  _invalidateRead_(name);
}

/**
 * ensureSheet_ (v11 BATCH E) - Returns a sheet, creating it with its
 * schema header row if it does not exist yet.
 *
 * sheet_() throws when a sheet is missing, which is the right behaviour
 * for the core data sheets — a missing Projects sheet means something is
 * badly wrong and should fail loudly. But it makes shipping a NEW sheet
 * a manual step for whoever deploys, and a forgotten step is a broken
 * feature. Configuration sheets that start empty can safely create
 * themselves on first use.
 */
function ensureSheet_(name) {
  var sh = ss_().getSheetByName(name);
  // v11 BATCH I1b: an existing sheet is brought up to schema rather than
  // simply returned, so a new column installs itself instead of waiting
  // for someone to remember a note in a README.
  if (sh) { ensureColumns_(name, sh); return sh; }
  var heads = SCHEMAS[name];
  if (!heads) throw new Error('No schema defined for sheet: ' + name);
  sh = ss_().insertSheet(name);
  sh.getRange(1, 1, 1, heads.length).setValues([heads]);
  sh.setFrozenRows(1);
  _invalidateRead_(name);
  return sh;
}

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
    // lastRow is carried so the batch path can build its A1 range.
    pending.push({ name: n, range: sh.getRange(2, 1, lastRow - 1, heads.length), heads: heads, lastRow: lastRow });
  });

  // ── v17: ONE HTTP CALL INSTEAD OF TWENTY-FOUR ──
  //
  // SpreadsheetApp.getValues() is one round trip to Google per sheet.
  // Twenty-four sheets is twenty-four round trips, and the latency —
  // not the reading — is where the time goes.
  //
  // The Sheets API v4 advanced service has batchGet, which fetches
  // every range in a SINGLE call. Same data, one trip.
  //
  // It is attempted first and falls back silently to the original path,
  // because the advanced service has to be enabled by hand in the Apps
  // Script project. A deployment where somebody forgot should be slow,
  // not broken.
  if (_trySheetsBatch_(pending, out)) return out;

  // Phase 2 (fallback): consecutive getValues on an already-open
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
  const row = heads.map(function (h) {
    var v = (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
    return _textIfIdentifier_(h, v);
  });
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
    // v22.2: an identifier is written as text — see _textIfIdentifier_.
    if (col > -1) sh.getRange(rowNum, col + 1).setValue(_textIfIdentifier_(key, patch[key]));
  });
  _invalidateRead_(name);   // v6.5
  return true;
}

/**
 * ══ v11 BATCH B: COMPOSITE-KEY ROW HELPERS ══
 *
 * findRowNum_/updateRow_/deleteRow_ match on ONE column. That is fine
 * for sheets whose id is globally unique (every nextId_ row), but it is
 * DANGEROUS for sheets whose id is only unique WITHIN a project.
 *
 * SOWItems is the case that bit us. Its ids are typed by hand — "A.1",
 * "1.1", "B.2" — so two different projects routinely hold the same one.
 * updateRow_('SOWItems', 'id', 'A.1', …) rewrites whichever "A.1" sits
 * highest in the sheet, which may belong to a completely different
 * project. deleteSOWItem() had the same flaw, so deleting A.1 from the
 * project you were looking at could silently delete A.1 from another.
 * moveSOWItem() already knew this and hand-rolled its own scan; these
 * helpers make the correct behaviour available everywhere.
 *
 * `match` is an object of column -> required value, all compared as
 * strings: { id: 'A.1', projectId: 'PRJ-0001' }.
 */

/** findRowNumWhere_ - physical row number of the FIRST row matching every
 *  column in `match`, or -1. */
function findRowNumWhere_(name, match) {
  const rows = findRowNumsWhere_(name, match);
  return rows.length ? rows[0] : -1;
}

/** findRowNumsWhere_ - ALL physical row numbers matching `match`,
 *  ascending. */
function findRowNumsWhere_(name, match) {
  const sh = sheet_(name);
  const heads = headers_(name);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, heads.length).getValues();
  const cols = Object.keys(match).map(function (k) {
    const i = heads.indexOf(k);
    if (i === -1) throw new Error('Column "' + k + '" does not exist on sheet ' + name + '.');
    return { i: i, v: String(match[k]) };
  });
  const out = [];
  for (var r = 0; r < values.length; r++) {
    var hit = true;
    for (var c = 0; c < cols.length; c++) {
      // v22: both sides normalised. An id written as text still carries
      // Sheets' apostrophe marker on some reads, and one that was
      // converted to a number reads back as "1" rather than "1.10" —
      // so a bare String() comparison misses rows that are really there.
      if (_cellKey_(values[r][cols[c].i]) !== _cellKey_(cols[c].v)) { hit = false; break; }
    }
    if (hit) out.push(r + 2);
  }
  return out;
}

/** updateRowWhere_ - patch the first row matching every column in
 *  `match`. Returns true when a row was written. */
function updateRowWhere_(name, match, patch) {
  const rowNum = findRowNumWhere_(name, match);
  if (rowNum === -1) return false;
  const sh = sheet_(name);
  const heads = headers_(name);
  Object.keys(patch).forEach(function (key) {
    const col = heads.indexOf(key);
    // v22.2: an identifier is written as text — see _textIfIdentifier_.
    if (col > -1) sh.getRange(rowNum, col + 1).setValue(_textIfIdentifier_(key, patch[key]));
  });
  _invalidateRead_(name);
  return true;
}

/** deleteRowsWhere_ - removes EVERY row matching `match`. Deletes from
 *  the bottom up, because deleting a row shifts everything below it and
 *  a top-down loop would delete the wrong rows. Returns the count. */
function deleteRowsWhere_(name, match) {
  const rowNums = findRowNumsWhere_(name, match);
  if (!rowNums.length) return 0;
  const sh = sheet_(name);
  for (var i = rowNums.length - 1; i >= 0; i--) sh.deleteRow(rowNums[i]);
  _invalidateRead_(name);
  return rowNums.length;
}

/** deleteRowsByValues_ - removes every row whose `col` is in `values`.
 *  One pass, bottom-up. Used to clear a whole set of estimate line items
 *  by groupId without a delete call per row. Returns the count. */
function deleteRowsByValues_(name, col, values) {
  if (!values || !values.length) return 0;
  const sh = sheet_(name);
  const heads = headers_(name);
  const ci = heads.indexOf(col);
  if (ci === -1) throw new Error('Column "' + col + '" does not exist on sheet ' + name + '.');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const wanted = {};
  values.forEach(function (v) { wanted[String(v)] = true; });
  const data = sh.getRange(2, ci + 1, lastRow - 1, 1).getValues();
  const hits = [];
  for (var r = 0; r < data.length; r++) {
    if (wanted[String(data[r][0])]) hits.push(r + 2);
  }
  // ── v25: CONTIGUOUS ROWS ARE DELETED IN ONE CALL ──
  // deleteRow() one at a time is a round trip each. Deleting a project
  // with a few hundred daily records was hundreds of calls, taking long
  // enough that it held the document lock for a minute or more — and
  // every other request in the app queued behind it, which is what made
  // the whole system feel broken during a delete.
  //
  // Rows that sit together are removed as a block. Bottom-up either
  // way, so an earlier deletion never shifts a row still to be removed.
  var run = [];
  for (var i = hits.length - 1; i >= 0; i--) {
    if (run.length && hits[i] === run[run.length - 1] - 1) {
      run.push(hits[i]);
      continue;
    }
    if (run.length) sh.deleteRows(run[run.length - 1], run.length);
    run = [hits[i]];
  }
  if (run.length) sh.deleteRows(run[run.length - 1], run.length);
  if (hits.length) _invalidateRead_(name);
  return hits.length;
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


/**
 * _trySheetsBatch_ (v17) - Fetches every pending range in one HTTP call
 * using the Sheets API v4 advanced service.
 *
 * SETUP: Apps Script editor → Services → add "Google Sheets API" as
 * `Sheets`. Without it this returns false and everything still works,
 * just at the old speed.
 *
 * Returns true if it filled `out`, false to fall through.
 */
function _trySheetsBatch_(pending, out) {
  if (typeof Sheets === 'undefined' || !pending.length) return false;

  try {
    var ranges = pending.map(function (item) {
      // A1 notation with the sheet quoted — names with spaces or
      // apostrophes are real, and an unquoted range fails the whole
      // batch rather than one sheet.
      return "'" + String(item.name).replace(/'/g, "''") + "'!A2:" +
        _colLetter_(item.heads.length) + item.lastRow;
    });

    var res = Sheets.Spreadsheets.Values.batchGet(SHEET_ID, {
      ranges: ranges,
      valueRenderOption: 'UNFORMATTED_VALUE',
      // Dates come back as ISO strings rather than serial numbers.
      // Without this, every date in the system arrives as 45789.
      dateTimeRenderOption: 'FORMATTED_STRING'
    });

    var vr = res && res.valueRanges;
    if (!vr || vr.length !== pending.length) return false;

    for (var i = 0; i < pending.length; i++) {
      var item = pending[i];
      var values = vr[i].values || [];
      var heads = item.heads;
      var rows = [];
      for (var r = 0; r < values.length; r++) {
        var row = values[r];
        var blank = true;
        for (var c = 0; c < row.length; c++) {
          if (row[c] !== '' && row[c] !== null && row[c] !== undefined) { blank = false; break; }
        }
        if (blank) continue;
        var obj = {};
        for (var h = 0; h < heads.length; h++) {
          // batchGet truncates trailing empty cells, so a short row is
          // normal and the missing tail must read as '' rather than
          // undefined — half the code does String(x) on these.
          obj[heads[h]] = row[h] === undefined ? '' : row[h];
        }
        rows.push(obj);
      }
      out[item.name] = rows;
      _READ_MEMO_[item.name] = rows;
    }
    return true;
  } catch (err) {
    // Not enabled, quota, a malformed range — any of these means fall
    // back rather than fail. Logged once so it is visible that the fast
    // path is not being taken.
    if (!_batchWarned_) {
      _batchWarned_ = true;
      console.warn('Sheets batchGet unavailable, using the slower path: ' + err.message);
    }
    return false;
  }
}
var _batchWarned_ = false;

/** _colLetter_ - 1 → A, 26 → Z, 27 → AA. */
function _colLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s || 'A';
}


/**
 * _cellKey_ (v22) - normalises a cell value for comparison.
 *
 * Google Sheets converts anything that looks numeric. An id of "1"
 * comes back as the number 1, and "1.10" comes back as 1.1 — so a
 * lookup for "1.10" finds nothing, and worse, "1.1" and "1.10" resolve
 * to the same row.
 *
 * New rows are written with a leading apostrophe so Sheets leaves them
 * alone. This handles both: it strips the marker, and it renders a
 * number without the trailing zeros Sheets never stored anyway.
 */
function _cellKey_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    // 1 → "1", 1.1 → "1.1". Never "1.0".
    return String(v);
  }
  return String(v).trim().replace(/^'/, '');
}


/**
 * ID_COLUMNS (v22.2) - columns whose value is an IDENTIFIER, never a
 * quantity.
 *
 * ── WHY THIS LIVES IN THE WRITE LAYER ───────────────────────
 *
 * Google Sheets converts anything that looks numeric. An id of "1"
 * becomes the number 1, and "1.10" becomes 1.1 — so a lookup fails, and
 * two different scopes can collapse onto one row.
 *
 * I fixed this twice at the CALL SITE and got it wrong both times:
 * first by rewriting SOWItems.id and leaving ten referencing sheets
 * numeric, then by writing the item id as text in the BOQ import while
 * the estimate group's sowId beside it stayed a bare string. Each fix
 * repaired one side of a relationship, which is worse than repairing
 * neither — the result looks like a feature bug rather than a data one.
 *
 * There are more than a dozen places that write a sowId. Guarding each
 * of them is a list somebody will add to and forget. Guarding the ONE
 * function every write goes through is not.
 *
 * A quantity, a rate and an amount are deliberately absent: those ARE
 * numbers and must stay numbers, or every sum in the system breaks.
 */
var ID_COLUMNS = {
  id: 1, sowId: 1, projectId: 1, prId: 1, poId: 1, groupId: 1,
  quotationId: 1, cashAdvanceId: 1, originalRequestId: 1, requestId: 1,
  recordId: 1, supersedes: 1, predecessors: 1, refId: 1, billingNo: 1,
  docNo: 1, invoiceNo: 1, drawingNo: 1, sampleRef: 1, deliveryRef: 1
};

/**
 * _textIfIdentifier_ - forces an identifier to be stored as text.
 *
 * The leading apostrophe is Sheets' own text marker. _cellKey_ strips
 * it on every read, so nothing downstream needs to know this happened.
 */
function _textIfIdentifier_(column, value) {
  if (!ID_COLUMNS[column]) return value;
  if (value === '' || value === null || value === undefined) return '';
  var s = String(value);
  if (s.charAt(0) === "'") return s;          // already marked
  // Only values that Sheets would misread need the marker. Leaving
  // everything else alone keeps the sheet readable by hand.
  if (!/^[0-9]+(\.[0-9]+)?$/.test(s.trim())) return value;
  return "'" + s;
}
