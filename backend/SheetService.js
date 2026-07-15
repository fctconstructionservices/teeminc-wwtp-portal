/**
 * ============================================
 * FILE: SheetService.gs
 * PURPOSE: Core database layer. Ito lang ang direktang
 *          kumakausap sa Google Sheets API.
 * DEPENDENCIES: Config.gs
 * ============================================
 */

/**
 * Get all rows from a specific sheet (with headers as keys).
 * @param {string} sheetName - Name of the sheet.
 * @returns {Array<object>} Array of row objects.
 */
function getSheetData(sheetName) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var rowObj = {};
    for (var j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = data[i][j];
    }
    rows.push(rowObj);
  }
  return rows;
}

/**
 * Append a new row to a sheet.
 * @param {string} sheetName - Name of the sheet.
 * @param {Array} rowData - Array of values to append.
 * @returns {number} Last row index.
 */
function appendRow(sheetName, rowData) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  sheet.appendRow(rowData);
  return sheet.getLastRow();
}

/**
 * Update a specific cell in a row based on column index.
 * @param {string} sheetName - Name of the sheet.
 * @param {number} rowIndex - Row number (1-based).
 * @param {number} colIndex - Column number (1-based).
 * @param {*} value - New value.
 */
function updateCell(sheetName, rowIndex, colIndex, value) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  sheet.getRange(rowIndex, colIndex).setValue(value);
}

/**
 * Find a row by a specific column value (e.g., ID).
 * @param {string} sheetName - Name of the sheet.
 * @param {string} columnName - Header name of the column to search.
 * @param {*} searchValue - Value to find.
 * @returns {object|null} Row object or null if not found.
 */
function findRowByColumn(sheetName, columnName, searchValue) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
  if (!sheet) return null;
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  
  var headers = data[0];
  var colIndex = headers.indexOf(columnName);
  if (colIndex === -1) return null;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][colIndex] == searchValue) {
      var rowObj = {};
      for (var j = 0; j < headers.length; j++) {
        rowObj[headers[j]] = data[i][j];
      }
      rowObj._rowIndex = i + 1; // Store 1-based row index for updates
      return rowObj;
    }
  }
  return null;
}

/**
 * Get all distinct projects (used for dropdowns/filters).
 * @returns {Array<string>} List of project names/IDs.
 */
function getDistinctProjects() {
  var rows = getSheetData(SHEETS.PROJECTS);
  return rows.map(function(p) { return p.ProjectName || p.ProjectID; }).filter(Boolean);
}