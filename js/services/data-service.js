// ================================================================
//  services/data-service.js — fetch() bridge to the Apps Script API
//
//  PURPOSE: The ONLY place the frontend talks to the backend.
//  Every method wraps gasCall(action, ...params), which POSTs
//  { action, params, userEmail } to GAS_API_URL and unwraps the
//  { success, data | error } envelope (see backend/02-Api.gs).
//
//  DEPLOYMENT: replace GAS_API_URL with your Web App URL (ends in
//  /exec) after each new Apps Script deployment.
//
//  SCALABILITY: to consume a new backend action, add one async
//  wrapper method here — pages never call fetch() directly.
// ================================================================

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbw6f2tk5aSYY1Pz-c0vQ_9wTCCbd_KBTdqT-8oRYQbO9mxUjrUY-SWchtqYX9iEaqjV/exec';

/**
 * getCurrentUserEmail - Retrieves the current user's email from localStorage
 * PURPOSE: Passes the authenticated user's email to the backend for authorization
 */
function getCurrentUserEmail() {
    try {
        const stored = localStorage.getItem('fctc_user');
        if (stored) return JSON.parse(stored).email || '';
    } catch (e) {}
    return '';
}

/**
 * gasCall - Generic API caller
 * PURPOSE: Sends requests to the backend with proper authentication
 */
async function gasCall(action) {
    const params = Array.prototype.slice.call(arguments, 1);
    const payload = {
        action: action,
        params: params,
        userEmail: getCurrentUserEmail()
    };

    const response = await fetch(GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Network error: ' + response.status);
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Unknown server error');
    }
    return result.data;
}

/**
 * DataService - Main API service object
 * PURPOSE: Provides all data operations with consistent error handling
 */
const DataService = {
    _pendingMaterials: [],
    _pendingEquipment: [],
    _materials: [],
    _equipment: [],

    // ─── AUTH ──────────────────────────────────────────────────
    async login(email, password) {
        return await gasCall('loginUser', email, password);
    },

    // ─── HOME ──────────────────────────────────────────────────
    async getHomeData() {
        return await gasCall('getHomeData');
    },

    // ─── PROJECT ──────────────────────────────────────────────
    async getProjectData(projectId) {
        return await gasCall('getProjectData', projectId);
    },

    // v3: status/revenue removed from the form — backend fixes status
    // to 'Ongoing' and zeroes the money fields.
    async addProject(id, name, clientId, location, startDate, endDate) {
        return await gasCall('addProject', id, name, clientId, location, startDate, endDate);
    },

    // ─── CLIENTS (v3) ─────────────────────────────────────────
    async getClients() {
        return await gasCall('getClients');
    },
    async addClient(data) {
        return await gasCall('addClient', data);
    },

    // ─── FINANCE ──────────────────────────────────────────────
    async getFinanceData() {
        return await gasCall('getFinanceData');
    },

    // ─── SEARCH ───────────────────────────────────────────────
    async search(query) {
        return await gasCall('search', query);
    },

    // ─── ESTIMATES ────────────────────────────────────────────
    async saveEstimates(projectId, groups) {
        return await gasCall('saveEstimates', projectId, groups);
    },
    async submitEstimatesForApproval(projectId, sowId) {
        return await gasCall('submitEstimatesForApproval', projectId, sowId);
    },
    async approveEstimates(projectId, sowId) {
        return await gasCall('approveEstimates', projectId, sowId);
    },

    // ─── MATERIALS ────────────────────────────────────────────
    async getAllMaterials() {
        const list = await gasCall('getAllMaterials');
        this._materials = list;
        this._pendingMaterials = list.filter(m => m.status === 'Pending');
        return list;
    },
    async getMaterials(status = 'approved') {
        return await gasCall('getMaterials', status);
    },
    async requestMaterial(data) {
        const result = await gasCall('requestMaterial', data);
        await this.getAllMaterials();
        return result;
    },
    async approveMaterial(id) {
        const result = await gasCall('approveItem', id, 'Material');
        await this.getAllMaterials();
        return result;
    },
    async searchMaterials(query) {
        return await gasCall('searchMaterials', query);
    },

    // ─── EQUIPMENT ────────────────────────────────────────────
    async getAllEquipment() {
        const list = await gasCall('getAllEquipment');
        this._equipment = list;
        this._pendingEquipment = list.filter(e => e.status === 'Pending');
        return list;
    },
    async getEquipment(status = 'approved') {
        return await gasCall('getEquipment', status);
    },
    async requestEquipment(data) {
        const result = await gasCall('requestEquipment', data);
        await this.getAllEquipment();
        return result;
    },
    async approveEquipment(id) {
        const result = await gasCall('approveItem', id, 'Equipment');
        await this.getAllEquipment();
        return result;
    },
    async searchEquipment(query) {
        return await gasCall('searchEquipment', query);
    },

    // ─── MANPOWER (v3) ────────────────────────────────────────
    _pendingManpower: [],
    _manpower: [],
    async getAllManpower() {
        const list = await gasCall('getAllManpower');
        this._manpower = list;
        this._pendingManpower = list.filter(m => m.status === 'Pending');
        return list;
    },
    async getManpower(status = 'approved') {
        return await gasCall('getManpower', status);
    },
    async requestManpower(data) {
        const result = await gasCall('requestManpower', data);
        await this.getAllManpower();
        return result;
    },
    async approveManpower(id) {
        const result = await gasCall('approveItem', id, 'Manpower');
        await this.getAllManpower();
        return result;
    },
    async searchManpower(query) {
        return await gasCall('searchManpower', query);
    },

    // ─── DAILY RECORDS ────────────────────────────────────────
    // v6.4: draft daily record edit/delete
    async updateDailyRecord(recordId, data) {
        return await gasCall('updateDailyRecord', recordId, data);
    },
    async deleteDailyRecord(recordId) {
        return await gasCall('deleteDailyRecord', recordId);
    },
    async addDailyRecord(projectId, data) {
        return await gasCall('addDailyRecord', projectId, data);
    },
    async submitDailyRecordForApproval(recordId) {
        return await gasCall('submitDailyRecordForApproval', recordId);
    },
    async approveDailyRecord(recordId) {
        return await gasCall('approveDailyRecord', recordId);
    },
    async rejectDailyRecord(recordId) {
        return await gasCall('rejectDailyRecord', recordId);
    },
    async getPendingDailyRecords() {
        return await gasCall('getPendingDailyRecords');
    },

    // ─── SOW MANAGEMENT ────────────────────────────────────────
    async addSOWItem(projectId, data) {
        return await gasCall('addSOWItem', projectId, data);
    },
    async updateSOWItem(projectId, sowId, data) {
        return await gasCall('updateSOWItem', projectId, sowId, data);
    },
    async deleteSOWItem(projectId, sowId) {
        return await gasCall('deleteSOWItem', projectId, sowId);
    },
    // v3: budget derivation per SOW item ('auto' | 'indirect' | 'manual')
    async updateSOWBudget(projectId, sowId, mode, manualAmount) {
        return await gasCall('updateSOWBudget', projectId, sowId, mode, manualAmount);
    },
    // v3: MS Project-style baseline snapshot for the Gantt
    async saveBaseline(projectId) {
        return await gasCall('saveBaseline', projectId);
    },

    // ─── PHOTO UPLOAD ──────────────────────────────────────────
    async uploadImage(base64Data, fileName, mimeType) {
        return await gasCall('uploadImage', base64Data, fileName, mimeType);
    },

    // ─── APPROVALS ────────────────────────────────────────────
    async getPendingApprovals() {
        const data = await gasCall('getPendingApprovals') || {};
        const requests = [...(data.cashAdvances || []), ...(data.releases || []), ...(data.liquidations || [])];
        return {
            requests: requests,
            cashAdvances: data.cashAdvances || [],
            releases: data.releases || [],
            incomingCash: data.incomingCash || [],   // v3
            liquidations: data.liquidations || [],
            materials: data.materials || [],
            equipment: data.equipment || [],
            manpower: data.manpower || [],           // v3
            estimates: data.estimates || [],
            dailyRecords: data.dailyRecords || []
        };
    },
    async getMyPendingRequests() {
        return await gasCall('getMyPendingRequests');
    },
    async getMyApprovedRequests() {
        return await gasCall('getMyApprovedRequests');
    },
    async getMyRejectedRequests() {
        return await gasCall('getMyRejectedRequests');
    },
    async getRequestById(id) {
        return await gasCall('getRequestById', id);
    },
    async approveItemGeneric(id, type) {
        return await gasCall('approveItem', id, type);
    },
    async rejectItemGeneric(id, type) {
        return await gasCall('rejectItem', id, type);
    },
    async forceApprove(id, type) {
        return await gasCall('forceApprove', id, type);
    },
    async forceReject(id, type) {
        return await gasCall('forceReject', id, type);
    },

    // ─── CASH ADVANCE ──────────────────────────────────────────
    async submitCashAdvance(payload) {
        return await gasCall('submitCashAdvance', payload);
    },
    async approveCashAdvance(id) {
        return await gasCall('approveCashAdvance', id);
    },

    // ─── CASH RELEASE ──────────────────────────────────────────
    async getPendingCashReleases() {
        return await gasCall('getPendingCashReleases');
    },
    async submitRelease(payload) {
        return await gasCall('submitRelease', payload);
    },
    async reviewRelease(id, reviewerEmail) {
        return await gasCall('reviewRelease', id, reviewerEmail);
    },

    // ─── INCOMING CASH ──────────────────────────────────────────
    async submitIncomingCash(payload) {
        return await gasCall('submitIncomingCash', payload);
    },
    async approveIncomingCash(id) {
        return await gasCall('approveIncomingCash', id);
    },

    // ─── LIQUIDATION ────────────────────────────────────────────
    async submitLiquidation(payload) {
        return await gasCall('submitLiquidation', payload);
    },
    // v4: Reviewed releases still awaiting liquidation (auto-populates the Liquidate form)
    async getReleasesToLiquidate() {
        return await gasCall('getReleasesToLiquidate');
    },

    // ── v6: billings, variation orders, contract ──
    async updateProjectContract(projectId, contractValue, retentionPct) {
        return await gasCall('updateProjectContract', projectId, contractValue, retentionPct);
    },
    async createBilling(projectId, currentPct, period) {
        return await gasCall('createBilling', projectId, currentPct, period);
    },
    async markBillingPaid(id) {
        return await gasCall('markBillingPaid', id);
    },
    // v6.1: client evaluated a different % — supersede + regenerate
    async reviseBilling(id, clientPct) {
        return await gasCall('reviseBilling', id, clientPct);
    },
    async requestVariationOrder(projectId, data) {
        return await gasCall('requestVariationOrder', projectId, data);
    },
    // VO decisions are the CLIENT's decision recorded by an admin — not
    // the internal multi-sig engine, so these call their own actions.
    async approveVariationOrder(id) {
        return await gasCall('approveVariationOrder', id);
    },
    async rejectVariationOrder(id) {
        return await gasCall('rejectVariationOrder', id);
    },
    async approveLiquidation(id) {
        return await gasCall('approveLiquidation', id);
    },
    async rejectLiquidation(id) {
        return await gasCall('rejectLiquidation', id);
    },

    // ─── SOW ITEMS FOR PROJECT ────────────────────────────────
    async getSOWItemsForProject(projectId) {
        return await gasCall('getSOWItemsForProject', projectId);
    }
};