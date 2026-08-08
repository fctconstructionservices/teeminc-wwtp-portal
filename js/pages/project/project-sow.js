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
                    <!-- v11 BATCH H5: a TITLE has to be declared, not guessed.
                         A heading is normally recognised from the ids beneath
                         it, but a title added before its children exist has
                         none — so it looked like a priced item, demanded an
                         estimate, and made the Timeline report "setup
                         incomplete" the moment it was created. -->
                    <div class="field"><label>What kind of item is this?</label>
                        <div class="sow-kind">
                            <label><input type="radio" name="sowkind" value="item" checked onchange="ProjectPage.toggleSowKind()" />
                                <span><b>Priced item</b><em>Has a quantity, a budget and an estimate.</em></span></label>
                            <label><input type="radio" name="sowkind" value="title" onchange="ProjectPage.toggleSowKind()" />
                                <span><b>Title / heading</b><em>Groups the items beneath it. No quantity, no estimate — its money is their total.</em></span></label>
                        </div>
                    </div>
                    <div class="field"><label>SOW ID *</label><input type="text" id="sow-id" placeholder="e.g. A.1, B.2" required />
                        <p class="pr-hint" id="sow-id-hint">Items nest by ID: <b>1.1</b> and <b>1.2</b> sit under <b>1</b>.</p></div>
                    <div class="field"><label>Description *</label><input type="text" id="sow-desc" placeholder="Description of work" required /></div>
                    <div class="field sow-priced-only"><label>Quantity *</label><input type="number" id="sow-qty" step="0.01" min="0" required /></div>
                    <div class="field sow-priced-only"><label>Unit *</label>
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

    /**
     * auditTitles (v11 BATCH H5) - For SOW items created before titles
     * could be declared. Those were given an estimate group like any
     * other item, so they still appear on the Estimates tab with a draft
     * nobody can approve.
     *
     * Read-only until you press the button. Groups holding priced lines
     * are NEVER removed automatically — an automated tidy-up that
     * deletes money is worse than the mess it was cleaning.
     */
    async auditTitles() {
        try {
            const rows = await DataService.auditSowTitles(this._currentProjectId);
            const e = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
            document.getElementById('titleAuditModal')?.remove();
            const empty = (rows || []).filter(r => r.safeToRemove);
            const priced = (rows || []).filter(r => !r.safeToRemove);

            const m = document.createElement('div');
            m.className = 'print-modal-overlay open';
            m.id = 'titleAuditModal';
            m.innerHTML = `
                <div class="print-modal-content" style="max-width:620px;">
                    <button class="close-modal" onclick="document.getElementById('titleAuditModal').remove()">${Icon.close({size:18})}</button>
                    <div class="print-header"><h2>Titles carrying an estimate</h2>
                        <div class="print-meta">A title groups the items beneath it — it has no estimate of its own</div></div>
                    ${!rows.length ? '<div class="empty"><p>Nothing to clean up. No title on this project carries an estimate group.</p></div>' : `
                    <table class="mini-table">
                        <thead><tr><th>SOW</th><th>Description</th><th style="text-align:right">Lines</th>
                            <th style="text-align:right">Value</th><th>Action</th></tr></thead>
                        <tbody>${rows.map(r => `<tr>
                            <td><b>${e(r.sowId)}</b></td>
                            <td>${e(r.description)}</td>
                            <td style="text-align:right">${r.lineCount}</td>
                            <td style="text-align:right">${r.value ? '₱' + fmtMoney(r.value) : '—'}</td>
                            <td>${r.safeToRemove
                                ? '<span style="color:var(--green)">Empty — safe to remove</span>'
                                : '<span style="color:var(--amber)">Move these lines first</span>'}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                    ${priced.length ? `<div class="pr-budget-box near" style="margin-top:12px;">
                        <b>${Icon.warning({size:12})} ${priced.length} title(s) have work priced against them</b>
                        <p>Those estimate lines belong on the items beneath the title. Move them on the
                        Estimates tab, then run this again. Nothing priced will be deleted for you.</p>
                    </div>` : ''}`}
                    <div class="print-actions">
                        ${empty.length ? `<button class="btn-primary" onclick="ProjectPage.cleanTitles()">
                            Remove ${empty.length} empty group${empty.length === 1 ? '' : 's'} and mark as titles</button>` : ''}
                        <button class="btn-ghost" onclick="document.getElementById('titleAuditModal').remove()">Close</button>
                    </div>
                </div>`;
            document.body.appendChild(m);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async cleanTitles() {
        const ok = await Confirm.open('Clean up?',
            'Empty estimate groups on titles will be removed and those items marked as titles. Anything with priced lines is left alone.');
        if (!ok) return;
        try {
            const res = await DataService.cleanSowTitleEstimates(this._currentProjectId);
            document.getElementById('titleAuditModal')?.remove();
            UI.toast(`${res.removed.length} title(s) cleaned up.` +
                (res.kept.length ? ` ${res.kept.length} left alone — they hold priced lines.` : ''), 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('sow');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * toggleSowKind (v11 BATCH H5) - A title has no quantity and no unit,
     * so those fields are hidden AND their `required` removed. Leaving
     * them required but hidden makes the form refuse to submit with
     * nothing visible to fix, which is the worst kind of dead end.
     */
    toggleSowKind() {
        const isTitle = document.querySelector('input[name="sowkind"]:checked')?.value === 'title';
        document.querySelectorAll('.sow-priced-only').forEach(el => {
            el.style.display = isTitle ? 'none' : '';
            el.querySelectorAll('input,select').forEach(f => {
                if (isTitle) { f.removeAttribute('required'); f.value = ''; }
                else f.setAttribute('required', 'required');
            });
        });
        const hint = document.getElementById('sow-id-hint');
        if (hint) {
            hint.innerHTML = isTitle
                ? 'Give it the shorter ID — <b>1</b> for a title, and its items become <b>1.1</b>, <b>1.2</b>.'
                : 'Items nest by ID: <b>1.1</b> and <b>1.2</b> sit under <b>1</b>.';
        }
    },

    async submitAddSOW(e) {
        e.preventDefault();
        const id = document.getElementById('sow-id').value.trim();
        const description = document.getElementById('sow-desc').value.trim();
        const qty = parseFloat(document.getElementById('sow-qty').value) || 0;
        const unit = document.getElementById('sow-unit').value;

        const isTitle = document.querySelector('input[name="sowkind"]:checked')?.value === 'title';

        if (!id || !description || (!isTitle && (!qty || !unit))) {
            UI.toast(isTitle
                ? 'A title needs an ID and a description.'
                : 'Please fill in all required fields.', 'error');
            return false;
        }

        const confirmed = await Confirm.open(isTitle ? 'Add title?' : 'Add SOW?',
            isTitle
                ? `Add "${id} — ${description}" as a title? It will group the items whose IDs start with ${id}. — and carries no estimate of its own.`
                : `Add SOW ${id} - ${description} (${qty} ${unit})?`);
        if (!confirmed) return false;

        const submitBtn = document.getElementById('addSOWSubmitBtn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Adding...';
        submitBtn.disabled = true;

        try {
            await DataService.addSOWItem(this._currentProjectId,
                isTitle
                    ? { id, description, qty: 0, unit: '', isTitle: true }
                    : { id, description, qty, unit });
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
    /**
     * toggleSowHeading (v11 BATCH H4) - Collapse state is per project and
     * lives only for the session. Persisting it would mean writing to the
     * sheet on every click, and the cost of re-expanding is one click.
     */
    toggleSowHeading(id) {
        this._sowCollapsed = this._sowCollapsed || {};
        this._sowCollapsed[id] = !this._sowCollapsed[id];
        this.renderSOWBudget(this._data);
    },

    /** collapseAllSow - all headings shut, for scanning a long BOQ. */
    collapseAllSow(shut) {
        this._sowCollapsed = {};
        if (shut) {
            (this._sowItems || []).forEach(s => { if (s.isHeading) this._sowCollapsed[s.id] = true; });
        }
        this.renderSOWBudget(this._data);
    },

    renderSOWBudget(p) {
        const container = document.getElementById('proj-tab-sow');
        const estimates = this._estimatesData || { groups: [] };
        const sowItems = this._sowItems || [];

        let html = `
            <div class="section-head">
                <h2>Scope of Work Budget Control</h2>
                <div class="rule"></div>
                ${(this._sowItems || []).some(s => s.isHeading) ? `
                    <button class="btn-sm" onclick="ProjectPage.collapseAllSow(false)">Expand all</button>
                    <button class="btn-sm" onclick="ProjectPage.collapseAllSow(true)">Collapse all</button>` : ''}
                ${(App.getUser() || {}).role === 'superadmin'
                    ? `<button class="btn-sm" title="Find titles that still carry an estimate group"
                        onclick="ProjectPage.auditTitles()">${Icon.search({size:12})} Check titles</button>` : ''}
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

        // ── v11 BATCH H4: SOW HIERARCHY ──
        // The tree is built on the SERVER (33-SowTree.gs) and arrives
        // already ordered depth-first, so this only has to render it.
        // Deriving the structure here as well is how two screens end up
        // disagreeing about which item sits under which.
        this._sowCollapsed = this._sowCollapsed || {};
        const collapsed = this._sowCollapsed;
        const hidden = item => {
            let p = item.parentId;
            const seen = {};
            while (p && !seen[p]) {
                if (collapsed[p]) return true;
                seen[p] = true;
                const par = sowItems.find(x => x.id === p);
                p = par ? par.parentId : '';
            }
            return false;
        };

        sowItems.forEach((item, idx) => {
            // Totals count EVERY row exactly once — a heading contributes
            // only its own budget, never its children's. This is what
            // keeps the project total identical to what it was before the
            // hierarchy existed.
            totalBudget += parseFloat(item.budget || 0);
            totalActual += parseFloat(item.actual || 0);

            if (hidden(item)) return;

            if (item.isHeading) {
                // A heading is a different KIND of row, not an indented
                // one: nothing to estimate, nothing to drag, and its
                // money is a roll-up of what sits beneath it.
                const rb = parseFloat(item.rollupBudget) || 0;
                const ra = parseFloat(item.rollupActual) || 0;
                const rv = rb - ra;
                const rp = item.rollupProgress;
                const own = parseFloat(item.budget) || 0;
                html += `
                <div class="sow-heading lvl-${item.level || 1}" style="padding-left:${((item.level || 1) - 1) * 18}px;">
                    <button class="sow-twist" title="${collapsed[item.id] ? 'Expand' : 'Collapse'}"
                        onclick="event.stopPropagation();ProjectPage.toggleSowHeading('${item.id}')">
                        ${collapsed[item.id] ? Icon.chevronRight({size:12}) : Icon.arrowDown({size:12})}
                    </button>
                    <span class="sh-id">${item.id}</span>
                    <span class="sh-desc">${item.description || ''}</span>
                    <span class="sh-count">${item.childCount} item${item.childCount === 1 ? '' : 's'}</span>
                    <span class="sh-nums">
                        <span><em>Budget</em><b>₱${fmtMoney(rb)}</b></span>
                        <span><em>Actual</em><b>₱${fmtMoney(ra)}</b></span>
                        <span class="${rv < 0 ? 'neg' : 'pos'}"><em>Variance</em><b>${rv < 0 ? '-' : '+'}₱${fmtMoney(Math.abs(rv))}</b></span>
                        <span><em>Progress</em><b>${rp == null ? '—' : rp.toFixed(0) + '%'}</b></span>
                    </span>
                    <span class="sh-rollup">roll-up${own > 0 ? ' · incl. ₱' + fmtMoney(own) + ' on this heading' : ''}</span>
                </div>`;
                return;
            }

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
                <div class="sow-item lvl-${item.level || 1}" data-estimate-status="${estimateStatus}"
                     style="margin-left:${((item.level || 1) - 1) * 18}px;"
                     onclick="ProjectPage.openSOWBreakdown('${item.id}')">
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
                            <button class="btn-sm" title="Edit SOW item" onclick="event.stopPropagation();ProjectPage.editSOW('${item.id}')">${Icon.pencil({size:12})}</button>
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

    // ─── EDIT SOW (v11 BATCH B) ─────────────────────────────────
    // This used to be renameSOW(): a single browser prompt() that could
    // only change the description. A typo in the SOW NUMBER meant
    // deleting the item and rebuilding its whole estimate by hand.
    // It is now the same modal as Add SOW, pre-filled, so every field
    // the item was created with can be corrected — including the id.
    // renameSOW is kept as an alias so any stale cached markup still
    // works.
    renameSOW(sowId) { return this.editSOW(sowId); },

    SOW_UNITS: ['pcs', 'kg', 'tons', 'm', 'sq.m', 'cu.m', 'liters', 'bags',
                'rolls', 'ea.', 'sets', 'lot', 'unit'],

    editSOW(sowId) {
        const item = (this._sowItems || this._data.sowItems || []).find(s => s.id === sowId);
        if (!item) { UI.toast('SOW item not found.', 'error'); return; }

        const existing = document.getElementById('editSOWModal');
        if (existing) existing.remove();

        // An estimate that is pending or approved is frozen by the
        // approval flow, so renaming its SOW id is blocked here rather
        // than failing halfway through the cascade on the server.
        // The status is NOT a field on the SOW item — it lives on the
        // estimate group, exactly as the SOW list derives it.
        const groups = (this._estimatesData && this._estimatesData.groups)
            || (this._data && this._data.estimates && this._data.estimates.groups)
            || [];
        const group = groups.find(g => g.sowId === sowId);
        const est = String((group && group.status) || 'draft').toLowerCase();
        const idLocked = est === 'pending' || est === 'approved';

        const esc = v => String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

        const unitOptions = this.SOW_UNITS.map(u =>
            `<option value="${u}" ${String(item.unit) === u ? 'selected' : ''}>${u}</option>`).join('');

        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'editSOWModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:500px;">
                <button class="close-modal" onclick="document.getElementById('editSOWModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>Edit SOW Item</h2>
                    <div class="print-meta">${esc(sowId)}</div></div>
                <form id="editSOWForm" onsubmit="return ProjectPage.submitEditSOW(event, '${esc(sowId)}')">
                    <div class="field">
                        <label>SOW ID *</label>
                        <input type="text" id="esow-id" value="${esc(item.id)}" ${idLocked ? 'disabled' : ''} required />
                        ${idLocked
                            ? `<p style="font-size:11px;color:var(--amber);margin-top:4px;">The ID is locked because this item's estimate is ${esc(est)}. Reject or return the estimate to draft first.</p>`
                            : `<p style="font-size:11px;color:var(--ink-soft);margin-top:4px;">Changing the ID relinks this item's estimate, cash advances, variations, punchlist, OT requests, predecessor links and daily-report progress.</p>`}
                    </div>
                    <div class="field"><label>Description *</label>
                        <input type="text" id="esow-desc" value="${esc(item.description)}" required /></div>
                    <div class="field"><label>Quantity *</label>
                        <input type="number" id="esow-qty" step="0.01" min="0" value="${parseFloat(item.qty) || 0}" required /></div>
                    <div class="field"><label>Unit *</label>
                        <select id="esow-unit" required>
                            <option value="">Select unit...</option>
                            ${unitOptions}
                        </select>
                    </div>
                    <div class="field"><label>Predecessors</label>
                        <input type="text" id="esow-pred" value="${esc(item.predecessors)}" placeholder="e.g. A.1, A.2 — comma separated" />
                        <p style="font-size:11px;color:var(--ink-soft);margin-top:4px;">Finish-to-start links. This item starts the day after the latest predecessor finishes.</p>
                    </div>
                    <div class="field" style="display:flex;align-items:center;gap:8px;">
                        <input type="checkbox" id="esow-milestone" ${item.isMilestone ? 'checked' : ''} style="width:auto;" />
                        <label for="esow-milestone" style="margin:0;">Milestone (zero duration, drawn as a diamond)</label>
                    </div>
                    <div class="submit-row">
                        <button type="submit" class="btn-primary" id="editSOWSubmitBtn">Save Changes</button>
                        <button type="button" class="btn-ghost" onclick="document.getElementById('editSOWModal').remove()">Cancel</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('esow-desc')?.focus(), 50);
    },

    async submitEditSOW(e, sowId) {
        e.preventDefault();
        const idEl = document.getElementById('esow-id');
        const newId = idEl.disabled ? sowId : idEl.value.trim();
        const description = document.getElementById('esow-desc').value.trim();
        const qty = parseFloat(document.getElementById('esow-qty').value) || 0;
        const unit = document.getElementById('esow-unit').value;
        const predecessors = document.getElementById('esow-pred').value.trim();
        const isMilestone = document.getElementById('esow-milestone').checked;

        if (!newId || !description || !qty || !unit) {
            UI.toast('Please fill in all required fields.', 'error');
            return false;
        }
        if (newId.indexOf(',') > -1) {
            UI.toast('A SOW ID cannot contain a comma — predecessor lists are comma separated.', 'error');
            return false;
        }

        const renaming = newId !== sowId;
        if (renaming) {
            const ok = await Confirm.open(`Rename ${sowId} to ${newId}?`,
                `Every reference to ${sowId} in this project will be updated: its estimate, cash advances, cash releases, variation orders, punchlist items, OT requests, predecessor links on other tasks, and the accomplishment rows in your daily site reports. Other projects are not touched.`);
            if (!ok) return false;
        }

        const btn = document.getElementById('editSOWSubmitBtn');
        const original = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        try {
            await DataService.updateSOWItem(this._currentProjectId, sowId, {
                newId: newId, description, qty, unit, predecessors, isMilestone
            });
            UI.toast(renaming ? `${sowId} renamed to ${newId}.` : `${newId} updated.`, 'success');
            document.getElementById('editSOWModal')?.remove();
            await this.open(this._currentProjectId, true);
            this.switchTab('sow');
        } catch (err) {
            UI.toast('' + err.message, 'error');
            btn.textContent = original;
            btn.disabled = false;
        }
        return false;
    },

    async deleteSOW(sowId) {
        const item = (this._sowItems || this._data.sowItems || []).find(s => s.id === sowId);
        // v11 BATCH B: the old text promised the estimate would be
        // "orphaned" — which is exactly the bug that was fixed. The
        // backend now removes the estimate group and every material,
        // labor, equipment and indirect line under it, so the warning
        // says what actually happens.
        const ok = await Confirm.open(`Delete ${sowId}?`,
            `"${item ? item.description : sowId}" will be removed from the SOW list and the schedule, together with its ENTIRE estimate — every material, labor, equipment and indirect line item under it. Cash advances and variation orders are kept but unlinked. Predecessor links to this item are cleared. This cannot be undone.`);
        if (!ok) return;
        try {
            const res = await DataService.deleteSOWItem(this._currentProjectId, sowId);
            const extra = res && res.lineItems
                ? ` (${res.lineItems} estimate line item${res.lineItems === 1 ? '' : 's'} removed)` : '';
            UI.toast(`${sowId} deleted.${extra}`, 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('sow');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
});
