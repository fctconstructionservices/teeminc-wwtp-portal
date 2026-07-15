// ================================================================
//  pages/manpower.js — Manpower role catalog page (v3)
//
//  PURPOSE: The manpower database (roles/trades, not individuals).
//  Mirrors the Materials/Equipment pages: Approved/Pending views
//  with search, an inline request form, and a role-gated Approve
//  action routed through the central approval engine.
//
//  CONSUMED BY: Daily Site Report role dropdown, Estimates labor
//  dropdown, and Gantt resource assignment.
// ================================================================

const ManpowerPage = {
    _all: [],
    _currentFilter: 'approved',
    _searchResults: null,

    async load() {
        this._searchResults = null;
        const container = document.getElementById('manpowerContent');
        UI.showLoading(container);
        try {
            this._all = await DataService.getAllManpower();
            this.render(container);
        } catch (err) {
            console.error('Manpower error:', err);
            UI.toast('Error loading manpower database.', 'error');
        }
    },

    render(container, items = null) {
        // Status values are compared case-insensitively because requests
        // are stored as 'Pending' and approvals write 'approved'.
        const st = m => String(m.status || '').toLowerCase();
        const approved = this._all.filter(m => st(m) === 'approved');
        const pending = this._all.filter(m => st(m) === 'pending');

        let list = items;
        if (!list) list = this._currentFilter === 'approved' ? approved : pending;
        if (this._searchResults !== null) list = this._searchResults;

        let html = `
                <div class="section-head"><h2>Manpower Database</h2><div class="rule"></div>
                    <button class="btn-primary" onclick="ManpowerPage.showAddForm()" style="padding:6px 14px;font-size:11px;">+ Add New Role</button>
                </div>
                <div id="mpAddForm" style="display:none;margin-bottom:20px;">
                    <div class="panel"><div class="panel-head"><h3>Add New Manpower Role</h3><button class="btn-ghost" onclick="ManpowerPage.hideAddForm()" style="padding:4px 12px;font-size:11px;">Cancel</button></div>
                    <div style="padding:16px;">
                        <form id="mpForm" onsubmit="return ManpowerPage.submitRole(event)">
                            <div class="db-form-grid">
                                <div class="field"><label>Role / Trade *</label><input type="text" id="mp-role-name" placeholder="e.g. Mason, Electrician, Foreman" required /></div>
                                <div class="field"><label>Classification *</label>
                                    <select id="mp-classification" required>
                                        <option value="">Select...</option>
                                        <option>Skilled</option>
                                        <option>Semi-Skilled</option>
                                        <option>Laborer</option>
                                        <option>Supervision</option>
                                    </select>
                                </div>
                                <div class="field"><label>Code</label><input type="text" id="mp-code" placeholder="Optional — auto if blank" /></div>
                                <div class="field full"><label>Notes</label><input type="text" id="mp-notes" placeholder="Certifications, scope, remarks..." /></div>
                            </div>
                            <div class="submit-row"><button type="submit" class="btn-primary">Submit for Approval</button><button type="button" class="btn-ghost" onclick="ManpowerPage.hideAddForm()">Cancel</button></div>
                        </form>
                    </div></div>
                </div>
                <div class="searchbar"><span class="search-icon">${Icon.search({size:15})}</span><input type="text" id="mpSearch" placeholder="Search by role, code, classification..." oninput="ManpowerPage.search()" /></div>
                <div class="status-tabs">
                    <button class="${this._currentFilter === 'approved' && this._searchResults === null ? 'active' : ''}" onclick="ManpowerPage.setFilter('approved')">${Icon.checkCircle({size:13})} Approved (${approved.length})</button>
                    <button class="${this._currentFilter === 'pending' && this._searchResults === null ? 'active' : ''}" onclick="ManpowerPage.setFilter('pending')">⏳ Pending (${pending.length})</button>
                    ${this._searchResults !== null ? `<button class="active" onclick="ManpowerPage.clearSearch()">${Icon.search({size:13})} Search Results (${list.length})</button>` : ''}
                </div>
                <div class="list-container">`;

        if (list.length === 0) {
            html += `<div class="empty"><p>No manpower roles found.</p></div>`;
        } else {
            list.forEach(m => {
                const isPending = String(m.status || '').toLowerCase() === 'pending';
                html += `
                <div class="mat-card">
                    <div class="mc-thumb"><span>${Icon.users({size:24})}</span></div>
                    <div class="mc-body">
                        <div class="mc-title">${m.role || 'Unnamed role'}</div>
                        <div class="mc-meta">
                            <span class="req-id">${m.id}</span>
                            <span>${m.classification || '—'}</span>
                            ${m.notes ? `<span>${m.notes}</span>` : ''}
                            ${isPending ? '<span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">Pending</span>' : ''}
                            ${!isPending ? '<span class="stamp approved" style="transform:none;padding:1px 8px;font-size:9px;">Approved</span>' : ''}
                            ${isPending && App.isApprover() ? `<button class="btn-sm success" onclick="event.stopPropagation();ManpowerPage.approveRole('${m.id}')" style="margin-left:8px;">Approve</button>` : ''}
                        </div>
                    </div>
                </div>`;
            });
        }
        html += `</div>`;
        UI.setContent(container, html);
    },

    setFilter(filter) {
        this._currentFilter = filter;
        this._searchResults = null;
        this.load();
    },

    clearSearch() {
        this._searchResults = null;
        this.load();
    },

    showAddForm() {
        const el = document.getElementById('mpAddForm');
        if (el) { el.style.display = 'block'; document.getElementById('mp-role-name').focus(); }
    },

    hideAddForm() {
        const el = document.getElementById('mpAddForm');
        if (el) el.style.display = 'none';
    },

    search() {
        const q = (document.getElementById('mpSearch').value || '').trim().toLowerCase();
        if (!q) { this._searchResults = null; this.render(document.getElementById('manpowerContent')); return; }
        this._searchResults = this._all.filter(m =>
            (m.role && m.role.toLowerCase().includes(q)) ||
            (m.code && String(m.code).toLowerCase().includes(q)) ||
            (m.classification && String(m.classification).toLowerCase().includes(q))
        );
        this.render(document.getElementById('manpowerContent'));
    },

    async submitRole(e) {
        e.preventDefault();
        const role = document.getElementById('mp-role-name').value.trim();
        const classification = document.getElementById('mp-classification').value;
        if (!role || !classification) {
            UI.toast('Role and Classification are required.', 'error');
            return false;
        }
        const confirmed = await Confirm.open('Submit Role?', `Submit "${role}" (${classification}) for approval?`);
        if (!confirmed) return false;
        try {
            await DataService.requestManpower({
                role: role,
                classification: classification,
                code: document.getElementById('mp-code').value.trim(),
                notes: document.getElementById('mp-notes').value.trim()
            });
            UI.toast(`Role "${role}" submitted for approval.`, 'success');
            this.hideAddForm();
            this._currentFilter = 'pending';   // show the new entry immediately
            this.load();
            App.updateApprovalBadge();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
        return false;
    },

    async approveRole(id) {
        const confirmed = await Confirm.open('Approve Role?', 'Approve this manpower role for use in daily reports and estimates?');
        if (!confirmed) return;
        try {
            await DataService.approveManpower(id);
            UI.toast('Manpower role approved.', 'success');
            this.load();
            App.updateApprovalBadge();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    }
};
