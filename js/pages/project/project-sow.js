// ================================================================
//  pages/project/project-sow.js — Timeline (Gantt) + SOW Budget tabs
//
//  PURPOSE: Extends ProjectPage with the interactive Gantt chart
//  (drag-to-set dates persisted through updateSOWItem), the Add-SOW
//  modal, and the SOW Budget tab: per-item budget vs actual with
//  estimate status badges and the budget doughnut chart.
// ================================================================

Object.assign(ProjectPage, {

    // ─── GANTT ──────────────────────────────────────────────────
    // ─── GANTT ────────────────────────────────────────────────
    // v3: the Timeline tab was rebuilt as a full CPM Gantt and now
    // lives in project-gantt.js (renderGantt + helpers). It loads
    // after this file and attaches to the same ProjectPage object.

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
                    <div class="field"><label>Quantity *</label><input type="number" id="sow-qty" step="0.01" min="0" required /></div>
                    <div class="field"><label>Unit *</label>
                        <select id="sow-unit" required>
                            <option value="">Select unit...</option>
                            <option value="pcs">pcs</option>
                            <option value="kg">kg</option>
                            <option value="tons">tons</option>
                            <option value="m">m</option>
                            <option value="sq.m">sq.m</option>
                            <option value="cu.m">cu.m</option>
                            <option value="liters">liters</option>
                            <option value="bags">bags</option>
                            <option value="rolls">rolls</option>
                            <option value="ea.">ea.</option>
                            <option value="sets">sets</option>
                            <option value="lot">lot</option>
                            <option value="unit">unit</option>
                        </select>
                    </div>
                    <div class="submit-row">
                        <button type="submit" class="btn-primary" id="addSOWSubmitBtn">Add SOW</button>
                        <button type="button" class="btn-ghost" onclick="document.getElementById('addSOWModal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async submitAddSOW(e) {
        e.preventDefault();
        const id = document.getElementById('sow-id').value.trim();
        const description = document.getElementById('sow-desc').value.trim();
        const qty = parseFloat(document.getElementById('sow-qty').value) || 0;
        const unit = document.getElementById('sow-unit').value;

        if (!id || !description || !qty || !unit) {
            UI.toast('Please fill in all required fields.', 'error');
            return false;
        }

        const confirmed = await Confirm.open('Add SOW?', `Add SOW ${id} - ${description} (${qty} ${unit})?`);
        if (!confirmed) return false;

        const submitBtn = document.getElementById('addSOWSubmitBtn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Adding...';
        submitBtn.disabled = true;

        try {
            await DataService.addSOWItem(this._currentProjectId, { id, description, qty, unit });
            UI.toast(`SOW ${id} added! You can add another.`, 'success');
            // v3: NO full page reload. The modal stays open with cleared
            // fields for rapid batch entry, and the SOW tab refreshes in
            // the background — you never leave SOW Budget.
            document.getElementById('sow-id').value = '';
            document.getElementById('sow-desc').value = '';
            document.getElementById('sow-qty').value = '';
            document.getElementById('sow-unit').value = '';
            document.getElementById('sow-id').focus();
            this.refreshSOWData();   // fire-and-forget background refresh
        } catch (err) {
            UI.toast('Error: ' + err.message, 'error');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
        return false;
    },

    /**
     * refreshSOWData (v3) - Silently re-fetches project data and
     * re-renders ONLY the data-dependent tabs (SOW, Timeline,
     * Estimates) without navigating or showing the loading overlay.
     * The active tab is preserved.
     */
    async refreshSOWData() {
        try {
            const p = await DataService.getProjectData(this._currentProjectId);
            if (!p) return;
            this._sowItems = Array.isArray(p.sowItems) ? p.sowItems : [];
            p.sowItems = this._sowItems;
            this._data = p;
            this._estimatesData = p.estimates || {};
            this._estimatesData.groups = Array.isArray(this._estimatesData.groups) ? this._estimatesData.groups : [];
            this._sowItems.forEach(sow => {
                if (!this._estimatesData.groups.find(g => g.sowId === sow.id)) {
                    this._estimatesData.groups.push({
                        sowId: sow.id, sowDescription: sow.description || '',
                        status: 'draft', createdBy: '',
                        materials: [], labor: [], equipment: [], indirect: []
                    });
                }
            });
            this.renderSOWBudget(p);
            this.renderGantt(p);
            this.renderEstimates(p);
        } catch (err) {
            console.error('SOW refresh error:', err);
            UI.toast('Refresh failed: ' + err.message, 'error');
        }
    },

    /**
     * renderSOWBudget - Enhanced with full Estimates integration
     */
    renderSOWBudget(p) {
        const container = document.getElementById('proj-tab-sow');
        const estimates = this._estimatesData || { groups: [] };
        const sowItems = this._sowItems || [];

        let html = `
            <div class="section-head">
                <h2>Scope of Work Budget Control</h2>
                <div class="rule"></div>
                ${this._canEdit !== false ? `<button class="btn-primary" onclick="ProjectPage.showAddSOWModal()" style="padding:4px 14px;font-size:11px;margin-left:auto;">+ Add SOW</button>` : ''}
                <span class="badge">Click any SOW to see detailed breakdown</span>
            </div>
            
            <div class="sow-status-legend">
                <span class="legend-label">Estimate Status:</span>
                <span class="legend-item">
                    <span class="badge-sample draft">Draft</span>
                    = Not yet submitted
                </span>
                <span class="legend-item">
                    <span class="badge-sample pending">Pending</span>
                    = Awaiting approval
                </span>
                <span class="legend-item">
                    <span class="badge-sample approved">Approved</span>
                    = Official budget set
                </span>
            </div>
            
            <div class="panel"><div style="padding:6px 16px;">`;

        let totalBudget = 0,
            totalActual = 0,
            totalEstimate = 0;
        let pendingCount = 0,
            draftCount = 0,
            approvedCount = 0;

        if (sowItems.length === 0) {
            html += `<div class="empty"><p>No SOW items yet. Click "+ Add SOW" to create one.</p></div>`;
        }

        sowItems.forEach((item, idx) => {
            totalBudget += parseFloat(item.budget || 0);
            totalActual += parseFloat(item.actual || 0);

            const group = (estimates.groups || []).find(g => g.sowId === item.id);
            let itemEstimate = 0;
            let estimateStatus = 'draft';
            let estimateCreatedBy = '';
            
            if (group) {
                const matSum = (group.materials || []).reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
                const eqSum = (group.equipment || []).reduce((s, e) => s + (parseFloat(e.cost) || 0), 0);
                const labSum = (group.labor || []).reduce((s, l) => s + (parseFloat(l.cost) || 0), 0);
                const indSum = (group.indirect || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
                itemEstimate = matSum + eqSum + labSum + indSum;
                estimateStatus = group.status || 'draft';
                estimateCreatedBy = group.createdBy || '';
            }
            totalEstimate += itemEstimate;

            if (estimateStatus === 'pending') pendingCount++;
            else if (estimateStatus === 'approved') approvedCount++;
            else draftCount++;

            const budget = parseFloat(item.budget || 0);
            const actual = parseFloat(item.actual || 0);
            const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
            const barClass = pct > 90 ? 'danger' : pct > 70 ? 'warn' : '';
            const barColor = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--green)';

            let statusIcon = '';
            let statusClass = estimateStatus;
            let statusLabel = estimateStatus.charAt(0).toUpperCase() + estimateStatus.slice(1);
            
            if (estimateStatus === 'approved') {
                statusIcon = Icon.checkCircle({size:12});
                statusClass = 'approved';
            } else if (estimateStatus === 'pending') {
                statusIcon = Icon.hourglass({size:12});
                statusClass = 'pending';
            } else {
                statusIcon = Icon.fileText({size:12});
                statusClass = 'draft';
            }

            // v3: label follows the item's budgetMode
            const mode = item.budgetMode || 'auto';
            const budgetSourceLabel =
                mode === 'manual'   ? Icon.pencil({size:11}) + ' <span class="budget-source">manual</span>' :
                mode === 'indirect' ? '<span class="budget-source">${Icon.receipt({size:12})} indirect costs only</span>' :
                '<span class="budget-source">Σ mat + labor + equipment</span>';

            const variance = budget - actual;
            const varianceClass = variance >= 0 ? 'positive' : 'negative';
            const varianceLabel = variance >= 0 ? `+₱${fmtMoney(variance)}` : `-₱${fmtMoney(Math.abs(variance))}`;

            let estimateNote = '';
            if (estimateStatus === 'pending') {
                estimateNote = Icon.hourglass({size:11}) + ' awaiting approval';
            } else if (estimateStatus === 'draft') {
                estimateNote = Icon.fileText({size:11}) + ' draft \u2014 not yet approved';
            } else if (estimateStatus === 'approved') {
                estimateNote = Icon.checkCircle({size:11}) + ' approved estimate';
            }

            html += `
                <div class="sow-item" data-estimate-status="${estimateStatus}" onclick="ProjectPage.openSOWBreakdown('${item.id}')">
                    <div class="sow-header">
                        <div class="sow-desc">
                            <strong>${item.id}</strong> — ${item.description || '—'}
                            <span class="sow-qty">(${item.qty || 0} ${item.unit || 'unit'})</span>
                        </div>
                        <div class="sow-status-badge ${statusClass}">
                            ${statusIcon} ${statusLabel}
                            ${estimateStatus === 'approved' ? `<span class="sow-status-date">• approved</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="sow-numbers">
                        <div class="sow-number-group estimate">
                            <span class="sn-label">Estimate</span>
                            <span class="sn-value">₱${fmtMoney(itemEstimate)}</span>
                            <span class="budget-source" style="font-size:8px;color:${estimateStatus === 'approved' ? 'var(--green)' : 'var(--ink-soft)'};">${estimateNote}</span>
                        </div>
                        
                        <div class="sow-number-group budget">
                            <span class="sn-label">Budget
                                <button class="btn-sm" style="padding:0 5px;font-size:9px;margin-left:4px;" title="Edit how this budget is computed"
                                    onclick="event.stopPropagation();ProjectPage.editSOWBudget('${item.id}')">${Icon.pencil({size:12})}</button>
                            </span>
                            <span class="sn-value">₱${fmtMoney(budget)}</span>
                            ${budgetSourceLabel}
                        </div>
                        
                        <div class="sow-number-group actual">
                            <span class="sn-label">Actual</span>
                            <span class="sn-value">₱${fmtMoney(actual)}</span>
                            <span class="actual-status">${pct.toFixed(1)}% used</span>
                        </div>
                        
                        <div class="sow-number-group variance ${varianceClass}">
                            <span class="sn-label">Variance</span>
                            <span class="sn-value">${varianceLabel}</span>
                        </div>

                        <div class="sow-number-group">
                            <span class="sn-label">Progress</span>
                            <span class="sn-value">${(item.progress || 0).toFixed(0)}%</span>
                            <span class="budget-source">from daily reports</span>
                        </div>
                    </div>
                    
                    <div class="sow-progress">
                        <div class="sow-bar">
                            <div class="fill" style="width:${Math.min(pct, 100)}%;background:${barColor};"></div>
                        </div>
                        <span style="font-size:10px;color:var(--ink-soft);min-width:60px;text-align:right;font-family:'IBM Plex Mono',monospace;">${pct.toFixed(0)}%</span>
                    </div>
                    
                    <div class="sow-actions">
                        ${estimateStatus === 'draft' ?
                            `<button class="btn-sm" onclick="event.stopPropagation();ProjectPage.switchTab('estimates')">
                                ${Icon.ruler({size:12})} Edit Estimate
                            </button>` : ''
                        }
                        <button class="btn-sm" onclick="event.stopPropagation();ProjectPage.openSOWBreakdown('${item.id}')">
                            ${Icon.search({size:12})} Breakdown
                        </button>
                        ${estimateStatus === 'pending' && App.isApprover() ? 
                            `<button class="btn-sm success" onclick="event.stopPropagation();ProjectPage.switchTab('estimates')">
                                ${Icon.hourglass({size:12})} Review
                            </button>` : ''
                        }
                        ${(App.getUser() || {}).role === 'superadmin' ? `
                        <span style="margin-left:auto;display:inline-flex;gap:4px;" title="Super Admin controls">
                            <button class="btn-sm" title="Move up" ${idx === 0 ? 'disabled style="opacity:.35;"' : ''} onclick="event.stopPropagation();ProjectPage.moveSOW('${item.id}','up')">${Icon.arrowUp({size:12})}</button>
                            <button class="btn-sm" title="Move down" ${idx === sowItems.length - 1 ? 'disabled style="opacity:.35;"' : ''} onclick="event.stopPropagation();ProjectPage.moveSOW('${item.id}','down')">${Icon.arrowDown({size:12})}</button>
                            <button class="btn-sm" title="Edit name" onclick="event.stopPropagation();ProjectPage.renameSOW('${item.id}')">${Icon.pencil({size:12})}</button>
                            <button class="btn-sm danger" title="Delete SOW" onclick="event.stopPropagation();ProjectPage.deleteSOW('${item.id}')">${Icon.trash({size:12})}</button>
                        </span>` : ''}
                    </div>
                </div>`;
        });

        const allApproved = approvedCount === sowItems.length && sowItems.length > 0;
        const hasPending = pendingCount > 0;

        html += `
                <div class="sow-status-summary">
                    <span class="summary-label">Estimate Status:</span>
                    <span class="summary-item">
                        <span class="count approved">${approvedCount}</span> Approved
                    </span>
                    <span class="summary-item">
                        <span class="count pending">${pendingCount}</span> Pending
                    </span>
                    <span class="summary-item">
                        <span class="count draft">${draftCount}</span> Draft
                    </span>
                    ${hasPending ? 
                        `<span class="summary-alert pending">${Icon.hourglass({size:12})} ${pendingCount} SOW(s) have pending estimates — review them!</span>` : 
                        allApproved ?
                        `<span class="summary-alert success">${Icon.checkCircle({size:12})} All ${sowItems.length} SOW(s) have approved estimates!</span>` :
                        sowItems.length > 0 ?
                        `<span class="summary-alert info">${sowItems.length - approvedCount} SOW(s) need estimate approval</span>` :
                        `<span class="summary-alert info">No SOW items created yet</span>`
                    }
                </div>
            </div></div>
            
            <div class="section-head"><h2>Budget vs Actual per SOW</h2><div class="rule"></div></div>
            <div class="chart-grid full">
                <div class="chart-card"><div class="cc-head"><h3>SOW Cashflow</h3><span class="cc-note">budget vs actual</span></div><div class="canvas-wrap"><canvas id="sowChart"></canvas></div></div>
            </div>`;

        container.innerHTML = html;
        setTimeout(() => this._buildSOWChart(p), 100);
    },

    /**
     * openSOWBreakdown (v3 FIX) - The modal's fallback path filters
     * flat arrays by a `.sow` property the items never had, so the
     * breakdown always rendered empty. Passing { groups } routes the
     * modal through its groups path, which matches by sowId correctly.
     */
    openSOWBreakdown(sowId) {
        const estimates = this._estimatesData || { groups: [] };
        const group = (estimates.groups || []).find(g => g.sowId === sowId);
        if (!group) { UI.toast('No estimate data for this SOW.', 'error'); return; }
        SOWBreakdownModal.open(sowId, { groups: estimates.groups });
    },

    /**
     * editSOWBudget (v3) - Small modal to choose how the SOW budget
     * is derived: auto (mat+labor+equipment), indirect only, or a
     * manual amount.
     */
    editSOWBudget(sowId) {
        const item = (this._sowItems || []).find(s => s.id === sowId);
        if (!item) { UI.toast('SOW item not found.', 'error'); return; }
        const existing = document.getElementById('sowBudgetModal');
        if (existing) existing.remove();

        const mode = item.budgetMode || 'auto';
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'sowBudgetModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:440px;">
                <button class="close-modal" onclick="document.getElementById('sowBudgetModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>${sowId} — Budget Setting</h2></div>
                <div class="field">
                    <label>Budget Source</label>
                    <select id="sow-budget-mode" onchange="document.getElementById('sowManualWrap').style.display = this.value==='manual' ? 'block' : 'none'">
                        <option value="auto" ${mode==='auto'?'selected':''}>Auto — Materials + Labor + Equipment (from estimate)</option>
                        <option value="indirect" ${mode==='indirect'?'selected':''}>Indirect costs only (from estimate)</option>
                        <option value="manual" ${mode==='manual'?'selected':''}>Manual amount</option>
                    </select>
                </div>
                <div class="field" id="sowManualWrap" style="display:${mode==='manual'?'block':'none'};">
                    <label>Manual Budget (₱)</label>
                    <input type="number" id="sow-budget-manual" step="0.01" min="0" value="${fmtMoney((item.budget||0))}" />
                </div>
                <p style="font-size:11px;color:var(--ink-soft);">Auto and Indirect recompute live from the estimate; approving an estimate also writes back using this setting. Manual is never overwritten.</p>
                <div class="submit-row">
                    <button class="btn-primary" onclick="ProjectPage.submitSOWBudget('${sowId}')">Save</button>
                    <button class="btn-ghost" onclick="document.getElementById('sowBudgetModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    async submitSOWBudget(sowId) {
        const mode = document.getElementById('sow-budget-mode').value;
        const manual = parseFloat(document.getElementById('sow-budget-manual').value) || 0;
        try {
            const result = await DataService.updateSOWBudget(this._currentProjectId, sowId, mode, manual);
            UI.toast(`Budget for ${sowId} set to ₱${fmtMoney((result.budget||0))} (${mode}).`, 'success');
            document.getElementById('sowBudgetModal').remove();
            this.refreshSOWData();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    _buildSOWChart(p) {
        if (this._charts.sow) this._charts.sow.destroy();
        try {
            if (typeof Chart === 'undefined') return;
            const ctx = document.getElementById('sowChart');
            if (!ctx) return;
            const sowItems = this._sowItems || [];
            const labels = sowItems.map(i => i.id);
            const budget = sowItems.map(i => parseFloat(i.budget || 0));
            const actual = sowItems.map(i => parseFloat(i.actual || 0));
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
                        tooltip: { callbacks: { label: c => `${c.dataset.label}: ₱${fmtMoney(c.parsed.y)}` } }
                    },
                    scales: {
                        y: { ticks: { callback: fmtAxisMoney }, grid: { color: '#EEEBE0' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        } catch (err) { console.error('SOW chart error:', err); }
    },

});
// ════════ v8: SUPER ADMIN SOW CONTROLS ════════
// Rename / reorder / delete SOW items straight from the SOW Budget
// tab. Server-side these are Super Admin-gated too (moveSOWItem is
// requireSuperAdmin_; delete/update go through updateSOWItem's
// existing role checks) — the UI gating here is convenience only.

Object.assign(ProjectPage, {

    async moveSOW(sowId, direction) {
        try {
            await DataService.moveSOWItem(this._currentProjectId, sowId, direction);
            await this.open(this._currentProjectId, true);
            this.switchTab('sow');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async renameSOW(sowId) {
        const item = (this._data.sowItems || []).find(s => s.id === sowId);
        if (!item) return;
        const current = item.description || '';
        const name = prompt(`New name for ${sowId}:`, current);
        if (name === null) return;                       // cancelled
        const trimmed = name.trim();
        if (!trimmed || trimmed === current) return;
        try {
            await DataService.updateSOWItem(this._currentProjectId, sowId, { description: trimmed });
            UI.toast(`${sowId} renamed.`, 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('sow');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async deleteSOW(sowId) {
        const item = (this._data.sowItems || []).find(s => s.id === sowId);
        const ok = await Confirm.open(`Delete ${sowId}?`,
            `"${item ? item.description : sowId}" will be removed from the SOW list, together with its schedule bar. Its estimate group (if any) will be orphaned. This cannot be undone.`);
        if (!ok) return;
        try {
            await DataService.deleteSOWItem(this._currentProjectId, sowId);
            UI.toast(`${sowId} deleted.`, 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('sow');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
});
