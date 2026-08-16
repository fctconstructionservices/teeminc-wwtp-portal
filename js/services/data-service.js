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

// v12: the URL lives in js/core/config.js — the one file that differs
// between companies. Hardcoding it here is what would force a fork of
// the whole repository to stand up a second company.
//
// The fallback is deliberate and loud: an empty string would fail with
// an unhelpful network error, so a missing config says what is wrong.
const GAS_API_URL = (typeof CONFIG !== 'undefined' && CONFIG.apiUrl)
    ? CONFIG.apiUrl
    : (function () {
        console.error('js/core/config.js is missing or has no apiUrl — the app cannot reach its backend.');
        return '';
    })();

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
/**
 * gasCall - every request goes through here.
 *
 * v17: the cache is wired in at this ONE point, so it covers every
 * endpoint without a single page knowing it exists. That is the same
 * property that makes a future database migration a rewrite of this
 * function rather than of the whole app.
 */
async function gasCall(action) {
    const params = Array.prototype.slice.call(arguments, 1);

    // ── v17: WRITES CLEAR THE CACHE, ALWAYS ──
    // Seeing your own change missing is the failure people notice and
    // lose trust over, so it is prevented at the source rather than
    // patched per page.
    if (typeof FastCache !== 'undefined' && !FastCache.CACHEABLE[action]) {
        FastCache.clear();
    }

    return _gasCallRaw(action, params);
}

async function _gasCallRaw(action, params) {
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
    /**
     * getHomeData - v17: served from memory when it is fresh, refreshed
     * behind the screen. onFresh redraws only if something changed.
     */
    async getHomeData(onFresh) {
        return await FastCache.wrap('getHomeDataCached', [],
            () => gasCall('getHomeDataCached'), onFresh);
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

    /**
     * getProjectData - v17: served from memory when it is fresh, refreshed
     * behind the screen. onFresh redraws only if something changed.
     */
    async getProjectData(projectId, onFresh) {
        return await FastCache.wrap('getProjectDataCached', [projectId],
            () => gasCall('getProjectDataCached', projectId), onFresh);
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
        // v11 BATCH A: this used to be a hand-maintained WHITELIST, and
        // `otRequests` was never added to it — so the backend returned
        // pending OT requests correctly and this function threw them
        // away, leaving the Overtime section of the inbox permanently
        // empty. Billings would have hit the same wall. Every key the
        // backend sends is now passed through, and the known array keys
        // are defaulted so callers can index them without guarding.
        const KEYS = ['cashAdvances', 'releases', 'incomingCash', 'liquidations',
            'materials', 'equipment', 'manpower', 'estimates', 'billings',
            'dailyRecords', 'otRequests', 'purchaseRequests'];   // v11 BATCH G1
        const out = Object.assign({}, data);
        KEYS.forEach(k => { out[k] = data[k] || []; });
        // legacy convenience key: the cash-money subset, kept because
        // older call sites still read it.
        out.requests = [...out.cashAdvances, ...out.releases, ...out.liquidations];
        return out;
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
    /**
     * getPortfolioData - v17: served from memory when it is fresh, refreshed
     * behind the screen. onFresh redraws only if something changed.
     */
    async getPortfolioData(onFresh) {
        return await FastCache.wrap('getPortfolioDataCached', [],
            () => gasCall('getPortfolioDataCached'), onFresh);
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

    // ── v11 BATCH F1: KNOWLEDGE BASE / LESSONS LEARNED ──
    async getLessons(projectId) {
        return await gasCall('getLessons', projectId || '');
    },
    async addLesson(data) {
        return await gasCall('addLesson', data);
    },
    async updateLesson(id, data) {
        return await gasCall('updateLesson', id, data);
    },
    async deleteLesson(id) {
        return await gasCall('deleteLesson', id);
    },
    // Generating and saving are deliberately separate calls: an
    // auto-written record that lands in the knowledge base unreviewed is
    // how a knowledge base fills with noise.
    async generateProjectRetrospective(projectId) {
        return await gasCall('generateProjectRetrospective', projectId);
    },
    async saveProjectRetrospective(projectId, edits) {
        return await gasCall('saveProjectRetrospective', projectId, edits || {});
    },
    async getRetrospectiveCandidates() {
        return await gasCall('getRetrospectiveCandidates');
    },

    // ── v11 BATCH F2: QUOTATIONS ──
    // A quotation owns a Projects row with status 'Quotation', so the SOW
    // and Estimates tools price it directly and awarding copies nothing.
    async getQuotations() {
        return await gasCall('getQuotations');
    },
    async createQuotation(data) {
        return await gasCall('createQuotation', data);
    },
    async updateQuotation(id, data) {
        return await gasCall('updateQuotation', id, data);
    },
    async setQuotationStatus(id, status) {
        return await gasCall('setQuotationStatus', id, status);
    },
    async reviseQuotation(id, note) {
        return await gasCall('reviseQuotation', id, note || '');
    },
    async getQuotationRevisions(id) {
        return await gasCall('getQuotationRevisions', id);
    },
    async awardQuotation(id, data) {
        return await gasCall('awardQuotation', id, data || {});
    },
    async loseQuotation(id, data) {
        return await gasCall('loseQuotation', id, data || {});
    },
    async deleteQuotation(id) {
        return await gasCall('deleteQuotation', id);
    },

    // ── v11 BATCH G1: PROCUREMENT ──
    async getSuppliers() {
        return await gasCall('getSuppliers');
    },
    async addSupplier(data) {
        return await gasCall('addSupplier', data);
    },
    async updateSupplier(id, data) {
        return await gasCall('updateSupplier', id, data);
    },
    async deleteSupplier(id) {
        return await gasCall('deleteSupplier', id);
    },
    async getPurchaseRequests(projectId) {
        return await gasCall('getPurchaseRequests', projectId || '');
    },
    // The budget verdict is computed SERVER-SIDE so the warning shown to
    // the requester and the one the approvers see cannot disagree.
    async checkPrBudget(projectId, sowId, amount, excludePrId) {
        return await gasCall('checkPrBudget', projectId, sowId, amount, excludePrId || '');
    },
    async submitPurchaseRequest(data) {
        return await gasCall('submitPurchaseRequest', data);
    },
    async updatePurchaseRequest(id, data) {
        return await gasCall('updatePurchaseRequest', id, data);
    },
    async submitDraftPurchaseRequest(id) {
        return await gasCall('submitDraftPurchaseRequest', id);
    },
    async cancelPurchaseRequest(id, reason) {
        return await gasCall('cancelPurchaseRequest', id, reason || '');
    },
    async deletePurchaseRequest(id) {
        return await gasCall('deletePurchaseRequest', id);
    },

    // ── v11 BATCH G2: PO · RECEIVING · PAYABLES ──
    async getPurchaseOrders(projectId) {
        return await gasCall('getPurchaseOrders', projectId || '');
    },
    async createPurchaseOrder(data) {
        return await gasCall('createPurchaseOrder', data);
    },
    async approvePurchaseOrder(id) {
        return await gasCall('approvePurchaseOrder', id);
    },
    async cancelPurchaseOrder(id, reason) {
        return await gasCall('cancelPurchaseOrder', id, reason || '');
    },
    // Receiving is a COST event: it moves the SOW's actual cost, the
    // project's expenses and CPI, with no payment involved.
    async receiveGoods(data) {
        return await gasCall('receiveGoods', data);
    },
    async getReceipts(projectId) {
        return await gasCall('getReceipts', projectId || '');
    },
    async cancelReceipt(id, reason) {
        return await gasCall('cancelReceipt', id, reason || '');
    },
    async recordSupplierInvoice(data) {
        return await gasCall('recordSupplierInvoice', data);
    },
    // Paying is CASH OUT, not cost — the cost landed on receipt.
    async paySupplierInvoice(id, data) {
        return await gasCall('paySupplierInvoice', id, data || {});
    },
    async cancelSupplierInvoice(id, reason) {
        return await gasCall('cancelSupplierInvoice', id, reason || '');
    },
    async getPayables() {
        return await gasCall('getPayables');
    },

    // ── v14: DISCUSSION ──
    // The thread is fetched only when a record is opened; getUnread is
    // the only thing polled, and it returns a count — never the bodies.
    async getThread(recordType, recordId) {
        return await gasCall('getThread', recordType, recordId);
    },
    async postComment(data) {
        return await gasCall('postComment', data);
    },
    async editComment(id, body) {
        return await gasCall('editComment', id, body);
    },
    async deleteComment(id) {
        return await gasCall('deleteComment', id);
    },
    async markThreadRead(recordType, recordId) {
        return await gasCall('markThreadRead', recordType, recordId);
    },
    async getUnread() {
        return await gasCall('getUnread');
    },
    async markAllRead() {
        return await gasCall('markAllRead');
    },
    async getThreadCounts(refs) {
        return await gasCall('getThreadCounts', refs || []);
    },

    // ── v18: TASKS ──
    async getTasksForMonth(month) { return await gasCall('getTasksForMonth', month); },
    async getMyTaskSummary() { return await gasCall('getMyTaskSummary'); },
    async getAssignableUsers() { return await gasCall('getAssignableUsers'); },
    async createTask(data) { return await gasCall('createTask', data); },
    async completeTask(id, proof) { return await gasCall('completeTask', id, proof || {}); },
    async reopenTask(id, reason) { return await gasCall('reopenTask', id, reason || ''); },
    async cancelTask(id, reason) { return await gasCall('cancelTask', id, reason || ''); },
    async deleteTask(id) { return await gasCall('deleteTask', id); },

    // ── v15: BULK SOW ──
    // Preview is read-only and runs the SAME parser the write uses, so
    // what you are shown is exactly what would be created.
    async previewSowOutline(projectId, text) {
        return await gasCall('previewSowOutline', projectId, text);
    },
    async addSOWItemsBulk(projectId, text, opts) {
        return await gasCall('addSOWItemsBulk', projectId, text, opts || {});
    },
    async repairSowSchedules(projectId) {
        return await gasCall('repairSowSchedules', projectId);
    },

    // ── v16: PROJECT DELETE / ARCHIVE ──
    async previewProjectDelete(projectId) {
        return await gasCall('previewProjectDelete', projectId);
    },
    // confirmName must match the project name exactly — a yes/no dialog
    // gets dismissed by reflex, a name has to be read.
    async deleteProject(projectId, confirmName) {
        return await gasCall('deleteProject', projectId, confirmName);
    },
    async archiveProject(projectId, reason) {
        return await gasCall('archiveProject', projectId, reason || '');
    },
    async unarchiveProject(projectId) {
        return await gasCall('unarchiveProject', projectId);
    },

    // ── v12: DUPLICATION + LOGO ──
    async duplicatePreview(sourceId) {
        return await gasCall('duplicatePreview', sourceId);
    },
    async duplicateProject(sourceId, opts) {
        return await gasCall('duplicateProject', sourceId, opts || {});
    },
    async saveCompanyLogo(base64, filename, mimeType) {
        return await gasCall('saveCompanyLogo', base64, filename, mimeType);
    },

    // ── v11 BATCH H5: SOW TITLE MAINTENANCE ──
    // For SOW items created before titles could be declared. The audit
    // is read-only; the cleanup removes only EMPTY estimate groups.
    async setSowItemKind(projectId, sowId, isTitle) {
        return await gasCall('setSowItemKind', projectId, sowId, !!isTitle);
    },
    async auditSowTitles(projectId) {
        return await gasCall('auditSowTitles', projectId);
    },
    async cleanSowTitleEstimates(projectId) {
        return await gasCall('cleanSowTitleEstimates', projectId);
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