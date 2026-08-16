// ================================================================
//  pages/project/project-reports.js — Report generator (v11 BATCH E2)
//
//  PURPOSE: Item 10. A Reports tab per project: tick the sections you
//  want, build the report, print it or save it as PDF through the
//  company print template.
//
//  WHY IT IS BUILT THIS WAY.
//
//  Everything a report needs is ALREADY in the payload getProjectData()
//  returns — SOW items, estimates, daily records, billings, variations,
//  punchlist, safety, drawings, EVM, cashflow. So the generator does no
//  fetching of its own: it composes what the project page already holds.
//  That keeps it instant, keeps the numbers identical to what the tabs
//  show (a report that disagrees with the screen is worse than no
//  report), and means it cannot drift when a tab changes.
//
//  Output goes through PrintDoc, so a report carries the same letterhead,
//  signature blocks and watermark as every other document in the system.
//  There is no separate report styling to keep in step.
//
//  A NOTE ON "SAVE AS PDF". This does not generate a PDF file server
//  side. It opens a print-ready document and lets the browser's print
//  dialogue save it as PDF, which is what every "print to PDF" button in
//  this system already does. Generating a real PDF in Apps Script would
//  mean either a rendering library it cannot run or a Docs round-trip
//  that loses the layout. The browser's own PDF export is better output
//  and it is honest about what it is.
// ================================================================

Object.assign(ProjectPage, {

    /**
     * REPORT_SECTIONS - the checklist. Each entry declares:
     *   id        checkbox id and storage key
     *   label     what the user ticks
     *   sub       one line explaining what lands in the report
     *   group     heading it sits under in the picker
     *   def       ticked by default
     *   render    (p) => HTML, or '' to omit the section entirely
     *
     * A section that has no data returns '' and is skipped, so ticking
     * everything on a young project does not produce six empty headings.
     */
    get REPORT_SECTIONS() {
        const self = this;
        return [
            { id: 'summary', label: 'Project summary', sub: 'Client, contract value, dates, overall progress', group: 'Overview', def: true,
              render: p => self._rsSummary(p) },
            { id: 'financial', label: 'Financial position', sub: 'Revenue, expenses, cash position, pending and unliquidated', group: 'Overview', def: true,
              render: p => self._rsFinancial(p) },
            { id: 'evm', label: 'Earned value', sub: 'PV, EV, AC, CPI and SPI with the variance read-out', group: 'Overview', def: false,
              render: p => self._rsEVM(p) },

            { id: 'sow', label: 'SOW and budget', sub: 'Every SOW item with budget, actual, variance and % complete', group: 'Scope', def: true,
              render: p => self._rsSOW(p) },
            { id: 'schedule', label: 'Schedule', sub: 'Start, finish, duration, predecessor and status per item', group: 'Scope', def: false,
              render: p => self._rsSchedule(p) },
            { id: 'gantt', label: 'Timeline chart', sub: 'The Gantt as one continuous chart, scaled to the page', group: 'Scope', def: false,
              render: p => self._rsGantt(p) },
            { id: 'estimates', label: 'Estimate summary', sub: 'Approved estimate totals per SOW item', group: 'Scope', def: false,
              render: p => self._rsEstimates(p) },
            { id: 'variations', label: 'Variation orders', sub: 'Every VO with status and contract effect', group: 'Scope', def: false,
              render: p => self._rsVariations(p) },

            { id: 'billings', label: 'Billings', sub: 'Billing register with gross, retention, recoupment and net', group: 'Commercial', def: false,
              render: p => self._rsBillings(p) },
            { id: 'cashflow', label: 'Cash requests', sub: 'Cash advances, releases and liquidations', group: 'Commercial', def: false,
              render: p => self._rsCash(p) },

            { id: 'daily', label: 'Daily records (summary)', sub: 'One line per site day with manpower and weather', group: 'Site', def: false,
              render: p => self._rsDaily(p) },
            { id: 'dailyFull', label: 'Daily records (full detail)', sub: 'Every record in full — manpower, equipment, work, materials, issues, photos', group: 'Site', def: false,
              render: p => self._rsDailyDetailed(p) },
            { id: 'manpower', label: 'Manpower summary', sub: 'Total man-days by role across the period', group: 'Site', def: false,
              render: p => self._rsManpower(p) },
            { id: 'equipment', label: 'Equipment on site', sub: 'Equipment assigned, with downtime if logged', group: 'Site', def: false,
              render: p => self._rsEquipment(p) },
            { id: 'materials', label: 'Site materials', sub: 'Materials received and consumed', group: 'Site', def: false,
              render: p => self._rsMaterials(p) },

            { id: 'punchlist', label: 'Punchlist', sub: 'Open and closed defects with rectification status', group: 'Quality & Safety', def: false,
              render: p => self._rsPunchlist(p) },
            { id: 'safety', label: 'Safety records (summary)', sub: 'Toolbox talks, inspections, incidents and near misses', group: 'Quality & Safety', def: false,
              render: p => self._rsSafety(p) },
            { id: 'safetyFull', label: 'Safety records (full detail)', sub: 'Every record with its persons, action taken and photographs', group: 'Quality & Safety', def: false,
              render: p => self._rsSafetyDetailed(p) },
            { id: 'drawings', label: 'Drawings register', sub: 'Drawing numbers with current revision', group: 'Quality & Safety', def: false,
              render: p => self._rsDrawings(p) }
        ];
    },

    _rEsc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    _rMoney(v) { return '₱' + fmtMoney(parseFloat(v) || 0); },
    _rDate(v) {
        if (!v) return '—';
        const d = new Date(v);
        return isNaN(d) ? String(v) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    },

    /** _rTable - a table, or '' when there are no rows. */
    _rTable(title, cols, rows, foot) {
        if (!rows || !rows.length) return '';
        const e = this._rEsc.bind(this);
        return `<section class="rp-sec">
            <h2>${e(title)}</h2>
            <table>
                <thead><tr>${cols.map(c => `<th${c.amt ? ' class="amt"' : ''}>${e(c.h)}</th>`).join('')}</tr></thead>
                <tbody>${rows.map(r => `<tr>${r.map((cell, i) =>
                    `<td${cols[i] && cols[i].amt ? ' class="amt"' : ''}>${cell == null ? '—' : cell}</td>`).join('')}</tr>`).join('')}</tbody>
                ${foot ? `<tfoot><tr>${foot.map((cell, i) =>
                    `<td${cols[i] && cols[i].amt ? ' class="amt"' : ''}>${cell == null ? '' : cell}</td>`).join('')}</tr></tfoot>` : ''}
            </table>
        </section>`;
    },

    /** _rFacts - a two-column definition block, or '' when empty. */
    _rFacts(title, pairs) {
        const rows = (pairs || []).filter(p => p && p[1] !== '' && p[1] != null);
        if (!rows.length) return '';
        const e = this._rEsc.bind(this);
        return `<section class="rp-sec">
            <h2>${e(title)}</h2>
            <div class="rp-facts">${rows.map(p =>
                `<div class="rp-fact"><span>${e(p[0])}</span><b>${p[1]}</b></div>`).join('')}</div>
        </section>`;
    },

    // ─── section renderers ──────────────────────────────────────

    _rsSummary(p) {
        return this._rFacts('Project Summary', [
            ['Project', this._rEsc(p.name)],
            ['Project ID', this._rEsc(p.id)],
            ['Client', this._rEsc(p.clientName)],
            ['Location', this._rEsc(p.location)],
            ['Status', this._rEsc(p.status)],
            ['Start date', this._rDate(p.startDate)],
            ['Target completion', this._rDate(p.endDate)],
            ['Original contract value', this._rMoney(p.contractValue)],
            // v11 BATCH H5: printing the same figure twice invites the
            // question "which one is right?". A revised value is only
            // shown when a variation order actually changed it.
            ['Revised contract value',
             (Math.abs((parseFloat(p.contractValueRevised) || 0) - (parseFloat(p.contractValue) || 0)) > 0.005)
                ? this._rMoney(p.contractValueRevised) : ''],
            ['Retention', ((p.retentionPct || 0) * 100).toFixed(0) + '%'],
            ['Overall progress', (p.totalProgress || 0).toFixed(1) + '%']
        ]);
    },

    _rsFinancial(p) {
        const lc = v => String(v || '').toLowerCase();
        const cas = p.cashAdvanceRequests || [];
        const rel = p.cashReleases || [];
        const liq = p.liquidations || [];
        const pendingCost = cas.filter(r => lc(r.status) === 'pending')
            .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        const byCA = {};
        liq.filter(l => lc(l.status) === 'approved').forEach(l => {
            if (l.cashAdvanceId) byCA[l.cashAdvanceId] = (byCA[l.cashAdvanceId] || 0) + (parseFloat(l.amount) || 0);
        });
        const unliq = rel.filter(r => lc(r.status) === 'reviewed')
            .reduce((s, r) => s + Math.max(0, (parseFloat(r.amount) || 0) - (byCA[r.originalRequestId] || 0)), 0);

        return this._rFacts('Financial Position', [
            ['Revenue recognised', this._rMoney(p.revenue)],
            ['Expenses', this._rMoney(p.expenses)],
            ['Cash position', this._rMoney(p.cashPosition)],
            ['Pending request cost', this._rMoney(pendingCost) + ' <span class="rp-note">requested, not yet approved</span>'],
            ['Unliquidated cost', this._rMoney(unliq) + ' <span class="rp-note">released, receipts outstanding</span>']
        ]);
    },

    /**
     * _rpChart (v11 BATCH H5) - An inline SVG line chart.
     *
     * SVG rather than a chart library because the report opens in a NEW
     * WINDOW: a library would have to be loaded there, and if the load
     * failed or was slow the chart would print blank. SVG is in the
     * document the moment it is written, and it prints at the printer's
     * resolution rather than as a bitmap.
     */
    _rpChart(series, labels, opts) {
        opts = opts || {};
        const W = 720, H = 240, PADL = 62, PADB = 30, PADT = 12, PADR = 10;
        const all = series.reduce((a, s) => a.concat(s.data.filter(v => v != null)), []);
        if (!all.length) return '';
        const max = Math.max.apply(null, all) * 1.08 || 1;
        const n = Math.max(labels.length - 1, 1);
        const x = i => PADL + (i / n) * (W - PADL - PADR);
        const y = v => H - PADB - (v / max) * (H - PADB - PADT);

        // Four gridlines: enough to read a value off, few enough not to
        // fight the data for attention.
        let grid = '';
        for (let g = 0; g <= 4; g++) {
            const v = max * g / 4;
            grid += `<line x1="${PADL}" y1="${y(v)}" x2="${W - PADR}" y2="${y(v)}"
                        stroke="#E5E1D6" stroke-width="1"/>
                     <text x="${PADL - 6}" y="${y(v) + 3}" text-anchor="end"
                        font-size="8" fill="#5B6360">${opts.pct ? v.toFixed(0) + '%' : '₱' + Math.round(v).toLocaleString()}</text>`;
        }

        // Only every nth label, so a 24-month series does not overprint.
        const step = Math.ceil(labels.length / 12);
        let xlab = '';
        labels.forEach((l, i) => {
            if (i % step) return;
            xlab += `<text x="${x(i)}" y="${H - PADB + 12}" text-anchor="middle"
                        font-size="8" fill="#5B6360">${this._rEsc(l)}</text>`;
        });

        const paths = series.map(s => {
            const pts = s.data.map((v, i) => v == null ? null : `${x(i)},${y(v)}`).filter(Boolean);
            if (!pts.length) return '';
            return `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}"
                        stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
                        ${s.dashed ? 'stroke-dasharray="5 3"' : ''}/>`;
        }).join('');

        const legend = series.map((s, i) => `
            <g transform="translate(${PADL + i * 140},${PADT})">
                <line x1="0" y1="0" x2="16" y2="0" stroke="${s.color}" stroke-width="2"
                    ${s.dashed ? 'stroke-dasharray="5 3"' : ''}/>
                <text x="21" y="3" font-size="9" fill="#1C2321">${this._rEsc(s.name)}</text>
            </g>`).join('');

        return `<svg viewBox="0 0 ${W} ${H}" class="rp-chart" role="img"
                    aria-label="${this._rEsc(opts.title || 'chart')}">
            ${grid}${xlab}${paths}
            <line x1="${PADL}" y1="${H - PADB}" x2="${W - PADR}" y2="${H - PADB}" stroke="#9aa4a0"/>
            <line x1="${PADL}" y1="${PADT}" x2="${PADL}" y2="${H - PADB}" stroke="#9aa4a0"/>
            ${legend}
        </svg>`;
    },

    _rsEVM(p) {
        const e = p.evm;
        if (!e || (!e.pv && !e.ev && !e.ac)) return '';
        const cpi = parseFloat(e.cpi) || 0, spi = parseFloat(e.spi) || 0;
        const read = (v, over, under) => v >= 1 ? over : under;

        // v11 BATCH H5: the S-curve. Three numbers in a table tell you
        // where the project stands; the curves tell you how it got there,
        // which is what anyone reading a closeout report is looking for.
        const chart = (e.labels && e.labels.length)
            ? this._rpChart([
                { name: 'Planned value (PV)', data: e.pvSeries || [], color: '#24455A', dashed: true },
                { name: 'Earned value (EV)', data: e.evSeries || [], color: '#2F7A46' },
                { name: 'Actual cost (AC)', data: e.acSeries || [], color: '#B23A2E' }
              ], e.labels, { title: 'Earned value over time' })
            : '';

        const facts = this._rFacts('Earned Value', [
            ['Planned value (PV)', this._rMoney(e.pv)],
            ['Earned value (EV)', this._rMoney(e.ev)],
            ['Actual cost (AC)', this._rMoney(e.ac)],
            ['Cost variance (EV − AC)', this._rMoney((e.ev || 0) - (e.ac || 0))],
            ['Schedule variance (EV − PV)', this._rMoney((e.ev || 0) - (e.pv || 0))],
            ['CPI', cpi.toFixed(2) + ` <span class="rp-note">${read(cpi, 'under budget', 'over budget')}</span>`],
            ['SPI', spi.toFixed(2) + ` <span class="rp-note">${read(spi, 'ahead of schedule', 'behind schedule')}</span>`]
        ]);
        if (!facts) return '';
        return chart
            ? facts.replace('</section>', `<div class="rp-chartwrap">${chart}</div></section>`)
            : facts;
    },

    _rsSOW(p) {
        const items = p.sowItems || [];
        let tb = 0, ta = 0, te = 0;
        // v11 BATCH H5: the estimate column. Budget is what you allowed;
        // the estimate is what you priced. Seeing them side by side is
        // the whole point of a cost report — one without the other only
        // tells you half of what happened.
        // v11 BATCH H4: the report prints the same tree as the screen.
        // Headings show their roll-up and are styled as headings; totals
        // still count every row exactly once, so the printed total
        // matches the one on the SOW tab.
        const rows = items.map(s => {
            const b = parseFloat(s.budget) || 0, a = parseFloat(s.actual) || 0;
            const est = parseFloat(s.estimateTotal) || 0;
            tb += b; ta += a; te += est;

            if (s.isHeading) {
                const rb = parseFloat(s.rollupBudget) || 0;
                const ra = parseFloat(s.rollupActual) || 0;
                const rv = rb - ra;
                const rp = s.rollupProgress;
                const re = items.filter(x => String(x.id).indexOf(String(s.id) + '.') === 0)
                    .concat([s])
                    .reduce((sm, x) => sm + (parseFloat(x.estimateTotal) || 0), 0);
                return [
                    `<b>${this._rEsc(s.id)}</b>`,
                    `<b class="rp-head">${this._rEsc(s.description)}</b>`,
                    '', `<b>${this._rMoney(re)}</b>`,
                    `<b>${this._rMoney(rb)}</b>`, `<b>${this._rMoney(ra)}</b>`,
                    `<b class="${rv < 0 ? 'rp-bad' : ''}">${this._rMoney(rv)}</b>`,
                    rp == null ? '—' : `<b>${rp.toFixed(0)}%</b>`
                ];
            }

            const v = b - a;
            const indent = 'padding-left:' + (((s.level || 1) - 1) * 12) + 'px';
            return [
                this._rEsc(s.id),
                `<span style="${indent};display:inline-block">${this._rEsc(s.description)}</span>`,
                (parseFloat(s.qty) || 0) + ' ' + this._rEsc(s.unit || ''),
                this._rMoney(est), this._rMoney(b), this._rMoney(a),
                `<span class="${v < 0 ? 'rp-bad' : ''}">${this._rMoney(v)}</span>`,
                (parseFloat(s.progress) || 0).toFixed(0) + '%'
            ];
        });
        return this._rTable('Scope of Work and Budget',
            [{h:'Item'},{h:'Description'},{h:'Quantity'},{h:'Estimate',amt:true},
             {h:'Budget',amt:true},{h:'Actual',amt:true},{h:'Variance',amt:true},{h:'% Done',amt:true}],
            rows,
            ['TOTAL', '', '', this._rMoney(te), this._rMoney(tb), this._rMoney(ta),
             `<span class="${tb - ta < 0 ? 'rp-bad' : ''}">${this._rMoney(tb - ta)}</span>`,
             (p.totalProgress || 0).toFixed(1) + '%']);
    },

    /**
     * _rsGantt (v11 BATCH H5) - The timeline as a real chart on paper.
     *
     * Printed as ONE CONTINUOUS SVG, scaled so the whole project fits the
     * page width. The on-screen Gantt scrolls horizontally; a scrolling
     * chart printed as-is comes out truncated at the right edge, which is
     * exactly the "putol" problem. Fitting the span to the page means the
     * bars get shorter, never cut.
     *
     * Headings print as summary brackets, matching the screen.
     */
    _rsGantt(p) {
        const items = (p.sowItems || []).filter(s => s.startDate || s.endDate || s.isHeading);
        if (!items.length) return '';
        const day = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
            return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
        const diff = (a, b) => Math.round((b - a) / 86400000);

        const spanOf = it => {
            if (!it.isHeading) return [day(it.startDate), day(it.endDate)];
            const kids = items.filter(k => String(k.id).indexOf(String(it.id) + '.') === 0);
            const ss = [], ee = [];
            kids.concat([it]).forEach(k => {
                const a = day(k.startDate), b = day(k.endDate);
                if (a) ss.push(a.getTime()); if (b) ee.push(b.getTime());
            });
            return ss.length && ee.length
                ? [new Date(Math.min.apply(null, ss)), new Date(Math.max.apply(null, ee))] : [null, null];
        };

        const all = [];
        items.forEach(it => { const [a, b] = spanOf(it); if (a) all.push(a.getTime()); if (b) all.push(b.getTime()); });
        if (!all.length) return '';
        const min = new Date(Math.min.apply(null, all));
        const max = new Date(Math.max.apply(null, all));
        const total = Math.max(diff(min, max), 1);

        const LABEL = 190, W = 900, ROW = 15, PADT = 26;
        const trackW = W - LABEL - 8;
        const x = d => LABEL + (diff(min, d) / total) * trackW;
        const H = PADT + items.length * ROW + 8;
        const e = this._rEsc.bind(this);
        const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        // month ticks, so a bar's position means something
        let ticks = '';
        let c = new Date(min.getFullYear(), min.getMonth(), 1);
        while (c <= max) {
            const px = x(c < min ? min : c);
            ticks += `<line x1="${px}" y1="${PADT - 8}" x2="${px}" y2="${H - 4}" stroke="#E5E1D6"/>
                      <text x="${px + 2}" y="${PADT - 11}" font-size="7.5" fill="#5B6360">${MN[c.getMonth()]} ${String(c.getFullYear()).slice(2)}</text>`;
            c = new Date(c.getFullYear(), c.getMonth() + 1, 1);
        }

        const rows = items.map((it, i) => {
            const yy = PADT + i * ROW;
            const [a, b] = spanOf(it);
            const indent = ((it.level || 1) - 1) * 7;
            const label = `<text x="${2 + indent}" y="${yy + 8}" font-size="7.5"
                ${it.isHeading ? 'font-weight="700" fill="#24455A"' : 'fill="#1C2321"'}
                >${e(String(it.id))} ${e(String(it.description || '').slice(0, 30))}</text>`;
            if (!a || !b) return label;
            const bx = x(a), bw = Math.max(2, x(b) - x(a));
            if (it.isHeading) {
                return label + `<rect x="${bx}" y="${yy + 3}" width="${bw}" height="4" fill="#24455A"/>
                    <polygon points="${bx},${yy + 3} ${bx + 5},${yy + 3} ${bx},${yy + 11}" fill="#24455A"/>
                    <polygon points="${bx + bw},${yy + 3} ${bx + bw - 5},${yy + 3} ${bx + bw},${yy + 11}" fill="#24455A"/>`;
            }
            const pct = Math.min(Math.max(parseFloat(it.progress) || 0, 0), 100);
            const colour = pct >= 100 ? '#24455A' : pct > 0 ? '#2F7A46' : '#9aa4a0';
            return label + `<rect x="${bx}" y="${yy + 2}" width="${bw}" height="8" rx="2" fill="${colour}" opacity="0.35"/>
                <rect x="${bx}" y="${yy + 2}" width="${bw * pct / 100}" height="8" rx="2" fill="${colour}"/>`;
        }).join('');

        return `<section class="rp-sec rp-gantt"><h2>Timeline</h2>
            <svg viewBox="0 0 ${W} ${H}" class="rp-chart" role="img" aria-label="Project timeline">
                ${ticks}${rows}
            </svg>
            <p class="rp-note">Scaled to fit the page. Headings show as brackets spanning the items beneath them.</p>
        </section>`;
    },

    _rsSchedule(p) {
        const rows = (p.sowItems || []).filter(s => s.startDate || s.endDate).map(s => [
            this._rEsc(s.id), this._rEsc(s.description),
            this._rEsc(s.predecessors || '—'),
            this._rDate(s.startDate), this._rDate(s.endDate),
            s.isMilestone ? 'Milestone' : ((parseFloat(s.progress) || 0) >= 100 ? 'Complete' : (parseFloat(s.progress) || 0) > 0 ? 'In progress' : 'Not started')
        ]);
        return this._rTable('Schedule',
            [{h:'Item'},{h:'Description'},{h:'Predecessor'},{h:'Start'},{h:'Finish'},{h:'Status'}], rows);
    },

    _rsEstimates(p) {
        const groups = ((this._estimatesData || {}).groups) || [];
        let total = 0;
        const rows = groups.map(g => {
            const sum = ['materials','labor','equipment'].reduce((s, k) =>
                s + (g[k] || []).reduce((x, r) => x + (parseFloat(r.cost) || 0), 0), 0)
                + (g.indirect || []).reduce((x, r) => x + (parseFloat(r.amount) || 0), 0);
            total += sum;
            return [this._rEsc(g.sowId), this._rEsc(g.sowDescription), this._rEsc(g.status), this._rMoney(sum)];
        });
        return this._rTable('Estimate Summary',
            [{h:'SOW'},{h:'Description'},{h:'Status'},{h:'Estimate total',amt:true}],
            rows, ['TOTAL', '', '', this._rMoney(total)]);
    },

    _rsVariations(p) {
        const rows = (p.variationOrders || []).map(v => [
            this._rEsc(v.id), this._rEsc(v.sowId || '—'), this._rEsc(v.description),
            this._rEsc(v.status), this._rMoney(v.amount)
        ]);
        return this._rTable('Variation Orders',
            [{h:'VO'},{h:'SOW'},{h:'Description'},{h:'Status'},{h:'Amount',amt:true}], rows);
    },

    _rsBillings(p) {
        let g = 0, n = 0;
        const rows = (p.billings || []).map(b => {
            g += parseFloat(b.grossAmount) || 0;
            n += parseFloat(b.netAmount) || 0;
            return [
                this._rEsc(b.billingNo || b.id), this._rEsc(b.billingType || 'Progress'),
                this._rEsc(b.period || '—'), this._rEsc(b.status),
                this._rMoney(b.grossAmount), this._rMoney(b.retentionAmount),
                this._rMoney(b.dpRecoupment), this._rMoney(b.netAmount)
            ];
        });
        return this._rTable('Billing Register',
            [{h:'No.'},{h:'Type'},{h:'Period'},{h:'Status'},{h:'Gross',amt:true},{h:'Retention',amt:true},{h:'DP recoup',amt:true},{h:'Net',amt:true}],
            rows, ['TOTAL','','','', this._rMoney(g), '', '', this._rMoney(n)]);
    },

    _rsCash(p) {
        const rows = [];
        (p.cashAdvanceRequests || []).forEach(r => rows.push([
            'Advance', this._rEsc(r.id), this._rDate(r.createdAt),
            this._rEsc(r.requestor), this._rEsc(r.status), this._rMoney(r.amount)]));
        (p.cashReleases || []).forEach(r => rows.push([
            'Release', this._rEsc(r.id), this._rDate(r.createdAt),
            this._rEsc(r.requestor), this._rEsc(r.status), this._rMoney(r.amount)]));
        (p.liquidations || []).forEach(r => rows.push([
            'Liquidation', this._rEsc(r.id), this._rDate(r.createdAt),
            this._rEsc(r.requestor), this._rEsc(r.status), this._rMoney(r.amount)]));
        return this._rTable('Cash Requests',
            [{h:'Type'},{h:'Reference'},{h:'Date'},{h:'Requestor'},{h:'Status'},{h:'Amount',amt:true}], rows);
    },

    /**
     * _rsDailyDetailed (v11 BATCH H5) - The full record for every site
     * day, not a one-line summary.
     *
     * The summary table answers "which days did we work"; a client or an
     * auditor asking for daily records wants what was actually done. Both
     * are offered as separate sections so a long project can still print
     * the short version when that is all that is needed.
     */
    _rsDailyDetailed(p) {
        const recs = [...(p.dailyRecords || [])]
            .filter(r => String(r.status || '').toLowerCase() !== 'rejected')
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        if (!recs.length) return '';
        const e = this._rEsc.bind(this);
        const _t = (a, b) => (a || b) ? `${a || '?'}–${b || '?'}` : '';
        const sub = (title, rows, cols) => {
            if (!rows || !rows.length) return '';
            return `<div class="rp-sub">${e(title)}</div>
                <table class="rp-mini"><thead><tr>${cols.map(c =>
                    `<th style="text-align:${c[2] || 'left'}">${e(c[0])}</th>`).join('')}</tr></thead>
                <tbody>${rows.map(r => `<tr>${cols.map(c => {
                    const v = c[3] ? c[3](r[c[1]], r) : e(r[c[1]] || '—');
                    return `<td style="text-align:${c[2] || 'left'}">${v}</td>`;
                }).join('')}</tr></tbody>`).join('')}</tbody></table>`;
        };

        // ── v13: ONE DAY, ONE SHEET ──
        // These used to run together, so a fortnight of records printed
        // as one continuous block and a day could start halfway down a
        // page. A daily site report is filed, signed and sometimes sent
        // on its own — it has to be a document, not a paragraph.
        //
        // Each day now starts a new page and carries its own header
        // block: project, date, weather, prepared by. A sheet that turns
        // up on someone's desk on its own still says what it is.
        return `<section class="rp-sec rp-dsr"><h2>Daily Site Records</h2>
            ${recs.map(r => {
                const mp = r.manpower || [];
                const heads = mp.reduce((n, m) => n + (parseInt(m.count, 10) || 0), 0);
                const wa = r.workAccomplished || [];
                const photos = (r.photos || []).concat(wa.filter(w => w.image).map(w => ({
                    url: w.image, name: (w.scope || '') + ' ' + (w.pct || 0) + '%'
                })));
                return `<div class="rp-day rp-page">
                    <div class="rp-dsr-head">
                        <div class="rp-dsr-title">
                            <b>DAILY SITE REPORT</b>
                            <span>${e(p.name)}${p.location ? ' · ' + e(p.location) : ''}</span>
                        </div>
                        <div class="rp-dsr-meta">
                            <div><em>Date</em>${this._rDate(r.date)}</div>
                            <div><em>Weather AM / PM</em>${e(r.weatherAM) || '—'} / ${e(r.weatherPM) || '—'}</div>
                            <div><em>Manpower</em>${heads} worker(s)</div>
                            <div><em>Prepared by</em>${e(r.createdByName || r.createdBy || '—')}</div>
                        </div>
                    </div>
                    ${sub('Manpower', mp, [
                        ['Name', 'name', 'left', (v, x) => e(v || x.role || '—')],
                        ['Role', 'role'],
                        // v13.1: amIn/amOut, not am — see the approvals modal.
                        ['AM', 'amIn', 'center', (v, x) => e(_t(x.amIn, x.amOut))],
                        ['PM', 'pmIn', 'center', (v, x) => e(_t(x.pmIn, x.pmOut))],
                        ['OT', 'otIn', 'center', (v, x) => e(_t(x.otIn, x.otOut))],
                        ['Count', 'count', 'right', v => String(parseInt(v, 10) || 0)],
                        // driveImgSrc: a raw Drive link does not render in an
                        // <img>; it needs the direct-view form. The report
                        // was emitting the raw url, so the column was empty
                        // even once the signature reached it.
                        ['Signature', 'signature', 'center', v => v
                            ? `<img class="rp-sig" src="${driveImgSrc(v)}" alt="" onerror="this.style.display='none'" />`
                            : '']])}
                    ${sub('Equipment', r.equipment || [], [['Equipment', 'name', 'left', (v, x) => e(v || x.equipName || '—')],
                        ['Hours', 'hours', 'right'], ['Status', 'status']])}
                    ${sub('Work accomplished', wa, [['SOW', 'scope'], ['Location', 'location'],
                        ['Description', 'description', 'left', (v, x) => e(v || x.desc || '')],
                        ['%', 'pct', 'right', v => (parseFloat(v) || 0).toFixed(0) + '%']])}
                    ${sub('Materials delivered', r.materialsDelivered || [], [['Material', 'material'],
                        ['Qty', 'qty', 'right'], ['Unit', 'unit'], ['Supplier', 'supplier']])}
                    ${sub('Materials used', r.materialsUsed || [], [['Material', 'material'],
                        ['Qty', 'qty', 'right'], ['Unit', 'unit'], ['Used on', 'scope']])}
                    ${sub('Issues and delays', r.issues || [], [['Issue', 'description', 'left', (v, x) => e(v || x.issue || '')],
                        ['Hours lost', 'timeLost', 'right'], ['Action', 'action']])}
                    ${sub('Visitors', r.visitors || [], [['Name', 'name'], ['Company', 'company'], ['Purpose', 'purpose']])}
                    ${r.remarks ? `<div class="rp-sub">Remarks</div><p class="rp-rem">${e(r.remarks)}</p>` : ''}
                    ${photos.length ? `<div class="rp-sub">Photos</div>
                        <div class="rp-photos">${photos.slice(0, 8).map(ph => `
                            <figure><img src="${e(ph.url)}" alt="" onerror="this.parentNode.style.display='none'" />
                            <figcaption>${e(ph.name || '')}</figcaption></figure>`).join('')}</div>` : ''}
                    <div class="rp-sign">
                        <div><div class="ln"></div><span>Prepared by</span></div>
                        <div><div class="ln"></div><span>Checked by</span></div>
                        <div><div class="ln"></div><span>Approved by</span></div>
                    </div>
                </div>`;
            }).join('')}
        </section>`;
    },

    _rsDaily(p) {
        const recs = [...(p.dailyRecords || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
        const rows = recs.map(r => {
            const mp = (r.manpower || []).reduce((s, m) => s + (parseInt(m.count) || 0), 0);
            const sow = new Set((r.workAccomplished || []).map(w => w.scope).filter(Boolean));
            return [
                this._rDate(r.date),
                this._rEsc((r.weatherAM || '—') + ' / ' + (r.weatherPM || '—')),
                String(mp), String(sow.size),
                this._rEsc(Array.from(sow).join(', ') || '—'),
                this._rEsc(r.status)
            ];
        });
        return this._rTable('Daily Site Records',
            [{h:'Date'},{h:'Weather AM/PM'},{h:'Manpower',amt:true},{h:'SOW items',amt:true},{h:'Worked on'},{h:'Status'}], rows);
    },

    _rsManpower(p) {
        // Man-days by role, summed across every daily record. This is the
        // figure a client asks for and the one nobody wants to add up by
        // hand from sixty reports.
        const byRole = {};
        (p.dailyRecords || []).forEach(r => {
            (r.manpower || []).forEach(m => {
                const role = m.role || m.classification || 'Unspecified';
                byRole[role] = (byRole[role] || 0) + (parseInt(m.count) || 0);
            });
        });
        const keys = Object.keys(byRole).sort((a, b) => byRole[b] - byRole[a]);
        const total = keys.reduce((s, k) => s + byRole[k], 0);
        const rows = keys.map(k => [this._rEsc(k), String(byRole[k]),
            total ? (byRole[k] / total * 100).toFixed(1) + '%' : '—']);
        return this._rTable('Manpower Summary (man-days)',
            [{h:'Role / trade'},{h:'Man-days',amt:true},{h:'Share',amt:true}],
            rows, ['TOTAL', String(total), '100%']);
    },

    _rsEquipment(p) {
        const rows = (p.equipmentOnSite || []).map(e => [
            this._rEsc(e.name || e.equipName || e.brand), this._rEsc(e.model || '—'),
            this._rEsc(e.status || '—'), this._rDate(e.dateIn), this._rDate(e.dateOut)
        ]);
        return this._rTable('Equipment on Site',
            [{h:'Equipment'},{h:'Model'},{h:'Status'},{h:'Date in'},{h:'Date out'}], rows);
    },

    _rsMaterials(p) {
        // v11 BATCH H5: three inflows are reported separately — deliveries
        // logged in the daily reports, goods received against a purchase
        // order, and transfers in. Rolling them into one "received"
        // figure hides the double-count warning the site relies on.
        const n = v => fmtMoney(parseFloat(v) || 0);
        const rows = (p.siteMaterials || []).map(m => {
            const del = parseFloat(m.delivered) || 0;
            const po = parseFloat(m.receivedPO) || 0;
            const tin = parseFloat(m.transferredIn) || 0;
            const used = parseFloat(m.used) || 0;
            const tout = parseFloat(m.transferredOut) || 0;
            const onSite = parseFloat(m.remaining);
            return [
                this._rEsc(m.material || m.materialName) +
                    (m.possibleDuplicate ? ' <span class="rp-note">possible duplicate entry</span>' : ''),
                this._rEsc(m.unit || '—'),
                n(del), n(po), n(tin), n(used), n(tout),
                `<b>${n(isNaN(onSite) ? del + po + tin - used - tout : onSite)}</b>`
            ];
        });
        return this._rTable('Site Materials',
            [{h:'Material'},{h:'Unit'},{h:'Delivered',amt:true},{h:'Received on PO',amt:true},
             {h:'Transferred in',amt:true},{h:'Used',amt:true},{h:'Transferred out',amt:true},
             {h:'On site',amt:true}], rows);
    },

    _rsPunchlist(p) {
        const rows = (p.punchlist || []).map(i => [
            this._rEsc(i.id), this._rEsc(i.sowId || '—'), this._rEsc(i.description),
            this._rEsc(i.severity || '—'), this._rEsc(i.status), this._rDate(i.dateRaised)
        ]);
        return this._rTable('Punchlist',
            [{h:'Ref'},{h:'SOW'},{h:'Description'},{h:'Severity'},{h:'Status'},{h:'Raised'}], rows);
    },

    /**
     * _rsSafetyDetailed (v11 BATCH H5) - Every safety record in full,
     * with its photographs.
     *
     * A safety summary counts incidents. An audit asks what happened,
     * what was done about it, and shows the evidence — which is the one
     * place in this system where a photograph is not decoration.
     */
    _rsSafetyDetailed(p) {
        const recs = (p.safetyRecords || []).slice()
            .sort((a, b) => String(a.recordDate).localeCompare(String(b.recordDate)));
        if (!recs.length) return '';
        const e = this._rEsc.bind(this);
        return `<section class="rp-sec"><h2>Safety Records — full detail</h2>
            ${recs.map(r => {
                const pics = (r.attachments && r.attachments.length)
                    ? r.attachments
                    : (r.image ? [{ url: r.image, name: '' }] : []);
                return `<div class="rp-day">
                    <div class="rp-day-head">
                        <b>${this._rDate(r.recordDate)}</b>
                        <span>${e(r.recordType)}</span>
                        ${r.severity ? `<span>${e(r.severity)}</span>` : ''}
                        <span>${e(r.status)}</span>
                    </div>
                    <p class="rp-rem">${e(r.description)}</p>
                    ${r.personsInvolved ? `<div class="rp-sub">Persons involved</div>
                        <p class="rp-rem">${e(r.personsInvolved)}</p>` : ''}
                    ${r.actionTaken ? `<div class="rp-sub">Action taken</div>
                        <p class="rp-rem">${e(r.actionTaken)}</p>` : ''}
                    ${pics.length ? `<div class="rp-sub">Photographs</div>
                        <div class="rp-photos">${pics.map(ph => `
                            <figure><img src="${e(ph.url)}" alt="" onerror="this.parentNode.style.display='none'" />
                            <figcaption>${e(ph.name || '')}</figcaption></figure>`).join('')}</div>` : ''}
                </div>`;
            }).join('')}
        </section>`;
    },

    _rsSafety(p) {
        const recs = p.safetyRecords || [];
        const counts = {};
        recs.forEach(r => { counts[r.recordType] = (counts[r.recordType] || 0) + 1; });
        const tally = Object.keys(counts).map(k => `${this._rEsc(k)}: ${counts[k]}`).join('  ·  ');
        const rows = recs.map(r => [
            this._rDate(r.recordDate), this._rEsc(r.recordType),
            this._rEsc(r.description), this._rEsc(r.severity || '—'),
            this._rEsc(r.status), String((r.attachments || []).length)
        ]);
        const table = this._rTable('Safety Records',
            [{h:'Date'},{h:'Type'},{h:'Description'},{h:'Severity'},{h:'Status'},{h:'Photos',amt:true}], rows);
        return table ? table.replace('</h2>', `</h2><p class="rp-note" style="margin:0 0 6px;">${tally}</p>`) : '';
    },

    _rsDrawings(p) {
        const rows = (p.drawings || []).map(d => [
            this._rEsc(d.drawingNo || d.id), this._rEsc(d.title),
            this._rEsc(d.revision || '—'), this._rEsc(d.discipline || '—'),
            this._rDate(d.dateIssued)
        ]);
        return this._rTable('Drawings Register',
            [{h:'Drawing no.'},{h:'Title'},{h:'Rev'},{h:'Discipline'},{h:'Issued'}], rows);
    },

    // ─── the tab ────────────────────────────────────────────────

    renderReports(p) {
        const container = document.getElementById('proj-tab-reports');
        if (!container) return;

        const secs = this.REPORT_SECTIONS;
        const groups = [];
        secs.forEach(s => {
            let g = groups.find(x => x.name === s.group);
            if (!g) { g = { name: s.group, items: [] }; groups.push(g); }
            g.items.push(s);
        });

        // remembered per project, so re-printing the same monthly report
        // does not mean re-ticking twelve boxes every time
        const saved = this._reportPrefs && this._reportPrefs[this._currentProjectId];

        container.innerHTML = `
            <div class="section-head"><h2>Generate Report</h2><div class="rule"></div>
                <span class="badge" id="rp-count"></span></div>
            <p class="data-source-note" style="margin-bottom:14px;">
                Tick the sections to include, then build the report. It prints through your
                company print template, so the letterhead, signature blocks and paper size are
                whatever you set under Print Template. Sections with no data are skipped
                automatically.
            </p>

            <div class="rp-picker">
                ${groups.map(g => `
                    <div class="rp-group">
                        <div class="rp-group-head">
                            <span>${esc(g.name)}</span>
                            <button class="btn-sm" onclick="ProjectPage.reportToggleGroup('${esc(g.name)}')">Toggle all</button>
                        </div>
                        ${g.items.map(s => {
                            const on = saved ? saved.indexOf(s.id) > -1 : s.def;
                            return `<label class="rp-opt" data-group="${esc(g.name)}">
                                <input type="checkbox" id="rp-${s.id}" ${on ? 'checked' : ''} onchange="ProjectPage.reportCount()" />
                                <span><b>${esc(s.label)}</b><em>${s.sub}</em></span>
                            </label>`;
                        }).join('')}
                    </div>`).join('')}
            </div>

            <div class="rp-actions">
                <div class="field" style="max-width:260px;margin:0;">
                    <label>Report title</label>
                    <input type="text" id="rp-title" value="Project Report" />
                </div>
                <div class="field" style="max-width:260px;margin:0;">
                    <label>Period covered (optional)</label>
                    <input type="text" id="rp-period" placeholder="e.g. July 2026" />
                </div>
                <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
                    <button class="btn-primary" onclick="ProjectPage.buildReport()">${Icon.fileText({size:14})} Build report</button>
                    <button class="btn-sm" onclick="ProjectPage.reportSelectAll(true)">Select all</button>
                    <button class="btn-sm" onclick="ProjectPage.reportSelectAll(false)">Clear</button>
                </div>
            </div>`;

        this.reportCount();
    },

    reportCount() {
        const n = this.REPORT_SECTIONS.filter(s => document.getElementById('rp-' + s.id)?.checked).length;
        const badge = document.getElementById('rp-count');
        if (badge) badge.textContent = `${n} section${n === 1 ? '' : 's'} selected`;
    },

    reportSelectAll(on) {
        this.REPORT_SECTIONS.forEach(s => {
            const el = document.getElementById('rp-' + s.id);
            if (el) el.checked = on;
        });
        this.reportCount();
    },

    reportToggleGroup(group) {
        const boxes = Array.from(document.querySelectorAll(`.rp-opt[data-group="${group}"] input`));
        const allOn = boxes.every(b => b.checked);
        boxes.forEach(b => { b.checked = !allOn; });
        this.reportCount();
    },

    /**
     * buildReport - composes the ticked sections and opens a print-ready
     * document through PrintDoc.
     *
     * Sections that return '' (no data) are dropped BEFORE the document
     * is built, so a young project does not produce a report of empty
     * headings — and the user is told which ones were skipped rather than
     * left wondering why a box they ticked did not appear.
     */
    async buildReport() {
        const p = this._data;
        if (!p) { UI.toast('Project data is still loading.', 'error'); return; }

        const chosen = this.REPORT_SECTIONS.filter(s => document.getElementById('rp-' + s.id)?.checked);
        if (!chosen.length) { UI.toast('Tick at least one section to include.', 'error'); return; }

        // remember the selection for this project
        this._reportPrefs = this._reportPrefs || {};
        this._reportPrefs[this._currentProjectId] = chosen.map(s => s.id);

        const title = (document.getElementById('rp-title')?.value || 'Project Report').trim();
        const period = (document.getElementById('rp-period')?.value || '').trim();

        const rendered = [];
        const empty = [];
        chosen.forEach(s => {
            let html = '';
            try {
                html = s.render(p) || '';
            } catch (err) {
                // One broken section must not lose the whole report.
                console.error('Report section failed:', s.id, err);
                html = `<section class="rp-sec"><h2>${this._rEsc(s.label)}</h2>
                    <p class="rp-note">This section could not be built.</p></section>`;
            }
            if (html) rendered.push(html); else empty.push(s.label);
        });

        if (!rendered.length) {
            UI.toast('None of the selected sections have any data yet.', 'error');
            return;
        }

        await PrintDoc.load();
        const w = window.open('', '_blank');
        if (!w) { UI.toast('Allow pop-ups for this site to build the report.', 'error'); return; }

        const meta = [p.name, p.location, period].filter(Boolean).join(' · ');
        const contents = rendered.length > 2
            ? `<section class="rp-sec rp-toc"><h2>Contents</h2><ol>${
                chosen.filter(s => !empty.includes(s.label))
                      .map(s => `<li>${this._rEsc(s.label)}</li>`).join('')}</ol></section>`
            : '';

        w.document.write(PrintDoc.documentHTML({
            title: title,
            meta: meta,
            body: contents + rendered.join('') +
                (empty.length ? `<p class="rp-note" style="margin-top:18px;">
                    Not included — no data recorded yet: ${this._rEsc(empty.join(', '))}.</p>` : ''),
            css: `
                .rp-sec { margin: 0 0 22px; page-break-inside: avoid; }
                .rp-sec h2 { font-family:'Oswald',sans-serif; font-size:12.5px; text-transform:uppercase;
                    letter-spacing:.07em; color:var(--pd-accent); border-bottom:1px solid #D6D2C4;
                    padding-bottom:4px; margin:0 0 8px; }
                .rp-facts { display:grid; grid-template-columns:1fr 1fr; gap:2px 22px; }
                .rp-fact { display:flex; justify-content:space-between; gap:12px; padding:3px 0;
                    border-bottom:1px dotted #E5E1D6; font-size:11.5px; }
                .rp-fact span { color:#5B6360; }
                .rp-fact b { font-family:'IBM Plex Mono',monospace; text-align:right; }
                table { width:100%; border-collapse:collapse; font-size:10.5px; }
                th { background:#EEF1F3; text-transform:uppercase; font-size:8.5px; letter-spacing:.05em;
                    text-align:left; padding:5px 6px; border:1px solid #C9C5B8; }
                td { padding:4px 6px; border:1px solid #E5E1D6; }
                td.amt, th.amt { text-align:right; font-family:'IBM Plex Mono',monospace;
                    font-variant-numeric:tabular-nums; white-space:nowrap; }
                tfoot td { font-weight:700; background:#F6F4EC; }
                .rp-bad { color:#B23A2E; }
                .rp-note { font-size:10px; color:#5B6360; font-style:italic; }
                .rp-toc ol { font-size:11.5px; margin:0; padding-left:20px; column-count:2; }
                /* Keep a heading with at least the first rows of its table. */
                thead { display:table-header-group; }
                tr { page-break-inside:avoid; }

                /* v11 BATCH H5 — charts, daily detail and photographs */
                .rp-chart { width:100%; height:auto; display:block; }
                .rp-chartwrap { margin-top:10px; page-break-inside:avoid; }
                .rp-gantt { page-break-inside:auto; }
                .rp-head { color:var(--pd-accent); }
                /* A day's record is a unit — splitting one across a page
                   break makes it read as two half-days. */
                .rp-day { page-break-inside:avoid; margin:0 0 14px; padding:0 0 10px;
                    border-bottom:1px solid #E5E1D6; }
                .rp-day-head { display:flex; gap:14px; align-items:baseline; flex-wrap:wrap;
                    background:#F6F4EC; padding:4px 7px; font-size:11px; margin-bottom:6px; }
                .rp-day-head b { font-family:'IBM Plex Mono',monospace; }
                .rp-day-head span { color:#5B6360; font-size:10px; }
                .rp-sub { font-family:'IBM Plex Mono',monospace; font-size:8px; text-transform:uppercase;
                    letter-spacing:.08em; color:#5B6360; margin:6px 0 2px; }
                .rp-mini { width:100%; border-collapse:collapse; font-size:9.5px; }
                .rp-mini th { background:none; border:none; border-bottom:1px solid #E5E1D6;
                    padding:2px 4px; font-size:8px; color:#5B6360; text-transform:uppercase; }
                .rp-mini td { border:none; border-bottom:1px solid #F0EDE3; padding:2px 4px; }
                .rp-rem { font-size:10.5px; line-height:1.5; margin:0; white-space:pre-wrap; }
                .rp-photos { display:flex; flex-wrap:wrap; gap:6px; }
                .rp-photos figure { margin:0; width:31%; }
                .rp-photos img { width:100%; height:auto; max-height:52mm; object-fit:contain;
                    border:1px solid #D6D2C4; }
                .rp-photos figcaption { font-size:8px; color:#5B6360; text-align:center; margin-top:2px; }

                /* v13 — a daily site report is a SHEET, not a paragraph */
                .rp-page { page-break-before:always; page-break-inside:auto; padding-top:4mm; }
                .rp-dsr .rp-page:first-of-type { page-break-before:avoid; }
                .rp-dsr-head { border-bottom:2px solid var(--pd-accent); padding-bottom:6px; margin-bottom:10px; }
                .rp-dsr-title b { font-family:'Oswald',sans-serif; font-size:14px; letter-spacing:.09em; }
                .rp-dsr-title span { display:block; font-size:10.5px; color:#5B6360; margin-top:1px; }
                .rp-dsr-meta { display:flex; gap:26px; flex-wrap:wrap; margin-top:7px; font-size:11px; }
                .rp-dsr-meta em { display:block; font-style:normal; font-family:'IBM Plex Mono',monospace;
                    font-size:7.5px; letter-spacing:.12em; text-transform:uppercase; color:#5B6360; }
                /* Bounded so a wide signature cannot stretch the row. */
                .rp-sig { max-height:11mm; max-width:38mm; display:block; margin:0 auto; }
                .rp-sign { display:flex; gap:24px; margin-top:14mm; page-break-inside:avoid; }
                .rp-sign > div { flex:1; text-align:center; }
                .rp-sign .ln { border-bottom:1px solid #1C2321; height:9mm; }
                .rp-sign span { font-size:8px; text-transform:uppercase; letter-spacing:.08em;
                    color:#5B6360; display:block; margin-top:3px; }
            `
        }));
        w.document.close();
        setTimeout(() => { try { w.focus(); } catch (e) {} }, 250);

        UI.toast(`Report built with ${rendered.length} section${rendered.length === 1 ? '' : 's'}` +
            (empty.length ? ` — ${empty.length} skipped for having no data.` : '.'), 'success');
    }
});
