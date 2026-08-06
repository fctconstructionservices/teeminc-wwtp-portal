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

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwoInhyBINQwtEw66Dh94xT1q6L9aC225NtN86FSygY1PiaUbfBTPhciShCor-puMuc/exec';

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
 * v7.0 SESSION TOKEN
 * The browser no longer tells the server who it is — it presents an
 * opaque token the server issued at login, and the server decides the
 * identity. The stored email is kept only for display.
 */
function getSessionToken() {
    try { return localStorage.getItem('fctc_token') || ''; } catch (e) { return ''; }
}
function setSessionToken(token) {
    try {
        if (token) localStorage.setItem('fctc_token', token);
        else localStorage.removeItem('fctc_token');
    } catch (e) {}
}

/**
 * handleSessionExpired - Sliding 8-hour window means this only fires
 * after real inactivity. Warn about unsaved work BEFORE clearing, so a
 * half-finished daily report isn't silently lost.
 */
function handleSessionExpired() {
    if (window.__fctcExpiring) return;
    window.__fctcExpiring = true;
    const hasDraft = !!document.querySelector('#dailyAddForm.open, #transferModal, #editorsModal');
    setSessionToken('');
    try { localStorage.removeItem('fctc_user'); } catch (e) {}
    const msg = hasDraft
        ? 'Your session expired after 8 hours of inactivity. You have an open form - please copy any unsaved work before continuing, as you will be returned to the login page.'
        : 'Your session expired after 8 hours of inactivity. Please log in again to continue.';
    setTimeout(() => { alert(msg); window.location.reload(); }, 50);
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
        token: getSessionToken(),        // v7.0: identity proof
        userEmail: getCurrentUserEmail() // display only; server ignores it
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
        if (result.code === 'SESSION_EXPIRED') {
            handleSessionExpired();
            throw new Error('Session expired. Please log in again.');
        }
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
    /**
     * login - kept only so older call sites keep working; the legacy
     * plaintext endpoint was removed in v7.5. Delegates to the session
     * login, which is the single authentication path.
     */
    async login(email, password) {
        return await gasCall('loginWithPassword', email, password);
    },

    // ─── HOME ──────────────────────────────────────────────────
    async getHomeData() {
        return await gasCall('getHomeData');
    },

    // ─── PROJECT ──────────────────────────────────────────────
    // ── v9.3 PERF: catalog cache ──────────────────────────────
    // The approved Materials / Equipment / Manpower lists feed every
    // project's dropdowns but change only when someone approves a new
    // catalog entry. They used to be re-fetched on EVERY project open
    // (3 API calls each time). They are cached for the session here and
    // invalidated the moment anything is approved, so the dropdowns can
    // never go stale.
    _catalogCache: null,
    _catalogAt: 0,
    _CATALOG_TTL: 5 * 60 * 1000,   // 5 minutes

    invalidateCatalogs() { this._catalogCache = null; },

    async getCatalogs(force) {
        const fresh = this._catalogCache && (Date.now() - this._catalogAt) < this._CATALOG_TTL;
        if (fresh && !force) return this._catalogCache;
        const [m, e, p] = await Promise.allSettled([
            this.getMaterials('approved'),
            this.getEquipment('approved'),
            this.getManpower('approved')
        ]);
        if (m.status === 'rejected') console.error('catalog materials:', m.reason);
        if (e.status === 'rejected') console.error('catalog equipment:', e.reason);
        if (p.status === 'rejected') console.error('catalog manpower:', p.reason);
        this._catalogCache = {
            materials: m.status === 'fulfilled' ? (m.value || []) : [],
            equipment: e.status === 'fulfilled' ? (e.value || []) : [],
            manpower:  p.status === 'fulfilled' ? (p.value || []) : []
        };
        this._catalogAt = Date.now();
        return this._catalogCache;
    },

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
        this.invalidateCatalogs();   // v9.3: dropdowns must see it now
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
        this.invalidateCatalogs();   // v9.3
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
        this.invalidateCatalogs();   // v9.3
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
    // v7.5: soft-delete recovery (Super Admin)
    async listDeletedRecords(projectId) {
        return await gasCall('listDeletedRecords', projectId);
    },
    async restoreDailyRecord(recordId) {
        return await gasCall('restoreDailyRecord', recordId);
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
    // v9.3 PERF: getPendingApprovals reads ~13 sheets server-side, yet
    // App.navigate() calls it on EVERY page change just to paint the
    // badge number. A short TTL + in-flight de-duplication means moving
    // around the app no longer pays for that read each time, while the
    // Approvals page itself always forces a fresh pull (force = true),
    // and any approve/reject drops the cache immediately.
    _pendingCache: null,
    _pendingAt: 0,
    _pendingInflight: null,
    _PENDING_TTL: 45 * 1000,

    invalidatePending() { this._pendingCache = null; this._pendingInflight = null; },

    async getPendingApprovals(force) {
        const fresh = this._pendingCache && (Date.now() - this._pendingAt) < this._PENDING_TTL;
        if (fresh && !force) return this._pendingCache;
        // de-dupe: if a fetch is already in flight, ride along with it
        if (this._pendingInflight && !force) return this._pendingInflight;
        this._pendingInflight = this._fetchPendingApprovals()
            .then(d => { this._pendingCache = d; this._pendingAt = Date.now(); this._pendingInflight = null; return d; })
            .catch(err => { this._pendingInflight = null; throw err; });
        return this._pendingInflight;
    },

    async _fetchPendingApprovals() {
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
        const r = await gasCall('approveItem', id, type);
        this.invalidatePending();   // v9.3
        // v9.3: any catalog approval must refresh the cached dropdowns
        if (type === 'Material' || type === 'Equipment' || type === 'Manpower') this.invalidateCatalogs();
        return r;
    },
    async rejectItemGeneric(id, type) {
        const r = await gasCall('rejectItem', id, type);
        this.invalidatePending();   // v9.3
        return r;
    },
    async forceApprove(id, type) {
        const r = await gasCall('forceApprove', id, type);
        this.invalidatePending();   // v9.3
        if (type === 'Material' || type === 'Equipment' || type === 'Manpower') this.invalidateCatalogs();
        return r;
    },
    async forceReject(id, type) {
        const r = await gasCall('forceReject', id, type);
        this.invalidatePending();   // v9.3
        return r;
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
    // v6.6: per-project editors (Super Admin)
    // v6.9: location-based transfers + warehouse
    async getTransferOptions(fromLoc, itemType) {
        return await gasCall('getTransferOptions', fromLoc, itemType);
    },
    async requestTransfer(data) {
        return await gasCall('requestTransfer', data);
    },
    async approveTransfer(id) {
        return await gasCall('approveTransfer', id);
    },
    async rejectTransfer(id) {
        return await gasCall('rejectTransfer', id);
    },
    async getWarehouseStock() {
        return await gasCall('getWarehouseStock');
    },
    // v7.0: session-based auth
    async loginWithPassword(email, password) {
        return await gasCall('loginWithPassword', email, password);
    },
    async logout() {
        try { return await gasCall('logout', getSessionToken()); }
        finally { setSessionToken(''); }
    },
    async whoAmI() {
        return await gasCall('whoAmI');
    },
    async setViewAs(email) {
        return await gasCall('setViewAs', email);
    },
    async getViewAsUsers() {
        return await gasCall('getViewAsUsers');
    },
    // v7.2: portfolio dashboard
    async getPortfolioData() {
        return await gasCall('getPortfolioData');
    },
    async getBackupStatus() {
        return await gasCall('getBackupStatus');
    },
    async runBackupNow() {
        return await gasCall('runBackupNow');
    },
    async setProjectEditors(projectId, emails) {
        return await gasCall('setProjectEditors', projectId, emails);
    },
    async getAssignableUsers() {
        return await gasCall('getAssignableUsers');
    },
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
    },

    // ─── v8 ───────────────────────────────────────────────────
    // Batch transfers: multiple items moved in one request
    async requestTransferBatch(data) {
        return await gasCall('requestTransferBatch', data);
    },
    // SOW reordering (Super Admin)
    async moveSOWItem(projectId, sowId, direction) {
        return await gasCall('moveSOWItem', projectId, sowId, direction);
    },
    // Delete a still-pending billing (Super Admin)
    async deleteBilling(id) {
        return await gasCall('deleteBilling', id);
    },
    // ── v9: Site ops — OT / punchlist / safety / drawings ──
    // ── v10: downpayment workflow ──
    async setDownpaymentPct(projectId, pct) {
        return await gasCall('setDownpaymentPct', projectId, pct);
    },
    async createDownpaymentBilling(projectId, period) {
        return await gasCall('createDownpaymentBilling', projectId, period);
    },
    async getDPLedger(projectId) {
        return await gasCall('getDPLedger', projectId);
    },
    async requestOT(data) {
        return await gasCall('requestOT', data);
    },
    async getOTRequests(projectId) {
        return await gasCall('getOTRequests', projectId);
    },
    async addPunchlistItem(data) {
        return await gasCall('addPunchlistItem', data);
    },
    async updatePunchlistItem(id, data) {
        return await gasCall('updatePunchlistItem', id, data);
    },
    async deletePunchlistItem(id) {
        return await gasCall('deletePunchlistItem', id);
    },
    async addSafetyRecord(data) {
        return await gasCall('addSafetyRecord', data);
    },
    async updateSafetyRecord(id, data) {
        return await gasCall('updateSafetyRecord', id, data);
    },
    // v11 BATCH D: safety records had no delete at all, so a mistyped
    // entry stayed on the project's safety history permanently — and
    // that history is what a client audit reads. Super Admin only.
    async deleteSafetyRecord(id) {
        return await gasCall('deleteSafetyRecord', id);
    },

    // ── v11 BATCH E: PRINT TEMPLATE ──
    // The template is fetched once per session and cached by PrintDoc,
    // because it is needed on every print and never changes mid-session
    // unless the Super Admin edits it (which clears the cache).
    async getPrintTemplate() {
        return await gasCall('getPrintTemplate');
    },
    async savePrintTemplate(data) {
        return await gasCall('savePrintTemplate', data);
    },
    async resetPrintTemplate() {
        return await gasCall('resetPrintTemplate');
    },
    async addDrawing(data) {
        return await gasCall('addDrawing', data);
    },
    async deleteDrawing(id) {
        return await gasCall('deleteDrawing', id);
    },
    // Personnel directory (actual people)
    _personnel: [],
    async getAllPersonnel() {
        const list = await gasCall('getAllPersonnel');
        this._personnel = list;
        return list;
    },
    async addPersonnel(data) {
        return await gasCall('addPersonnel', data);
    },
    async updatePersonnel(id, data) {
        return await gasCall('updatePersonnel', id, data);
    }
};