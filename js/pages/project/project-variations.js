// ================================================================
//  project-variations.js — Variation Orders tab (v6)
//  ---------------------------------------------------------------
//  Every VO is tied to a SOW item. When an admin records the client's
//  approval, the backend computes (never overwrites): the affected
//  SOW's working budget gains the VO amount, and the revised contract
//  value (base + approved VOs) is what Billings bills against.
//  Deductive (negative) VOs are supported.
//  Augments ProjectPage via Object.assign.
// ================================================================

Object.assign(ProjectPage, {

    renderVariations(p) {
        const container = document.getElementById('proj-tab-variations');
        if (!container) return;
        const user = App.getUser();
        const isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');
        const vos = p.variationOrders || [];

        const approved = vos.filter(v => v.status === 'Client-Approved');
        const pending = vos.filter(v => v.status === 'For Client');
        const approvedSum = approved.reduce((s, v) => s + (parseFloat(v.amount) || 0), 0);
        const pendingSum = pending.reduce((s, v) => s + (parseFloat(v.amount) || 0), 0);

        const sowOpts = (p.sowItems || []).map(s =>
            `<option value="${s.id}">${s.id} — ${(s.description || '').slice(0, 40)}</option>`).join('');

        // v6.3: a VO modifies the contract — the base contract must be
        // fully defined first (server-gated too).
        const cr = p.contractReady || { ready: true, unapproved: [], zeroBudget: [] };
        const crMsg = [
            cr.unapproved.length ? `${cr.unapproved.length} estimate(s) not yet approved or empty (${cr.unapproved.slice(0, 5).join(', ')}${cr.unapproved.length > 5 ? '…' : ''})` : '',
            cr.zeroBudget.length ? `${cr.zeroBudget.length} SOW item(s) without budget (${cr.zeroBudget.slice(0, 5).join(', ')}${cr.zeroBudget.length > 5 ? '…' : ''})` : ''
        ].filter(Boolean).join(' · ');

        let html = `
            ${!cr.ready ? `<div style="background:#FBF1DE;border:1px solid var(--amber);border-left:3px solid var(--amber);border-radius:8px;padding:11px 14px;font-size:12.5px;color:var(--ink);margin-bottom:14px;"><b>⚠ Variation orders locked — contract basis incomplete.</b> ${crMsg}. Approve all estimates and set every SOW budget first.</div>` : ''}
            <div class="kpi-strip" style="margin-bottom:14px;">
                <div class="kpi-card"><div class="k-label">Original Contract</div><div class="k-val mono">₱${fmtMoney(p.contractValue || 0)}</div><div class="k-sub">set in the Billings tab</div></div>
                <div class="kpi-card warn"><div class="k-label">Approved VOs</div><div class="k-val mono">${approvedSum >= 0 ? '+' : ''}₱${fmtMoney(approvedSum)}</div><div class="k-sub">${approved.length} client-approved</div></div>
                <div class="kpi-card"><div class="k-label">Pending VOs</div><div class="k-val mono">${pendingSum >= 0 ? '+' : ''}₱${fmtMoney(pendingSum)}</div><div class="k-sub">${pending.length} awaiting client</div></div>
                <div class="kpi-card good"><div class="k-label">Revised Contract</div><div class="k-val mono">₱${fmtMoney(p.contractValueRevised || 0)}</div><div class="k-sub">feeds the Billings tab</div></div>
            </div>

            <div class="panel" style="margin-bottom:14px;"><div class="panel-head"><h3>New Variation Order</h3><span class="cc-note">negative amount = deductive</span></div>
                <div style="display:grid;grid-template-columns:1fr 2fr 1fr auto;gap:10px;align-items:end;padding:12px 16px;">
                    <div><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Affected SOW</label>
                        <select id="vo-sow" style="width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);"><option value="">Select...</option>${sowOpts}</select></div>
                    <div><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Description</label>
                        <input type="text" id="vo-desc" placeholder="e.g. Additional loading bay ramp" style="width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);" /></div>
                    <div><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Amount (₱)</label>
                        <input type="number" id="vo-amount" placeholder="520000" style="width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);" /></div>
                    ${cr.ready ? `<button class="btn-sm primary" onclick="ProjectPage.submitVO()">Submit for Client</button>` : `<span style="font-size:11px;color:var(--amber);align-self:center;">Locked — complete the contract basis first</span>`}
                </div>
            </div>

            <div class="section-head"><h2>Variation Order Log</h2><div class="rule"></div><span class="cc-note">For Client → Client-Approved / Rejected</span></div>
            <div class="panel"><table><thead><tr>
                <th>VO #</th><th>Description</th><th>Affected SOW</th>
                <th style="text-align:right">Amount</th><th>Status</th><th>Effect</th><th></th>
            </tr></thead><tbody>`;

        if (!vos.length) {
            html += `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:24px">No variation orders yet.</td></tr>`;
        } else {
            vos.forEach(v => {
                const amt = parseFloat(v.amount) || 0;
                const cls = v.status === 'Client-Approved' ? 'approved' : v.status === 'For Client' ? 'pending' : 'rejected';
                let actions = '';
                if (v.status === 'For Client' && isAdmin) {
                    actions = `<button class="btn-sm success" onclick="ProjectPage.decideVO('${v.id}', true)">Client Approved</button>
                               <button class="btn-sm danger" onclick="ProjectPage.decideVO('${v.id}', false)">Rejected</button>`;
                }
                const effect = v.status === 'Client-Approved'
                    ? `SOW ${amt >= 0 ? '+' : ''}₱${fmtMoney(amt)} · contract ${amt >= 0 ? '↑' : '↓'}`
                    : '—';
                html += `<tr>
                    <td><span class="req-id">${v.id}</span></td>
                    <td>${v.description || '—'}</td>
                    <td class="mono" style="font-size:11.5px">${v.sowId}</td>
                    <td class="amt">${amt >= 0 ? '+' : '−'}₱${fmtMoney(Math.abs(amt))}</td>
                    <td><span class="stamp ${cls}">${v.status}</span></td>
                    <td style="font-size:11px;color:var(--ink-soft)">${effect}</td>
                    <td>${actions}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>
            <div class="data-source-note">Client-Approved VOs raise the affected SOW's working budget and the revised contract value automatically — nothing is double-encoded.</div>`;
        container.innerHTML = html;
    },

    async submitVO() {
        const sowId = document.getElementById('vo-sow')?.value;
        const description = document.getElementById('vo-desc')?.value?.trim();
        const amount = parseFloat(document.getElementById('vo-amount')?.value);
        if (!sowId) { UI.toast('Select the affected SOW item.', 'error'); return; }
        if (!description) { UI.toast('Enter a description.', 'error'); return; }
        if (isNaN(amount) || amount === 0) { UI.toast('Enter the VO amount (negative for deductive).', 'error'); return; }
        try {
            const res = await DataService.requestVariationOrder(this._currentProjectId, { sowId, description, amount });
            UI.toast(`${res.id} submitted — awaiting the client's decision.`, 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('variations');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async decideVO(id, approved) {
        const verb = approved ? 'CLIENT-APPROVED' : 'REJECTED';
        if (!confirm(`Record this variation order as ${verb}?`)) return;
        try {
            if (approved) await DataService.approveVariationOrder(id);
            else await DataService.rejectVariationOrder(id);
            UI.toast(`Variation order ${verb.toLowerCase()}.`, 'success');
            await this.open(this._currentProjectId, true);
            this.switchTab('variations');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }

});