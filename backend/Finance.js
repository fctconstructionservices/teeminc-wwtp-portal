/**
 * ============================================
 * FILE: Finance.gs
 * PURPOSE: Cash Advance, Cash Release, Incoming Cash,
 *          and Finance Dashboard summary.
 * DEPENDENCIES: SheetService.gs, Config.gs
 * ============================================
 */

// ---------- CASH ADVANCE ----------
function getCashAdvances() {
  return getSheetData(SHEETS.CASH_ADVANCE);
}

function submitCashAdvance(data) {
  try {
    var rowData = [
      data.RequestID || 'CA-' + Utilities.getUuid().substring(0, 6).toUpperCase(),
      data.Project,
      data.Amount,
      data.Purpose,
      data.RequestedBy || 'User',
      new Date().toISOString(),
      STATUS.PENDING,
      data.Remarks || ''
    ];
    appendRow(SHEETS.CASH_ADVANCE, rowData);
    return successResponse(null, 'Cash advance request submitted.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

function updateCashAdvanceStatus(requestId, newStatus, remarks) {
  try {
    var row = findRowByColumn(SHEETS.CASH_ADVANCE, 'RequestID', requestId);
    if (!row) return errorResponse('Request not found.');
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEETS.CASH_ADVANCE);
    var headers = sheet.getDataRange().getValues()[0];
    var statusCol = headers.indexOf('Status') + 1;
    var remarksCol = headers.indexOf('Remarks') + 1;
    updateCell(SHEETS.CASH_ADVANCE, row._rowIndex, statusCol, newStatus);
    if (remarks) {
      updateCell(SHEETS.CASH_ADVANCE, row._rowIndex, remarksCol, remarks);
    }
    return successResponse(null, 'Request updated.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

// ---------- CASH RELEASE ----------
function getCashReleases() {
  return getSheetData(SHEETS.CASH_RELEASE);
}

function submitCashRelease(data) {
  try {
    var rowData = [
      data.ReleaseID || 'CR-' + Utilities.getUuid().substring(0, 6).toUpperCase(),
      data.Project,
      data.Amount,
      data.Purpose,
      data.RequestedBy || 'User',
      new Date().toISOString(),
      STATUS.PENDING,
      data.Remarks || ''
    ];
    appendRow(SHEETS.CASH_RELEASE, rowData);
    return successResponse(null, 'Cash release request submitted.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

function updateCashReleaseStatus(requestId, newStatus, remarks) {
  try {
    var row = findRowByColumn(SHEETS.CASH_RELEASE, 'ReleaseID', requestId);
    if (!row) return errorResponse('Request not found.');
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEETS.CASH_RELEASE);
    var headers = sheet.getDataRange().getValues()[0];
    var statusCol = headers.indexOf('Status') + 1;
    var remarksCol = headers.indexOf('Remarks') + 1;
    updateCell(SHEETS.CASH_RELEASE, row._rowIndex, statusCol, newStatus);
    if (remarks) updateCell(SHEETS.CASH_RELEASE, row._rowIndex, remarksCol, remarks);
    return successResponse(null, 'Cash release updated.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

// ---------- INCOMING CASH ----------
function getIncomingCash() {
  return getSheetData(SHEETS.INCOMING_CASH);
}

function submitIncomingCash(data) {
  try {
    var rowData = [
      data.TransactionID || 'IC-' + Utilities.getUuid().substring(0, 6).toUpperCase(),
      data.Project,
      data.Amount,
      data.Source,
      data.ReceivedBy || 'User',
      new Date().toISOString(),
      data.Remarks || ''
    ];
    appendRow(SHEETS.INCOMING_CASH, rowData);
    return successResponse(null, 'Incoming cash recorded.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

// ---------- FINANCE DASHBOARD SUMMARY ----------
function getFinanceSummary() {
  var advances = getSheetData(SHEETS.CASH_ADVANCE);
  var releases = getSheetData(SHEETS.CASH_RELEASE);
  var incoming = getSheetData(SHEETS.INCOMING_CASH);
  
  var totalAdvances = 0, totalReleases = 0, totalIncoming = 0;
  
  advances.forEach(function(row) {
    if (row.Status === STATUS.APPROVED || row.Status === STATUS.COMPLETED) {
      totalAdvances += parseFloat(row.Amount) || 0;
    }
  });
  releases.forEach(function(row) {
    if (row.Status === STATUS.APPROVED || row.Status === STATUS.COMPLETED) {
      totalReleases += parseFloat(row.Amount) || 0;
    }
  });
  incoming.forEach(function(row) {
    totalIncoming += parseFloat(row.Amount) || 0;
  });
  
  return {
    totalAdvances: totalAdvances,
    totalReleases: totalReleases,
    totalIncoming: totalIncoming,
    netCashFlow: totalIncoming - (totalAdvances + totalReleases)
  };
}