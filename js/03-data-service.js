// ================================================================
//  DATA SERVICE — fetch() bridge papunta sa Google Apps Script API
//  Parehong method names/signatures gaya ng dati.
// ================================================================

// PALITAN ITO ng iyong Apps Script Web App URL (nagtatapos sa /exec)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxZlZxUwlzyM2RRGSE1zlBQea5vqKKqsZ5LcP0Ovtv2lO_X87kDNP7H8RLzhKMFIP16/exec';

function getCurrentUserEmail() {
    try {
        const stored = localStorage.getItem('fctc_user');
        if (stored) return JSON.parse(stored).email || '';
    } catch (e) {}
    return '';
}

// Generic caller — nagpapadala ng { action, params, userEmail } bilang
// plain-text POST body (para maiwasan ang CORS preflight na hindi
// nasusuportahan nang maayos ng Apps Script).
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
        // Sadyang walang Content-Type header dito — nagdi-default ang browser
        // sa 'text/plain', na hindi nagpapa-trigger ng CORS preflight.
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

const DataService = {
    _pendingMaterials: [],
    _pendingEquipment: [],
    _materials: [],
    _equipment: [],

    async login(email, password) {
        return await gasCall('loginUser', email, password);
    },

    async getHomeData() {
        return await gasCall('getHomeData');
    },

    async getProjectData(projectId) {
        return await gasCall('getProjectData', projectId);
    },

    async getFinanceData() {
        return await gasCall('getFinanceData');
    },

    async search(query) {
        return await gasCall('search', query);
    },

    // ─── ESTIMATES ───
    async saveEstimates(projectId, groups) {
        return await gasCall('saveEstimates', projectId, groups);
    },
    async submitEstimatesForApproval(projectId, sowId) {
        return await gasCall('submitEstimatesForApproval', projectId, sowId);
    },
    async approveEstimates(projectId, sowId) {
        return await gasCall('approveEstimates', projectId, sowId);
    },

    // ─── MATERIALS ───
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

    // ─── EQUIPMENT ───
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

    // ─── DAILY RECORDS ───
    async addDailyRecord(projectId, data) {
        return await gasCall('addDailyRecord', projectId, data);
    },

    // ─── APPROVALS ───
    async getPendingApprovals() {
        return await gasCall('getPendingApprovals');
    },
    async getMyPendingRequests() {
        return await gasCall('getMyPendingRequests');
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

    // ─── CASH REQUESTS ───
    async submitCashAdvance(payload) {
        return await gasCall('submitCashAdvance', payload);
    },
    async submitLiquidation(payload) {
        return await gasCall('submitLiquidation', payload);
    },
    async submitIncomingCash(payload) {
        return await gasCall('submitIncomingCash', payload);
    },
    async submitRelease(payload) {
        return await gasCall('submitRelease', payload);
    }
};
