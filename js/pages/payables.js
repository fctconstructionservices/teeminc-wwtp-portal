// ================================================================
//  pages/payables.js — Payables (v11 BATCH G2)
//
//  Who you owe, and when. This is the reason the supplier record exists:
//  every due date here is the delivery date plus that supplier's terms.
//
//  THE COLUMN THAT MATTERS MOST is the one most systems leave out:
//  RECEIVED, NOT INVOICED. Goods routinely arrive weeks before the
//  invoice does. That value is already counted as cost and is money you
//  owe — you simply have not been asked for it yet. Leaving it out is
//  how a cashflow gets ambushed by a bill for a delivery from six weeks
//  ago.
//
//  Paying here is CASH OUT, not cost. The cost landed when the goods
//  were received. Nothing on this page moves a SOW's actual cost, and
//  that separation is the whole point of accrual.
// ================================================================

const PayablesPage = {

    _data: null,
    _filter: 'open',

    async load() {
        const box = document.getElementById('payablesContent');
        if (!box) return;
        UI.showLoading(box);
        try {
            this._data = await DataService.getPayables();
            this._render();
        } catch (err) {
            UI.toast('Could not load payables: ' + (err.message || err), 'error');
        }
    },

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    _peso(v) { return '₱' + fmtMoney(parseFloat(v) || 0); },
    _date(v) {
        if (!v) return '—';
        const d = new Date(v);
        return isNaN(d) ? String(v) : d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    _render() {
        const box = document.getElementById('payablesContent');
        const d = this._data || { invoices: [], uninvoiced: [], summary: {} };
        const s = d.summary || {};
        const e = this._esc.bind(this);

        const open = d.invoices.filter(i => i.balance > 0.005);
        let rows;
        if (this._filter === 'uninvoiced') rows = [];
        else if (this._filter === 'all') rows = d.invoices;
        else if (this._filter === 'open') rows = open;
        else rows = open.filter(i => i.bucket === this._filter);

        box.innerHTML = `
            <div class="section-head"><h2>Payables</h2><div class="rule"></div>
                <span class="badge">${s.openCount || 0} open across ${s.supplierCount || 0} supplier${s.supplierCount === 1 ? '' : 's'}</span>
            </div>
            <p class="data-source-note" style="margin-bottom:14px;">
                Every due date is the delivery date plus that supplier's payment terms. Paying here is
                money out — the cost was already booked when the goods arrived.
            </p>

            <div class="kpi-strip pay-strip" style="margin-bottom:16px;">
                <div class="kpi-card ${s.overdue > 0 ? 'bad' : ''}">
                    <div class="k-label">Overdue</div><div class="k-val mono">${this._peso(s.overdue)}</div>
                    <div class="k-sub">${s.overdueCount || 0} invoice${s.overdueCount === 1 ? '' : 's'}</div></div>
                <div class="kpi-card ${s.dueWeek > 0 ? 'warn' : ''}">
                    <div class="k-label">Due this week</div><div class="k-val mono">${this._peso(s.dueWeek)}</div>
                    <div class="k-sub">${s.dueWeekCount || 0} invoice${s.dueWeekCount === 1 ? '' : 's'}</div></div>
                <div class="kpi-card"><div class="k-label">Total outstanding</div>
                    <div class="k-val mono">${this._peso(s.outstanding)}</div>
                    <div class="k-sub">all unpaid balances</div></div>
                <div class="kpi-card"><div class="k-label">Received, not invoiced</div>
                    <div class="k-val mono">${this._peso(s.uninvoiced)}</div>
                    <div class="k-sub">already counted as cost</div></div>
            </div>

            <div class="status-tabs" style="margin-bottom:14px;">
                <button class="${this._filter === 'open' ? 'active' : ''}" onclick="PayablesPage.setFilter('open')">Open (${open.length})</button>
                <button class="${this._filter === 'overdue' ? 'active' : ''}" onclick="PayablesPage.setFilter('overdue')">Overdue (${s.overdueCount || 0})</button>
                <button class="${this._filter === 'week' ? 'active' : ''}" onclick="PayablesPage.setFilter('week')">Due 7 days (${s.dueWeekCount || 0})</button>
                <button class="${this._filter === 'month' ? 'active' : ''}" onclick="PayablesPage.setFilter('month')">Due 30 days</button>
                <button class="${this._filter === 'uninvoiced' ? 'active' : ''}" onclick="PayablesPage.setFilter('uninvoiced')">Awaiting invoice (${s.uninvoicedCount || 0})</button>
                <button class="${this._filter === 'all' ? 'active' : ''}" onclick="PayablesPage.setFilter('all')">All (${d.invoices.length})</button>
            </div>

            ${this._filter === 'uninvoiced'
                ? this._uninvoicedTable(d.uninvoiced)
                : this._invoiceTable(rows)}`;
    },

    setFilter(f) { this._filter = f; this._render(); },

    _ageChip(i) {
        if (i.balance <= 0.005) return '<span class="pay-age paid">Paid</span>';
        if (i.daysToDue === null) return '<span class="pay-age future">No due date</span>';
        if (i.daysToDue < 0) return `<span class="pay-age due">${Math.abs(i.daysToDue)} day${Math.abs(i.daysToDue) === 1 ? '' : 's'} overdue</span>`;
        if (i.daysToDue === 0) return '<span class="pay-age due">Due today</span>';
        if (i.daysToDue <= 7) return `<span class="pay-age soon">due in ${i.daysToDue} day${i.daysToDue === 1 ? '' : 's'}</span>`;
        return `<span class="pay-age future">due in ${i.daysToDue} days</span>`;
    },

    _invoiceTable(rows) {
        if (!rows.length) return '<div class="empty"><p>Nothing here. Record a supplier invoice against a received purchase order to create a payable.</p></div>';
        const e = this._esc.bind(this);
        const total = rows.reduce((s, i) => s + (parseFloat(i.balance) || 0), 0);
        return `<div class="panel" style="padding:0;overflow:hidden;"><div class="scroll-x">
            <table class="pay-table">
                <thead><tr><th>Supplier</th><th>Reference</th><th>Project / SOW</th>
                    <th class="amt">Amount</th><th class="amt">Paid</th><th class="amt">Balance</th>
                    <th>Due</th><th>Status</th><th></th></tr></thead>
                <tbody>${rows.map(i => `<tr class="${i.bucket}">
                    <td><b>${e(i.supplierName)}</b><div class="muted">${e(i.termsLabel)}</div></td>
                    <td>${e(i.poId)}<div class="muted">${e(i.invoiceNo) || 'no invoice no.'}</div></td>
                    <td>${e(i.projectName)}<div class="muted">${e(i.sowId)}</div></td>
                    <td class="amt">${this._peso(i.grossAmount)}</td>
                    <td class="amt">${i.paidAmount > 0 ? this._peso(i.paidAmount) : '—'}</td>
                    <td class="amt"><b>${this._peso(i.balance)}</b></td>
                    <td>${this._ageChip(i)}<div class="muted">${this._date(i.dueDate)}</div></td>
                    <td><span class="stamp ${i.status === 'Paid' ? 'approved' : i.status === 'Partly Paid' ? 'part' : ''}">${e(i.status)}</span></td>
                    <td>${i.balance > 0.005
                        ? `<button class="btn-sm primary" onclick="PayablesPage.openPay('${e(i.id)}')">Pay</button>` : ''}
                        <button class="btn-sm" onclick="PayablesPage.view('${e(i.id)}')">${Icon.search({size:12})}</button></td>
                </tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="5">${rows.length} invoice${rows.length === 1 ? '' : 's'}</td>
                    <td class="amt">${this._peso(total)}</td><td colspan="3"></td></tr></tfoot>
            </table></div></div>`;
    },

    _uninvoicedTable(rows) {
        if (!rows.length) return '<div class="empty"><p>Every delivery has been invoiced.</p></div>';
        const e = this._esc.bind(this);
        const total = rows.reduce((s, r) => s + (parseFloat(r.balance) || 0), 0);
        return `
            <div class="pay-explain">
                <b>Goods received that the supplier has not billed yet.</b>
                <p>This value is already counted as cost against the job, and it is money you owe — you
                simply have not been asked for it. It is here so it cannot ambush your cashflow when the
                invoice finally arrives.</p>
            </div>
            <div class="panel" style="padding:0;overflow:hidden;"><div class="scroll-x">
            <table class="pay-table">
                <thead><tr><th>Supplier</th><th>Delivery</th><th>Project / SOW</th>
                    <th class="amt">Value</th><th>Expected due</th><th></th></tr></thead>
                <tbody>${rows.map(r => `<tr>
                    <td><b>${e(r.supplierName)}</b><div class="muted">${e(r.termsLabel)}</div></td>
                    <td>${e(r.poId)}<div class="muted">${e(r.deliveryRef) || this._date(r.receiptDate)}</div></td>
                    <td>${e(r.projectName)}<div class="muted">${e(r.sowId)}</div></td>
                    <td class="amt"><b>${this._peso(r.grossAmount)}</b></td>
                    <td>${this._date(r.expectedDue)}<div class="muted">if invoiced today</div></td>
                    <td><button class="btn-sm primary" onclick="PayablesPage.openInvoice('${e(r.poId)}')">Enter invoice</button></td>
                </tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="3">${rows.length} delivery${rows.length === 1 ? '' : 'ies'}</td>
                    <td class="amt">${this._peso(total)}</td><td colspan="2"></td></tr></tfoot>
            </table></div></div>`;
    },

    view(id) {
        const i = (this._data.invoices || []).find(x => x.id === id);
        if (!i) return;
        const e = this._esc.bind(this);
        document.getElementById('payViewModal')?.remove();
        const m = document.createElement('div');
        m.className = 'print-modal-overlay open';
        m.id = 'payViewModal';
        m.innerHTML = `
            <div class="print-modal-content" style="max-width:600px;">
                <button class="close-modal" onclick="document.getElementById('payViewModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>${e(i.invoiceNo) || e(i.id)}</h2>
                    <div class="print-meta">${e(i.supplierName)} · ${e(i.poId)} · ${e(i.projectName)} · ${e(i.sowId)}</div></div>

                <div class="print-section"><div class="ps-title">Amounts</div>
                    <div class="db-form-grid" style="font-size:12.5px;">
                        <div>Gross<br><b>${this._peso(i.grossAmount)}</b></div>
                        <div>Net of VAT<br><b>${this._peso(i.netAmount)}</b></div>
                        <div>Input VAT<br><b>${this._peso(i.vatAmount)}</b></div>
                        <div>Balance<br><b>${this._peso(i.balance)}</b></div>
                    </div>
                    <p style="font-size:11px;color:var(--ink-soft);margin-top:8px;">
                        ${this._peso(i.netAmount)} was charged to ${e(i.sowId)} when the goods were received.
                        Input VAT is reclaimed, so it is not part of the job's cost.
                    </p>
                </div>

                <div class="print-section"><div class="ps-title">Dates</div>
                    <div class="db-form-grid" style="font-size:12.5px;">
                        <div>Delivered<br><b>${this._date(i.deliveryDate)}</b></div>
                        <div>Invoiced<br><b>${this._date(i.invoiceDate)}</b></div>
                        <div>Terms<br><b>${e(i.termsLabel)}</b></div>
                        <div>Due<br><b>${this._date(i.dueDate)}</b></div>
                    </div>
                    <p style="font-size:11px;color:var(--ink-soft);margin-top:8px;">
                        Terms run from delivery, not from the invoice date — otherwise a slow-invoicing
                        supplier quietly extends their own credit.
                    </p>
                </div>

                ${(i.payments || []).length ? `<div class="print-section"><div class="ps-title">Payments</div>
                    <table class="ps-table"><thead><tr><th>Date</th><th>Method</th><th>Reference</th>
                        <th class="amt">Amount</th></tr></thead>
                    <tbody>${i.payments.map(p => `<tr><td>${this._date(p.date)}</td>
                        <td>${e(p.method) || '—'}</td><td>${e(p.reference) || '—'}</td>
                        <td class="amt">${this._peso(p.amount)}</td></tr>`).join('')}</tbody></table>
                </div>` : ''}

                <div class="print-actions">
                    ${i.balance > 0.005 ? `<button class="btn-primary" onclick="document.getElementById('payViewModal').remove();PayablesPage.openPay('${e(i.id)}')">Record payment</button>` : ''}
                    <button class="btn-sm" onclick="PrintDoc.print({title:'Supplier invoice ${e(i.invoiceNo || i.id)}'})">${Icon.printer({size:12})} Print</button>
                    <button class="btn-ghost" onclick="document.getElementById('payViewModal').remove()">Close</button>
                </div>
            </div>`;
        document.body.appendChild(m);
    },

    openPay(id) {
        const i = (this._data.invoices || []).find(x => x.id === id);
        if (!i) return;
        const e = this._esc.bind(this);
        document.getElementById('payModal')?.remove();
        const m = document.createElement('div');
        m.className = 'print-modal-overlay open';
        m.id = 'payModal';
        m.innerHTML = `
            <div class="print-modal-content" style="max-width:460px;">
                <button class="close-modal" onclick="document.getElementById('payModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>Record payment</h2>
                    <div class="print-meta">${e(i.supplierName)} · ${e(i.invoiceNo) || e(i.id)} · balance ${this._peso(i.balance)}</div></div>
                <div class="field"><label>Amount</label>
                    <input type="number" id="pay-amt" step="0.01" min="0" value="${i.balance}" />
                    <p style="font-size:11px;color:var(--ink-soft);margin-top:4px;">Leave as-is to settle in full, or reduce it for a partial payment.</p></div>
                <div class="db-form-grid">
                    <div class="field"><label>Date</label>
                        <input type="date" id="pay-date" value="${new Date().toISOString().slice(0,10)}" /></div>
                    <div class="field"><label>Method</label>
                        <select id="pay-method"><option>Bank transfer</option><option>Cheque</option>
                            <option>Cash</option><option>Online</option></select></div>
                </div>
                <div class="field"><label>Reference</label>
                    <input type="text" id="pay-ref" placeholder="Cheque no., transfer ref" /></div>
                <p style="font-size:11.5px;color:var(--ink-soft);line-height:1.5;">
                    This records money leaving the account. It does <b>not</b> change the job's cost —
                    that was booked when the goods arrived.
                </p>
                <div class="print-actions">
                    <button class="btn-primary" onclick="PayablesPage.pay('${e(id)}')">Record payment</button>
                    <button class="btn-ghost" onclick="document.getElementById('payModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(m);
    },

    async pay(id) {
        const v = x => (document.getElementById(x)?.value || '').trim();
        const amt = parseFloat(v('pay-amt'));
        if (!amt || amt <= 0) { UI.toast('Enter the payment amount.', 'error'); return; }
        try {
            const res = await DataService.paySupplierInvoice(id, {
                amount: amt, paymentDate: v('pay-date'),
                method: v('pay-method'), reference: v('pay-ref')
            });
            document.getElementById('payModal')?.remove();
            UI.toast(res.fullyPaid
                ? 'Paid in full.'
                : `Payment recorded — ${this._peso(res.balance)} still outstanding.`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    openInvoice(poId) {
        const e = this._esc.bind(this);
        document.getElementById('invModal')?.remove();
        const m = document.createElement('div');
        m.className = 'print-modal-overlay open';
        m.id = 'invModal';
        m.innerHTML = `
            <div class="print-modal-content" style="max-width:480px;">
                <button class="close-modal" onclick="document.getElementById('invModal').remove()">${Icon.close({size:18})}</button>
                <div class="print-header"><h2>Enter supplier invoice</h2>
                    <div class="print-meta">Against ${e(poId)}</div></div>
                <div class="field"><label>Supplier invoice number</label>
                    <input type="text" id="inv-no" placeholder="e.g. SI-4471" /></div>
                <div class="db-form-grid">
                    <div class="field"><label>Invoice date</label>
                        <input type="date" id="inv-date" value="${new Date().toISOString().slice(0,10)}" /></div>
                    <div class="field"><label>Gross amount</label>
                        <input type="number" id="inv-amt" step="0.01" min="0" placeholder="leave blank to use the delivered value" /></div>
                </div>
                <p style="font-size:11.5px;color:var(--ink-soft);line-height:1.5;">
                    The due date is worked out from the supplier's terms applied to the <b>delivery</b> date.
                    Leave the amount blank to bill exactly what was received.
                </p>
                <div class="field"><label>Notes</label><textarea id="inv-notes" rows="2"></textarea></div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="PayablesPage.saveInvoice('${e(poId)}')">Record invoice</button>
                    <button class="btn-ghost" onclick="document.getElementById('invModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(m);
    },

    async saveInvoice(poId) {
        const v = x => (document.getElementById(x)?.value || '').trim();
        try {
            const res = await DataService.recordSupplierInvoice({
                poId: poId, invoiceNo: v('inv-no'), invoiceDate: v('inv-date'),
                grossAmount: v('inv-amt'), notes: v('inv-notes')
            });
            document.getElementById('invModal')?.remove();
            UI.toast(`Invoice recorded — ${this._peso(res.grossAmount)} due ${this._date(res.dueDate)}.`, 'success');
            await this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
};
