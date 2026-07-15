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
    renderGantt(p) {
        const container = document.getElementById('proj-tab-gantt');
        container.innerHTML = `
            <div class="section-head">
                <h2>Project Timeline (Gantt Chart)</h2>
                <div class="rule"></div>
                <span class="badge">Drag bars to move · Drag edges to resize</span>
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
        this._ganttData = this._sowItems;
        setTimeout(() => this._renderGanttChart(p), 100);
    },

    _renderGanttChart(p) {
        const items = this._sowItems || [];
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

    // ─── SOW BUDGET ──────────────────────────────────────────────
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
            UI.toast('SOW added successfully!', 'success');
            document.getElementById('addSOWModal').remove();
            await this.open(this._currentProjectId);
        } catch (err) {
            UI.toast('Error: ' + err.message, 'error');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
        return false;
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
                <button class="btn-primary" onclick="ProjectPage.showAddSOWModal()" style="padding:4px 14px;font-size:11px;margin-left:auto;">+ Add SOW</button>
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

        sowItems.forEach(item => {
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
                statusIcon = '✅';
                statusClass = 'approved';
            } else if (estimateStatus === 'pending') {
                statusIcon = '⏳';
                statusClass = 'pending';
            } else {
                statusIcon = '📄';
                statusClass = 'draft';
            }

            const isBudgetFromEstimate = estimateStatus === 'approved' && Math.abs(budget - itemEstimate) < 0.01;
            const budgetSourceLabel = isBudgetFromEstimate ? 
                '<span class="budget-source">✅ from approved estimate</span>' : 
                (estimateStatus === 'approved' ? 
                    '<span class="budget-source">⚠️ manually adjusted</span>' : 
                    '<span class="budget-source">📄 pending approval</span>');

            const variance = budget - actual;
            const varianceClass = variance >= 0 ? 'positive' : 'negative';
            const varianceLabel = variance >= 0 ? `+₱${variance.toFixed(2)}` : `-₱${Math.abs(variance).toFixed(2)}`;

            let estimateNote = '';
            if (estimateStatus === 'pending') {
                estimateNote = '⏳ awaiting approval';
            } else if (estimateStatus === 'draft') {
                estimateNote = '📄 draft — not yet approved';
            } else if (estimateStatus === 'approved') {
                estimateNote = '✅ approved estimate';
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
                            <span class="sn-value">₱${itemEstimate.toFixed(2)}</span>
                            <span class="budget-source" style="font-size:8px;color:${estimateStatus === 'approved' ? 'var(--green)' : 'var(--ink-soft)'};">${estimateNote}</span>
                        </div>
                        
                        <div class="sow-number-group budget">
                            <span class="sn-label">Budget</span>
                            <span class="sn-value">₱${budget.toFixed(2)}</span>
                            ${budgetSourceLabel}
                        </div>
                        
                        <div class="sow-number-group actual">
                            <span class="sn-label">Actual</span>
                            <span class="sn-value">₱${actual.toFixed(2)}</span>
                            <span class="actual-status">${pct.toFixed(1)}% used</span>
                        </div>
                        
                        <div class="sow-number-group variance ${varianceClass}">
                            <span class="sn-label">Variance</span>
                            <span class="sn-value">${varianceLabel}</span>
                        </div>
                    </div>
                    
                    <div class="sow-progress">
                        <div class="sow-bar">
                            <div class="fill" style="width:${Math.min(pct, 100)}%;background:${barColor};"></div>
                        </div>
                        <span style="font-size:10px;color:var(--ink-soft);min-width:60px;text-align:right;font-family:'IBM Plex Mono',monospace;">${pct.toFixed(0)}%</span>
                    </div>
                    
                    <div class="sow-actions">
                        <button class="btn-sm" onclick="event.stopPropagation();ProjectPage.switchTab('estimates')">
                            ${Icon.ruler({size:12})} Edit Estimate
                        </button>
                        <button class="btn-sm" onclick="event.stopPropagation();ProjectPage.openSOWBreakdown('${item.id}')">
                            ${Icon.search({size:12})} Breakdown
                        </button>
                        ${estimateStatus === 'pending' && App.isApprover() ? 
                            `<button class="btn-sm success" onclick="event.stopPropagation();ProjectPage.switchTab('estimates')">
                                ⏳ Review
                            </button>` : ''
                        }
                        ${estimateStatus === 'draft' ? 
                            `<button class="btn-sm amber" onclick="event.stopPropagation();ProjectPage.switchTab('estimates')">
                                📝 Complete
                            </button>` : ''
                        }
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
                        `<span class="summary-alert pending">⏳ ${pendingCount} SOW(s) have pending estimates — review them!</span>` : 
                        allApproved ?
                        `<span class="summary-alert success">✅ All ${sowItems.length} SOW(s) have approved estimates!</span>` :
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

    openSOWBreakdown(sowId) {
        const estimates = this._estimatesData || { groups: [] };
        const group = (estimates.groups || []).find(g => g.sowId === sowId);
        if (!group) { UI.toast('No estimate data for this SOW.', 'error'); return; }
        const data = {
            materials: group.materials || [],
            equipment: group.equipment || [],
            labor: group.labor || [],
            indirect: group.indirect || []
        };
        SOWBreakdownModal.open(sowId, data);
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

});
