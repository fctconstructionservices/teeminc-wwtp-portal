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

/**
 * PUBLIC_ACTIONS - the only actions callable without a session token.
 * Everything else requires authentication, enforced here in ONE place
 * so a new action can never accidentally ship unauthenticated.
 */
// v7.5 SECURITY: only the login endpoint may be called without a token.
//
// Previously this list also contained loginUser (the pre-token login,
// which compared plaintext passwords and revealed whether an email was
// registered), migrateSchemas, and setupSheets. setupSheets recreates
// the seed users — including a Super Admin with a known password — so
// exposing it without authentication meant anyone holding the /exec URL
// could grant themselves full access with a single request.
//
// Schema setup and migration are administrative operations. Run them
// from the Apps Script editor, where the operator is already
// authenticated by Google; they must never be reachable over the API.
const PUBLIC_ACTIONS = { loginWithPassword: true };

/**
 * WRITE_ACTION_RE - actions that mutate data take a document lock, so two
 * people acting at the same moment can't interleave a read-modify-write
 * and corrupt each other's changes (e.g. two admins approving the same
 * item, or two estimate saves racing on the same sheet rewrite).
 */
const WRITE_ACTION_RE = /^(add|create|update|delete|submit|request|approve|reject|save|set|mark|revise|force|review|migrate|setup|liquidat|transfer|move)/i;

function doPost(e) {
  var lock = null;
  try {
    _resetReadCache_();   // v6.5: memo is per-request only, never across requests
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const params = body.params || [];

    const fn = API_ACTIONS[action];
    if (!fn) throw new Error('Unknown action: ' + action);

    // ── v7.0 AUTH: identity comes from the token, never from the client ──
    CURRENT_REQUEST_TOKEN = String(body.token || '');
    CURRENT_REQUEST_USER_EMAIL = '';
    CURRENT_REQUEST_REAL_EMAIL = '';
    CURRENT_REQUEST_ROLE = '';
    CURRENT_REQUEST_IMPERSONATING = false;

    if (!PUBLIC_ACTIONS[action]) {
      const sess = resolveSession_(CURRENT_REQUEST_TOKEN);
      if (!sess) {
        return jsonResponse_({ success: false, error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' });
      }
      CURRENT_REQUEST_USER_EMAIL = sess.email;
      CURRENT_REQUEST_REAL_EMAIL = sess.realEmail;
      CURRENT_REQUEST_ROLE = sess.role;
      CURRENT_REQUEST_IMPERSONATING = sess.impersonating;
    }

    // ── v7.0 CONCURRENCY: serialize writes ──
    // v7.0.3: getDocumentLock() can return null (and getScriptLock can
    // throw) depending on how the script is invoked, which crashed the
    // request with "cannot read properties of null". A lock is a safety
    // measure, not a precondition — if the service will not give us one,
    // continue without it rather than blocking the user entirely.
    if (WRITE_ACTION_RE.test(action)) {
      try {
        lock = LockService.getDocumentLock() || LockService.getScriptLock();
      } catch (lockErr) {
        lock = null;
      }
      if (lock && typeof lock.tryLock === 'function') {
        if (!lock.tryLock(20000)) {
          lock = null;   // nothing to release in `finally`
          throw new Error('The system is busy with another update. Please try again in a moment.');
        }
      } else {
        lock = null;
      }
      _resetReadCache_();   // re-read fresh inside the lock
    }

    const result = fn.apply(null, params);
    return jsonResponse_({ success: true, data: result });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (_) {} }
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * API_ACTIONS - Maps action names to handler functions
 */
const API_ACTIONS = {
  // v7.0: sessions + impersonation
  loginWithPassword: loginWithPassword,
  logout: logout,
  whoAmI: whoAmI,
  setViewAs: setViewAs,
  getViewAsUsers: getViewAsUsers,
  // v7.0: backup
  runBackupNow: runBackupNow,
  getBackupStatus: getBackupStatus,
  // v7.2: portfolio dashboard
  getPortfolioData: getPortfolioData,
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
  // v7.5: soft-delete recovery
  listDeletedRecords: listDeletedRecords,
  restoreDailyRecord: restoreDailyRecord,
  purgeDeletedRecords: purgeDeletedRecords,
  requestVariationOrder: requestVariationOrder,
  approveVariationOrder: approveVariationOrder,
  rejectVariationOrder: rejectVariationOrder,
  // ─── v8 ────────────────────────────────────────────
  // Batch transfers (multiple items in one request)
  requestTransferBatch: requestTransferBatch,
  // SOW reordering (Super Admin)
  moveSOWItem: moveSOWItem,
  // Delete a still-pending billing (Super Admin)
  deleteBilling: deleteBilling,
  // Personnel directory (actual people, separate from the role catalog)
  getAllPersonnel: getAllPersonnel,

  // ── v9: Site ops — OT, punchlist, safety, drawings ──
  requestOT: requestOT,
  getOTRequests: getOTRequests,
  addPunchlistItem: addPunchlistItem,
  updatePunchlistItem: updatePunchlistItem,
  deletePunchlistItem: deletePunchlistItem,
  getPunchlist: getPunchlist,
  addSafetyRecord: addSafetyRecord,
  updateSafetyRecord: updateSafetyRecord,
  getSafetyRecords: getSafetyRecords,
  addDrawing: addDrawing,
  deleteDrawing: deleteDrawing,
  getDrawings: getDrawings,
  addPersonnel: addPersonnel,
  updatePersonnel: updatePersonnel
};