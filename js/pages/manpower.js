// ================================================================
//  pages/manpower.js — Manpower database page (v8)
//
//  PURPOSE: TWO sub-databases under one page:
//
//    ROLES (catalog)   — trades/positions (Mason, Foreman...) with the
//                        request → pending → approved flow. APPROVED
//                        roles are what the Estimates labor dropdown
//                        and the Daily Report role dropdown consume —
//                        i.e., the PLANNING side.
//
//    PERSONNEL (people) — the ACTUAL NAMES of workers with their
//                        position, for actual site execution. Direct
//                        entry (operational data, no multi-sig);
//                        admins can edit/deactivate. Positions are
//                        picked from the APPROVED roles.
// ================================================================

const ManpowerPage = {
    _all: [],
    _personnel: [],
    _mainTab: 'roles',        // 'roles' | 'personnel'
    _currentFilter: 'approved',
    _pFilter: 'active',       // personnel: 'active' | 'inactive'
    _query: '',
    _loaded: false,

    async load(force) {
        const container = document.getElementById('manpowerContent');
        if (!this._loaded || force) {
            UI.showLoading(container);
            try {
                const [roles, people] = await Promise.all([
                    DataService.getAllManpower(),
                    DataService.getAllPersonnel().catch(() => [])
                ]);
                this._all = (roles || []).map(x => ({ ...x, status: String(x.status || '').toLowerCase() }));
                this._personnel = people || [];
                this._loaded = true;
            } catch (err) {
                console.error('Manpower error:', err);
                UI.toast('Error loading manpower database.', 'error');
                return;
            }
        }
        this._query = '';
        this.renderShell(container);
    },

    async _refreshCache() {
        try {
            const [roles, people] = await Promise.all([
                DataService.getAllManpower(),
                DataService.getAllPersonnel().catch(() => [])
            ]);
            this._all = (roles || []).map(x => ({ ...x, status: String(x.status || '').toLowerCase() }));
            this._personnel = people || [];
        } catch (e) {}
    },

    _approvedRoleOptions(selected) {
        const roles = this._all.filter(m => m.status === 'approved');
        return '<option value="">Select position...</option>' +
            roles.map(r => `<option value="${String(r.role).replace(/"/g, '&quot;')}" data-class="${r.classification || ''}" ${selected === r.role ? 'selected' : ''}>${r.role}${r.classification ? ' (' + r.classification + ')' : ''}</option>`).join('');
    },

    renderShell(container) {
        const isPersonnel = this._mainTab === 'personnel';
        let html = `
            <div class="section-head"><h2>Manpower Database</h2><div class="rule"></div>
                ${isPersonnel
                    ? `<button class="btn-primary" onclick="ManpowerPage.showPersonForm()" style="padding:6px 14px;font-size:11px;">+ Add Person</button>`
                    : `<button class="btn-primary" onclick="ManpowerPage.showAddForm()" style="padding:6px 14px;font-size:11px;">+ Add New Role</button>`}
            </div>

            <div class="status-tabs" style="margin-bottom:4px;">
                <button class="${!isPersonnel ? 'active' : ''}" onclick="ManpowerPage.setMainTab('roles')">🛠 Roles / Trades (${this._all.filter(m => m.status === 'approved').length})</button>
                <button class="${isPersonnel ? 'active' : ''}" onclick="ManpowerPage.setMainTab('personnel')">👷 Personnel — Actual Names (${this._personnel.filter(p => p.status === 'active').length})</button>
            </div>
            <div class="data-source-note" style="margin-bottom:12px;">
                <b>Roles</b> = catalog ng trades/positions — ito ang ginagamit ng <b>Estimates</b> (approved roles only) at ng Daily Report role dropdown.
                <b>Personnel</b> = actual na pangalan ng mga tao para sa <b>site execution</b>; ang position nila ay pinipili mula sa approved roles.
            </div>

            <div id="mpRoleForm" style="display:none;margin-bottom:20px;">
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

            <div id="mpPersonForm" style="display:none;margin-bottom:20px;">
                <div class="panel"><div class="panel-head"><h3 id="mpPersonFormTitle">Add Person</h3><button class="btn-ghost" onclick="ManpowerPage.hidePersonForm()" style="padding:4px 12px;font-size:11px;">Cancel</button></div>
                <div style="padding:16px;">
                    <form id="prsForm" onsubmit="return ManpowerPage.submitPerson(event)">
                        <input type="hidden" id="prs-id" value="" />
                        <div class="db-form-grid">
                            <div class="field"><label>Full Name *</label><input type="text" id="prs-name" placeholder="e.g. Juan Dela Cruz" required /></div>
                            <div class="field"><label>Position / Role *</label><select id="prs-role" required onchange="ManpowerPage.syncPersonClass(this)">${this._approvedRoleOptions()}</select></div>
                            <div class="field"><label>Classification</label><input type="text" id="prs-class" readonly placeholder="auto from role" /></div>
                            <div class="field"><label>Contact Number</label><input type="text" id="prs-contact" placeholder="e.g. 09xx xxx xxxx" /></div>
                            <div class="field"><label>Daily Rate (₱)</label><input type="number" id="prs-rate" min="0" step="0.01" placeholder="optional" /></div>
                            <div class="field full"><label>Notes</label><input type="text" id="prs-notes" placeholder="Certifications, assigned site, remarks..." /></div>
                        </div>
                        <div class="submit-row"><button type="submit" class="btn-primary" id="prsSubmitBtn">Save Person</button><button type="button" class="btn-ghost" onclick="ManpowerPage.hidePersonForm()">Cancel</button></div>
                    </form>
                </div></div>
            </div>

            <div class="searchbar"><span class="search-icon">${Icon.search({size:15})}</span><input type="text" id="mpSearch" placeholder="${isPersonnel ? 'Search by name, position...' : 'Search by role, code, classification...'}" oninput="ManpowerPage.onSearchInput(this.value)" /></div>
            <div class="status-tabs" id="mpSubTabs"></div>
            <div class="list-container" id="mpListContainer"></div>`;
        UI.setContent(container, html);
        this.renderSubTabs();
        this.renderList();
    },

    setMainTab(tab) {
        this._mainTab = tab;
        this._query = '';
        this.renderShell(document.getElementById('manpowerContent'));
    },

    renderSubTabs() {
        const el = document.getElementById('mpSubTabs');
        if (!el) return;
        const q = this._query.trim();
        if (this._mainTab === 'personnel') {
            const act = this._personnel.filter(p => p.status === 'active').length;
            const inact = this._personnel.filter(p => p.status !== 'active').length;
            el.innerHTML = `
                <button class="${!q && this._pFilter === 'active' ? 'active' : ''}" onclick="ManpowerPage.setPFilter('active')">${Icon.checkCircle({size:13})} Active (${act})</button>
                <button class="${!q && this._pFilter === 'inactive' ? 'active' : ''}" onclick="ManpowerPage.setPFilter('inactive')">💤 Inactive (${inact})</button>
                ${q ? `<button class="active" onclick="ManpowerPage.clearSearch()">${Icon.search({size:13})} Search Results ✕</button>` : ''}`;
        } else {
            const approved = this._all.filter(m => m.status === 'approved').length;
            const pending = this._all.filter(m => m.status === 'pending').length;
            el.innerHTML = `
                <button class="${!q && this._currentFilter === 'approved' ? 'active' : ''}" onclick="ManpowerPage.setFilter('approved')">${Icon.checkCircle({size:13})} Approved (${approved})</button>
                <button class="${!q && this._currentFilter === 'pending' ? 'active' : ''}" onclick="ManpowerPage.setFilter('pending')">⏳ Pending (${pending})</button>
                ${q ? `<button class="active" onclick="ManpowerPage.clearSearch()">${Icon.search({size:13})} Search Results ✕</button>` : ''}`;
        }
    },

    renderList() {
        const el = document.getElementById('mpListContainer');
        if (!el) return;
        if (this._mainTab === 'personnel') this._renderPersonnelList(el);
        else this._renderRolesList(el);
    },

    // ─── ROLES ────────────────────────────────────────────────

    _renderRolesList(el) {
        const q = this._query.trim().toLowerCase();
        let list;
        if (q) {
            list = this._all.filter(m =>
                (m.role && m.role.toLowerCase().includes(q)) ||
                (m.code && String(m.code).toLowerCase().includes(q)) ||
                (m.classification && String(m.classification).toLowerCase().includes(q)));
        } else {
            list = this._all.filter(m => m.status === this._currentFilter);
        }
        if (!list.length) { el.innerHTML = `<div class="empty"><p>No manpower roles found.</p></div>`; return; }
        let html = '';
        list.forEach(m => {
            const isPending = m.status === 'pending';
            html += `
            <div class="mat-card">
                <div class="mc-thumb"><span>${Icon.users({size:24})}</span></div>
                <div class="mc-body">
                    <div class="mc-title">${m.role || 'Unnamed role'}</div>
                    <div class="mc-meta">
                        <span class="req-id">${m.id}</span>
                        <span>${m.classification || '—'}</span>
                        ${m.notes ? `<span>${m.notes}</span>` : ''}
                        ${isPending ? '<span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">Pending</span>' : '<span class="stamp approved" style="transform:none;padding:1px 8px;font-size:9px;">Approved</span>'}
                        ${isPending && App.isApprover() ? `<button class="btn-sm success" onclick="event.stopPropagation();ManpowerPage.approveRole('${m.id}')" style="margin-left:8px;">Approve</button>` : ''}
                    </div>
                </div>
            </div>`;
        });
        el.innerHTML = html;
    },

    // ─── PERSONNEL ────────────────────────────────────────────

    _renderPersonnelList(el) {
        const q = this._query.trim().toLowerCase();
        const user = App.getUser();
        const isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');
        let list;
        if (q) {
            list = this._personnel.filter(p =>
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.role && p.role.toLowerCase().includes(q)) ||
                (p.classification && p.classification.toLowerCase().includes(q)) ||
                (p.id && p.id.toLowerCase().includes(q)));
        } else {
            list = this._personnel.filter(p => (this._pFilter === 'active') === (p.status === 'active'));
        }
        if (!list.length) {
            el.innerHTML = `<div class="empty"><p>No personnel found. Idagdag ang mga actual na pangalan ng tao gamit ang "+ Add Person".</p></div>`;
            return;
        }
        let html = `<div class="panel"><table><thead><tr>
            <th>ID</th><th>Name</th><th>Position / Role</th><th>Classification</th><th>Contact</th>
            <th style="text-align:right">Daily Rate</th><th>Status</th>${isAdmin ? '<th></th>' : ''}
        </tr></thead><tbody>`;
        list.forEach(p => {
            const stampCls = p.status === 'active' ? 'approved' : 'rejected';
            html += `<tr>
                <td><span class="req-id">${p.id}</span></td>
                <td><b>${p.name}</b>${p.notes ? `<div style="font-size:10.5px;color:var(--ink-soft)">${p.notes}</div>` : ''}</td>
                <td>${p.role || '—'}</td>
                <td>${p.classification || '—'}</td>
                <td class="mono" style="font-size:11px">${p.contactNumber || '—'}</td>
                <td class="amt">${p.dailyRate ? '₱' + fmtMoney(p.dailyRate) : '—'}</td>
                <td><span class="stamp ${stampCls}">${p.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                ${isAdmin ? `<td style="white-space:nowrap">
                    <button class="btn-sm" onclick="ManpowerPage.editPerson('${p.id}')">✎</button>
                    ${p.status === 'active'
                        ? `<button class="btn-sm danger" title="Deactivate" onclick="ManpowerPage.setPersonStatus('${p.id}','inactive')">💤</button>`
                        : `<button class="btn-sm success" title="Re-activate" onclick="ManpowerPage.setPersonStatus('${p.id}','active')">↩</button>`}
                </td>` : ''}
            </tr>`;
        });
        html += `</tbody></table></div>
            <div class="data-source-note">Ang Personnel list ay para sa actual site execution — hindi ito ginagamit ng Estimates (roles lang ang basehan doon). Deactivated personnel are kept for history.</div>`;
        el.innerHTML = html;
    },

    // ─── SHARED UI ────────────────────────────────────────────

    onSearchInput(value) {
        this._query = value || '';
        this.renderSubTabs();
        this.renderList();
    },

    clearSearch() {
        this._query = '';
        const inp = document.getElementById('mpSearch');
        if (inp) inp.value = '';
        this.renderSubTabs();
        this.renderList();
    },

    setFilter(filter) {
        this._currentFilter = filter;
        this._query = '';
        const inp = document.getElementById('mpSearch');
        if (inp) inp.value = '';
        this.renderSubTabs();
        this.renderList();
    },

    setPFilter(filter) {
        this._pFilter = filter;
        this._query = '';
        const inp = document.getElementById('mpSearch');
        if (inp) inp.value = '';
        this.renderSubTabs();
        this.renderList();
    },

    // ─── ROLE ACTIONS ─────────────────────────────────────────

    showAddForm() {
        const el = document.getElementById('mpRoleForm');
        if (el) { el.style.display = 'block'; document.getElementById('mp-role-name').focus(); }
    },
    hideAddForm() {
        const el = document.getElementById('mpRoleForm');
        if (el) el.style.display = 'none';
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
            await this._refreshCache();
            this._currentFilter = 'pending';
            this.renderSubTabs();
            this.renderList();
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
            await this._refreshCache();
            this.renderSubTabs();
            this.renderList();
            App.updateApprovalBadge();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    // ─── PERSONNEL ACTIONS ────────────────────────────────────

    syncPersonClass(sel) {
        const opt = sel.selectedOptions[0];
        const cls = document.getElementById('prs-class');
        if (cls) cls.value = opt ? (opt.dataset.class || '') : '';
    },

    showPersonForm() {
        const el = document.getElementById('mpPersonForm');
        if (!el) return;
        document.getElementById('prs-id').value = '';
        document.getElementById('prsForm').reset();
        document.getElementById('mpPersonFormTitle').textContent = 'Add Person';
        document.getElementById('prsSubmitBtn').textContent = 'Save Person';
        el.style.display = 'block';
        document.getElementById('prs-name').focus();
    },
    hidePersonForm() {
        const el = document.getElementById('mpPersonForm');
        if (el) el.style.display = 'none';
    },

    editPerson(id) {
        const p = this._personnel.find(x => x.id === id);
        if (!p) return;
        const el = document.getElementById('mpPersonForm');
        if (!el) return;
        document.getElementById('prs-id').value = p.id;
        document.getElementById('prs-name').value = p.name || '';
        document.getElementById('prs-role').innerHTML = this._approvedRoleOptions(p.role);
        // legacy/unlisted position still shows
        if (p.role && ![...document.getElementById('prs-role').options].some(o => o.value === p.role)) {
            const o = document.createElement('option');
            o.value = p.role; o.textContent = p.role + ' (legacy)'; o.selected = true;
            document.getElementById('prs-role').appendChild(o);
        }
        document.getElementById('prs-class').value = p.classification || '';
        document.getElementById('prs-contact').value = p.contactNumber || '';
        document.getElementById('prs-rate').value = p.dailyRate || '';
        document.getElementById('prs-notes').value = p.notes || '';
        document.getElementById('mpPersonFormTitle').textContent = `Edit ${p.name}`;
        document.getElementById('prsSubmitBtn').textContent = 'Save Changes';
        el.style.display = 'block';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    async submitPerson(e) {
        e.preventDefault();
        const id = document.getElementById('prs-id').value;
        const data = {
            name: document.getElementById('prs-name').value.trim(),
            role: document.getElementById('prs-role').value,
            classification: document.getElementById('prs-class').value.trim(),
            contactNumber: document.getElementById('prs-contact').value.trim(),
            dailyRate: parseFloat(document.getElementById('prs-rate').value) || 0,
            notes: document.getElementById('prs-notes').value.trim()
        };
        if (!data.name || !data.role) { UI.toast('Name and Position are required.', 'error'); return false; }
        try {
            if (id) {
                await DataService.updatePersonnel(id, data);
                UI.toast(`${data.name} updated.`, 'success');
            } else {
                const res = await DataService.addPersonnel(data);
                UI.toast(`${data.name} added to Personnel (${res.id}).`, 'success');
            }
            this.hidePersonForm();
            await this._refreshCache();
            this.renderSubTabs();
            this.renderList();
        } catch (err) { UI.toast('' + err.message, 'error'); }
        return false;
    },

    async setPersonStatus(id, status) {
        const p = this._personnel.find(x => x.id === id);
        const verb = status === 'inactive' ? 'Deactivate' : 'Re-activate';
        const ok = await Confirm.open(`${verb} ${p ? p.name : id}?`,
            status === 'inactive' ? 'Inactive personnel are hidden from the Active list but kept for history.' : '');
        if (!ok) return;
        try {
            await DataService.updatePersonnel(id, { status });
            UI.toast(`${p ? p.name : id} is now ${status}.`, 'success');
            await this._refreshCache();
            this.renderSubTabs();
            this.renderList();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
};
