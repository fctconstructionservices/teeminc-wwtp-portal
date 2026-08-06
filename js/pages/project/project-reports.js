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
            { id: 'estimates', label: 'Estimate summary', sub: 'Approved estimate totals per SOW item', group: 'Scope', def: false,
              render: p => self._rsEstimates(p) },
            { id: 'variations', label: 'Variation orders', sub: 'Every VO with status and contract effect', group: 'Scope', def: false,
              render: p => self._rsVariations(p) },

            { id: 'billings', label: 'Billings', sub: 'Billing register with gross, retention, recoupment and net', group: 'Commercial', def: false,
              render: p => self._rsBillings(p) },
            { id: 'cashflow', label: 'Cash requests', sub: 'Cash advances, releases and liquidations', group: 'Commercial', def: false,
              render: p => self._rsCash(p) },

            { id: 'daily', label: 'Daily records', sub: 'One line per site day with manpower and weather', group: 'Site', def: false,
              render: p => self._rsDaily(p) },
            { id: 'manpower', label: 'Manpower summary', sub: 'Total man-days by role across the period', group: 'Site', def: false,
              render: p => self._rsManpower(p) },
            { id: 'equipment', label: 'Equipment on site', sub: 'Equipment assigned, with downtime if logged', group: 'Site', def: false,
              render: p => self._rsEquipment(p) },
            { id: 'materials', label: 'Site materials', sub: 'Materials received and consumed', group: 'Site', def: false,
              render: p => self._rsMaterials(p) },

            { id: 'punchlist', label: 'Punchlist', sub: 'Open and closed defects with rectification status', group: 'Quality & Safety', def: false,
              render: p => self._rsPunchlist(p) },
            { id: 'safety', label: 'Safety records', sub: 'Toolbox talks, inspections, incidents and near misses', group: 'Quality & Safety', def: false,
              render: p => self._rsSafety(p) },
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
            ['Revised contract value', this._rMoney(p.contractValueRevised)],
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

    _rsEVM(p) {
        const e = p.evm;
        if (!e || (!e.pv && !e.ev && !e.ac)) return '';
        const cpi = parseFloat(e.cpi) || 0, spi = parseFloat(e.spi) || 0;
        const read = (v, over, under) => v >= 1 ? over : under;
        return this._rFacts('Earned Value', [
            ['Planned value (PV)', this._rMoney(e.pv)],
            ['Earned value (EV)', this._rMoney(e.ev)],
            ['Actual cost (AC)', this._rMoney(e.ac)],
            ['Cost variance (EV − AC)', this._rMoney((e.ev || 0) - (e.ac || 0))],
            ['Schedule variance (EV − PV)', this._rMoney((e.ev || 0) - (e.pv || 0))],
            ['CPI', cpi.toFixed(2) + ` <span class="rp-note">${read(cpi, 'under budget', 'over budget')}</span>`],
            ['SPI', spi.toFixed(2) + ` <span class="rp-note">${read(spi, 'ahead of schedule', 'behind schedule')}</span>`]
        ]);
    },

    _rsSOW(p) {
        const items = p.sowItems || [];
        let tb = 0, ta = 0;
        const rows = items.map(s => {
            const b = parseFloat(s.budget) || 0, a = parseFloat(s.actual) || 0;
            tb += b; ta += a;
            const v = b - a;
            return [
                this._rEsc(s.id), this._rEsc(s.description),
                (parseFloat(s.qty) || 0) + ' ' + this._rEsc(s.unit || ''),
                this._rMoney(b), this._rMoney(a),
                `<span class="${v < 0 ? 'rp-bad' : ''}">${this._rMoney(v)}</span>`,
                (parseFloat(s.progress) || 0).toFixed(0) + '%'
            ];
        });
        return this._rTable('Scope of Work and Budget',
            [{h:'Item'},{h:'Description'},{h:'Quantity'},{h:'Budget',amt:true},{h:'Actual',amt:true},{h:'Variance',amt:true},{h:'% Done',amt:true}],
            rows,
            ['TOTAL', '', '', this._rMoney(tb), this._rMoney(ta),
             `<span class="${tb - ta < 0 ? 'rp-bad' : ''}">${this._rMoney(tb - ta)}</span>`,
             (p.totalProgress || 0).toFixed(1) + '%']);
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
        const rows = (p.siteMaterials || []).map(m => [
            this._rEsc(m.materialName || m.material), this._rEsc(m.unit || '—'),
            String(parseFloat(m.received) || 0), String(parseFloat(m.used) || 0),
            String((parseFloat(m.received) || 0) - (parseFloat(m.used) || 0))
        ]);
        return this._rTable('Site Materials',
            [{h:'Material'},{h:'Unit'},{h:'Received',amt:true},{h:'Used',amt:true},{h:'Balance',amt:true}], rows);
    },

    _rsPunchlist(p) {
        const rows = (p.punchlist || []).map(i => [
            this._rEsc(i.id), this._rEsc(i.sowId || '—'), this._rEsc(i.description),
            this._rEsc(i.severity || '—'), this._rEsc(i.status), this._rDate(i.dateRaised)
        ]);
        return this._rTable('Punchlist',
            [{h:'Ref'},{h:'SOW'},{h:'Description'},{h:'Severity'},{h:'Status'},{h:'Raised'}], rows);
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
                            <span>${g.name}</span>
                            <button class="btn-sm" onclick="ProjectPage.reportToggleGroup('${g.name}')">Toggle all</button>
                        </div>
                        ${g.items.map(s => {
                            const on = saved ? saved.indexOf(s.id) > -1 : s.def;
                            return `<label class="rp-opt" data-group="${g.name}">
                                <input type="checkbox" id="rp-${s.id}" ${on ? 'checked' : ''} onchange="ProjectPage.reportCount()" />
                                <span><b>${s.label}</b><em>${s.sub}</em></span>
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
            `
        }));
        w.document.close();
        setTimeout(() => { try { w.focus(); } catch (e) {} }, 250);

        UI.toast(`Report built with ${rendered.length} section${rendered.length === 1 ? '' : 's'}` +
            (empty.length ? ` — ${empty.length} skipped for having no data.` : '.'), 'success');
    }
});
