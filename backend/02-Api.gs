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
 * v3: daily-record lifecycle actions are now registered (they were
 * missing before, so the frontend's submit/approve calls failed with
 * "Unknown action"), plus clients, manpower, SOW budget/baseline.
 */

// ============================================================
//  WEB APP ENTRY POINT
// ============================================================

function doGet(e) {
  return jsonResponse_({ status: 'FCTC Operations Board API is running. Use POST requests.' });
}

function doPost(e) {
  try {
    _resetReadCache_();   // v6.5: memo is per-request only, never across requests
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
  uploadImage: uploadImage,

  // ─── v3 ────────────────────────────────────────────
  // Daily record lifecycle (previously missing — see header note)
  submitDailyRecordForApproval: submitDailyRecordForApproval,
  approveDailyRecord: approveDailyRecord,
  rejectDailyRecord: rejectDailyRecord,
  getPendingDailyRecords: getPendingDailyRecords,
  // Clients
  getClients: getClients,
  addClient: addClient,
  // Manpower catalog
  getAllManpower: getAllManpower,
  getManpower: getManpower,
  requestManpower: requestManpower,
  searchManpower: searchManpower,
  // SOW budget mode + Gantt baseline
  updateSOWBudget: updateSOWBudget,
  saveBaseline: saveBaseline,
  // v4 liquidation flow
  getReleasesToLiquidate: getReleasesToLiquidate,
  // v6: billings + variation orders + contract
  updateProjectContract: updateProjectContract,
  createBilling: createBilling,
  markBillingPaid: markBillingPaid,
  reviseBilling: reviseBilling,
  // v6.4: draft daily record edit/delete
  updateDailyRecord: updateDailyRecord,
  // v6.6: per-project editors
  setProjectEditors: setProjectEditors,
  // v6.9: location-based transfers + warehouse
  getTransferOptions: getTransferOptions,
  requestTransfer: requestTransfer,
  approveTransfer: approveTransfer,
  rejectTransfer: rejectTransfer,
  getWarehouseStock: getWarehouseStock,
  getTransfersForProject: getTransfersForProject,
  getAssignableUsers: getAssignableUsers,
  deleteDailyRecord: deleteDailyRecord,
  requestVariationOrder: requestVariationOrder,
  approveVariationOrder: approveVariationOrder,
  rejectVariationOrder: rejectVariationOrder
};