// ================================================================
//  pages/project/project-schedule.js — Schedule columns (v11)
//
//  PURPOSE: The editable Predecessor / Start / Duration / Finish
//  columns of the Timeline.
//
//  WHY: dragging bars is good for nudging a plan but useless for
//  entering one — you cannot drag to "18 working days", and re-planning
//  a delayed chain meant retyping every downstream date by hand.
//
//  Behaviour (unchanged from v10):
//    · The three date fields stay consistent: change the DURATION and
//      the finish moves; change the FINISH and the duration recalculates.
//    · Duration counts WORKING DAYS and skips Sundays, which is how the
//      site actually plans.
//    · Choose a PREDECESSOR and the start snaps to the first working day
//      after that item finishes, and keeps following it. Editing one
//      delayed item therefore cascades down the whole chain.
//    · A row with a predecessor shows its start as read-only, with a
//      lock icon, so it is obvious why it cannot be typed into.
//    · Everything writes back through updateSOWItem, the same call the
//      draggable bars use, so the Gantt, PV curve and projected cashflow
//      all recalculate from one source of truth.
//
//  ── v11 BATCH C: THE TABLE MOVED INTO THE CHART ──────────────
//  This used to render a standalone collapsible <table> ABOVE the Gantt
//  (renderScheduleGrid). That meant you could read a row's dates OR see
//  its bar, never both — the "nahihide yung schedule table" problem.
//  It was not hidden; it was simply somewhere else.
//
//  The same columns are now the cells of the Gantt's FROZEN LEFT PANE,
//  so every row shows its SOW ID, name, predecessor, start, duration and
//  finish on the SAME LINE as its bar, and they stay pinned while the
//  timeline scrolls sideways.
//
//  renderScheduleGrid() is replaced by two functions that emit grid
//  cells rather than a table:
//      renderScheduleHeadCells()            -> the sticky corner header
//      renderScheduleRowCells(item, idx, …) -> one row's left cell
//
//  Every edit handler below is untouched. The working-day maths, the
//  predecessor chaining and the cycle guard behave exactly as before.
// ================================================================

Object.assign(ProjectPage, {

    _MS_DAY: 86400000,

    // ─── working-day helpers (Sunday is a rest day) ───────────

    _sDay(v) {
        if (!v) return null;
        const p = String(v).slice(0, 10).split('-');
        if (p.length !== 3) return null;
        const d = new Date(+p[0], +p[1] - 1, +p[2]);
        return isNaN(d.getTime()) ? null : d;
    },
    _sFmt(d) {
        if (!d) return '';
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    },
    /** _sNextWork - the same day if it is a working day, else the next. */
    _sNextWork(d) {
        let x = new Date(d);
        while (x.getDay() === 0) x = new Date(x.getTime() + this._MS_DAY);
        return x;
    },
    /** _sAddWork - finish date for `days` working days INCLUDING the start. */
    _sAddWork(start, days) {
        let d = this._sNextWork(new Date(start));
        let left = Math.max(1, parseInt(days, 10) || 1) - 1;
        while (left > 0) {
            d = new Date(d.getTime() + this._MS_DAY);
            if (d.getDay() !== 0) left--;
        }
        return d;
    },
    /** _sWorkBetween - inclusive working-day count from a to b. */
    _sWorkBetween(a, b) {
        if (!a || !b || b < a) return 1;
        let n = 0, d = new Date(a);
        while (d <= b) {
            if (d.getDay() !== 0) n++;
            d = new Date(d.getTime() + this._MS_DAY);
        }
        return Math.max(1, n);
    },

    /** _predOf - first valid predecessor id of a SOW row (single-link UI). */
    _predOf(item) {
        return String(item.predecessors || '').split(',').map(x => x.trim()).filter(Boolean)[0] || '';
    },

    // ─── the frozen pane ──────────────────────────────────────

    /**
     * renderScheduleHeadCells - the sticky corner cell. Its column
     * template must match renderScheduleRowCells exactly, so both read
     * it from the same CSS class rather than repeating a width list.
     */
    renderScheduleHeadCells() {
        return `
            <div class="gt-head-left">
                <div>SOW item</div>
                <div class="col-pred">Predecessor</div>
                <div class="col-date">Start</div>
                <div class="col-dur">Days</div>
                <div class="col-date">Finish</div>
            </div>`;
    },

    /**
     * renderScheduleRowCells - one row's frozen cell: the task label
     * plus the four editable schedule columns.
     *
     * @param item   the SOW row
     * @param idx    its index, so the click handlers can find it
     * @param t      its CPM node (float, critical) — may be undefined
     * @param health the _taskHealth result, for the status dot
     */
    renderScheduleRowCells(item, idx, t, health) {
        const canEdit = this._canEdit !== false;
        const pred = this._predOf(item);
        const locked = !!pred;
        const s = this._sDay(item.startDate);
        const e = this._sDay(item.endDate);
        const dur = (s && e) ? this._sWorkBetween(s, e) : 1;
        const crit = t && t.critical;

        const esc = v => String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

        const predOpts = (this._sowItems || [])
            .filter(o => o.id !== item.id)
            .map(o => `<option value="${esc(o.id)}" ${pred === o.id ? 'selected' : ''}>${esc(o.id)} — ${esc((o.description || '').slice(0, 30))}</option>`)
            .join('');

        const tip = `${item.id} — ${item.description || ''} · ${health ? health.label : ''}` +
            (t ? (t.critical ? ' · critical path' : ' · float ' + t.float + ' day(s)') : '');

        return `
            <div class="gt-cell-left" data-id="${esc(item.id)}" data-idx="${idx}">
                <div class="gt-task ${crit ? 'is-critical' : ''}" title="${esc(tip)}">
                    <span class="dot" style="background:${health ? health.color : 'var(--ink-soft)'}"></span>
                    <span class="id">${esc(item.id)}</span>
                    <span class="nm">${esc(item.description || '')}</span>
                    ${item.isMilestone ? '<span class="ms-tag">milestone</span>' : ''}
                </div>

                <div class="col-pred">
                    ${canEdit ? `<select class="gt-in" onchange="ProjectPage.setPredecessor('${esc(item.id)}', this.value)"
                        title="Finish-to-start link — this item follows the selected one">
                        <option value="">— none —</option>${predOpts}
                    </select>` : `<span class="gt-ro">${esc(pred) || '—'}</span>`}
                </div>

                <div class="col-date">
                    ${canEdit ? `<input type="date" class="gt-in" value="${esc(item.startDate)}" ${locked ? 'readonly' : ''}
                        title="${locked ? 'Follows ' + esc(pred) + ' — change that item or clear the link' : 'Start date'}"
                        onchange="ProjectPage.setSchedField('${esc(item.id)}','start',this.value)" />`
                        : `<span class="gt-ro">${esc(item.startDate) || '—'}</span>`}
                    ${locked ? `<span class="gt-lock" title="Start follows ${esc(pred)}">${Icon.lock({ size: 9 })} ${esc(pred)}</span>` : ''}
                </div>

                <div class="col-dur">
                    ${item.isMilestone
                        ? `<span class="gt-ro">—</span>`
                        : (canEdit ? `<input type="number" min="1" class="gt-in gt-dur" value="${dur}"
                            title="Working days, Sundays excluded"
                            onchange="ProjectPage.setSchedField('${esc(item.id)}','dur',this.value)" />`
                          : `<span class="gt-ro">${dur}</span>`)}
                </div>

                <div class="col-date">
                    ${canEdit ? `<input type="date" class="gt-in" value="${esc(item.endDate)}"
                        onchange="ProjectPage.setSchedField('${esc(item.id)}','end',this.value)" />`
                        : `<span class="gt-ro">${esc(item.endDate) || '—'}</span>`}
                </div>
            </div>`;
    },

    // ─── editing ──────────────────────────────────────────────

    /**
     * setSchedField - one edit, applied consistently:
     *   'start' -> keeps the duration, moves the finish
     *   'dur'   -> keeps the start,   moves the finish
     *   'end'   -> keeps the start,   recomputes the duration
     * Successors are then re-chained.
     */
    async setSchedField(sowId, field, value) {
        const it = (this._sowItems || []).find(x => x.id === sowId);
        if (!it) return;

        let start = this._sDay(it.startDate);
        let end = this._sDay(it.endDate);
        let dur = (start && end) ? this._sWorkBetween(start, end) : 1;

        if (field === 'start') {
            const ns = this._sDay(value);
            if (!ns) { UI.toast('Enter a valid start date.', 'error'); return; }
            start = this._sNextWork(ns);
            end = this._sAddWork(start, dur);
        } else if (field === 'dur') {
            const nd = parseInt(value, 10);
            if (!nd || nd < 1) { UI.toast('Duration must be at least 1 working day.', 'error'); return; }
            if (!start) start = this._sNextWork(new Date());
            end = this._sAddWork(start, nd);
        } else if (field === 'end') {
            const ne = this._sDay(value);
            if (!ne) { UI.toast('Enter a valid finish date.', 'error'); return; }
            if (!start) start = this._sNextWork(new Date());
            if (ne < start) { UI.toast('The finish date cannot be earlier than the start date.', 'error'); return; }
            end = ne;
        }

        await this._saveSchedule([{ id: sowId, startDate: this._sFmt(start), endDate: this._sFmt(end) }], true);
    },

    /**
     * setPredecessor - links a row to another SOW. On linking, the start
     * immediately snaps to the first working day after the predecessor
     * finishes; the duration is preserved so only the position moves.
     * Rejects self-links and cycles.
     */
    async setPredecessor(sowId, predId) {
        const items = this._sowItems || [];
        const it = items.find(x => x.id === sowId);
        if (!it) return;

        if (predId === sowId) { UI.toast('An item cannot depend on itself.', 'error'); return; }

        if (predId && this._wouldCycle(sowId, predId)) {
            UI.toast(`Linking ${sowId} to ${predId} would create a circular dependency.`, 'error');
            this.renderGantt(this._data);
            return;
        }

        const patches = [{ id: sowId, predecessors: predId }];
        if (predId) {
            const pred = items.find(x => x.id === predId);
            const pEnd = this._sDay(pred && pred.endDate);
            if (pEnd) {
                const start = this._sNextWork(new Date(pEnd.getTime() + this._MS_DAY));
                const s0 = this._sDay(it.startDate), e0 = this._sDay(it.endDate);
                const dur = (s0 && e0) ? this._sWorkBetween(s0, e0) : 1;
                patches[0].startDate = this._sFmt(start);
                patches[0].endDate = this._sFmt(this._sAddWork(start, dur));
            }
        }
        await this._saveSchedule(patches, true);
    },

    /** _wouldCycle - true if making `predId` a predecessor of `sowId` loops. */
    _wouldCycle(sowId, predId) {
        const items = this._sowItems || [];
        const byId = {};
        items.forEach(x => { byId[x.id] = x; });
        let cursor = predId, guard = 0;
        while (cursor && guard++ < items.length + 2) {
            if (cursor === sowId) return true;
            cursor = this._predOf(byId[cursor] || {});
        }
        return false;
    },

    /**
     * _chainSuccessors - walks the dependency graph and returns patches
     * for every row whose start no longer matches its predecessor's
     * finish. Repeated relaxation keeps it correct for chains of any
     * depth without needing a topological sort.
     */
    _chainSuccessors() {
        const items = this._sowItems || [];
        const byId = {};
        items.forEach(x => { byId[x.id] = Object.assign({}, x); });
        const patches = {};

        for (let pass = 0; pass < items.length + 1; pass++) {
            let changed = false;
            items.forEach(row => {
                const cur = byId[row.id];
                const pid = this._predOf(cur);
                if (!pid || !byId[pid]) return;
                const pEnd = this._sDay(byId[pid].endDate);
                if (!pEnd) return;
                const want = this._sNextWork(new Date(pEnd.getTime() + this._MS_DAY));
                const have = this._sDay(cur.startDate);
                if (have && have.getTime() === want.getTime()) return;
                const s0 = have, e0 = this._sDay(cur.endDate);
                const dur = (s0 && e0) ? this._sWorkBetween(s0, e0) : 1;
                const newEnd = this._sAddWork(want, dur);
                cur.startDate = this._sFmt(want);
                cur.endDate = this._sFmt(newEnd);
                patches[row.id] = { id: row.id, startDate: cur.startDate, endDate: cur.endDate };
                changed = true;
            });
            if (!changed) break;
        }
        return Object.keys(patches).map(k => patches[k]);
    },

    /** recalcSchedule - re-applies every link from the top down. */
    async recalcSchedule() {
        const patches = this._chainSuccessors();
        if (!patches.length) { UI.toast('Every predecessor link is already satisfied.', 'success'); return; }
        await this._saveSchedule(patches, false);
        UI.toast(`${patches.length} item(s) rescheduled to follow their predecessors.`, 'success');
    },

    /**
     * _saveSchedule - applies patches locally (so the UI responds at
     * once), cascades to successors, persists each row through
     * updateSOWItem, then refreshes so PV, the projected cashflow and
     * the Gantt bars all recompute from the saved dates.
     */
    async _saveSchedule(patches, cascade) {
        const items = this._sowItems || [];
        const apply = p => {
            const it = items.find(x => x.id === p.id);
            if (!it) return;
            if (p.startDate !== undefined) it.startDate = p.startDate;
            if (p.endDate !== undefined) it.endDate = p.endDate;
            if (p.predecessors !== undefined) it.predecessors = p.predecessors;
        };
        patches.forEach(apply);

        let all = patches.slice();
        if (cascade) {
            const chained = this._chainSuccessors();
            chained.forEach(apply);
            // merge, letting the explicit edit win over a chained one
            const seen = {};
            all.forEach(p => { seen[p.id] = p; });
            chained.forEach(p => { if (!seen[p.id]) { seen[p.id] = p; all.push(p); } });
        }

        // repaint immediately from local state. v11: only the chart is
        // redrawn, not the whole tab, so the horizontal scroll position
        // and the pane width survive an edit.
        this._renderGanttChart(this._data);

        try {
            for (const p of all) {
                const payload = {};
                if (p.startDate !== undefined) payload.startDate = p.startDate;
                if (p.endDate !== undefined) payload.endDate = p.endDate;
                if (p.predecessors !== undefined) payload.predecessors = p.predecessors;
                await DataService.updateSOWItem(this._currentProjectId, p.id, payload);
            }
            if (all.length > 1) {
                UI.toast(`Schedule saved — ${all.length} items updated (successors followed).`, 'success');
            } else {
                UI.toast('Schedule saved.', 'success');
            }
            // reload so PV / projected cashflow / progress reflect the change
            await this.open(this._currentProjectId, true);
            this.switchTab('gantt');
        } catch (err) {
            UI.toast('' + err.message, 'error');
            await this.open(this._currentProjectId, true);
            this.switchTab('gantt');
        }
    }
});
