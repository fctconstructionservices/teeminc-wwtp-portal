/**
 * ============================================
 * FILE: Approvals.gs
 * PURPOSE: Multi-level approval workflow (v4).
 * DEPENDENCIES: SheetService.gs, Config.gs
 * ============================================
 */

function getApprovalRequests() {
  return getSheetData(SHEETS.APPROVALS);
}

function submitApproval(data) {
  try {
    var rowData = [
      data.ApprovalID || 'APP-' + Utilities.getUuid().substring(0, 6).toUpperCase(),
      data.Project,
      data.Type || 'General', // e.g., Cash Advance, Purchase, etc.
      data.Details,
      data.RequestedBy || 'User',
      new Date().toISOString(),
      STATUS.PENDING,
      data.Level || 1,
      data.Remarks || ''
    ];
    appendRow(SHEETS.APPROVALS, rowData);
    return successResponse(null, 'Approval request submitted.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

function updateApprovalStatus(approvalId, newStatus, remarks) {
  try {
    var row = findRowByColumn(SHEETS.APPROVALS, 'ApprovalID', approvalId);
    if (!row) return errorResponse('Approval not found.');
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEETS.APPROVALS);
    var headers = sheet.getDataRange().getValues()[0];
    var statusCol = headers.indexOf('Status') + 1;
    var remarksCol = headers.indexOf('Remarks') + 1;
    var levelCol = headers.indexOf('Level') + 1;
    
    updateCell(SHEETS.APPROVALS, row._rowIndex, statusCol, newStatus);
    if (remarks) updateCell(SHEETS.APPROVALS, row._rowIndex, remarksCol, remarks);
    
    // If approved, escalate level or mark completed
    if (newStatus === STATUS.APPROVED) {
      var currentLevel = parseInt(row.Level) || 1;
      if (currentLevel < 3) {
        updateCell(SHEETS.APPROVALS, row._rowIndex, levelCol, currentLevel + 1);
        updateCell(SHEETS.APPROVALS, row._rowIndex, statusCol, STATUS.FOR_APPROVAL);
      } else {
        updateCell(SHEETS.APPROVALS, row._rowIndex, statusCol, STATUS.COMPLETED);
      }
    }
    return successResponse(null, 'Approval updated.');
  } catch (e) {
    return errorResponse(e.message);
  }
}