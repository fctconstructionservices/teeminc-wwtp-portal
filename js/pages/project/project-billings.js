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

        // v6.3: contract-basis readiness (billing is server-gated too)
        const cr = p.contractReady || { ready: true, unapproved: [], zeroBudget: [] };
        const crMsg = [
            cr.unapproved.length ? `${cr.unapproved.length} estimate(s) not yet approved or empty (${cr.unapproved.slice(0, 5).join(', ')}${cr.unapproved.length > 5 ? '…' : ''})` : '',
            cr.zeroBudget.length ? `${cr.zeroBudget.length} SOW item(s) without budget (${cr.zeroBudget.slice(0, 5).join(', ')}${cr.zeroBudget.length > 5 ? '…' : ''})` : ''
        ].filter(Boolean).join(' · ');

        let html = `
            ${!cr.ready ? `<div style="background:#FBF1DE;border:1px solid var(--amber);border-left:3px solid var(--amber);border-radius:8px;padding:11px 14px;font-size:12.5px;color:var(--ink);margin-bottom:14px;"><b>${Icon.warning({size:12})} Billing locked — contract basis incomplete.</b> ${crMsg}. Approve all estimates and set every SOW budget to unlock billing.</div>` : ''}
            <div class="kpi-strip" style="margin-bottom:14px;">
                <div class="kpi-card"><div class="k-label">Contract Value (revised)</div><div class="k-val mono">₱${fmtMoney(revised)}</div><div class="k-sub">base ₱${fmtMoney(p.contractValue || 0)}${voSum ? ' + VOs ₱' + fmtMoney(voSum) : ''} · retention ${Math.round((p.retentionPct || 0.10) * 100)}%</div></div>
                <div class="kpi-card good"><div class="k-label">Billed to Date</div><div class="k-val mono">₱${fmtMoney(billedGross)}</div><div class="k-sub">${lastPct}% of contract billed</div></div>
                <div class="kpi-card good"><div class="k-label">Collected (net)</div><div class="k-val mono">₱${fmtMoney(collected)}</div><div class="k-sub">paid billings → project revenue</div></div>
                <div class="kpi-card warn"><div class="k-label">Retention Held</div><div class="k-val mono">₱${fmtMoney(retentionHeld)}</div><div class="k-sub">released on turnover</div></div>
            </div>`;

        // ── v10: DOWNPAYMENT LEDGER ──
        // A downpayment is an ADVANCE against the contract, not extra
        // income: it must be recouped from later billings or the client
        // ends up paying for the same work twice. This panel makes the
        // position explicit — advance, recouped so far, still outstanding.
        const dpPct = parseFloat(p.downpaymentPct) || 0;
        const dpBill = billings.find(b => b.billingType === 'Downpayment' && b.status !== 'Rejected');
        const dpAdvance = dpBill ? (parseFloat(dpBill.grossAmount) || 0) : 0;
        const dpRecouped = billings.filter(b => b.status !== 'Rejected')
            .reduce((s2, b) => s2 + (parseFloat(b.dpRecoupment) || 0), 0);
        const dpOutstanding = Math.max(0, dpAdvance - dpRecouped);

        if (dpPct > 0 || dpAdvance > 0) {
            const pctRecouped = dpAdvance ? Math.round(dpRecouped / dpAdvance * 100) : 0;
            html += `
            <div class="panel" style="margin-bottom:14px;">
                <div class="panel-head"><h3>Downpayment</h3>
                    <span class="cc-note">${Math.round(dpPct * 100)}% of contract &middot; recouped from every progress billing</span>
                </div>
                <div style="padding:12px 16px;">
                    ${!dpBill ? `
                        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                            <div style="font-size:12.5px;color:var(--ink-soft);flex:1;min-width:240px;">
                                No downpayment recorded yet. Recording it creates billing <b>DP-0001</b> for
                                <b>₱${fmtMoney(revised * dpPct)}</b> at 0% accomplishment, which then goes through
                                the normal approval and collection path.
                            </div>
                            ${isAdmin && cr.ready && this._canEdit !== false ? `<button class="btn-sm primary" onclick="ProjectPage.recordDownpayment()">Record downpayment</button>` : ''}
                        </div>` : `
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
                            <div><div class="k-label">Advance</div><div class="mono" style="font-size:15px;">₱${fmtMoney(dpAdvance)}</div>
                                <div class="k-sub">${dpBill.billingNo} &middot; <span class="stamp ${dpBill.status === 'Paid' ? 'approved' : dpBill.status === 'Approved' ? 'approved' : 'pending'}">${dpBill.status}</span></div></div>
                            <div><div class="k-label">Recouped to date</div><div class="mono" style="font-size:15px;color:var(--green);">₱${fmtMoney(dpRecouped)}</div>
                                <div class="k-sub">${pctRecouped}% of the advance</div></div>
                            <div><div class="k-label">Still outstanding</div><div class="mono" style="font-size:15px;color:${dpOutstanding > 0 ? 'var(--amber)' : 'var(--green)'};">₱${fmtMoney(dpOutstanding)}</div>
                                <div class="k-sub">${dpOutstanding > 0 ? 'deducted from future billings' : 'fully worked off'}</div></div>
                        </div>
                        <div style="margin-top:10px;height:7px;background:#E4E1D6;border-radius:4px;overflow:hidden;">
                            <div style="height:100%;width:${Math.min(100, pctRecouped)}%;background:var(--green);border-radius:4px;"></div>
                        </div>`}
                </div>
            </div>`;
        }

        // Super Admin: set contract value inline
        if (isSuper) {
            html += `
            <div class="panel" style="margin-bottom:14px;"><div class="panel-head"><h3>Contract Settings</h3><span class="cc-note">Super Admin only</span></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;padding:12px 16px;">
                    <div class="field" style="min-width:180px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Contract Value (₱)</label>
                        <input type="number" id="bil-contract-value" value="${p.contractValue || ''}" placeholder="e.g. 18500000" style="width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);" /></div>
                    <div class="field" style="min-width:120px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Retention %</label>
                        <input type="number" id="bil-retention-pct" value="${Math.round((p.retentionPct || 0.10) * 100)}" min="0" max="50" style="width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);" /></div>
                    <div class="field" style="min-width:120px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;" title="Advance paid at project start, recouped from every progress billing">Downpayment %</label>
                        <input type="number" id="bil-dp-pct" value="${Math.round((p.downpaymentPct || 0) * 100)}" min="0" max="60" style="width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);" /></div>
                    <button class="btn-sm primary" onclick="ProjectPage.saveContract()">Save</button>
                </div>
            </div>`;
        }

        html += `
            <div class="section-head"><h2>Billing Register</h2><div class="rule"></div>
                ${billings.length ? `<button class="btn-sm" onclick="ProjectPage.exportBillingsExcel()">${Icon.spreadsheet({size:12})} Export Excel</button>` : ''}
                ${isAdmin && cr.ready && this._canEdit !== false ? `<button class="btn-sm primary" onclick="ProjectPage.generateBilling()">+ Generate from Progress (${p.totalProgress || 0}%)</button>` : ''}
            </div>
            <div class="panel"><table><thead><tr>
                <th>Billing #</th><th>Period</th>
                <th style="text-align:right">% Range</th>
                <th style="text-align:right">Gross</th><th style="text-align:right">DP recoup</th><th style="text-align:right">Retention</th><th style="text-align:right">Net</th>
                <th>Status</th><th></th>
            </tr></thead><tbody>`;

        if (!billings.length) {
            html += `<tr><td colspan="9" style="text-align:center;color:var(--ink-soft);padding:24px">No billings yet. ${revised > 0 ? 'Generate the first one from progress.' : 'Set the Contract Value first.'}</td></tr>`;
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
                // v6.1: client evaluated a different % — revise while unpaid
                // (v6.3: also gated on contract readiness, like Generate)
                if ((b.status === 'Pending' || b.status === 'Approved') && isAdmin && cr.ready) {
                    actions += ` <button class="btn-sm" title="Client approved a different %" onclick="ProjectPage.reviseBillingPrompt('${b.id}', ${b.prevPct})">Revise %</button>`;
                }
                // v8 (6.9.2): Super Admin can delete a billing that has NOT
                // been approved yet (Pending only — approved/paid billings
                // are part of the financial record and stay).
                if (b.status === 'Pending' && isSuper) {
                    actions += ` <button class="btn-sm danger" title="Delete this unapproved billing" onclick="ProjectPage.deleteBillingPrompt('${b.id}', '${b.billingNo}')">${Icon.trash({size:12})}</button>`;
                }
                const isDP = b.billingType === 'Downpayment';
                const recoup = parseFloat(b.dpRecoupment) || 0;
                html += `<tr>
                    <td><span class="req-id" style="cursor:pointer;text-decoration:underline;" title="${isDP ? 'Downpayment — an advance against the contract' : 'View Statement of Work Accomplishment'}" onclick="ProjectPage.openSWA('${b.id}')">${b.billingNo}</span>
                        ${isDP ? '<div style="font-size:9.5px;color:var(--amber);font-family:\'IBM Plex Mono\',monospace;text-transform:uppercase;letter-spacing:.07em;">advance</div>' : ''}</td>
                    <td>${b.period || '—'}</td>
                    <td class="amt">${isDP ? '—' : b.prevPct + '% → ' + b.currentPct + '%'}</td>
                    <td class="amt">₱${fmtMoney(b.grossAmount || 0)}</td>
                    <td class="amt">${recoup ? '<span style="color:var(--amber)">−₱' + fmtMoney(recoup) + '</span>' : '—'}</td>
                    <td class="amt">${(parseFloat(b.retentionAmount) || 0) ? '₱' + fmtMoney(b.retentionAmount) : '—'}</td>
                    <td class="amt"><b>₱${fmtMoney(b.netAmount || 0)}</b></td>
                    <td><span class="stamp ${cls}">${b.status}</span></td>
                    <td>${actions}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>
            <div class="data-source-note">Billing = (current % − last billed %) × revised contract. Approval needs every admin's signature; Paid posts the net amount as Incoming Cash. Click a billing # to view its Statement of Work Accomplishment (SWA).</div>`;
        container.innerHTML = html;
    },

    /**
     * reviseBillingPrompt (v6.1) - The client's evaluation came back with
     * a different (usually lower) accomplishment than billed. Supersedes
     * the billing and regenerates it at the client-approved %, going
     * through the full multi-signature again.
     */
    async reviseBillingPrompt(id, prevPct) {
        const raw = prompt(`Client-approved accomplishment % (must be above the previous billed ${prevPct}%):`);
        if (raw === null) return;
        const pct = parseFloat(raw);
        if (isNaN(pct)) { UI.toast('Enter a valid %.', 'error'); return; }
        try {
            const res = await DataService.reviseBilling(id, pct);
            UI.toast(`Revised as ${res.billingNo} — for admin approval. The original is kept as superseded.`, 'success');
            await this.open(this._currentProjectId, true);   // v6.5: stays on this tab
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async saveContract() {
        const cv = parseFloat(document.getElementById('bil-contract-value')?.value);
        const rpRaw = parseFloat(document.getElementById('bil-retention-pct')?.value);
        const dpRaw = parseFloat(document.getElementById('bil-dp-pct')?.value);
        if (isNaN(cv) || cv < 0) { UI.toast('Enter a valid contract value.', 'error'); return; }
        const rp = isNaN(rpRaw) ? 0.10 : rpRaw / 100;
        try {
            await DataService.updateProjectContract(this._currentProjectId, cv, rp);
            // v10: the downpayment % is stored separately (Super Admin only)
            if (!isNaN(dpRaw)) {
                const dp = dpRaw / 100;
                if (dp < 0 || dp > 0.6) { UI.toast('Downpayment must be between 0% and 60%.', 'error'); return; }
                if (dp !== (parseFloat((this._data || {}).downpaymentPct) || 0)) {
                    await DataService.setDownpaymentPct(this._currentProjectId, dp);
                }
            }
            UI.toast('Contract settings saved.', 'success');
            await this.open(this._currentProjectId, true);   // v6.5: stays on this tab
            this.switchTab('billings');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * recordDownpayment (v10) - Creates the DP-0001 advance billing. It
     * follows the same approval path as a progress billing; marking it
     * paid posts a Client Collection so it counts toward Collected.
     */
    async recordDownpayment() {
        const p = this._data || {};
        const pct = parseFloat(p.downpaymentPct) || 0;
        if (pct <= 0) { UI.toast('Set the Downpayment % in Contract Settings first.', 'error'); return; }
        const ok = await Confirm.open('Record downpayment?',
            `This creates billing DP-0001 for ${Math.round(pct * 100)}% of the revised contract at 0% accomplishment. ` +
            `It needs the usual approvals, and the advance will be recouped from every progress billing afterwards.`);
        if (!ok) return;
        try {
            const res = await DataService.createDownpaymentBilling(this._currentProjectId);
            UI.toast(`${res.billingNo} recorded (₱${fmtMoney(res.net)}) — awaiting approval.`, 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('billings');
            if (typeof App.updateApprovalBadge === 'function') App.updateApprovalBadge();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async generateBilling() {
        const pct = this._data ? this._data.totalProgress : 0;
        if (!pct || pct <= 0) { UI.toast('No accomplishment yet — progress is 0%.', 'error'); return; }
        if (!confirm(`Generate a progress billing up to ${pct}% accomplishment?`)) return;
        try {
            const res = await DataService.createBilling(this._currentProjectId, pct, '');
            UI.toast(`${res.billingNo} generated — for admin approval.`, 'success');
            await this.open(this._currentProjectId, true);   // v6.5: stays on this tab
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
            await this.open(this._currentProjectId, true);   // v6.5: stays on this tab
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async payBilling(id) {
        if (!confirm('Mark this billing as PAID? The net amount will be posted as Incoming Cash to this project.')) return;
        try {
            await DataService.markBillingPaid(id);
            UI.toast('Billing marked Paid — collection posted to revenue.', 'success');
            await this.open(this._currentProjectId, true);   // v6.5: stays on this tab
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    // ════════════════ v6.1: STATEMENT OF WORK ACCOMPLISHMENT ════════════════

    /**
     * _progressAsOf - Per-SOW % complete as of a cutoff date, mirroring
     * the backend's computeSOWProgress_ (non-rejected reports, work rows
     * whose scope === the SOW id, latest report date wins) but only
     * counting reports dated on/before the cutoff. This reconstructs each
     * item's accomplishment at the time a billing was generated.
     */
    _progressAsOf(sowId, cutoff) {
        let bestDate = null, best = 0;
        (this._data.dailyRecords || []).forEach(d => {
            if (d.status === 'rejected') return;
            if (cutoff && String(d.date) > String(cutoff)) return;
            const rows = (d.workAccomplished || []).filter(w => String(w.scope) === String(sowId));
            if (!rows.length) return;
            const pct = rows.reduce((mx, w) => Math.max(mx, parseFloat(w.percentComplete) || 0), 0);
            const dt = new Date(d.date);
            if (bestDate === null || dt > bestDate || (dt.getTime() === bestDate.getTime() && pct > best)) {
                bestDate = dt; best = pct;
            }
        });
        return Math.min(100, Math.max(0, best));
    },

    openSWA(billingId) {
        const p = this._data;
        const b = (p.billings || []).find(x => x.id === billingId);
        if (!b) return;

        // cutoffs: this billing's date, and the latest earlier non-rejected billing's date
        const thisCut = b.createdAt || null;
        const prevBilling = (p.billings || [])
            .filter(x => x.status !== 'Rejected' && x.id !== b.id && String(x.createdAt) < String(b.createdAt))
            .sort((a, c) => String(c.createdAt).localeCompare(String(a.createdAt)))[0] || null;
        const prevCut = prevBilling ? prevBilling.createdAt : null;

        // v6.2 (option B): SWA amounts = the CONTRACT BASIS per item —
        // its APPROVED estimate total plus client-approved VOs. Matches
        // the Gantt weighting and what the client is billed against;
        // the working budget stays internal.
        const items = (p.sowItems || []).filter(s => !s.isMilestone);
        const amtOf = x => ((x.estimateTotal || 0) + (x.voAdjustment || 0)) || (x.estimateTotal !== undefined ? 0 : (x.budget || 0));
        const totalAmt = items.reduce((s, x) => s + amtOf(x), 0) || 1;

        let sumAmt = 0, sumWt = 0, sumPrevWt = 0, sumPrevAmt = 0, sumThisWt = 0, sumThisAmt = 0, sumToWt = 0, sumToAmt = 0;
        let rowsHtml = '';
        items.forEach(s => {
            const amt = amtOf(s);
            const wt = amt / totalAmt * 100;
            const prevPct = prevCut ? this._progressAsOf(s.id, prevCut) : 0;
            const curPct = this._progressAsOf(s.id, thisCut);
            const thisPct = Math.max(curPct - prevPct, 0);
            const thisWt = thisPct * wt / 100;
            const prevAmt = prevPct / 100 * amt;
            const thisAmt = thisPct / 100 * amt;
            const toAmt = prevAmt + thisAmt;
            sumAmt += amt; sumWt += wt;
            sumPrevWt += prevPct * wt / 100; sumPrevAmt += prevAmt;
            sumThisWt += thisWt; sumThisAmt += thisAmt;
            sumToWt += curPct * wt / 100; sumToAmt += toAmt;
            rowsHtml += `<tr>
                <td class="mono">${s.id}</td>
                <td style="text-align:left">${s.description || '—'}</td>
                <td>1</td><td>lot</td>
                <td class="amt">₱${fmtMoney(amt)}</td>
                <td>${wt.toFixed(2)}%</td>
                <td>${prevPct.toFixed(1)}%</td><td class="amt">₱${fmtMoney(prevAmt)}</td>
                <td>${thisPct.toFixed(1)}%</td><td>${thisWt.toFixed(2)}%</td><td class="amt">₱${fmtMoney(thisAmt)}</td>
                <td>${curPct.toFixed(1)}%</td><td class="amt">₱${fmtMoney(toAmt)}</td>
            </tr>`;
        });

        // VAT-Ex = total estimates − total VAT indirect items
        let vatTotal = 0;
        (((p.estimates || {}).groups) || []).forEach(g => {
            (g.indirect || []).forEach(i => { if (i.type === 'VAT') vatTotal += parseFloat(i.amount) || 0; });
        });
        const vatEx = totalAmt - vatTotal;
        const accomplishedPct = (b.currentPct || 0) - (b.prevPct || 0);
        const net = b.netAmount || 0;
        const vat12 = net * 0.12;
        const totalWithVat = net + vat12;

        const overlay = document.createElement('div');
        overlay.id = 'swaModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px;';
        overlay.innerHTML = `
        <style>
            #swaModal .swa-sheet{background:#fff;color:#1C2321;max-width:1120px;width:100%;border-radius:10px;padding:26px 30px;font-family:'Inter',sans-serif;}
            #swaModal .swa-tbl{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:12px;}
            #swaModal .swa-tbl th,#swaModal .swa-tbl td{border:1px solid #9aa4a0;padding:4px 6px;text-align:center;}
            #swaModal .swa-tbl th{background:#E8EFF1;font-family:'Oswald';font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;}
            #swaModal .swa-tbl td.amt{text-align:right;font-family:'IBM Plex Mono';white-space:nowrap;}
            #swaModal .swa-tbl td.mono{font-family:'IBM Plex Mono';}
            #swaModal .swa-tbl tfoot td{font-weight:700;background:#FafaF7;}
            #swaModal .swa-sum{margin-top:14px;font-size:12px;max-width:430px;margin-left:auto;}
            #swaModal .swa-sum .r{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dotted #D6D2C4;}
            #swaModal .swa-sum .r b{font-family:'IBM Plex Mono';}
            #swaModal .swa-sign{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:38px;font-size:11.5px;}
            #swaModal .swa-sign .s{text-align:center;}
            #swaModal .swa-sign .line{border-top:1px solid #1C2321;margin-top:34px;padding-top:4px;}
            @media print {
                @page { size: A4 landscape; margin: 10mm; }
                body * { visibility: hidden !important; }
                #swaModal, #swaModal * { visibility: visible !important; }
                #swaModal { position: absolute !important; inset: 0 !important; padding: 0 !important; background: #fff !important; overflow: visible !important; }
                #swaModal .swa-sheet { border-radius: 0; max-width: none; padding: 0; }
                #swaModal .swa-noprint { display: none !important; }
            }
        </style>
        <div class="swa-sheet">
            <!-- v11 BATCH E: company letterhead. Injected as markup rather
                 than through PrintDoc.print(), because this overlay has its
                 own A4-landscape print rules and its own signature row —
                 so signatures are suppressed to avoid a duplicate. -->
            <div id="swaLetterhead"></div>
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:12px;">
                <div>
                    <div><b>Project:</b> ${p.name || ''}</div>
                    <div><b>Location:</b> ${p.location || '—'}</div>
                    <div><b>Owner / Client:</b> ${p.clientName || '—'}</div>
                </div>
                <div style="text-align:right;">
                    <div><b>Subject:</b> ${b.billingNo}</div>
                    <div><b>Period:</b> ${b.period || '—'}</div>
                    <div><b>Date:</b> ${b.createdAt || '—'}</div>
                </div>
            </div>
            <h2 style="text-align:center;font-family:'Oswald';text-transform:uppercase;letter-spacing:.06em;font-size:16px;margin:14px 0 2px;">Statement of Work Accomplishment (SWA)</h2>
            <table class="swa-tbl">
                <thead>
                    <tr>
                        <th rowspan="2">Item</th><th rowspan="2" style="min-width:180px;">Activity Description</th>
                        <th rowspan="2">Qty</th><th rowspan="2">Unit</th><th rowspan="2">Amount</th><th rowspan="2">%WT</th>
                        <th colspan="2">Previous</th><th colspan="3">This Period</th><th colspan="2">To-Date</th>
                    </tr>
                    <tr>
                        <th>%</th><th>Amount</th>
                        <th>%</th><th>%WT</th><th>Amount</th>
                        <th>%</th><th>Amount</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml || '<tr><td colspan="13">No SOW items.</td></tr>'}</tbody>
                <tfoot><tr>
                    <td colspan="4" style="text-align:right;">TOTAL COST</td>
                    <td class="amt">₱${fmtMoney(sumAmt)}</td>
                    <td>${sumWt.toFixed(1)}%</td>
                    <td>${sumPrevWt.toFixed(2)}%</td><td class="amt">₱${fmtMoney(sumPrevAmt)}</td>
                    <td></td><td>${sumThisWt.toFixed(2)}%</td><td class="amt">₱${fmtMoney(sumThisAmt)}</td>
                    <td>${sumToWt.toFixed(2)}%</td><td class="amt">₱${fmtMoney(sumToAmt)}</td>
                </tr></tfoot>
            </table>
            <div class="swa-sum">
                <div class="r"><span>Contract Amount</span><b>₱${fmtMoney(p.contractValueRevised || 0)}</b></div>
                <div class="r"><span>VAT-Ex Amount (estimates less VAT)</span><b>₱${fmtMoney(vatEx)}</b></div>
                <div class="r"><span>Accomplished this period</span><b>${accomplishedPct.toFixed(2)}%</b></div>
                <div class="r"><span>Amount equivalent to Accomplishment</span><b>₱${fmtMoney(b.grossAmount || 0)}</b></div>
                <div class="r"><span>Less: Retention (${Math.round((p.retentionPct || 0.10) * 100)}%)</span><b>₱${fmtMoney(b.retentionAmount || 0)}</b></div>
                <div class="r"><span>Amount Due for this Billing</span><b>₱${fmtMoney(net)}</b></div>
                <div class="r"><span>VAT (12%)</span><b>₱${fmtMoney(vat12)}</b></div>
                <div class="r" style="border-bottom:2px solid #1C2321;"><span><b>Total Amount with VAT</b></span><b>₱${fmtMoney(totalWithVat)}</b></div>
            </div>
            <div class="swa-sign">
                <div class="s"><div class="line">Prepared by</div></div>
                <div class="s"><div class="line">Reviewed by</div></div>
                <div class="s"><div class="line">Noted by</div></div>
            </div>
            <div class="swa-noprint" style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                <button class="btn-primary" onclick="ProjectPage.printSWA()">Print (A4 Landscape)</button>
                <button class="btn-ghost" onclick="ProjectPage.closeSWA()">Close</button>
            </div>
        </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) this.closeSWA(); });
        // fill the letterhead once the template is available; the sheet
        // renders immediately either way, so a slow fetch never blocks it
        PrintDoc.load().then(() => {
            const slot = document.getElementById('swaLetterhead');
            if (slot) slot.innerHTML = PrintDoc.watermarkHTML() + PrintDoc.letterheadHTML({
                title: 'Statement of Work Accomplishment',
                meta: `${b.billingNo || ''} · ${b.period || ''}`
            });
        });
        document.body.appendChild(overlay);
    },

    closeSWA() {
        const el = document.getElementById('swaModal');
        if (el) el.remove();
    },

    /**
     * printSWA (v11 BATCH E) - Ensures the letterhead is present before
     * printing. The sheet renders as soon as the modal opens and fills
     * its letterhead asynchronously, so hitting Print within the first
     * moment could otherwise produce a page with an empty header.
     */
    async printSWA() {
        await PrintDoc.load();
        const slot = document.getElementById('swaLetterhead');
        if (slot && !slot.innerHTML.trim()) {
            slot.innerHTML = PrintDoc.watermarkHTML() + PrintDoc.letterheadHTML({
                title: 'Statement of Work Accomplishment'
            });
        }
        window.print();
    }

});
// ════════ v8: BILLING EXPORT + DELETE (item 6.9.2) ════════

Object.assign(ProjectPage, {

    /**
     * _swaData (v9) - The full SWA computation for one billing, shared
     * by the SWA modal math and the detailed Excel export. Per SOW:
     * contract-basis amount, weight, previous / this-billing / to-date
     * % and amounts — same rules as openSWA.
     */
    _swaData(b) {
        const p = this._data;
        const thisCut = b.createdAt || null;
        const prevBilling = (p.billings || [])
            .filter(x => x.status !== 'Rejected' && x.id !== b.id && String(x.createdAt) < String(b.createdAt))
            .sort((a, c) => String(c.createdAt).localeCompare(String(a.createdAt)))[0] || null;
        const prevCut = prevBilling ? prevBilling.createdAt : null;
        const items = (p.sowItems || []).filter(s => !s.isMilestone);
        const amtOf = x => ((x.estimateTotal || 0) + (x.voAdjustment || 0)) || (x.estimateTotal !== undefined ? 0 : (x.budget || 0));
        const totalAmt = items.reduce((s, x) => s + amtOf(x), 0) || 1;
        const rows = items.map(sw => {
            const amt = amtOf(sw);
            const wt = amt / totalAmt * 100;
            const prevPct = prevCut ? this._progressAsOf(sw.id, prevCut) : 0;
            const curPct = this._progressAsOf(sw.id, thisCut);
            const thisPct = Math.max(curPct - prevPct, 0);
            const prevAmt = prevPct / 100 * amt;
            const thisAmt = thisPct / 100 * amt;
            return {
                id: sw.id, description: sw.description || '',
                amount: amt, weight: wt,
                prevPct, prevAmt, thisPct, thisWt: thisPct * wt / 100, thisAmt,
                toPct: curPct, toAmt: prevAmt + thisAmt
            };
        });
        return { rows, totalAmt };
    },

    /**
     * exportBillingsExcel (v9 — item 1) - DETAILED billing export: one
     * worksheet PER BILLING containing its full SWA table (Item No,
     * Description, Amount, Wt%, Previous, This Billing, To Date) plus
     * the gross/retention/net summary — not the register summary.
     */
    exportBillingsExcel() {
        if (typeof XLSX === 'undefined') { UI.toast('Excel library not loaded — refresh the page and try again.', 'error'); return; }
        const p = this._data || {};
        const billings = (p.billings || []).filter(b => b.status !== 'Rejected');
        if (!billings.length) { UI.toast('No billings to export.', 'error'); return; }
        const wb = XLSX.utils.book_new();
        const r2 = v => Math.round((v || 0) * 100) / 100;

        billings.forEach(b => {
            const d = this._swaData(b);
            const aoa = [
                ['STATEMENT OF WORK ACCOMPLISHMENT — ' + (b.billingNo || b.id)],
                [p.name || this._currentProjectId, p.client || ''],
                ['Period', b.period || '', 'Status', b.status || ''],
                ['Billed %', (b.prevPct || 0) + '% → ' + (b.currentPct || 0) + '%'],
                [],
                ['Item No', 'Description', 'Qty', 'Unit', 'Contract Amount', 'Wt %',
                 'Previous %', 'Previous Amount',
                 'This Billing %', 'This Billing Wt %', 'This Billing Amount',
                 'To Date %', 'To Date Amount']
            ];
            let tAmt = 0, tPrev = 0, tThis = 0, tTo = 0, tWt = 0, tThisWt = 0;
            d.rows.forEach(r => {
                tAmt += r.amount; tPrev += r.prevAmt; tThis += r.thisAmt; tTo += r.toAmt;
                tWt += r.weight; tThisWt += r.thisWt;
                aoa.push([r.id, r.description, 1, 'lot', r2(r.amount), r2(r.weight),
                    r2(r.prevPct), r2(r.prevAmt),
                    r2(r.thisPct), r2(r.thisWt), r2(r.thisAmt),
                    r2(r.toPct), r2(r.toAmt)]);
            });
            aoa.push(['', 'TOTAL', '', '', r2(tAmt), r2(tWt), '', r2(tPrev), '', r2(tThisWt), r2(tThis), '', r2(tTo)]);
            aoa.push([]);
            aoa.push(['', 'Gross Amount', r2(b.grossAmount)]);
            aoa.push(['', 'Less: Retention', r2(b.retentionAmount)]);
            aoa.push(['', 'NET AMOUNT DUE', r2(b.netAmount)]);
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 9 }, { wch: 40 }, { wch: 5 }, { wch: 6 }, { wch: 16 }, { wch: 8 },
                { wch: 11 }, { wch: 16 }, { wch: 13 }, { wch: 14 }, { wch: 17 }, { wch: 10 }, { wch: 16 }];
            const safe = String(b.billingNo || b.id).replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 28);
            XLSX.utils.book_append_sheet(wb, ws, safe);
        });
        XLSX.writeFile(wb, `Billings-Detailed-${(p.name || this._currentProjectId).replace(/[^\w-]+/g, '_')}.xlsx`);
    },

    /** deleteBillingPrompt - Super Admin only, Pending only (server
     *  re-checks both). Approved/Paid billings can never be deleted. */
    async deleteBillingPrompt(id, billingNo) {
        const ok = await Confirm.open(`Delete ${billingNo}?`,
            'This billing has not been approved, so it can still be removed. The billed-% baseline reverts to the previous billing. This cannot be undone.');
        if (!ok) return;
        try {
            await DataService.deleteBilling(id);
            UI.toast(`${billingNo} deleted.`, 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('billings');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
});
