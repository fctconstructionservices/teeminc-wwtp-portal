/**
 * SheetSetup.gs
 * 
 * PURPOSE: Initializes all the required sheets and columns in the Google Sheet.
 * This script should be run ONCE when setting up the system for the first time.
 * 
 * HOW TO USE:
 * 1. Open the Google Sheet linked to this Apps Script project
 * 2. Run the setupSheets() function from the Apps Script editor
 * 3. The script will create all necessary tabs with proper headers
 * 
 * FIX: Updated DailyRecords schema with status and photosJSON fields
 * FIX: Updated SOWItems schema with startDate, endDate, status, qty, unit
 */

const TABS = {
  USERS: 'Users',
  PROJECTS: 'Projects',
  SOW_ITEMS: 'SOWItems',
  DAILY_RECORDS: 'DailyRecords',
  ESTIMATE_GROUPS: 'EstimateGroups',
  ESTIMATE_MATERIALS: 'EstimateMaterials',
  ESTIMATE_LABOR: 'EstimateLabor',
  ESTIMATE_EQUIPMENT: 'EstimateEquipment',
  ESTIMATE_INDIRECT: 'EstimateIndirect',
  MATERIALS: 'Materials',
  EQUIPMENT: 'Equipment',
  REQUESTS: 'Requests',
  APPROVALS: 'Approvals',
  INCOMING_CASH: 'IncomingCash',
  ACTIVITY_LOG: 'ActivityLog'
};

/**
 * SCHEMAS - Defines the column structure for each sheet
 * PURPOSE: Ensures consistency in data structure across all sheets
 * 
 * FIX: Added 'status' and 'photosJSON' to DailyRecords
 * FIX: Added 'qty' and 'unit' to SOWItems
 */
const SCHEMAS = {
  Users: ['email', 'name', 'password', 'role', 'roleLabel'],
  Projects: ['id', 'name', 'status', 'revenue', 'expenses', 'cashPosition'],
  SOWItems: ['id', 'projectId', 'description', 'budget', 'actual', 'startDate', 'endDate', 'status', 'qty', 'unit'],
  DailyRecords: ['id', 'projectId', 'date', 'weatherAM', 'weatherPM', 'status',
    'manpowerJSON', 'equipmentJSON', 'workAccomplishedJSON', 'materialsDeliveredJSON',
    'issuesJSON', 'visitorsJSON', 'photosJSON', 'createdBy', 'createdAt'],
  EstimateGroups: ['id', 'projectId', 'sowId', 'sowDescription', 'status'],
  EstimateMaterials: ['id', 'groupId', 'material', 'materialName', 'desc', 'qty', 'rate', 'cost'],
  EstimateLabor: ['id', 'groupId', 'role', 'desc', 'qty', 'duration', 'rate', 'cost'],
  EstimateEquipment: ['id', 'groupId', 'equipment', 'equipName', 'desc', 'qty', 'duration', 'rate', 'cost'],
  EstimateIndirect: ['id', 'groupId', 'desc', 'type', 'amount'],
  Materials: ['id', 'code', 'name', 'desc', 'category', 'subcategory', 'unit', 'rate', 'brand', 'supplier',
    'model', 'specs', 'grade', 'size', 'length', 'thickness', 'weight', 'standardCode', 'application',
    'image', 'docsJSON', 'notes', 'status', 'requestedBy', 'createdAt'],
  Equipment: ['id', 'code', 'name', 'desc', 'category', 'type', 'unit', 'rate', 'brand', 'supplier',
    'model', 'capacity', 'serial', 'powerSource', 'ownership', 'acquisitionDate', 'condition', 'manual',
    'image', 'docsJSON', 'notes', 'status', 'requestedBy', 'createdAt'],
  Requests: ['id', 'type', 'projectId', 'requestor', 'requestorEmail', 'amount', 'description', 'scope',
    'attachmentsJSON', 'payloadJSON', 'status', 'createdAt', 'refId','dateNeeded'],
  Approvals: ['requestId', 'approver', 'decision', 'timestamp', 'remarks'],
  IncomingCash: ['id', 'projectId', 'date', 'name', 'desc', 'amount', 'attachmentUrl', 'attachmentName'],
  ActivityLog: ['timestamp', 'text', 'type', 'refId']
};

/**
 * setupSheets - Main setup function
 * PURPOSE: Creates all sheets with proper headers if they don't exist
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

  Logger.log('Setup complete! Lahat ng tabs at seed data ay nagawa na. Tignan ang Sheet mo.');
}

/**
 * seedUsers - Add default users
 */
function seedUsers() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TABS.USERS);
  if (sheet.getLastRow() > 1) return;

  const rows = [
    ['admin@fctc.com', 'Administrator', 'admin123', 'superadmin', 'Super Admin'],
    ['glenn@fctc.com', 'Glenn Cariaso', 'glenn123', 'approver', 'Admin'],
    ['darwin@fctc.com', 'Darwin Fabon', 'darwin123', 'approver', 'Admin'],
    ['andrei@fctc.com', 'Andrei Capunitan', 'andrei123', 'approver', 'Admin'],
    ['jp@fctc.com', 'JP', 'jp123', 'approver', 'Admin']
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * seedProjects - Add default projects
 */
function seedProjects() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TABS.PROJECTS);
  if (sheet.getLastRow() > 1) return;

  const rows = [
    ['fctc-cs', 'FCTC Construction Services', 'Ongoing', 61100.85, 0, 61100.85],
    ['ga-overhead', 'General & Admin Expenses (G&A)', 'Ongoing', 11100.85, 0, 11100.85]
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}