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
                    `<div class="kpi-card ${k.cls}"><div class="k-label">${esc(k.label)}</div><div class="k-val mono">${k.value}</div><div class="k-sub">${k.sub}</div></div>`;
            });
            html += `</div>
            <div class="section-head"><h2>Cashflow</h2><div class="rule"></div>
                <span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-soft);">View:</span>
                <button class="btn-sm" id="cfMonthBtn" onclick="FinancePage.setCashflowView('month')">Month</button>
                <button class="btn-sm" id="cfWeekBtn" onclick="FinancePage.setCashflowView('week')">Week</button>
                <span class="cc-note" style="margin-left:6px;">solid = actual · dotted = projected (Gantt, all projects)</span>
            </div>
            <div class="chart-grid full"><div class="chart-card"><div class="cc-head"><h3>Inflow / Outflow / Net</h3><span class="cc-note">actual + Gantt forecast</span></div><div class="canvas-wrap"><canvas id="cfChart"></canvas></div></div></div>
            <div class="section-head"><h2>Cost Control</h2><div class="rule"></div></div>
            <div class="chart-grid"><div class="chart-card"><div class="cc-head"><h3>Budget vs Actual</h3><span class="cc-note">variance per SOW &middot; worst first</span></div><div class="canvas-wrap tall"><canvas id="budgetChart"></canvas></div></div><div class="chart-card"><div class="cc-head"><h3>Cost Breakdown</h3></div><div class="canvas-wrap"><canvas id="breakdownChart"></canvas></div></div></div>
            <div class="chart-grid" style="margin-top:16px"><div class="chart-card"><div class="cc-head"><h3>Cash Advance Liquidation Aging</h3><span class="cc-note">unliquidated advances</span></div><div class="canvas-wrap short"><canvas id="agingChart"></canvas></div></div><div class="chart-card"><div class="cc-head"><h3>Project Cost Status</h3></div><table><thead><tr><th>Project</th><th style="text-align:right">Budget</th><th style="text-align:right">Actual</th><th>Status</th></tr></thead><tbody>`;
            data.costStatus.forEach(c => {
                html +=
                    `<tr><td>${c.project}</td><td class="amt">₱${fmtMoney(c.budget)}</td><td class="amt">₱${fmtMoney(c.actual)}</td><td><span class="stamp ${c.cls}">${esc(c.status)}</span></td></tr>`;
            });
            html += `</tbody></table></div></div>
            `;
            UI.setContent(container, html);
            this._buildCharts(data);
            this._loaded = true;
        } catch (err) { console.error('Finance error:', err);
            UI.toast('Error loading finance.', 'error'); }
    },
    setCashflowView(view) {
        this._cfView = view;
        this._buildCashflowChart();
    },

    _buildCashflowChart() {
        const src = this._cashflowData;
        if (!src || typeof Chart === 'undefined') return;
        const cf = this._cfView === 'week' ? (src.weekly || src) : src;
        const mBtn = document.getElementById('cfMonthBtn');
        const wBtn = document.getElementById('cfWeekBtn');
        if (mBtn) mBtn.classList.toggle('primary', this._cfView !== 'week');
        if (wBtn) wBtn.classList.toggle('primary', this._cfView === 'week');

        const nowIdx = typeof cf.nowIndex === 'number' ? cf.nowIndex : cf.labels.length - 1;

        // ── v27: THE SERVER OWNS THIS CALCULATION ──
        // This used to recompute the running balance here, and it made
        // the same mistake the backend did: it joined the forecast to the
        // actual line at the current interval and only began subtracting
        // from the NEXT one, so the current interval's spend never came
        // off and the closing balance read far too high. The server now
        // sends both series computed once, from unrounded figures; the
        // local version remains only as a fallback for an older payload.
        let netActual = cf.netActual;
        let netProjected = cf.netForecast;
        if (!netActual || !netProjected) {
            let running = Number(cf.openingBalance || 0);
            netActual = []; netProjected = [];
            cf.labels.forEach((_, i) => {
                if (i < nowIdx) {
                    running += (cf.inflow[i] || 0) - (cf.outflow[i] || 0);
                    netActual.push(running);
                    netProjected.push(null);
                } else if (i === nowIdx) {
                    running += (cf.inflow[i] || 0) - (cf.outflow[i] || 0);
                    netActual.push(running);
                    netProjected.push(running);
                } else {
                    netActual.push(null);
                    running -= (cf.projectedOutflow && cf.projectedOutflow[i - 1]) || 0;
                    netProjected.push(running);
                }
            });
        }

        if (this._charts.cf) { try { this._charts.cf.destroy(); } catch (_) {} }
        this._charts.cf = new Chart(document.getElementById('cfChart'), {
            data: {
                labels: cf.labels,
                datasets: [
                    { type: 'bar', label: 'Inflow (actual)', data: cf.inflow.map((v, i) => i <= nowIdx ? v : null),
                        backgroundColor: '#2F7A46', borderRadius: 4, order: 2 },
                    { type: 'bar', label: 'Outflow (actual)', data: cf.outflow.map((v, i) => i <= nowIdx ? v : null),
                        backgroundColor: '#B23A2E', borderRadius: 4, order: 2 },
                    { type: 'line', label: 'Projected outflow (Gantt)', data: cf.projectedOutflow || [],
                        borderColor: '#C2860F', borderDash: [5, 4], pointRadius: 3, tension: .3, spanGaps: false, order: 1 },
                    { type: 'line', label: 'Net cash (actual)', data: netActual,
                        borderColor: '#24455A', borderWidth: 2, pointRadius: 3, tension: .3, spanGaps: false, order: 1 },
                    { type: 'line', label: 'Net cash (projected)', data: netProjected,
                        borderColor: '#24455A', borderDash: [4, 4], borderWidth: 2, pointRadius: 2, tension: .3, spanGaps: false, order: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10.5 } } },
                    tooltip: { callbacks: { label: c => `${esc(c.dataset.label)}: ₱${fmtMoney(c.parsed.y ?? 0)}` } }
                },
                scales: { y: { ticks: { callback: fmtAxisMoney }, grid: { color: '#EEEBE0' } }, x: { grid: { display: false } } }
            }
        });
    },

    _buildCharts(data) {
        Object.values(this._charts).forEach(c => { try { c.destroy(); } catch (_) {} });
        this._charts = {};
        try {
            if (typeof Chart === 'undefined') return;
            // ══ v6.6 Cashflow v2 ══ month/week toggle + Gantt forecast.
            // Net Cash stays a RUNNING balance (seeded with the opening
            // balance before the window); beyond today it continues as a
            // dotted projection driven by the aggregated Gantt forecast.
            this._cashflowData = data.cashflow;
            if (!this._cfView) this._cfView = 'month';
            this._buildCashflowChart();
            // ── v10 CHART REWRITE: Budget vs Actual as VARIANCE ──
            // Two vertical bars per SOW meant reading heights and doing the
            // subtraction yourself, with the SOW name rotated 45° and
            // clipped. What actually matters is the GAP: over or under, and
            // by how much. So this plots variance (actual − budget) against
            // a centre line — over-runs extend right in red, savings left in
            // green — sorted worst-first so exceptions surface themselves.
            const bv = data.budgetVsActual;
            const vRows = (bv.labels || []).map((lb, i) => ({
                label: lb,
                budget: (bv.budget || [])[i] || 0,
                actual: (bv.actual || [])[i] || 0,
                variance: ((bv.actual || [])[i] || 0) - ((bv.budget || [])[i] || 0)
            })).sort((a, b) => b.variance - a.variance);

            this._charts.budget = new Chart(document.getElementById('budgetChart'), {
                type: 'bar',
                data: {
                    labels: vRows.map(r => r.label),
                    datasets: [{
                        label: 'Variance vs budget',
                        data: vRows.map(r => r.variance),
                        backgroundColor: vRows.map(r => r.variance > 0 ? '#B23A2E' : '#2F7A46'),
                        borderRadius: 4,
                        barPercentage: 0.74
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: c => vRows[c[0].dataIndex].label,
                                label: c => {
                                    const r = vRows[c.dataIndex];
                                    const pct = r.budget ? Math.round(r.variance / r.budget * 100) : 0;
                                    return (r.variance > 0 ? 'Over budget by ₱' : 'Under budget by ₱')
                                        + fmtMoney(Math.abs(r.variance)) + (r.budget ? ` (${Math.abs(pct)}%)` : '');
                                },
                                afterBody: c => {
                                    const r = vRows[c[0].dataIndex];
                                    return [`Budget: ₱${fmtMoney(r.budget)}`, `Actual: ₱${fmtMoney(r.actual)}`];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { callback: fmtAxisMoney },
                            grid: { color: '#EEEBE0' },
                            title: { display: true, text: 'over budget →  |  ←  under budget',
                                     color: '#5B6360', font: { size: 10 } }
                        },
                        y: { grid: { display: false }, ticks: { font: { size: 11 }, autoSkip: false } }
                    }
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
                        tooltip: { callbacks: { label: c => `${esc(c.label)}: ${c.parsed}%` } }
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
                                '₱' + fmtMoney(c.parsed.x) } } },
                    scales: { x: { ticks: { callback: fmtAxisMoney },
                            grid: { color: '#EEEBE0' } }, y: { grid: { display: false } } }
                }
            });
        } catch (err) { console.error('Finance chart error:', err); }
    }
};