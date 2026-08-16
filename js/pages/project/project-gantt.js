// ================================================================
//  pages/project/project-gantt.js — MS Project-style Timeline (v11)
//
//  PURPOSE: Full-featured Gantt for the Timeline tab.
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
//    · Drag to move, drag edges to resize — persisted through
//      updateSOWItem
//
//  ── v11 BATCH C: FROZEN-PANE LAYOUT REWRITE ──────────────────
//
//  WHAT WAS WRONG. Four separate layout faults:
//
//   1. The task label lived INSIDE the horizontally scrolling row, so
//      scrolling right carried every name off screen and left you
//      looking at unlabelled bars.
//   2. `.gantt-timeline` was `position:sticky; top:0` — the VERTICAL
//      axis — but its scroll parent only scrolled HORIZONTALLY and the
//      page owned vertical scrolling. It stuck to nothing, so the dates
//      scrolled away on any project with more than a screenful of SOW.
//   3. The label column had THREE widths: padding-left:120px in
//      project-sow.css, width:220px in gantt.css, and a computed
//      LABEL_W (220–420px) written inline by this file.
//   4. The schedule table was a separate collapsible block ABOVE the
//      chart, so a row's dates and its bar could never be read together.
//
//  WHAT IT IS NOW. One `.gt-scroll` element scrolling on both axes,
//  containing a two-column grid:
//
//      grid-template-columns: var(--gt-lw) max-content
//
//  The left cells are `position:sticky; left:0` so the task table stays
//  pinned while the timeline slides underneath. The header cells are
//  `position:sticky; top:0`. The corner is sticky on both. Vertical
//  scrolling is shared because it is ONE element — there is no
//  scroll-syncing script that can drift out of step. The column width is
//  a single CSS variable, --gt-lw, used by the grid, the splitter and
//  the today line.
//
//  Bars are positioned in PIXELS against a known track width instead of
//  percentages of an unknown one. That also makes the drag maths exact:
//  a pixel delta converts straight to whole days, so a bar can no longer
//  land between two dates and round unpredictably.
//
//  Attached to ProjectPage via Object.assign; must load AFTER
//  project-sow.js and project-schedule.js, and BEFORE init.js.
// ================================================================

Object.assign(ProjectPage, {

    _ganttMeta: null,   // computed schedule kept for event handlers

    // ─── date helpers (all math in whole days, local time) ───────
    // _gDay parses to LOCAL midnight. It accepts a clean 'yyyy-MM-dd'
    // (the normal case now that the backend formats dates) and also
    // tolerates a full ISO string by taking its date prefix, so a
    // stray Date-serialized value never shows up as "No dates".
    _gDay(dateStr) {
        if (!dateStr) return null;
        const s = String(dateStr).trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        let d;
        if (m) {
            d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        } else {
            d = new Date(s);
            if (!isNaN(d)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
        return isNaN(d) ? null : d;
    },
    _gDiffDays(a, b) { return Math.round((b - a) / 86400000); },
    _gAddDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
    // _gFmt formats from LOCAL components. Using toISOString() here
    // would convert local midnight to UTC and could shift the day
    // back by one (Manila is GMT+8), silently corrupting saved dates.
    _gFmt(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },
    _MONTHS_SHORT: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    _gShort(d) {
        if (!d) return '—';
        return `${String(d.getDate()).padStart(2, '0')} ${this._MONTHS_SHORT[d.getMonth()]}`;
    },

    // ─── frozen pane width ──────────────────────────────────────
    // ONE source of truth, read and written as a CSS variable so the
    // grid, the splitter and the today line can never disagree.
    _GT_LW_DEFAULT: 470,
    _GT_LW_COMPACT: 230,
    _GT_LW_MIN: 170,
    _GT_LW_MAX: 720,
    _gLabelW() {
        const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gt-lw'));
        return isNaN(v) ? this._GT_LW_DEFAULT : v;
    },
    _gSetLabelW(px) {
        const w = Math.min(this._GT_LW_MAX, Math.max(this._GT_LW_MIN, Math.round(px)));
        document.documentElement.style.setProperty('--gt-lw', w + 'px');
        return w;
    },

    renderGantt(p) {
        const container = document.getElementById('proj-tab-gantt');
        // v6.2 (option B): CONTRACT-BASIS weighting — each SOW's weight
        // is its APPROVED estimate total plus its client-approved VOs
        // (the same basis the client is billed on). The working budget
        // stays purely internal cost control. Falls back to the backend
        // budget-weighted figure while no estimates are approved yet.
        const itemsW = (this._sowItems || []).filter(s => !s.isMilestone);
        const wOf = x => (x.estimateTotal || 0) + (x.voAdjustment || 0);
        const estSum = itemsW.reduce((s, x) => s + wOf(x), 0);
        const total = estSum > 0
            ? itemsW.reduce((s, x) => s + wOf(x) * ((parseFloat(x.progress) || 0) / 100), 0) / estSum * 100
            : ((p && typeof p.totalProgress === 'number') ? p.totalProgress : 0);
        if (!this._gScale) this._gScale = 'week';
        if (!this._gZoom) this._gZoom = 1;
        if (this._gCompact === undefined) this._gCompact = false;

        // establish the pane width before anything measures it
        this._gSetLabelW(this._gCompact ? this._GT_LW_COMPACT : (this._gLabelWUser || this._GT_LW_DEFAULT));

        // v6.3 (#3): while the contract basis is incomplete, the badge
        // shows WHAT is missing (with counts) instead of a total that
        // would be computed on a wrong base.
        const cr = (p && p.contractReady) || { ready: true, unapproved: [], zeroBudget: [] };
        const badgeHtml = cr.ready
            ? `<span class="badge">Total: ${total.toFixed(1)}% complete (contract-basis: approved estimates + VOs)</span>`
            : `<span class="badge" style="color:var(--amber);border-color:var(--amber);" title="${[
                    cr.unapproved.length ? 'Estimates not approved/empty: ' + cr.unapproved.join(', ') : '',
                    cr.zeroBudget.length ? 'No budget: ' + cr.zeroBudget.join(', ') : ''
                ].filter(Boolean).join(' | ')}">${Icon.warning({size:13})} Setup incomplete — ${[
                    cr.unapproved.length ? cr.unapproved.length + ' estimate(s) not approved' : '',
                    cr.zeroBudget.length ? cr.zeroBudget.length + ' SOW without budget' : ''
                ].filter(Boolean).join(' · ')}</span>`;

        const canEdit = this._canEdit !== false;

        container.innerHTML = `
            <div class="section-head">
                <h2>Project Timeline</h2>
                <div class="rule"></div>
                ${badgeHtml}
                ${canEdit ? `<button class="btn-sm" style="margin-left:8px;" title="Snapshot current dates as the baseline"
                    onclick="ProjectPage.saveGanttBaseline()">${Icon.pin({size:12})} Save Baseline</button>` : ''}
            </div>
            <div class="gt-toolbar">
                <span class="gt-lbl">Scale</span>
                <button class="btn-sm ${this._gScale === 'day' ? 'primary' : ''}" onclick="ProjectPage.setGanttScale('day')">Day</button>
                <button class="btn-sm ${this._gScale === 'week' ? 'primary' : ''}" onclick="ProjectPage.setGanttScale('week')">Week</button>
                <button class="btn-sm ${this._gScale === 'month' ? 'primary' : ''}" onclick="ProjectPage.setGanttScale('month')">Month</button>
                <span class="gt-sep"></span>
                <button class="btn-sm" title="Zoom out" onclick="ProjectPage.ganttZoom(0.8)">&minus;</button>
                <button class="btn-sm" title="Zoom in" onclick="ProjectPage.ganttZoom(1.25)">+</button>
                <button class="btn-sm" title="Fit the whole timeline in view" onclick="ProjectPage.ganttFit()">Fit all</button>
                <span class="gt-sep"></span>
                <button class="btn-sm" onclick="ProjectPage.toggleSchedule()"
                    title="Show or hide the predecessor and date columns">
                    ${this._gCompact ? Icon.chevronRight({size:12}) : Icon.arrowDown({size:12})} ${this._gCompact ? 'Show dates' : 'Hide dates'}
                </button>
                <button class="btn-sm" onclick="ProjectPage.ganttToday()">${Icon.calendar({size:12})} Go to today</button>
                ${(this._sowItems || []).some(s => s.isHeading) ? `
                    <button class="btn-sm" onclick="ProjectPage.collapseAllGantt(true)" title="Show headings only">Collapse all</button>
                    <button class="btn-sm" onclick="ProjectPage.collapseAllGantt(false)">Expand all</button>` : ''}
                ${canEdit ? `<button class="btn-sm" style="margin-left:auto" onclick="ProjectPage.recalcSchedule()"
                    title="Re-apply every predecessor link from the top down">${Icon.refresh({size:12})} Recalculate chain</button>` : ''}
            </div>
            <!-- v11 BATCH I2: the unsaved-changes bar. Schedule edits are
                 staged locally and written in ONE go, so fixing four items
                 no longer means four server round-trips redrawing the rows
                 under your cursor. -->
            <!-- v19: only shown when there is something to repair. A
                 permanent button for a one-off problem is a button people
                 press out of curiosity. -->
            ${(this._sowItems || []).some(x => !x.isHeading && !x.startDate && !x.endDate)
                ? `<div class="sched-repair">
                    <b>${Icon.warning({ size: 12 })} Some items have no dates</b>
                    <p>Imported scopes were created without a start or finish. The Timeline needs two
                    of start, duration and finish before it can work out the third, so changing a
                    duration on those rows does nothing.</p>
                    <button class="btn-sm primary" onclick="ProjectPage.repairSchedules(this)">
                        Give them a one-day placeholder</button>
                </div>` : ''}

            <div class="sched-dirty" id="schedDirtyBar" style="display:none;">
                ${Icon.warning({size:13})}
                <span id="schedDirtyLabel"></span>
                <span class="sd-hint">Nothing has been sent to the server yet.</span>
                <button class="btn-sm" onclick="ProjectPage.discardSchedule()">Discard</button>
                <button class="btn-sm primary" id="schedSaveBtn" onclick="ProjectPage.saveSchedule()">Save changes</button>
            </div>
            <div class="gt" id="ganttBox">
                <div class="gt-scroll" id="ganttScroll">
                    <div class="gt-grid" id="ganttGrid"></div>
                </div>
                <div class="gt-splitter" id="ganttSplitter" role="separator" aria-orientation="vertical"
                     tabindex="0" aria-label="Resize the task table"></div>
            </div>
            <div class="gt-legend">
                <span><span class="dot" style="background:var(--green);"></span>On track</span>
                <span><span class="dot" style="background:var(--amber);"></span>Behind schedule</span>
                <span><span class="dot" style="background:var(--red);"></span>Overdue</span>
                <span><span class="dot" style="background:var(--blueprint);"></span>Complete</span>
                <span><span class="dot" style="border:2px solid var(--red);background:transparent;"></span>Critical path</span>
                <span>&#9670; Milestone</span>
                <span><span class="dot dot-baseline"></span>Baseline</span>
                <span class="gt-hint">Duration counts working days and skips Sundays. Drag a bar to move it, its edges to resize. Click for details, links and resources.</span>
            </div>
            <div class="gantt-tooltip" id="ganttTooltip"></div>`;

        this._ganttData = this._sowItems;
        this._renderGanttChart(p);
        this._wireGanttSplitter();
        this._paintSchedDirty();
        // Open centred on today the first time this PROJECT's timeline is
        // drawn. Keyed on the project id, not a plain boolean, so opening
        // a second project re-centres instead of inheriting the scroll
        // position of the first.
        if (this._gCentredFor !== this._currentProjectId) {
            this._gCentredFor = this._currentProjectId;
            setTimeout(() => this.ganttToday(), 40);
        }
    },

    // v6.2: px-per-day for each scale; zoom multiplies it.
    _gBaseDayW: { day: 26, week: 9, month: 3 },
    _gDayWidth() {
        const base = this._gBaseDayW[this._gScale || 'week'] || 9;
        return Math.min(60, Math.max(1.5, base * (this._gZoom || 1)));
    },
    setGanttScale(scale) {
        this._gScale = scale;
        this._gZoom = 1;
        this.renderGantt(this._data);   // rebuild toolbar active states + chart
    },
    ganttZoom(factor) {
        this._gZoom = Math.min(8, Math.max(0.2, (this._gZoom || 1) * factor));
        this._renderGanttChart(this._data);
    },
    ganttFit() {
        const scroll = document.getElementById('ganttScroll');
        const meta = this._ganttMeta;
        if (!scroll || !meta || !meta.totalDays) { this._renderGanttChart(this._data); return; }
        const avail = Math.max(scroll.clientWidth - this._gLabelW() - 24, 120);
        const base = this._gBaseDayW[this._gScale || 'week'] || 9;
        this._gZoom = Math.max(0.2, (avail / meta.totalDays) / base);
        this._renderGanttChart(this._data);
    },
    /** ganttToday - scrolls the timeline so today sits in the middle. */
    ganttToday() {
        const scroll = document.getElementById('ganttScroll');
        const meta = this._ganttMeta;
        if (!scroll || !meta || !meta.minDate) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const x = this._gDiffDays(meta.minDate, today) * meta.dayW;
        const viewport = scroll.clientWidth - this._gLabelW();
        scroll.scrollLeft = Math.max(0, x - viewport / 2);
    },
    /**
     * toggleSchedule - collapses the frozen pane to the task name alone.
     * Kept under its original name so any cached markup still works; it
     * no longer shows or hides a separate table, because the schedule
     * columns now live inside the pane.
     */
    /** toggleGanttHeading (v11 BATCH H4) - collapse one heading. */
    toggleGanttHeading(id) {
        this._gCollapsed = this._gCollapsed || {};
        this._gCollapsed[id] = !this._gCollapsed[id];
        this._renderGanttChart(this._data);
    },

    collapseAllGantt(shut) {
        this._gCollapsed = {};
        if (shut) (this._sowItems || []).forEach(s => { if (s.isHeading) this._gCollapsed[s.id] = true; });
        this._renderGanttChart(this._data);
    },

    toggleSchedule() {
        this._gCompact = !this._gCompact;
        this.renderGantt(this._data);
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

    // ─── the chart ──────────────────────────────────────────────

    /**
     * repairSchedules (v19) - a one-day window for every item that has
     * neither a start nor a finish.
     *
     * A placeholder, not a plan. But a real one-day task is a truthful
     * thing to say about a scope nobody has scheduled, and it makes the
     * row work — which an empty one does not.
     */
    async repairSchedules(btn) {
        await Busy.run(btn, 'Fixing', async () => {
            try {
                const res = await DataService.repairSowSchedules(this._currentProjectId);
                UI.toast(res.fixed
                    ? `${res.fixed} item(s) now start on ${res.startDate}. Set the real dates from here.`
                    : 'Nothing needed fixing.', 'success');
                await this.open(this._currentProjectId, true);
                this.switchTab('gantt');
            } catch (err) { UI.toast('' + err.message, 'error'); }
        });
    },

    _renderGanttChart(p) {
        const items = this._sowItems || [];
        const grid = document.getElementById('ganttGrid');
        if (!grid) return;
        if (!items.length) {
            grid.innerHTML = `<div class="gt-empty"><p>No SOW items yet. Add them on the SOW Budget tab, then schedule them here.</p></div>`;
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
        const minDate = this._gAddDays(new Date(Math.min(...dates.map(d => d.getTime()))), -3);
        const maxDate = this._gAddDays(new Date(Math.max(...dates.map(d => d.getTime()))), 3);
        const totalDays = Math.max(this._gDiffDays(minDate, maxDate), 1);

        const DAY_W = this._gDayWidth();
        const trackW = Math.ceil(totalDays * DAY_W);
        const x = d => this._gDiffDays(minDate, d) * DAY_W;

        cpm.minDate = minDate;
        cpm.maxDate = maxDate;
        cpm.totalDays = totalDays;
        cpm.dayW = DAY_W;
        cpm.trackW = trackW;

        // week striping: a rhythm for the eye without a rule per day,
        // which turns into visual noise once you zoom out
        document.documentElement.style.setProperty('--gt-week-w', (DAY_W * 7) + 'px');

        // ── header: a month band above the tick row, at every scale, so
        //    you always know which month you are looking at even when
        //    zoomed into individual days ──
        const MN = this._MONTHS_SHORT;
        let band = '';
        let d = new Date(minDate);
        while (d <= maxDate) {
            const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            const segEnd = mEnd < maxDate ? mEnd : maxDate;
            const w = (this._gDiffDays(d, segEnd) + 1) * DAY_W;
            band += `<div class="seg" style="width:${w}px">${w > 52 ? MN[d.getMonth()] + ' ' + d.getFullYear() : ''}</div>`;
            d = this._gAddDays(segEnd, 1);
        }

        const scale = this._gScale || 'week';
        let ticks = '';
        if (scale === 'day') {
            for (let c = new Date(minDate); c <= maxDate; c = this._gAddDays(c, 1)) {
                const isToday = c.getTime() === today.getTime();
                const rest = c.getDay() === 0;   // Sunday, matching the working-day rule
                ticks += `<div class="tk ${isToday ? 'is-today' : ''} ${rest ? 'is-rest' : ''}" style="width:${DAY_W}px">${DAY_W >= 15 ? c.getDate() : ''}</div>`;
            }
        } else if (scale === 'week') {
            let c = new Date(minDate);
            while (c <= maxDate) {
                const wEnd = this._gAddDays(c, 6 - ((c.getDay() + 6) % 7));   // upcoming Sunday
                const segEnd = wEnd < maxDate ? wEnd : maxDate;
                const w = (this._gDiffDays(c, segEnd) + 1) * DAY_W;
                const hot = today >= c && today <= segEnd;
                ticks += `<div class="tk ${hot ? 'is-today' : ''}" style="width:${w}px">${w >= 34 ? this._gShort(c) : ''}</div>`;
                c = this._gAddDays(segEnd, 1);
            }
        } else {
            let c = new Date(minDate);
            while (c <= maxDate) {
                const mEnd = new Date(c.getFullYear(), c.getMonth() + 1, 0);
                const segEnd = mEnd < maxDate ? mEnd : maxDate;
                const w = (this._gDiffDays(c, segEnd) + 1) * DAY_W;
                const hot = today >= c && today <= segEnd;
                ticks += `<div class="tk ${hot ? 'is-today' : ''}" style="width:${w}px">${w >= 30 ? MN[c.getMonth()] : ''}</div>`;
                c = this._gAddDays(segEnd, 1);
            }
        }

        let html = `
            ${this.renderScheduleHeadCells()}
            <div class="gt-head-track" style="width:${trackW}px">
                <div class="gt-band">${band}</div>
                <div class="gt-ticks">${ticks}</div>
            </div>`;

        // ── v11 BATCH H4: SOW HIERARCHY ──
        // A heading has no dates of its own to drag. It gets a SUMMARY
        // BAR — the bracket shape — spanning its earliest child to its
        // latest, and collapsing it hides the detail beneath. On a
        // sixty-line bill of quantities that is the difference between a
        // readable chart and a wall of bars.
        this._gCollapsed = this._gCollapsed || {};
        const gCollapsed = this._gCollapsed;
        const gHidden = it => {
            let p = it.parentId;
            const seen = {};
            while (p && !seen[p]) {
                if (gCollapsed[p]) return true;
                seen[p] = true;
                const par = items.find(x => x.id === p);
                p = par ? par.parentId : '';
            }
            return false;
        };
        const gSpan = it => {
            if (!it.isHeading) return [this._gDay(it.startDate), this._gDay(it.endDate)];
            const kids = items.filter(k => String(k.id).indexOf(String(it.id) + '.') === 0);
            const ss = [], ee = [];
            kids.concat([it]).forEach(k => {
                const a = this._gDay(k.startDate), b = this._gDay(k.endDate);
                if (a) ss.push(a.getTime());
                if (b) ee.push(b.getTime());
            });
            return ss.length && ee.length
                ? [new Date(Math.min.apply(null, ss)), new Date(Math.max.apply(null, ee))]
                : [null, null];
        };

        items.forEach((item, idx) => {
            if (gHidden(item)) return;

            const t = cpm.tById[item.id];
            const health = this._taskHealth(item);
            const critCls = t && t.critical ? 'is-critical' : '';

            if (item.isHeading) {
                const [hs, he] = gSpan(item);
                const rp = item.rollupProgress;
                const bar = (hs && he)
                    ? `<div class="gt-summary" style="left:${x(hs)}px;width:${Math.max(10, (this._gDiffDays(hs, he) + 1) * DAY_W)}px"
                            title="${item.id} — ${item.description || ''}
${this._gShort(hs)} → ${this._gShort(he)} · ${item.childCount} item(s)${rp == null ? '' : ' · ' + rp.toFixed(0) + '%'}"></div>`
                    : '';
                html += this.renderScheduleHeadingCells(item)
                     + `<div class="gt-cell-track is-heading" data-id="${item.id}" style="width:${trackW}px">${bar}</div>`;
                return;
            }

            const s = this._gDay(item.startDate), e = this._gDay(item.endDate);

            let inner = '';

            // baseline ghost bar
            const bs = this._gDay(item.baselineStart), be = this._gDay(item.baselineEnd);
            if (bs && be) {
                inner += `<div class="gt-baseline" style="left:${x(bs)}px;width:${Math.max(2, (this._gDiffDays(bs, be) + 1) * DAY_W)}px"
                    title="Baseline: ${item.baselineStart} → ${item.baselineEnd}"></div>`;
            }

            if (!s || !e) {
                inner += `<span class="gt-nodates" data-idx="${idx}" title="Click to set start and end dates">No dates — click to set</span>`;
            } else if (item.isMilestone) {
                inner += `<div class="gt-ms ${critCls} ${(parseFloat(item.progress) || 0) >= 100 ? 'is-done' : ''}"
                    data-idx="${idx}" style="left:${x(s)}px"
                    title="${item.id} — ${item.description || ''} · ${item.startDate}"></div>`;
            } else {
                const dur = this._gDiffDays(s, e) + 1;
                const w = Math.max(3, dur * DAY_W);
                const progress = Math.min(Math.max(parseFloat(item.progress) || 0, 0), 100);
                inner += `
                    <div class="gt-bar ${critCls}" data-idx="${idx}" data-start="${item.startDate}" data-end="${item.endDate}"
                        style="left:${x(s)}px;width:${w}px;background:${health.color}"
                        title="${item.id} — ${item.description || ''}&#10;${item.startDate} → ${item.endDate} · ${dur} day(s) · ${progress.toFixed(0)}% · ${esc(health.label)}${t ? (t.critical ? ' · CRITICAL' : ' · float ' + t.float + 'd') : ''}">
                        <div class="gt-fill" style="width:${progress}%"></div>
                        ${w > 62 ? `<span class="gt-bar-lbl">${item.id} · ${progress.toFixed(0)}%</span>` : ''}
                        <div class="gt-handle left" data-action="resize-left"></div>
                        <div class="gt-handle right" data-action="resize-right"></div>
                    </div>`;
            }

            html += this.renderScheduleRowCells(item, idx, t, health)
                 + `<div class="gt-cell-track" data-id="${item.id}" data-idx="${idx}" style="width:${trackW}px">${inner}</div>`;
        });

        // The today line spans the whole grid. It runs under the frozen
        // pane, which is opaque and sits at a higher z-index, so it is
        // correctly clipped without any extra maths.
        html += `<div class="gt-today" style="left:calc(var(--gt-lw) + ${x(today)}px)" title="Today"></div>
                 <svg class="gt-links" id="ganttLinks" style="left:var(--gt-lw);width:${trackW}px"></svg>`;

        grid.innerHTML = html;

        this._drawGanttLinks(items, cpm);
        this._attachGanttEvents(minDate, DAY_W, items);
    },

    /**
     * _drawGanttLinks - SVG connectors, predecessor end -> successor
     * start, drawn from live DOM geometry after layout settles.
     * Coordinates are relative to the track area, so the overlay does
     * not need to know the pane width beyond its own left offset.
     */
    _drawGanttLinks(items, cpm) {
        requestAnimationFrame(() => {
            const svg = document.getElementById('ganttLinks');
            const grid = document.getElementById('ganttGrid');
            if (!svg || !grid) return;
            const gr = grid.getBoundingClientRect();
            const lw = this._gLabelW();
            const HEAD = 44;   // header height, matches .gt-head-track in CSS
            let maxY = 0, paths = '';

            items.forEach(item => {
                const t = cpm.tById[item.id];
                if (!t || !t.preds.length) return;
                const toEl = grid.querySelector(`.gt-cell-track[data-id="${item.id}"] .gt-bar, .gt-cell-track[data-id="${item.id}"] .gt-ms`);
                if (!toEl) return;
                const tr = toEl.getBoundingClientRect();
                t.preds.forEach(pid => {
                    const fromEl = grid.querySelector(`.gt-cell-track[data-id="${pid}"] .gt-bar, .gt-cell-track[data-id="${pid}"] .gt-ms`);
                    if (!fromEl) return;
                    const fr = fromEl.getBoundingClientRect();
                    const x1 = fr.right - gr.left - lw, y1 = fr.top - gr.top + fr.height / 2 - HEAD;
                    const x2 = tr.left - gr.left - lw,  y2 = tr.top - gr.top + tr.height / 2 - HEAD;
                    maxY = Math.max(maxY, y1, y2);
                    const critical = cpm.tById[pid].critical && t.critical;
                    const color = critical ? 'var(--red)' : 'var(--ink-soft)';
                    const mid = Math.max(x1 + 8, x2 - 8);
                    paths += `<path d="M${x1},${y1} H${mid} V${y2} H${x2}" fill="none" stroke="${color}" stroke-width="1.3" opacity="0.6"/>` +
                             `<path d="M${x2},${y2} l-5,-3.4 v6.8 z" fill="${color}" opacity="0.6"/>`;
                });
            });
            svg.setAttribute('height', Math.max(0, maxY) + 40);
            svg.innerHTML = paths;
        });
    },

    /**
     * _wireGanttSplitter - drag the divider to resize the frozen pane.
     * The pane is sticky at left:0, so its right edge never moves
     * relative to the scroll box — which is what makes a plain absolute
     * position correct for the handle. Arrow keys work too, because a
     * resize control that only responds to a mouse is not a control.
     */
    _wireGanttSplitter() {
        const sp = document.getElementById('ganttSplitter');
        const box = document.getElementById('ganttBox');
        if (!sp || !box) return;
        const self = this;
        let dragging = false;

        const commit = px => {
            self._gLabelWUser = self._gSetLabelW(px);
            self._gCompact = false;
        };

        sp.addEventListener('pointerdown', e => {
            dragging = true;
            sp.setPointerCapture(e.pointerId);
            sp.classList.add('is-dragging');
            e.preventDefault();
        });
        sp.addEventListener('pointermove', e => {
            if (!dragging) return;
            commit(e.clientX - box.getBoundingClientRect().left);
        });
        sp.addEventListener('pointerup', () => {
            if (!dragging) return;
            dragging = false;
            sp.classList.remove('is-dragging');
            self._drawGanttLinks(self._sowItems || [], self._ganttMeta);
        });
        sp.addEventListener('keydown', e => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            commit(self._gLabelW() + (e.key === 'ArrowLeft' ? -24 : 24));
            self._drawGanttLinks(self._sowItems || [], self._ganttMeta);
            e.preventDefault();
        });
    },

    /**
     * _attachGanttEvents - Drag/resize with REAL persistence: on
     * pointerup the new dates are written through updateSOWItem, then
     * the chart re-renders so CPM, links and health recompute.
     * Click opens the task detail modal.
     *
     * v11: the maths is now in PIXELS against a known day width, so a
     * pixel delta converts to whole days exactly. The old percentage
     * version divided by the track's rendered width, which meant a drag
     * could land between two dates and round unpredictably — and it
     * broke outright whenever the track was narrower than the content.
     */
    _attachGanttEvents(minDate, dayW, items) {
        const self = this;
        const grid = document.getElementById('ganttGrid');
        if (!grid) return;

        let bar = null, mode = null, startX = 0, origLeft = 0, origWidth = 0, moved = false;

        const snap = px => Math.round(px / dayW) * dayW;

        const onMove = e => {
            if (!bar) return;
            const dx = e.clientX - startX;
            if (Math.abs(dx) > 3) moved = true;

            if (mode === 'resize-right') {
                bar.style.width = Math.max(dayW, snap(origWidth + dx)) + 'px';
            } else if (mode === 'resize-left') {
                const maxShift = origWidth - dayW;
                const shift = Math.min(snap(dx), maxShift);
                bar.style.left = Math.max(0, origLeft + shift) + 'px';
                bar.style.width = (origWidth - shift) + 'px';
            } else {
                bar.style.left = Math.max(0, snap(origLeft + dx)) + 'px';
            }

            const idx = parseInt(bar.dataset.idx, 10);
            if (!isNaN(idx) && items[idx]) {
                const [ns, ne] = self._gBarDates(bar, minDate, dayW);
                const tip = document.getElementById('ganttTooltip');
                if (tip) {
                    tip.textContent = `${items[idx].id}: ${self._gFmt(ns)} → ${self._gFmt(ne)}`;
                    tip.style.left = (e.clientX - 40) + 'px';
                    tip.style.top = (e.clientY - 34) + 'px';
                    tip.classList.add('show');
                }
            }
        };

        const onUp = async () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.getElementById('ganttTooltip')?.classList.remove('show');
            const b = bar;
            bar = null; mode = null;
            if (!b || !moved) return;

            const idx = parseInt(b.dataset.idx, 10);
            if (isNaN(idx) || !items[idx]) return;
            const item = items[idx];
            const [ns, ne] = self._gBarDates(b, minDate, dayW);
            const newStart = self._gFmt(ns), newEnd = self._gFmt(ne);
            if (newStart === item.startDate && newEnd === item.endDate) return;

            // v11 BATCH I2: a drag STAGES the change like every other
            // schedule edit. Dragging four bars and then pressing Save
            // once is the same shape of interaction as typing four
            // durations — and it means a mis-drag can be discarded.
            item.startDate = newStart;
            item.endDate = newEnd;
            self._schedDraft = self._schedDraft || {};
            self._schedDraft[item.id] = true;
            self._chainSuccessors().forEach(p => {
                const t = (self._sowItems || []).find(x => x.id === p.id);
                if (!t) return;
                t.startDate = p.startDate;
                t.endDate = p.endDate;
                self._schedDraft[p.id] = true;
            });
            self._paintSchedDirty();   // v11 BATCH I2b: paint before redraw
            self._renderGanttChart(self._data);
        };

        const begin = (el, e, m) => {
            bar = el; mode = m; moved = false;
            startX = e.clientX;
            origLeft = parseFloat(el.style.left) || 0;
            origWidth = parseFloat(el.style.width) || dayW;
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        };

        if (this._canEdit !== false) {
            grid.querySelectorAll('.gt-bar').forEach(el => {
                el.querySelectorAll('.gt-handle').forEach(h => {
                    h.addEventListener('pointerdown', e => { e.stopPropagation(); begin(el, e, h.dataset.action); });
                });
                el.addEventListener('pointerdown', e => {
                    if (e.target.closest('.gt-handle')) return;
                    begin(el, e, 'move');
                });
            });
        }

        // click-through to the task modal, from the bar, the diamond,
        // the "No dates" prompt, and the row in the frozen pane
        const openFrom = el => {
            const idx = parseInt(el.dataset.idx, 10);
            if (!isNaN(idx) && items[idx]) self.openTaskModal(items[idx].id);
        };
        grid.querySelectorAll('.gt-bar').forEach(el => {
            el.addEventListener('click', e => { if (!moved && !e.target.closest('.gt-handle')) openFrom(el); });
        });
        grid.querySelectorAll('.gt-ms, .gt-nodates').forEach(el => {
            el.addEventListener('click', () => openFrom(el));
        });
        grid.querySelectorAll('.gt-task').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.closest('.gt-cell-left')?.dataset.id;
                if (id) self.openTaskModal(id);
            });
        });

        // hover highlight spanning BOTH panes, so a row reads as one line
        grid.querySelectorAll('.gt-cell-left, .gt-cell-track').forEach(el => {
            el.addEventListener('mouseenter', () => self._gHighlight(el.dataset.id, true));
            el.addEventListener('mouseleave', () => self._gHighlight(el.dataset.id, false));
        });
    },

    /** _gBarDates - the start/end a bar's current pixel geometry means. */
    _gBarDates(bar, minDate, dayW) {
        const left = parseFloat(bar.style.left) || 0;
        const width = parseFloat(bar.style.width) || dayW;
        const startOffset = Math.round(left / dayW);
        const days = Math.max(1, Math.round(width / dayW));
        const ns = this._gAddDays(minDate, startOffset);
        return [ns, this._gAddDays(ns, days - 1)];
    },

    _gHighlight(id, on) {
        if (!id) return;
        document.querySelectorAll(`#ganttGrid [data-id="${id}"]`)
            .forEach(n => n.classList.toggle('is-hover', on));
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
        // v11 BATCH H5: a heading cannot be a predecessor. It has no dates
        // of its own — its span is reported from its children — so linking
        // to one would create a dependency on a date nobody set.
        const others = (this._sowItems || []).filter(s => s.id !== sowId && !s.isHeading);
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
                        <span class="stamp" style="transform:none;font-size:10px;background:${health.color};color:#fff;">${esc(health.label)}</span>
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
