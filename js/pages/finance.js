// ================================================================
//  pages/finance.js — Finance dashboard
//
//  PURPOSE: KPI cards, 6-month cashflow, budget vs actual,
//  breakdown doughnut, pending-request aging and per-project cost
//  status table, all from one DataService.getFinanceData() call.
//  Chart.js instances are cached in _charts and destroyed on
//  reload to prevent canvas leaks.
// ================================================================

const FinancePage = {
    _loaded: false,
    _charts: {},
    async load() {
        if (this._loaded) return;
        const container = document.getElementById('financeContent');
        UI.showLoading(container);
        try {
            const data = await DataService.getFinanceData();
            let html = `
            <div class="section-head"><h2>Key Indicators</h2><div class="rule"></div><span class="badge">as of today</span></div>
            <div class="kpi-strip">`;
            data.kpis.forEach(k => {
                html +=
                    `<div class="kpi-card ${k.cls}"><div class="k-label">${k.label}</div><div class="k-val mono">${k.value}</div><div class="k-sub">${k.sub}</div></div>`;
            });
            html += `</div>
            <div class="section-head"><h2>Cashflow</h2><div class="rule"></div></div>
            <div class="chart-grid full"><div class="chart-card"><div class="cc-head"><h3>Monthly Inflow / Outflow / Net</h3><span class="cc-note">dashed = projected</span></div><div class="canvas-wrap"><canvas id="cfChart"></canvas></div></div></div>
            <div class="section-head"><h2>Cost Control</h2><div class="rule"></div></div>
            <div class="chart-grid"><div class="chart-card"><div class="cc-head"><h3>Budget vs Actual</h3></div><div class="canvas-wrap"><canvas id="budgetChart"></canvas></div></div><div class="chart-card"><div class="cc-head"><h3>Cost Breakdown</h3></div><div class="canvas-wrap"><canvas id="breakdownChart"></canvas></div></div></div>
            <div class="chart-grid" style="margin-top:16px"><div class="chart-card"><div class="cc-head"><h3>Cash Advance Liquidation Aging</h3><span class="cc-note">unliquidated advances</span></div><div class="canvas-wrap short"><canvas id="agingChart"></canvas></div></div><div class="chart-card"><div class="cc-head"><h3>Project Cost Status</h3></div><table><thead><tr><th>Project</th><th style="text-align:right">Budget</th><th style="text-align:right">Actual</th><th>Status</th></tr></thead><tbody>`;
            data.costStatus.forEach(c => {
                html +=
                    `<tr><td>${c.project}</td><td class="amt">₱${c.budget.toLocaleString()}</td><td class="amt">₱${c.actual.toLocaleString()}</td><td><span class="stamp ${c.cls}">${c.status}</span></td></tr>`;
            });
            html += `</tbody></table></div></div>
            <div class="data-source-note"><strong>Simulated data.</strong></div>`;
            UI.setContent(container, html);
            this._buildCharts(data);
            this._loaded = true;
        } catch (err) { console.error('Finance error:', err);
            UI.toast('Error loading finance.', 'error'); }
    },
    _buildCharts(data) {
        Object.values(this._charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        this._charts = {};
        try {
            if (typeof Chart === 'undefined') return;
            const cf = data.cashflow;
            const net = cf.inflow.map((v, i) => v - cf.outflow[i]);
            this._charts.cf = new Chart(document.getElementById('cfChart'), {
                type: 'bar',
                data: {
                    labels: cf.labels,
                    datasets: [{
                        label: 'Inflow',
                        data: cf.inflow,
                        backgroundColor: cf.labels.map((_, i) => i >= cf.projectedFrom ? 'rgba(47,122,70,.35)' :
                            '#2F7A46'),
                        borderRadius: 4,
                        order: 2
                    }, {
                        label: 'Outflow',
                        data: cf.outflow,
                        backgroundColor: cf.labels.map((_, i) => i >= cf.projectedFrom ? 'rgba(178,58,46,.35)' :
                            '#B23A2E'),
                        borderRadius: 4,
                        order: 2
                    }, {
                        label: 'Net Cash',
                        data: net,
                        type: 'line',
                        borderColor: '#24455A',
                        backgroundColor: '#24455A',
                        borderWidth: 2,
                        pointRadius: 3,
                        segment: { borderDash: ctx => ctx.p0DataIndex >= cf.projectedFrom - 1 ? [5,
                                4] : undefined },
                        order: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
                        tooltip: { callbacks: { label: c => `${c.dataset.label}: ₱${c.parsed.y.toLocaleString()}` } }
                    },
                    scales: { y: { ticks: { callback: v => '₱' + (v / 1000) + 'k' },
                            grid: { color: '#EEEBE0' } }, x: { grid: { display: false } } }
                }
            });
            const bv = data.budgetVsActual;
            this._charts.budget = new Chart(document.getElementById('budgetChart'), {
                type: 'bar',
                data: {
                    labels: bv.labels,
                    datasets: [{ label: 'Budget', data: bv.budget, backgroundColor: '#C9D9E0',
                            borderRadius: 4 }, { label: 'Actual', data: bv.actual,
                            backgroundColor: '#24455A', borderRadius: 4 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
                        tooltip: { callbacks: { label: c => `${c.dataset.label}: ₱${c.parsed.y.toLocaleString()}` } }
                    },
                    scales: { y: { ticks: { callback: v => '₱' + (v / 1000) + 'k' },
                            grid: { color: '#EEEBE0' } }, x: { grid: { display: false } } }
                }
            });
            const bd = data.breakdown;
            this._charts.breakdown = new Chart(document.getElementById('breakdownChart'), {
                type: 'doughnut',
                data: {
                    labels: bd.labels,
                    datasets: [{ data: bd.values, backgroundColor: ['#24455A', '#E15412', '#C2860F',
                            '#2F7A46', '#B4ADA0'
                        ], borderColor: '#fff', borderWidth: 2 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8,
                                font: { size: 10.5 } } },
                        tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed}%` } }
                    }
                }
            });
            const ag = data.aging;
            this._charts.aging = new Chart(document.getElementById('agingChart'), {
                type: 'bar',
                data: {
                    labels: ag.labels,
                    datasets: [{ data: ag.values, backgroundColor: ['#2F7A46', '#C2860F', '#E15412',
                            '#B23A2E'
                        ], borderRadius: 4 }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c =>
                                '₱' + c.parsed.x.toLocaleString() } } },
                    scales: { x: { ticks: { callback: v => '₱' + (v / 1000) + 'k' },
                            grid: { color: '#EEEBE0' } }, y: { grid: { display: false } } }
                }
            });
        } catch (err) { console.error('Finance chart error:', err); }
    }
};