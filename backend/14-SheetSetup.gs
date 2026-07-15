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
