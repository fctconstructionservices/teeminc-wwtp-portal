/**
 * ============================================
 * FILE: Materials.gs
 * PURPOSE: Materials and Equipment inventory.
 * DEPENDENCIES: SheetService.gs, Config.gs
 * ============================================
 */

// ---------- MATERIALS ----------
function getMaterials() {
  return getSheetData(SHEETS.MATERIALS);
}

function addMaterial(data) {
  try {
    var rowData = [
      data.MaterialID || 'MAT-' + Utilities.getUuid().substring(0, 6).toUpperCase(),
      data.Name,
      data.Category || 'General',
      data.Quantity || 0,
      data.Unit || 'pcs',
      data.UnitPrice || 0,
      data.Supplier || '',
      data.Remarks || ''
    ];
    appendRow(SHEETS.MATERIALS, rowData);
    return successResponse(null, 'Material added.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

function updateMaterial(materialId, field, value) {
  try {
    var row = findRowByColumn(SHEETS.MATERIALS, 'MaterialID', materialId);
    if (!row) return errorResponse('Material not found.');
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEETS.MATERIALS);
    var headers = sheet.getDataRange().getValues()[0];
    var colIndex = headers.indexOf(field) + 1;
    if (colIndex === 0) return errorResponse('Field not found.');
    updateCell(SHEETS.MATERIALS, row._rowIndex, colIndex, value);
    return successResponse(null, 'Material updated.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

// ---------- EQUIPMENT ----------
function getEquipment() {
  return getSheetData(SHEETS.EQUIPMENT);
}

function addEquipment(data) {
  try {
    var rowData = [
      data.EquipmentID || 'EQ-' + Utilities.getUuid().substring(0, 6).toUpperCase(),
      data.Name,
      data.Type || 'Heavy',
      data.Quantity || 0,
      data.Status || STATUS.PENDING,
      data.Remarks || ''
    ];
    appendRow(SHEETS.EQUIPMENT, rowData);
    return successResponse(null, 'Equipment added.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

function updateEquipment(equipmentId, field, value) {
  try {
    var row = findRowByColumn(SHEETS.EQUIPMENT, 'EquipmentID', equipmentId);
    if (!row) return errorResponse('Equipment not found.');
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEETS.EQUIPMENT);
    var headers = sheet.getDataRange().getValues()[0];
    var colIndex = headers.indexOf(field) + 1;
    if (colIndex === 0) return errorResponse('Field not found.');
    updateCell(SHEETS.EQUIPMENT, row._rowIndex, colIndex, value);
    return successResponse(null, 'Equipment updated.');
  } catch (e) {
    return errorResponse(e.message);
  }
}