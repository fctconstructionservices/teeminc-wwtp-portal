// ================================================================
//  portfolio.js — Portfolio Dashboard (v7.2)
//  ---------------------------------------------------------------
//  Answers one question: "which project needs me today?"
//
//  The Needs Attention list is the point of the page — it is severity
//  ordered by the server, so the most expensive problem is always the
//  first thing read. The table below is for comparison, not for
//  discovery.
//
//  No new data is captured here; every figure is already computed
//  elsewhere (EVM, contract readiness, billings, daily reports).
// ================================================================

const PortfolioPage = {

    _data: null,
    _charts: {},
    _filter: 'active',

    async load() {
        const container = document.getElementById('portfolioContent');
        if (!container) return;
        UI.showSkeleton(container);

        try {
            this._data = await DataService.getPortfolioData();
        } catch (err) {
            container.innerHTML = `<div class="empty">
                <div class="empty-ico">📊</div>
                <h4>Unable to load portfolio</h4>
                <p>${err.message}</p>
            </div>`;
            return;
        }
        this.render();
    },

    render() {
        const container = document.getElementById('portfolioContent');
        const d = this._data;
        if (!d) return;
        const s = d.summary;

        let html = `
            <div class="kpi-strip" style="margin-bottom:14px;">
                <div class="kpi-card"><div class="k-label">Active Projects</div>
                    <div class="k-val">${s.activeProjects}</div>
                    <div class="k-sub">${s.totalProjects} total</div></div>
                <div class="kpi-card good"><div class="k-label">Contract Value</div>
                    <div class="k-val mono">₱${fmtMoney(s.totalContract)}</div>
                    <div class="k-sub">${s.totalVO ? '+₱' + fmtMoney(s.totalVO) + ' from variation orders' : 'no variation orders'}</div></div>
                <div class="kpi-card ${s.uncollected > 0 ? 'warn' : 'good'}"><div class="k-label">Uncollected</div>
                    <div class="k-val mono">₱${fmtMoney(s.uncollected)}</div>
                    <div class="k-sub">₱${fmtMoney(s.totalBilled)} billed · ₱${fmtMoney(s.totalCollected)} collected</div></div>
                <div class="kpi-card ${s.urgentCount ? 'bad' : s.attentionCount ? 'warn' : 'good'}">
                    <div class="k-label">Needs Attention</div>
                    <div class="k-val">${s.attentionCount}</div>
                    <div class="k-sub">${s.urgentCount} urgent</div></div>
            </div>`;

        // ── Needs Attention ──
        html += `<div class="section-head"><h2>Needs Attention</h2><div class="rule"></div>
            <span class="cc-note">highest severity first</span></div>`;
        if (!d.attention.length) {
            html += `<div class="panel"><div class="empty" style="padding:26px;">
                <div class="empty-ico">✓</div>
                <h4>Nothing needs attention</h4>
                <p>All projects are on schedule and within budget, with no overdue billings.</p>
            </div></div>`;
        } else {
            html += `<div class="attention-list">`;
            d.attention.forEach(a => {
                const sev = a.severity === 1 ? 'urgent' : a.severity === 2 ? 'warn' : 'info';
                html += `<div class="attention-row ${sev}">
                    <span class="attn-ico">${a.icon}</span>
                    <span class="attn-text"><b>${a.projectName}</b> — ${a.text}</span>
                    <button class="btn-sm" onclick="PortfolioPage.goToProject('${a.projectId}','${a.tab}')">View</button>
                </div>`;
            });
            html += `</div>`;
        }

        // ── Project table ──
        const rows = this._filter === 'active'
            ? d.projects.filter(p => String(p.status).toLowerCase() !== 'completed')
            : d.projects;

        html += `<div class="section-head"><h2>All Projects</h2><div class="rule"></div>
            <button class="btn-sm ${this._filter === 'active' ? 'primary' : ''}" onclick="PortfolioPage.setFilter('active')">Active</button>
            <button class="btn-sm ${this._filter === 'all' ? 'primary' : ''}" onclick="PortfolioPage.setFilter('all')">All</button>
        </div>
        <div class="panel"><table><thead><tr>
            <th>Project</th><th style="min-width:92px">Progress</th>
            <th>SPI</th><th>CPI</th>
            <th style="text-align:right">Contract</th>
            <th style="text-align:right">Billed</th>
            <th style="text-align:right">Collected</th>
            <th style="text-align:right">Cash</th>
            <th>Health</th>
        </tr></thead><tbody>`;

        if (!rows.length) {
            html += `<tr><td colspan="9" style="text-align:center;color:var(--ink-soft);padding:24px">No projects.</td></tr>`;
        } else {
            rows.forEach(p => {
                const stampCls = p.healthClass === 'ok' ? 'approved'
                    : p.healthClass === 'warn' ? 'pending'
                    : p.healthClass === 'bad' ? 'rejected' : 'draft';
                const barColor = p.progress >= 60 ? 'var(--green)' : p.progress >= 25 ? 'var(--amber)' : 'var(--blueprint)';
                const idx = (v) => {
                    if (v === null || v === undefined) return `<span class="idx-chip">—</span>`;
                    const c = v >= 1 ? 'g' : v >= 0.9 ? 'a' : 'r';
                    return `<span class="idx-chip ${c}">${v.toFixed(2)}</span>`;
                };
                html += `<tr style="cursor:pointer" onclick="PortfolioPage.goToProject('${p.id}','overview')">
                    <td><b>${p.name}</b><div class="mono" style="font-size:10px;color:var(--ink-soft)">${p.id}${p.client ? ' · ' + p.client : ''}</div></td>
                    <td>
                        <div style="height:6px;background:var(--bg);border-radius:20px;overflow:hidden;min-width:64px;"><div style="height:100%;border-radius:20px;width:${Math.min(p.progress, 100)}%;background:${barColor};"></div></div>
                        <span class="mono" style="font-size:10px;color:var(--ink-soft)">${p.progress}%</span>
                    </td>
                    <td>${idx(p.spi)}</td>
                    <td>${idx(p.cpi)}</td>
                    <td class="amt">₱${fmtMoney(p.contract)}</td>
                    <td class="amt">₱${fmtMoney(p.billed)}</td>
                    <td class="amt">₱${fmtMoney(p.collected)}</td>
                    <td class="amt" style="color:${p.cashPosition < 0 ? 'var(--red)' : 'inherit'}">₱${fmtMoney(p.cashPosition)}</td>
                    <td><span class="stamp ${stampCls}">${p.health}</span></td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>
            <div class="data-source-note">SPI = earned ÷ planned (schedule performance). CPI = earned ÷ spent (cost performance). 1.00 means exactly on plan. All figures come from the same data each project page uses.</div>`;

        // ── charts ──
        html += `<div class="chart-grid" style="margin-top:16px;">
            <div class="chart-card"><div class="cc-head"><h3>Contract Value by Project</h3></div>
                <div class="canvas-wrap short"><canvas id="pfMixChart"></canvas></div></div>
            <div class="chart-card"><div class="cc-head"><h3>Billed vs Collected</h3></div>
                <div class="canvas-wrap short"><canvas id="pfCollectChart"></canvas></div></div>
        </div>`;

        container.innerHTML = html;
        setTimeout(() => this._buildCharts(rows), 60);
    },

    setFilter(f) { this._filter = f; this.render(); },

    goToProject(id, tab) {
        ProjectPage.open(id).then(() => {
            if (tab && tab !== 'overview') setTimeout(() => ProjectPage.switchTab(tab), 200);
        });
    },

    _buildCharts(rows) {
        if (typeof Chart === 'undefined' || !rows.length) return;
        const palette = ['#24455A', '#B23A2E', '#2F7A46', '#C2860F', '#E15412', '#5B6360'];

        const mix = document.getElementById('pfMixChart');
        if (mix) {
            if (this._charts.mix) { try { this._charts.mix.destroy(); } catch (_) {} }
            this._charts.mix = new Chart(mix, {
                type: 'doughnut',
                data: {
                    labels: rows.map(r => r.name),
                    datasets: [{
                        data: rows.map(r => r.contract),
                        backgroundColor: rows.map((_, i) => palette[i % palette.length]),
                        borderWidth: 2, borderColor: 'var(--surface)'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '58%',
                    plugins: {
                        legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 7, font: { size: 10 } } },
                        tooltip: { callbacks: { label: c => '₱' + fmtMoney(c.parsed) } }
                    }
                }
            });
        }

        const col = document.getElementById('pfCollectChart');
        if (col) {
            if (this._charts.collect) { try { this._charts.collect.destroy(); } catch (_) {} }
            this._charts.collect = new Chart(col, {
                type: 'bar',
                data: {
                    labels: rows.map(r => r.name),
                    datasets: [
                        { label: 'Billed', data: rows.map(r => r.billed), backgroundColor: '#24455A', borderRadius: 4 },
                        { label: 'Collected', data: rows.map(r => r.collected), backgroundColor: '#2F7A46', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } },
                        tooltip: { callbacks: { label: c => `${c.dataset.label}: ₱${fmtMoney(c.parsed.y)}` } }
                    },
                    scales: { y: { ticks: { callback: fmtAxisMoney }, grid: { color: '#EEEBE0' } }, x: { grid: { display: false } } }
                }
            });
        }
    }
};