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
            roles.map(r => `<option value="${String(r.role).replace(/"/g, '&quot;')}" data-class="${r.classification || ''}" ${selected === r.role ? 'selected' : ''}>${esc(r.role)}${r.classification ? ' (' + r.classification + ')' : ''}</option>`).join('');
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
                <button class="${!isPersonnel ? 'active' : ''}" onclick="ManpowerPage.setMainTab('roles')">${Icon.wrench({size:13})} Roles / Trades (${this._all.filter(m => m.status === 'approved').length})</button>
                <button class="${isPersonnel ? 'active' : ''}" onclick="ManpowerPage.setMainTab('personnel')">${Icon.safety({size:13})} Personnel — Actual Names (${this._personnel.filter(p => p.status === 'active').length})</button>
            </div>
            <div class="data-source-note" style="margin-bottom:12px;">
                <b>Roles</b> is the catalog of trades and positions. <b>Estimates</b> and the Daily Report role dropdown draw from approved roles only.
                <b>Personnel</b> holds the actual names of workers for <b>site execution</b>; each person's position is chosen from the approved roles.
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
                            <!-- v11 BATCH H3: a personnel record without a face is of
                                 limited use on site, where the point is recognising who
                                 is being referred to. -->
                            <!-- v13: the signature. Uploaded as a photo of a
                                 signature on paper, then stripped of its white
                                 background in the browser so it can sit ON a
                                 signature line instead of covering it. -->
                            <div class="field full"><label>Signature</label>
                                <div class="file-drop"><input type="file" accept="image/*" id="prs-sig"
                                    onchange="ManpowerPage.previewSignature(event)" /></div>
                                <p style="font-size:11px;color:var(--ink-soft);margin-top:4px;">
                                    Sign on plain white paper and photograph it in even light. The white is
                                    removed automatically. Leave blank when editing to keep the existing one.</p>
                                <div class="sig-preview" id="prsSigPreview" style="display:none;">
                                    <img id="prsSigPreviewImg" src="#" alt="Signature preview" />
                                    <div class="sig-tune">
                                        <label>Keep more / less of the strokes</label>
                                        <input type="range" id="prs-sig-threshold" min="120" max="245" value="200"
                                               oninput="ManpowerPage.retuneSignature()" />
                                        <span id="prsSigNote"></span>
                                    </div>
                                </div>
                            </div>
                            <div class="field full"><label>Photo</label>
                                <div class="file-drop"><input type="file" accept="image/*" id="prs-image"
                                    onchange="ManpowerPage.previewPersonImage(event)" /></div>
                                <p style="font-size:11px;color:var(--ink-soft);margin-top:4px;">
                                    A head-and-shoulders shot prints best. Leave blank when editing to keep the existing photo.</p>
                                <div class="image-preview" id="prsImagePreview"><img id="prsImagePreviewImg" src="#" alt="Preview" /></div>
                            </div>
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
                <button class="${!q && this._pFilter === 'inactive' ? 'active' : ''}" onclick="ManpowerPage.setPFilter('inactive')">${Icon.moon({size:12})} Inactive (${inact})</button>
                ${q ? `<button class="active" onclick="ManpowerPage.clearSearch()">${Icon.search({size:13})} Search Results ${Icon.close({size:11})}</button>` : ''}`;
        } else {
            const approved = this._all.filter(m => m.status === 'approved').length;
            const pending = this._all.filter(m => m.status === 'pending').length;
            el.innerHTML = `
                <button class="${!q && this._currentFilter === 'approved' ? 'active' : ''}" onclick="ManpowerPage.setFilter('approved')">${Icon.checkCircle({size:13})} Approved (${approved})</button>
                <button class="${!q && this._currentFilter === 'pending' ? 'active' : ''}" onclick="ManpowerPage.setFilter('pending')">${Icon.hourglass({size:13})} Pending (${pending})</button>
                ${q ? `<button class="active" onclick="ManpowerPage.clearSearch()">${Icon.search({size:13})} Search Results ${Icon.close({size:11})}</button>` : ''}`;
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
                        ${m.notes ? `<span>${esc(m.notes)}</span>` : ''}
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
            el.innerHTML = `<div class="empty"><p>No personnel found. Use "Add person" to record the actual names of workers.</p></div>`;
            return;
        }
        let html = `<div class="panel"><table><thead><tr>
            <th>ID</th><th>Name</th><th>Position / Role</th><th>Classification</th><th>Contact</th>
            <th style="text-align:right">Daily Rate</th><th>Status</th><th></th>${isAdmin ? '<th></th>' : ''}
        </tr></thead><tbody>`;
        list.forEach(p => {
            const stampCls = p.status === 'active' ? 'approved' : 'rejected';
            html += `<tr>
                <td><span class="req-id">${p.id}</span></td>
                <td class="prs-name-cell">
                    ${p.image ? `<img class="prs-thumb" src="${driveImgSrc(p.image)}" alt="" onerror="this.style.display='none'" />` : ''}
                    <span><b>${esc(p.name)}</b>${p.notes ? `<div style="font-size:10.5px;color:var(--ink-soft)">${esc(p.notes)}</div>` : ''}</span>
                </td>
                <td>${p.role || '—'}</td>
                <td>${p.classification || '—'}</td>
                <td class="mono" style="font-size:11px">${p.contactNumber || '—'}</td>
                <td class="amt">${p.dailyRate ? '₱' + fmtMoney(p.dailyRate) : '—'}</td>
                <td><span class="stamp ${stampCls}">${p.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                <td style="white-space:nowrap">
                    <button class="btn-sm" title="Open record" onclick="ManpowerPage.viewPerson('${p.id}')">${Icon.search({size:12})}</button>
                </td>
                ${isAdmin ? `<td style="white-space:nowrap">
                    <button class="btn-sm" onclick="ManpowerPage.editPerson('${p.id}')">${Icon.pencil({size:12})}</button>
                    ${p.status === 'active'
                        ? `<button class="btn-sm danger" title="Deactivate" onclick="ManpowerPage.setPersonStatus('${p.id}','inactive')">${Icon.moon({size:12})}</button>`
                        : `<button class="btn-sm success" title="Re-activate" onclick="ManpowerPage.setPersonStatus('${p.id}','active')">${Icon.restore({size:12})}</button>`}
                </td>` : ''}
            </tr>`;
        });
        html += `</tbody></table></div>
            <div class="data-source-note">The Personnel list is for actual site execution. Estimates do not use it; they draw on roles only. Deactivated personnel are kept for history.</div>`;
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
        const btn = Busy.pressed();
        const confirmed = await Confirm.open('Approve Role?', 'Approve this manpower role for use in daily reports and estimates?');
        if (!confirmed) return;
        await Busy.run(btn, 'Approving', async () => {
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
        });
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
        const pv = document.getElementById('prsImagePreview');
        const pvImg = document.getElementById('prsImagePreviewImg');
        const fileEl = document.getElementById('prs-image');
        if (fileEl) fileEl.value = '';
        // v13: drop any signature staged for a different person.
        this._sigFile = null;
        this._sigDataUrl = '';
        const sigEl = document.getElementById('prs-sig');
        if (sigEl) sigEl.value = '';
        const sigBox = document.getElementById('prsSigPreview');
        const sigImg = document.getElementById('prsSigPreviewImg');
        if (sigBox && sigImg) {
            if (p.signature) { sigImg.src = driveImgSrc(p.signature); sigBox.style.display = 'block'; }
            else { sigBox.style.display = 'none'; }
        }
        if (pv && pvImg) {
            if (p.image) { pvImg.src = driveImgSrc(p.image); pv.style.display = 'block'; }
            else { pv.style.display = 'none'; }
        }
        document.getElementById('mpPersonFormTitle').textContent = `Edit ${esc(p.name)}`;
        document.getElementById('prsSubmitBtn').textContent = 'Save Changes';
        el.style.display = 'block';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    /**
     * previewSignature (v13) - Processes the photo and shows the result
     * BEFORE anything is uploaded.
     *
     * The preview sits on a chequered background precisely so the
     * transparency is visible: on white it would look identical whether
     * the background had been removed or not, which is the one thing
     * this needs to show.
     */
    async previewSignature(ev) {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        this._sigFile = f;
        await this._runSignature();
    },

    /** retuneSignature - re-runs at a new threshold, same file. */
    async retuneSignature() {
        if (this._sigFile) await this._runSignature();
    },

    async _runSignature() {
        const box = document.getElementById('prsSigPreview');
        const img = document.getElementById('prsSigPreviewImg');
        const note = document.getElementById('prsSigNote');
        const th = parseInt(document.getElementById('prs-sig-threshold')?.value, 10) || undefined;
        if (!box || !img) return;
        try {
            const res = await Signature.process(this._sigFile, th);
            this._sigDataUrl = res.dataUrl;
            img.src = res.dataUrl;
            box.style.display = 'block';
            if (note) note.textContent = `${res.width} × ${res.height}`;
        } catch (err) {
            this._sigDataUrl = '';
            box.style.display = 'none';
            UI.toast('' + err.message, 'error');
        }
    },

    /** previewPersonImage (v11 BATCH H3) - local preview before upload. */
    previewPersonImage(ev) {
        const f = ev.target.files && ev.target.files[0];
        const box = document.getElementById('prsImagePreview');
        const img = document.getElementById('prsImagePreviewImg');
        if (!f || !box || !img) return;
        const r = new FileReader();
        r.onload = e2 => { img.src = e2.target.result; box.style.display = 'block'; };
        r.readAsDataURL(f);
    },

    /**
     * viewPerson (v11 BATCH H3) - The personnel record as a document.
     *
     * Uses the same modal shell every other datasheet uses, so it
     * carries the company letterhead on print and looks like the rest
     * of the system. The photo sits on the right with the details on
     * the left — the layout a printed personnel record has always had,
     * and the reason the photo was worth adding in the first place.
     */
    viewPerson(id) {
        const p = (this._personnel || []).find(x => x.id === id);
        if (!p) { UI.toast('Not found.', 'error'); return; }
        const e = v => String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const V = (label, val, full) =>
            `<div class="dg-item${full ? ' full' : ''}"><span class="dg-label">${label}</span><span class="dg-value">${e(val) || '—'}</span></div>`;

        document.getElementById('prsViewModal')?.remove();
        const m = document.createElement('div');
        m.className = 'print-modal-overlay open';
        m.id = 'prsViewModal';
        m.innerHTML = `
            <div class="print-modal-content" style="max-width:640px;">
                <button class="close-modal pd-noprint" onclick="document.getElementById('prsViewModal').remove()">${Icon.close({size:18})}</button>
                <div class="detail-print-header">
                    <div class="dph-left">
                        <h2>${e(p.id)} — ${e(p.name)}</h2>
                        <div class="dph-id">${e(p.role) || ''}${p.classification ? ' · ' + e(p.classification) : ''}</div>
                    </div>
                    <div class="dph-right">${p.image
                        ? `<img src="${driveImgSrc(p.image)}" alt="${e(p.name)}" onerror="this.style.display='none'" />`
                        : `<div class="no-img-placeholder">${Icon.users({size:28})}<br>No Photo</div>`}</div>
                </div>
                <div class="print-section"><div class="ps-title">Personnel Details</div>
                    <div class="detail-grid">
                        ${V('Personnel ID', p.id)}
                        ${V('Name', p.name)}
                        ${V('Position / Role', p.role)}
                        ${V('Classification', p.classification)}
                        ${V('Contact Number', p.contactNumber)}
                        ${V('Daily Rate', p.dailyRate ? '₱' + fmtMoney(p.dailyRate) : '')}
                        ${V('Status', p.status === 'active' ? 'Active' : 'Inactive')}
                        ${V('Notes', p.notes, true)}
                    </div>
                </div>
                <!-- v13.1: the specimen is its own section rather than a
                     column beside the details. A signature squeezed into
                     a 190px sidebar prints too small to compare against
                     anything, which is the only reason to hold a specimen
                     on file. -->
                ${p.signature ? `<div class="print-section"><div class="ps-title">Specimen Signature</div>
                    <div class="sig-specimen">
                        <img src="${driveImgSrc(p.signature)}" alt="Specimen signature"
                             onerror="this.parentNode.style.display='none'" />
                        <div class="ln"></div>
                        <div class="lb">${e(p.name)}${p.role ? ' · ' + e(p.role) : ''}</div>
                    </div>
                </div>` : `<div class="print-section pd-noprint">
                    <p style="font-size:12px;color:var(--ink-soft);margin:0;">
                        No specimen signature on file. Add one by editing this person.</p>
                </div>`}
                <div class="print-actions pd-noprint">
                    <button class="btn-primary" onclick="PrintDoc.print({title:'Personnel Record — ${e(p.name)}'})">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="document.getElementById('prsViewModal').remove()">Close</button>
                </div>
            </div>`;
        document.body.appendChild(m);
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
            // Uploaded before the record is written, so a failed upload
            // does not leave a saved person with a half-attached photo.
            const file = document.getElementById('prs-image')?.files?.[0];
            if (file) {
                UI.toast('Uploading photo...', 'success');
                const b64 = await fileToBase64_(file);
                const up = await DataService.uploadImage(b64, file.name, file.type);
                if (up && up.url) data.image = up.url;
            }
            // v13: the PROCESSED signature is uploaded, not the original
            // photo — the whole point is that the paper is already gone.
            if (this._sigDataUrl) {
                UI.toast('Uploading signature...', 'success');
                const sb64 = Signature.dataUrlToBase64(this._sigDataUrl);
                const sup = await DataService.uploadImage(sb64,
                    'signature-' + (data.name || 'personnel').replace(/[^\w]+/g, '-') + '.png', 'image/png');
                if (sup && sup.url) data.signature = sup.url;
            }
            if (id) {
                await DataService.updatePersonnel(id, data);
                UI.toast(`${esc(data.name)} updated.`, 'success');
            } else {
                const res = await DataService.addPersonnel(data);
                UI.toast(`${esc(data.name)} added to Personnel (${res.id}).`, 'success');
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
