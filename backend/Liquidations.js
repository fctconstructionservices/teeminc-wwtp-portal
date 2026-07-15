/**
 * ============================================
 * FILE: Liquidations.gs
 * PURPOSE: Liquidation requests (with attachments/receipts).
 * DEPENDENCIES: SheetService.gs, Config.gs
 * ============================================
 */

function getLiquidations() {
  return getSheetData(SHEETS.LIQUIDATIONS);
}

function submitLiquidation(data) {
  try {
    var rowData = [
      data.LiquidationID || 'LIQ-' + Utilities.getUuid().substring(0, 6).toUpperCase(),
      data.Project,
      data.CashAdvanceID || '',
      data.Amount,
      data.Purpose,
      data.AttachmentURL || '', // GDrive link or base64
      data.SubmittedBy || 'User',
      new Date().toISOString(),
      STATUS.PENDING,
      data.Remarks || ''
    ];
    appendRow(SHEETS.LIQUIDATIONS, rowData);
    return successResponse(null, 'Liquidation submitted.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

function updateLiquidationStatus(liquidationId, newStatus, remarks) {
  try {
    var row = findRowByColumn(SHEETS.LIQUIDATIONS, 'LiquidationID', liquidationId);
    if (!row) return errorResponse('Liquidation not found.');
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEETS.LIQUIDATIONS);
    var headers = sheet.getDataRange().getValues()[0];
    var statusCol = headers.indexOf('Status') + 1;
    var remarksCol = headers.indexOf('Remarks') + 1;
    updateCell(SHEETS.LIQUIDATIONS, row._rowIndex, statusCol, newStatus);
    if (remarks) updateCell(SHEETS.LIQUIDATIONS, row._rowIndex, remarksCol, remarks);
    return successResponse(null, 'Liquidation updated.');
  } catch (e) {
    return errorResponse(e.message);
  }
}