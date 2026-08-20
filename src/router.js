import * as auth from './auth.js';
import * as uploads from './uploads.js';
import * as home from './home.js';
import * as tasks from './tasks.js';
import * as catalogs from './catalogs.js';
import * as project from './project.js';
import * as reads from './reads.js';
import * as finance from './finance.js';
import * as portfolio from './portfolio.js';
import * as searchMod from './search.js';
import * as approvals from './approvals.js';
import * as writes from './writes.js';
import * as procurement from './procurement.js';
import * as sowtools from './sowtools.js';
import * as chat from './chat.js';

const ACTIONS = {
  // ─── auth / session ───
  loginWithPassword: auth.loginWithPassword,
  logout: auth.logout,
  whoAmI: auth.whoAmI,
  createFirstUser: auth.createFirstUser,
  setViewAs: catalogs.setViewAs,
  getViewAsUsers: catalogs.getViewAsUsers,

  // ─── uploads ───
  uploadImage: uploads.uploadImage,
  saveCompanyLogo: uploads.saveCompanyLogo,

  // ─── home / dashboard ───
  getHomeDataCached: home.getHomeDataCached,
  getPendingApprovals: home.getPendingApprovals,

  // ─── tasks ───
  getTasksForMonthCached: tasks.getTasksForMonthCached,
  getMyTaskSummary: tasks.getMyTaskSummary,
  createTask: tasks.createTask,
  completeTask: tasks.completeTask,
  reopenTask: tasks.reopenTask,
  cancelTask: tasks.cancelTask,
  deleteTask: tasks.deleteTask,

  // ─── catalogs ───
  getAllMaterials: catalogs.getAllMaterials,
  getMaterials: catalogs.getMaterials,
  searchMaterials: catalogs.searchMaterials,
  requestMaterial: catalogs.requestMaterial,
  getAllEquipment: catalogs.getAllEquipment,
  getEquipment: catalogs.getEquipment,
  searchEquipment: catalogs.searchEquipment,
  requestEquipment: catalogs.requestEquipment,
  getAllManpower: catalogs.getAllManpower,
  getManpower: catalogs.getManpower,
  searchManpower: catalogs.searchManpower,
  requestManpower: catalogs.requestManpower,
  getAllPersonnel: catalogs.getAllPersonnel,
  addPersonnel: catalogs.addPersonnel,
  updatePersonnel: catalogs.updatePersonnel,
  getClients: catalogs.getClients,
  addClient: catalogs.addClient,
  getSuppliers: catalogs.getSuppliers,
  addSupplier: catalogs.addSupplier,
  updateSupplier: catalogs.updateSupplier,
  deleteSupplier: catalogs.deleteSupplier,
  getAssignableUsers: catalogs.getAssignableUsers,

  // ─── projects ───
  getProjectDataCached: project.getProjectDataCached,
  getSOWItemsForProject: project.getSOWItemsForProject,
  getOTRequests: project.getOTRequests,
  getProjectDocuments: project.getProjectDocuments,
  listDeletedRecords: project.listDeletedRecords,
  getDPLedger: project.getDPLedger,
  setProjectEditors: project.setProjectEditors,
  updateProjectContract: project.updateProjectContract,
  addProject: project.addProject,
  archiveProject: project.archiveProject,
  unarchiveProject: project.unarchiveProject,

  // ─── finance ───
  getFinanceData: finance.getFinanceData,
  getPendingCashReleases: reads.getPendingCashReleases,
  getReleasesToLiquidate: reads.getReleasesToLiquidate,
  getPendingDailyRecords: reads.getPendingDailyRecords,

  // ─── my requests ───
  getMyPendingRequests: reads.getMyPendingRequests,
  getMyApprovedRequests: reads.getMyApprovedRequests,
  getMyRejectedRequests: reads.getMyRejectedRequests,
  getRequestById: reads.getRequestById,

  // ─── procurement ───
  getPurchaseRequests: reads.getPurchaseRequests,
  getPurchaseOrders: reads.getPurchaseOrders,
  getReceipts: reads.getReceipts,
  getPayables: finance.getPayables,
  checkPrBudget: reads.checkPrBudget,

  // ─── quotations / knowledge base ───
  getQuotations: reads.getQuotations,
  getQuotationRevisions: reads.getQuotationRevisions,
  getLessons: reads.getLessons,
  getRetrospectiveCandidates: reads.getRetrospectiveCandidates,

  // ─── discussions ───
  getThread: reads.getThread,
  getThreadCounts: reads.getThreadCounts,
  getUnread: reads.getUnread,
  markThreadRead: reads.markThreadRead,
  markAllRead: reads.markAllRead,
  postComment: reads.postComment,
  editComment: reads.editComment,
  deleteComment: reads.deleteComment,

  // ─── portfolio / search / settings ───
  getPortfolioDataCached: portfolio.getPortfolioDataCached,
  search: searchMod.search,
  getPrintTemplate: reads.getPrintTemplate,
  savePrintTemplate: reads.savePrintTemplate,
  resetPrintTemplate: reads.resetPrintTemplate,

  // ─── transfers / warehouse ───
  getWarehouseStock: reads.getWarehouseStock,
  getTransferOptions: reads.getTransferOptions,

  // ─── backup ───
  getBackupStatus: reads.getBackupStatus,
  runBackupNow: reads.runBackupNow,

  // ─── approval engine (shared by ~10 request types) ───
  approveItem: approvals.approveItem,
  rejectItem: approvals.rejectItem,
  forceApprove: approvals.forceApprove,
  forceReject: approvals.forceReject,
  approveCashAdvance: approvals.approveCashAdvance,
  approveIncomingCash: approvals.approveIncomingCash,
  approveLiquidation: approvals.approveLiquidation,
  rejectLiquidation: approvals.rejectLiquidation,
  approveDailyRecord: approvals.approveDailyRecord,
  rejectDailyRecord: approvals.rejectDailyRecord,
  approvePurchaseOrder: approvals.approvePurchaseOrder,
  reviewRelease: approvals.reviewRelease,
  approveVariationOrder: approvals.approveVariationOrder,
  rejectVariationOrder: approvals.rejectVariationOrder,
  approveTransfer: approvals.approveTransfer,
  rejectTransfer: approvals.rejectTransfer,

  // ─── cash ───
  submitCashAdvance: writes.submitCashAdvance,
  submitRelease: writes.submitRelease,
  submitIncomingCash: writes.submitIncomingCash,
  submitLiquidation: writes.submitLiquidation,

  // ─── transfers ───
  requestTransfer: writes.requestTransfer,
  requestTransferBatch: writes.requestTransferBatch,

  // ─── daily records ───
  addDailyRecord: writes.addDailyRecord,
  updateDailyRecord: writes.updateDailyRecord,
  submitDailyRecordForApproval: writes.submitDailyRecordForApproval,
  deleteDailyRecord: writes.deleteDailyRecord,
  restoreDailyRecord: writes.restoreDailyRecord,

  // ─── SOW ───
  addSOWItem: writes.addSOWItem,
  updateSOWItem: writes.updateSOWItem,
  deleteSOWItem: writes.deleteSOWItem,
  updateSOWBudget: writes.updateSOWBudget,
  setSowItemKind: writes.setSowItemKind,
  moveSOWItem: writes.moveSOWItem,
  saveBaseline: writes.saveBaseline,
  previewSowOutline: sowtools.previewSowOutline,
  addSOWItemsBulk: sowtools.addSOWItemsBulk,
  repairSowSchedules: sowtools.repairSowSchedules,
  repairSowIds: sowtools.repairSowIds,
  auditSowTitles: sowtools.auditSowTitles,
  cleanSowTitleEstimates: sowtools.cleanSowTitleEstimates,

  // ─── estimates ───
  saveEstimates: writes.saveEstimates,
  submitEstimatesForApproval: writes.submitEstimatesForApproval,
  approveEstimates: writes.approveEstimates,

  // ─── site ops ───
  requestOT: writes.requestOT,
  addPunchlistItem: writes.addPunchlistItem,
  updatePunchlistItem: writes.updatePunchlistItem,
  deletePunchlistItem: writes.deletePunchlistItem,
  addSafetyRecord: writes.addSafetyRecord,
  updateSafetyRecord: writes.updateSafetyRecord,
  deleteSafetyRecord: writes.deleteSafetyRecord,
  addDrawing: writes.addDrawing,
  deleteDrawing: writes.deleteDrawing,

  // ─── QA/QC and documents ───
  saveQaqcRecord: writes.saveQaqcRecord,
  closeQaqcRecord: writes.closeQaqcRecord,
  addProjectDocument: writes.addProjectDocument,
  updateProjectDocument: writes.updateProjectDocument,
  deleteProjectDocument: writes.deleteProjectDocument,

  // ─── billings / variation orders ───
  createBilling: writes.createBilling,
  markBillingPaid: writes.markBillingPaid,
  reviseBilling: writes.reviseBilling,
  deleteBilling: writes.deleteBilling,
  setDownpaymentPct: writes.setDownpaymentPct,
  createDownpaymentBilling: writes.createDownpaymentBilling,
  requestVariationOrder: writes.requestVariationOrder,

  // ─── quotations ───
  createQuotation: writes.createQuotation,
  updateQuotation: writes.updateQuotation,
  setQuotationStatus: writes.setQuotationStatus,
  awardQuotation: writes.awardQuotation,
  loseQuotation: writes.loseQuotation,
  deleteQuotation: writes.deleteQuotation,
  reviseQuotation: writes.reviseQuotation,

  // ─── knowledge base ───
  addLesson: writes.addLesson,
  updateLesson: writes.updateLesson,
  deleteLesson: writes.deleteLesson,
  saveProjectRetrospective: writes.saveProjectRetrospective,
  generateProjectRetrospective: sowtools.generateProjectRetrospective,

  // ─── procurement ───
  submitPurchaseRequest: procurement.submitPurchaseRequest,
  submitDraftPurchaseRequest: procurement.submitDraftPurchaseRequest,
  updatePurchaseRequest: procurement.updatePurchaseRequest,
  cancelPurchaseRequest: procurement.cancelPurchaseRequest,
  deletePurchaseRequest: procurement.deletePurchaseRequest,
  createPurchaseOrder: procurement.createPurchaseOrder,
  cancelPurchaseOrder: procurement.cancelPurchaseOrder,
  receiveGoods: procurement.receiveGoods,
  cancelReceipt: procurement.cancelReceipt,
  recordSupplierInvoice: procurement.recordSupplierInvoice,
  paySupplierInvoice: procurement.paySupplierInvoice,
  cancelSupplierInvoice: procurement.cancelSupplierInvoice,

  // ─── chat ───
  chatBootstrap: chat.chatBootstrap,
  chatSync: chat.chatSync,
  chatHistory: chat.chatHistory,
  chatSend: chat.chatSend,
  chatMarkRead: chat.chatMarkRead,
  chatStartDm: chat.chatStartDm,
  chatCreateGroup: chat.chatCreateGroup,
  chatAddMember: chat.chatAddMember,
  chatRemoveMember: chat.chatRemoveMember,
  chatUpload: chat.chatUpload,
  chatDeleteMessage: chat.chatDeleteMessage,

  // ─── project lifecycle ───
  previewProjectDelete: sowtools.previewProjectDelete,
  deleteProject: sowtools.deleteProject,
  duplicatePreview: sowtools.duplicatePreview,
  duplicateProject: sowtools.duplicateProject,
};

const PUBLIC_ACTIONS = new Set(['loginWithPassword', 'createFirstUser']);

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleRequest(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body.' });
  }

  const action = body && body.action;
  const params = Array.isArray(body && body.params) ? body.params : [];
  const fn = ACTIONS[action];
  if (!fn) {
    return jsonResponse({ success: false, error: 'Unknown action: ' + action });
  }

  let identity = null;
  if (!PUBLIC_ACTIONS.has(action)) {
    identity = await auth.resolveSession(env, body && body.token);
    if (!identity) {
      return jsonResponse({
        success: false,
        error: 'Session expired. Please log in again.',
        code: 'SESSION_EXPIRED',
      });
    }
  }

  try {
    const data = await fn(env, identity, ...params);
    return jsonResponse({ success: true, data });
  } catch (err) {
    return jsonResponse({ success: false, error: (err && err.message) || String(err) });
  }
}
