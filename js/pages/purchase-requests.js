// ================================================================
//  pages/purchase-requests.js — Purchase Requests (v11 BATCH G1)
//
//  Every purchase now starts here. The PR is the control point: it is
//  where spend is stopped, before any money moves.
//
//  THE BUDGET CHECK is the reason this belongs inside the board rather
//  than being bought. The system already knows the approved materials
//  estimate for every SOW item, so a request can be measured against it
//  while it can still be changed. No off-the-shelf procurement package
//  knows your DUPA.
//
//  It measures against COMMITTED spend, not just spent — a PR that is
//  approved but undelivered has cost nothing yet, but the money is
//  promised. Checking only actual spend would let three individually
//  affordable requests be approved that together blow the line. That is
//  the classic way procurement overruns happen quietly.
//
//  And it WARNS rather than BLOCKS. Sites genuinely do need to overspend
//  sometimes, and a system that refuses gets worked around — someone
//  codes the purchase to whichever SOW item still has budget, and the
//  cost data ends up worse than if it had been allowed through.
//
//  The check runs SERVER-SIDE (checkPrBudget) so the warning shown here
//  and the one the approvers see cannot disagree.
// ================================================================

const PurchaseRequestsPage = {

    _all: [],
    _projects: [],
    _sow: [],
    _materials: [],
    _suppliers: [],
    _filter: 'open',
    _lines: [],
    _budgetTimer: null,

    async load() {
        const box = document.getElementById('purchaseRequestsContent');
        if (!box) return;
        UI.showLoading(box);
        try {
            const [prs, home, suppliers] = await Promise.all([
                DataService.getPurchaseRequests(),
                DataService.getHomeData(),
                DataService.getSuppliers().catch(() => [])
            ]);
            this._all = prs || [];
            this._projects = ((home && home.projects) || [])
                .filter(p => String(p.status || '').toLowerCase() === 'ongoing');
            this._suppliers = suppliers || [];
            this._render();
        } catch (err) {
            UI.toast('Could not load purchase requests: ' + (err.message || err), 'error');
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
    _get(id) { return this._all.find(p => p.id === id); },

    _filtered() {
        const open = ['draft', 'pending', 'approved'];
        if (this._filter === 'all') return this._all;
        if (this._filter === 'open') return this._all.filter(p => open.includes(String(p.status).toLowerCase()));
        return this._all.filter(p => String(p.status).toLowerCase() === this._filter);
    },

    _render() {
        const box = document.getElementById('purchaseRequestsContent');
        const e = this._esc.bind(this);
        const n = st => this._all.filter(p => String(p.status).toLowerCase() === st).length;
        const open = n('draft') + n('pending') + n('approved');
        const pendingValue = this._all
            .filter(p => String(p.status).toLowerCase() === 'pending')
            .reduce((s, p) => s + (parseFloat(p.totalAmount) || 0), 0);
        const overCount = this._all.filter(p =>
            p.budgetState === 'over' && ['pending', 'approved'].includes(String(p.status).toLowerCase())).length;

        const list = this._filtered();

        box.innerHTML = `
            <div class="section-head"><h2>Purchase Requests</h2><div class="rule"></div>
                <span class="badge">${open} open</span>
                <button class="btn-sm primary" style="margin-left:8px;" onclick="PurchaseRequestsPage.openForm()">
                    ${Icon.plus({size:12})} New request
                </button>
            </div>
            <p class="data-source-note" style="margin-bottom:14px;">
                Every purchase starts here. Cash advances still exist for payroll, fuel, permits and
                incidentals — but buying goods goes through a request so it can be checked against the
                estimate before the money moves.
            </p>

            <div class="kpi-strip pr-strip" style="margin-bottom:16px;">
                <div class="kpi-card"><div class="k-label">Awaiting approval</div><div class="k-val">${n('pending')}</div>
                    <div class="k-sub">${this._peso(pendingValue)} requested</div></div>
                <div class="kpi-card good"><div class="k-label">Approved</div><div class="k-val">${n('approved')}</div>
                    <div class="k-sub">ready to order or buy</div></div>
                <div class="kpi-card ${overCount ? 'warn' : ''}"><div class="k-label">Over estimate</div>
                    <div class="k-val">${overCount}</div>
                    <div class="k-sub">${overCount ? 'need a VO or a reason' : 'none'}</div></div>
                <div class="kpi-card"><div class="k-label">Drafts</div><div class="k-val">${n('draft')}</div>
                    <div class="k-sub">not yet submitted</div></div>
            </div>

            <div class="status-tabs" style="margin-bottom:14px;">
                <button class="${this._filter === 'open' ? 'active' : ''}" onclick="PurchaseRequestsPage.setFilter('open')">Open (${open})</button>
                ${['draft','pending','approved','rejected','ordered','cancelled'].map(s =>
                    `<button class="${this._filter === s ? 'active' : ''}" onclick="PurchaseRequestsPage.setFilter('${s}')">${s[0].toUpperCase()+s.slice(1)} (${n(s)})</button>`).join('')}
                <button class="${this._filter === 'all' ? 'active' : ''}" onclick="PurchaseRequestsPage.setFilter('all')">All (${this._all.length})</button>
            </div>

            ${list.length
                ? this._table(list)
                : `<div class="empty"><p>${this._all.length
                    ? 'No requests with this status.'
                    : 'No purchase requests yet. Raise one to start buying against a scope item.'}</p></div>`}`;
    },

    _peso(v) { return '₱' + fmtMoney(parseFloat(v) || 0); },

    /** _minNeeded - three clear days from today, matching the cash advance form. */
    _minNeeded() {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        return d.toISOString().slice(0, 10);
    },
    setFilter(f) { this._filter = f; this._render(); },

    /**
     * _table (v11 BATCH H1) - Replaces the card grid.
     *
     * Cards suited a handful of requests and stopped working the moment
     * there were thirty: you cannot scan down a column of amounts, or
     * compare two requests, when each one is its own box. A register is
     * also what a purchase request list looks like on paper, which
     * matters when someone prints it for a meeting.
     */
    _table(list) {
        const e = this._esc.bind(this);
        const total = list.reduce((s, p) => s + (parseFloat(p.totalAmount) || 0), 0);
        return `<div class="panel" style="padding:0;overflow:hidden;"><div class="scroll-x">
            <table class="pr-table">
                <thead><tr>
                    <th>PR No.</th><th>Description</th><th>Project / SOW</th>
                    <th class="amt">Items</th><th class="amt">Amount</th>
                    <th>Budget</th><th>Needed</th><th>Route</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>${list.map(p => this._row(p)).join('')}</tbody>
                <tfoot><tr>
                    <td colspan="4">${list.length} request${list.length === 1 ? '' : 's'}</td>
                    <td class="amt">${this._peso(total)}</td>
                    <td colspan="5"></td>
                </tr></tfoot>
            </table></div></div>`;
    },

    _row(p) {
        const e = this._esc.bind(this);
        const st = String(p.status).toLowerCase();
        const user = App.getUser() || {};
        const isMine = String(p.requestorEmail || '').toLowerCase() === String(user.email || '').toLowerCase();
        const bs = { ok: '', near: 'near', over: 'over', 'no-estimate': 'none' }[p.budgetState] || '';
        const bLabel = { ok: 'Within', near: 'Close', over: 'Over', 'no-estimate': 'Not checked' }[p.budgetState] || '—';

        let actions = '';
        if (st === 'draft' && isMine) {
            actions = `<button class="btn-sm primary" onclick="PurchaseRequestsPage.submitDraft('${e(p.id)}')">Submit</button>
                <button class="btn-sm" title="Edit" onclick="PurchaseRequestsPage.openForm('${e(p.id)}')">${Icon.pencil({size:12})}</button>`;
        } else if (st === 'approved') {
            actions = p.route === 'cash'
                ? `<span class="pr-note">CA ${e(p.cashAdvanceId || '')}</span>`
                : `<button class="btn-sm primary" onclick="PurchaseRequestsPage.openPoForm('${e(p.id)}')">Raise PO</button>`;
        } else if (st === 'ordered') {
            actions = `<button class="btn-sm" onclick="PurchaseRequestsPage.openPoList('${e(p.id)}')">Orders</button>`;
        }

        return `<tr class="${st}">
            <td class="mono"><b>${e(p.id)}</b><div class="muted">${e(p.requestor)}</div></td>
            <td>${e(p.title)}</td>
            <td>${e(p.projectName || p.projectId)}<div class="muted">${e(p.sowId)}</div></td>
            <td class="amt">${p.lineCount}</td>
            <td class="amt"><b>${this._peso(p.totalAmount)}</b></td>
            <td><span class="pr-budget ${bs}" title="${e(p.budgetMessage || '')}">${bLabel}</span></td>
            <td class="mono">${p.dateNeeded ? this._date(p.dateNeeded) : '—'}</td>
            <td>${p.route === 'cash' ? 'Cash' : 'PO'}</td>
            <td><span class="pr-status ${st}">${e(p.status)}</span></td>
            <td class="pr-row-actions">
                <button class="btn-sm" title="Open" onclick="PurchaseRequestsPage.view('${e(p.id)}')">${Icon.search({size:12})}</button>
                ${actions}
                ${['draft','pending','approved'].includes(st) && isMine
                    ? `<button class="btn-sm danger" title="Cancel" onclick="PurchaseRequestsPage.cancel('${e(p.id)}')">${Icon.close({size:11})}</button>` : ''}
            </td>
        </tr>`;
    },

    _card(p) {
        const e = this._esc.bind(this);
        const st = String(p.status).toLowerCase();
        const user = App.getUser() || {};
        const isMine = String(p.requestorEmail || '').toLowerCase() === String(user.email || '').toLowerCase();

        const bs = { ok: '', near: 'near', over: 'over', 'no-estimate': 'none' }[p.budgetState] || '';
        const bLabel = { ok: 'Within budget', near: 'Close to budget',
                         over: 'Over budget', 'no-estimate': 'Not checked' }[p.budgetState] || '';

        let actions = '';
        if (st === 'draft' && isMine) {
            actions = `<button class="btn-sm primary" onclick="PurchaseRequestsPage.submitDraft('${e(p.id)}')">Submit</button>
                <button class="btn-sm" onclick="PurchaseRequestsPage.openForm('${e(p.id)}')">${Icon.pencil({size:12})}</button>`;
        } else if (st === 'pending') {
            actions = `<span class="pr-note">Awaiting approval</span>`;
        } else if (st === 'ordered') {
            actions = `<span class="pr-note">Fully ordered</span>
                <button class="btn-sm" onclick="PurchaseRequestsPage.openPoList('${e(p.id)}')">View orders</button>`;
        } else if (st === 'approved') {
            actions = p.route === 'cash'
                ? `<span class="pr-note">Cash advance ${e(p.cashAdvanceId || '')} created</span>`
                : `<button class="btn-sm primary" onclick="PurchaseRequestsPage.openPoForm('${e(p.id)}')">Raise PO</button>`;
        }
        if (['draft', 'pending', 'approved'].includes(st) && isMine) {
            actions += `<button class="btn-sm danger" onclick="PurchaseRequestsPage.cancel('${e(p.id)}')">Cancel</button>`;
        }

        return `
            <article class="pr-card ${st}">
                <header>
                    <div><span class="pr-num">${e(p.id)}</span>
                        <span class="pr-route">${p.route === 'cash' ? 'Cash' : 'Purchase order'}</span></div>
                    <span class="pr-status ${st}">${e(p.status)}</span>
                </header>
                <h3>${e(p.title)}</h3>
                <p class="pr-meta">${e(p.projectName || p.projectId)} · <b>${e(p.sowId)}</b>
                    · ${p.lineCount} item${p.lineCount === 1 ? '' : 's'}
                    ${p.dateNeeded ? ' · needed ' + this._date(p.dateNeeded) : ''}</p>
                <div class="pr-amt">${this._peso(p.totalAmount)}</div>
                ${bLabel ? `<div class="pr-budget ${bs}">${bs === 'over' ? Icon.warning({size:11}) : ''} ${bLabel}</div>` : ''}
                <p class="pr-just">${e(p.justification)}</p>
                <div class="pr-actions">
                    <button class="btn-sm" onclick="PurchaseRequestsPage.view('${e(p.id)}')">Open</button>
                    ${actions}
                </div>
            </article>`;
    },

    view(id) {
        const p = this._get(id);
        if (!p) return;
        const e = this._esc.bind(this);
        document.getElementById('prViewModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'prViewModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:680px;">
                <button class="close-modal" onclick="document.getElementById('prViewModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>${e(p.id)} — ${e(p.title)}</h2>
                    <div class="print-meta">${e(p.projectName || p.projectId)} · ${e(p.sowId)} ·
                        ${e(p.status)} · ${p.route === 'cash' ? 'Cash purchase' : 'Purchase order'}</div></div>

                <!-- v11 BATCH H1: .pd-noprint — the budget verdict is INTERNAL.
                     It tells an approver whether to spend; it has no place on a
                     document that may be handed to a supplier or filed with a
                     client, and it invites questions nobody should have to
                     answer outside the company. -->
                ${p.budgetMessage ? `<div class="pr-budget-box pd-noprint ${p.budgetState}">
                    <b>${{ok:'Within budget',near:'Close to budget',
                          over:'Over budget','no-estimate':'Not checked against a budget'}[p.budgetState] || ''}</b>
                    <p>${e(p.budgetMessage)}</p>
                </div>` : ''}

                <div class="print-section"><div class="ps-title">Items</div>
                    <table class="ps-table">
                        <thead><tr><th>Item</th><th>Unit</th><th class="amt">Qty</th>
                            <th class="amt">Unit price</th><th class="amt">Amount</th></tr></thead>
                        <tbody>${(p.lines || []).map(l => `<tr>
                            <td>${e(l.itemName)}${l.notes ? `<div class="muted">${e(l.notes)}</div>` : ''}</td>
                            <td>${e(l.unit)}</td>
                            <td class="amt">${fmtMoney(l.qty)}</td>
                            <td class="amt">${this._peso(l.rate)}</td>
                            <td class="amt">${this._peso(l.amount)}</td></tr>`).join('')}</tbody>
                        <tfoot><tr><td colspan="4">Total</td>
                            <td class="amt">${this._peso(p.totalAmount)}</td></tr></tfoot>
                    </table>
                </div>

                <div class="print-section"><div class="ps-title">Description</div>
                    <p style="font-size:12.5px;white-space:pre-wrap;">${e(p.justification)}</p></div>

                <div class="print-section"><div class="ps-title">Details</div>
                    <div class="db-form-grid" style="font-size:12px;">
                        <div>Requested by<br><b>${e(p.requestor)}</b></div>
                        <div>Raised<br><b>${this._date(p.createdAt)}</b></div>
                        <div>Needed by<br><b>${this._date(p.dateNeeded)}</b></div>
                        <div>Deliver to<br><b>${e(p.deliverTo) || '—'}</b></div>
                    </div></div>

                <div class="print-actions">
                    <button class="btn-sm" onclick="PrintDoc.print({title:'Purchase Request ${e(p.id)}'})">${Icon.printer({size:12})} Print</button>
                    <button class="btn-ghost" onclick="document.getElementById('prViewModal').remove()">Close</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    // ─── the form ───────────────────────────────────────────────

    async openForm(editId) {
        const e = this._esc.bind(this);
        const existing = editId ? this._get(editId) : null;
        this._lines = existing && existing.lines && existing.lines.length
            ? existing.lines.map(l => ({ itemName: l.itemName, unit: l.unit, qty: l.qty, rate: l.rate, notes: l.notes }))
            : [{ itemName: '', unit: '', qty: 1, rate: 0, notes: '' }];

        document.getElementById('prFormModal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'print-modal-overlay open';
        modal.id = 'prFormModal';
        modal.innerHTML = `
            <div class="print-modal-content" style="max-width:760px;">
                <button class="close-modal" onclick="document.getElementById('prFormModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>${existing ? 'Edit ' + e(existing.id) : 'New Purchase Request'}</h2>
                    <div class="print-meta">Checked against the estimate before it goes for approval</div></div>

                <div class="print-section"><div class="ps-title">What and where</div>
                    <div class="db-form-grid">
                        <div class="field"><label>Project *</label>
                            <select id="pr-project" onchange="PurchaseRequestsPage.loadSow()">
                                <option value="">— select —</option>
                                ${this._projects.map(p => `<option value="${e(p.id)}" ${existing && existing.projectId === p.id ? 'selected' : ''}>${e(p.name)}</option>`).join('')}
                            </select></div>
                        <div class="field"><label>Charge to SOW item *</label>
                            <select id="pr-sow" onchange="PurchaseRequestsPage.recalc()"><option value="">— select a project first —</option></select>
                            <p class="pr-hint">Every peso traces back to a scope item. This is what makes the budget check possible.</p></div>
                        <div class="field"><label>Needed on site by</label>
                            <input type="date" id="pr-needed" min="${this._minNeeded()}"
                                value="${e(existing ? existing.dateNeeded : this._minNeeded())}" />
                            <p class="pr-hint">Earliest is three days out — approval, ordering and delivery
                            cannot happen the same afternoon, and a date that was never achievable just
                            makes the whole schedule less believable.</p></div>
                        <div class="field"><label>Deliver to</label>
                            <input type="text" id="pr-deliver" value="${e(existing ? existing.deliverTo : '')}" /></div>
                    </div>
                    <div class="field"><label>Title *</label>
                        <input type="text" id="pr-title" value="${e(existing ? existing.title : '')}" placeholder="e.g. Geotextile for NF2 cell" /></div>
                    <div class="field"><label>Description *</label>
                        <textarea id="pr-just" rows="2" placeholder="What is this for, and why is it needed now? Approvers read this first.">${e(existing ? existing.justification : '')}</textarea></div>
                </div>

                <div class="print-section"><div class="ps-title">Items</div>
                    <div style="overflow-x:auto;"><table class="ps-table pr-lines">
                        <thead><tr><th style="min-width:180px;">Item</th><th style="width:80px;">Unit</th>
                            <th class="amt" style="width:90px;">Qty</th><th class="amt" style="width:110px;">Unit price</th>
                            <th class="amt" style="width:120px;">Amount</th><th style="width:40px;"></th></tr></thead>
                        <tbody id="pr-lines"></tbody>
                        <tfoot><tr><td colspan="4">Total</td><td class="amt" id="pr-total">₱0.00</td><td></td></tr></tfoot>
                    </table></div>
                    <button class="btn-sm" style="margin-top:8px;" onclick="PurchaseRequestsPage.addLine()">+ Add item</button>
                    <div id="pr-budget"></div>
                </div>

                <div class="print-section"><div class="ps-title">How will this be paid</div>
                    <div class="pr-route-pick">
                        <label><input type="radio" name="prroute" value="po" ${!existing || existing.route !== 'cash' ? 'checked' : ''} onchange="PurchaseRequestsPage.setRoute()" />
                            <span><b>Purchase order</b><em>Credit from a supplier. Produces a PO to send out and a payable dated from their terms.</em></span></label>
                        <label><input type="radio" name="prroute" value="cash" ${existing && existing.route === 'cash' ? 'checked' : ''} onchange="PurchaseRequestsPage.setRoute()" />
                            <span><b>Cash advance</b><em>Spot purchase paid on the day. The cash advance is created for you — you will not re-type any of this.</em></span></label>
                    </div>
                    <div class="field" id="pr-supp-box" style="margin-top:10px;">
                        <label>Preferred supplier (optional)</label>
                        <select id="pr-supplier">
                            <option value="">— decide later —</option>
                            ${this._suppliers.filter(s => s.status !== 'inactive').map(s =>
                                `<option value="${e(s.id)}" ${existing && existing.preferredSupplierId === s.id ? 'selected' : ''}>${e(s.name)} — ${e(s.termsLabel)}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="print-actions">
                    <button class="btn-primary" onclick="PurchaseRequestsPage.submit('${e(editId || '')}', false)">
                        ${existing ? 'Save and submit' : 'Submit for approval'}</button>
                    <button class="btn-sm" onclick="PurchaseRequestsPage.submit('${e(editId || '')}', true)">Save as draft</button>
                    <button class="btn-ghost" onclick="document.getElementById('prFormModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        this._renderLines();
        this.setRoute();
        if (existing) await this.loadSow(existing.sowId);
    },

    async loadSow(preselect) {
        const pid = document.getElementById('pr-project')?.value;
        const sel = document.getElementById('pr-sow');
        if (!sel) return;
        if (!pid) { sel.innerHTML = '<option value="">— select a project first —</option>'; return; }
        sel.innerHTML = '<option value="">Loading...</option>';
        try {
            const data = await DataService.getProjectData(pid);
            // v11 BATCH H5: headings become optgroup labels and cannot be
            // selected. A purchase is charged to a priced scope item, never
            // to a title — a title has no budget of its own to check
            // against, so choosing one would silently disable the budget
            // check the whole form exists for.
            this._sow = (data && data.sowItems || []).filter(s => !s.isMilestone);
            const PAD = '\u2007\u2007';
            let opts = '<option value="">— select —</option>';
            let open = false;
            this._sow.forEach(s => {
                if (s.isHeading) {
                    if (open) opts += '</optgroup>';
                    opts += `<optgroup label="${this._esc(s.id)} — ${this._esc(s.description || '')}">`;
                    open = true;
                    return;
                }
                const indent = PAD.repeat(Math.max(0, (s.level || 1) - 1));
                opts += `<option value="${this._esc(s.id)}" ${preselect === s.id ? 'selected' : ''}>${indent}${this._esc(s.id)} — ${this._esc(s.description || '')}</option>`;
            });
            if (open) opts += '</optgroup>';
            sel.innerHTML = opts;
            this.recalc();
        } catch (err) {
            sel.innerHTML = '<option value="">Could not load SOW items</option>';
        }
    },

    _renderLines() {
        const tb = document.getElementById('pr-lines');
        if (!tb) return;
        const e = this._esc.bind(this);
        tb.innerHTML = this._lines.map((l, i) => `
            <tr>
                <td><input type="text" value="${e(l.itemName)}" placeholder="Material or service"
                    oninput="PurchaseRequestsPage.setLine(${i},'itemName',this.value)" /></td>
                <td><input type="text" value="${e(l.unit)}" placeholder="pc"
                    oninput="PurchaseRequestsPage.setLine(${i},'unit',this.value)" /></td>
                <td class="amt"><input type="number" min="0" step="any" value="${l.qty}"
                    oninput="PurchaseRequestsPage.setLine(${i},'qty',this.value)" /></td>
                <td class="amt"><input type="number" min="0" step="any" value="${l.rate}"
                    oninput="PurchaseRequestsPage.setLine(${i},'rate',this.value)" /></td>
                <td class="amt pr-line-amt">${this._peso((parseFloat(l.qty)||0)*(parseFloat(l.rate)||0))}</td>
                <td><button class="btn-sm danger" title="Remove" onclick="PurchaseRequestsPage.delLine(${i})">${Icon.close({size:11})}</button></td>
            </tr>`).join('');
        this.recalc();
    },

    setLine(i, field, v) {
        if (!this._lines[i]) return;
        this._lines[i][field] = (field === 'qty' || field === 'rate') ? v : v;
        // Only the amount cell and the budget check need to move — a full
        // re-render here would steal focus from the field being typed in.
        const row = document.querySelectorAll('#pr-lines tr')[i];
        if (row) {
            row.querySelector('.pr-line-amt').textContent =
                this._peso((parseFloat(this._lines[i].qty) || 0) * (parseFloat(this._lines[i].rate) || 0));
        }
        this.recalc();
    },

    addLine() { this._lines.push({ itemName: '', unit: '', qty: 1, rate: 0, notes: '' }); this._renderLines(); },
    delLine(i) {
        if (this._lines.length <= 1) { UI.toast('A request needs at least one item.', 'error'); return; }
        this._lines.splice(i, 1);
        this._renderLines();
    },

    _total() {
        return this._lines.reduce((s, l) =>
            s + (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0), 0);
    },

    /**
     * recalc - updates the total, then asks the SERVER for the budget
     * verdict. Debounced, because it fires on every keystroke in a
     * quantity field and each call reads four sheets.
     */
    recalc() {
        const total = this._total();
        const el = document.getElementById('pr-total');
        if (el) el.textContent = this._peso(total);

        clearTimeout(this._budgetTimer);
        this._budgetTimer = setTimeout(() => this._checkBudget(total), 400);
    },

    async _checkBudget(total) {
        const box = document.getElementById('pr-budget');
        if (!box) return;
        const pid = document.getElementById('pr-project')?.value;
        const sow = document.getElementById('pr-sow')?.value;
        if (!pid || !sow || total <= 0) { box.innerHTML = ''; return; }
        try {
            const b = await DataService.checkPrBudget(pid, sow, total);
            // v11 BATCH G1.1: the heading names the BASIS actually used —
            // materials lines, the whole estimate, or the SOW budget —
            // because a figure whose origin is unexplained gets argued
            // with instead of acted on.
            const basisWord = { materials: 'materials estimate', estimate: 'estimate',
                                budget: 'SOW budget' }[b.basis] || 'budget';
            const title = { ok: 'Within the ' + basisWord,
                            near: 'Close to the ' + basisWord,
                            over: 'Over the ' + basisWord + ' for ' + sow,
                            'no-estimate': 'Nothing to check against' }[b.state] || '';
            const pct = b.budget > 0 ? Math.min(100, Math.round(b.committed / b.budget * 100)) : 0;
            const pctThis = b.budget > 0 ? Math.min(100 - pct, Math.round(b.requested / b.budget * 100)) : 0;
            box.innerHTML = `
                <div class="pr-budget-box ${b.state}">
                    <b>${b.state === 'over' ? Icon.warning({size:12}) + ' ' : ''}${title}</b>
                    <p>${this._esc(b.message)}</p>
                    ${b.budget > 0 ? `
                        <div class="pr-bar"><div class="pr-bar-used" style="width:${pct}%"></div>
                            <div class="pr-bar-this" style="left:${pct}%;width:${pctThis}%"></div></div>
                        <div class="pr-bar-nums">
                            <span>Committed ${this._peso(b.committed)} · this request ${this._peso(b.requested)}</span>
                            <span>${this._esc(b.basisLabel || 'budget')} ${this._peso(b.budget)}</span>
                        </div>` : ''}
                </div>`;
        } catch (err) { box.innerHTML = ''; }
    },

    setRoute() {
        const cash = document.querySelector('input[name="prroute"]:checked')?.value === 'cash';
        const box = document.getElementById('pr-supp-box');
        if (box) box.style.display = cash ? 'none' : 'block';
    },

    async submit(editId, asDraft) {
        const v = id => (document.getElementById(id)?.value || '').trim();
        const payload = {
            projectId: v('pr-project'), sowId: v('pr-sow'), title: v('pr-title'),
            justification: v('pr-just'), dateNeeded: v('pr-needed'), deliverTo: v('pr-deliver'),
            route: document.querySelector('input[name="prroute"]:checked')?.value || 'po',
            preferredSupplierId: v('pr-supplier'),
            status: asDraft ? 'draft' : 'pending',
            lines: this._lines.filter(l => String(l.itemName).trim() && (parseFloat(l.qty) || 0) > 0)
        };
        if (!payload.projectId) { UI.toast('Select a project.', 'error'); return; }
        if (!payload.sowId) { UI.toast('Select the SOW item this is charged to.', 'error'); return; }
        if (!payload.title) { UI.toast('Give the request a title.', 'error'); return; }
        if (!payload.justification) { UI.toast('A description is required — approvers read it first.', 'error'); return; }
        if (!payload.lines.length) { UI.toast('Add at least one item with a quantity.', 'error'); return; }

        try {
            if (editId) {
                await DataService.updatePurchaseRequest(editId, payload);
                if (!asDraft) await DataService.submitDraftPurchaseRequest(editId);
                UI.toast(`${editId} ${asDraft ? 'saved' : 'submitted'}.`, 'success');
            } else {
                const res = await DataService.submitPurchaseRequest(payload);
                UI.toast(asDraft
                    ? `${res.id} saved as a draft.`
                    : res.autoApproved
                        ? `${res.id} submitted and auto-approved.`
                        : `${res.id} submitted for approval.`, 'success');
                if (res.budget && res.budget.state === 'over') {
                    UI.toast('Note: this request is over the materials estimate for that SOW item.', 'error');
                }
            }
            document.getElementById('prFormModal')?.remove();
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async submitDraft(id) {
        try {
            const res = await DataService.submitDraftPurchaseRequest(id);
            UI.toast(res.autoApproved ? `${id} submitted and auto-approved.` : `${id} submitted for approval.`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    // ─── PURCHASE ORDERS (v11 BATCH G2) ─────────────────────────
    // A PR can become SEVERAL POs — ten items and three suppliers
    // winning different lines is normal. Each PR line tracks how much is
    // already ordered so what remains stays visible instead of being
    // silently forgotten or ordered twice.

    _poPr: null,

    async openPoForm(prId) {
        const p = this._get(prId);
        if (!p) return;
        this._poPr = p;
        const e = this._esc.bind(this);
        if (!this._suppliers.length) {
            this._suppliers = await DataService.getSuppliers().catch(() => []);
        }
        const active = this._suppliers.filter(s => s.status !== 'inactive');
        if (!active.length) {
            UI.toast('Add a supplier first — Knowledge Base → Suppliers. Their payment terms set the due date.', 'error');
            return;
        }

        const remaining = (p.lines || []).map(l => ({
            ...l, remaining: (parseFloat(l.qty) || 0) - (parseFloat(l.qtyOrdered) || 0)
        })).filter(l => l.remaining > 0.0001);

        if (!remaining.length) {
            UI.toast('Every line on this request has already been ordered.', 'error');
            return;
        }

        document.getElementById('poFormModal')?.remove();
        const m = document.createElement('div');
        m.className = 'print-modal-overlay open';
        m.id = 'poFormModal';
        m.innerHTML = `
            <div class="print-modal-content" style="max-width:700px;">
                <button class="close-modal" onclick="document.getElementById('poFormModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>Raise purchase order</h2>
                    <div class="print-meta">From ${e(p.id)} — ${e(p.title)} · ${e(p.sowId)}</div></div>

                <div class="db-form-grid">
                    <div class="field"><label>Supplier *</label>
                        <select id="po-supplier" onchange="PurchaseRequestsPage.poTerms()">
                            ${active.map(s => `<option value="${e(s.id)}" data-terms="${e(s.termsLabel)}"
                                ${p.preferredSupplierId === s.id ? 'selected' : ''}>${e(s.name)} — ${e(s.termsLabel)}</option>`).join('')}
                        </select>
                        <p class="pr-hint" id="po-terms"></p></div>
                    <div class="field"><label>Expected delivery</label>
                        <input type="date" id="po-expected" value="${e(p.dateNeeded)}" /></div>
                </div>
                <div class="field"><label>Deliver to</label>
                    <input type="text" id="po-deliver" value="${e(p.deliverTo)}" /></div>

                <div class="print-section"><div class="ps-title">Items to order</div>
                    <p style="font-size:11.5px;color:var(--ink-soft);margin:0 0 8px;">
                        Order all of it, or just the lines this supplier is winning. Whatever you leave
                        can go on another order to someone else.
                    </p>
                    <!-- v11 BATCH H1: the unit price is READ-ONLY here. It is what
                         the approvers signed off on; letting it be retyped at the
                         ordering step means the approved figure and the ordered
                         figure can differ with nothing recording that they did.
                         Quantity stays editable only so one request can be split
                         across several suppliers, and it cannot exceed what remains
                         unordered. If a price has genuinely moved, cancel the
                         request and raise it again at the real number — that keeps
                         the estimate honest for the next job. -->
                    <p class="pr-hint" style="margin:0 0 8px;">
                        Unit prices come from the approved request and cannot be changed here.
                        Quantities can only be reduced, so one request can be split across suppliers.
                    </p>
                    <div style="overflow-x:auto;"><table class="ps-table">
                        <thead><tr><th>Item</th><th>Unit</th><th class="amt">Unordered</th>
                            <th class="amt">Order qty</th><th class="amt">Unit price</th><th class="amt">Amount</th></tr></thead>
                        <tbody>${remaining.map((l, i) => `<tr>
                            <td>${e(l.itemName)}</td><td>${e(l.unit)}</td>
                            <td class="amt">${fmtMoney(l.remaining)}</td>
                            <td class="amt"><input type="number" class="po-q" data-id="${e(l.id)}" data-i="${i}"
                                min="0" max="${l.remaining}" step="any" value="${l.remaining}"
                                oninput="PurchaseRequestsPage.poCalc()" /></td>
                            <td class="amt"><input type="number" class="po-r" data-i="${i}"
                                value="${parseFloat(l.rate) || 0}" readonly tabindex="-1"
                                title="Set on the purchase request — that is what was approved" /></td>
                            <td class="amt po-amt" data-i="${i}">—</td></tr>`).join('')}</tbody>
                        <tfoot><tr><td colspan="5">Order total</td><td class="amt" id="po-total">—</td></tr></tfoot>
                    </table></div>
                    <div id="po-warn"></div>
                </div>

                <div class="field"><label>Notes to the supplier</label><textarea id="po-notes" rows="2"></textarea></div>

                <div class="print-actions">
                    <button class="btn-primary" onclick="PurchaseRequestsPage.submitPo()">Raise purchase order</button>
                    <button class="btn-ghost" onclick="document.getElementById('poFormModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        this.poTerms();
        this.poCalc();
    },

    poTerms() {
        const o = document.getElementById('po-supplier')?.selectedOptions[0];
        const el = document.getElementById('po-terms');
        if (el && o) el.textContent = `Payment terms: ${o.dataset.terms}. The due date is worked out from the delivery date.`;
    },

    /**
     * poCalc - running total, plus the PO-vs-PR tolerance warning shown
     * BEFORE submitting. A PO more than 5% over its request is held for
     * approval rather than issued, and it is better to learn that here
     * than after pressing the button.
     */
    poCalc() {
        let total = 0;
        // The rate input is read-only; its value still reads normally.
        document.querySelectorAll('.po-q').forEach(q => {
            const i = q.dataset.i;
            const r = document.querySelector(`.po-r[data-i="${i}"]`);
            const amt = (parseFloat(q.value) || 0) * (parseFloat(r?.value) || 0);
            total += amt;
            const cell = document.querySelector(`.po-amt[data-i="${i}"]`);
            if (cell) cell.textContent = this._peso(amt);
        });
        const el = document.getElementById('po-total');
        if (el) el.textContent = this._peso(total);

        const warn = document.getElementById('po-warn');
        const pr = this._poPr;
        if (!warn || !pr) return;
        const prTotal = parseFloat(pr.totalAmount) || 0;
        if (prTotal > 0 && total > prTotal * 1.05) {
            warn.innerHTML = `<div class="pr-budget-box over" style="margin-top:10px;">
                <b>${Icon.warning({size:12})} Over the purchase request</b>
                <p>This order is ${this._peso(total)} against a request of ${this._peso(prTotal)} —
                more than 5% over. It will be <b>held for approval</b> rather than issued, and cannot be
                received against until someone else releases it.</p></div>`;
        } else { warn.innerHTML = ''; }
    },

    async submitPo() {
        const pr = this._poPr;
        if (!pr) return;
        const lines = [];
        document.querySelectorAll('.po-q').forEach(q => {
            const qty = parseFloat(q.value) || 0;
            if (qty <= 0) return;
            const r = document.querySelector(`.po-r[data-i="${q.dataset.i}"]`);
            lines.push({ prLineId: q.dataset.id, qty: qty, rate: parseFloat(r?.value) || 0 });
        });
        if (!lines.length) { UI.toast('Enter a quantity for at least one item.', 'error'); return; }
        const v = x => (document.getElementById(x)?.value || '').trim();
        try {
            const res = await DataService.createPurchaseOrder({
                prId: pr.id, supplierId: v('po-supplier'), expectedDate: v('po-expected'),
                deliverTo: v('po-deliver'), notes: v('po-notes'), lines: lines
            });
            document.getElementById('poFormModal')?.remove();
            UI.toast(res.heldForApproval
                ? `${res.id} raised but HELD — it exceeds the request and needs another approver.`
                : `${res.id} raised for ${this._peso(res.grossAmount)}. If delivered today it would fall due ${res.dueDateIfDeliveredToday}.`,
                res.heldForApproval ? 'error' : 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async openPoList(prId) {
        try {
            const all = await DataService.getPurchaseOrders();
            const pos = (all || []).filter(p => p.prId === prId);
            const e = this._esc.bind(this);
            document.getElementById('poListModal')?.remove();
            const m = document.createElement('div');
            m.className = 'print-modal-overlay open';
            m.id = 'poListModal';
            m.innerHTML = `
                <div class="print-modal-content" style="max-width:700px;">
                    <button class="close-modal" onclick="document.getElementById('poListModal').remove()">${Icon.close({size:18})}</button>
                    <div class="print-header"><h2>Purchase orders</h2>
                        <div class="print-meta">Raised against ${e(prId)}</div></div>
                    ${pos.length ? `<table class="ps-table">
                        <thead><tr><th>PO</th><th>Supplier</th><th class="amt">Gross</th>
                            <th class="amt">Received</th><th>Status</th><th></th></tr></thead>
                        <tbody>${pos.map(p => `<tr>
                            <td>${e(p.id)}<div class="muted">${e(p.termsLabel)}</div></td>
                            <td>${e(p.supplierName)}</td>
                            <td class="amt">${this._peso(p.grossAmount)}</td>
                            <td class="amt">${p.receivedPct}%</td>
                            <td><span class="stamp">${e(p.status)}</span></td>
                            <td><button class="btn-sm" title="Print for the supplier"
                                    onclick="PurchaseRequestsPage.printPo('${e(p.id)}')">${Icon.printer({size:12})}</button>
                                ${['issued','partly received'].includes(String(p.status).toLowerCase())
                                ? `<button class="btn-sm primary" onclick="PurchaseRequestsPage.openReceive('${e(p.id)}')">Receive</button>` : ''}
                                ${String(p.status).toLowerCase() === 'pending approval'
                                ? `<button class="btn-sm success" onclick="PurchaseRequestsPage.approvePo('${e(p.id)}')">Approve overrun</button>` : ''}</td>
                        </tr>`).join('')}</tbody></table>`
                        : '<div class="empty"><p>No purchase orders yet.</p></div>'}
                    <div class="print-actions">
                        <button class="btn-ghost" onclick="document.getElementById('poListModal').remove()">Close</button>
                    </div>
                </div>`;
            document.body.appendChild(m);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * printPo (v11 BATCH H1) - The purchase order as the SUPPLIER sees it.
     *
     * This is an external document, so it carries none of the internal
     * apparatus: no budget verdict, no estimate comparison, no
     * commitment breakdown. Those are for approvers deciding whether to
     * spend; a supplier being told what to deliver has no business
     * seeing how close the job is to its budget.
     *
     * What it DOES carry is what a supplier needs to act and to invoice:
     * the line items, the delivery address and date, the payment terms,
     * the VAT breakdown, and somewhere to sign.
     */
    async printPo(id) {
        try {
            const all = await DataService.getPurchaseOrders();
            const po = (all || []).find(p => p.id === id);
            if (!po) { UI.toast('Purchase order not found.', 'error'); return; }
            await PrintDoc.load();

            const e = this._esc.bind(this);
            const money = v => fmtMoney(parseFloat(v) || 0);
            const rows = (po.lines || []).map((l, i) => `<tr>
                <td class="ctr">${i + 1}</td>
                <td>${e(l.itemName)}</td>
                <td class="ctr">${e(l.unit)}</td>
                <td class="amt">${money(l.qty)}</td>
                <td class="amt">${money(l.rate)}</td>
                <td class="amt">${money(l.amount)}</td></tr>`).join('');

            const vatRow = (parseFloat(po.vatAmount) || 0) > 0 ? `
                <tr><td colspan="5" class="lbl">Subtotal, net of VAT</td><td class="amt">${money(po.netAmount)}</td></tr>
                <tr><td colspan="5" class="lbl">VAT 12%</td><td class="amt">${money(po.vatAmount)}</td></tr>` : '';

            const w = window.open('', '_blank');
            if (!w) { UI.toast('Allow pop-ups for this site to print.', 'error'); return; }
            w.document.write(PrintDoc.documentHTML({
                title: 'Purchase Order ' + po.id,
                meta: po.projectName + (po.sowId ? ' · ' + po.sowId : ''),
                body: `
                    <table class="po-meta">
                        <tr><td class="k">Supplier</td><td><b>${e(po.supplierName)}</b></td>
                            <td class="k">PO number</td><td><b>${e(po.id)}</b></td></tr>
                        <tr><td class="k">Payment terms</td><td>${e(po.termsLabel)}</td>
                            <td class="k">Date issued</td><td>${this._date(po.issuedAt)}</td></tr>
                        <tr><td class="k">Deliver to</td><td>${e(po.deliverTo) || '—'}</td>
                            <td class="k">Expected delivery</td><td>${po.expectedDate ? this._date(po.expectedDate) : 'To be advised'}</td></tr>
                    </table>

                    <table class="po-items">
                        <thead><tr><th class="ctr">#</th><th>Description</th><th class="ctr">Unit</th>
                            <th class="amt">Qty</th><th class="amt">Unit price</th><th class="amt">Amount</th></tr></thead>
                        <tbody>${rows}</tbody>
                        <tfoot>${vatRow}
                            <tr class="grand"><td colspan="5" class="lbl">TOTAL</td>
                                <td class="amt">${money(po.grossAmount)}</td></tr></tfoot>
                    </table>

                    ${po.notes ? `<p class="po-notes"><b>Notes:</b> ${e(po.notes)}</p>` : ''}

                    <div class="po-terms">
                        <h3>Terms and conditions</h3>
                        <ol>
                            <li><b>Payment terms:</b> ${e(po.termsLabel)}. Terms run from the date of
                                delivery, not the date of invoice.</li>
                            <li>Deliver to ${e(po.deliverTo) || 'the address above'}${po.expectedDate ? ' on or before ' + this._date(po.expectedDate) : ''}.
                                Advise us in advance if the delivery date cannot be met.</li>
                            <li>This purchase order number must appear on the delivery receipt and the
                                sales invoice. Invoices without it may be delayed in processing.</li>
                            <li>Quantities and unit prices are as stated. Any variation must be agreed
                                in writing before delivery; goods delivered outside this order may be
                                rejected or returned at the supplier's cost.</li>
                            <li>Goods are subject to inspection on arrival. Items found short, damaged
                                or not to specification will be rejected and are to be replaced at the
                                supplier's cost.</li>
                            <li>Partial deliveries are accepted; each is invoiced against the quantity
                                actually received.</li>
                            <li>Prices are ${(parseFloat(po.vatAmount) || 0) > 0 ? 'inclusive of VAT' : 'as quoted'}
                                and inclusive of delivery unless stated otherwise.</li>
                        </ol>
                    </div>`,
                css: `
                    .po-meta { width:100%; border-collapse:collapse; margin:4px 0 16px; font-size:11.5px; }
                    .po-meta td { padding:4px 6px; border-bottom:1px dotted #D6D2C4; }
                    .po-meta td.k { color:#5B6360; text-transform:uppercase; font-size:9px;
                        letter-spacing:.06em; width:110px; white-space:nowrap; }
                    .po-items { width:100%; border-collapse:collapse; font-size:11px; }
                    .po-items th { background:#EEF1F3; border:1px solid #C9C5B8; padding:6px;
                        text-transform:uppercase; font-size:9px; letter-spacing:.05em; text-align:left; }
                    .po-items td { border:1px solid #E5E1D6; padding:5px 6px; }
                    .po-items td.amt, .po-items th.amt { text-align:right;
                        font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
                    .po-items td.ctr, .po-items th.ctr { text-align:center; }
                    .po-items td.lbl { text-align:right; font-weight:600; }
                    .po-items tfoot td { background:#F6F4EC; }
                    .po-items tr.grand td { font-size:13px; font-weight:700; }
                    .po-notes { font-size:11.5px; margin-top:10px; }
                    .po-terms { margin-top:20px; page-break-inside:avoid; }
                    .po-terms h3 { font-family:'Oswald',sans-serif; font-size:11px; text-transform:uppercase;
                        letter-spacing:.08em; color:var(--pd-accent); border-bottom:1px solid #D6D2C4;
                        padding-bottom:4px; margin:0 0 8px; }
                    .po-terms ol { margin:0; padding-left:18px; font-size:10.5px; line-height:1.6; }
                    .po-terms li { margin-bottom:3px; }`
            }));
            w.document.close();
            setTimeout(() => { try { w.focus(); } catch (err2) {} }, 250);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async approvePo(id) {
        try {
            await DataService.approvePurchaseOrder(id);
            UI.toast(`${id} released — it can now be received against.`, 'success');
            document.getElementById('poListModal')?.remove();
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * openReceive - RECEIVING IS A COST EVENT. The moment this saves,
     * the SOW's actual cost moves, CPI moves and the project's expenses
     * move — no payment required. The modal says so, because a person
     * ticking off a delivery note should know it is an accounting entry.
     */
    async openReceive(poId) {
        try {
            const all = await DataService.getPurchaseOrders();
            const po = (all || []).find(p => p.id === poId);
            if (!po) { UI.toast('Purchase order not found.', 'error'); return; }
            const e = this._esc.bind(this);
            const outstanding = (po.lines || []).map(l => ({
                ...l, remaining: (parseFloat(l.qty) || 0) - (parseFloat(l.qtyReceived) || 0)
            })).filter(l => l.remaining > 0.0001);
            if (!outstanding.length) { UI.toast('Everything on this order has been received.', 'error'); return; }

            document.getElementById('grnModal')?.remove();
            const m = document.createElement('div');
            m.className = 'print-modal-overlay open';
            m.id = 'grnModal';
            m.innerHTML = `
                <div class="print-modal-content" style="max-width:660px;">
                    <button class="close-modal" onclick="document.getElementById('grnModal').remove()">${Icon.close({size:18})}</button>
                    <div class="print-header"><h2>Receive goods</h2>
                        <div class="print-meta">${e(po.id)} · ${e(po.supplierName)} · ${e(po.projectName)} · ${e(po.sowId)}</div></div>

                    <div class="pay-explain" style="margin-bottom:12px;">
                        <b>This books cost against ${e(po.sowId)}.</b>
                        <p>Saving this moves the scope item's actual cost, the project's expenses and CPI —
                        no payment needed. Record only what physically arrived.</p>
                    </div>

                    <div class="db-form-grid">
                        <div class="field"><label>Delivery date</label>
                            <input type="date" id="grn-date" value="${new Date().toISOString().slice(0,10)}" /></div>
                        <div class="field"><label>Delivery receipt no.</label>
                            <input type="text" id="grn-ref" placeholder="DR / waybill number" /></div>
                    </div>

                    <div style="overflow-x:auto;"><table class="ps-table">
                        <thead><tr><th>Item</th><th>Unit</th><th class="amt">Outstanding</th>
                            <th class="amt">Received now</th></tr></thead>
                        <tbody>${outstanding.map(l => `<tr>
                            <td>${e(l.itemName)}</td><td>${e(l.unit)}</td>
                            <td class="amt">${fmtMoney(l.remaining)}</td>
                            <td class="amt"><input type="number" class="grn-q" data-id="${e(l.id)}"
                                min="0" max="${l.remaining}" step="any" value="${l.remaining}" /></td>
                        </tr>`).join('')}</tbody>
                    </table></div>

                    <div class="field" style="margin-top:10px;"><label>Notes</label>
                        <textarea id="grn-notes" rows="2" placeholder="Short delivery, damage, substitutions"></textarea></div>

                    <div class="print-actions">
                        <button class="btn-primary" onclick="PurchaseRequestsPage.submitReceive('${e(po.id)}')">Record delivery</button>
                        <button class="btn-ghost" onclick="document.getElementById('grnModal').remove()">Cancel</button>
                    </div>
                </div>`;
            document.body.appendChild(m);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async submitReceive(poId) {
        const lines = [];
        document.querySelectorAll('.grn-q').forEach(q => {
            const qty = parseFloat(q.value) || 0;
            if (qty > 0) lines.push({ poLineId: q.dataset.id, qty: qty });
        });
        if (!lines.length) { UI.toast('Enter what actually arrived.', 'error'); return; }
        const v = x => (document.getElementById(x)?.value || '').trim();
        try {
            const res = await DataService.receiveGoods({
                poId: poId, receiptDate: v('grn-date'), deliveryRef: v('grn-ref'),
                notes: v('grn-notes'), lines: lines
            });
            document.getElementById('grnModal')?.remove();
            document.getElementById('poListModal')?.remove();
            UI.toast(`Delivery recorded. ${this._peso(res.netAmount)} of cost booked; payable due ${res.dueDate}.`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async cancel(id) {
        const ok = await Confirm.open(`Cancel ${id}?`,
            'The request will be closed and cannot be ordered against. It stays on record.');
        if (!ok) return;
        try {
            await DataService.cancelPurchaseRequest(id, '');
            UI.toast(`${id} cancelled.`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
};