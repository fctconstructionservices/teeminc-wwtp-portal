// ================================================================
//  pages/project/project-core.js — ProjectPage: state, load, tabs, overview
//
//  PURPOSE: Declares the ProjectPage singleton and its shared state,
//  loads a project (single getProjectData round-trip), renders the
//  snapshot KPIs + tab bar, and owns the Overview tab.
//
//  MODULE PATTERN: the other project files extend this object via
//  Object.assign(ProjectPage, {...}) so at runtime it is still ONE
//  object — identical behavior to the previous single file. Load
//  order in index.html: project-core -> project-daily ->
//  project-sow -> project-estimates.
// ================================================================

const ProjectPage = {
    _charts: {},
    _currentProjectId: null,
    _data: null,
    _dailyRecords: [],
    _estimatesData: null,
    _approvedMaterials: [],
    _approvedEquipment: [],
    _approvedManpower: [],   // v3: feeds the daily report Role dropdown
    _sowItems: [],

    /**
     * open - Load and display a project
     */
    /**
     * open(projectId, quiet) - v6.5
     *   quiet = true  -> refresh data WITHOUT tearing down the page
     *                    (used after approve/save/delete so the current
     *                    tab stays put and doesn't flash a loader)
     */
    async open(projectId, quiet) {
        this._currentProjectId = projectId;
        App.navigate('project');
        const container = document.getElementById('projectContent');
        // v6.5 (C): show the page's SHAPE immediately instead of a bare
        // spinner — the wait feels much shorter and nothing jumps later.
        if (!quiet) UI.showSkeleton(container, 'project');

        const activeTab = quiet
            ? (document.querySelector('.project-tabs button.active')?.dataset.tab || 'overview')
            : null;

        try {
            // v9.3 PERF: the three catalogs do NOT depend on the project
            // payload, but they used to be fetched only AFTER it returned —
            // two sequential waves, so every project open paid two full
            // round-trips. They are fired TOGETHER with getProjectData now,
            // and served from a short-lived cache when still fresh.
            const catalogsPromise = DataService.getCatalogs();
            const p = await DataService.getProjectData(projectId);
            if (!p) { 
                UI.setContent(container, `<div class="empty"><p>Project not found.</p></div>`); 
                return; 
            }
            
            // ✅ FIX: Ensure sowItems is always an array
            this._sowItems = Array.isArray(p.sowItems) ? p.sowItems : [];
            p.sowItems = this._sowItems;
            
            this._data = p;
            
            // ✅ FIX: Ensure estimates has groups array
            this._estimatesData = p.estimates || {};
            this._estimatesData.groups = Array.isArray(this._estimatesData.groups) ? this._estimatesData.groups : [];

            // v9.3: already in flight since before the await above
            const cat = await catalogsPromise;
            this._approvedMaterials = cat.materials;
            this._approvedEquipment = cat.equipment;
            this._approvedManpower = cat.manpower;
            if (!this._approvedManpower) {
                this._approvedManpower = [];
            }

            // Ensure SOW items have corresponding estimate groups
            this._sowItems.forEach(sow => {
                if (!this._estimatesData.groups.find(g => g.sowId === sow.id)) {
                    this._estimatesData.groups.push({
                        sowId: sow.id,
                        sowDescription: sow.description || '',
                        status: 'draft',
                        createdBy: '',
                        materials: [],
                        labor: [],
                        equipment: [],
                        indirect: []
                    });
                }
            });
            
            document.getElementById('proj-name').textContent = p.name || 'Unnamed Project';
            document.getElementById('proj-status').textContent = p.status || '—';
            document.getElementById('proj-crumb').textContent = p.name || '—';

            const pendingTotal = (p.requests || []).filter(r => r.status === 'Pending' || r.status === 'Pending Approval' || r.status === 'Approved for Release').reduce((s, r) => s + (r.amount || 0), 0);

            // v6.6: per-project editors — chips + Manage (superadmin),
            // view-only banner for everyone who isn't assigned.
            this._canEdit = p.canEdit !== false;
            const isSuperE = (App.getUser() || {}).role === 'superadmin';
            const editorChips = (p.editors || []).map(e => {
                const init = e.slice(0, 2).toUpperCase();
                return `<span class="editor-chip"><span class="editor-avatar">${init}</span>${e.split('@')[0]}</span>`;
            }).join('');
            const editorsRow = `
                <div class="editors-row">
                    <span class="editors-lbl">Editors:</span>
                    ${editorChips || '<span class="editors-open">Open to all users</span>'}
                    ${isSuperE ? `<button class="btn-sm" style="border-style:dashed;" onclick="ProjectPage.openEditorsModal()">${Icon.settings({size:12})} Manage Editors</button>` : ''}
                </div>`;
            const viewOnlyBanner = this._canEdit ? '' : `
                <div class="data-source-note" style="border-left:3px solid var(--amber);color:var(--amber);margin-bottom:14px;">
                    ${Icon.lock({size:11})} <b>View-only.</b> This project is assigned to: ${(p.editors || []).join(', ') || '—'}. You can see everything, but editing is limited to the assigned editors.
                </div>`;

            let html = `
            ${editorsRow}
            ${viewOnlyBanner}
            <div class="section-head"><h2>Project Snapshot</h2><div class="rule"></div></div>
            <div class="kpi-strip kpi-strip-5">
                <div class="kpi-card good"><div class="k-label">Revenue</div><div class="k-val mono">₱${fmtMoney((p.revenue || 0))}</div></div>
                <div class="kpi-card"><div class="k-label">Expenses</div><div class="k-val mono">₱${fmtMoney((p.expenses || 0))}</div></div>
                <div class="kpi-card good"><div class="k-label">Cash Position</div><div class="k-val mono">₱${fmtMoney((p.cashPosition || 0))}</div></div>
                <div class="kpi-card"><div class="k-label">Requests</div><div class="k-val">${(p.requests || []).length}</div></div>
                <div class="kpi-card warn"><div class="k-label">Pending / Unliquidated</div><div class="k-val mono">₱${fmtMoney(pendingTotal)}</div></div>
            </div>

            <div class="project-tabs">
                <button class="active" data-tab="overview" onclick="ProjectPage.switchTab('overview')">Overview</button>
                <button data-tab="daily" onclick="ProjectPage.switchTab('daily')">Daily Records</button>
                <button data-tab="photos" onclick="ProjectPage.switchTab('photos')">${Icon.camera({size:14})} Photos</button>
                <button data-tab="gantt" onclick="ProjectPage.switchTab('gantt')">${Icon.barChart({size:14})} Timeline</button>
                <button data-tab="sow" onclick="ProjectPage.switchTab('sow')">SOW Budget</button>
                <button data-tab="estimates" onclick="ProjectPage.switchTab('estimates')">${Icon.ruler({size:14})} Estimates</button>
                <button data-tab="materials" onclick="ProjectPage.switchTab('materials')">Site Materials</button>
                <button data-tab="equipment" onclick="ProjectPage.switchTab('equipment')">Equipment</button>
                <button data-tab="billings" onclick="ProjectPage.switchTab('billings')">Billings</button>
                <button data-tab="variations" onclick="ProjectPage.switchTab('variations')">Variations</button>
                <button data-tab="punchlist" onclick="ProjectPage.switchTab('punchlist')">${Icon.punchlist({size:13})} Punchlist</button>
                <button data-tab="safety" onclick="ProjectPage.switchTab('safety')">${Icon.safety({size:13})} Safety</button>
                <button data-tab="drawings" onclick="ProjectPage.switchTab('drawings')">${Icon.drawing({size:13})} Drawings</button>
            </div>

            <div id="proj-tab-overview" class="project-tab-content active"></div>
            <div id="proj-tab-daily" class="project-tab-content"></div>
            <div id="proj-tab-photos" class="project-tab-content"></div>
            <div id="proj-tab-gantt" class="project-tab-content"></div>
            <div id="proj-tab-sow" class="project-tab-content"></div>
            <div id="proj-tab-estimates" class="project-tab-content"></div>
            <div id="proj-tab-materials" class="project-tab-content"></div>
            <div id="proj-tab-equipment" class="project-tab-content"></div>
            <div id="proj-tab-billings" class="project-tab-content"></div>
            <div id="proj-tab-variations" class="project-tab-content"></div>
            <div id="proj-tab-punchlist" class="project-tab-content"></div>
            <div id="proj-tab-safety" class="project-tab-content"></div>
            <div id="proj-tab-drawings" class="project-tab-content"></div>

            <div class="data-source-note">Estimates are grouped by SOW with draft / pending / approved states.</div>`;

            UI.setContent(container, html);
            this.renderOverview(p);
            this.renderDailyRecords(p);
            this.renderPhotos(p);
            this.renderGantt(p);
            this.renderSOWBudget(p);
            this.renderEstimates(p);
            this.renderSiteMaterials(p);
            this.renderEquipment(p);
            this.renderBillings(p);
            this.renderVariations(p);
            this.renderPunchlist(p);      // v9
            this.renderSafety(p);         // v9
            this.renderDrawings(p);       // v9
            // v6.5 (D): a quiet refresh returns you to the tab you were
            // on instead of bouncing back to Overview.
            this.switchTab(activeTab || 'overview');

        } catch (err) {
            console.error('Project load error:', err);
            UI.toast('Error loading project: ' + err.message, 'error');
        }
    },

    /**
     * switchTab - Switch between project tabs
     */

    /**
     * openEditorsModal (v6.6) - Super Admin assigns which users can edit
     * this project. Empty selection = open to everyone (default).
     */
    async openEditorsModal() {
        let users = [];
        try { users = await DataService.getAssignableUsers(); }
        catch (err) { UI.toast('' + err.message, 'error'); return; }
        const current = (this._data.editors || []).map(e => String(e).toLowerCase());
        const overlay = document.createElement('div');
        overlay.id = 'editorsModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;max-width:430px;width:100%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:13px 18px;border-bottom:1px solid var(--line);background:var(--blueprint-tint);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">Assign Editors — ${this._currentProjectId}</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('editorsModal').remove()">${Icon.close({size:12})}</span>
                </div>
                <div style="padding:14px 18px;overflow:auto;">
                    <input id="editorSearch" placeholder="Search user..." oninput="ProjectPage.filterEditorList(this.value)"
                        style="width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:7px;margin-bottom:10px;font-size:12px;background:var(--surface);color:var(--ink);" />
                    <div id="editorList">
                        ${users.map(u => {
                            const em = String(u.email).toLowerCase();
                            const init = (u.name || em).slice(0, 2).toUpperCase();
                            return `<label class="editor-usr" data-search="${(u.name + ' ' + em).toLowerCase()}" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;cursor:pointer;">
                                <input type="checkbox" value="${em}" ${current.includes(em) ? 'checked' : ''} ${u.role === 'superadmin' ? 'checked disabled title="Super Admin always has access"' : ''} style="accent-color:var(--safety);width:15px;height:15px;">
                                <span class="editor-avatar">${init}</span>
                                <span style="font-weight:600;font-size:12.5px;">${u.name || em}</span>
                                <span style="font-family:'IBM Plex Mono';font-size:10px;color:var(--ink-soft);margin-left:auto;border:1px solid var(--line);border-radius:4px;padding:1px 6px;">${u.role}</span>
                            </label>`;
                        }).join('')}
                    </div>
                    <div style="font-size:10.5px;color:var(--ink-soft);margin-top:6px;">No selection = open to all users (default). The Super Admin always has access.</div>
                </div>
                <div style="padding:12px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn-ghost" onclick="document.getElementById('editorsModal').remove()">Cancel</button>
                    <button class="btn-primary" onclick="ProjectPage.saveEditors()">Save Editors</button>
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    },

    filterEditorList(q) {
        q = String(q || '').toLowerCase().trim();
        document.querySelectorAll('#editorList .editor-usr').forEach(el => {
            el.style.display = !q || el.dataset.search.indexOf(q) > -1 ? '' : 'none';
        });
    },

    async saveEditors() {
        const emails = [...document.querySelectorAll('#editorList input[type=checkbox]:checked:not(:disabled)')].map(c => c.value);
        try {
            await DataService.setProjectEditors(this._currentProjectId, emails);
            UI.toast(emails.length ? `Editors saved (${emails.length}).` : 'Project is now open to all users.', 'success');
            const m = document.getElementById('editorsModal');
            if (m) m.remove();
            await this.open(this._currentProjectId, true);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    switchTab(tab) {
        document.querySelectorAll('.project-tabs button').forEach(b => b.classList.remove('active'));
        document.querySelector(`.project-tabs button[data-tab="${tab}"]`)?.classList.add('active');
        document.querySelectorAll('.project-tab-content').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(`proj-tab-${tab}`);
        if (target) target.classList.add('active');

        if (tab === 'overview' && this._data) setTimeout(() => this._buildOverviewCharts(this._data), 100);
        if (tab === 'sow' && this._data) setTimeout(() => this._buildSOWChart(this._data), 100);
        if (tab === 'gantt' && this._data) setTimeout(() => this._renderGanttChart(this._data), 100);
        if (tab === 'estimates' && this._data) {
            this.renderEstimates(this._data);
            setTimeout(() => this.renderSOWBudget(this._data), 100);
        }
    },

    // ─── SHOW ADD PROJECT MODAL ──────────────────────────────
    showAddProjectModal() {
        const user = App.currentUser;
        if (!user || user.role !== 'superadmin') {
            UI.toast('Only Super Admin can add new projects.', 'error');
            return;
        }

        const existing = document.getElementById('addProjectModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'addProjectModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:500px;">
                <button class="close-modal" onclick="document.getElementById('addProjectModal').remove()">
                    ${Icon.close({size:18})}
                </button>
                <div class="print-header">
                    <h2>Add New Project</h2>
                    <div class="print-meta" style="font-size:11px;color:var(--ink-soft);">
                        ${Icon.warning({size:13})} Super Admin only
                    </div>
                </div>
                <form id="addProjectForm" onsubmit="return ProjectPage.submitAddProject(event)">
                    <div class="field">
                        <label>Project ID *</label>
                        <input type="text" id="add-proj-id" placeholder="e.g. new-construction" required />
                        <span style="font-size:10px;color:var(--ink-soft);">No spaces. Use dash (-) or underscore (_).</span>
                        <div class="error-msg">Project ID is required.</div>
                    </div>
                    <div class="field">
                        <label>Project Name *</label>
                        <input type="text" id="add-proj-name" placeholder="e.g. New Construction Project" required />
                        <div class="error-msg">Project Name is required.</div>
                    </div>
                    <div class="field">
                        <label>Client *</label>
                        <div style="display:flex;gap:6px;align-items:stretch;">
                            <select id="add-proj-client" required style="flex:1;">
                                <option value="">Loading clients...</option>
                            </select>
                            <button type="button" class="btn-sm primary" onclick="ProjectPage.toggleAddClientForm()" title="Add a new client">+ Client</button>
                        </div>
                        <div class="error-msg">Client is required.</div>
                    </div>
                    <!-- v3: inline mini-form to add a client without leaving the modal -->
                    <div id="addClientInline" style="display:none;border:1px dashed var(--line);border-radius:6px;padding:10px;margin-bottom:12px;">
                        <div class="field"><label>Client Name *</label><input type="text" id="new-client-name" placeholder="e.g. ABC Development Corp." /></div>
                        <div class="field"><label>Contact Person</label><input type="text" id="new-client-contact" /></div>
                        <div class="field"><label>Contact Number</label><input type="text" id="new-client-number" /></div>
                        <div class="field"><label>Email</label><input type="email" id="new-client-email" /></div>
                        <div class="field"><label>Address</label><input type="text" id="new-client-address" /></div>
                        <div style="display:flex;gap:6px;">
                            <button type="button" class="btn-sm success" onclick="ProjectPage.submitInlineClient()">Save Client</button>
                            <button type="button" class="btn-sm" onclick="ProjectPage.toggleAddClientForm()">Cancel</button>
                        </div>
                    </div>
                    <div class="field">
                        <label>Location</label>
                        <input type="text" id="add-proj-location" placeholder="e.g. Mabalacat, Pampanga" />
                    </div>
                    <div class="field">
                        <label>Start Date *</label>
                        <input type="date" id="add-proj-start" required />
                        <div class="error-msg">Start date is required.</div>
                    </div>
                    <div class="field">
                        <label>End Date *</label>
                        <input type="date" id="add-proj-end" required />
                        <div class="error-msg">End date is required.</div>
                    </div>
                    <div class="system-check-note" style="margin-top:12px;font-size:11px;">
                        <strong>Note:</strong> New projects always start with <strong>Ongoing</strong> status and appear in the Projects list immediately.
                    </div>
                    <div class="submit-row">
                        <button type="submit" class="btn-primary">Add Project</button>
                        <button type="button" class="btn-ghost" onclick="document.getElementById('addProjectModal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // v3: default dates (today -> +30 days) and async client list
        const today = new Date();
        const plus30 = new Date(today.getTime() + 30 * 86400000);
        document.getElementById('add-proj-start').value = today.toISOString().split('T')[0];
        document.getElementById('add-proj-end').value = plus30.toISOString().split('T')[0];
        this._loadClientDropdown();

        setTimeout(() => {
            const input = document.getElementById('add-proj-id');
            if (input) input.focus();
        }, 100);
    },

    /**
     * _loadClientDropdown (v3) - Fills the client select from the
     * ClientLists sheet. Keeps the current selection across reloads
     * (used after adding a client inline).
     */
    async _loadClientDropdown(selectId) {
        const sel = document.getElementById('add-proj-client');
        if (!sel) return;
        try {
            const clients = await DataService.getClients();
            sel.innerHTML = '<option value="">Select client...</option>' +
                clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            if (selectId) sel.value = selectId;
        } catch (err) {
            sel.innerHTML = '<option value="">Failed to load clients</option>';
            UI.toast('Could not load clients: ' + err.message, 'error');
        }
    },

    /** toggleAddClientForm (v3) - Shows/hides the inline client mini-form. */
    toggleAddClientForm() {
        const el = document.getElementById('addClientInline');
        if (!el) return;
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
        if (el.style.display === 'block') {
            document.getElementById('new-client-name').focus();
        }
    },

    /**
     * submitInlineClient (v3) - Saves the mini-form client, then
     * reloads the dropdown with the new client pre-selected.
     */
    async submitInlineClient() {
        const name = document.getElementById('new-client-name').value.trim();
        if (!name) { UI.toast('Client name is required.', 'error'); return; }
        try {
            const result = await DataService.addClient({
                name: name,
                contactPerson: document.getElementById('new-client-contact').value.trim(),
                contactNumber: document.getElementById('new-client-number').value.trim(),
                email: document.getElementById('new-client-email').value.trim(),
                address: document.getElementById('new-client-address').value.trim()
            });
            UI.toast(`Client "${name}" added.`, 'success');
            this.toggleAddClientForm();
            ['name','contact','number','email','address'].forEach(f => {
                const el = document.getElementById('new-client-' + f);
                if (el) el.value = '';
            });
            await this._loadClientDropdown(result.id);
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    async submitAddProject(e) {
        e.preventDefault();

        let id = document.getElementById('add-proj-id').value.trim();
        const name = document.getElementById('add-proj-name').value.trim();
        const clientId = document.getElementById('add-proj-client').value;
        const location = document.getElementById('add-proj-location').value.trim();
        const startDate = document.getElementById('add-proj-start').value;
        const endDate = document.getElementById('add-proj-end').value;

        if (!id) {
            document.getElementById('add-proj-id').closest('.field').classList.add('error');
            UI.toast('Project ID is required.', 'error');
            return false;
        } else {
            document.getElementById('add-proj-id').closest('.field').classList.remove('error');
        }

        id = id.toLowerCase().replace(/\s+/g, '-');

        if (!/^[a-z0-9_-]+$/.test(id)) {
            UI.toast('Project ID can only contain letters, numbers, dash (-), and underscore (_).', 'error');
            return false;
        }

        if (!name) {
            document.getElementById('add-proj-name').closest('.field').classList.add('error');
            UI.toast('Project Name is required.', 'error');
            return false;
        } else {
            document.getElementById('add-proj-name').closest('.field').classList.remove('error');
        }

        if (!clientId) {
            document.getElementById('add-proj-client').closest('.field').classList.add('error');
            UI.toast('Please select a client (or add one with + Client).', 'error');
            return false;
        }
        document.getElementById('add-proj-client').closest('.field').classList.remove('error');

        if (!startDate || !endDate) {
            UI.toast('Start and End dates are required.', 'error');
            return false;
        }
        if (new Date(endDate) < new Date(startDate)) {
            UI.toast('End date cannot be earlier than start date.', 'error');
            return false;
        }

        const clientName = document.getElementById('add-proj-client').selectedOptions[0].textContent;
        const confirmed = await Confirm.open('Add Project?',
            `Add "${name}" (${id}) for ${clientName}, ${startDate} to ${endDate}? Status will be set to Ongoing.`
        );
        if (!confirmed) return false;

        const submitBtn = document.querySelector('#addProjectForm .btn-primary');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Adding...';
        submitBtn.disabled = true;

        try {
            await DataService.addProject(id, name, clientId, location, startDate, endDate);
            UI.toast(`Project "${name}" added successfully!`, 'success');
            document.getElementById('addProjectModal').remove();
            await HomePage.load();
            HomePage._currentFilter = 'ongoing';
            HomePage.renderProjects();
            App.updateApprovalBadge();
        } catch (err) {
            UI.toast('' + err.message, 'error');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }

        return false;
    },

    /**
     * renderOverview - Renders the overview tab.
     * v8: Requests-by-Status, Incoming Cash graph, and the two tables
     * (Cash Advance Requests / Incoming Cash) were removed — walang
     * data na pumapasok doon and the Finance page already covers cash
     * detail. Cashflow and the S-curve now have Monthly/Weekly views.
     */
    _cfView: 'monthly',
    _evmView: 'monthly',

    renderOverview(p) {
        const container = document.getElementById('proj-tab-overview');
        const evm = p.evm || {};
        const spiTxt = evm.spi === null || evm.spi === undefined ? '—' : evm.spi.toFixed(2);
        const cpiTxt = evm.cpi === null || evm.cpi === undefined ? '—' : evm.cpi.toFixed(2);
        const spiState = evm.spi === null || evm.spi === undefined ? '' : (evm.spi >= 1 ? 'Ahead / On Time' : evm.spi >= 0.9 ? 'Slightly Behind' : 'Behind Schedule');
        const cpiState = evm.cpi === null || evm.cpi === undefined ? '' : (evm.cpi >= 1 ? 'Within Cost' : evm.cpi >= 0.9 ? 'Slightly Over Cost' : 'Over Cost');
        const healthCls = (evm.spi !== null && evm.spi < 0.9) || (evm.cpi !== null && evm.cpi < 0.9) ? 'bad'
            : (evm.spi !== null && evm.spi < 1) || (evm.cpi !== null && evm.cpi < 1) ? 'warn' : 'good';
        const toggle = (id, current, fn) => `
            <span class="status-tabs" style="margin:0 0 0 auto;display:inline-flex;">
                <button class="${current === 'monthly' ? 'active' : ''}" style="padding:3px 10px;font-size:10px;" onclick="ProjectPage.${fn}('monthly')">Monthly</button>
                <button class="${current === 'weekly' ? 'active' : ''}" style="padding:3px 10px;font-size:10px;" onclick="ProjectPage.${fn}('weekly')">Weekly</button>
            </span>`;
        let html = `
                <div class="section-head"><h2>Project Cashflow</h2><div class="rule"></div>
                    <span class="cc-note">solid = actual · dotted = projected from Gantt · starts at ₱0 on project start</span>
                    ${toggle('cf', this._cfView, 'setCfView')}
                </div>
                <div class="chart-card" style="margin-bottom:16px;"><div class="canvas-wrap"><canvas id="projCfChart"></canvas></div></div>

                <div class="section-head"><h2>Project Health — Earned Value</h2><div class="rule"></div></div>
                <div class="kpi-strip" style="margin-bottom:12px;">
                    <div class="kpi-card"><div class="k-label">PV · Planned Value</div><div class="k-val mono">₱${fmtMoney(evm.pv || 0)}</div><div class="k-sub">planned spend to date (budget × schedule)</div></div>
                    <div class="kpi-card good"><div class="k-label">EV · Earned Value</div><div class="k-val mono">₱${fmtMoney(evm.ev || 0)}</div><div class="k-sub">value earned (progress × approved estimate + VOs)</div></div>
                    <div class="kpi-card warn"><div class="k-label">AC · Actual Cost</div><div class="k-val mono">₱${fmtMoney(evm.ac || 0)}</div><div class="k-sub">actual cost (reviewed releases)</div></div>
                    <div class="kpi-card ${healthCls}"><div class="k-label">SPI ${spiTxt} · CPI ${cpiTxt}</div><div class="k-val" style="font-size:14px;">${spiState}${spiState && cpiState ? ' · ' : ''}${cpiState}</div><div class="k-sub">SPI=EV/PV · CPI=EV/AC · 1.00 = on plan</div></div>
                </div>
                <div class="chart-card" style="margin-bottom:10px;"><div class="cc-head"><h3>S-Curve — PV vs EV vs AC</h3>
                    <span class="cc-note">PV moves with the schedule · AC is actual spend</span>
                    ${toggle('evm', this._evmView, 'setEvmView')}
                </div><div class="canvas-wrap"><canvas id="evmChart"></canvas></div></div>
                <div class="evm-help" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:18px;">
                    <div style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:11.5px;line-height:1.5;"><b style="font-family:'IBM Plex Mono';color:var(--blueprint);">PV — Planned Value.</b> What should have been spent by now if the schedule is followed. Recalculates whenever the Timeline changes.</div>
                    <div style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:11.5px;line-height:1.5;"><b style="font-family:'IBM Plex Mono';color:var(--blueprint);">EV — Earned Value.</b> The value of work actually completed, on the contract basis: % complete (from Daily Reports) × approved estimate (+ VOs) for each SOW item.</div>
                    <div style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:11.5px;line-height:1.5;"><b style="font-family:'IBM Plex Mono';color:var(--blueprint);">AC — Actual Cost.</b> Cash actually disbursed (reviewed releases). This does not move with the schedule. EV vs AC shows cost efficiency; EV vs PV shows schedule performance.</div>
                </div>

                <div class="section-head"><h2>Cost Breakdown</h2><div class="rule"></div><span class="cc-note">by request type</span></div>
                <div class="chart-card" style="margin-bottom:16px;"><div class="canvas-wrap"><canvas id="projTypeChart"></canvas></div></div>`;
        container.innerHTML = html;
    },

    /** setCfView / setEvmView (v8) - Monthly ↔ Weekly toggles. Only the
     *  affected chart is rebuilt (data already in the payload). */
    setCfView(view) {
        this._cfView = view;
        this.renderOverview(this._data);
        setTimeout(() => this._buildOverviewCharts(this._data), 50);
    },
    setEvmView(view) {
        this._evmView = view;
        this.renderOverview(this._data);
        setTimeout(() => this._buildOverviewCharts(this._data), 50);
    },

    _buildOverviewCharts(p) {
        if (this._charts.status) { this._charts.status.destroy(); this._charts.status = null; }
        if (this._charts.cash) { this._charts.cash.destroy(); this._charts.cash = null; }
        if (this._charts.projCf) this._charts.projCf.destroy();
        if (this._charts.evm) this._charts.evm.destroy();
        if (this._charts.projType) this._charts.projType.destroy();
        try {
            if (typeof Chart === 'undefined') return;

            // ── v6/v8: Project cashflow — actual bars + Gantt projection,
            //    Monthly or Weekly per the toggle ──
            const cf = this._cfView === 'weekly' && p.projectCashflowWeekly
                ? p.projectCashflowWeekly : p.projectCashflow;
            const cfCtx = document.getElementById('projCfChart');
            if (cfCtx && cf && cf.labels && cf.labels.length) {
                let run = 0;
                const net = cf.inflow.map((v, i) => { run += v - (cf.outflow[i] || 0); return run; });
                this._charts.projCf = new Chart(cfCtx, {
                    data: { labels: cf.labels, datasets: [
                        { type: 'bar', label: 'Inflow', data: cf.inflow, backgroundColor: '#2F7A46', borderRadius: 4 },
                        { type: 'bar', label: 'Outflow', data: cf.outflow, backgroundColor: '#B23A2E', borderRadius: 4 },
                        { type: 'line', label: 'Projected outflow (Gantt)', data: cf.projectedOutflow, borderColor: '#C2860F', borderDash: [5, 4], pointRadius: this._cfView === 'weekly' ? 2 : 3, tension: .3, spanGaps: false },
                        { type: 'line', label: 'Net (running)', data: net, borderColor: '#24455A', tension: .3, pointRadius: this._cfView === 'weekly' ? 2 : 3 }
                    ]},
                    options: { responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10.5 } } },
                            tooltip: { callbacks: { label: c => `${c.dataset.label}: ₱${fmtMoney(c.parsed.y ?? 0)}` } } },
                        scales: { y: { ticks: { callback: fmtAxisMoney }, grid: { color: '#EEEBE0' } },
                            x: { grid: { display: false }, ticks: this._cfView === 'weekly' ? { maxRotation: 60, minRotation: 40, font: { size: 9.5 }, autoSkip: true, maxTicksLimit: 26 } : {} } } }
                });
            }

            // ── v6/v8: EVM S-curve — Monthly or Weekly per the toggle,
            //    always starting at ₱0 on the project start ──
            const evm = this._evmView === 'weekly' && p.evmWeekly ? p.evmWeekly : p.evm;
            const evmCtx = document.getElementById('evmChart');
            if (evmCtx && evm && evm.labels && evm.labels.length) {
                const evData = evm.evSeries || evm.labels.map((_, i) => i === evm.nowIndex ? evm.ev : null);
                this._charts.evm = new Chart(evmCtx, {
                    type: 'line',
                    data: { labels: evm.labels, datasets: [
                        { label: 'PV — Planned (Gantt)', data: evm.pvSeries, borderColor: '#5B6360', borderDash: [6, 4], tension: .35, pointRadius: this._evmView === 'weekly' ? 1.5 : 2 },
                        { label: 'AC — Actual Cost', data: evm.acSeries, borderColor: '#B23A2E', tension: .35, pointRadius: this._evmView === 'weekly' ? 2 : 3, spanGaps: false },
                        { label: 'EV — Earned, contract basis', data: evData, borderColor: '#2F7A46', tension: .35, pointRadius: this._evmView === 'weekly' ? 2 : 3, spanGaps: false }
                    ]},
                    options: { responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10.5 } } },
                            tooltip: { callbacks: { label: c => `${c.dataset.label}: ₱${fmtMoney(c.parsed.y ?? 0)}` } } },
                        scales: { y: { ticks: { callback: fmtAxisMoney }, grid: { color: '#EEEBE0' } },
                            x: { grid: { display: false }, ticks: this._evmView === 'weekly' ? { maxRotation: 60, minRotation: 40, font: { size: 9.5 }, autoSkip: true, maxTicksLimit: 26 } : {} } } }
                });
            }

            // ── v6: Cost breakdown by request type ──
            const cbt = p.costByType || [];
            const typeCtx = document.getElementById('projTypeChart');
            if (typeCtx) {
                const palette = ['#24455A', '#2F7A46', '#C2860F', '#E15412', '#5B6360', '#8C3007', '#B23A2E'];
                this._charts.projType = new Chart(typeCtx, {
                    type: 'bar',
                    data: { labels: cbt.length ? cbt.map(x => x.type) : ['No reviewed releases yet'],
                        datasets: [{ data: cbt.length ? cbt.map(x => x.amount) : [0],
                            backgroundColor: cbt.length ? cbt.map((_, i) => palette[i % palette.length]) : ['#D6D2C4'], borderRadius: 5 }] },
                    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => '₱' + fmtMoney(c.parsed.x) } } },
                        scales: { x: { ticks: { callback: fmtAxisMoney }, grid: { color: '#EEEBE0' } }, y: { grid: { display: false } } } }
                });
            }
        } catch (err) { console.error('Overview chart error:', err); }
    },

    /**
     * ==========================================================
     *  DAILY RECORDS
     * ==========================================================
     */

    _updateApprovalBadge() {
        const badge = document.getElementById('approvalBadgeHome');
        if (badge) {
            const pendingCount = DataService._pendingMaterials.length + DataService._pendingEquipment.length + 3;
            badge.textContent = pendingCount;
        }
    }
};