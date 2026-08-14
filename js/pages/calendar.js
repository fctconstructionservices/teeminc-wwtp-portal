// ================================================================
//  pages/calendar.js — The month, and the work on it. (v18)
//
//  Sits at the top of the dashboard. A month grid where each day shows
//  what is due; clicking a day opens it; a Super Admin or Admin can
//  assign from there.
//
//  ── WHY A MONTH GRID AND NOT A LIST ─────────────────────────
//
//  A list answers "what is next". A month answers "when is the quiet
//  week", which is the question you ask when deciding WHEN to schedule
//  something rather than what to do now. The dashboard already has
//  several lists; it had nothing that showed shape over time.
//
//  ── THE ONE RULE ────────────────────────────────────────────
//
//  You cannot mark a task done without whatever proof was asked for.
//  The check is on the server; this is the courtesy copy so the person
//  finds out before they have typed anything.
// ================================================================

const CalendarPanel = {

    _month: null,
    _data: null,
    _selected: null,

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _today() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
               '-' + String(d.getDate()).padStart(2, '0');
    },

    async mount(el) {
        if (!el) return;
        this._month = this._month || this._today().slice(0, 7);
        el.innerHTML = '<div class="cal-shell"><div class="cal-loading">Loading the month…</div></div>';
        await this.load(el);
    },

    async load(el) {
        this._host = el || this._host;
        try {
            this._data = await DataService.getTasksForMonth(this._month);
        } catch (err) {
            this._host.innerHTML =
                `<div class="cal-shell"><div class="cal-loading">Could not load: ${this._esc(err.message)}</div></div>`;
            return;
        }
        this._paint();
    },

    async shift(n) {
        const [y, m] = this._month.split('-').map(Number);
        const d = new Date(y, m - 1 + n, 1);
        this._month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        this._selected = null;
        await this.load();
    },

    async goToday() {
        this._month = this._today().slice(0, 7);
        this._selected = this._today();
        await this.load();
    },

    _paint() {
        const e = this._esc.bind(this);
        const d = this._data || { tasks: [], byDay: {} };
        const today = this._today();
        const [y, m] = this._month.split('-').map(Number);

        const first = new Date(y, m - 1, 1);
        const daysInMonth = new Date(y, m, 0).getDate();
        // Monday-first: a construction week starts on Monday, and a grid
        // that starts on Sunday puts the weekend in the middle of the
        // working week at a glance.
        const lead = (first.getDay() + 6) % 7;

        const user = App.getUser() || {};
        const canAssign = user.role === 'superadmin' || user.role === 'admin';

        const monthName = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        let cells = '';
        for (let i = 0; i < lead; i++) cells += '<div class="cal-day is-blank"></div>';

        for (let day = 1; day <= daysInMonth; day++) {
            const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const c = d.byDay[iso] || { total: 0, open: 0, overdue: 0, mine: 0 };
            const isToday = iso === today;
            const isSel = iso === this._selected;
            const isPast = iso < today;
            const weekend = [0, 6].indexOf(new Date(y, m - 1, day).getDay()) > -1;

            cells += `<button class="cal-day${isToday ? ' is-today' : ''}${isSel ? ' is-sel' : ''}${weekend ? ' is-weekend' : ''}${isPast ? ' is-past' : ''}"
                onclick="CalendarPanel.pick('${iso}')" aria-label="${iso}, ${c.total} task(s)">
                <span class="cal-n">${day}</span>
                ${c.total ? `<span class="cal-marks">
                    ${c.overdue ? `<span class="cal-pip d" title="${c.overdue} overdue"></span>` : ''}
                    ${c.open - c.overdue > 0 ? `<span class="cal-pip a"></span>` : ''}
                    ${c.total - c.open > 0 ? `<span class="cal-pip g"></span>` : ''}
                </span>
                <span class="cal-cnt${c.mine ? ' is-mine' : ''}">${c.total}</span>` : ''}
            </button>`;
        }

        const sel = this._selected;
        const dayTasks = sel ? d.tasks.filter(t => t.dueDate === sel) : [];

        this._host.innerHTML = `
        <div class="cal-shell">
            <div class="cal-head">
                <button class="cal-nav" onclick="CalendarPanel.shift(-1)" aria-label="Previous month">‹</button>
                <b>${e(monthName)}</b>
                <button class="cal-nav" onclick="CalendarPanel.shift(1)" aria-label="Next month">›</button>
                <button class="cal-today" onclick="CalendarPanel.goToday()">Today</button>
                <span class="cal-legend">
                    <span><i class="cal-pip d"></i>overdue</span>
                    <span><i class="cal-pip a"></i>open</span>
                    <span><i class="cal-pip g"></i>done</span>
                </span>
                ${canAssign ? `<button class="btn-sm primary cal-add"
                    onclick="CalendarPanel.openNew('${sel || today}')">+ Assign a task</button>` : ''}
            </div>

            <div class="cal-dow">
                ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                    .map(x => `<span>${x}</span>`).join('')}
            </div>
            <div class="cal-grid">${cells}</div>

            ${sel ? `<div class="cal-day-panel">
                <div class="cdp-head">
                    <b>${e(new Date(sel + 'T00:00:00').toLocaleDateString('en-US',
                        { weekday: 'long', day: 'numeric', month: 'long' }))}</b>
                    <span class="muted">${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'}</span>
                    ${canAssign ? `<button class="btn-sm" onclick="CalendarPanel.openNew('${sel}')">+ Assign</button>` : ''}
                    <button class="btn-sm" onclick="CalendarPanel.pick('')">Close</button>
                </div>
                ${dayTasks.length ? dayTasks.map(t => this._task(t)).join('')
                    : '<div class="cdp-empty">Nothing due on this day.</div>'}
            </div>` : ''}
        </div>`;
    },

    _task(t) {
        const e = this._esc.bind(this);
        const done = t.status === 'done';
        const cancelled = t.status === 'cancelled';
        const overdue = !done && !cancelled && t.dueDate < this._today();
        const user = App.getUser() || {};
        const canManage = user.role === 'superadmin' || user.role === 'admin';

        return `<div class="cdp-task${done ? ' is-done' : ''}${cancelled ? ' is-cancelled' : ''}${overdue ? ' is-overdue' : ''}${t.priority === 'high' ? ' is-high' : ''}">
            <div class="cdp-main">
                <div class="cdp-title">
                    ${done ? Icon.check({ size: 12 }) : ''}${e(t.title)}
                    ${t.priority === 'high' && !done ? '<span class="cdp-flag">high</span>' : ''}
                    ${t.proofRequired !== 'none' && !done
                        ? `<span class="cdp-flag proof">${t.proofRequired === 'file' ? 'photo required' : 'note required'}</span>` : ''}
                </div>
                ${t.detail ? `<p class="cdp-detail">${e(t.detail)}</p>` : ''}
                <div class="cdp-meta">
                    ${t.isMine ? '<b>You</b>' : e(t.assignedToName)}
                    · assigned by ${e(t.assignedByName)}
                    ${t.projectId ? ' · ' + e(t.projectId) : ''}
                    ${overdue ? ' · <b class="od">overdue</b>' : ''}
                </div>

                ${done ? `<div class="cdp-proof">
                    Completed by ${e(t.completedByName)}${t.completedAt ? ' · ' + e(String(t.completedAt).slice(0, 10)) : ''}
                    ${t.proofNote ? `<p>${e(t.proofNote)}</p>` : ''}
                    ${t.proofUrl ? `<a href="${e(t.proofUrl)}" target="_blank" rel="noopener">View proof</a>` : ''}
                </div>` : ''}
                ${t.reopenedAt ? `<div class="cdp-reopen">Reopened — the completion above is kept as a record.</div>` : ''}
            </div>

            <div class="cdp-actions">
                ${!done && !cancelled && t.canComplete
                    ? `<button class="btn-sm primary" onclick="CalendarPanel.openComplete('${e(t.id)}')">Mark done</button>` : ''}
                ${done && canManage
                    ? `<button class="btn-sm" onclick="CalendarPanel.reopen('${e(t.id)}')">Reopen</button>` : ''}
                ${!done && !cancelled && canManage
                    ? `<button class="btn-sm danger" onclick="CalendarPanel.cancel('${e(t.id)}')">Cancel</button>` : ''}
            </div>
        </div>`;
    },

    pick(iso) {
        this._selected = iso || null;
        this._paint();
    },

    // ─── assigning ───────────────────────────────────────────

    async openNew(iso) {
        const e = this._esc.bind(this);
        let people = [];
        try {
            const home = await DataService.getHomeData();
            people = (home && home.users) || [];
        } catch (err) { /* the picker degrades to a typed email */ }

        document.getElementById('taskModal')?.remove();
        const m = document.createElement('div');
        m.className = 'print-modal-overlay open';
        m.id = 'taskModal';
        m.innerHTML = `
            <div class="print-modal-content" style="max-width:520px;">
                <button class="close-modal" onclick="document.getElementById('taskModal').remove()">${Icon.close({ size: 18 })}</button>
                <div class="print-header"><h2>Assign a task</h2>
                    <div class="print-meta">The person is emailed straight away</div></div>

                <div class="field"><label>What needs doing *</label>
                    <input type="text" id="tk-title" maxlength="200"
                        placeholder="e.g. Chase AgriFarms on PB-02" /></div>

                <div class="field"><label>Detail</label>
                    <textarea id="tk-detail" rows="2"
                        placeholder="Anything the person needs to know to do it"></textarea></div>

                <div class="db-form-grid">
                    <div class="field"><label>Who *</label>
                        <select id="tk-to">
                            <option value="">Select a person...</option>
                            ${people.filter(p => String(p.status || 'active').toLowerCase() !== 'inactive')
                                .map(p => `<option value="${e(p.email)}">${e(p.name || p.email)}</option>`).join('')}
                        </select></div>
                    <div class="field"><label>Due *</label>
                        <input type="date" id="tk-due" value="${e(iso)}" /></div>
                </div>

                <div class="db-form-grid">
                    <div class="field"><label>Priority</label>
                        <select id="tk-pri">
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="low">Low</option>
                        </select></div>
                    <div class="field"><label>Proof of completion</label>
                        <select id="tk-proof">
                            <option value="none">Not required</option>
                            <option value="note">A note saying what was done</option>
                            <option value="file">A photo or file</option>
                        </select></div>
                </div>

                <div class="pr-budget-box" style="margin-top:10px;">
                    <b>About proof</b>
                    <p>Decide now, while you know whether it matters. When proof is required the task
                    cannot be marked done without it — and the proof stays attached even if the task
                    is later reopened.</p>
                </div>

                <div class="print-actions">
                    <button class="btn-primary" id="tk-go" onclick="CalendarPanel.create(this)">Assign</button>
                    <button class="btn-ghost" onclick="document.getElementById('taskModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        setTimeout(() => document.getElementById('tk-title')?.focus(), 60);
    },

    async create(btn) {
        const v = id => (document.getElementById(id)?.value || '').trim();
        if (!v('tk-title')) { UI.toast('Give the task a title.', 'error'); return; }
        if (!v('tk-to')) { UI.toast('Choose who it is for.', 'error'); return; }
        if (!v('tk-due')) { UI.toast('Pick a due date.', 'error'); return; }

        await Busy.run(btn, 'Assigning', async () => {
            try {
                await DataService.createTask({
                    title: v('tk-title'), detail: v('tk-detail'),
                    assignedTo: v('tk-to'), dueDate: v('tk-due'),
                    priority: v('tk-pri'), proofRequired: v('tk-proof')
                });
                document.getElementById('taskModal')?.remove();
                UI.toast('Task assigned and emailed.', 'success');
                this._selected = v('tk-due');
                this._month = v('tk-due').slice(0, 7);
                await this.load();
            } catch (err) { UI.toast('' + err.message, 'error'); }
        });
    },

    // ─── completing ──────────────────────────────────────────

    openComplete(id) {
        const t = (this._data.tasks || []).find(x => x.id === id);
        if (!t) return;
        const e = this._esc.bind(this);
        const need = t.proofRequired;

        document.getElementById('doneModal')?.remove();
        const m = document.createElement('div');
        m.className = 'print-modal-overlay open';
        m.id = 'doneModal';
        m.innerHTML = `
            <div class="print-modal-content" style="max-width:460px;">
                <button class="close-modal" onclick="document.getElementById('doneModal').remove()">${Icon.close({ size: 18 })}</button>
                <div class="print-header"><h2>Mark done</h2>
                    <div class="print-meta">${e(t.title)}</div></div>

                ${need !== 'none' ? `<div class="pr-budget-box near">
                    <b>${need === 'file' ? 'A photo or file is required' : 'A note is required'}</b>
                    <p>This was set when the task was assigned. It cannot be completed without it.</p>
                </div>` : ''}

                <div class="field"><label>What was done${need === 'note' ? ' *' : ''}</label>
                    <textarea id="dn-note" rows="3"
                        placeholder="e.g. Called Ms Reyes, payment promised by Friday"></textarea></div>

                <div class="field"><label>Photo or file${need === 'file' ? ' *' : ''}</label>
                    <div class="file-drop"><input type="file" id="dn-file" /></div></div>

                <div class="print-actions">
                    <button class="btn-primary" onclick="CalendarPanel.complete('${e(id)}', this)">Mark done</button>
                    <button class="btn-ghost" onclick="document.getElementById('doneModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(m);
    },

    async complete(id, btn) {
        const note = (document.getElementById('dn-note')?.value || '').trim();
        const file = document.getElementById('dn-file')?.files?.[0];

        await Busy.run(btn, 'Saving', async () => {
            try {
                const proof = { note: note };
                if (file) {
                    proof.fileBase64 = await fileToBase64_(file);
                    proof.fileName = file.name;
                    proof.fileMime = file.type;
                }
                await DataService.completeTask(id, proof);
                document.getElementById('doneModal')?.remove();
                UI.toast('Marked done.', 'success');
                await this.load();
            } catch (err) { UI.toast('' + err.message, 'error'); }
        });
    },

    async reopen(id) {
        const ok = await Confirm.open('Reopen this task?',
            'The completion and any proof are kept — the record will show both attempts.');
        if (!ok) return;
        try {
            await DataService.reopenTask(id, '');
            UI.toast('Reopened.', 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async cancel(id) {
        const ok = await Confirm.open('Cancel this task?',
            'It stays on the calendar marked cancelled, so the person it was assigned to can see ' +
            'what happened to it rather than finding it gone.');
        if (!ok) return;
        try {
            await DataService.cancelTask(id, '');
            UI.toast('Cancelled.', 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
};
