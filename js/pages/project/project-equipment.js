// ================================================================
//  project-equipment.js — Project Equipment tab (v6.9)
//  ---------------------------------------------------------------
//  Everything here comes from the equipment rows of the daily site
//  reports (no separate encoding), with the Equipment DB supplying
//  brand info.
//
//  PRESENCE MODEL: a unit's first log is its check-in; it stays on
//  site until checked out, so Days on Site is measured from that first
//  log rather than by counting logged days. A missed report therefore
//  can't fake a departure — it surfaces as a "stale" warning instead,
//  which makes the reporting-discipline gap visible rather than
//  silently corrupting utilization.
//
//  Augments ProjectPage via Object.assign.
// ================================================================

Object.assign(ProjectPage, {

    _eqStatusClass(status) {
        switch (status) {
            case 'Operational': return 'approved';
            case 'Under Repair': return 'pending';
            case 'Breakdown': return 'rejected';
            case 'Standby': return 'reviewing';
            default: return 'draft';
        }
    },

    renderEquipment(p) {
        const container = document.getElementById('proj-tab-equipment');
        if (!container) return;
        const rows = p.equipmentOnSite || [];
        const sum = p.equipmentSummary || {};
        const downtime = p.downtimeLog || [];

        let html = `
            <div class="kpi-strip" style="margin-bottom:14px;">
                <div class="kpi-card"><div class="k-label">Units on Site</div><div class="k-val">${fmtNum(sum.unitsOnSite || 0)}</div><div class="k-sub">${sum.types || 0} equipment types</div></div>
                <div class="kpi-card good"><div class="k-label">Operational Now</div><div class="k-val">${sum.operationalNow || 0}</div><div class="k-sub">latest status per unit</div></div>
                <div class="kpi-card bad"><div class="k-label">Repair / Breakdown</div><div class="k-val">${sum.downNow || 0}</div><div class="k-sub">currently unavailable</div></div>
                <div class="kpi-card warn"><div class="k-label">Avg Utilization</div><div class="k-val">${sum.avgUtilization || 0}%</div><div class="k-sub">operational ÷ days on site</div></div>
            </div>

            <div class="section-head"><h2>Equipment on Site</h2><div class="rule"></div><span class="cc-note">status from the most recent daily report</span></div>
            <div class="panel"><table><thead><tr>
                <th>Equipment</th><th style="text-align:right">Qty</th><th>Current Status</th>
                <th style="text-align:right">Days on Site</th><th style="text-align:right">Operational</th>
                <th style="min-width:110px">Utilization</th><th>Last Logged</th>
            </tr></thead><tbody>`;

        if (!rows.length) {
            html += `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:24px">No equipment has been logged in the daily site reports yet.</td></tr>`;
        } else {
            rows.forEach(e => {
                const barColor = e.utilization >= 70 ? 'var(--green)' : e.utilization >= 45 ? 'var(--amber)' : 'var(--red)';
                const stale = e.staleDays >= 3
                    ? ` <span style="font-size:10px;color:var(--amber);font-family:'IBM Plex Mono';" title="No recent log entry - the report may simply not have been updated">⚠ ${e.staleDays}d stale</span>`
                    : '';
                html += `<tr>
                    <td><b>${e.name}</b>${e.brand ? `<div class="mono" style="font-size:10.5px;color:var(--ink-soft)">${e.brand}</div>` : ''}</td>
                    <td class="amt">${fmtNum(e.qty)}</td>
                    <td><span class="stamp ${this._eqStatusClass(e.status)}">${e.status}</span></td>
                    <td class="amt">${e.daysOnSite}</td>
                    <td class="amt">${e.operationalDays}</td>
                    <td>
                        <div style="height:8px;background:var(--bg);border-radius:20px;overflow:hidden;min-width:70px;"><div style="height:100%;border-radius:20px;width:${e.utilization}%;background:${barColor};"></div></div>
                        <span class="mono" style="font-size:10px;color:var(--ink-soft)">${e.utilization}%</span>
                    </td>
                    <td class="mono" style="font-size:11px">${e.lastSeen || '—'}${stale}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>`;

        // ── Downtime log ──
        html += `
            <div class="section-head"><h2>Downtime Log</h2><div class="rule"></div><span class="cc-note">Under Repair + Breakdown</span></div>
            <div class="panel"><table><thead><tr>
                <th>Date</th><th>Equipment</th><th>Status</th><th>Remarks</th>
            </tr></thead><tbody>`;
        if (!downtime.length) {
            html += `<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);padding:20px">No downtime recorded.</td></tr>`;
        } else {
            downtime.forEach(d => {
                html += `<tr>
                    <td class="mono" style="font-size:11.5px">${d.date}</td>
                    <td>${d.name}</td>
                    <td><span class="stamp ${this._eqStatusClass(d.status)}">${d.status}</span></td>
                    <td style="color:var(--ink-soft);font-size:12px">${d.remarks || '—'}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>`;

        // ── Cost vs usage ──
        if ((sum.rentalTotal || 0) > 0 && rows.length) {
            html += `
                <div class="section-head"><h2>Cost vs Usage</h2><div class="rule"></div><span class="cc-note">Equipment Rental releases ÷ operational days</span></div>
                <div class="chart-card"><div class="canvas-wrap"><canvas id="eqCostChart"></canvas></div></div>
                <div class="data-source-note">Total Equipment Rental cost for this project (₱${fmtMoney(sum.rentalTotal)}) is apportioned across units by operational days. This is an estimate, since releases are not itemised per unit; it shows which machines cost most per day of actual use.</div>`;
        }

        html += `<div class="data-source-note">All data here comes from the equipment rows of the Daily Site Reports. A unit's first log entry is treated as its check-in: it stays on site even if a day of logging is missed, and a missed report surfaces as a stale warning rather than a false departure.</div>`;

        container.innerHTML = html;
        if ((sum.rentalTotal || 0) > 0 && rows.length) setTimeout(() => this._buildEquipmentChart(rows), 60);
    },

    _buildEquipmentChart(rows) {
        const ctx = document.getElementById('eqCostChart');
        if (!ctx || typeof Chart === 'undefined') return;
        if (this._charts.eqCost) { try { this._charts.eqCost.destroy(); } catch (_) {} }
        const data = rows.filter(e => e.costPerOpDay > 0)
            .sort((a, b) => b.costPerOpDay - a.costPerOpDay).slice(0, 10);
        if (!data.length) return;
        this._charts.eqCost = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(e => e.name),
                datasets: [{
                    data: data.map(e => e.costPerOpDay),
                    backgroundColor: data.map(e => e.utilization >= 70 ? '#2F7A46' : e.utilization >= 45 ? '#C2860F' : '#B23A2E'),
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: c => '₱' + fmtMoney(c.parsed.x) + ' per operational day' } }
                },
                scales: { x: { ticks: { callback: fmtAxisMoney }, grid: { color: '#EEEBE0' } }, y: { grid: { display: false } } }
            }
        });
    }

});