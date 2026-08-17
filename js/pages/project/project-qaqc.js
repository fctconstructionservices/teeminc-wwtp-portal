// ================================================================
//  pages/project/project-qaqc.js — Quality assurance and control.
//                                   (v21)
//
//  ── WHY THIS REPLACED "PUNCHLIST" ───────────────────────────
//
//  A punchlist is ONE QA/QC record among several. Naming the whole
//  discipline after one of its outputs is why the others had nowhere to
//  live: an inspection request, a non-conformance report and a
//  concrete cylinder result are all quality records, and none of them
//  is a punch item.
//
//  So the tab is QA/QC, and the punchlist sits inside it alongside its
//  siblings. Nothing about the punchlist itself changes — the same
//  data, the same before-and-after photo proof, the same reports.
//
//  ── THE THREE THAT WERE MISSING ─────────────────────────────
//
//  · INSPECTION REQUEST — you ask the client or consultant to inspect
//    before covering work up. The date they responded, and whether they
//    passed it, is the record that settles "we were never told".
//
//  · NON-CONFORMANCE — work that does not meet spec, raised formally,
//    with a disposition: rework, repair, use-as-is, or reject. A
//    punchlist item is a snag; an NCR is a contractual event.
//
//  · TEST RESULT — concrete cylinders, compaction, weld tests. Nothing
//    in the system held these, so they lived in a folder and were
//    produced from memory when a client asked.
// ================================================================

Object.assign(ProjectPage, {

    _qaqcTab: 'punchlist',

    QAQC_TABS: [
        { id: 'punchlist', label: 'Punchlist' },
        { id: 'inspection', label: 'Inspection requests' },
        { id: 'ncr', label: 'Non-conformance' },
        { id: 'test', label: 'Test results' }
    ],

    renderQaqc(p) {
        const host = document.getElementById('proj-tab-qaqc');
        if (!host) return;

        const counts = this._qaqcCounts(p);

        host.innerHTML = `
            <div class="qa-head">
                <div>
                    <h3>Quality assurance &amp; control</h3>
                    <p>Punch items, inspection requests, non-conformances and test results.
                    Together these are what you produce when a client asks how quality was
                    controlled — separately, none of them answers it.</p>
                </div>
            </div>

            <div class="qa-tabs">
                ${this.QAQC_TABS.map(t => `
                    <button class="${t.id === this._qaqcTab ? 'is-on' : ''}"
                            onclick="ProjectPage.switchQaqc('${t.id}')">
                        ${t.label}${counts[t.id] ? `<span>${counts[t.id]}</span>` : ''}
                    </button>`).join('')}
            </div>

            <div id="qa-body"></div>`;

        this._paintQaqcBody(p);
    },

    _qaqcCounts(p) {
        const open = (p.punchlist || []).filter(i => i.status === 'Open').length;
        const q = p.qaqc || {};
        return {
            punchlist: open,
            // Only the ones still awaiting a response — a closed record
            // is history, and a badge counting history is a badge people
            // stop reading.
            inspection: (q.inspections || []).filter(x => x.status === 'Requested').length,
            ncr: (q.ncrs || []).filter(x => x.status === 'Open').length,
            test: (q.tests || []).filter(x => x.result === 'Fail').length
        };
    },

    switchQaqc(tab) {
        this._qaqcTab = tab;
        this.renderQaqc(this._data);
    },

    _paintQaqcBody(p) {
        const body = document.getElementById('qa-body');
        if (!body) return;

        if (this._qaqcTab === 'punchlist') {
            // The punchlist renderer writes into its own container id, so
            // it is given one here. Rewriting it to take an element would
            // risk the before/after photo proof for no benefit.
            body.innerHTML = '<div id="proj-tab-punchlist"></div>';
            this.renderPunchlist(p);
            return;
        }

        const q = p.qaqc || {};
        if (this._qaqcTab === 'inspection') return this._paintInspections(body, q.inspections || []);
        if (this._qaqcTab === 'ncr') return this._paintNcrs(body, q.ncrs || []);
        if (this._qaqcTab === 'test') return this._paintTests(body, q.tests || []);
    },

    // ─── inspection requests ─────────────────────────────────

    _paintInspections(body, rows) {
        const canEdit = this._canEdit !== false;
        body.innerHTML = `
            <div class="qa-bar">
                <p>Ask the client or consultant to inspect before work is covered up. The date they
                responded — or did not — is what settles “we were never told”.</p>
                ${canEdit ? `<button class="btn-primary" onclick="ProjectPage.openQaForm('inspection')">
                    + Request an inspection</button>` : ''}
            </div>
            ${rows.length ? `<div class="panel" style="padding:0;"><div class="scroll-x">
                <table class="qa-table">
                    <thead><tr><th>Ref</th><th>Scope</th><th>What</th>
                        <th>Requested</th><th>Required by</th><th>Inspected</th><th>Result</th></tr></thead>
                    <tbody>${rows.map(r => `<tr>
                        <td class="mono">${esc(r.id)}</td>
                        <td class="mono">${esc(r.sowId) || '—'}</td>
                        <td>${esc(r.description)}</td>
                        <td class="mono">${esc(r.requestedDate)}</td>
                        <td class="mono">${esc(r.requiredDate) || '—'}</td>
                        <td class="mono">${esc(r.inspectedDate) || '—'}</td>
                        <td>${this._qaPill(r.status)}</td>
                    </tr>`).join('')}</tbody>
                </table></div></div>`
            : this._qaEmpty('No inspection requests yet.')}`;
    },

    // ─── non-conformance ─────────────────────────────────────

    _paintNcrs(body, rows) {
        const canEdit = this._canEdit !== false;
        body.innerHTML = `
            <div class="qa-bar">
                <p>Work that does not meet specification, raised formally. A punch item is a snag;
                an NCR is a contractual event, and it carries a disposition — rework, repair,
                use-as-is or reject.</p>
                ${canEdit ? `<button class="btn-primary" onclick="ProjectPage.openQaForm('ncr')">
                    + Raise an NCR</button>` : ''}
            </div>
            ${rows.length ? `<div class="panel" style="padding:0;"><div class="scroll-x">
                <table class="qa-table">
                    <thead><tr><th>Ref</th><th>Scope</th><th>What is wrong</th>
                        <th>Raised</th><th>Disposition</th><th>Closed</th><th>Status</th></tr></thead>
                    <tbody>${rows.map(r => `<tr>
                        <td class="mono">${esc(r.id)}</td>
                        <td class="mono">${esc(r.sowId) || '—'}</td>
                        <td>${esc(r.description)}
                            ${r.rootCause ? `<div class="muted">Cause: ${esc(r.rootCause)}</div>` : ''}</td>
                        <td class="mono">${esc(r.raisedDate)}</td>
                        <td>${esc(r.disposition) || '<span class="muted">not decided</span>'}</td>
                        <td class="mono">${esc(r.closedDate) || '—'}</td>
                        <td>${this._qaPill(r.status)}</td>
                    </tr>`).join('')}</tbody>
                </table></div></div>`
            : this._qaEmpty('No non-conformances raised.')}`;
    },

    // ─── test results ────────────────────────────────────────

    _paintTests(body, rows) {
        const canEdit = this._canEdit !== false;
        body.innerHTML = `
            <div class="qa-bar">
                <p>Concrete cylinders, compaction, weld tests. Recorded here rather than in a
                folder, so a failed result is visible on the project rather than produced from
                memory when a client asks.</p>
                ${canEdit ? `<button class="btn-primary" onclick="ProjectPage.openQaForm('test')">
                    + Record a test</button>` : ''}
            </div>
            ${rows.length ? `<div class="panel" style="padding:0;"><div class="scroll-x">
                <table class="qa-table">
                    <thead><tr><th>Ref</th><th>Type</th><th>Scope</th><th>Sample</th>
                        <th>Tested</th><th class="num">Result</th><th class="num">Required</th>
                        <th>Outcome</th></tr></thead>
                    <tbody>${rows.map(r => `<tr class="${r.result === 'Fail' ? 'is-fail' : ''}">
                        <td class="mono">${esc(r.id)}</td>
                        <td>${esc(r.testType)}</td>
                        <td class="mono">${esc(r.sowId) || '—'}</td>
                        <td>${esc(r.sampleRef) || '—'}</td>
                        <td class="mono">${esc(r.testDate)}</td>
                        <td class="num">${esc(r.value)} ${esc(r.unit)}</td>
                        <td class="num">${esc(r.requiredValue) || '—'}</td>
                        <td>${this._qaPill(r.result)}</td>
                    </tr>`).join('')}</tbody>
                </table></div></div>`
            : this._qaEmpty('No test results recorded.')}`;
    },

    _qaEmpty(msg) {
        return `<div class="qa-empty"><p>${esc(msg)}</p></div>`;
    },

    _qaPill(v) {
        const s = String(v || '');
        const cls = {
            Pass: 'g', Closed: 'g', Inspected: 'g',
            Fail: 'd', Open: 'd', Rejected: 'd',
            Requested: 'a', Pending: 'a'
        }[s] || 'n';
        return `<span class="qa-pill ${cls}">${esc(s) || '—'}</span>`;
    },

    // ─── the form ────────────────────────────────────────────

    openQaForm(kind) {
        const p = this._data || {};
        const today = new Date().toISOString().slice(0, 10);
        const sows = (p.sowItems || []).filter(s => !s.isHeading && !s.isMilestone);

        const titles = { inspection: 'Request an inspection', ncr: 'Raise a non-conformance',
                         test: 'Record a test result' };

        document.getElementById('qaModal')?.remove();
        const m = document.createElement('div');
        m.className = 'print-modal-overlay open';
        m.id = 'qaModal';
        m.innerHTML = `
            <div class="print-modal-content" style="max-width:520px;">
                <button class="close-modal" onclick="document.getElementById('qaModal').remove()">${Icon.close({ size: 18 })}</button>
                <div class="print-header"><h2>${esc(titles[kind])}</h2>
                    <div class="print-meta">${esc(p.name || '')}</div></div>

                <div class="field"><label>Scope of work</label>
                    <select id="qa-sow">
                        <option value="">Not tied to one item</option>
                        ${sows.map(s => `<option value="${esc(s.id)}">${esc(s.id)} — ${esc(s.description)}</option>`).join('')}
                    </select></div>

                ${kind === 'test' ? `
                    <div class="db-form-grid">
                        <div class="field"><label>Test type *</label>
                            <select id="qa-type">
                                <option>Concrete cylinder</option><option>Slump</option>
                                <option>Compaction</option><option>Weld — visual</option>
                                <option>Weld — NDT</option><option>Liner seam</option>
                                <option>Other</option>
                            </select></div>
                        <div class="field"><label>Sample reference</label>
                            <input type="text" id="qa-sample" placeholder="e.g. CYL-2026-034" /></div>
                    </div>
                    <div class="db-form-grid">
                        <div class="field"><label>Result *</label>
                            <input type="text" id="qa-value" placeholder="e.g. 28.4" /></div>
                        <div class="field"><label>Unit</label>
                            <input type="text" id="qa-unit" placeholder="MPa" /></div>
                    </div>
                    <div class="db-form-grid">
                        <div class="field"><label>Required</label>
                            <input type="text" id="qa-req" placeholder="e.g. 24.0" /></div>
                        <div class="field"><label>Date tested *</label>
                            <input type="date" id="qa-date" value="${today}" /></div>
                    </div>
                    <div class="field"><label>Outcome *</label>
                        <select id="qa-result"><option>Pass</option><option>Fail</option></select></div>`
                : `
                    <div class="field"><label>${kind === 'ncr' ? 'What is wrong *' : 'What needs inspecting *'}</label>
                        <textarea id="qa-desc" rows="2"></textarea></div>
                    <div class="db-form-grid">
                        <div class="field"><label>${kind === 'ncr' ? 'Date raised *' : 'Date requested *'}</label>
                            <input type="date" id="qa-date" value="${today}" /></div>
                        <div class="field"><label>${kind === 'ncr' ? 'Disposition' : 'Required by'}</label>
                            ${kind === 'ncr'
                                ? `<select id="qa-disp"><option value="">Not decided yet</option>
                                    <option>Rework</option><option>Repair</option>
                                    <option>Use as is</option><option>Reject</option></select>`
                                : `<input type="date" id="qa-req" />`}</div>
                    </div>
                    ${kind === 'ncr' ? `<div class="field"><label>Root cause</label>
                        <input type="text" id="qa-cause" placeholder="Why it happened — not who" /></div>` : ''}`}

                <div class="field"><label>Photo or document</label>
                    <div class="file-drop"><input type="file" id="qa-file" /></div></div>

                <div class="print-actions">
                    <button class="btn-primary" onclick="ProjectPage.saveQa('${kind}', this)">Save</button>
                    <button class="btn-ghost" onclick="document.getElementById('qaModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(m);
    },

    async saveQa(kind, btn) {
        const v = id => (document.getElementById(id)?.value || '').trim();
        const file = document.getElementById('qa-file')?.files?.[0];

        // Captured BEFORE the modal is removed — reading a field out of a
        // detached element returns nothing, which is what produced the
        // calendar's "Invalid Date".
        const data = {
            projectId: this._currentProjectId, kind: kind,
            sowId: v('qa-sow'), date: v('qa-date'),
            description: v('qa-desc'), disposition: v('qa-disp'),
            rootCause: v('qa-cause'), requiredDate: v('qa-req'),
            testType: v('qa-type'), sampleRef: v('qa-sample'),
            value: v('qa-value'), unit: v('qa-unit'),
            requiredValue: v('qa-req'), result: v('qa-result')
        };

        if (kind === 'test') {
            if (!data.value) { UI.toast('Enter the test result.', 'error'); return; }
        } else if (!data.description) {
            UI.toast('Describe it.', 'error'); return;
        }
        if (!data.date) { UI.toast('Pick a date.', 'error'); return; }

        await Busy.run(btn, 'Saving', async () => {
            try {
                if (file) {
                    data.fileBase64 = await fileToBase64_(file);
                    data.fileName = file.name;
                    data.fileMime = file.type;
                }
                await DataService.saveQaqcRecord(data);
                document.getElementById('qaModal')?.remove();
                UI.toast('Saved.', 'success');
                await this.open(this._currentProjectId, true);
                this.switchTab('qaqc');
            } catch (err) { UI.toast('' + err.message, 'error'); }
        });
    }
});
