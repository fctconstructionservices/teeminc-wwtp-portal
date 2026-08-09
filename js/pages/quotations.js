// ================================================================
//  pages/quotations.js — Quotation lifecycle (v11 BATCH F2)
//
//  PURPOSE: Item 9. Work still being priced gets its own status, its own
//  reference number, revision tracking, and a clean transition to Ongoing
//  the day it is awarded.
//
//  THE KEY IDEA, worth knowing before reading anything below: a
//  quotation IS a project row with status 'Quotation'. So the moment you
//  create one, the full SOW Budget tab, Estimates editor, DUPA print and
//  Timeline are available to price it — none of that was rebuilt. This
//  page is only the commercial wrapper around it: who it is for, what
//  number, which revision, what price, and the decision.
//
//  Awarding copies nothing. Everything priced during tendering was
//  already keyed to the project id, so award flips the status, writes the
//  contract value and saves the baseline. See 28-QuotationService.gs.
//
//  MARGIN IS SHOWN THROUGHOUT. The estimate line items give the COST; the
//  quoted amount is the PRICE. The gap between them is the only number
//  that decides whether the job is worth winning, and the only moment it
//  can still be changed is before the quotation goes out — so it is on
//  the card, not buried in a report.
// ================================================================

const QuotationsPage = {

    _all: [],
    _filter: 'open',
    _clients: [],

    STATUS_ORDER: ['Draft', 'Sent', 'Under Negotiation', 'Won', 'Lost'],

    async load() {
        const container = document.getElementById('quotationsContent');
        if (!container) return;
        UI.showLoading(container);
        try {
            const [quotes, clients] = await Promise.all([
                DataService.getQuotations(),
                DataService.getClients().catch(() => [])
            ]);
            this._all = quotes || [];
            this._clients = clients || [];
            this._render();
        } catch (err) {
            UI.toast('Could not load quotations: ' + (err.message || err), 'error');
        }
    },

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
    _get(id) { return this._all.find(q => q.id === id); },

    _filtered() {
        if (this._filter === 'all') return this._all;
        if (this._filter === 'open') {
            return this._all.filter(q => ['Draft', 'Sent', 'Under Negotiation'].includes(q.status));
        }
        return this._all.filter(q => q.status === this._filter);
    },

    _render() {
        const container = document.getElementById('quotationsContent');
        const e = this._esc.bind(this);
        const counts = {};
        this.STATUS_ORDER.forEach(s => { counts[s] = this._all.filter(q => q.status === s).length; });
        const open = counts.Draft + counts.Sent + counts['Under Negotiation'];

        // Win rate is only meaningful once bids have actually been
        // decided, so it is computed on decided ones and stays hidden
        // until there are any — a "0% win rate" on a fresh system is
        // noise, not information.
        const decided = counts.Won + counts.Lost;
        const winRate = decided ? Math.round(counts.Won / decided * 100) : null;
        const pipeline = this._all
            .filter(q => ['Draft', 'Sent', 'Under Negotiation'].includes(q.status))
            .reduce((s, q) => s + (parseFloat(q.quotedValue) || 0), 0);

        const list = this._filtered();

        container.innerHTML = `
            <div class="section-head"><h2>Quotations</h2><div class="rule"></div>
                <span class="badge">${open} open</span>
                <button class="btn-sm primary" style="margin-left:8px;" onclick="QuotationsPage.openCreateModal()">
                    ${Icon.plus({size:12})} New quotation
                </button>
            </div>

            <div class="kpi-strip" style="margin-bottom:16px;">
                <div class="kpi-card"><div class="k-label">Open bids</div><div class="k-val">${open}</div>
                    <div class="k-sub">being priced or with the client</div></div>
                <div class="kpi-card good"><div class="k-label">Pipeline value</div>
                    <div class="k-val mono">₱${fmtMoney(pipeline)}</div>
                    <div class="k-sub">quoted, not yet decided</div></div>
                <div class="kpi-card"><div class="k-label">Won / Lost</div>
                    <div class="k-val">${counts.Won} / ${counts.Lost}</div></div>
                <div class="kpi-card ${winRate === null ? '' : winRate >= 50 ? 'good' : 'warn'}">
                    <div class="k-label">Win rate</div>
                    <div class="k-val">${winRate === null ? '—' : winRate + '%'}</div>
                    <div class="k-sub">${winRate === null
                        ? 'no decided bids yet'
                        : 'of ' + decided + ' decided bid' + (decided === 1 ? '' : 's')}</div></div>
            </div>

            <div class="status-tabs" style="margin-bottom:14px;">
                <button class="${this._filter === 'open' ? 'active' : ''}" onclick="QuotationsPage.setFilter('open')">Open (${open})</button>
                ${this.STATUS_ORDER.map(s =>
                    `<button class="${this._filter === s ? 'active' : ''}" onclick="QuotationsPage.setFilter('${s}')">${s} (${counts[s]})</button>`).join('')}
                <button class="${this._filter === 'all' ? 'active' : ''}" onclick="QuotationsPage.setFilter('all')">All (${this._all.length})</button>
            </div>

            ${list.length
                ? this._table(list)
                : `<div class="empty"><p>${this._all.length
                    ? 'No quotations with this status.'
                    : 'No quotations yet. Create one to start pricing a job — you get the full SOW and Estimates tools straight away.'}</p></div>`}`;
    },

    setFilter(f) { this._filter = f; this._render(); },

    /**
     * _table (v11 BATCH I3) - Replaces the card grid, for the same reason
     * the purchase requests did: cards suit a handful and stop working at
     * thirty. You cannot scan a column of values, or compare two bids,
     * when each one is its own box — and comparing bids is most of what
     * this page is for.
     */
    /**
     * duplicate (v12) - Copy a quotation into a new one.
     *
     * Most quotations are a variation on one already priced: the same
     * liner, one cell instead of two. Re-typing forty SOW items to
     * change three is how quoting becomes the bottleneck — and how a
     * transcription error gets into a price you are held to.
     *
     * The confirm states REAL COUNTS from the server, not a vague
     * promise about "the scope and estimates", and says plainly what is
     * left behind. A copy inherits what you PLANNED and none of what
     * HAPPENED.
     */
    async duplicate(projectId, title) {
        try {
            const pv = await DataService.duplicatePreview(projectId);
            const e = this._esc.bind(this);
            document.getElementById('dupModal')?.remove();
            const m = document.createElement('div');
            m.className = 'print-modal-overlay open';
            m.id = 'dupModal';
            m.innerHTML = `
                <div class="print-modal-content" style="max-width:520px;">
                    <button class="close-modal" onclick="document.getElementById('dupModal').remove()">${Icon.close({size:18})}</button>
                    <div class="print-header"><h2>Copy this quotation</h2>
                        <div class="print-meta">From ${e(pv.sourceName)}</div></div>

                    <div class="field"><label>Name for the copy *</label>
                        <input type="text" id="dup-name" value="${e(title)} (copy)" /></div>
                    <div class="db-form-grid">
                        <div class="field"><label>Client</label>
                            <input type="text" id="dup-client" placeholder="Leave blank to keep the same" /></div>
                        <div class="field"><label>Start date</label>
                            <input type="date" id="dup-start" value="${new Date().toISOString().slice(0,10)}" /></div>
                    </div>

                    <div class="pr-budget-box" style="margin-top:12px;">
                        <b>What comes across</b>
                        <p>${pv.sowItems} SOW item${pv.sowItems === 1 ? '' : 's'}${pv.titles ? ` (${pv.titles} title${pv.titles === 1 ? '' : 's'})` : ''},
                        ${pv.estimateGroups} estimate${pv.estimateGroups === 1 ? '' : 's'} with ${pv.estimateLines}
                        priced line${pv.estimateLines === 1 ? '' : 's'} worth ${this._peso(pv.estimateValue)},
                        and the schedule shifted to your new start date.</p>
                    </div>
                    <div class="pr-budget-box near" style="margin-top:8px;">
                        <b>What does not</b>
                        <p>No billings, cash, daily records, purchases or approvals — a copy inherits
                        what you planned, not what happened.
                        ${pv.approvedGroups ? `The ${pv.approvedGroups} approved estimate${pv.approvedGroups === 1 ? '' : 's'}
                        come${pv.approvedGroups === 1 ? 's' : ''} across as <b>draft</b>, so the prices get reviewed
                        before you quote from them.` : ''}</p>
                    </div>

                    <div class="print-actions">
                        <button class="btn-primary" onclick="QuotationsPage.doDuplicate('${e(projectId)}')">Create the copy</button>
                        <button class="btn-ghost" onclick="document.getElementById('dupModal').remove()">Cancel</button>
                    </div>
                </div>`;
            document.body.appendChild(m);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async doDuplicate(projectId) {
        const v = x => (document.getElementById(x)?.value || '').trim();
        if (!v('dup-name')) { UI.toast('Give the copy a name.', 'error'); return; }
        const btn = document.querySelector('#dupModal .btn-primary');
        if (btn) { btn.textContent = 'Copying...'; btn.disabled = true; }
        try {
            const res = await DataService.duplicateProject(projectId, {
                name: v('dup-name'), clientName: v('dup-client') || undefined,
                startDate: v('dup-start'), asQuotation: true
            });
            document.getElementById('dupModal')?.remove();
            UI.toast(`${res.id} created — ${res.sowItems} SOW items and ${res.estimateLines} priced lines copied as draft.`, 'success');
            await this.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
            if (btn) { btn.textContent = 'Create the copy'; btn.disabled = false; }
        }
    },

    _peso(v) { return '₱' + fmtMoney(parseFloat(v) || 0); },

    _table(list) {
        const e = this._esc.bind(this);
        const pipeline = list.reduce((s, q) => s + (parseFloat(q.quotedValue) || 0), 0);
        return `<div class="panel" style="padding:0;overflow:hidden;"><div class="scroll-x">
            <table class="qt-table">
                <thead><tr>
                    <th>Quote No.</th><th>Title</th><th>Client</th>
                    <th class="amt">Quoted</th><th class="amt">Est. cost</th><th class="amt">Margin</th>
                    <th class="amt">SOW</th><th>Valid to</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>${list.map(q => this._row(q)).join('')}</tbody>
                <tfoot><tr>
                    <td colspan="3">${list.length} quotation${list.length === 1 ? '' : 's'}</td>
                    <td class="amt">₱${fmtMoney(pipeline)}</td>
                    <td colspan="6"></td>
                </tr></tfoot>
            </table></div></div>`;
    },

    _row(q) {
        const e = this._esc.bind(this);
        const price = parseFloat(q.quotedValue) || 0;
        const cost = parseFloat(q.estimatedCost) || 0;
        const margin = price - cost;
        const decided = q.status === 'Won' || q.status === 'Lost';
        const cls = { Draft: '', Sent: 'sent', 'Under Negotiation': 'negot', Won: 'won', Lost: 'lost' }[q.status] || '';

        let actions = decided
            ? `<button class="btn-sm" onclick="QuotationsPage.openProject('${e(q.projectId)}')">${q.status === 'Won' ? 'Project' : 'Estimate'}</button>`
            : `<button class="btn-sm" title="Price it" onclick="QuotationsPage.openProject('${e(q.projectId)}')">${Icon.ruler({size:12})}</button>
               <button class="btn-sm" title="Edit" onclick="QuotationsPage.openEditModal('${e(q.id)}')">${Icon.pencil({size:12})}</button>
               <button class="btn-sm success" onclick="QuotationsPage.openAwardModal('${e(q.id)}')">Award</button>
               <button class="btn-sm danger" onclick="QuotationsPage.openLoseModal('${e(q.id)}')">Lost</button>`;

        return `<tr class="${cls}">
            <td class="mono"><b>${e(q.id)}</b>
                <div class="muted">Rev ${e(q.revision || 'A')}${q.revisionCount
                    ? ` · <span class="qt-revcount" onclick="QuotationsPage.openRevisions('${e(q.id)}')">${q.revisionCount} prior</span>` : ''}</div></td>
            <td>${e(q.title)}
                ${!decided ? `<div class="qt-stage-inline">${['Draft','Sent','Under Negotiation'].map(st =>
                    `<button class="${q.status === st ? 'active' : ''}"
                        onclick="QuotationsPage.setStatus('${e(q.id)}','${st}')">${st === 'Under Negotiation' ? 'Negotiating' : st}</button>`).join('')}</div>` : ''}</td>
            <td>${e(q.clientName) || '—'}</td>
            <td class="amt"><b>₱${fmtMoney(price)}</b></td>
            <td class="amt">${cost > 0 ? '₱' + fmtMoney(cost) : '—'}</td>
            <td class="amt ${cost > 0 ? (margin < 0 ? 'neg' : 'pos') : ''}">${cost > 0
                ? `₱${fmtMoney(margin)}<div class="muted">${q.marginPct}%</div>`
                : '<span class="muted">no estimate</span>'}</td>
            <td class="amt">${q.sowCount}</td>
            <td class="mono">${q.validUntil ? this._date(q.validUntil) : '—'}</td>
            <td><span class="qt-status ${cls}">${e(q.status)}</span>
                ${decided && q.decisionNote ? `<div class="muted">${e(q.decisionNote)}</div>` : ''}</td>
            <td class="qt-row-actions">${actions}
                <button class="btn-sm" title="Copy this quotation"
                    onclick="QuotationsPage.duplicate('${e(q.projectId)}','${e(q.title)}')">${Icon.copy ? Icon.copy({size:12}) : '⧉'}</button>
                ${(App.getUser() || {}).role === 'superadmin' && q.status === 'Lost'
                    ? `<button class="btn-sm danger" onclick="QuotationsPage.remove('${e(q.id)}')">${Icon.trash({size:12})}</button>` : ''}</td>
        </tr>`;
    },

    _card(q) {
        const e = this._esc.bind(this);
        const price = parseFloat(q.quotedValue) || 0;
        const cost = parseFloat(q.estimatedCost) || 0;
        const margin = price - cost;
        const decided = q.status === 'Won' || q.status === 'Lost';
        const cls = { Draft: '', Sent: 'sent', 'Under Negotiation': 'negot', Won: 'won', Lost: 'lost' }[q.status] || '';

        // A quotation with no priced estimate cannot show a margin, and a
        // fake 100% is worse than an honest blank.
        const marginCell = cost > 0
            ? `<div class="qt-metric ${margin < 0 ? 'bad' : 'good'}">
                   <span>Margin</span><b>₱${fmtMoney(margin)}</b>
                   <em>${q.marginPct}%</em>
               </div>`
            : `<div class="qt-metric"><span>Margin</span><b>—</b><em>no estimate yet</em></div>`;

        let actions = '';
        if (!decided) {
            actions = `
                <button class="btn-sm" onclick="QuotationsPage.openProject('${e(q.projectId)}')"
                    title="Price it: SOW, estimates and schedule">${Icon.ruler({size:12})} Price it</button>
                <button class="btn-sm" onclick="QuotationsPage.openEditModal('${e(q.id)}')">${Icon.pencil({size:12})}</button>
                <button class="btn-sm" onclick="QuotationsPage.openReviseModal('${e(q.id)}')"
                    title="Snapshot this revision and start the next">Revise</button>
                <button class="btn-sm success" onclick="QuotationsPage.openAwardModal('${e(q.id)}')">Award</button>
                <button class="btn-sm danger" onclick="QuotationsPage.openLoseModal('${e(q.id)}')">Lost</button>`;
        } else {
            actions = `<button class="btn-sm" onclick="QuotationsPage.openProject('${e(q.projectId)}')">
                    ${q.status === 'Won' ? 'Open project' : 'View estimate'}</button>`;
            if ((App.getUser() || {}).role === 'superadmin' && q.status === 'Lost') {
                actions += `<button class="btn-sm danger" onclick="QuotationsPage.remove('${e(q.id)}')">${Icon.trash({size:12})}</button>`;
            }
        }

        const stageBtns = (!decided) ? `
            <div class="qt-stage">
                ${['Draft', 'Sent', 'Under Negotiation'].map(s =>
                    `<button class="${q.status === s ? 'active' : ''}"
                        onclick="QuotationsPage.setStatus('${e(q.id)}','${s}')">${s}</button>`).join('')}
            </div>` : '';

        return `
            <article class="qt-card ${cls}">
                <header>
                    <div class="qt-id">
                        <span class="qt-num">${e(q.id)}</span>
                        <span class="qt-rev">Rev ${e(q.revision || 'A')}</span>
                        ${q.revisionCount ? `<span class="qt-revcount" title="${q.revisionCount} earlier revision(s) snapshotted"
                            onclick="QuotationsPage.openRevisions('${e(q.id)}')">${q.revisionCount} prior</span>` : ''}
                    </div>
                    <span class="qt-status ${cls}">${e(q.status)}</span>
                </header>

                <h3>${e(q.title)}</h3>
                <p class="qt-client">${e(q.clientName) || 'No client set'}
                    ${q.validUntil ? ` · valid to ${this._date(q.validUntil)}` : ''}</p>

                <div class="qt-metrics">
                    <div class="qt-metric"><span>Quoted</span><b>₱${fmtMoney(price)}</b></div>
                    <div class="qt-metric"><span>Est. cost</span><b>${cost > 0 ? '₱' + fmtMoney(cost) : '—'}</b></div>
                    ${marginCell}
                    <div class="qt-metric"><span>SOW items</span><b>${q.sowCount}</b></div>
                </div>

                ${stageBtns}
                ${decided && q.decisionNote ? `<p class="qt-note">${e(q.decisionNote)}</p>` : ''}
                ${decided ? `<p class="qt-client">Decided ${this._date(q.decisionDate)}</p>` : ''}

                <div class="qt-actions">${actions}</div>
            </article>`;
    },

    openProject(projectId) {
        App.navigate('project');
        setTimeout(() => ProjectPage.open(projectId), 60);
    },

    // ─── create ─────────────────────────────────────────────────

    openCreateModal() {
        const e = this._esc.bind(this);
        document.getElementById('qtCreateModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'qtCreateModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:560px;">
                <button class="close-modal" onclick="document.getElementById('qtCreateModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>New Quotation</h2>
                    <div class="print-meta">You get the full SOW and Estimates tools straight away</div></div>

                <div class="field"><label>Title *</label>
                    <input type="text" id="qt-title" placeholder="e.g. Lagoon Liner Works — Phase 3" /></div>
                <div class="field"><label>Client</label>
                    <select id="qt-client">
                        <option value="">— none —</option>
                        ${this._clients.map(c => `<option value="${e(c.id)}">${e(c.name)}</option>`).join('')}
                    </select></div>
                <div class="field"><label>Location</label>
                    <input type="text" id="qt-location" placeholder="e.g. Tarlac" /></div>

                <div class="db-form-grid">
                    <div class="field"><label>Quotation number</label>
                        <input type="text" id="qt-id" placeholder="auto — QTN-${new Date().getFullYear()}-####" />
                        <p class="qt-hint">Leave blank to number it automatically.</p></div>
                    <div class="field"><label>Project ID *</label>
                        <input type="text" id="qt-projectid" placeholder="same as the quotation number" />
                        <p class="qt-hint">The ID the project will carry if you win. It is asked now because
                        it can never be changed later — renaming it would have to cascade through the SOW,
                        estimates, billings and daily records.</p></div>
                    <div class="field"><label>Quoted amount</label>
                        <input type="number" id="qt-value" step="0.01" min="0" placeholder="0.00" />
                        <p class="qt-hint">Can be set later, once priced.</p></div>
                    <div class="field"><label>Valid until</label>
                        <input type="date" id="qt-valid" /></div>
                    <div class="field"><label>Retention %</label>
                        <input type="number" id="qt-retention" step="1" min="0" max="20" value="10" /></div>
                    <div class="field"><label>Downpayment %</label>
                        <input type="number" id="qt-dp" step="1" min="0" max="60" value="0" /></div>
                </div>

                <div class="field"><label>Scope notes</label><textarea id="qt-scope" rows="2"></textarea></div>
                <div class="field"><label>Exclusions</label><textarea id="qt-excl" rows="2"
                    placeholder="What the price does NOT cover — this is where variations come from"></textarea></div>

                <div class="print-actions">
                    <button class="btn-primary" onclick="QuotationsPage.submitCreate()">Create quotation</button>
                    <button class="btn-ghost" onclick="document.getElementById('qtCreateModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        // mirror the quote number into the project id unless it was typed
        const idEl = document.getElementById('qt-id');
        const pidEl = document.getElementById('qt-projectid');
        idEl?.addEventListener('input', () => {
            if (!pidEl.dataset.touched) pidEl.value = idEl.value;
        });
        pidEl?.addEventListener('input', () => { pidEl.dataset.touched = '1'; });
        setTimeout(() => document.getElementById('qt-title')?.focus(), 50);
    },

    async submitCreate() {
        const v = id => (document.getElementById(id)?.value || '').trim();
        if (!v('qt-title')) { UI.toast('A title is required.', 'error'); return; }
        try {
            const res = await DataService.createQuotation({
                id: v('qt-id'), projectId: v('qt-projectid'), title: v('qt-title'),
                clientId: v('qt-client'), location: v('qt-location'),
                quotedValue: v('qt-value'), validUntil: v('qt-valid'),
                retentionPct: (parseFloat(v('qt-retention')) || 0) / 100,
                downpaymentPct: (parseFloat(v('qt-dp')) || 0) / 100,
                scopeNotes: v('qt-scope'), exclusions: v('qt-excl')
            });
            document.getElementById('qtCreateModal')?.remove();
            UI.toast(`Quotation ${res.id} created. Price it on the SOW and Estimates tabs.`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    // ─── edit ───────────────────────────────────────────────────

    openEditModal(id) {
        const q = this._get(id);
        if (!q) return;
        const e = this._esc.bind(this);
        document.getElementById('qtEditModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'qtEditModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:520px;">
                <button class="close-modal" onclick="document.getElementById('qtEditModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>${e(q.id)} — Rev ${e(q.revision)}</h2>
                    <div class="print-meta">Project ID ${e(q.projectId)} · cannot be changed</div></div>
                <div class="field"><label>Title</label><input type="text" id="qte-title" value="${e(q.title)}" /></div>
                <div class="field"><label>Client</label>
                    <select id="qte-client">
                        <option value="">— none —</option>
                        ${this._clients.map(c => `<option value="${e(c.id)}" ${c.id === q.clientId ? 'selected' : ''}>${e(c.name)}</option>`).join('')}
                    </select></div>
                <div class="db-form-grid">
                    <div class="field"><label>Quoted amount</label>
                        <input type="number" id="qte-value" step="0.01" min="0" value="${parseFloat(q.quotedValue) || 0}" />
                        <p class="qt-hint">Estimated cost is ₱${fmtMoney(q.estimatedCost || 0)}.</p></div>
                    <div class="field"><label>Valid until</label>
                        <input type="date" id="qte-valid" value="${e(q.validUntil)}" /></div>
                </div>
                <div class="field"><label>Scope notes</label><textarea id="qte-scope" rows="2">${e(q.scopeNotes)}</textarea></div>
                <div class="field"><label>Exclusions</label><textarea id="qte-excl" rows="2">${e(q.exclusions)}</textarea></div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="QuotationsPage.submitEdit('${e(id)}')">Save</button>
                    <button class="btn-ghost" onclick="document.getElementById('qtEditModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    async submitEdit(id) {
        const v = x => (document.getElementById(x)?.value || '').trim();
        try {
            await DataService.updateQuotation(id, {
                title: v('qte-title'), clientId: v('qte-client'),
                quotedValue: v('qte-value'), validUntil: v('qte-valid'),
                scopeNotes: v('qte-scope'), exclusions: v('qte-excl')
            });
            document.getElementById('qtEditModal')?.remove();
            UI.toast('Quotation updated.', 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async setStatus(id, status) {
        const q = this._get(id);
        if (!q || q.status === status) return;
        try {
            await DataService.setQuotationStatus(id, status);
            UI.toast(`${id} marked ${status}.`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    // ─── revise ─────────────────────────────────────────────────

    openReviseModal(id) {
        const q = this._get(id);
        if (!q) return;
        const e = this._esc.bind(this);
        document.getElementById('qtReviseModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'qtReviseModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:480px;">
                <button class="close-modal" onclick="document.getElementById('qtReviseModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>Snapshot revision ${e(q.revision)}</h2>
                    <div class="print-meta">${e(q.id)} — ${e(q.title)}</div></div>
                <p style="font-size:12.5px;line-height:1.55;">
                    This records what is priced <b>right now</b> — ₱${fmtMoney(q.quotedValue)} across
                    ${q.sowCount} SOW item(s), at an estimated cost of ₱${fmtMoney(q.estimatedCost || 0)} —
                    then moves you on to revision <b>${e(this._nextLetter(q.revision))}</b>.
                </p>
                <p style="font-size:11.5px;color:var(--ink-soft);line-height:1.5;">
                    Your SOW and estimates stay live and editable. The snapshot exists so you can answer
                    "what did we send them in revision ${e(q.revision)}" later — it is not a separate copy
                    to maintain.
                </p>
                <div class="field"><label>What changed?</label>
                    <textarea id="qt-revnote" rows="2" placeholder="e.g. Client reduced NF2 cell area by 20%"></textarea></div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="QuotationsPage.submitRevise('${e(id)}')">Snapshot and continue</button>
                    <button class="btn-ghost" onclick="document.getElementById('qtReviseModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    _nextLetter(cur) {
        cur = String(cur || 'A').toUpperCase().replace(/[^A-Z]/g, '') || 'A';
        const chars = cur.split('');
        let i = chars.length - 1;
        while (i >= 0) {
            if (chars[i] === 'Z') { chars[i] = 'A'; i--; }
            else { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join(''); }
        }
        return 'A' + chars.join('');
    },

    async submitRevise(id) {
        try {
            const res = await DataService.reviseQuotation(id,
                document.getElementById('qt-revnote')?.value || '');
            document.getElementById('qtReviseModal')?.remove();
            UI.toast(`Snapshot saved. Now working on revision ${res.revision}.`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async openRevisions(id) {
        const q = this._get(id);
        const e = this._esc.bind(this);
        try {
            const revs = await DataService.getQuotationRevisions(id);
            document.getElementById('qtRevModal')?.remove();
            const modal = document.createElement('div');
            modal.className = 'print-modal-overlay open';
            modal.id = 'qtRevModal';
            modal.innerHTML = `
                <div class="print-modal-content" style="max-width:640px;">
                    <button class="close-modal" onclick="document.getElementById('qtRevModal').remove()">${Icon.close({size:18})}</button>
                    <div class="print-header"><h2>Revision history — ${e(id)}</h2>
                        <div class="print-meta">${e(q ? q.title : '')}</div></div>
                    ${revs.length ? `<table class="ps-table">
                        <thead><tr><th>Rev</th><th class="amt">Quoted</th><th class="amt">Est. cost</th>
                            <th class="amt">SOW</th><th>What changed</th><th>Date</th></tr></thead>
                        <tbody>${revs.map(r => `<tr>
                            <td><b>${e(r.revision)}</b></td>
                            <td class="amt">₱${fmtMoney(r.quotedValue)}</td>
                            <td class="amt">₱${fmtMoney(r.estimatedCost)}</td>
                            <td class="amt">${r.sowCount}</td>
                            <td>${e(r.note) || '—'}</td>
                            <td>${this._date(r.createdAt)}</td></tr>`).join('')}</tbody>
                    </table>` : '<div class="empty"><p>No earlier revisions snapshotted.</p></div>'}
                    <div class="print-actions">
                        <button class="btn-sm" onclick="PrintDoc.print({title:'Quotation revisions — ${e(id)}'})">${Icon.printer({size:12})} Print</button>
                        <button class="btn-ghost" onclick="document.getElementById('qtRevModal').remove()">Close</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    // ─── decision ───────────────────────────────────────────────

    /**
     * openAwardModal - The transition. Shows exactly what will happen,
     * because this is a one-way door: awarding cannot be undone from the
     * UI, and the baseline it writes is what every later variance is
     * measured against.
     */
    openAwardModal(id) {
        const q = this._get(id);
        if (!q) return;
        const e = this._esc.bind(this);
        const price = parseFloat(q.quotedValue) || 0;

        document.getElementById('qtAwardModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'qtAwardModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:540px;">
                <button class="close-modal" onclick="document.getElementById('qtAwardModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>Award ${e(q.id)}</h2>
                    <div class="print-meta">${e(q.title)} · ${e(q.clientName) || 'no client'}</div></div>

                ${!q.sowCount ? `<div class="qt-warn">
                    ${Icon.warning({size:13})} <b>No SOW items.</b> Add at least one on the SOW Budget tab
                    before awarding — an awarded project with no scope cannot be budgeted, scheduled or billed.
                </div>` : ''}

                <div class="field"><label>Awarded contract value *</label>
                    <input type="number" id="qta-value" step="0.01" min="0" value="${price}" />
                    <p class="qt-hint">Quoted ₱${fmtMoney(price)}${q.estimatedCost ? ` · estimated cost ₱${fmtMoney(q.estimatedCost)}` : ''}.
                    Change it if the final agreed figure differs.</p></div>

                <div class="db-form-grid">
                    <div class="field"><label>Award date</label>
                        <input type="date" id="qta-date" value="${new Date().toISOString().slice(0,10)}" /></div>
                    <div class="field"><label>Reference / note</label>
                        <input type="text" id="qta-note" placeholder="e.g. NTP received 12 Aug" /></div>
                </div>

                <div class="qt-explain">
                    <b>What happens when you award:</b>
                    <ul>
                        <li>Project <b>${e(q.projectId)}</b> changes from Quotation to <b>Ongoing</b>.</li>
                        <li>The contract value is written, and retention and downpayment carry over.</li>
                        <li>Start and finish dates are taken from the SOW schedule.</li>
                        <li>The priced schedule is saved as the <b>baseline</b> — every later delay is
                            measured against what the client agreed to.</li>
                        <li>Nothing is copied. The SOW and estimates you priced <em>are</em> the project's.</li>
                    </ul>
                    <p>This cannot be undone from here.</p>
                </div>

                <div class="print-actions">
                    <button class="btn-primary" ${!q.sowCount ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}
                        onclick="QuotationsPage.submitAward('${e(id)}')">Award and start project</button>
                    <button class="btn-ghost" onclick="document.getElementById('qtAwardModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    async submitAward(id) {
        const v = x => (document.getElementById(x)?.value || '').trim();
        const value = parseFloat(v('qta-value'));
        if (!value || value <= 0) { UI.toast('Enter the awarded contract value.', 'error'); return; }
        const ok = await Confirm.open('Award this quotation?',
            `${id} becomes an ongoing project at ₱${fmtMoney(value)}, and the current schedule is saved as its baseline. This cannot be undone.`);
        if (!ok) return;
        try {
            const res = await DataService.awardQuotation(id, {
                awardedValue: value, decisionDate: v('qta-date'), decisionNote: v('qta-note')
            });
            document.getElementById('qtAwardModal')?.remove();
            UI.toast(`Awarded. ${res.projectId} is now Ongoing — baseline saved for ${res.baselinedItems} of ${res.sowCount} SOW item(s).`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    openLoseModal(id) {
        const q = this._get(id);
        if (!q) return;
        const e = this._esc.bind(this);
        document.getElementById('qtLoseModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'qtLoseModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:470px;">
                <button class="close-modal" onclick="document.getElementById('qtLoseModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>Mark ${e(q.id)} as lost</h2>
                    <div class="print-meta">${e(q.title)}</div></div>
                <p style="font-size:12.5px;line-height:1.55;">
                    The estimate is kept. What you priced, and why it lost, is the most useful thing
                    you have the next time this client tenders — so record the reason.
                </p>
                <div class="field"><label>Why was it lost?</label>
                    <textarea id="qtl-note" rows="2" placeholder="e.g. Lost on price — competitor ~12% lower"></textarea></div>
                <div class="field"><label>Date</label>
                    <input type="date" id="qtl-date" value="${new Date().toISOString().slice(0,10)}" /></div>
                <div class="print-actions">
                    <button class="btn-primary danger" onclick="QuotationsPage.submitLose('${e(id)}')">Mark as lost</button>
                    <button class="btn-ghost" onclick="document.getElementById('qtLoseModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    async submitLose(id) {
        try {
            await DataService.loseQuotation(id, {
                decisionNote: document.getElementById('qtl-note')?.value || '',
                decisionDate: document.getElementById('qtl-date')?.value || ''
            });
            document.getElementById('qtLoseModal')?.remove();
            UI.toast(`${id} marked lost. The estimate is kept for reference.`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async remove(id) {
        const q = this._get(id);
        const ok = await Confirm.open(`Delete ${id}?`,
            `This removes the quotation, its revision history, and the entire SOW and estimate priced against it. ${q && q.sowCount ? q.sowCount + ' SOW item(s) will be deleted. ' : ''}This cannot be undone.`);
        if (!ok) return;
        try {
            const res = await DataService.deleteQuotation(id);
            UI.toast(`${id} deleted (${res.sowRemoved} SOW item(s), ${res.lineItems} estimate line(s)).`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
};
