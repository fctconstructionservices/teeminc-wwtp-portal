/**
 * 14-SheetSetup.gs — One-time installer and seed data
 *
 * PURPOSE: Run setupSheets() ONCE from the Apps Script editor when
 * installing on a fresh spreadsheet. It is idempotent: existing tabs
 * and non-empty header rows are left untouched, and seeding skips
 * any sheet that already has data.
 *
 * TABS and SCHEMAS now live in 01-Schemas.gs (shared with runtime).
 */

/**
 * setupSheets - Main setup function
 */
function setupSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  Object.keys(SCHEMAS).forEach(function (tabName) {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    const headers = SCHEMAS[tabName];
    const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const isEmpty = existing.join('') === '';
    if (isEmpty) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  });

  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0) ss.deleteSheet(def);

  seedUsers();
  seedProjects();

  Logger.log('Setup complete! Lahat ng tabs at seed data ay nagawa na.');
}

function seedUsers() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TABS.USERS);
  if (sheet.getLastRow() > 1) return;

  const rows = [
    ['admin@fctc.com', 'Administrator', 'admin123', 'superadmin', 'Super Admin'],
    ['glenn@fctc.com', 'Glenn Cariaso', 'glenn123', 'admin', 'Admin'],
    ['darwin@fctc.com', 'Darwin Fabon', 'darwin123', 'admin', 'Admin'],
    ['andrei@fctc.com', 'Andrei Capunitan', 'andrei123', 'admin', 'Admin'],
    ['jp@fctc.com', 'JP', 'jp123', 'approver', 'Approver']
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function seedProjects() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TABS.PROJECTS);
  if (sheet.getLastRow() > 1) return;

  const rows = [
    ['fctc-cs', 'FCTC Construction Services', 'Ongoing', 0, 0, 0],
    ['ga-overhead', 'General & Admin Expenses (G&A)', 'Ongoing', 0, 0, 0]
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * migrateSchemas - v3 upgrade helper. Run ONCE after deploying the v3 code.
 *
 * Safely brings an EXISTING spreadsheet up to date with 01-Schemas.gs:
 *   1. Creates any missing sheets (ClientLists, Manpower) with headers.
 *   2. For existing sheets, APPENDS any header columns that are in the
 *      schema but not yet in the sheet (e.g. Projects.clientId,
 *      SOWItems.budgetMode, CashRelease.sowId). Existing columns and all
 *      row data are never touched, moved, or renamed.
 * Idempotent: running it twice does nothing the second time.
 */
function migrateSchemas() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const report = [];

  Object.keys(SCHEMAS).forEach(function (tabName) {
    const headers = SCHEMAS[tabName];
    let sheet = ss.getSheetByName(tabName);

    // Case 1: brand new sheet
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      report.push(tabName + ': created with ' + headers.length + ' columns');
      return;
    }

    // Case 2: existing sheet — append missing columns at the end
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(function (h) { return String(h).trim(); })
      .filter(function (h) { return h !== ''; });

    const missing = headers.filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length === 0) { report.push(tabName + ': up to date'); return; }

    // SAFETY GUARD: the schema must be existing headers + appended ones.
    // If the sheet has a column the schema doesn't know, or the shared
    // prefix doesn't match, stop instead of guessing.
    const unknown = existing.filter(function (h) { return headers.indexOf(h) === -1; });
    if (unknown.length > 0) {
      throw new Error(tabName + ': sheet has columns not in schema (' + unknown.join(', ') + '). Resolve manually.');
    }
    for (let i = 0; i < existing.length; i++) {
      if (existing[i] !== headers[i]) {
        throw new Error(tabName + ': column order mismatch at position ' + (i + 1) + ' ("' + existing[i] + '" vs "' + headers[i] + '"). Resolve manually.');
      }
    }

    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, existing.length + 1, 1, missing.length).setFontWeight('bold');
    report.push(tabName + ': appended [' + missing.join(', ') + ']');
  });

  Logger.log('migrateSchemas complete:\n' + report.join('\n'));
  return report;
}
