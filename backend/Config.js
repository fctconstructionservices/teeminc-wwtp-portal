/**
 * ============================================
 * FILE: Config.gs
 * PURPOSE: Centralized constants, sheet names,
 *          status enums, and API response templates.
 * ============================================
 */

// Google Sheets ID (nakalagay sa iyong current setup)
var SHEET_ID = '1Z-1NtuiJ_BYfUD_9CGfccJmJT6hHmnunc5zbrHaMiDw';

// Sheet names (gaya ng nasa lumang Code.js)
var SHEETS = {
  USERS: 'Users',
  PROJECTS: 'Projects',
  CASH_ADVANCE: 'CashAdvanceRequests',
  CASH_RELEASE: 'CashRelease',
  INCOMING_CASH: 'IncomingCashRequests',
  LIQUIDATIONS: 'Liquidations',
  MATERIALS: 'Materials',
  EQUIPMENT: 'Equipment',
  APPROVALS: 'Approvals'
};

// Status enums (para standardized)
var STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  FOR_APPROVAL: 'For Approval',
  COMPLETED: 'Completed'
};

// Response template
function successResponse(data, message = 'Success') {
  return { success: true, message: message, data: data };
}

function errorResponse(message = 'An error occurred') {
  return { success: false, message: message };
}