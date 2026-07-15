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
    _sowItems: [],

    /**
     * open - Load and display a project
     */
    async open(projectId) {
        this._currentProjectId = projectId;
        App.navigate('project');
        const container = document.getElementById('projectContent');
        UI.showLoading(container);

        try {
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

            // Fetch approved materials and equipment for dropdowns
            try {
                this._approvedMaterials = await DataService.getMaterials('approved');
            } catch (e) {
                console.error('Failed to load approved materials:', e);
                this._approvedMaterials = [];
            }
            try {
                this._approvedEquipment = await DataService.getEquipment('approved');
            } catch (e) {
                console.error('Failed to load approved equipment:', e);
                this._approvedEquipment = [];
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

            let html = `
            <div class="section-head"><h2>Project Snapshot</h2><div class="rule"></div></div>
            <div class="kpi-strip kpi-strip-5">
                <div class="kpi-card good"><div class="k-label">Revenue</div><div class="k-val mono">₱${(p.revenue || 0).toFixed(2)}</div></div>
                <div class="kpi-card"><div class="k-label">Expenses</div><div class="k-val mono">₱${(p.expenses || 0).toFixed(2)}</div></div>
                <div class="kpi-card good"><div class="k-label">Cash Position</div><div class="k-val mono">₱${(p.cashPosition || 0).toFixed(2)}</div></div>
                <div class="kpi-card"><div class="k-label">Requests</div><div class="k-val">${(p.requests || []).length}</div></div>
                <div class="kpi-card warn"><div class="k-label">Pending / Unliquidated</div><div class="k-val mono">₱${pendingTotal.toFixed(2)}</div></div>
            </div>

            <div class="project-tabs">
                <button class="active" data-tab="overview" onclick="ProjectPage.switchTab('overview')">Overview</button>
                <button data-tab="daily" onclick="ProjectPage.switchTab('daily')">Daily Records</button>
                <button data-tab="photos" onclick="ProjectPage.switchTab('photos')">${Icon.camera({size:14})} Photos</button>
                <button data-tab="gantt" onclick="ProjectPage.switchTab('gantt')">${Icon.barChart({size:14})} Timeline</button>
                <button data-tab="sow" onclick="ProjectPage.switchTab('sow')">SOW Budget</button>
                <button data-tab="estimates" onclick="ProjectPage.switchTab('estimates')">${Icon.ruler({size:14})} Estimates</button>
            </div>

            <div id="proj-tab-overview" class="project-tab-content active"></div>
            <div id="proj-tab-daily" class="project-tab-content"></div>
            <div id="proj-tab-photos" class="project-tab-content"></div>
            <div id="proj-tab-gantt" class="project-tab-content"></div>
            <div id="proj-tab-sow" class="project-tab-content"></div>
            <div id="proj-tab-estimates" class="project-tab-content"></div>

            <div class="data-source-note"><strong>Simulated data.</strong> Estimates are grouped by SOW with draft / pending / approved states.</div>`;

            UI.setContent(container, html);
            this.renderOverview(p);
            this.renderDailyRecords(p);
            this.renderPhotos(p);
            this.renderGantt(p);
            this.renderSOWBudget(p);
            this.renderEstimates(p);
            this.switchTab('overview');

        } catch (err) {
            console.error('Project load error:', err);
            UI.toast('Error loading project: ' + err.message, 'error');
        }
    },

    /**
     * switchTab - Switch between project tabs
     */
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
                        ⚠️ Super Admin only
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
                        <label>Status</label>
                        <select id="add-proj-status">
                            <option value="Ongoing">Ongoing</option>
                            <option value="On Hold">On Hold</option>
                            <option value="Completed">Completed</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Initial Revenue (₱)</label>
                        <input type="number" id="add-proj-revenue" value="0" step="0.01" min="0" />
                    </div>
                    <div class="system-check-note" style="margin-top:12px;font-size:11px;">
                        <strong>Note:</strong> New project will appear in the Projects list immediately after creation.
                    </div>
                    <div class="submit-row">
                        <button type="submit" class="btn-primary">Add Project</button>
                        <button type="button" class="btn-ghost" onclick="document.getElementById('addProjectModal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        setTimeout(() => {
            const input = document.getElementById('add-proj-id');
            if (input) input.focus();
        }, 100);
    },

    async submitAddProject(e) {
        e.preventDefault();

        let id = document.getElementById('add-proj-id').value.trim();
        const name = document.getElementById('add-proj-name').value.trim();
        const status = document.getElementById('add-proj-status').value;
        const revenue = parseFloat(document.getElementById('add-proj-revenue').value) || 0;

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

        const confirmed = await Confirm.open('Add Project?', 
            `Add "${name}" (${id}) with initial revenue of ₱${revenue.toFixed(2)}?`
        );
        if (!confirmed) return false;

        const submitBtn = document.querySelector('#addProjectForm .btn-primary');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Adding...';
        submitBtn.disabled = true;

        try {
            await DataService.addProject(id, name, status, revenue, 0, revenue);
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
     * renderOverview - Renders the overview tab
     */
    renderOverview(p) {
        const container = document.getElementById('proj-tab-overview');
        let html = `
                <div class="chart-grid">
                    <div class="chart-card"><div class="cc-head"><h3>Requests by Status</h3></div><div class="canvas-wrap short"><canvas id="projStatusChart"></canvas></div></div>
                    <div class="chart-card"><div class="cc-head"><h3>Incoming Cash</h3></div><div class="canvas-wrap short"><canvas id="projCashChart"></canvas></div></div>
                </div>
                <div class="section-head"><h2>Cash Advance Requests</h2><div class="rule"></div></div>
                <div class="panel"><table><thead><tr><th>ID</th><th>Requestor</th><th>Purpose</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>`;
        const requests = p.requests || [];
        if (requests.length === 0) html +=
            `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:24px">No requests.</td></tr>`;
        else {
            requests.forEach(r => {
                const cls = r.status === 'Approved for Release' || r.status === 'Released' || r.status ===
                    'Approved' ? 'approved' : r.status === 'Pending' ? 'pending' : 'rejected';
                html +=
                    `<tr><td><span class="req-id">${r.id}</span></td><td>${r.requestor}</td><td>${r.description || r.purpose || '—'}</td><td class="amt">₱${(r.amount || 0).toFixed(2)}</td><td><span class="stamp ${cls}">${r.status}</span></td></tr>`;
            });
        }
        html += `</tbody></table></div>
                <div class="section-head"><h2>Incoming Cash</h2><div class="rule"></div></div>
                <div class="panel"><table><thead><tr><th>Date</th><th>Name</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>`;
        const incomingCash = p.incomingCash || [];
        if (incomingCash.length === 0) html +=
            `<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);padding:24px">No cash.</td></tr>`;
        else {
            incomingCash.forEach(c => {
                html +=
                    `<tr><td class="mono" style="font-size:11.5px">${c.date}</td><td>${c.name}</td><td>${c.desc}</td><td class="amt">₱${(c.amount || 0).toFixed(2)}</td></tr>`;
            });
        }
        html += `</tbody></table></div>`;
        container.innerHTML = html;
    },

    _buildOverviewCharts(p) {
        if (this._charts.status) this._charts.status.destroy();
        if (this._charts.cash) this._charts.cash.destroy();
        try {
            if (typeof Chart === 'undefined') return;
            const requests = p.requests || [];
            const statusCounts = {};
            requests.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
            const labels = Object.keys(statusCounts);
            const colors = labels.map(s => {
                if (s === 'Approved for Release' || s === 'Released' || s === 'Approved') return '#2F7A46';
                if (s === 'Pending' || s === 'Pending Approval') return '#C2860F';
                return '#B23A2E';
            });
            const ctx = document.getElementById('projStatusChart');
            if (ctx) {
                this._charts.status = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: labels.length ? labels : ['No data'],
                        datasets: [{ data: labels.length ? labels.map(s => statusCounts[s]) : [1],
                            backgroundColor: labels.length ? colors : ['#D6D2C4'], borderColor: '#fff',
                            borderWidth: 2 }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '62%',
                        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true,
                                    boxWidth: 8, font: { size: 10.5 } } } } }
                });
            }
            const cashCtx = document.getElementById('projCashChart');
            const incomingCash = p.incomingCash || [];
            if (cashCtx && incomingCash.length > 0) {
                this._charts.cash = new Chart(cashCtx, {
                    type: 'bar',
                    data: {
                        labels: incomingCash.map(c => c.date),
                        datasets: [{ data: incomingCash.map(c => c.amount),
                            backgroundColor: '#24455A', borderRadius: 4 }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c =>
                                        '₱' + c.parsed.y.toFixed(2) } } },
                        scales: { y: { ticks: { callback: v => '₱' + (v / 1000) + 'k' },
                                grid: { color: '#EEEBE0' } }, x: { grid: { display: false } } }
                    }
                });
            } else if (cashCtx) {
                const wrap = cashCtx.closest('.canvas-wrap');
                if (wrap) wrap.innerHTML =
                    `<div class="empty" style="padding:20px"><p class="small">No cash data.</p></div>`;
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
