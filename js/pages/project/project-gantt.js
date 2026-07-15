// ================================================================
//  pages/project/project-gantt.js — MS Project-style Timeline (v3)
//
//  PURPOSE: Full-featured Gantt for the Timeline tab. Replaces the
//  old drag-only chart. Features, modeled on MS Project:
//
//    · CPM scheduling — forward/backward pass over Finish-to-Start
//      predecessor links; critical tasks (zero float) outlined red
//    · Dependency links drawn as SVG connectors; edited per task
//    · Progress fill per bar, driven by Daily Site Report % complete
//      (scope dropdown === SOW id); budget-weighted project total
//    · Late tracking — Complete / Overdue / Behind Schedule /
//      On Track, comparing planned % (elapsed/duration) vs actual %
//    · Milestones — zero-duration diamonds
//    · Today line and baseline ghost bars (Save Baseline snapshot)
//    · Resource panel per task from its estimate (manpower /
//      equipment / materials), with a jump to the Estimates editor
//    · Drag to move, drag edges to resize — now PERSISTED through
//      updateSOWItem (the old chart only showed a "simulated" toast)
//
//  Attached to ProjectPage via Object.assign; must load AFTER
//  project-sow.js and BEFORE init.js.
// ================================================================

Object.assign(ProjectPage, {

    _ganttMeta: null,   // computed schedule kept for event handlers

    // ─── date helpers (all math in whole days, local time) ───────
    _gDay(dateStr) { const d = new Date(dateStr + 'T00:00:00'); return isNaN(d) ? null : d; },
    _gDiffDays(a, b) { return Math.round((b - a) / 86400000); },
    _gAddDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
    _gFmt(d) { return d.toISOString().split('T')[0]; },

    renderGantt(p) {
        const container = document.getElementById('proj-tab-gantt');
        const total = (p && typeof p.totalProgress === 'number') ? p.totalProgress : 0;
        container.innerHTML = `
            <div class="section-head">
                <h2>Project Timeline (Gantt Chart)</h2>
                <div class="rule"></div>
                <span class="badge">Total: ${total.toFixed(1)}% complete (budget-weighted)</span>
                <button class="btn-sm" style="margin-left:8px;" title="Snapshot current dates as the baseline"
                    onclick="ProjectPage.saveGanttBaseline()">📌 Save Baseline</button>
            </div>
            <div class="gantt-wrapper" id="ganttWrapper">
                <div class="gantt-container" id="ganttContainer" style="position:relative;">
                    <div class="gantt-timeline" id="ganttTimeline"></div>
                    <div class="gantt-body" id="ganttBody" style="position:relative;"></div>
                    <svg id="ganttLinks" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;"></svg>
                </div>
            </div>
            <div class="gantt-legend">
                <span><span class="dot" style="background:var(--green);"></span> On Track</span>
                <span><span class="dot" style="background:var(--amber);"></span> Behind Schedule</span>
                <span><span class="dot" style="background:var(--red);"></span> Overdue</span>
                <span><span class="dot" style="background:var(--blueprint,#24455A);"></span> Complete</span>
                <span><span class="dot" style="border:2px solid var(--red);background:transparent;"></span> Critical Path</span>
                <span>◆ Milestone</span>
                <span style="color:var(--ink-soft);font-size:11px;">Drag to move · edges to resize · click for details, links &amp; resources</span>
            </div>
            <div class="gantt-tooltip" id="ganttTooltip"></div>`;
        this._ganttData = this._sowItems;
        setTimeout(() => this._renderGanttChart(p), 100);
    },

    /**
     * _computeCPM - Critical Path Method over Finish-to-Start links.
     *
     * Durations come from each task's own dates (min 1 day; 0 for
     * milestones). Tasks WITHOUT predecessors are anchored on their
     * own startDate (like manually scheduled MS Project tasks);
     * tasks WITH predecessors start the day after their latest
     * predecessor finishes, unless their own date is later.
     * Float = LS - ES; float 0 (on the longest chain) = critical.
     */
    _computeCPM(items) {
        const byId = {};
        items.forEach(it => { byId[it.id] = it; });

        const tasks = items.map(it => {
            const s = this._gDay(it.startDate);
            const e = this._gDay(it.endDate);
            const isMs = !!it.isMilestone;
            const dur = (s && e) ? Math.max(isMs ? 0 : 1, this._gDiffDays(s, e) + (isMs ? 0 : 1)) : (isMs ? 0 : 1);
            const preds = String(it.predecessors || '').split(',')
                .map(x => x.trim()).filter(x => x && byId[x] && x !== it.id);
            return { id: it.id, item: it, start: s, dur, preds, ES: 0, EF: 0, LS: 0, LF: 0, float: 0, critical: false };
        });
        const tById = {};
        tasks.forEach(t => { tById[t.id] = t; });

        // anchor = earliest task start (fallback today)
        const anchored = tasks.filter(t => t.start);
        const origin = anchored.length
            ? new Date(Math.min(...anchored.map(t => t.start.getTime())))
            : new Date();

        // Forward pass (topological via repeated relaxation — safe for
        // small task counts and tolerant of accidental cycles)
        tasks.forEach(t => {
            t.ES = t.start ? this._gDiffDays(origin, t.start) : 0;
            t.EF = t.ES + Math.max(t.dur - 1, 0);
        });
        for (let pass = 0; pass < tasks.length + 1; pass++) {
            let changed = false;
            tasks.forEach(t => {
                if (!t.preds.length) return;
                const predEF = Math.max(...t.preds.map(pid => tById[pid].EF));
                const es = Math.max(predEF + 1, t.start ? this._gDiffDays(origin, t.start) : 0);
                if (es !== t.ES) { t.ES = es; t.EF = es + Math.max(t.dur - 1, 0); changed = true; }
            });
            if (!changed) break;
        }

        // Backward pass
        const projectEF = Math.max(...tasks.map(t => t.EF), 0);
        tasks.forEach(t => { t.LF = projectEF; t.LS = t.LF - Math.max(t.dur - 1, 0); });
        for (let pass = 0; pass < tasks.length + 1; pass++) {
            let changed = false;
            tasks.forEach(t => {
                const succs = tasks.filter(s => s.preds.includes(t.id));
                if (!succs.length) return;
                const lf = Math.min(...succs.map(s => s.LS)) - 1;
                if (lf !== t.LF) { t.LF = lf; t.LS = lf - Math.max(t.dur - 1, 0); changed = true; }
            });
            if (!changed) break;
        }
        tasks.forEach(t => {
            t.float = t.LS - t.ES;
            t.critical = t.float <= 0;
        });
        return { tasks, tById, origin, projectEF };
    },

    /**
     * _taskHealth - MS Project-style status for a task.
     *   Complete -> 100%
     *   Overdue  -> past end date, not complete
     *   Behind   -> planned % (elapsed days / duration) exceeds actual
     *   On Track -> otherwise
     */
    _taskHealth(item) {
        const progress = parseFloat(item.progress) || 0;
        if (progress >= 100) return { label: 'Complete', color: 'var(--blueprint, #24455A)', cls: 'complete' };
        const s = this._gDay(item.startDate), e = this._gDay(item.endDate);
        if (!s || !e) return { label: 'No dates', color: 'var(--ink-soft)', cls: '' };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (today > e) return { label: 'Overdue', color: 'var(--red)', cls: 'danger' };
        const durDays = Math.max(this._gDiffDays(s, e) + 1, 1);
        const elapsed = Math.min(Math.max(this._gDiffDays(s, today) + 1, 0), durDays);
        const planned = (elapsed / durDays) * 100;
        if (planned > progress + 5) return { label: 'Behind Schedule', color: 'var(--amber)', cls: 'warn' };
        return { label: 'On Track', color: 'var(--green)', cls: '' };
    },

    _renderGanttChart(p) {
        const items = this._sowItems || [];
        const body = document.getElementById('ganttBody');
        if (!body) return;
        if (!items.length) {
            body.innerHTML = `<div class="empty"><p>No SOW items yet. Add them in the SOW Budget tab.</p></div>`;
            return;
        }

        const cpm = this._computeCPM(items);
        this._ganttMeta = cpm;

        // chart window: union of item dates and baselines, padded
        const dates = [];
        items.forEach(it => {
            [it.startDate, it.endDate, it.baselineStart, it.baselineEnd].forEach(d => {
                const x = this._gDay(d);
                if (x) dates.push(x);
            });
        });
        const today = new Date(); today.setHours(0, 0, 0, 0);
        dates.push(today);
        const minDate = this._gAddDays(new Date(Math.min(...dates.map(d => d.getTime()))), -2);
        const maxDate = this._gAddDays(new Date(Math.max(...dates.map(d => d.getTime()))), 2);
        const totalDays = Math.max(this._gDiffDays(minDate, maxDate), 1);
        this._ganttMeta.minDate = minDate;
        this._ganttMeta.totalDays = totalDays;

        // header timeline
        const LABEL_W = 220;
        let tlHtml = `<div style="width:${LABEL_W}px;flex-shrink:0;font-size:9px;font-weight:600;color:var(--ink-soft);">SOW Item</div>`;
        for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
            const isToday = d.getTime() === today.getTime();
            tlHtml += `<div class="gt-day" style="${isToday ? 'color:var(--red);font-weight:700;' : ''}">${d.getDate()}/${d.getMonth() + 1}</div>`;
        }
        document.getElementById('ganttTimeline').innerHTML = tlHtml;

        const todayPct = (this._gDiffDays(minDate, today) / totalDays) * 100;

        let bodyHtml = '';
        items.forEach((item, idx) => {
            const t = cpm.tById[item.id];
            const health = this._taskHealth(item);
            const critCls = t && t.critical ? 'gantt-critical' : '';
            const label = `${item.id} — ${item.description || ''}`;

            let trackInner = '';
            const s = this._gDay(item.startDate), e = this._gDay(item.endDate);

            // baseline ghost bar
            const bs = this._gDay(item.baselineStart), be = this._gDay(item.baselineEnd);
            if (bs && be) {
                const bl = (this._gDiffDays(minDate, bs) / totalDays) * 100;
                const bw = ((this._gDiffDays(bs, be) + 1) / totalDays) * 100;
                trackInner += `<div class="gantt-baseline" style="left:${Math.max(0, bl)}%;width:${Math.max(1, bw)}%;" title="Baseline: ${item.baselineStart} → ${item.baselineEnd}"></div>`;
            }

            if (!s || !e) {
                trackInner += `<span style="font-size:10px;color:var(--ink-soft);padding-left:10px;">No dates</span>`;
            } else if (item.isMilestone) {
                const left = (this._gDiffDays(minDate, s) / totalDays) * 100;
                trackInner += `
                    <div class="gantt-milestone ${critCls}" data-idx="${idx}" style="left:${left}%;"
                        title="${label} — ${item.startDate}">◆</div>`;
            } else {
                const startOffset = this._gDiffDays(minDate, s);
                const duration = this._gDiffDays(s, e) + 1;
                const leftPct = (startOffset / totalDays) * 100;
                const widthPct = (duration / totalDays) * 100;
                const progress = Math.min(Math.max(parseFloat(item.progress) || 0, 0), 100);
                trackInner += `
                    <div class="gantt-bar ${critCls}" style="left:${Math.max(0, leftPct)}%;width:${Math.max(2, widthPct)}%;background:${health.color};"
                        data-idx="${idx}" data-start="${item.startDate}" data-end="${item.endDate}">
                        <div class="gantt-progress-fill" style="width:${progress}%;"></div>
                        <span class="gantt-bar-label">${item.id} · ${progress.toFixed(0)}%</span>
                        <div class="resize-handle left" data-action="resize-left">◀</div>
                        <div class="resize-handle right" data-action="resize-right">▶</div>
                    </div>`;
            }

            bodyHtml += `
                <div class="gantt-row" data-idx="${idx}" data-taskid="${item.id}">
                    <div class="gantt-row-label" style="width:${LABEL_W}px;flex-shrink:0;" title="${label}${t ? ' · float: ' + t.float + 'd' : ''}">
                        <span class="gantt-label-text">${label}</span>
                        <span class="gantt-label-sub">${health.label}${t && t.critical ? ' · CRITICAL' : t ? ' · float ' + t.float + 'd' : ''}</span>
                    </div>
                    <div class="gantt-row-track">${trackInner}</div>
                </div>`;
        });
        body.innerHTML = bodyHtml + `<div class="gantt-today-line" style="left:calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${todayPct / 100});" title="Today"></div>`;

        this._drawGanttLinks(items, cpm, LABEL_W);
        this._attachGanttEvents(minDate, totalDays, items);
    },

    /**
     * _drawGanttLinks - SVG connectors, predecessor end -> successor
     * start, drawn from live DOM geometry after layout settles.
     */
    _drawGanttLinks(items, cpm, LABEL_W) {
        setTimeout(() => {
            const svg = document.getElementById('ganttLinks');
            const container = document.getElementById('ganttContainer');
            if (!svg || !container) return;
            const cRect = container.getBoundingClientRect();
            let paths = '';
            items.forEach(item => {
                const t = cpm.tById[item.id];
                if (!t || !t.preds.length) return;
                const toEl = container.querySelector(`.gantt-row[data-taskid="${item.id}"] .gantt-bar, .gantt-row[data-taskid="${item.id}"] .gantt-milestone`);
                if (!toEl) return;
                const toR = toEl.getBoundingClientRect();
                t.preds.forEach(pid => {
                    const fromEl = container.querySelector(`.gantt-row[data-taskid="${pid}"] .gantt-bar, .gantt-row[data-taskid="${pid}"] .gantt-milestone`);
                    if (!fromEl) return;
                    const fr = fromEl.getBoundingClientRect();
                    const x1 = fr.right - cRect.left, y1 = fr.top - cRect.top + fr.height / 2;
                    const x2 = toR.left - cRect.left, y2 = toR.top - cRect.top + toR.height / 2;
                    const critical = cpm.tById[pid].critical && t.critical;
                    const color = critical ? 'var(--red)' : 'var(--ink-soft)';
                    const mx = x1 + Math.max(8, (x2 - x1) / 2);
                    paths += `<path d="M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2 - 5} ${y2}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.75"/>` +
                             `<path d="M ${x2 - 5} ${y2 - 4} L ${x2} ${y2} L ${x2 - 5} ${y2 + 4} Z" fill="${color}" opacity="0.75"/>`;
                });
            });
            svg.innerHTML = paths;
        }, 60);
    },

    /**
     * _attachGanttEvents - Drag/resize with REAL persistence: on
     * mouseup the new dates are written through updateSOWItem, then
     * the chart re-renders so CPM, links and health recompute.
     * Click opens the task detail modal.
     */
    _attachGanttEvents(minDate, totalDays, items) {
        const bars = document.querySelectorAll('#ganttBody .gantt-bar');
        const self = this;
        let activeBar = null, isResizing = false, resizeSide = null, isDragging = false;
        let dragStartX = 0, origLeft = 0, origWidth = 0, moved = false;

        const pctToDate = (pct) => self._gAddDays(minDate, Math.round((pct / 100) * totalDays));

        const onMouseMove = (e) => {
            if (!activeBar) return;
            const track = activeBar.closest('.gantt-row-track');
            const rect = track.getBoundingClientRect();
            const dxPct = ((e.clientX - dragStartX) / rect.width) * 100;
            if (Math.abs(e.clientX - dragStartX) > 3) moved = true;

            if (isResizing) {
                if (resizeSide === 'right') {
                    activeBar.style.width = Math.max(2, origWidth + dxPct) + '%';
                } else {
                    const newLeft = Math.min(Math.max(0, origLeft + dxPct), origLeft + origWidth - 2);
                    activeBar.style.left = newLeft + '%';
                    activeBar.style.width = (origWidth + (origLeft - newLeft)) + '%';
                }
            } else if (isDragging) {
                activeBar.style.left = Math.max(0, Math.min(100 - origWidth, origLeft + dxPct)) + '%';
            }

            const idx = parseInt(activeBar.dataset.idx);
            if (!isNaN(idx) && items[idx]) {
                const l = parseFloat(activeBar.style.left) || 0;
                const w = parseFloat(activeBar.style.width) || 2;
                const ns = pctToDate(l);
                const ne = self._gAddDays(ns, Math.max(Math.round((w / 100) * totalDays) - 1, 0));
                const tooltip = document.getElementById('ganttTooltip');
                tooltip.textContent = `${items[idx].id}: ${self._gFmt(ns)} → ${self._gFmt(ne)}`;
                tooltip.style.left = (e.clientX - 40) + 'px';
                tooltip.style.top = (e.clientY - 30) + 'px';
                tooltip.classList.add('show');
            }
        };

        const onMouseUp = async () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.getElementById('ganttTooltip')?.classList.remove('show');
            const bar = activeBar;
            activeBar = null;
            if (!bar || !moved) { isResizing = isDragging = false; return; }
            isResizing = isDragging = false;

            const idx = parseInt(bar.dataset.idx);
            if (isNaN(idx) || !items[idx]) return;
            const l = parseFloat(bar.style.left) || 0;
            const w = parseFloat(bar.style.width) || 2;
            const ns = pctToDate(l);
            const ne = self._gAddDays(ns, Math.max(Math.round((w / 100) * totalDays) - 1, 0));
            const item = items[idx];
            const newStart = self._gFmt(ns), newEnd = self._gFmt(ne);
            if (newStart === item.startDate && newEnd === item.endDate) return;
            try {
                await DataService.updateSOWItem(self._currentProjectId, item.id, { startDate: newStart, endDate: newEnd });
                item.startDate = newStart; item.endDate = newEnd;
                UI.toast(`${item.id} moved: ${newStart} → ${newEnd}`, 'success');
                self._renderGanttChart(self._data);   // recompute CPM + links + health
            } catch (err) {
                UI.toast('Failed to save dates: ' + err.message, 'error');
                self._renderGanttChart(self._data);   // revert view
            }
        };

        bars.forEach(bar => {
            bar.querySelectorAll('.resize-handle').forEach(handle => {
                handle.addEventListener('mousedown', function (e) {
                    e.stopPropagation();
                    activeBar = bar; isResizing = true; moved = false;
                    resizeSide = this.dataset.action === 'resize-left' ? 'left' : 'right';
                    dragStartX = e.clientX;
                    origLeft = parseFloat(bar.style.left) || 0;
                    origWidth = parseFloat(bar.style.width) || 2;
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });
            });
            bar.addEventListener('mousedown', function (e) {
                if (e.target.closest('.resize-handle')) return;
                activeBar = bar; isDragging = true; moved = false;
                dragStartX = e.clientX;
                origLeft = parseFloat(bar.style.left) || 0;
                origWidth = parseFloat(bar.style.width) || 2;
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
            bar.addEventListener('click', function (e) {
                if (moved || e.target.closest('.resize-handle')) return;
                const idx = parseInt(this.dataset.idx);
                if (!isNaN(idx) && items[idx]) self.openTaskModal(items[idx].id);
            });
        });
        document.querySelectorAll('#ganttBody .gantt-milestone').forEach(ms => {
            ms.style.pointerEvents = 'auto';
            ms.addEventListener('click', function () {
                const idx = parseInt(this.dataset.idx);
                if (!isNaN(idx) && items[idx]) self.openTaskModal(items[idx].id);
            });
        });
    },

    /**
     * openTaskModal (v3) - Task details: dates, milestone flag,
     * predecessors, CPM stats, progress source, and the resources
     * assigned through this SOW's estimate.
     */
    openTaskModal(sowId) {
        const item = (this._sowItems || []).find(s => s.id === sowId);
        if (!item) return;
        const t = this._ganttMeta && this._ganttMeta.tById[sowId];
        const health = this._taskHealth(item);
        const group = ((this._estimatesData || {}).groups || []).find(g => g.sowId === sowId);
        const others = (this._sowItems || []).filter(s => s.id !== sowId);
        const preds = String(item.predecessors || '').split(',').map(x => x.trim()).filter(Boolean);

        const resChips = (list, labelFn) => (list && list.length)
            ? list.map(x => `<span class="stamp" style="transform:none;padding:2px 8px;font-size:9px;margin:2px;display:inline-block;">${labelFn(x)}</span>`).join('')
            : '<span style="font-size:11px;color:var(--ink-soft);">None assigned</span>';

        const existing = document.getElementById('ganttTaskModal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'ganttTaskModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:620px;">
                <button class="close-modal" onclick="document.getElementById('ganttTaskModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header">
                    <h2>${item.id} — ${item.description || ''}</h2>
                    <div class="print-meta">
                        <span class="stamp" style="transform:none;font-size:10px;background:${health.color};color:#fff;">${health.label}</span>
                        ${t && t.critical ? '<span class="stamp rejected" style="transform:none;font-size:10px;margin-left:6px;">CRITICAL PATH</span>' : ''}
                    </div>
                </div>

                <div class="print-section"><div class="ps-title">Schedule</div>
                    <div class="db-form-grid">
                        <div class="field"><label>Start Date</label><input type="date" id="task-start" value="${item.startDate || ''}" /></div>
                        <div class="field"><label>End Date</label><input type="date" id="task-end" value="${item.endDate || ''}" /></div>
                        <div class="field"><label>Milestone</label>
                            <select id="task-milestone">
                                <option value="" ${!item.isMilestone ? 'selected' : ''}>No — normal task</option>
                                <option value="1" ${item.isMilestone ? 'selected' : ''}>Yes — zero-duration milestone ◆</option>
                            </select>
                        </div>
                        <div class="field"><label>Predecessors (Finish-to-Start)</label>
                            <select id="task-preds" multiple size="4" title="Ctrl/Cmd-click to select multiple">
                                ${others.map(s => `<option value="${s.id}" ${preds.includes(s.id) ? 'selected' : ''}>${s.id} — ${s.description || ''}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <p style="font-size:11px;color:var(--ink-soft);">
                        Progress: <strong>${(item.progress || 0).toFixed(0)}%</strong> (from Daily Site Reports)
                        ${t ? ` · Float: <strong>${t.float} day(s)</strong>` : ''}
                        ${item.baselineStart ? ` · Baseline: ${item.baselineStart} → ${item.baselineEnd}` : ' · No baseline saved yet'}
                    </p>
                </div>

                <div class="print-section"><div class="ps-title">Resources (from Estimate)</div>
                    <div style="margin-bottom:6px;"><strong style="font-size:11px;">Manpower:</strong><br>${resChips(group && group.labor, l => `${l.role || '—'} × ${l.qty || 0}`)}</div>
                    <div style="margin-bottom:6px;"><strong style="font-size:11px;">Equipment:</strong><br>${resChips(group && group.equipment, e => `${e.equipName || e.equipment || '—'} × ${e.qty || 0}`)}</div>
                    <div style="margin-bottom:6px;"><strong style="font-size:11px;">Materials:</strong><br>${resChips(group && group.materials, m => `${m.materialName || m.material || '—'} × ${m.qty || 0}`)}</div>
                    <button class="btn-sm" onclick="document.getElementById('ganttTaskModal').remove();ProjectPage.switchTab('estimates')">${Icon.ruler({size:12})} Assign / edit resources in Estimates</button>
                </div>

                <div class="print-actions">
                    <button class="btn-primary" onclick="ProjectPage.saveTaskModal('${sowId}')">Save Changes</button>
                    <button class="btn-ghost" onclick="document.getElementById('ganttTaskModal').remove()">Close</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    async saveTaskModal(sowId) {
        const startDate = document.getElementById('task-start').value;
        const endDate = document.getElementById('task-end').value;
        const isMilestone = !!document.getElementById('task-milestone').value;
        const preds = Array.from(document.getElementById('task-preds').selectedOptions).map(o => o.value);

        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
            UI.toast('End date cannot be before start date.', 'error');
            return;
        }
        // guard: no direct circular link (A→B while B→A)
        for (const pid of preds) {
            const p = (this._sowItems || []).find(s => s.id === pid);
            const theirPreds = String(p && p.predecessors || '').split(',').map(x => x.trim());
            if (theirPreds.includes(sowId)) {
                UI.toast(`Circular dependency: ${pid} already depends on ${sowId}.`, 'error');
                return;
            }
        }
        try {
            await DataService.updateSOWItem(this._currentProjectId, sowId, {
                startDate, endDate, isMilestone, predecessors: preds.join(',')
            });
            const item = (this._sowItems || []).find(s => s.id === sowId);
            if (item) {
                item.startDate = startDate; item.endDate = endDate;
                item.isMilestone = isMilestone; item.predecessors = preds.join(',');
            }
            UI.toast(`${sowId} updated.`, 'success');
            document.getElementById('ganttTaskModal').remove();
            this._renderGanttChart(this._data);
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    async saveGanttBaseline() {
        const confirmed = await Confirm.open('Save Baseline?',
            'Snapshot the CURRENT start/end dates of all SOW items as the baseline? Existing baseline will be overwritten.');
        if (!confirmed) return;
        try {
            const result = await DataService.saveBaseline(this._currentProjectId);
            UI.toast(`Baseline saved for ${result.count} task(s).`, 'success');
            this.refreshSOWData();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    }
});
