// ================================================================
//  PROJECT PAGE (Tabs: Overview, Daily, Photos, Timeline, SOW, Estimates)
//  ─── All original functionality preserved ───
//  
//  FIXES APPLIED:
//  - Fixed undefined project display in approval dashboard (Issue 3.5)
//  - Fixed SOW breakdown display
//  - Fixed estimate group rendering
//  - Added proper error handling for missing data
//  - Daily Records approval system (Draft → Pending → Approved/Rejected)
//  - Photo upload and display fix
//  - SOW management with Gantt integration
// ================================================================

const ProjectPage = {
    _charts: {},
    _currentProjectId: null,
    _data: null,
    _dailyRecords: [],
    _estimatesData: null,

    /**
     * open - Load and display a project
     * PURPOSE: Fetches project data and renders all tabs
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
            this._data = p;
            this._estimatesData = p.estimates || { groups: [] };
            
            // Ensure SOW items have corresponding estimate groups
            p.sowItems.forEach(sow => {
                if (!this._estimatesData.groups.find(g => g.sowId === sow.id)) {
                    this._estimatesData.groups.push({
                        sowId: sow.id,
                        sowDescription: sow.description,
                        status: 'draft',
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

            const pendingTotal = p.requests.filter(r => r.status === 'Pending' || r.status === 'Pending Approval' || r.status === 'Approved for Release').reduce((s, r) => s + (r.amount || 0), 0);

            let html = `
            <div class="section-head"><h2>Project Snapshot</h2><div class="rule"></div></div>
            <div class="kpi-strip kpi-strip-5">
                <div class="kpi-card good"><div class="k-label">Revenue</div><div class="k-val mono">₱${(p.revenue || 0).toFixed(2)}</div></div>
                <div class="kpi-card"><div class="k-label">Expenses</div><div class="k-val mono">₱${(p.expenses || 0).toFixed(2)}</div></div>
                <div class="kpi-card good"><div class="k-label">Cash Position</div><div class="k-val mono">₱${(p.cashPosition || 0).toFixed(2)}</div></div>
                <div class="kpi-card"><div class="k-label">Requests</div><div class="k-val">${p.requests.length}</div></div>
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
            UI.toast('Error loading project.', 'error');
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
        }
    },
     /**
     * showAddProjectModal - Magpakita ng modal para mag-add ng project
     * ✅ Only Super Admin allowed
     */
    showAddProjectModal() {
    // ✅ CHECK: Super Admin lang ang pwedeng mag-add
    const user = App.currentUser;
    if (!user || user.role !== 'superadmin') {
        UI.toast('Only Super Admin can add new projects.', 'error');
        return;
    }

    // Tiyaking hindi duplicate ang modal
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
                    <input type="text" id="proj-id" placeholder="e.g. new-construction" required />
                    <span style="font-size:10px;color:var(--ink-soft);">No spaces. Use dash (-) or underscore (_).</span>
                    <div class="error-msg">Project ID is required.</div>
                </div>
                <div class="field">
                    <label>Project Name *</label>
                    <input type="text" id="proj-name" placeholder="e.g. New Construction Project" required />
                    <div class="error-msg">Project Name is required.</div>
                </div>
                <div class="field">
                    <label>Status</label>
                    <select id="proj-status">
                        <option value="Ongoing">Ongoing</option>
                        <option value="On Hold">On Hold</option>
                        <option value="Completed">Completed</option>
                    </select>
                </div>
                <div class="field">
                    <label>Initial Revenue (₱)</label>
                    <input type="number" id="proj-revenue" value="0" step="0.01" min="0" />
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

    // Auto-focus sa first field
    setTimeout(() => {
        const input = document.getElementById('proj-id');
        if (input) input.focus();
    }, 100);
}
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
        if (p.requests.length === 0) html +=
            `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:24px">No requests.</td></tr>`;
        else {
            p.requests.forEach(r => {
                const cls = r.status === 'Approved for Release' || r.status === 'Released' || r.status ===
                    'Approved' ? 'approved' : r.status === 'Pending' ? 'pending' : 'rejected';
                html +=
                    `<tr><td><span class="req-id">${r.id}</span></td><td>${r.requestor}</td><td>${r.description || r.purpose || '—'}</td><td class="amt">₱${(r.amount || 0).toFixed(2)}</td><td><span class="stamp ${cls}">${r.status}</span></td></tr>`;
            });
        }
        html += `</tbody></table></div>
                <div class="section-head"><h2>Incoming Cash</h2><div class="rule"></div></div>
                <div class="panel"><table><thead><tr><th>Date</th><th>Name</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>`;
        if (p.incomingCash.length === 0) html +=
            `<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);padding:24px">No cash.</td></tr>`;
        else {
            p.incomingCash.forEach(c => {
                html +=
                    `<tr><td class="mono" style="font-size:11.5px">${c.date}</td><td>${c.name}</td><td>${c.desc}</td><td class="amt">₱${(c.amount || 0).toFixed(2)}</td></tr>`;
            });
        }
        html += `</tbody></table></div>`;
        container.innerHTML = html;
    },

    /**
     * _buildOverviewCharts - Builds the overview charts
     */
    _buildOverviewCharts(p) {
        if (this._charts.status) this._charts.status.destroy();
        if (this._charts.cash) this._charts.cash.destroy();
        try {
            if (typeof Chart === 'undefined') return;
            const statusCounts = {};
            p.requests.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
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
            if (cashCtx && p.incomingCash.length > 0) {
                this._charts.cash = new Chart(cashCtx, {
                    type: 'bar',
                    data: {
                        labels: p.incomingCash.map(c => c.date),
                        datasets: [{ data: p.incomingCash.map(c => c.amount),
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
     * renderDailyRecords - Renders the daily records tab with status and approval actions
     * FIX: Added status badges and approval buttons
     */
    renderDailyRecords(p) {
        const container = document.getElementById('proj-tab-daily');
        let html = `
                <div class="add-record-toggle">
                    <button class="btn-ghost" onclick="ProjectPage.toggleAddRecord()">+ Add Daily Site Record</button>
                </div>
                <div class="add-record-form" id="dailyAddForm">
                    ${this._buildDailyFormHTML()}
                </div>
                <div class="panel"><div class="panel-head"><h3>Site Daily Log</h3><span class="mono" style="font-size:11px;color:var(--ink-soft)">${p.dailyRecords.length} entries</span></div><div style="padding:8px 16px;">`;
        if (p.dailyRecords.length === 0) html += `<div class="empty"><p>No daily records yet.</p></div>`;
        else {
            p.dailyRecords.slice().reverse().forEach((r, idx) => {
                const statusCls = r.status === 'On Track' ? 'ontrack' : r.status === 'Delayed' ? 'delayed' : 'completed';
                const totalManpower = r.manpower ? r.manpower.reduce((s, m) => s + (parseInt(m.count) || 0), 0) : 0;
                const day = r.date ? r.date.split('-')[2] || '' : '';
                
                // Status badge
                const statusBadge = r.status === 'draft' ? 
                    '<span class="stamp draft" style="transform:none;padding:1px 8px;font-size:9px;">Draft</span>' :
                    r.status === 'pending' ? 
                    '<span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">Pending</span>' :
                    r.status === 'approved' ? 
                    '<span class="stamp approved" style="transform:none;padding:1px 8px;font-size:9px;">Approved</span>' :
                    r.status === 'rejected' ? 
                    '<span class="stamp rejected" style="transform:none;padding:1px 8px;font-size:9px;">Rejected</span>' : '';
                
                // Action buttons based on status
                let actionsHtml = '';
                if (r.status === 'draft') {
                    actionsHtml = `<button class="btn-sm primary" onclick="ProjectPage.submitDailyForApproval('${r.id}')">Submit</button>`;
                } else if (r.status === 'pending' && App.isApprover()) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ProjectPage.approveDailyRecord('${r.id}')">Approve</button>
                        <button class="btn-sm danger" onclick="ProjectPage.rejectDailyRecord('${r.id}')">Reject</button>
                    `;
                }
                
                html += `
                    <div class="daily-record-item">
                        <div class="dr-badge">${day}</div>
                        <div class="dr-body">
                            <div class="dr-title">${r.status || '—'} · ${r.weatherAM || '—'} / ${r.weatherPM || '—'}</div>
                            <div class="dr-meta">
                                <time>${r.date || '—'}</time>
                                <span>${Icon.users({size:13})} ${totalManpower} people</span>
                                ${statusBadge}
                            </div>
                        </div>
                        <div class="dr-actions" style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
                            ${actionsHtml}
                            <button class="btn-sm" onclick="ProjectPage.viewRecord(${p.dailyRecords.length - 1 - idx})">${Icon.search({size:13})}</button>
                        </div>
                    </div>`;
            });
        }
        html += `</div></div>`;
        container.innerHTML = html;
        this._dailyRecords = p.dailyRecords;
    },

    /**
     * _buildDailyFormHTML - Builds the daily record form HTML with photo upload support
     */
    _buildDailyFormHTML() {
        return `
                <div class="daily-form-section"><div class="section-label">Date & Weather <span class="rule"></span></div>
                    <div class="sub-fields">
                        <div class="field"><label>Date</label><input type="date" id="dr-date" /></div>
                        <div class="field"><label>Weather AM</label><input type="text" id="dr-weather-am" placeholder="e.g. Sunny" /></div>
                        <div class="field"><label>Weather PM</label><input type="text" id="dr-weather-pm" placeholder="e.g. Cloudy" /></div>
                        <div class="field"><label>Status</label>
                            <select id="dr-status">
                                <option value="draft">Draft</option>
                                <option value="pending">Pending Approval</option>
                                <option value="approved">Approved</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="daily-form-section" id="manpowerSection">
                    <div class="section-label">Manpower <span class="rule"></span><span style="font-weight:400;font-size:10px;color:var(--ink-soft);" id="manpowerTotal">Total: 0</span></div>
                    <div id="manpowerEntries"><div class="entry-row"><div class="field"><label>Trade / Role</label><input type="text" class="mp-role" placeholder="e.g. Foreman" /></div><div class="field"><label>Number Present</label><input type="number" class="mp-count" placeholder="0" min="0" /></div><div class="field" style="grid-column:3/-1;display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'manpower')">${Icon.close({size:13})}</button></div></div></div>
                    <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('manpower')">+ Add Role</button></div>
                    <div class="manpower-total" id="manpowerTotalDisplay">Total: 0</div>
                </div>
                <div class="daily-form-section" id="equipmentSection">
                    <div class="section-label">Equipment on Site <span class="rule"></span></div>
                    <div id="equipmentEntries"><div class="entry-row"><div class="field"><label>Equipment</label><input type="text" class="eq-name" placeholder="e.g. Excavator" /></div><div class="field"><label>Qty</label><input type="number" class="eq-qty" placeholder="1" min="0" /></div><div class="field"><label>Status</label><input type="text" class="eq-status" placeholder="Operational" /></div><div class="field"><label>Remarks</label><input type="text" class="eq-remarks" placeholder="Optional" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'equipment')">${Icon.close({size:13})}</button></div></div></div>
                    <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('equipment')">+ Add Equipment</button></div>
                </div>
                <div class="daily-form-section" id="workSection">
                    <div class="section-label">Work Accomplished <span class="rule"></span></div>
                    <div id="workEntries"><div class="entry-row"><div class="field"><label>Location</label><input type="text" class="wk-location" /></div><div class="field"><label>Scope</label><input type="text" class="wk-scope" /></div><div class="field" style="grid-column:1/-1;"><label>Description</label><textarea class="wk-desc" rows="1"></textarea></div><div class="field"><label>% Complete</label><input type="number" class="wk-pct" min="0" max="100" /></div><div class="field"><label>Photo</label><input type="file" accept="image/*" class="wk-image" data-photo onchange="ProjectPage.previewSmallImage(this,'wk-preview-${Date.now()}')" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'work')">${Icon.close({size:13})}</button></div></div></div>
                    <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('work')">+ Add Work Item</button></div>
                </div>
                <div class="daily-form-section" id="materialsSection">
                    <div class="section-label">Materials Delivered <span class="rule"></span></div>
                    <div id="materialsEntries"><div class="entry-row"><div class="field"><label>Material</label><input type="text" class="mat-name" /></div><div class="field"><label>Qty</label><input type="number" class="mat-qty" min="0" /></div><div class="field"><label>Unit</label><input type="text" class="mat-unit" /></div><div class="field"><label>Supplier / DR No.</label><input type="text" class="mat-supplier" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'materials')">${Icon.close({size:13})}</button></div></div></div>
                    <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('materials')">+ Add Material</button></div>
                </div>
                <div class="daily-form-section" id="issuesSection">
                    <div class="section-label">Issues / Delays <span class="rule"></span></div>
                    <div id="issuesEntries"><div class="entry-row"><div class="field"><label>Description</label><input type="text" class="iss-desc" /></div><div class="field"><label>Cause</label><input type="text" class="iss-cause" /></div><div class="field"><label>Time Lost (hrs)</label><input type="number" class="iss-time" min="0" step="0.5" /></div><div class="field"><label>Photo</label><input type="file" accept="image/*" class="iss-image" data-photo onchange="ProjectPage.previewSmallImage(this,'iss-preview-${Date.now()}')" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'issues')">${Icon.close({size:13})}</button></div></div></div>
                    <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('issues')">+ Add Issue</button></div>
                </div>
                <div class="daily-form-section" id="visitorsSection">
                    <div class="section-label">Visitors <span class="rule"></span></div>
                    <div id="visitorsEntries"><div class="entry-row"><div class="field"><label>Name</label><input type="text" class="vis-name" /></div><div class="field"><label>Company / Role</label><input type="text" class="vis-company" /></div><div class="field"><label>Purpose</label><input type="text" class="vis-purpose" /></div><div class="field"><label>Time In</label><input type="time" class="vis-time-in" /></div><div class="field"><label>Time Out</label><input type="time" class="vis-time-out" /></div><div class="field"><label>Remarks</label><input type="text" class="vis-remarks" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'visitors')">${Icon.close({size:13})}</button></div></div></div>
                    <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('visitors')">+ Add Visitor</button></div>
                </div>
                <div class="daily-form-section" id="photosSection">
                    <div class="section-label">Additional Photos <span class="rule"></span></div>
                    <div id="photosEntries"><div class="entry-row"><div class="field"><label>Photo</label><input type="file" accept="image/*" class="photo-input" data-photo onchange="ProjectPage.previewSmallImage(this,'photo-preview-${Date.now()}')" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'photos')">${Icon.close({size:13})}</button></div></div></div>
                    <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('photos')">+ Add Photo</button></div>
                </div>
                <div class="submit-row">
                    <button class="btn-primary" onclick="ProjectPage.submitDailyRecord('${this._currentProjectId || ''}')">Save Record</button>
                    <button class="btn-ghost" onclick="ProjectPage.toggleAddRecord()">Cancel</button>
                </div>`;
    },

    /**
     * addEntry - Adds a new entry row to a section
     */
    addEntry(section) {
        const container = document.getElementById(section + 'Entries');
        if (!container) return;
        const template = container.querySelector('.entry-row');
        if (!template) return;
        const clone = template.cloneNode(true);
        clone.querySelectorAll('input, textarea, select').forEach(el => {
            if (el.type === 'file') { el.value = '';
                el.onchange = null; } else if (el.type === 'checkbox' || el.type === 'radio') { el
                    .checked = false; } else { el.value = ''; }
        });
        clone.querySelectorAll('.image-preview-sm').forEach(el => el.remove());
        container.appendChild(clone);
        clone.querySelectorAll('input[type="file"]').forEach(el => {
            el.onchange = function(e) { ProjectPage.previewSmallImage(this, 'preview-' + Date
                .now()); };
        });
        if (section === 'manpower') this.updateManpowerTotal();
    },

    /**
     * removeEntry - Removes an entry row
     */
    removeEntry(btn, section) {
        const row = btn.closest('.entry-row');
        const container = row?.parentElement;
        if (container && container.children.length > 1) { row.remove(); if (section === 'manpower') ProjectPage
                .updateManpowerTotal(); } else UI.toast('Must have at least one entry.', 'error');
    },

    /**
     * previewSmallImage - Shows image preview for file inputs
     */
    previewSmallImage(input, previewId) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const existing = input.closest('.entry-row').querySelector('.image-preview-sm');
            if (existing) existing.remove();
            const div = document.createElement('div');
            div.className = 'image-preview-sm';
            div.style.cssText =
                'margin-top:4px;max-width:50px;max-height:50px;border-radius:4px;overflow:hidden;border:1px solid var(--line);';
            div.innerHTML =
                `<img src="${e.target.result}" alt="preview" style="width:100%;height:auto;display:block;" />`;
            input.closest('.field').appendChild(div);
        };
        reader.readAsDataURL(file);
    },

    /**
     * updateManpowerTotal - Updates the manpower total display
     */
    updateManpowerTotal() {
        const entries = document.querySelectorAll('#manpowerEntries .entry-row');
        let total = 0;
        entries.forEach(row => { const c = row.querySelector('.mp-count'); if (c) total += parseInt(c
                    .value) || 0; });
        document.getElementById('manpowerTotal').textContent = 'Total: ' + total;
        document.getElementById('manpowerTotalDisplay').textContent = 'Total: ' + total;
    },

    /**
     * toggleAddRecord - Toggles the add record form
     */
    toggleAddRecord() {
        const form = document.getElementById('dailyAddForm');
        if (form) form.classList.toggle('open');
    },

    /**
     * gatherDailyFormData - Collects data from the daily form
     */
    gatherDailyFormData() {
        const getRows = (section, clsMap) => {
            const container = document.getElementById(section + 'Entries');
            if (!container) return [];
            const rows = container.querySelectorAll('.entry-row');
            const result = [];
            rows.forEach(row => {
                const obj = {};
                let has = false;
                Object.keys(clsMap).forEach(key => {
                    const el = row.querySelector(clsMap[key]);
                    if (el) {
                        const val = el.type === 'file' ? (el.files && el.files[0] ? el.files[0]
                            .name : '') : el.value.trim();
                        obj[key] = val;
                        if (val) has = true;
                    }
                });
                if (has) result.push(obj);
            });
            return result;
        };
        return {
            date: document.getElementById('dr-date').value,
            weatherAM: document.getElementById('dr-weather-am').value.trim(),
            weatherPM: document.getElementById('dr-weather-pm').value.trim(),
            status: document.getElementById('dr-status').value,
            manpower: getRows('manpower', { role: '.mp-role', count: '.mp-count' }),
            equipment: getRows('equipment', { name: '.eq-name', qty: '.eq-qty', status: '.eq-status',
                remarks: '.eq-remarks' }),
            workAccomplished: getRows('work', { location: '.wk-location', scope: '.wk-scope',
                description: '.wk-desc', percentComplete: '.wk-pct', image: '.wk-image' }),
            materialsDelivered: getRows('materials', { material: '.mat-name', qty: '.mat-qty',
                unit: '.mat-unit', supplier: '.mat-supplier' }),
            issues: getRows('issues', { description: '.iss-desc', cause: '.iss-cause',
                timeLost: '.iss-time', image: '.iss-image' }),
            visitors: getRows('visitors', { name: '.vis-name', company: '.vis-company',
                purpose: '.vis-purpose', timeIn: '.vis-time-in', timeOut: '.vis-time-out',
                remarks: '.vis-remarks' }),
            photos: [] // Will be filled with uploaded photo URLs
        };
    },

    /**
     * submitDailyRecord - Submits a daily record with photo uploads
     * FIX: Uploads photos to Drive before saving
     */
    async submitDailyRecord(projectId) {
        const data = this.gatherDailyFormData();
        if (!data.date) { UI.toast('Please select a date.', 'error'); return; }
        
        // Upload photos from the photos section
        const photoInputs = document.querySelectorAll('#photosEntries input[type="file"][data-photo]');
        const photoPromises = [];
        photoInputs.forEach(input => {
            if (input.files && input.files.length > 0) {
                const file = input.files[0];
                photoPromises.push(fileToBase64_(file).then(base64 => {
                    return DataService.uploadImage(base64, file.name, file.type);
                }).catch(err => {
                    console.error('Photo upload error:', err);
                    return null;
                }));
            }
        });
        const photoResults = await Promise.all(photoPromises);
        data.photos = photoResults.filter(r => r && r.url).map(r => r.url);
        
        const confirmed = await Confirm.open('Save Daily Record?', `Save record for ${data.date}?`);
        if (!confirmed) return;
        try {
            await DataService.addDailyRecord(projectId, data);
            UI.toast('Daily record saved!', 'success');
            await this.open(projectId);
        } catch (err) { UI.toast('Error: ' + err.message, 'error'); }
    },

    /**
     * viewRecord - Opens a daily record in print modal
     */
    viewRecord(index) {
        const records = this._dailyRecords || [];
        const record = records[index];
        if (!record) { UI.toast('Record not found.', 'error'); return; }
        PrintModal.open(record);
    },

    /**
     * viewRecordById - Opens a daily record by ID
     */
    async viewRecordById(id) {
        const p = this._data;
        if (!p) { UI.toast('Project data not loaded.', 'error'); return; }
        const record = p.dailyRecords.find(r => r.id === id);
        if (!record) { UI.toast('Record not found.', 'error'); return; }
        PrintModal.open(record);
    },

    /**
     * submitDailyForApproval - Submit a daily record for approval
     */
    async submitDailyForApproval(recordId) {
        const confirmed = await Confirm.open('Submit for Approval?', 'Submit this daily record for approval?');
        if (!confirmed) return;
        try {
            await DataService.submitDailyRecordForApproval(recordId);
            UI.toast('Daily record submitted for approval.', 'success');
            await this.open(this._currentProjectId);
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    /**
     * approveDailyRecord - Approve a daily record
     */
    async approveDailyRecord(recordId) {
        const confirmed = await Confirm.open('Approve Daily Record?', 'Approve this daily record?');
        if (!confirmed) return;
        try {
            await DataService.approveDailyRecord(recordId);
            UI.toast('Daily record approved.', 'success');
            await this.open(this._currentProjectId);
            if (typeof ApprovalsPage !== 'undefined' && ApprovalsPage.load) ApprovalsPage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    /**
     * rejectDailyRecord - Reject a daily record
     */
    async rejectDailyRecord(recordId) {
        const confirmed = await Confirm.open('Reject Daily Record?', 'Reject this daily record?');
        if (!confirmed) return;
        try {
            await DataService.rejectDailyRecord(recordId);
            UI.toast('Daily record rejected.', 'error');
            await this.open(this._currentProjectId);
            if (typeof ApprovalsPage !== 'undefined' && ApprovalsPage.load) ApprovalsPage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    /**
     * renderPhotos - Renders the photos tab with images from daily records
     * FIX: Uses photos from daily records and workAccomplished/issues
     */
    renderPhotos(p) {
        const container = document.getElementById('proj-tab-photos');
        const images = p.photos || [];
        // Also collect from workAccomplished and issues
        p.dailyRecords.forEach(record => {
            if (record.workAccomplished) {
                record.workAccomplished.forEach(w => { if (w.image) images.push(w.image); });
            }
            if (record.issues) {
                record.issues.forEach(iss => { if (iss.image) images.push(iss.image); });
            }
        });
        if (images.length === 0) {
            images.push('https://placehold.co/600x400/24455A/FFFFFF?text=No+Photos');
        }

        let html = `<div class="section-head"><h2>Project Photos</h2><div class="rule"></div><span class="badge">${images.length} images</span></div>
                <div class="photo-grid">`;
        images.forEach((img, idx) => {
            html += `
                    <div class="photo-item" onclick="Lightbox.open(${JSON.stringify(images)}, ${idx})">
                        <img src="${img}" alt="Project photo" />
                    </div>`;
        });
        html += `</div>`;
        container.innerHTML = html;
        this._photoImages = images;
    },

    /**
     * renderGantt - Renders the Gantt chart tab with Add SOW button
     * FIX: Added Add SOW button
     */
    renderGantt(p) {
        const container = document.getElementById('proj-tab-gantt');
        container.innerHTML = `
                <div class="section-head"><h2>Project Timeline (Gantt Chart)</h2><div class="rule"></div>
                    <span class="badge">Drag bars to move · Drag edges to resize</span>
                    <button class="btn-primary" onclick="ProjectPage.showAddSOWModal()" style="padding:4px 14px;font-size:11px;margin-left:auto;">+ Add SOW</button>
                </div>
                <div class="gantt-wrapper" id="ganttWrapper">
                    <div class="gantt-container" id="ganttContainer">
                        <div class="gantt-timeline" id="ganttTimeline"></div>
                        <div class="gantt-body" id="ganttBody"></div>
                    </div>
                </div>
                <div class="gantt-legend">
                    <span><span class="dot" style="background:var(--green);"></span> On Track</span>
                    <span><span class="dot" style="background:var(--amber);"></span> At Risk</span>
                    <span><span class="dot" style="background:var(--red);"></span> Overdue / Delayed</span>
                    <span style="color:var(--ink-soft);font-size:11px;">Click a bar to edit dates manually</span>
                </div>
                <div class="gantt-tooltip" id="ganttTooltip"></div>`;
        this._ganttData = p.sowItems;
        setTimeout(() => this._renderGanttChart(p), 100);
    },

    /**
     * _renderGanttChart - Renders the actual Gantt chart
     */
    _renderGanttChart(p) {
        const items = p.sowItems;
        if (!items || items.length === 0) {
            document.getElementById('ganttBody').innerHTML =
                `<div class="empty"><p>No SOW items with dates.</p></div>`;
            return;
        }
        const dates = [];
        items.forEach(item => {
            if (item.startDate && item.endDate) {
                dates.push(new Date(item.startDate));
                dates.push(new Date(item.endDate));
            }
        });
        if (dates.length === 0) {
            document.getElementById('ganttBody').innerHTML =
                `<div class="empty"><p>No dates set. Please add start/end dates to SOW items.</p></div>`;
            return;
        }
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        minDate.setDate(minDate.getDate() - 2);
        maxDate.setDate(maxDate.getDate() + 2);
        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) || 1;

        const timeline = document.getElementById('ganttTimeline');
        let tlHtml =
            `<div style="width:120px;flex-shrink:0;font-size:9px;font-weight:600;color:var(--ink-soft);">SOW Item</div>`;
        for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
            const day = new Date(d);
            tlHtml += `<div class="gt-day">${day.getDate()}/${day.getMonth()+1}</div>`;
        }
        timeline.innerHTML = tlHtml;

        const body = document.getElementById('ganttBody');
        let bodyHtml = '';
        items.forEach((item, idx) => {
            if (!item.startDate || !item.endDate) {
                bodyHtml +=
                    `<div class="gantt-row"><div class="gantt-row-label">${item.id}</div><div class="gantt-row-track"><span style="font-size:10px;color:var(--ink-soft);padding-left:10px;">No dates</span></div></div>`;
                return;
            }
            const start = new Date(item.startDate);
            const end = new Date(item.endDate);
            const startOffset = Math.ceil((start - minDate) / (1000 * 60 * 60 * 24));
            const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            const leftPct = (startOffset / totalDays) * 100;
            const widthPct = (duration / totalDays) * 100;
            const statusCls = item.status === 'Completed' ? '' : item.status === 'At Risk' ? 'warn' : item
                .status === 'Overdue' ? 'danger' : '';
            const barColor = statusCls === 'warn' ? 'var(--amber)' : statusCls === 'danger' ?
                'var(--red)' : 'var(--green)';
            bodyHtml += `
                    <div class="gantt-row" data-idx="${idx}">
                        <div class="gantt-row-label" title="${item.id} — ${item.description}">${item.id}</div>
                        <div class="gantt-row-track">
                            <div class="gantt-bar ${statusCls}" style="left:${Math.max(0,leftPct)}%;width:${Math.max(2,widthPct)}%;background:${barColor};" 
                                 data-idx="${idx}" data-start="${item.startDate}" data-end="${item.endDate}">
                                <span style="font-size:8px;opacity:0.9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.id}</span>
                                <div class="resize-handle left" data-action="resize-left">◀</div>
                                <div class="resize-handle right" data-action="resize-right">▶</div>
                            </div>
                        </div>
                    </div>`;
        });
        body.innerHTML = bodyHtml;
        this._attachGanttEvents(minDate, totalDays, items);
    },

    /**
     * _attachGanttEvents - Attaches drag events to Gantt bars
     */
    _attachGanttEvents(minDate, totalDays, items) {
        const bars = document.querySelectorAll('.gantt-bar');
        let activeBar = null;
        let isResizing = false;
        let resizeSide = null;

        const onMouseMove = (e) => {
            if (!activeBar) return;
            const track = activeBar.closest('.gantt-row-track');
            if (!track) return;
            const rect = track.getBoundingClientRect();
            const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

            if (isResizing && resizeSide) {
                const leftPct = parseFloat(activeBar.style.left) || 0;
                let widthPct = parseFloat(activeBar.style.width) || 10;
                if (resizeSide === 'right') {
                    widthPct = Math.max(2, pct - leftPct);
                } else {
                    const newLeft = Math.max(0, Math.min(100 - 2, pct));
                    const diff = leftPct - newLeft;
                    widthPct = Math.max(2, widthPct + diff);
                    activeBar.style.left = newLeft + '%';
                    const dayOffsetStart = Math.floor((newLeft / 100) * totalDays);
                    const newStart = new Date(minDate);
                    newStart.setDate(newStart.getDate() + dayOffsetStart);
                    const idx = parseInt(activeBar.dataset.idx);
                    if (!isNaN(idx) && items[idx]) {
                        items[idx].startDate = newStart.toISOString().split('T')[0];
                        activeBar.dataset.start = items[idx].startDate;
                    }
                }
                activeBar.style.width = Math.max(2, widthPct) + '%';
                const left = parseFloat(activeBar.style.left) || 0;
                const w = parseFloat(activeBar.style.width) || 10;
                const dayOffsetEnd = Math.floor(((left + w) / 100) * totalDays) - 1;
                const newEnd = new Date(minDate);
                newEnd.setDate(newEnd.getDate() + Math.max(dayOffsetEnd, 0));
                const idx = parseInt(activeBar.dataset.idx);
                if (!isNaN(idx) && items[idx]) {
                    items[idx].endDate = newEnd.toISOString().split('T')[0];
                    activeBar.dataset.end = items[idx].endDate;
                }
                const tooltip = document.getElementById('ganttTooltip');
                if (items[idx]) {
                    tooltip.textContent =
                        `${items[idx].id}: ${items[idx].startDate} → ${items[idx].endDate}`;
                    tooltip.style.left = e.clientX - 40 + 'px';
                    tooltip.style.top = e.clientY - 30 + 'px';
                    tooltip.classList.add('show');
                }
                return;
            }

            const leftPct = Math.max(0, Math.min(100 - (parseFloat(activeBar.style.width) || 10), pct));
            activeBar.style.left = leftPct + '%';
            const widthPct = parseFloat(activeBar.style.width) || 10;
            const dayOffsetStart = Math.floor((leftPct / 100) * totalDays);
            const dayOffsetEnd = Math.floor(((leftPct + widthPct) / 100) * totalDays) - 1;
            const newStart = new Date(minDate);
            newStart.setDate(newStart.getDate() + dayOffsetStart);
            const newEnd = new Date(minDate);
            newEnd.setDate(newEnd.getDate() + Math.max(dayOffsetEnd, dayOffsetStart));
            const idx = parseInt(activeBar.dataset.idx);
            if (!isNaN(idx) && items[idx]) {
                items[idx].startDate = newStart.toISOString().split('T')[0];
                items[idx].endDate = newEnd.toISOString().split('T')[0];
                activeBar.dataset.start = items[idx].startDate;
                activeBar.dataset.end = items[idx].endDate;
            }
            const tooltip = document.getElementById('ganttTooltip');
            if (items[idx]) {
                tooltip.textContent = `${items[idx].id}: ${items[idx].startDate} → ${items[idx].endDate}`;
                tooltip.style.left = e.clientX - 40 + 'px';
                tooltip.style.top = e.clientY - 30 + 'px';
                tooltip.classList.add('show');
            }
        };

        const onMouseUp = () => {
            if (activeBar) {
                document.getElementById('ganttTooltip').classList.remove('show');
                UI.toast('Timeline updated (simulated).', 'success');
            }
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            activeBar = null;
            isResizing = false;
            resizeSide = null;
        };

        bars.forEach(bar => {
            bar.addEventListener('click', function(e) {
                if (e.target.closest('.resize-handle')) return;
                const idx = parseInt(this.dataset.idx);
                if (isNaN(idx) || !items[idx]) return;
                const item = items[idx];
                const newStart = prompt('Edit Start Date (YYYY-MM-DD):', item.startDate);
                if (newStart) {
                    const newEnd = prompt('Edit End Date (YYYY-MM-DD):', item.endDate);
                    if (newEnd) {
                        item.startDate = newStart;
                        item.endDate = newEnd;
                        UI.toast(`Updated ${item.id} dates.`, 'success');
                        const p = ProjectPage._data;
                        if (p) ProjectPage._renderGanttChart(p);
                    }
                }
            });
            bar.querySelectorAll('.resize-handle').forEach(handle => {
                handle.addEventListener('mousedown', function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    activeBar = bar;
                    isResizing = true;
                    resizeSide = this.dataset.action === 'resize-left' ? 'left' : 'right';
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });
            });
            bar.addEventListener('mousedown', function(e) {
                if (e.target.closest('.resize-handle')) return;
                e.preventDefault();
                activeBar = bar;
                isResizing = false;
                resizeSide = null;
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });
    },

    /**
     * showAddSOWModal - Shows modal for adding a new SOW item
     */
    showAddSOWModal() {
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'addSOWModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:500px;">
                <button class="close-modal" onclick="document.getElementById('addSOWModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>Add SOW Item</h2></div>
                <form id="addSOWForm" onsubmit="return ProjectPage.submitAddSOW(event)">
                    <div class="field"><label>SOW ID *</label><input type="text" id="sow-id" placeholder="e.g. A.1, B.2" required /></div>
                    <div class="field"><label>Description *</label><input type="text" id="sow-desc" placeholder="Description of work" required /></div>
                    <div class="field"><label>Start Date *</label><input type="date" id="sow-start" required /></div>
                    <div class="field"><label>End Date *</label><input type="date" id="sow-end" required /></div>
                    <div class="field"><label>Budget (₱)</label><input type="number" id="sow-budget" step="0.01" value="0" /></div>
                    <div class="submit-row">
                        <button type="submit" class="btn-primary">Add SOW</button>
                        <button type="button" class="btn-ghost" onclick="document.getElementById('addSOWModal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    },

    /**
     * submitAddSOW - Handles SOW addition form submission
     */
    async submitAddSOW(e) {
        e.preventDefault();
        const id = document.getElementById('sow-id').value.trim();
        const description = document.getElementById('sow-desc').value.trim();
        const startDate = document.getElementById('sow-start').value;
        const endDate = document.getElementById('sow-end').value;
        const budget = parseFloat(document.getElementById('sow-budget').value) || 0;
        
        if (!id || !description || !startDate || !endDate) {
            UI.toast('Please fill in all required fields.', 'error');
            return false;
        }
        
        const confirmed = await Confirm.open('Add SOW?', `Add SOW ${id} - ${description}?`);
        if (!confirmed) return false;
        
        try {
            await DataService.addSOWItem(this._currentProjectId, { id, description, startDate, endDate, budget });
            UI.toast('SOW added successfully!', 'success');
            document.getElementById('addSOWModal').remove();
            await this.open(this._currentProjectId);
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
        return false;
    },

    /**
     * renderSOWBudget - Renders the SOW budget tab
     */
    renderSOWBudget(p) {
        const container = document.getElementById('proj-tab-sow');
        const estimates = this._estimatesData || { groups: [] };

        let html = `
                <div class="section-head"><h2>Scope of Work Budget Control</h2><div class="rule"></div>
                    <span class="badge">Click any SOW to see detailed breakdown</span>
                </div>
                <div class="panel"><div style="padding:6px 16px;">`;
        let totalBudget = 0,
            totalActual = 0,
            totalEstimate = 0;

        p.sowItems.forEach(item => {
            totalBudget += item.budget || 0;
            totalActual += item.actual || 0;

            const group = estimates.groups.find(g => g.sowId === item.id);
            let itemEstimate = 0;
            if (group) {
                const matSum = (group.materials || []).reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
                const eqSum = (group.equipment || []).reduce((s, e) => s + (parseFloat(e.cost) || 0), 0);
                const labSum = (group.labor || []).reduce((s, l) => s + (parseFloat(l.cost) || 0), 0);
                const indSum = (group.indirect || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
                itemEstimate = matSum + eqSum + labSum + indSum;
            }
            totalEstimate += itemEstimate;

            const pct = (item.budget || 0) > 0 ? Math.min(((item.actual || 0) / (item.budget || 0)) * 100, 100) : 0;
            const barClass = pct > 90 ? 'danger' : pct > 70 ? 'warn' : '';

            const statusLabel = group ? (group.status === 'approved' ? `${Icon.checkCircle({size:12,color:'var(--green)'})} Approved` : group.status ===
                'pending' ? `${Icon.clock({size:12,color:'var(--amber)'})} Pending` : `${Icon.fileText({size:12})} Draft`) : `${Icon.fileText({size:12})} Draft`;
            const statusCls = group ? group.status : 'draft';

            html += `
                    <div class="sow-item" onclick="ProjectPage.openSOWBreakdown('${item.id}')">
                        <div class="sow-desc">${item.id} — ${item.description || '—'}</div>
                        <div class="sow-numbers">
                            <span class="sn" style="color:var(--blueprint);font-weight:600;">Est: ₱${itemEstimate.toFixed(2)}</span>
                            <span class="sn">Budget: ₱${(item.budget || 0).toFixed(2)}</span>
                            <span class="sn">Actual: ₱${(item.actual || 0).toFixed(2)}</span>
                            <span class="sn">Remaining: ₱${((item.budget || 0) - (item.actual || 0)).toFixed(2)}</span>
                            <span class="stamp ${statusCls}" style="transform:none;font-size:8px;padding:1px 8px;">${statusLabel}</span>
                        </div>
                        <div class="sow-bar"><div class="fill ${barClass}" style="width:${pct}%;"></div></div>
                        <span style="font-size:11px;font-weight:600;min-width:44px;">${pct.toFixed(0)}%</span>
                        <span style="color:var(--ink-soft);">${Icon.search({size:13})}</span>
                    </div>`;
        });

        html += `
                    <div class="sow-total-row">
                        <span>Total Estimate: ₱${totalEstimate.toFixed(2)}</span>
                        <span>Total Budget: ₱${totalBudget.toFixed(2)}</span>
                        <span>Total Actual: ₱${totalActual.toFixed(2)}</span>
                        <span>Variance: ₱${(totalEstimate - totalBudget).toFixed(2)}</span>
                        <span>Utilization: ${totalBudget > 0 ? ((totalActual/totalBudget)*100).toFixed(1) : 0}%</span>
                    </div>
                </div></div>
                <div class="section-head"><h2>Budget vs Actual per SOW</h2><div class="rule"></div></div>
                <div class="chart-grid full">
                    <div class="chart-card"><div class="cc-head"><h3>SOW Cashflow</h3><span class="cc-note">budget vs actual</span></div><div class="canvas-wrap"><canvas id="sowChart"></canvas></div></div>
                </div>`;
        container.innerHTML = html;
    },

    /**
     * openSOWBreakdown - Opens the SOW breakdown modal
     */
    openSOWBreakdown(sowId) {
        const estimates = this._estimatesData || { groups: [] };
        const group = estimates.groups.find(g => g.sowId === sowId);
        if (!group) { UI.toast('No estimate data for this SOW.', 'error'); return; }
        const data = {
            materials: group.materials || [],
            equipment: group.equipment || [],
            labor: group.labor || [],
            indirect: group.indirect || []
        };
        SOWBreakdownModal.open(sowId, data);
    },

    /**
     * _buildSOWChart - Builds the SOW budget chart
     */
    _buildSOWChart(p) {
        if (this._charts.sow) this._charts.sow.destroy();
        try {
            if (typeof Chart === 'undefined') return;
            const ctx = document.getElementById('sowChart');
            if (!ctx) return;
            const labels = p.sowItems.map(i => i.id);
            const budget = p.sowItems.map(i => i.budget || 0);
            const actual = p.sowItems.map(i => i.actual || 0);
            this._charts.sow = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Budget', data: budget, backgroundColor: '#C9D9E0', borderRadius: 4 },
                        { label: 'Actual', data: actual, backgroundColor: '#24455A', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
                        tooltip: { callbacks: { label: c => `${c.dataset.label}: ₱${c.parsed.y.toFixed(2)}` } }
                    },
                    scales: {
                        y: { ticks: { callback: v => '₱' + (v / 1000) + 'k' }, grid: { color: '#EEEBE0' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        } catch (err) { console.error('SOW chart error:', err); }
    },

    /**
     * renderEstimates - Renders the estimates tab
     */
    renderEstimates(p) {
        const container = document.getElementById('proj-tab-estimates');
        const est = this._estimatesData || { groups: [] };

        const allMat = DataService._materials || [];
        const matOptions = allMat.map(m =>
            `<option value="${m.id}" data-name="${m.brand || m.name} ${m.specs || ''}" data-rate="${m.rate || 0}">${m.id} - ${m.brand || m.name} ${m.specs || ''}</option>`
        ).join('');

        const allEq = DataService._equipment || [];
        const eqOptions = allEq.map(e =>
            `<option value="${e.id}" data-name="${e.brand || e.name} ${e.model || ''}" data-rate="${e.rate || 0}">${e.id} - ${e.brand || e.name} ${e.model || ''}</option>`
        ).join('');

        let grandTotal = 0;
        est.groups.forEach(g => {
            const matSum = (g.materials || []).reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
            const eqSum = (g.equipment || []).reduce((s, e) => s + (parseFloat(e.cost) || 0), 0);
            const labSum = (g.labor || []).reduce((s, l) => s + (parseFloat(l.cost) || 0), 0);
            const indSum = (g.indirect || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
            g._total = matSum + eqSum + labSum + indSum;
            grandTotal += g._total;
        });

        let html = `
                <div class="section-head"><h2>Project Estimates</h2><div class="rule"></div>
                    <span class="badge">Total Estimate: ₱${grandTotal.toFixed(2)}</span>
                </div>
                <p style="font-size:11px;color:var(--ink-soft);margin-bottom:12px;">
                    Each SOW has its own Materials, Labor, Equipment, and Indirect Costs. 
                    <strong>Draft</strong> → <strong>Submit for Approval</strong> → <strong>Approved</strong> (locked).
                </p>

                <div id="estGroupsContainer">`;

        if (est.groups.length === 0) {
            html += `<div class="empty"><p>No SOW groups. Add a new SOW group below.</p></div>`;
        } else {
            est.groups.forEach((group, gIdx) => {
                const isApproved = group.status === 'approved';
                const isPending = group.status === 'pending';
                const isDraft = group.status === 'draft' || !group.status;
                const cardCls = isApproved ? 'approved' : isPending ? 'pending' : 'draft';
                const readonlyCls = isApproved ? 'readonly' : '';

                html += `
                        <div class="est-group-card ${cardCls} ${readonlyCls}" data-group-idx="${gIdx}">
                            <div class="eg-header">
                                <span class="eg-sow">${group.sowId || '—'}</span>
                                <span class="eg-desc">${group.sowDescription || 'No description'}</span>
                                <span class="eg-status ${group.status || 'draft'}">${group.status || 'draft'}</span>
                                <div class="eg-actions">
                                    ${!isApproved ? `<button class="btn-sm primary" onclick="ProjectPage.addEstimateItem('${gIdx}','materials')">+ Mat</button>` : ''}
                                    ${!isApproved ? `<button class="btn-sm primary" onclick="ProjectPage.addEstimateItem('${gIdx}','labor')">+ Lab</button>` : ''}
                                    ${!isApproved ? `<button class="btn-sm primary" onclick="ProjectPage.addEstimateItem('${gIdx}','equipment')">+ Eq</button>` : ''}
                                    ${!isApproved ? `<button class="btn-sm primary" onclick="ProjectPage.addEstimateItem('${gIdx}','indirect')">+ Ind</button>` : ''}
                                    ${isDraft ? `<button class="btn-sm amber" onclick="ProjectPage.submitEstimateGroup('${gIdx}')">Submit</button>` : ''}
                                    ${isPending ? `<button class="btn-sm success" onclick="ProjectPage.approveEstimateGroup('${gIdx}')">Approve</button>` : ''}
                                    ${isApproved ? `<span style="font-size:11px;color:var(--green);">${Icon.lock({size:12})} Approved</span>` : ''}
                                </div>
                            </div>
                            <div class="eg-body">
                                ${this._renderEstimateCategory('Materials', group.materials || [], gIdx, 'materials', isApproved, matOptions)}
                                ${this._renderEstimateCategory('Labor', group.labor || [], gIdx, 'labor', isApproved)}
                                ${this._renderEstimateCategory('Equipment', group.equipment || [], gIdx, 'equipment', isApproved, eqOptions)}
                                ${this._renderEstimateCategory('Indirect Costs', group.indirect || [], gIdx, 'indirect', isApproved)}
                                <div class="eg-subtotal">
                                    <span class="eg-subtotal-label">Subtotal</span>
                                    ₱${(group._total || 0).toFixed(2)}
                                </div>
                            </div>
                        </div>`;
            });
        }

        html += `
                </div>
                <div class="submit-row" style="margin-top:16px;">
                    <button class="btn-primary" onclick="ProjectPage.addSOWGroup()">+ Add SOW Group</button>
                    <button class="btn-ghost" onclick="ProjectPage.saveAllEstimates()">${Icon.save({size:14})} Save All Drafts</button>
                    <span style="font-size:11px;color:var(--ink-soft);align-self:center;">Data is saved locally (simulated).</span>
                </div>`;

        container.innerHTML = html;
    },

    /**
     * _renderEstimateCategory - Renders a category within an estimate group
     */
    _renderEstimateCategory(label, items, gIdx, cat, isApproved, options = '') {
        if (!items) items = [];
        const catKey = cat;
        let html = `
                <div class="eg-category">
                    <div class="eg-cat-label">
                        ${label} 
                        <span class="eg-cat-total">(${items.length} items · ₱${items.reduce((s, i) => s + (parseFloat(i.cost || i.amount || 0)), 0).toFixed(2)})</span>
                    </div>
                    <div class="eg-cat-items">`;

        if (items.length === 0) {
            html += `<div style="font-size:11px;color:var(--ink-soft);padding:4px 0;">No items added.</div>`;
        } else {
            items.forEach((item, idx) => {
                const cost = parseFloat(item.cost || item.amount || 0);
                html += `<div class="eg-item-row" data-item-idx="${idx}" data-cat="${catKey}">`;

                if (cat === 'materials') {
                    html += `
                                <div class="field"><label>Material</label>
                                    ${isApproved ? `<span style="font-size:12px;font-weight:500;">${item.materialName || item.material || '—'}</span>` :
                                    `<select class="est-mat-select" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','material',this.value)">
                                        <option value="">Select...</option>
                                        ${options}
                                    </select>`}
                                </div>
                                <div class="field"><label>Desc</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.desc || '—'}</span>` :
                                    `<input type="text" class="est-item-desc" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.desc || ''}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','desc',this.value)" />`}
                                </div>
                                <div class="field"><label>Qty</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.qty || 0}</span>` :
                                    `<input type="number" class="est-item-qty" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.qty || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','qty',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Rate</label>
                                    ${isApproved ? `<span style="font-size:12px;">₱${(item.rate || 0).toFixed(2)}</span>` :
                                    `<input type="number" class="est-item-rate" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.rate || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','rate',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Cost</label>
                                    <span class="cost-display">₱${cost.toFixed(2)}</span>
                                </div>
                                ${!isApproved ? `<div class="field"><button class="remove-btn" onclick="ProjectPage.removeEstimateItem(${gIdx},${idx},'${catKey}')">${Icon.close({size:13})}</button></div>` : ''}
                            `;
                } else if (cat === 'labor') {
                    html += `
                                <div class="field"><label>Role</label>
                                    ${isApproved ? `<span style="font-size:12px;font-weight:500;">${item.role || '—'}</span>` :
                                    `<input type="text" class="est-item-role" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.role || ''}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','role',this.value)" />`}
                                </div>
                                <div class="field"><label>Desc</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.desc || '—'}</span>` :
                                    `<input type="text" class="est-item-desc" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.desc || ''}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','desc',this.value)" />`}
                                </div>
                                <div class="field"><label>Qty</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.qty || 0}</span>` :
                                    `<input type="number" class="est-item-qty" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.qty || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','qty',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Days</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.duration || 0}</span>` :
                                    `<input type="number" class="est-item-duration" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.duration || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','duration',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Rate</label>
                                    ${isApproved ? `<span style="font-size:12px;">₱${(item.rate || 0).toFixed(2)}</span>` :
                                    `<input type="number" class="est-item-rate" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.rate || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','rate',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Cost</label>
                                    <span class="cost-display">₱${cost.toFixed(2)}</span>
                                </div>
                                ${!isApproved ? `<div class="field"><button class="remove-btn" onclick="ProjectPage.removeEstimateItem(${gIdx},${idx},'${catKey}')">${Icon.close({size:13})}</button></div>` : ''}
                            `;
                } else if (cat === 'equipment') {
                    html += `
                                <div class="field"><label>Equipment</label>
                                    ${isApproved ? `<span style="font-size:12px;font-weight:500;">${item.equipName || item.equipment || '—'}</span>` :
                                    `<select class="est-eq-select" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','equipment',this.value)">
                                        <option value="">Select...</option>
                                        ${options}
                                    </select>`}
                                </div>
                                <div class="field"><label>Desc</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.desc || '—'}</span>` :
                                    `<input type="text" class="est-item-desc" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.desc || ''}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','desc',this.value)" />`}
                                </div>
                                <div class="field"><label>Qty</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.qty || 0}</span>` :
                                    `<input type="number" class="est-item-qty" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.qty || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','qty',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Days</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.duration || 0}</span>` :
                                    `<input type="number" class="est-item-duration" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.duration || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','duration',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Rate</label>
                                    ${isApproved ? `<span style="font-size:12px;">₱${(item.rate || 0).toFixed(2)}</span>` :
                                    `<input type="number" class="est-item-rate" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.rate || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','rate',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Cost</label>
                                    <span class="cost-display">₱${cost.toFixed(2)}</span>
                                </div>
                                ${!isApproved ? `<div class="field"><button class="remove-btn" onclick="ProjectPage.removeEstimateItem(${gIdx},${idx},'${catKey}')">${Icon.close({size:13})}</button></div>` : ''}
                            `;
                } else if (cat === 'indirect') {
                    html += `
                                <div class="field"><label>Desc</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.desc || '—'}</span>` :
                                    `<input type="text" class="est-item-desc" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.desc || ''}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','desc',this.value)" />`}
                                </div>
                                <div class="field"><label>Type</label>
                                    ${isApproved ? `<span style="font-size:12px;">${item.type || '—'}</span>` :
                                    `<select class="est-item-type" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','type',this.value)">
                                        <option value="Contingency" ${item.type === 'Contingency' ? 'selected' : ''}>Contingency</option>
                                        <option value="VAT" ${item.type === 'VAT' ? 'selected' : ''}>VAT</option>
                                        <option value="Miscellaneous" ${item.type === 'Miscellaneous' ? 'selected' : ''}>Miscellaneous</option>
                                        <option value="Overhead" ${item.type === 'Overhead' ? 'selected' : ''}>Overhead</option>
                                        <option value="Other" ${item.type === 'Other' ? 'selected' : ''}>Other</option>
                                    </select>`}
                                </div>
                                <div class="field"><label>Amount</label>
                                    ${isApproved ? `<span style="font-size:12px;">₱${(item.amount || 0).toFixed(2)}</span>` :
                                    `<input type="number" class="est-item-amount" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.amount || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','amount',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Cost</label>
                                    <span class="cost-display">₱${cost.toFixed(2)}</span>
                                </div>
                                ${!isApproved ? `<div class="field"><button class="remove-btn" onclick="ProjectPage.removeEstimateItem(${gIdx},${idx},'${catKey}')">${Icon.close({size:13})}</button></div>` : ''}
                            `;
                }

                html += `</div>`;
            });
        }

        html += `
                    </div>
                    ${!isApproved ? `<div class="eg-add-btn"><button class="btn-sm" onclick="ProjectPage.addEstimateItem(${gIdx},'${catKey}')">+ Add</button></div>` : ''}
                </div>`;
        return html;
    },

    /**
     * addEstimateItem - Adds a new item to an estimate category
     */
    addEstimateItem(gIdx, cat) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) { UI.toast('Group not found.', 'error'); return; }
        const group = est.groups[gIdx];
        if (group.status === 'approved') { UI.toast('Cannot edit approved estimate.', 'error'); return; }
        const newItem = { id: 'est-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4) };
        if (cat === 'materials') { newItem.material = '';
            newItem.materialName = '';
            newItem.desc = '';
            newItem.qty = 0;
            newItem.rate = 0;
            newItem.cost = 0; } else if (cat === 'labor') { newItem.role = '';
            newItem.desc = '';
            newItem.qty = 0;
            newItem.duration = 0;
            newItem.rate = 0;
            newItem.cost = 0; } else if (cat === 'equipment') { newItem.equipment = '';
            newItem.equipName = '';
            newItem.desc = '';
            newItem.qty = 0;
            newItem.duration = 0;
            newItem.rate = 0;
            newItem.cost = 0; } else if (cat === 'indirect') { newItem.desc = '';
            newItem.type = 'Contingency';
            newItem.amount = 0; }
        group[cat].push(newItem);
        this.renderEstimates(this._data);
    },

    /**
     * removeEstimateItem - Removes an item from an estimate category
     */
    removeEstimateItem(gIdx, idx, cat) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) { UI.toast('Group not found.', 'error'); return; }
        const group = est.groups[gIdx];
        if (group.status === 'approved') { UI.toast('Cannot edit approved estimate.', 'error'); return; }
        if (group[cat] && group[cat].length > idx) {
            group[cat].splice(idx, 1);
            this.renderEstimates(this._data);
        }
    },

    /**
     * updateEstimateItem - Updates a field in an estimate item
     */
    updateEstimateItem(gIdx, idx, cat, field, value) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) return;
        const group = est.groups[gIdx];
        if (group.status === 'approved') return;
        const item = group[cat] && group[cat][idx];
        if (!item) return;
        item[field] = value;
        if (cat === 'materials') {
            item.cost = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
        } else if (cat === 'labor' || cat === 'equipment') {
            item.cost = (parseFloat(item.qty) || 0) * (parseFloat(item.duration) || 0) * (parseFloat(item.rate) || 0);
        } else if (cat === 'indirect') {
            item.amount = parseFloat(value) || 0;
            item.cost = item.amount;
        }
        this.renderEstimates(this._data);
    },

    /**
     * addSOWGroup - Adds a new SOW group to estimates
     */
    addSOWGroup() {
        const est = this._estimatesData;
        const p = this._data;
        if (!p || !p.sowItems) { UI.toast('No SOW items available.', 'error'); return; }
        const existingIds = est.groups.map(g => g.sowId);
        const available = p.sowItems.filter(s => !existingIds.includes(s.id));
        if (available.length === 0) {
            UI.toast('All SOW items already have estimate groups.', 'error');
            return;
        }
        const sow = available[0];
        est.groups.push({
            sowId: sow.id,
            sowDescription: sow.description || '—',
            status: 'draft',
            materials: [],
            labor: [],
            equipment: [],
            indirect: []
        });
        this.renderEstimates(this._data);
        UI.toast(`Added estimate group for ${sow.id}`, 'success');
    },

    /**
     * submitEstimateGroup - Submits an estimate group for approval
     */
    async submitEstimateGroup(gIdx) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) { UI.toast('Group not found.', 'error'); return; }
        const group = est.groups[gIdx];
        if (group.status === 'approved') { UI.toast('Already approved.', 'error'); return; }
        if (group.status === 'pending') { UI.toast('Already submitted for approval.', 'error'); return; }
        const hasData = (group.materials && group.materials.length > 0) ||
            (group.labor && group.labor.length > 0) ||
            (group.equipment && group.equipment.length > 0) ||
            (group.indirect && group.indirect.length > 0);
        if (!hasData) { UI.toast('Add at least one item before submitting.', 'error'); return; }
        const confirmed = await Confirm.open('Submit for Approval?',
            `Submit ${group.sowId} — ${group.sowDescription} for approval?`);
        if (!confirmed) return;
        try {
            await DataService.submitEstimatesForApproval(this._currentProjectId, group.sowId);
            group.status = 'pending';
            this.renderEstimates(this._data);
            UI.toast(`${group.sowId} submitted for approval.`, 'success');
            this._updateApprovalBadge();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * approveEstimateGroup - Approves an estimate group
     */
    async approveEstimateGroup(gIdx) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) { UI.toast('Group not found.', 'error'); return; }
        const group = est.groups[gIdx];
        if (group.status !== 'pending') { UI.toast('Only pending estimates can be approved.', 'error'); return; }
        const confirmed = await Confirm.open('Approve Estimate?',
            `Approve ${group.sowId} — ${group.sowDescription}? This will lock it from further edits.`);
        if (!confirmed) return;
        try {
            await DataService.approveEstimates(this._currentProjectId, group.sowId);
            group.status = 'approved';
            this.renderEstimates(this._data);
            UI.toast(`${group.sowId} approved and locked.`, 'success');
            this._updateApprovalBadge();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * saveAllEstimates - Saves all estimate data
     */
    async saveAllEstimates() {
        const est = this._estimatesData;
        if (!est) { UI.toast('No data to save.', 'error'); return; }
        try {
            await DataService.saveEstimates(this._currentProjectId, est.groups);
            UI.toast('All estimates saved!', 'success');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * _updateApprovalBadge - Updates the approval badge
     */
    _updateApprovalBadge() {
        const badge = document.getElementById('approvalBadgeHome');
        if (badge) {
            const pendingCount = DataService._pendingMaterials.length + DataService._pendingEquipment.length + 3;
            badge.textContent = pendingCount;
        }
    }
};
