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
            </div>
            <div class="panel"><table><thead><tr>
                <th>Material</th><th>Unit</th>
                <th style="text-align:right">Delivered</th><th style="text-align:right">Used</th><th style="text-align:right">Remaining</th>
                <th style="min-width:110px">Usage</th><th>Status</th><th>Last Movement</th>
            </tr></thead><tbody id="siteMatBody">`;

        if (!rows.length) {
            html += `<tr><td colspan="8" style="text-align:center;color:var(--ink-soft);padding:24px">No materials delivered yet. Log deliveries in the Daily Site Record.</td></tr>`;
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
                    <td class="amt">${fmtNum(m.used)}</td>
                    <td class="amt"><b>${fmtNum(m.remaining)}</b></td>
                    <td><div style="height:8px;background:var(--bg);border-radius:20px;overflow:hidden;min-width:80px;"><div style="height:100%;border-radius:20px;width:${usedPct}%;background:${barColor};"></div></div></td>
                    <td><span class="stamp ${stampCls}">${stampTxt}</span></td>
                    <td class="mono" style="font-size:11px;color:var(--ink-soft)">${m.lastMovement || '—'}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>
            <div class="data-source-note">Computed from every non-rejected Daily Site Record (Materials Delivered − Materials Used).</div>`;
        container.innerHTML = html;
    },

    filterSiteMaterials(q) {
        q = String(q || '').toLowerCase().trim();
        document.querySelectorAll('#siteMatBody tr[data-mat]').forEach(tr => {
            tr.style.display = !q || tr.dataset.mat.indexOf(q) > -1 ? '' : 'none';
        });
    }

});