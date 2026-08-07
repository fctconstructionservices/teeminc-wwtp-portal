// ================================================================
//  pages/knowledge-base.js — Knowledge Base Center (v11 BATCH F1)
//
//  PURPOSE: Item 11. One home for the company's master data and its
//  accumulated experience.
//
//    Materials  ·  Tools & Equipment  ·  Manpower  ·  Lessons Learned
//
//  WHY THE THREE DATABASES MOVED. They were three top-level pages with
//  three near-identical shells, sitting beside transactional pages like
//  Request Cash Advance in the home menu. They are not transactions —
//  they are reference data that outlives every project. Grouping them
//  says so, and it frees the home menu of three tiles that were rarely
//  the thing anyone came to do.
//
//  HOW IT AVOIDS A REWRITE. The content containers kept their original
//  ids — materialsContent, equipmentContent, manpowerContent — so
//  MaterialsPage, EquipmentPage and ManpowerPage were not touched at
//  all. They still render into exactly the element they always did; only
//  the element's parent changed. Nothing about their search, filters,
//  approval flow or modals is affected.
//
//  App.navigate('materials') and friends still work and land here on the
//  right tab, so old links, the search page's deep links and anything
//  cached in a browser keep working.
//
//  LOADING IS LAZY. Each database loads the first time its tab is opened
//  and is not reloaded on every switch. Opening the Knowledge Base to
//  read a lesson should not pull three full catalogues over the wire.
// ================================================================

const KnowledgeBasePage = {

    _tab: 'materials',
    _loaded: {},            // which tabs have fetched their data
    _lessons: [],
    _candidates: [],
    _retro: null,           // the retrospective currently under review
    _filter: 'all',

    TABS: {
        materials: { label: 'Materials',   sub: 'Master list · Search · Approval' },
        equipment: { label: 'Tools & Equipment', sub: 'Equipment inventory · Search · Approval' },
        manpower:  { label: 'Manpower',    sub: 'Roles & trades · Personnel' },
        suppliers: { label: 'Suppliers', sub: 'Contacts · Payment terms · Balances' },
        lessons:   { label: 'Lessons Learned', sub: 'Project retrospectives · Plan vs actual' }
    },

    /** load - entry point. `tab` lets App.navigate redirect straight in. */
    async load(tab) {
        if (tab && this.TABS[tab]) this._tab = tab;
        this._paintTab();
        await this._ensureLoaded(this._tab);
    },

    _paintTab() {
        document.querySelectorAll('.kb-tabs button').forEach(b =>
            b.classList.toggle('active', b.dataset.kb === this._tab));
        document.querySelectorAll('.kb-tab-content').forEach(el => el.classList.remove('active'));
        document.getElementById('kb-tab-' + this._tab)?.classList.add('active');

        const meta = this.TABS[this._tab];
        const crumb = document.getElementById('kbCrumb');
        const sub = document.getElementById('kbSub');
        if (crumb && meta) crumb.textContent = meta.label;
        if (sub && meta) sub.textContent = meta.sub;
    },

    async switchTab(tab) {
        if (!this.TABS[tab]) return;
        this._tab = tab;
        this._paintTab();
        await this._ensureLoaded(tab);
    },

    /** _ensureLoaded - fetch a tab's data once, not on every switch. */
    async _ensureLoaded(tab) {
        if (this._loaded[tab]) return;
        this._loaded[tab] = true;
        try {
            if (tab === 'materials') await MaterialsPage.load();
            else if (tab === 'equipment') await EquipmentPage.load();
            else if (tab === 'manpower') await ManpowerPage.load();
            else if (tab === 'suppliers') await this.loadSuppliers();
            else if (tab === 'lessons') await this.loadLessons();
        } catch (err) {
            // Let the tab be retried rather than staying permanently blank.
            this._loaded[tab] = false;
            UI.toast('Could not load ' + (this.TABS[tab] || {}).label + ': ' + (err.message || err), 'error');
        }
    },

    /** refresh - forces the current tab to re-fetch. */
    async refresh() {
        this._loaded[this._tab] = false;
        await this._ensureLoaded(this._tab);
    },

    // ─── LESSONS LEARNED ────────────────────────────────────────

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    _date(v) {
        if (!v) return '—';
        const d = new Date(v);
        return isNaN(d) ? String(v) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    },

    async loadLessons() {
        const box = document.getElementById('lessonsContent');
        if (!box) return;
        UI.showLoading(box);
        const [lessons, candidates] = await Promise.all([
            DataService.getLessons(),
            DataService.getRetrospectiveCandidates().catch(() => [])
        ]);
        this._lessons = lessons || [];
        this._candidates = candidates || [];
        this._renderLessons();
    },

    _renderLessons() {
        const box = document.getElementById('lessonsContent');
        if (!box) return;
        const e = this._esc.bind(this);

        const cats = ['all'].concat(
            Array.from(new Set(this._lessons.map(l => l.category).filter(Boolean))).sort());
        const shown = this._filter === 'all'
            ? this._lessons
            : this._lessons.filter(l => l.category === this._filter);

        // The waiting list is what stops this being forgotten. Every firm
        // means to write lessons learned; almost none do, because nobody
        // remembers to. The Knowledge Base says who is owed one.
        const waiting = this._candidates.length ? `
            <div class="kb-waiting">
                <div class="kb-waiting-head">
                    ${Icon.warning({size:13})}
                    <b>${this._candidates.length} finished project${this._candidates.length === 1 ? '' : 's'} without a retrospective</b>
                </div>
                <p>Everything needed is already recorded — baselines, budgets, actuals, daily reports,
                safety and punchlist. Generating one reads it and works out what happened.</p>
                <div class="kb-waiting-list">
                    ${this._candidates.map(c => `
                        <div class="kb-waiting-row">
                            <span><b>${e(c.name)}</b> <em>${e(c.clientName || '')}</em></span>
                            <button class="btn-sm primary" onclick="KnowledgeBasePage.generate('${e(c.id)}')">
                                Generate retrospective
                            </button>
                        </div>`).join('')}
                </div>
            </div>` : '';

        box.innerHTML = `
            <div class="section-head"><h2>Lessons Learned</h2><div class="rule"></div>
                <span class="badge">${this._lessons.length} record${this._lessons.length === 1 ? '' : 's'}</span>
                <button class="btn-sm" style="margin-left:8px;" onclick="KnowledgeBasePage.openLessonModal()">
                    ${Icon.plus({size:12})} Add lesson
                </button>
            </div>
            ${waiting}
            ${this._lessons.length ? `
                <div class="status-tabs" style="margin-bottom:12px;">
                    ${cats.map(c => `<button class="${this._filter === c ? 'active' : ''}"
                        onclick="KnowledgeBasePage.setFilter('${e(c)}')">${c === 'all' ? 'All' : e(c)}</button>`).join('')}
                </div>` : ''}
            ${shown.length ? `<div class="kb-lessons">${shown.map(l => this._lessonCard(l)).join('')}</div>`
                : `<div class="empty"><p>${this._lessons.length
                    ? 'No lessons in this category.'
                    : 'No lessons recorded yet. Generate a retrospective from a finished project above, or add one by hand.'}</p></div>`}`;
    },

    setFilter(c) { this._filter = c; this._renderLessons(); },

    _lessonCard(l) {
        const e = this._esc.bind(this);
        const m = l.metrics;
        const auto = l.source === 'auto';
        const highs = (l.suggestions || []).filter(s => s.priority === 'high').length;

        // A retrospective card leads with the three numbers a person
        // actually wants: did it finish late, did it cost more, and how
        // much attention does it need. Everything else is one click away.
        const strip = (auto && m) ? `
            <div class="kb-metrics">
                <div class="kb-metric ${m.overallSlipDays > 0 ? 'bad' : m.overallSlipDays < 0 ? 'good' : ''}">
                    <span>Schedule</span>
                    <b>${m.overallSlipDays === null ? 'No baseline'
                        : m.overallSlipDays === 0 ? 'On time'
                        : (m.overallSlipDays > 0 ? '+' : '') + m.overallSlipDays + 'd'}</b>
                </div>
                <div class="kb-metric ${m.costVariance < 0 ? 'bad' : 'good'}">
                    <span>Cost vs budget</span>
                    <b>${m.totalBudget ? (m.costVariance < 0 ? '−' : '+') + '₱' + fmtMoney(Math.abs(m.costVariance)) : 'No budget'}</b>
                </div>
                <div class="kb-metric">
                    <span>Man-days</span><b>${m.manDays || 0}</b>
                </div>
                <div class="kb-metric ${highs ? 'bad' : ''}">
                    <span>Priority actions</span><b>${highs}</b>
                </div>
            </div>` : '';

        return `
            <article class="kb-lesson">
                <header>
                    <div>
                        <span class="kb-cat ${auto ? 'is-auto' : ''}">${e(l.category)}</span>
                        <h3>${e(l.title)}</h3>
                        <p class="kb-lesson-meta">
                            ${l.projectName ? e(l.projectName) + ' · ' : ''}${this._date(l.capturedAt)}
                            ${auto ? ' · generated from recorded data' : ' · written by ' + e(l.capturedBy)}
                        </p>
                    </div>
                    <div class="kb-lesson-actions">
                        <button class="btn-sm" onclick="KnowledgeBasePage.openLesson('${e(l.id)}')">Open</button>
                        ${(App.getUser() || {}).role === 'superadmin'
                            ? `<button class="btn-sm danger" onclick="KnowledgeBasePage.deleteLesson('${e(l.id)}')">${Icon.trash({size:12})}</button>` : ''}
                    </div>
                </header>
                ${strip}
                ${l.recommendation ? `<p class="kb-lesson-rec">${e(l.recommendation)}</p>` : ''}
            </article>`;
    },

    async generate(projectId) {
        try {
            UI.toast('Reading the project record...', 'success');
            this._retro = await DataService.generateProjectRetrospective(projectId);
            this._openRetroModal();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * _openRetroModal - review before saving. The generator writes to
     * nothing until you have read it, because an auto-written record
     * that lands in the knowledge base unreviewed is how a knowledge base
     * fills with noise nobody trusts.
     */
    _openRetroModal(readOnly) {
        const r = this._retro;
        if (!r) return;
        const e = this._esc.bind(this);
        const m = r.metrics;
        document.getElementById('retroModal')?.remove();

        const prio = p => `<span class="kb-prio ${p}">${p}</span>`;

        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'retroModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:820px;">
                <button class="close-modal" onclick="document.getElementById('retroModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header">
                    <h2>Retrospective — ${e(r.projectName)}</h2>
                    <div class="print-meta">Plan versus actual across the full life cycle</div>
                </div>

                <div class="print-section"><div class="ps-title">Plan vs actual</div>
                    <table class="ps-table">
                        <thead><tr><th>Measure</th><th class="amt">Plan</th><th class="amt">Actual</th><th class="amt">Variance</th></tr></thead>
                        <tbody>
                            <tr><td>Finish date</td>
                                <td class="amt">${e(m.plannedFinish) || '—'}</td>
                                <td class="amt">${e(m.actualFinish) || '—'}</td>
                                <td class="amt">${m.overallSlipDays === null ? 'no baseline'
                                    : (m.overallSlipDays > 0 ? '+' : '') + m.overallSlipDays + ' day(s)'}</td></tr>
                            <tr><td>Cost</td>
                                <td class="amt">₱${fmtMoney(m.totalBudget)}</td>
                                <td class="amt">₱${fmtMoney(m.totalActual)}</td>
                                <td class="amt">${m.totalBudget ? (m.costVariance < 0 ? '−' : '+') + '₱' + fmtMoney(Math.abs(m.costVariance)) + ' (' + m.costVariancePct + '%)' : '—'}</td></tr>
                            <tr><td>Contract value</td>
                                <td class="amt">₱${fmtMoney(m.contractValue)}</td>
                                <td class="amt">₱${fmtMoney(m.contractValueRevised)}</td>
                                <td class="amt">${m.voCount} VO(s), ₱${fmtMoney(m.voValue)}</td></tr>
                            <tr><td>Billed / collected</td>
                                <td class="amt">₱${fmtMoney(m.billedNet)}</td>
                                <td class="amt">₱${fmtMoney(m.collected)}</td>
                                <td class="amt">₱${fmtMoney(m.billedNet - m.collected)} outstanding</td></tr>
                            <tr><td>SOW items late / early</td>
                                <td class="amt">${m.sowWithBaseline} baselined</td>
                                <td class="amt">${m.lateItems} late, ${m.earlyItems} early</td>
                                <td class="amt">of ${m.sowCount} items</td></tr>
                            <tr><td>Site effort</td>
                                <td class="amt">—</td>
                                <td class="amt">${m.manDays} man-days / ${m.workDays} days</td>
                                <td class="amt">${m.lostHours}h lost to issues</td></tr>
                            <tr><td>Safety</td>
                                <td class="amt">—</td>
                                <td class="amt">${m.toolboxTalks} talks</td>
                                <td class="amt">${m.incidents} incident(s), ${m.nearMisses} near miss(es)</td></tr>
                            <tr><td>Punchlist</td>
                                <td class="amt">—</td>
                                <td class="amt">${m.punchlistTotal} raised</td>
                                <td class="amt">${m.punchlistOpen} open at closeout</td></tr>
                        </tbody>
                    </table>
                </div>

                ${m.topDelays && m.topDelays.length ? `
                <div class="print-section"><div class="ps-title">Biggest delays</div>
                    <table class="ps-table">
                        <thead><tr><th>SOW</th><th>Description</th><th class="amt">Days late</th></tr></thead>
                        <tbody>${m.topDelays.map(d =>
                            `<tr><td>${e(d.id)}</td><td>${e(d.description)}</td><td class="amt">${d.days}</td></tr>`).join('')}</tbody>
                    </table>
                </div>` : ''}

                ${m.topOverruns && m.topOverruns.length ? `
                <div class="print-section"><div class="ps-title">Biggest overruns</div>
                    <table class="ps-table">
                        <thead><tr><th>SOW</th><th>Description</th><th class="amt">Budget</th><th class="amt">Actual</th><th class="amt">Over</th></tr></thead>
                        <tbody>${m.topOverruns.map(o =>
                            `<tr><td>${e(o.id)}</td><td>${e(o.description)}</td>
                             <td class="amt">₱${fmtMoney(o.budget)}</td><td class="amt">₱${fmtMoney(o.actual)}</td>
                             <td class="amt">+${o.overPct}%</td></tr>`).join('')}</tbody>
                    </table>
                </div>` : ''}

                <div class="print-section"><div class="ps-title">What the record shows</div>
                    <ul class="kb-findings">
                        ${r.findings.map(f => `<li><b>${e(f.area)}</b> ${e(f.text)}</li>`).join('')}
                    </ul>
                </div>

                <div class="print-section"><div class="ps-title">Suggested improvements</div>
                    <p style="font-size:11px;color:var(--ink-soft);margin:0 0 8px;">
                        Each one names the evidence it came from, so you can check it rather than take it on trust.
                    </p>
                    <ul class="kb-suggestions">
                        ${r.suggestions.map(s => `<li>
                            <div class="kb-sug-head">${prio(s.priority)}<b>${e(s.area)}</b></div>
                            <p>${e(s.text)}</p>
                            <cite>${e(s.evidence)}</cite>
                        </li>`).join('')}
                    </ul>
                </div>

                ${readOnly ? '' : `
                <div class="print-section"><div class="ps-title">Your notes</div>
                    <p style="font-size:11px;color:var(--ink-soft);margin:0 0 8px;">
                        The numbers cannot capture everything that mattered on site. Add what only a person knows.
                    </p>
                    <div class="field"><label>Title</label>
                        <input type="text" id="retro-title" value="Retrospective — ${e(r.projectName)}" /></div>
                    <div class="field"><label>What happened</label>
                        <textarea id="retro-what" rows="2" placeholder="The story behind the numbers"></textarea></div>
                    <div class="field"><label>Root cause</label>
                        <textarea id="retro-cause" rows="2" placeholder="Why it happened"></textarea></div>
                    <div class="field"><label>Recommendation</label>
                        <textarea id="retro-rec" rows="2" placeholder="What you would do differently"></textarea></div>
                </div>`}

                <div class="print-actions">
                    ${readOnly ? '' : `<button class="btn-primary" onclick="KnowledgeBasePage.saveRetro('${e(r.projectId)}')">Save to Knowledge Base</button>`}
                    <button class="btn-sm" onclick="PrintDoc.print({title:'Project Retrospective — ${e(r.projectName)}'})">${Icon.printer({size:12})} Print</button>
                    <button class="btn-ghost" onclick="document.getElementById('retroModal').remove()">Close</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    async saveRetro(projectId) {
        try {
            await DataService.saveProjectRetrospective(projectId, {
                title: document.getElementById('retro-title')?.value || '',
                whatHappened: document.getElementById('retro-what')?.value || '',
                rootCause: document.getElementById('retro-cause')?.value || '',
                recommendation: document.getElementById('retro-rec')?.value || ''
            });
            document.getElementById('retroModal')?.remove();
            UI.toast('Retrospective saved to the Knowledge Base.', 'success');
            await this.loadLessons();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    openLesson(id) {
        const l = this._lessons.find(x => x.id === id);
        if (!l) return;
        if (l.source === 'auto' && l.metrics) {
            this._retro = { projectId: l.projectId, projectName: l.projectName,
                metrics: l.metrics, findings: l.findings || [], suggestions: l.suggestions || [] };
            this._openRetroModal(true);
            return;
        }
        const e = this._esc.bind(this);
        document.getElementById('lessonModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'lessonModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:640px;">
                <button class="close-modal" onclick="document.getElementById('lessonModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header">
                    <h2>${e(l.title)}</h2>
                    <div class="print-meta">${e(l.category)}${l.projectName ? ' · ' + e(l.projectName) : ''} · ${this._date(l.capturedAt)}</div>
                </div>
                ${['whatHappened|What happened', 'rootCause|Root cause', 'impact|Impact', 'recommendation|Recommendation']
                    .map(pair => { const [k, label] = pair.split('|');
                        return l[k] ? `<div class="print-section"><div class="ps-title">${label}</div>
                            <p style="font-size:12.5px;white-space:pre-wrap;">${e(l[k])}</p></div>` : ''; }).join('')}
                <div class="print-actions">
                    <button class="btn-sm" onclick="PrintDoc.print({title:'${e(l.title)}'})">${Icon.printer({size:12})} Print</button>
                    <button class="btn-ghost" onclick="document.getElementById('lessonModal').remove()">Close</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    openLessonModal() {
        document.getElementById('addLessonModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'addLessonModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:560px;">
                <button class="close-modal" onclick="document.getElementById('addLessonModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>Add Lesson Learned</h2>
                    <div class="print-meta">Something worth carrying to the next project</div></div>
                <div class="field"><label>Title *</label>
                    <input type="text" id="ll-title" placeholder="e.g. Liner delivery lead time was underestimated" /></div>
                <div class="field"><label>Category</label>
                    <select id="ll-category">
                        <option>General</option><option>Schedule</option><option>Cost</option>
                        <option>Estimating</option><option>Commercial</option><option>Productivity</option>
                        <option>Safety</option><option>Quality</option><option>Process</option>
                        <option>Client</option><option>Supplier</option>
                    </select></div>
                <div class="field"><label>What happened</label><textarea id="ll-what" rows="2"></textarea></div>
                <div class="field"><label>Root cause</label><textarea id="ll-cause" rows="2"></textarea></div>
                <div class="field"><label>Impact</label><textarea id="ll-impact" rows="2"></textarea></div>
                <div class="field"><label>Recommendation</label><textarea id="ll-rec" rows="2"></textarea></div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="KnowledgeBasePage.submitLesson()">Save lesson</button>
                    <button class="btn-ghost" onclick="document.getElementById('addLessonModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('ll-title')?.focus(), 50);
    },

    async submitLesson() {
        const v = id => (document.getElementById(id)?.value || '').trim();
        if (!v('ll-title')) { UI.toast('A title is required.', 'error'); return; }
        try {
            await DataService.addLesson({
                title: v('ll-title'), category: v('ll-category'),
                whatHappened: v('ll-what'), rootCause: v('ll-cause'),
                impact: v('ll-impact'), recommendation: v('ll-rec')
            });
            document.getElementById('addLessonModal')?.remove();
            UI.toast('Lesson saved.', 'success');
            await this.loadLessons();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    // ─── SUPPLIERS (v11 BATCH G1) ───────────────────────────────
    // Master data, so it belongs here beside Materials and Equipment.
    // The column that matters is payment terms: it is what sets the due
    // date on every payable.

    _suppliers: [],

    async loadSuppliers() {
        const box = document.getElementById('suppliersContent');
        if (!box) return;
        UI.showLoading(box);
        this._suppliers = await DataService.getSuppliers();
        this._renderSuppliers();
    },

    _renderSuppliers() {
        const box = document.getElementById('suppliersContent');
        if (!box) return;
        const e = this._esc.bind(this);
        const list = this._suppliers || [];
        const owed = list.reduce((s, x) => s + (parseFloat(x.outstanding) || 0), 0);

        box.innerHTML = `
            <div class="section-head"><h2>Suppliers</h2><div class="rule"></div>
                <span class="badge">${list.length} supplier${list.length === 1 ? '' : 's'}</span>
                <button class="btn-sm primary" style="margin-left:8px;" onclick="KnowledgeBasePage.openSupplierModal()">
                    ${Icon.plus({size:12})} Add supplier
                </button>
            </div>
            <p class="data-source-note" style="margin-bottom:14px;">
                Payment terms live here. Every payable's due date is computed from them, so getting the
                terms right on this page is what makes the payables list mean anything.
            </p>
            ${list.length ? `<div class="scroll-x"><table class="kb-supp-table">
                <thead><tr><th>Supplier</th><th>Contact</th><th>Terms</th><th>TIN</th>
                    <th>VAT</th><th class="amt">Outstanding</th><th></th></tr></thead>
                <tbody>${list.map(s => `<tr class="${s.status === 'inactive' ? 'is-inactive' : ''}">
                    <td><b>${e(s.name)}</b>${s.category ? `<div class="muted">${e(s.category)}</div>` : ''}
                        ${s.status === 'inactive' ? '<span class="stamp">Inactive</span>' : ''}</td>
                    <td>${e(s.contactPerson) || '—'}<div class="muted">${e(s.contactNumber)}</div></td>
                    <td>${e(s.termsLabel)}</td>
                    <td class="mono">${e(s.tin) || '—'}</td>
                    <td>${s.vatRegistered ? 'VAT' : 'Non-VAT'}</td>
                    <td class="amt">${s.outstanding ? '₱' + fmtMoney(s.outstanding) : '—'}</td>
                    <td><button class="btn-sm" onclick="KnowledgeBasePage.openSupplierModal('${e(s.id)}')">${Icon.pencil({size:12})}</button>
                        ${(App.getUser() || {}).role === 'superadmin'
                            ? `<button class="btn-sm danger" onclick="KnowledgeBasePage.deleteSupplier('${e(s.id)}')">${Icon.trash({size:12})}</button>` : ''}</td>
                </tr>`).join('')}</tbody>
                ${owed ? `<tfoot><tr><td colspan="5">Total outstanding</td>
                    <td class="amt">₱${fmtMoney(owed)}</td><td></td></tr></tfoot>` : ''}
            </table></div>`
            : '<div class="empty"><p>No suppliers yet. Add the ones you buy from — their payment terms are what make the payables list work.</p></div>'}`;
    },

    openSupplierModal(id) {
        const s = id ? (this._suppliers || []).find(x => x.id === id) : null;
        const e = this._esc.bind(this);
        const TERMS = [0, 7, 15, 30, 45, 60, 90];
        document.getElementById('suppModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'suppModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:560px;">
                <button class="close-modal" onclick="document.getElementById('suppModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>${s ? 'Edit supplier' : 'Add supplier'}</h2>
                    <div class="print-meta">${s ? e(s.name) : 'Payment terms set every due date'}</div></div>
                <div class="field"><label>Name *</label><input type="text" id="sp-name" value="${e(s ? s.name : '')}" /></div>
                <div class="db-form-grid">
                    <div class="field"><label>Contact person</label><input type="text" id="sp-person" value="${e(s ? s.contactPerson : '')}" /></div>
                    <div class="field"><label>Contact number</label><input type="text" id="sp-number" value="${e(s ? s.contactNumber : '')}" /></div>
                    <div class="field"><label>Email</label><input type="text" id="sp-email" value="${e(s ? s.email : '')}" /></div>
                    <div class="field"><label>TIN</label><input type="text" id="sp-tin" value="${e(s ? s.tin : '')}" /></div>
                    <div class="field"><label>Payment terms *</label>
                        <select id="sp-terms">${TERMS.map(t =>
                            `<option value="${t}" ${s && parseInt(s.termsDays,10) === t ? 'selected' : (!s && t === 30 ? 'selected' : '')}>${t === 0 ? 'Cash on delivery' : t + ' days from delivery'}</option>`).join('')}</select>
                        <p style="font-size:11px;color:var(--ink-soft);margin-top:4px;">This sets the due date on every payable from this supplier.</p></div>
                    <div class="field"><label>Category</label><input type="text" id="sp-cat" value="${e(s ? s.category : '')}" placeholder="e.g. Aggregates, Geosynthetics" /></div>
                </div>
                <div class="field"><label>Address</label><input type="text" id="sp-address" value="${e(s ? s.address : '')}" /></div>
                <div style="display:flex;gap:18px;flex-wrap:wrap;margin:6px 0 10px;">
                    <label style="display:flex;gap:6px;align-items:center;font-size:12px;">
                        <input type="checkbox" id="sp-vat" ${!s || s.vatRegistered ? 'checked' : ''} style="width:auto;" /> VAT-registered</label>
                    <label style="display:flex;gap:6px;align-items:center;font-size:12px;">
                        <input type="checkbox" id="sp-incl" ${!s || s.pricesIncludeVat ? 'checked' : ''} style="width:auto;" /> Prices include VAT</label>
                    ${s ? `<label style="display:flex;gap:6px;align-items:center;font-size:12px;">
                        <input type="checkbox" id="sp-inactive" ${s.status === 'inactive' ? 'checked' : ''} style="width:auto;" /> Inactive</label>` : ''}
                </div>
                <div class="field"><label>Notes</label><textarea id="sp-notes" rows="2">${e(s ? s.notes : '')}</textarea></div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="KnowledgeBasePage.saveSupplier('${e(id || '')}')">Save</button>
                    <button class="btn-ghost" onclick="document.getElementById('suppModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('sp-name')?.focus(), 50);
    },

    async saveSupplier(id) {
        const v = x => (document.getElementById(x)?.value || '').trim();
        const c = x => !!document.getElementById(x)?.checked;
        if (!v('sp-name')) { UI.toast('Supplier name is required.', 'error'); return; }
        const data = {
            name: v('sp-name'), contactPerson: v('sp-person'), contactNumber: v('sp-number'),
            email: v('sp-email'), tin: v('sp-tin'), termsDays: v('sp-terms'),
            category: v('sp-cat'), address: v('sp-address'), notes: v('sp-notes'),
            vatRegistered: c('sp-vat'), pricesIncludeVat: c('sp-incl')
        };
        if (id) data.status = c('sp-inactive') ? 'inactive' : 'active';
        try {
            if (id) await DataService.updateSupplier(id, data);
            else await DataService.addSupplier(data);
            document.getElementById('suppModal')?.remove();
            UI.toast('Supplier saved.', 'success');
            await this.loadSuppliers();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async deleteSupplier(id) {
        const s = (this._suppliers || []).find(x => x.id === id);
        const ok = await Confirm.open(`Delete ${s ? s.name : id}?`,
            'If this supplier has purchase orders or invoices they will be deactivated instead of deleted — an unpaid invoice pointing at a supplier who no longer exists is a debt you cannot chase.');
        if (!ok) return;
        try {
            const res = await DataService.deleteSupplier(id);
            UI.toast(res.deactivated
                ? `Deactivated — ${res.references} record(s) still reference this supplier.`
                : 'Supplier deleted.', 'success');
            await this.loadSuppliers();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async deleteLesson(id) {
        const l = this._lessons.find(x => x.id === id);
        const ok = await Confirm.open('Delete this lesson?',
            `"${l ? l.title : id}" will be removed from the Knowledge Base permanently.` +
            (l && l.source === 'auto' ? ' It can be regenerated from the project record afterwards.' : ''));
        if (!ok) return;
        try {
            await DataService.deleteLesson(id);
            UI.toast('Lesson deleted.', 'success');
            await this.loadLessons();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
};
