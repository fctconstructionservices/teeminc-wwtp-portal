// ================================================================
//  project-materials.js — Site Materials tab (v6)
//  ---------------------------------------------------------------
//  Delivered − Used = Remaining per material, computed by the backend
//  (getProjectData.siteMaterials) from every non-rejected daily
//  report. No separate inventory encoding — the daily report itself
//  is the source of truth. Low stock ≤ 20% of delivered; Out = 0.
//  Augments ProjectPage via Object.assign (one object at runtime).
// ================================================================

Object.assign(ProjectPage, {

    renderSiteMaterials(p) {
        const container = document.getElementById('proj-tab-materials');
        if (!container) return;
        const rows = p.siteMaterials || [];

        const low = rows.filter(m => m.remaining > 0 && m.delivered > 0 && (m.remaining / m.delivered) <= 0.2);
        const out = rows.filter(m => m.remaining <= 0);
        const healthy = rows.length - low.length - out.length;

        let html = `
            <div class="kpi-strip" style="margin-bottom:14px;">
                <div class="kpi-card"><div class="k-label">Materials Tracked</div><div class="k-val">${rows.length}</div><div class="k-sub">distinct items delivered</div></div>
                <div class="kpi-card good"><div class="k-label">Healthy Stock</div><div class="k-val">${healthy}</div><div class="k-sub">remaining &gt; 20% of delivered</div></div>
                <div class="kpi-card warn"><div class="k-label">Low Stock</div><div class="k-val">${low.length}</div><div class="k-sub">remaining ≤ 20%</div></div>
                <div class="kpi-card bad"><div class="k-label">Out of Stock</div><div class="k-val">${out.length}</div><div class="k-sub">remaining = 0</div></div>
            </div>
            <div class="section-head"><h2>Material Balance</h2><div class="rule"></div>
                <input id="siteMatSearch" placeholder="Search material..." oninput="ProjectPage.filterSiteMaterials(this.value)"
                    style="border:1px solid var(--line);border-radius:6px;padding:5px 10px;font-size:11px;background:var(--surface);color:var(--ink);" />
                ${this._canEdit !== false ? `<button class="btn-sm primary" onclick="ProjectPage.openTransferModal()">⇄ New Transfer</button>` : ''}
            </div>
            <div class="panel"><table><thead><tr>
                <th>Material</th><th>Unit</th>
                <th style="text-align:right">Delivered</th>
                <th style="text-align:right" title="Completed transfers into this site">In</th>
                <th style="text-align:right">Used</th>
                <th style="text-align:right" title="Completed transfers out of this site">Out</th>
                <th style="text-align:right">Remaining</th>
                <th style="min-width:110px">Usage</th><th>Status</th><th>Last Movement</th>
            </tr></thead><tbody id="siteMatBody">`;

        if (!rows.length) {
            html += `<tr><td colspan="10" style="text-align:center;color:var(--ink-soft);padding:24px">No materials delivered yet. Log deliveries in the Daily Site Record.</td></tr>`;
        } else {
            rows.forEach(m => {
                const usedPct = m.delivered > 0 ? Math.min(Math.round((m.used / m.delivered) * 100), 100) : 0;
                const state = m.remaining <= 0 ? 'out' : (m.delivered > 0 && (m.remaining / m.delivered) <= 0.2) ? 'low' : 'ok';
                const stampCls = state === 'out' ? 'rejected' : state === 'low' ? 'pending' : 'approved';
                const stampTxt = state === 'out' ? 'Out' : state === 'low' ? 'Low' : 'OK';
                const barColor = state === 'out' ? 'var(--red)' : state === 'low' ? 'var(--amber)' : 'var(--green)';
                html += `<tr data-mat="${String(m.material).toLowerCase()}">
                    <td>${m.material}</td><td class="mono" style="font-size:11.5px">${m.unit || '—'}</td>
                    <td class="amt">${fmtNum(m.delivered)}</td>
                    <td class="amt" style="color:${(m.transferredIn || 0) > 0 ? 'var(--green)' : 'var(--ink-soft)'}">${(m.transferredIn || 0) > 0 ? '+' + fmtNum(m.transferredIn) : '—'}</td>
                    <td class="amt">${fmtNum(m.used)}</td>
                    <td class="amt" style="color:${(m.transferredOut || 0) > 0 ? 'var(--red)' : 'var(--ink-soft)'}">${(m.transferredOut || 0) > 0 ? '−' + fmtNum(m.transferredOut) : '—'}</td>
                    <td class="amt"><b>${fmtNum(m.remaining)}</b></td>
                    <td><div style="height:8px;background:var(--bg);border-radius:20px;overflow:hidden;min-width:80px;"><div style="height:100%;border-radius:20px;width:${usedPct}%;background:${barColor};"></div></div></td>
                    <td><span class="stamp ${stampCls}">${stampTxt}</span></td>
                    <td class="mono" style="font-size:11px;color:var(--ink-soft)">${m.lastMovement || '—'}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>
            <div class="data-source-note">Balance = Delivered + Transfers In − Used − Transfers Out. Deliveries and usage come from the Daily Site Records; transfers from the log below.</div>`;

        // ── v6.9: transfer log for this project ──
        const trs = p.transfers || [];
        html += `
            <div class="section-head"><h2>Transfers</h2><div class="rule"></div><span class="cc-note">into and out of this site</span></div>
            <div class="panel"><table><thead><tr>
                <th>Ref</th><th>Date</th><th>Direksyon</th><th>Item</th>
                <th style="text-align:right">Qty</th><th>Reason</th><th>Status</th><th></th>
            </tr></thead><tbody>`;
        if (!trs.length) {
            html += `<tr><td colspan="8" style="text-align:center;color:var(--ink-soft);padding:20px">No transfers recorded for this project.</td></tr>`;
        } else {
            const user = App.getUser();
            const isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');
            trs.forEach(tr => {
                const cls = tr.status === 'Completed' ? 'approved' : tr.status === 'Pending' ? 'pending' : 'rejected';
                const arrow = tr.direction === 'in'
                    ? `<span class="mono" style="font-size:11px">${tr.fromLabel}</span> <span style="color:var(--safety);font-weight:700">→</span> <b>here</b>`
                    : `<b>here</b> <span style="color:var(--safety);font-weight:700">→</span> <span class="mono" style="font-size:11px">${tr.toLabel}</span>`;
                const actions = (tr.status === 'Pending' && isAdmin)
                    ? `<button class="btn-sm success" onclick="ProjectPage.decideTransfer('${tr.id}', true)">Approve</button>
                       <button class="btn-sm danger" onclick="ProjectPage.decideTransfer('${tr.id}', false)">Reject</button>`
                    : '';
                html += `<tr>
                    <td><span class="req-id">${tr.id}</span></td>
                    <td class="mono" style="font-size:11.5px">${tr.transferDate}</td>
                    <td style="font-size:11.5px">${arrow}</td>
                    <td>${tr.item}<div class="mono" style="font-size:10px;color:var(--ink-soft)">${tr.itemType}</div></td>
                    <td class="amt">${fmtNum(tr.qty)} ${tr.unit || ''}</td>
                    <td style="font-size:11.5px;color:var(--ink-soft)">${tr.reason || '—'}</td>
                    <td><span class="stamp ${cls}">${tr.status}</span></td>
                    <td>${actions}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>
            <div class="data-source-note">Transfers move stock between locations (a project or the Warehouse). On approval the source is decremented and the destination incremented in the same action, so the two sides can never fall out of step. Cost does not transfer - it stays with the project that purchased the item.</div>`;

        container.innerHTML = html;
    },


    // ════════ v6.9: TRANSFERS ════════

    /**
     * openTransferModal - Source defaults to this project. Item list is
     * fetched per source+type so you can only move what actually exists
     * there; qty is capped at the live available amount (the server
     * re-checks on approval, since stock can move in between).
     */
    async openTransferModal() {
        const overlay = document.createElement('div');
        overlay.id = 'transferModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;max-width:470px;width:100%;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:13px 18px;border-bottom:1px solid var(--line);background:var(--blueprint-tint);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">New Transfer</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('transferModal').remove()">✕</span>
                </div>
                <div style="padding:14px 18px;overflow:auto;" id="trfBody">
                    <div style="color:var(--ink-soft);font-size:12px;">Loading locations…</div>
                </div>
                <div style="padding:12px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn-ghost" onclick="document.getElementById('transferModal').remove()">Cancel</button>
                    <button class="btn-primary" onclick="ProjectPage.submitTransfer()">Submit for Approval</button>
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);

        try {
            const opts = await DataService.getTransferOptions(this._currentProjectId, 'Material');
            this._trfLocations = opts.locations || [];
            const body = document.getElementById('trfBody');
            if (!body) return;
            const locOpts = (sel) => this._trfLocations.map(l =>
                `<option value="${l.id}" ${l.id === sel ? 'selected' : ''}>${l.isWarehouse ? '🏭 ' : '🏗 '}${l.label}</option>`).join('');
            body.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div style="margin-bottom:11px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">From</label>
                        <select id="trf-from" onchange="ProjectPage.reloadTransferItems()" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:12px;background:var(--surface);color:var(--ink);">${locOpts(this._currentProjectId)}</select></div>
                    <div style="margin-bottom:11px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">To</label>
                        <select id="trf-to" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:12px;background:var(--surface);color:var(--ink);">${locOpts('WAREHOUSE')}</select></div>
                </div>
                <div style="margin-bottom:11px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Type</label>
                    <select id="trf-type" onchange="ProjectPage.reloadTransferItems()" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:12px;background:var(--surface);color:var(--ink);">
                        <option value="Material">Material</option><option value="Equipment">Equipment</option></select></div>
                <div style="margin-bottom:11px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Item (only items available at the source)</label>
                    <select id="trf-item" onchange="ProjectPage.syncTransferMax()" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:12px;background:var(--surface);color:var(--ink);">${this._transferItemOptions(opts.items)}</select></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div style="margin-bottom:11px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Qty</label>
                        <input type="number" id="trf-qty" min="0" step="any" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:12px;background:var(--surface);color:var(--ink);" />
                        <div id="trf-max" style="font-size:10px;color:var(--ink-soft);margin-top:3px;"></div></div>
                    <div style="margin-bottom:11px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Date</label>
                        <input type="date" id="trf-date" value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:12px;background:var(--surface);color:var(--ink);" /></div>
                </div>
                <div style="margin-bottom:4px;"><label style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:3px;">Reason</label>
                    <input type="text" id="trf-reason" placeholder="e.g. Surplus stock needed at another site" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:12px;background:var(--surface);color:var(--ink);" /></div>`;
            this.syncTransferMax();
        } catch (err) {
            const body = document.getElementById('trfBody');
            if (body) body.innerHTML = `<div style="color:var(--red);font-size:12px;">${err.message}</div>`;
        }
    },

    _transferItemOptions(items) {
        if (!items || !items.length) return '<option value="">- No items available at this location -</option>';
        return items.map(i =>
            `<option value="${String(i.item).replace(/"/g, '&quot;')}" data-max="${i.qty}" data-unit="${i.unit || ''}">${i.item} — available: ${fmtNum(i.qty)} ${i.unit || ''}</option>`
        ).join('');
    },

    async reloadTransferItems() {
        const from = document.getElementById('trf-from')?.value;
        const type = document.getElementById('trf-type')?.value || 'Material';
        const sel = document.getElementById('trf-item');
        if (!from || !sel) return;
        sel.innerHTML = '<option value="">Loading…</option>';
        try {
            const opts = await DataService.getTransferOptions(from, type);
            sel.innerHTML = this._transferItemOptions(opts.items);
            this.syncTransferMax();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    syncTransferMax() {
        const sel = document.getElementById('trf-item');
        const qty = document.getElementById('trf-qty');
        const note = document.getElementById('trf-max');
        if (!sel || !qty) return;
        const opt = sel.selectedOptions[0];
        const max = opt ? parseFloat(opt.dataset.max) : NaN;
        if (!isNaN(max)) {
            qty.max = max;
            if (note) note.textContent = `Max ${fmtNum(max)} ${opt.dataset.unit || ''} - cannot be exceeded`;
        } else if (note) note.textContent = '';
    },

    async submitTransfer() {
        const data = {
            fromLoc: document.getElementById('trf-from')?.value,
            toLoc: document.getElementById('trf-to')?.value,
            itemType: document.getElementById('trf-type')?.value,
            item: document.getElementById('trf-item')?.value,
            qty: parseFloat(document.getElementById('trf-qty')?.value),
            transferDate: document.getElementById('trf-date')?.value,
            reason: document.getElementById('trf-reason')?.value
        };
        if (!data.item) { UI.toast('Select an item.', 'error'); return; }
        if (isNaN(data.qty) || data.qty <= 0) { UI.toast('Enter a valid quantity.', 'error'); return; }
        if (data.fromLoc === data.toLoc) { UI.toast('Source and destination must be different.', 'error'); return; }
        try {
            const res = await DataService.requestTransfer(data);
            UI.toast(`${res.id} submitted — awaiting admin approval.`, 'success');
            const m = document.getElementById('transferModal');
            if (m) m.remove();
            await this.open(this._currentProjectId, true);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async decideTransfer(id, approve) {
        if (!confirm(approve ? 'Approve this transfer? Stock will be moved on both sides.' : 'Reject this transfer?')) return;
        try {
            if (approve) await DataService.approveTransfer(id);
            else await DataService.rejectTransfer(id);
            UI.toast(approve ? 'Transfer completed — stock moved.' : 'Transfer rejected.', 'success');
            await this.open(this._currentProjectId, true);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    filterSiteMaterials(q) {
        q = String(q || '').toLowerCase().trim();
        document.querySelectorAll('#siteMatBody tr[data-mat]').forEach(tr => {
            tr.style.display = !q || tr.dataset.mat.indexOf(q) > -1 ? '' : 'none';
        });
    }

});