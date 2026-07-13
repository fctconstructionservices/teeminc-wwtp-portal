// ================================================================
//  DATA SERVICE — fetch() bridge to Google Apps Script API
//  PURPOSE: Provides a clean JavaScript API for all backend operations 
//  UPDATED: New structure with separate sheets for each request type
// ================================================================

// PALITAN ITO ng iyong Apps Script Web App URL (nagtatapos sa /exec)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxZlZxUwlzyM2RRGSE1zlBQea5vqKKqsZ5LcP0Ovtv2lO_X87kDNP7H8RLzhKMFIP16/exec';

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

    async addProject(id, name, status, revenue, expenses, cashPosition) {
        return await gasCall('addProject', id, name, status, revenue, expenses, cashPosition);
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

    // ─── DAILY RECORDS ────────────────────────────────────────
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

    // ─── PHOTO UPLOAD ──────────────────────────────────────────
    async uploadImage(base64Data, fileName, mimeType) {
        return await gasCall('uploadImage', base64Data, fileName, mimeType);
    },

    // ─── APPROVALS ────────────────────────────────────────────
    async getPendingApprovals() {
        const data = await gasCall('getPendingApprovals');
        // Map to old format for compatibility with existing UI
        const requests = [...(data.cashAdvances || []), ...(data.releases || [])];
        return {
            requests: requests,
            cashAdvances: data.cashAdvances || [],
            releases: data.releases || [],
            materials: data.materials || [],
            equipment: data.equipment || [],
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

    // ─── SOW ITEMS FOR PROJECT ────────────────────────────────
    async getSOWItemsForProject(projectId) {
        return await gasCall('getSOWItemsForProject', projectId);
    }
};