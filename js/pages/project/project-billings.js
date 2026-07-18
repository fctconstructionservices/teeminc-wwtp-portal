// ================================================================
//  project-billings.js — Progress Billings tab (v6)
//  ---------------------------------------------------------------
//  Bills the client from the budget-weighted % accomplishment the
//  Gantt already computes. gross = (current% − last billed%) ×
//  revised contract (contractValue + client-approved VOs);
//  retention withheld per project setting. Approval runs through the
//  same multi-signature engine (type 'Billing'); Mark Paid posts an
//  Approved IncomingCash so the collection lands in revenue.
//  Augments ProjectPage via Object.assign.
// ================================================================

Object.assign(ProjectPage, {

    renderBillings(p) {
        const container = document.getElementById('proj-tab-billings');
        if (!container) return;
        const user = App.getUser();
        const isSuper = user && user.role === 'superadmin';
        const isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');
        const billings = p.billings || [];

        const nonRejected = billings.filter(b => b.status !== 'Rejected');
        const billedGross = nonRejected.reduce((s, b) => s + (parseFloat(b.grossAmount) || 0), 0);
        const collected = billings.filter(b => b.status === 'Paid').reduce((s, b) => s + (parseFloat(b.netAmount) || 0), 0);
        const retentionHeld = nonRejected.reduce((s, b) => s + (parseFloat(b.retentionAmount) || 0), 0);
        const lastPct = nonRejected.reduce((mx, b) => Math.max(mx, parseFloat(b.currentPct) || 0), 0);
        const revised = p.contractValueRevised || 0;
        const voSum = revised - (p.contractValue || 0);

        let html = `
            <div class="kpi-strip" style="margin-bottom:14px;">
                <div class="kpi-card"><div class="k-label">Contract Value (revised)</div><div class="k-val mono">₱${fmtMoney(revised)}</div><div class="k-sub">base ₱${fmtMoney(p.contractValue || 0)}${voSum ? ' + VOs ₱' + fmtMoney(voSum) : ''} · retention ${Math.round((p.retentionPct || 0.10) * 100)}%</div></div>
                <div class="kpi-card good"><div class="k-label">Billed to Date</div><div class="k-val mono">₱${fmtMoney(billedGross)}</div><div class="k-sub">${lastPct}% of contract billed</div></div>
                <div class="kpi-card good"><div class="k-label">Collected (net)</div><div class="k-val mono">₱${fmtMoney(collected)}</div><div class="k-sub">paid billings → project revenue</div></div>
                <div class="kpi-card warn"><div class="k-label">Retention Held</div><div class="k-val mono">₱${fmtMoney(retentionHeld)}</div><div class="k-sub">released on turnover</div></div>
            </div>`;

        // Super Admin: set contract value inline
        if (isSuper) {
            html += `
            <div class="panel" style="margin-bottom:14px;"><div class="panel-head"><h3>Contract Settings</h3><span class="cc-note">Super Admin only</span></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;padding:12px 16px;">
                    <div class="field" style="min-width:180px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Contract Value (₱)</label>
                        <input type="number" id="bil-contract-value" value="${p.contractValue || ''}" placeholder="e.g. 18500000" style="width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);" /></div>
                    <div class="field" style="min-width:120px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Retention %</label>
                        <input type="number" id="bil-retention-pct" value="${Math.round((p.retentionPct || 0.10) * 100)}" min="0" max="50" style="width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);" /></div>
                    <button class="btn-sm primary" onclick="ProjectPage.saveContract()">Save</button>
                </div>
            </div>`;
        }

        html += `
            <div class="section-head"><h2>Billing Register</h2><div class="rule"></div>
                ${isAdmin ? `<button class="btn-sm primary" onclick="ProjectPage.generateBilling()">+ Generate from Progress (${p.totalProgress || 0}%)</button>` : ''}
            </div>
            <div class="panel"><table><thead><tr>
                <th>Billing #</th><th>Period</th>
                <th style="text-align:right">% Range</th>
                <th style="text-align:right">Gross</th><th style="text-align:right">Retention</th><th style="text-align:right">Net</th>
                <th>Status</th><th></th>
            </tr></thead><tbody>`;

        if (!billings.length) {
            html += `<tr><td colspan="8" style="text-align:center;color:var(--ink-soft);padding:24px">No billings yet. ${revised > 0 ? 'Generate the first one from progress.' : 'Set the Contract Value first.'}</td></tr>`;
        } else {
            const myEmail = user ? String(user.email).toLowerCase() : '';
            billings.forEach(b => {
                const cls = b.status === 'Paid' || b.status === 'Approved' ? 'approved' : b.status === 'Pending' ? 'pending' : 'rejected';
                const isSubmitter = String(b.submittedBy || '').toLowerCase() === myEmail;
                let actions = '';
                if (b.status === 'Pending' && user && user.role === 'admin' && !isSubmitter) {
                    actions = `<button class="btn-sm success" onclick="ProjectPage.approveBilling('${b.id}')">Approve</button>`;
                } else if (b.status === 'Pending' && isSuper) {
                    actions = `<button class="btn-sm" onclick="ProjectPage.approveBilling('${b.id}', true)">Force Approve</button>`;
                } else if (b.status === 'Approved' && isAdmin) {
                    actions = `<button class="btn-sm success" onclick="ProjectPage.payBilling('${b.id}')">Mark Paid</button>`;
                }
                html += `<tr>
                    <td><span class="req-id">${b.billingNo}</span></td>
                    <td>${b.period || '—'}</td>
                    <td class="amt">${b.prevPct}% → ${b.currentPct}%</td>
                    <td class="amt">₱${fmtMoney(b.grossAmount || 0)}</td>
                    <td class="amt">₱${fmtMoney(b.retentionAmount || 0)}</td>
                    <td class="amt"><b>₱${fmtMoney(b.netAmount || 0)}</b></td>
                    <td><span class="stamp ${cls}">${b.status}</span></td>
                    <td>${actions}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>
            <div class="data-source-note">Billing = (current % − last billed %) × revised contract. Approval needs every admin's signature; Paid posts the net amount as Incoming Cash.</div>`;
        container.innerHTML = html;
    },

    async saveContract() {
        const cv = parseFloat(document.getElementById('bil-contract-value')?.value);
        const rpRaw = parseFloat(document.getElementById('bil-retention-pct')?.value);
        if (isNaN(cv) || cv < 0) { UI.toast('Enter a valid contract value.', 'error'); return; }
        const rp = isNaN(rpRaw) ? 0.10 : rpRaw / 100;
        try {
            await DataService.updateProjectContract(this._currentProjectId, cv, rp);
            UI.toast('Contract settings saved.', 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('billings');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async generateBilling() {
        const pct = this._data ? this._data.totalProgress : 0;
        if (!pct || pct <= 0) { UI.toast('No accomplishment yet — progress is 0%.', 'error'); return; }
        if (!confirm(`Generate a progress billing up to ${pct}% accomplishment?`)) return;
        try {
            const res = await DataService.createBilling(this._currentProjectId, pct, '');
            UI.toast(`${res.billingNo} generated — for admin approval.`, 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('billings');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async approveBilling(id, force) {
        try {
            const res = force
                ? await DataService.forceApprove(id, 'Billing')
                : await DataService.approveItemGeneric(id, 'Billing');
            if (res && res.awaiting) {
                UI.toast('Your approval is recorded — awaiting the other admins.', 'success');
            } else {
                UI.toast('Billing approved — ready to collect.', 'success');
            }
            await this.open(this._currentProjectId, true);
            this.switchTab('billings');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async payBilling(id) {
        if (!confirm('Mark this billing as PAID? The net amount will be posted as Incoming Cash to this project.')) return;
        try {
            await DataService.markBillingPaid(id);
            UI.toast('Billing marked Paid — collection posted to revenue.', 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('billings');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }

});