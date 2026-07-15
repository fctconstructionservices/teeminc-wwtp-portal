/**
 * 02-Api.gs — Web app entry point and action router
 *
 * PURPOSE: The single HTTP entry point of the ERP backend.
 * The frontend (js/services/data-service.js) always POSTs:
 *   { action: '<name>', params: [...], userEmail: '<email>' }
 * doPost() looks the action up in API_ACTIONS and forwards params.
 *
 * SCALABILITY: To expose a new backend feature, define its function
 * in the appropriate service file, then register ONE line in
 * API_ACTIONS below. Nothing else needs to change.
 *
 * NOTE (pre-existing behavior, intentionally preserved): the daily
 * record actions submitDailyRecordForApproval / approveDailyRecord /
 * rejectDailyRecord / getPendingDailyRecords exist in
 * 06-DailyRecordService.gs but are NOT registered here, so the
 * matching DataService calls currently return "Unknown action".
 * Register them below when you decide to activate that flow.
 */

// ============================================================
//  WEB APP ENTRY POINT
// ============================================================

function doGet(e) {
  return jsonResponse_({ status: 'FCTC Operations Board API is running. Use POST requests.' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const params = body.params || [];
    CURRENT_REQUEST_USER_EMAIL = body.userEmail || '';

    const fn = API_ACTIONS[action];
    if (!fn) throw new Error('Unknown action: ' + action);

    const result = fn.apply(null, params);
    return jsonResponse_({ success: true, data: result });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * API_ACTIONS - Maps action names to handler functions
 */
const API_ACTIONS = {
  loginUser: loginUser,
  getHomeData: getHomeData,
  getProjectData: getProjectData,
  getFinanceData: getFinanceData,
  search: search,
  saveEstimates: saveEstimates,
  submitEstimatesForApproval: submitEstimatesForApproval,
  approveEstimates: approveEstimates,
  getAllMaterials: getAllMaterials,
  getMaterials: getMaterials,
  requestMaterial: requestMaterial,
  approveMaterial: approveMaterial,
  searchMaterials: searchMaterials,
  getAllEquipment: getAllEquipment,
  getEquipment: getEquipment,
  requestEquipment: requestEquipment,
  approveEquipment: approveEquipment,
  searchEquipment: searchEquipment,
  addDailyRecord: addDailyRecord,
  getPendingApprovals: getPendingApprovals,
  getMyPendingRequests: getMyPendingRequests,
  getMyApprovedRequests: getMyApprovedRequests,
  getMyRejectedRequests: getMyRejectedRequests,
  getRequestById: getRequestById,
  approveItem: approveItem,
  rejectItem: rejectItem,
  forceApprove: forceApprove,
  forceReject: forceReject,
  // Cash Advance
  submitCashAdvance: submitCashAdvance,
  approveCashAdvance: approveCashAdvance,
  // Cash Release
  submitRelease: submitRelease,
  reviewRelease: reviewRelease,
  getPendingCashReleases: getPendingCashReleases,
  // Incoming Cash
  submitIncomingCash: submitIncomingCash,
  approveIncomingCash: approveIncomingCash,
  // Liquidation
  submitLiquidation: submitLiquidation,
  approveLiquidation: approveLiquidation,
  rejectLiquidation: rejectLiquidation,
  // SOW
  addSOWItem: addSOWItem,
  updateSOWItem: updateSOWItem,
  deleteSOWItem: deleteSOWItem,
  addProject: addProject,
  getSOWItemsForProject: getSOWItemsForProject,
  uploadImage: uploadImage
};
