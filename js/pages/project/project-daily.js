// ================================================================
//  pages/project/project-daily.js — Daily Records + Photos tabs
//
//  PURPOSE: Extends ProjectPage with the daily site record form
//  (dynamic manpower/equipment/work/materials/issues/visitors rows,
//  photo previews), the record list with role-based approval buttons
//  (creator cannot approve own; superadmin can force), and the
//  Photos tab which aggregates every image from all daily records.
// ================================================================

Object.assign(ProjectPage, {

    _buildDailyFormHTML() {
        const projectName = this._data ? this._data.name : 'Project';
        const user = App.getUser();
        const preparedBy = user ? user.name : 'Unknown User';
        const today = new Date().toISOString().split('T')[0];

        return `
            <div class="daily-form-header" style="background:var(--blueprint);color:#fff;padding:12px 16px;border-radius:var(--radius) var(--radius) 0 0;margin:-16px -16px 16px -16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
                    <div>
                        <div style="font-family:'Oswald',sans-serif;font-size:16px;text-transform:uppercase;letter-spacing:0.05em;">FCTC Site Operations Board</div>
                        <div style="font-size:11px;opacity:0.8;">Daily Site Record</div>
                    </div>
                    <div style="text-align:right;font-size:12px;">
                        <div><strong>Project:</strong> ${projectName}</div>
                        <div><strong>Prepared By:</strong> ${preparedBy}</div>
                    </div>
                </div>
            </div>
            <div id="dailyStepBar" class="daily-step-bar" hidden>
                <div class="dsb-track" id="dsbTrack"></div>
                <div class="dsb-head">
                    <span class="dsb-title" id="dsbTitle"></span>
                    <span class="dsb-count" id="dsbCount"></span>
                </div>
            </div>
            <!-- v11 BATCH H4: the header block is laid out as the PRINTED
                 form's header — one row of boxed fields — rather than as
                 another labelled panel. Someone filling this in usually has
                 the paper form in front of them, and a form is a grid. -->
            ${this._dailyDataLists()}
            <div class="dr-formhead">
                <div class="cell"><label>Date *</label>
                    <input type="date" id="dr-date" value="${today}" required onchange="ProjectPage.syncOTLock()" /></div>
                <div class="cell"><label>Weather AM</label>
                    <input type="text" id="dr-weather-am" placeholder="e.g. Sunny" /></div>
                <div class="cell"><label>Weather PM</label>
                    <input type="text" id="dr-weather-pm" placeholder="e.g. Cloudy" /></div>
                <div class="cell"><label>Prepared by</label>
                    <input type="text" value="${(App.getUser() || {}).name || ''}" readonly /></div>
            </div>
            <div class="daily-form-section" id="manpowerSection">
                <div class="section-label">Manpower — Attendance <span class="rule"></span><span style="font-weight:400;font-size:10px;color:var(--ink-soft);" id="manpowerTotal">Total: 0</span></div>
                <div id="otStatusBar" style="margin:0 0 8px;font-size:11px;"></div>
                <div id="manpowerEntries">${this._manpowerRowHTML()}</div>
                <div class="add-btn-row" style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn-sm primary" onclick="ProjectPage.addEntry('manpower')">+ Add Person</button>
                    <button class="btn-sm amber" id="btnRequestOT" onclick="ProjectPage.openOTModal()">${Icon.timer({size:13})} Request OT</button>
                </div>
                <div class="manpower-total" id="manpowerTotalDisplay">Total: 0</div>
                <div class="muted" style="font-size:10.5px;color:var(--ink-soft);margin-top:4px;">Select a person from the Personnel database and the trade fills in automatically. OT in and out stay locked until an approved OT request exists for this date.</div>
            </div>
            <div class="daily-form-section" id="equipmentSection">
                <div class="section-label">Equipment on Site <span class="rule"></span></div>
                <div id="equipmentEntries"><div class="entry-row"><div class="field"><label>Equipment</label><input type="text" class="eq-name" list="dl-equipment" autocomplete="off" placeholder="Type or pick" /></div><div class="field"><label>Qty</label><input type="number" class="eq-qty" placeholder="1" min="0" /></div><div class="field"><label>Status</label><select class="eq-status"><option>Operational</option><option>Idle</option><option>Under Repair</option><option>Breakdown</option><option>Standby</option></select></div><div class="field"><label>Remarks</label><input type="text" class="eq-remarks" placeholder="Optional" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'equipment')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('equipment')">+ Add Equipment</button></div>
            </div>
            <div class="daily-form-section" id="workSection">
                <div class="section-label">Work Accomplished <span class="rule"></span></div>
                <div id="workEntries"><div class="entry-row" style="display:block;border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--bg);">
                    <div style="display:grid;grid-template-columns:2fr 90px 30px;gap:8px;align-items:end;">
                        <div class="field"><label>1 · Which SOW item was worked on? *</label><select class="wk-scope">${this._sowOptions()}</select></div>
                        <div class="field"><label>2 · % Complete</label><input type="number" class="wk-pct" min="0" max="100" placeholder="0-100" /></div>
                        <button class="btn-sm danger" style="margin-bottom:6px;" onclick="ProjectPage.removeEntry(this,'work')">${Icon.close({size:12})}</button>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:6px;">
                        <div class="field"><label>3 · Location on site</label><input type="text" class="wk-location" placeholder="e.g. NF2 Cell 2" /></div>
                        <div class="field"><label>4 · What was done</label><input type="text" class="wk-desc" placeholder="e.g. Liner welding, 3 panels completed" /></div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:6px;">
                        <div class="field"><label>5 · Photo (proof of work)</label><input type="file" accept="image/*" class="wk-image" data-photo onchange="ProjectPage.previewSmallImage(this,'wk-preview-${Date.now()}')" /></div>
                    </div>
                </div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('work')">+ Add Work Item</button></div>
                <div class="muted" style="font-size:10.5px;color:var(--ink-soft);margin-top:4px;">Work through the steps in order: SOW, then percent, location, what was done, and a photo. The percent complete entered here drives project progress and billings.</div>
            </div>
            <div class="daily-form-section" id="materialsSection">
                <div class="section-label">Materials Delivered <span class="rule"></span></div>
                <div id="materialsEntries"><div class="entry-row"><div class="field"><label>Material</label><input type="text" class="mat-name" list="dl-materials" autocomplete="off" placeholder="Type or pick" oninput="ProjectPage.syncMaterialUnit(this)" onchange="ProjectPage.syncMaterialUnit(this)" /></div><div class="field"><label>Qty</label><input type="number" class="mat-qty" min="0" /></div><div class="field"><label>Unit</label><input type="text" class="mat-unit" placeholder="Type or auto" title="Filled from the material database when the name matches; type it when it does not" /></div><div class="field"><label>Supplier / DR No.</label><input type="text" class="mat-supplier" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'materials')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('materials')">+ Add Material</button></div>
            </div>
            <div class="daily-form-section" id="materialsUsedSection">
                <div class="section-label">Materials Used <span class="rule"></span></div>
                <div id="materialsUsedEntries"><div class="entry-row"><div class="field"><label>Material (on-site only)</label><select class="mu-name" onchange="ProjectPage.syncUsedMaterialUnit(this)">${this._siteMaterialOptionsDaily()}</select></div><div class="field"><label>Qty Used</label><input type="number" class="mu-qty" min="0" /></div><div class="field"><label>Unit</label><input type="text" class="mu-unit" readonly placeholder="auto" /></div><div class="field"><label>Used For (SOW)</label><select class="mu-sow">${this._sowOptions()}</select></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'materialsUsed')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('materialsUsed')">+ Add Usage</button></div>
                <div class="muted" style="font-size:11px;color:var(--ink-soft);margin-top:4px;">Deducted from site stock (delivered - used). You cannot log more than the quantity remaining.</div>
            </div>
            <div class="daily-form-section" id="issuesSection">
                <div class="section-label">Issues / Delays <span class="rule"></span></div>
                <div id="issuesEntries"><div class="entry-row"><div class="field"><label>Description</label><input type="text" class="iss-desc" /></div><div class="field"><label>Cause</label><input type="text" class="iss-cause" /></div><div class="field"><label>Time Lost (hrs)</label><input type="number" class="iss-time" min="0" step="0.5" /></div><div class="field"><label>Photo</label><input type="file" accept="image/*" class="iss-image" data-photo onchange="ProjectPage.previewSmallImage(this,'iss-preview-${Date.now()}')" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'issues')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('issues')">+ Add Issue</button></div>
            </div>
            <div class="daily-form-section" id="visitorsSection">
                <div class="section-label">Visitors <span class="rule"></span></div>
                <div id="visitorsEntries"><div class="entry-row"><div class="field"><label>Name</label><input type="text" class="vis-name" /></div><div class="field"><label>Company / Role</label><input type="text" class="vis-company" /></div><div class="field"><label>Purpose</label><input type="text" class="vis-purpose" /></div><div class="field"><label>Time In</label><input type="time" class="vis-time-in" /></div><div class="field"><label>Time Out</label><input type="time" class="vis-time-out" /></div><div class="field"><label>Remarks</label><input type="text" class="vis-remarks" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'visitors')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('visitors')">+ Add Visitor</button></div>
            </div>
            <div class="daily-form-section" id="photosSection">
                <div class="section-label">Additional Photos <span class="rule"></span></div>
                <div id="photosEntries"><div class="entry-row"><div class="field"><label>Photo</label><input type="file" accept="image/*" class="photo-input" data-photo onchange="ProjectPage.previewSmallImage(this,'photo-preview-${Date.now()}')" /></div><div class="field"><label>Caption</label><input type="text" class="photo-caption" placeholder="e.g. Liner welding at NF2 cell 2" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'photos')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('photos')">+ Add Photo</button></div>
            </div>
            <!-- v11 BATCH I2: the signature blocks are gone from the ENTRY
                 form. Nobody signs a screen, and they took up space on a
                 form people fill in on a phone. They still belong on the
                 printed record, where they are lines that get signed —
                 the print template's signature blocks handle that. -->
            <div class="submit-row" id="dailyStepNav" hidden>
                <button class="btn-ghost" id="dsbPrev" onclick="ProjectPage.dailyStep(-1)">← Back</button>
                <button class="btn-primary" id="dsbNext" onclick="ProjectPage.dailyStep(1)">Next →</button>
            </div>
            <div class="submit-row" id="dailySubmitRow">
                <button class="btn-primary" onclick="ProjectPage.submitDailyRecord('${this._currentProjectId || ''}')">Save Record (Draft)</button>
                <button class="btn-ghost" onclick="ProjectPage.toggleAddRecord()">Cancel</button>
            </div>
        `;
    },

    /**
     * v3 dropdown builders — every list feeds from its approved
     * database so daily reports use consistent, analyzable values
     * (the Gantt progress rollup depends on scope === SOW id).
     */
    /**
     * _sowOptions (v11 BATCH H5) - The SOW dropdown as a tree.
     *
     * Headings become <optgroup> labels, so they read as headings and —
     * more importantly — CANNOT BE SELECTED. Work is never accomplished
     * against a title; it is accomplished against the items beneath it.
     * Allowing one to be picked would put progress on a row whose
     * progress is supposed to be the roll-up of its children.
     *
     * Items nested deeper are indented with figure spaces, because a
     * <select> strips leading whitespace and CSS padding does not reach
     * inside an <option> in most browsers.
     */
    _sowOptions() {
        const items = this._sowItems || [];
        const esc = v => String(v || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const PAD = '\u2007\u2007';   // figure space — survives inside <option>
        let html = '<option value="">Select SOW...</option>';
        let open = false;

        items.forEach(s => {
            if (s.isHeading) {
                if (open) html += '</optgroup>';
                html += `<optgroup label="${esc(s.id)} — ${esc(s.description)}">`;
                open = true;
                return;
            }
            const indent = PAD.repeat(Math.max(0, (s.level || 1) - 1));
            html += `<option value="${esc(s.id)}">${indent}${esc(s.id)} — ${esc(s.description)}</option>`;
        });
        if (open) html += '</optgroup>';
        return html;
    },
    /**
     * ── v11 BATCH I2: TYPE OR PICK ──
     *
     * These three fields were <select> only. That is wrong for a site
     * form: the person filling it in is copying from paper, and the name
     * or material in front of them is often not in the database yet —
     * a new hire, a one-off delivery, a substitute item. A dropdown with
     * no match leaves them with nowhere to put it, so either the record
     * is wrong or it does not get entered at all.
     *
     * A datalist gives both: the catalogue is offered as you type, and
     * anything not on it can still be typed. What is in the database is
     * a convenience, not a gate.
     */
    _dataList(id, values) {
        const seen = {};
        const opts = (values || []).filter(v => {
            const k = String(v || '').trim().toLowerCase();
            if (!k || seen[k]) return false;
            seen[k] = true;
            return true;
        }).map(v => `<option value="${String(v).replace(/"/g, '&quot;')}"></option>`).join('');
        return `<datalist id="${id}">${opts}</datalist>`;
    },

    _dailyDataLists() {
        const d = this._data || {};
        return this._dataList('dl-personnel', ((d.personnel) || []).map(p => p.name)) +
               this._dataList('dl-roles', ((d.personnel) || []).map(p => p.role)) +
               this._dataList('dl-equipment', (this._approvedEquipment || [])
                    .map(e => [e.brand, e.model].filter(Boolean).join(' ') || e.name || e.category)) +
               this._dataList('dl-materials', (this._approvedMaterials || [])
                    .map(m => m.name || m.desc));
    },

    /**
     * _personnelUnit (v11 BATCH I2) - Name typed or picked → role filled
     * from the Personnel DB when it matches, left alone when it does not.
     * Overwriting a role somebody typed would punish them for entering a
     * person the database has not caught up with.
     */
    syncPersonnelRole(inp) {
        const row = inp.closest('.entry-row');
        if (!row) return;
        const roleInp = row.querySelector('.mp-role');
        const idInp = row.querySelector('.mp-person-id');
        const typed = String(inp.value || '').trim().toLowerCase();
        const hit = ((this._data && this._data.personnel) || [])
            .find(p => String(p.name || '').trim().toLowerCase() === typed);
        if (idInp) idInp.value = hit ? hit.id : '';
        if (roleInp && hit && hit.role) roleInp.value = hit.role;
        this.updateManpowerTotal();
    },

    /** _personnelOptions (v9) - Active people from the Personnel DB.
     *  data-role carries the trade so the row auto-fills. */
    _personnelOptions(selectedId) {
        const list = (this._data && this._data.personnel) || [];
        if (!list.length) return '<option value="">No personnel — add names via Manpower DB → Personnel</option>';
        return '<option value="">Select person...</option>' +
            list.map(pp => `<option value="${pp.id}" data-role="${(pp.role || '').replace(/"/g, '&quot;')}" data-name="${(pp.name || '').replace(/"/g, '&quot;')}" ${selectedId === pp.id ? 'selected' : ''}>${pp.name}${pp.role ? ' — ' + pp.role : ''}</option>`).join('');
    },

    /** _manpowerRowHTML (v9) - One attendance row: person → auto role,
     *  count (default 1), AM/PM in-out, OT in-out (locked until an
     *  approved OT request exists for the form's date). */
    _manpowerRowHTML() {
        return `<div class="entry-row" style="display:block;border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--bg);">
            <div style="display:grid;grid-template-columns:2fr 1.2fr 70px 30px;gap:8px;align-items:end;">
                <div class="field"><label>Personnel *</label>
                    <input type="text" class="mp-person" list="dl-personnel" autocomplete="off"
                           placeholder="Type a name, or pick one on record"
                           oninput="ProjectPage.syncPersonnelRole(this)" onchange="ProjectPage.syncPersonnelRole(this)" />
                    <input type="hidden" class="mp-person-id" /></div>
                <div class="field"><label>Trade / Role</label>
                    <input type="text" class="mp-role" list="dl-roles" placeholder="Type or pick" /></div>
                <div class="field"><label># Present</label><input type="number" class="mp-count" value="1" min="0" /></div>
                <button class="btn-sm danger" style="margin-bottom:6px;" onclick="ProjectPage.removeEntry(this,'manpower')">${Icon.close({size:12})}</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:6px;">
                <div class="field"><label style="font-size:9px;">AM In</label><input type="time" class="mp-am-in" /></div>
                <div class="field"><label style="font-size:9px;">AM Out</label><input type="time" class="mp-am-out" /></div>
                <div class="field"><label style="font-size:9px;">PM In</label><input type="time" class="mp-pm-in" /></div>
                <div class="field"><label style="font-size:9px;">PM Out</label><input type="time" class="mp-pm-out" /></div>
                <div class="field"><label style="font-size:9px;color:var(--amber,#C2860F);">OT In ${Icon.lock({size:11})}</label><input type="time" class="mp-ot-in" disabled title="Needs an approved OT request for this date" /></div>
                <div class="field"><label style="font-size:9px;color:var(--amber,#C2860F);">OT Out ${Icon.lock({size:11})}</label><input type="time" class="mp-ot-out" disabled title="Needs an approved OT request for this date" /></div>
            </div>
        </div>`;
    },

    /** _otForDate (v9) - The APPROVED OT request covering a date. */
    _otForDate(date) {
        return ((this._data && this._data.otRequests) || [])
            .find(o => o.status === 'Approved' && String(o.otDate) === String(date)) || null;
    },

    /**
     * syncOTLock (v9) - Enables/disables every OT time field based on
     * whether an approved OT request exists for the form's date, and
     * paints the status bar. Runs on load, on date change, and after
     * each added row.
     */
    syncOTLock() {
        const date = document.getElementById('dr-date')?.value;
        const ot = date ? this._otForDate(date) : null;
        const bar = document.getElementById('otStatusBar');
        document.querySelectorAll('#manpowerEntries .mp-ot-in, #manpowerEntries .mp-ot-out').forEach(inp => {
            inp.disabled = !ot;
            if (!ot) inp.value = '';
        });
        // v10: labels are plain text (textContent cannot hold an SVG), so
        // the state is spelled out in words instead of an emoji.
        document.querySelectorAll('#manpowerEntries .field label').forEach(l => {
            if (l.textContent.indexOf('OT In') === 0) l.textContent = ot ? 'OT In' : 'OT In (locked)';
            if (l.textContent.indexOf('OT Out') === 0) l.textContent = ot ? 'OT Out' : 'OT Out (locked)';
        });
        if (bar) {
            const pend = date ? ((this._data && this._data.otRequests) || []).find(o => o.status === 'Pending' && String(o.otDate) === String(date)) : null;
            bar.innerHTML = ot
                ? `<span class="stamp approved" style="transform:none;">OT Approved ${ot.otStart}–${ot.otEnd}</span> <span style="color:var(--ink-soft);">${ot.reason || ''} (${ot.id}) — OT In/Out fields unlocked.</span>`
                : pend
                ? `<span class="stamp pending" style="transform:none;">OT Pending (${pend.id})</span> <span style="color:var(--ink-soft);">Awaiting admin approval. OT fields stay locked.</span>`
                : `<span style="color:var(--ink-soft);">No approved OT for this date, so OT in and out are locked. Use <b>Request OT</b> if overtime is needed.</span>`;
        }
    },

    /**
     * openOTModal (v9) - Files an OT authorization: start/end time,
     * affected SOWs (multiple), reason. Goes through the standard
     * multi-sig approval (admins approve; Super Admin can force).
     */
    openOTModal() {
        const date = document.getElementById('dr-date')?.value || new Date().toISOString().slice(0, 10);
        const existing = document.getElementById('otModal');
        if (existing) existing.remove();
        const sows = this._sowItems || [];
        const overlay = document.createElement('div');
        overlay.id = 'otModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;max-width:480px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:13px 18px;border-bottom:1px solid var(--line);background:var(--blueprint-tint);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">${Icon.timer({size:13})} Request Overtime</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('otModal').remove()">${Icon.close({size:12})}</span>
                </div>
                <div style="padding:14px 18px;overflow:auto;">
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                        <div class="field"><label>OT Date *</label><input type="date" id="ot-date" value="${date}" /></div>
                        <div class="field"><label>OT Start *</label><input type="time" id="ot-start" value="17:00" /></div>
                        <div class="field"><label>OT End *</label><input type="time" id="ot-end" value="20:00" /></div>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>Affected SOW (select one or more) *</label>
                        <div id="ot-sows" style="border:1px solid var(--line);border-radius:7px;padding:8px 10px;max-height:150px;overflow:auto;background:var(--bg);">
                            ${sows.length ? sows.map(sw => `<label style="display:flex;gap:7px;align-items:center;font-size:12px;margin:3px 0;cursor:pointer;text-transform:none;letter-spacing:0;"><input type="checkbox" class="ot-sow" value="${sw.id}" style="width:auto;" /> <b>${sw.id}</b> — ${sw.description || ''}</label>`).join('') : '<span style="font-size:11px;color:var(--ink-soft);">No SOW items yet.</span>'}
                        </div>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>Reason for OT *</label><textarea id="ot-reason" rows="2" placeholder="e.g. Concrete pouring must finish today so curing is continuous"></textarea></div>
                    <div style="font-size:10.5px;color:var(--ink-soft);margin-top:6px;">All admins must approve this request; the Super Admin can force-approve. Once approved, the OT in and out fields open on the Daily Site Record for this date.</div>
                </div>
                <div style="padding:12px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn-ghost" onclick="document.getElementById('otModal').remove()">Cancel</button>
                    <button class="btn-primary" onclick="ProjectPage.submitOTRequest()">Submit for Approval</button>
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    },

    async submitOTRequest() {
        const sowIds = [...document.querySelectorAll('#ot-sows .ot-sow:checked')].map(c => c.value);
        const data = {
            projectId: this._currentProjectId,
            otDate: document.getElementById('ot-date')?.value,
            otStart: document.getElementById('ot-start')?.value,
            otEnd: document.getElementById('ot-end')?.value,
            sowIds: sowIds,
            reason: (document.getElementById('ot-reason')?.value || '').trim()
        };
        if (!data.otDate || !data.otStart || !data.otEnd) { UI.toast('Complete the OT date, start, and end.', 'error'); return; }
        if (!sowIds.length) { UI.toast('Select at least one affected SOW.', 'error'); return; }
        if (!data.reason) { UI.toast('Reason for OT is required.', 'error'); return; }
        try {
            const res = await DataService.requestOT(data);
            UI.toast(`${res.id} submitted — awaiting admin approval.`, 'success');
            document.getElementById('otModal')?.remove();
            // pull fresh OT list quietly so the status bar updates
            try {
                const list = await DataService.getOTRequests(this._currentProjectId);
                if (this._data) this._data.otRequests = list;
            } catch (e) {}
            this.syncOTLock();
            if (typeof App.updateApprovalBadge === 'function') App.updateApprovalBadge();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    _manpowerOptions() {
        const list = this._approvedManpower || [];
        if (!list.length) return '<option value="">No approved roles — add via Manpower DB</option>';
        return '<option value="">Select role...</option>' +
            list.map(m => `<option value="${(m.role || '').replace(/"/g, '&quot;')}">${m.role}${m.classification ? ' (' + m.classification + ')' : ''}</option>`).join('');
    },
    _equipmentOptionsDaily() {
        const list = this._approvedEquipment || [];
        if (!list.length) return '<option value="">No approved equipment</option>';
        return '<option value="">Select equipment...</option>' +
            list.map(e => `<option value="${(e.name || '').replace(/"/g, '&quot;')}">${e.name}${e.brand ? ' — ' + e.brand : ''}</option>`).join('');
    },
    _materialOptionsDaily() {
        const list = this._approvedMaterials || [];
        if (!list.length) return '<option value="">No approved materials</option>';
        return '<option value="">Select material...</option>' +
            list.map(m => `<option value="${(m.name || '').replace(/"/g, '&quot;')}" data-unit="${(m.unit || '').replace(/"/g, '&quot;')}">${m.name}${m.brand ? ' — ' + m.brand : ''}</option>`).join('');
    },
    /**
     * syncMaterialUnit (v11 BATCH I2) - Fills the unit when the typed
     * name matches a catalogue material, and LEAVES IT ALONE when it
     * does not. Clearing a unit somebody typed would punish them for
     * entering a material the database has not caught up with — which
     * is the whole reason the field takes free text again.
     */
    syncMaterialUnit(inp) {
        const row = inp.closest('.entry-row');
        if (!row) return;
        const unitInput = row.querySelector('.mat-unit');
        if (!unitInput) return;
        const typed = String(inp.value || '').trim().toLowerCase();
        const hit = (this._approvedMaterials || []).find(m =>
            String(m.name || m.desc || '').trim().toLowerCase() === typed);
        if (hit && hit.unit) unitInput.value = hit.unit;
    },

    gatherDailyFormData() {
        const getRows = (section, clsMap) => {
            const container = document.getElementById(section + 'Entries');
            if (!container) return [];
            const rows = container.querySelectorAll('.entry-row');
            const result = [];
            rows.forEach(row => {
                const obj = {};
                let has = false;
                Object.keys(clsMap).forEach(key => {
                    const el = row.querySelector(clsMap[key]);
                    if (el) {
                        const val = el.type === 'file' ? (el.files && el.files[0] ? el.files[0].name : '') : el.value.trim();
                        obj[key] = val;
                        if (val) has = true;
                    }
                });
                if (has) result.push(obj);
            });
            return result;
        };
        return {
            date: document.getElementById('dr-date').value,
            weatherAM: document.getElementById('dr-weather-am').value.trim(),
            weatherPM: document.getElementById('dr-weather-pm').value.trim(),
            // v9: attendance rows — person (from Personnel DB) + times
            manpower: (function () {
                // v11 BATCH I2: the NAME is now what is typed, and the id is
                // recorded only when it matches somebody on file. Keying on
                // the id alone would silently drop every row for a person
                // the Personnel database has not caught up with — which is
                // most of the reason free text was wanted back.
                const rows = getRows('manpower', {
                    name: '.mp-person', personnelId: '.mp-person-id', role: '.mp-role', count: '.mp-count',
                    amIn: '.mp-am-in', amOut: '.mp-am-out', pmIn: '.mp-pm-in', pmOut: '.mp-pm-out',
                    otIn: '.mp-ot-in', otOut: '.mp-ot-out'
                });
                const people = (ProjectPage._data && ProjectPage._data.personnel) || [];
                return rows.map(r => {
                    const typed = String(r.name || '').trim().toLowerCase();
                    const pp = people.find(x =>
                        (r.personnelId && x.id === r.personnelId) ||
                        String(x.name || '').trim().toLowerCase() === typed);
                    if (pp) { r.personnelId = pp.id; if (!r.role) r.role = pp.role || ''; }
                    if (!r.count) r.count = '1';
                    return r;
                }).filter(r => String(r.name || '').trim() || String(r.role || '').trim());
            })(),
            equipment: getRows('equipment', { name: '.eq-name', qty: '.eq-qty', status: '.eq-status', remarks: '.eq-remarks' }),
            workAccomplished: getRows('work', { location: '.wk-location', scope: '.wk-scope', description: '.wk-desc', percentComplete: '.wk-pct', image: '.wk-image' }),
            materialsDelivered: getRows('materials', { material: '.mat-name', qty: '.mat-qty', unit: '.mat-unit', supplier: '.mat-supplier' }),
            materialsUsed: getRows('materialsUsed', { material: '.mu-name', qty: '.mu-qty', unit: '.mu-unit', sow: '.mu-sow' }),   // v6
            issues: getRows('issues', { description: '.iss-desc', cause: '.iss-cause', timeLost: '.iss-time', image: '.iss-image' }),
            visitors: getRows('visitors', { name: '.vis-name', company: '.vis-company', purpose: '.vis-purpose', timeIn: '.vis-time-in', timeOut: '.vis-time-out', remarks: '.vis-remarks' }),
            photos: []
        };
    },

    async submitDailyRecord(projectId) {
        const data = this.gatherDailyFormData();

        // v6: client-side stock guard (server re-validates). Remaining =
        // siteMaterials balance + deliveries logged on THIS form.
        if ((data.materialsUsed || []).length) {
            const remainingMap = {};
            (this._data && this._data.siteMaterials || []).forEach(m => { remainingMap[m.material] = m.remaining || 0; });
            // v6.4: when editing, the site balance already includes THIS
            // draft's old usage/deliveries — add usage back and remove its
            // deliveries so the new rows are validated against a clean base.
            if (this._editingRecordId) {
                const orig = (this._data.dailyRecords || []).find(x => x.id === this._editingRecordId);
                (orig && orig.materialsUsed || []).forEach(m => {
                    if (m.material) remainingMap[m.material] = (remainingMap[m.material] || 0) + (parseFloat(m.qty) || 0);
                });
                (orig && orig.materialsDelivered || []).forEach(m => {
                    if (m.material) remainingMap[m.material] = (remainingMap[m.material] || 0) - (parseFloat(m.qty) || 0);
                });
            }
            (data.materialsDelivered || []).forEach(m => {
                if (!m.material) return;
                remainingMap[m.material] = (remainingMap[m.material] || 0) + (parseFloat(m.qty) || 0);
            });
            const useMap = {};
            (data.materialsUsed || []).forEach(m => {
                if (!m.material) return;
                useMap[m.material] = (useMap[m.material] || 0) + (parseFloat(m.qty) || 0);
            });
            for (const mat of Object.keys(useMap)) {
                const avail = remainingMap[mat] || 0;
                if (useMap[mat] > avail + 0.0001) {
                    UI.toast(`Materials Used exceeds site stock for "${mat}" — only ${fmtNum(avail)} remaining.`, 'error');
                    return;
                }
            }
        }
        if (!data.date) { UI.toast('Please select a date.', 'error'); return; }

        const existingRecords = this._data ? this._data.dailyRecords : [];
        const duplicate = existingRecords.some(record => {
            if (this._editingRecordId && record.id === this._editingRecordId) return false;   // v6.4: self
            return record.date === data.date && record.status !== 'rejected';
        });
        if (duplicate) {
            UI.toast(`There is already a record for ${data.date} (draft/pending/approved). You cannot add another.`, 'error');
            return;
        }

        data.status = 'draft';

        // v8: each photo carries its CAPTION so the record modal can show
        // what the picture is. Uploads resolve to { url, caption } objects.
        const photoRows = document.querySelectorAll('#photosEntries .entry-row');
        const photoPromises = [];
        photoRows.forEach(row => {
            const input = row.querySelector('input[type="file"][data-photo]');
            const caption = (row.querySelector('.photo-caption')?.value || '').trim();
            if (input && input.files && input.files.length > 0) {
                const file = input.files[0];
                photoPromises.push(fileToBase64_(file).then(base64 => {
                    return DataService.uploadImage(base64, file.name, file.type)
                        .then(res => res && res.url ? { url: res.url, caption: caption } : null);
                }).catch(err => {
                    console.error('Photo upload error:', err);
                    return null;
                }));
            }
        });
        const photoResults = await Promise.all(photoPromises);
        data.photos = photoResults.filter(r => r && r.url);

        // v5 (item 10): work-accomplished rows have their own photo input,
        // but getRows() only captured the file input's .value — a useless
        // "C:\\fakepath\\…" string that was stored as the image. Upload each
        // work-row photo properly and store its real Drive URL instead.
        const workRows = document.querySelectorAll('#workEntries .entry-row');
        const workUploads = [];
        workRows.forEach((row, i) => {
            const inp = row.querySelector('.wk-image');
            if (inp && inp.files && inp.files.length > 0) {
                const file = inp.files[0];
                workUploads.push(
                    fileToBase64_(file)
                        .then(b64 => DataService.uploadImage(b64, file.name, file.type))
                        .then(res => { if (res && res.url && data.workAccomplished[i]) data.workAccomplished[i].image = res.url; })
                        .catch(err => { console.error('Work photo upload error:', err); if (data.workAccomplished[i]) data.workAccomplished[i].image = ''; })
                );
            } else if (data.workAccomplished[i]) {
                // v6.4: editing keeps the photo already on the row unless replaced
                data.workAccomplished[i].image = (row.dataset && row.dataset.existingImage) || '';
            }
        });
        await Promise.all(workUploads);

        const confirmed = await Confirm.open('Save Daily Record?', `Save record for ${data.date}?`);
        if (!confirmed) return;
        try {
            if (this._editingRecordId) {
                await DataService.updateDailyRecord(this._editingRecordId, data);
                UI.toast('Draft updated!', 'success');
                this._editingRecordId = null;
            } else {
                await DataService.addDailyRecord(projectId, data);
                UI.toast('Daily record saved as draft!', 'success');
            }
            await this.open(projectId);
        } catch (err) { UI.toast('Error: ' + err.message, 'error'); }
    },

    /** setDailyView (v9 — item 4) - Records ↔ Attendance sub-views. */
    setDailyView(view) {
        this._dailyView = view;
        this.renderDailyRecords(this._data);
    },

    /**
     * _renderAttendanceHTML (v9 — item 4) - ATTENDANCE MONITORING.
     * Derived 100% from the Daily Site Records' manpower rows (no
     * separate encoding): a month matrix of personnel × days, showing
     * presence, and per-person totals (days present + OT hours). Only
     * rows tied to a Personnel entry appear; legacy role-only rows are
     * counted in the record but can't be attributed to a person.
     */
    _renderAttendanceHTML(p) {
        const records = (p.dailyRecords || []).filter(r => r.status !== 'rejected');

        // months that actually have records (yyyy-MM), newest first
        const months = [...new Set(records.map(r => String(r.date || '').slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
        if (!months.length) {
            return `<div class="empty"><p>No daily records yet. Attendance is derived from the Manpower section of each Daily Site Record.</p></div>`;
        }
        if (!this._attMonth || !months.includes(this._attMonth)) this._attMonth = months[0];
        const month = this._attMonth;

        // days in the month that have a record
        const monthRecords = records.filter(r => String(r.date || '').startsWith(month))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const days = monthRecords.map(r => String(r.date).slice(8, 10));

        // person → { name, role, byDay: { dd: rowdata }, otHours }
        const people = {};
        const hrs = (tin, tout) => {
            if (!tin || !tout) return 0;
            const [h1, m1] = String(tin).split(':').map(Number);
            const [h2, m2] = String(tout).split(':').map(Number);
            if (isNaN(h1) || isNaN(h2)) return 0;
            let diff = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
            if (diff < 0) diff += 24 * 60;   // OT past midnight
            return diff / 60;
        };
        let legacyRows = 0;
        monthRecords.forEach(r => {
            const dd = String(r.date).slice(8, 10);
            (r.manpower || []).forEach(m => {
                if (!m.name && !m.personnelId) { legacyRows++; return; }
                const key = m.personnelId || m.name;
                if (!people[key]) people[key] = { name: m.name || key, role: m.role || '', byDay: {}, otHours: 0, daysPresent: 0 };
                people[key].byDay[dd] = m;
                people[key].daysPresent++;
                people[key].otHours += hrs(m.otIn, m.otOut);
                if (m.role) people[key].role = m.role;
            });
        });
        const list = Object.values(people).sort((a, b) => a.name.localeCompare(b.name));

        const cell = m => {
            if (!m) return '<td style="text-align:center;color:var(--line);">·</td>';
            const ot = (m.otIn || m.otOut);
            const tip = [
                m.amIn || m.amOut ? `AM ${m.amIn || '?'}-${m.amOut || '?'}` : '',
                m.pmIn || m.pmOut ? `PM ${m.pmIn || '?'}-${m.pmOut || '?'}` : '',
                ot ? `OT ${m.otIn || '?'}-${m.otOut || '?'}` : ''
            ].filter(Boolean).join(' · ') || 'Present';
            return `<td style="text-align:center;" title="${tip}">
                <span style="color:var(--green,#2F7A46);font-weight:700;">${Icon.check({size:12})}</span>${ot ? '<sup style="color:var(--amber,#C2860F);font-size:8px;font-weight:700;">OT</sup>' : ''}
            </td>`;
        };

        let html = `
            <div class="section-head"><h2>Attendance Monitoring</h2><div class="rule"></div>
                <select onchange="ProjectPage._attMonth=this.value;ProjectPage.renderDailyRecords(ProjectPage._data);" style="padding:5px 9px;border:1px solid var(--line);border-radius:7px;font-size:12px;background:var(--surface);color:var(--ink);">
                    ${months.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${new Date(m + '-02').toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })}</option>`).join('')}
                </select>
                <button class="btn-sm" onclick="ProjectPage.exportAttendanceExcel()">${Icon.spreadsheet({size:12})} Export Excel</button>
            </div>`;

        if (!list.length) {
            html += `<div class="empty"><p>No attendance rows are linked to Personnel for this month.${legacyRows ? ' (' + legacyRows + ' legacy rows record a role but no name, so they cannot be attributed. Select the person from the Personnel dropdown going forward.)' : ''}</p></div>`;
            return html;
        }

        html += `<div class="panel" style="overflow:auto;"><table style="min-width:${360 + days.length * 34}px;"><thead><tr>
            <th style="position:sticky;left:0;background:var(--surface);z-index:1;">Personnel</th><th>Role</th>
            ${days.map(dd => `<th style="text-align:center;font-size:9.5px;">${parseInt(dd, 10)}</th>`).join('')}
            <th style="text-align:right;">Days</th><th style="text-align:right;">OT hrs</th>
        </tr></thead><tbody>`;
        list.forEach(pp => {
            html += `<tr>
                <td style="position:sticky;left:0;background:var(--surface);z-index:1;"><b>${pp.name}</b></td>
                <td style="font-size:11px;">${pp.role || '—'}</td>
                ${days.map(dd => cell(pp.byDay[dd])).join('')}
                <td class="amt"><b>${pp.daysPresent}</b></td>
                <td class="amt">${pp.otHours ? pp.otHours.toFixed(1) : '—'}</td>
            </tr>`;
        });
        html += `</tbody></table></div>
            <div class="data-source-note">Hover a check mark to see the AM, PM, and OT times. Attendance is derived from the <b>Manpower &mdash; Attendance</b> section of each Daily Site Record, so nothing is encoded twice. The OT marker appears only on days with an approved OT request.${legacyRows ? ' <b>' + legacyRows + '</b> legacy rows record a role but no name and are excluded.' : ''}</div>`;
        return html;
    },

    /** exportAttendanceExcel (v9) - The visible month's matrix as .xlsx. */
    exportAttendanceExcel() {
        if (typeof XLSX === 'undefined') { UI.toast('Excel library not loaded — refresh and try again.', 'error'); return; }
        const p = this._data || {};
        const month = this._attMonth;
        const records = (p.dailyRecords || []).filter(r => r.status !== 'rejected' && String(r.date || '').startsWith(month))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));
        if (!records.length) { UI.toast('No records for this month.', 'error'); return; }
        const days = records.map(r => String(r.date).slice(8, 10));
        const people = {};
        const hrs = (tin, tout) => {
            if (!tin || !tout) return 0;
            const [h1, m1] = String(tin).split(':').map(Number);
            const [h2, m2] = String(tout).split(':').map(Number);
            if (isNaN(h1) || isNaN(h2)) return 0;
            let diff = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
            if (diff < 0) diff += 24 * 60;
            return diff / 60;
        };
        records.forEach(r => {
            const dd = String(r.date).slice(8, 10);
            (r.manpower || []).forEach(m => {
                if (!m.name && !m.personnelId) return;
                const key = m.personnelId || m.name;
                if (!people[key]) people[key] = { name: m.name || key, role: m.role || '', byDay: {}, ot: 0, days: 0 };
                people[key].byDay[dd] = m;
                people[key].days++;
                people[key].ot += hrs(m.otIn, m.otOut);
            });
        });
        const aoa = [
            ['ATTENDANCE — ' + (p.name || this._currentProjectId)],
            ['Month', month], [],
            ['Personnel', 'Role', ...days.map(d => parseInt(d, 10)), 'Days Present', 'OT Hours']
        ];
        Object.values(people).sort((a, b) => a.name.localeCompare(b.name)).forEach(pp => {
            aoa.push([pp.name, pp.role,
                ...days.map(dd => {
                    const m = pp.byDay[dd];
                    if (!m) return '';
                    const t = [m.amIn && (m.amIn + '-' + (m.amOut || '')), m.pmIn && (m.pmIn + '-' + (m.pmOut || '')), m.otIn && ('OT ' + m.otIn + '-' + (m.otOut || ''))].filter(Boolean).join(' ');
                    return t || 'P';
                }),
                pp.days, Math.round(pp.ot * 10) / 10]);
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 24 }, { wch: 16 }, ...days.map(() => ({ wch: 13 })), { wch: 12 }, { wch: 9 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, month);
        XLSX.writeFile(wb, `Attendance-${(p.name || this._currentProjectId).replace(/[^\w-]+/g, '_')}-${month}.xlsx`);
    },

    renderDailyRecords(p) {
        const container = document.getElementById('proj-tab-daily');
        const dailyRecords = p.dailyRecords || [];
        let html = `
            <div class="add-record-toggle">
                ${this._canEdit !== false ? `<button class="btn-ghost" onclick="ProjectPage.toggleAddRecord()">+ Add Daily Site Record</button>` : ''}
                ${(App.getUser() || {}).role === 'superadmin' ? `<button class="btn-sm" style="margin-left:8px;" onclick="ProjectPage.openDeletedRecords()">${Icon.trash({size:12})} Recently Deleted</button>` : ''}
            </div>
            <div class="add-record-form" id="dailyAddForm">
                ${this._buildDailyFormHTML()}
            </div>
            <div class="status-tabs" style="margin:10px 0 10px;">
                <button class="${this._dailyView !== 'attendance' ? 'active' : ''}" onclick="ProjectPage.setDailyView('records')">${Icon.fileText({size:12})} Records</button>
                <button class="${this._dailyView === 'attendance' ? 'active' : ''}" onclick="ProjectPage.setDailyView('attendance')">${Icon.clock({size:13})} Attendance Monitoring</button>
            </div>`;
        if (this._dailyView === 'attendance') {
            html += this._renderAttendanceHTML(p);
            container.innerHTML = html;
            return;
        }
        // ── v11 BATCH D: TABLE INSTEAD OF CARDS ──────────────────
        // The list used to be one tall card per record showing only the
        // date, the weather and a headcount. Everything that was
        // actually entered — the SOW items worked on, the equipment, the
        // materials, the issues, the photos — was invisible until you
        // opened each record one at a time. On a project with sixty
        // daily reports that is sixty clicks to answer "which days did
        // we work on B.2".
        //
        // A table shows the same rows at a glance and lets you compare
        // down a column, which is the whole point of a log. The counts
        // are clickable summaries, not decoration: they tell you which
        // record is worth opening.
        const summarize = r => {
            const mp = (r.manpower || []).reduce((s, m) => s + (parseInt(m.count) || 0), 0);
            const eq = (r.equipment || []).length;
            const sow = new Set((r.workAccomplished || []).map(w => w.scope).filter(Boolean));
            const mat = (r.materialsDelivered || []).length + (r.materialsUsed || []).length;
            const iss = (r.issues || []).length;
            const pics = (r.photos || []).length +
                (r.workAccomplished || []).filter(w => w.image).length;
            return { mp, eq, sow, mat, iss, pics };
        };
        const cell = (n, title, icon) => n
            ? `<span class="dr-chip" title="${title}">${icon} ${n}</span>`
            : `<span class="dr-chip is-zero">—</span>`;

        html += `
            <div class="panel">
                <div class="panel-head">
                    <h3>Site Daily Log</h3>
                    <span class="mono" style="font-size:11px;color:var(--ink-soft)">${dailyRecords.length} ${dailyRecords.length === 1 ? 'entry' : 'entries'}</span>
                </div>
        `;
        if (dailyRecords.length === 0) {
            html += `<div class="empty"><p>No daily records yet. Add one to start logging manpower, equipment and accomplishment against your SOW items.</p></div>`;
        } else {
            const sorted = [...dailyRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
            html += `<div class="dr-table-wrap">
                <table class="dr-table">
                    <thead><tr>
                        <th>Date</th>
                        <th>Weather AM / PM</th>
                        <th class="num" title="Total headcount across AM, PM and OT">Manpower</th>
                        <th class="num" title="Equipment entries logged">Equipment</th>
                        <th class="num" title="SOW items worked on that day">SOW</th>
                        <th class="num" title="Materials delivered and used">Materials</th>
                        <th class="num" title="Issues and delays raised">Issues</th>
                        <th class="num" title="Photos attached">Photos</th>
                        <th>Prepared by</th>
                        <th>Status</th>
                        <th></th>
                    </tr></thead>
                    <tbody>`;

            sorted.forEach((r) => {
                const sm = summarize(r);
                const dateObj = new Date(r.date);
                const valid = !isNaN(dateObj);
                const weekday = valid ? dateObj.toLocaleDateString('en-US', { weekday: 'short' }) : '';
                const pretty = valid
                    ? dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                    : (r.date || '—');
                const isSunday = valid && dateObj.getDay() === 0;

                const statusBadge = r.status === 'draft' ?
                    '<span class="stamp draft" style="transform:none;padding:1px 8px;font-size:9px;">Draft</span>' :
                    r.status === 'pending' ?
                    '<span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">Pending</span>' :
                    r.status === 'approved' ?
                    '<span class="stamp approved" style="transform:none;padding:1px 8px;font-size:9px;">Approved</span>' :
                    r.status === 'rejected' ?
                    '<span class="stamp rejected" style="transform:none;padding:1px 8px;font-size:9px;">Rejected</span>' : '';

                let actionsHtml = '';
                const user = App.getUser();
                const isCreator = user && r.createdBy && user.email.toLowerCase() === r.createdBy.toLowerCase();
                const isSuperAdmin = user && user.role === 'superadmin';
                const isApprover = App.isApprover();

                if (r.status === 'draft') {
                    // v6.4: drafts are editable/deletable by their creator;
                    // frozen once submitted. v6.6: and you must be an editor.
                    // v11 BATCH I1: a Super Admin can edit and delete ANY
                    // record, not only their own drafts. Being able to delete
                    // something you are not allowed to correct is the wrong
                    // way round — it pushes people to delete and re-enter.
                    if ((isCreator || isSuperAdmin) && this._canEdit !== false) {
                        actionsHtml = `
                            <button class="btn-sm primary" onclick="ProjectPage.submitDailyForApproval('${r.id}')">Submit</button>
                            <button class="btn-sm" title="Edit this draft" onclick="ProjectPage.editDailyRecord('${r.id}')">${Icon.pencil({size:12})}</button>
                            <button class="btn-sm danger" title="Delete this draft" onclick="ProjectPage.deleteDailyRecordUI('${r.id}')">${Icon.trash({size:12})}</button>`;
                    } else {
                        actionsHtml = `<span class="dr-note">Creator only</span>`;
                    }
                } else if (r.status === 'pending') {
                    // v11 BATCH I1: Super Admin is checked FIRST. Previously a
                    // Super Admin who had submitted the record themselves fell
                    // into the creator branch and saw only "Awaiting approval"
                    // — waiting on approvers who, by the system's own rules,
                    // they did not need.
                    if (isSuperAdmin) {
                        actionsHtml = `
                            <button class="btn-sm success" onclick="ProjectPage.forceApproveDailyRecord('${r.id}')">Approve</button>
                            <button class="btn-sm danger" onclick="ProjectPage.forceRejectDailyRecord('${r.id}')">Reject</button>
                            <button class="btn-sm" title="Edit" onclick="ProjectPage.editDailyRecord('${r.id}')">${Icon.pencil({size:12})}</button>`;
                    } else if (isCreator) {
                        actionsHtml = `<span class="dr-note">Awaiting approval</span>`;
                    } else if (isApprover) {
                        actionsHtml = `
                            <button class="btn-sm success" onclick="ProjectPage.approveDailyRecord('${r.id}')">Approve</button>
                            <button class="btn-sm danger" onclick="ProjectPage.rejectDailyRecord('${r.id}')">Reject</button>`;
                    }
                }

                // The whole row opens the record, so the magnifier button
                // is no longer the only target — but the action buttons
                // stop the click so they still do their own job.
                html += `
                    <tr class="dr-row ${isSunday ? 'is-rest' : ''}" onclick="ProjectPage.viewRecordById('${r.id}')" title="Open ${r.date || 'this record'}">
                        <td class="dr-date">
                            <span class="wd">${weekday}</span>
                            <span class="dt">${pretty}</span>
                        </td>
                        <td class="dr-weather">${r.weatherAM || '—'} / ${r.weatherPM || '—'}</td>
                        <td class="num">${cell(sm.mp, 'Total headcount', Icon.users({size:11}))}</td>
                        <td class="num">${cell(sm.eq, 'Equipment entries', Icon.wrench({size:11}))}</td>
                        <td class="num">${sm.sow.size
                            ? `<span class="dr-chip" title="SOW items worked on: ${Array.from(sm.sow).join(', ')}">${Icon.ruler({size:11})} ${sm.sow.size}</span>`
                            : `<span class="dr-chip is-zero">—</span>`}</td>
                        <td class="num">${cell(sm.mat, 'Materials delivered and used', Icon.package({size:11}))}</td>
                        <td class="num">${sm.iss
                            ? `<span class="dr-chip is-issue" title="Issues and delays raised">${Icon.warning({size:11})} ${sm.iss}</span>`
                            : `<span class="dr-chip is-zero">—</span>`}</td>
                        <td class="num">${cell(sm.pics, 'Photos attached', Icon.camera({size:11}))}</td>
                        <td class="dr-by">${r.createdByName || r.createdBy || '—'}</td>
                        <td>${statusBadge}</td>
                        <td class="dr-actions" onclick="event.stopPropagation()">
                            ${actionsHtml}
                            ${isSuperAdmin && r.status !== 'draft'
                                ? `<button class="btn-sm danger" title="Delete this record (Super Admin)" onclick="ProjectPage.deleteDailyRecordUI('${r.id}')">${Icon.trash({size:12})}</button>` : ''}
                            <button class="btn-sm" title="Open full record" onclick="ProjectPage.viewRecordById('${r.id}')">${Icon.search({size:12})}</button>
                        </td>
                    </tr>`;
            });

            html += `</tbody></table></div>
                <div class="data-source-note">Counts summarise what is inside each record — headcount, equipment entries, SOW items worked on, materials moved, issues raised and photos. Click any row to open it. Sundays are shaded.</div>`;
        }
        html += `</div>`;   // v11: the scroll wrapper is inside the table block now
        container.innerHTML = html;
        this._dailyRecords = dailyRecords;
    },

    /**
     * _siteMaterialOptionsDaily (v6) - Options for the Materials Used
     * dropdown: only materials with remaining stock on site
     * (delivered − used, from getProjectData.siteMaterials). Each shows
     * its remaining balance so the crew sees stock before typing.
     */
    _siteMaterialOptionsDaily() {
        const rows = (this._data && this._data.siteMaterials || []).filter(m => (m.remaining || 0) > 0);
        if (!rows.length) return '<option value="">— No materials on site yet —</option>';
        return '<option value="">Select...</option>' + rows.map(m =>
            `<option value="${String(m.material).replace(/"/g, '&quot;')}" data-unit="${m.unit || ''}" data-remaining="${m.remaining}">${m.material} — remaining: ${fmtNum(m.remaining)} ${m.unit || ''}</option>`
        ).join('');
    },

    /** syncUsedMaterialUnit (v6) - auto-fill unit + cap qty at remaining. */
    syncUsedMaterialUnit(selectEl) {
        const row = selectEl.closest('.entry-row');
        if (!row) return;
        const opt = selectEl.selectedOptions[0];
        const unitEl = row.querySelector('.mu-unit');
        const qtyEl = row.querySelector('.mu-qty');
        if (unitEl) unitEl.value = opt ? (opt.dataset.unit || '') : '';
        if (qtyEl && opt && opt.dataset.remaining) qtyEl.max = opt.dataset.remaining;
    },

    addEntry(section) {
        const container = document.getElementById(section + 'Entries');
        if (!container) return;
        const template = container.querySelector('.entry-row');
        if (!template) return;
        const clone = template.cloneNode(true);
        clone.querySelectorAll('input, textarea, select').forEach(el => {
            if (el.type === 'file') { el.value = '';
                el.onchange = null; } else if (el.type === 'checkbox' || el.type === 'radio') { el
                    .checked = false; } else { el.value = ''; }
        });
        clone.querySelectorAll('.image-preview-sm').forEach(el => el.remove());
        container.appendChild(clone);
        clone.querySelectorAll('input[type="file"]').forEach(el => {
            el.onchange = function(e) { ProjectPage.previewSmallImage(this, 'preview-' + Date
                .now()); };
        });
        if (section === 'manpower') {
            // v9: attendance defaults — count starts at 1, OT lock re-applied
            const cnt = clone.querySelector('.mp-count');
            if (cnt) cnt.value = '1';
            this.updateManpowerTotal();
            this.syncOTLock();
        }
    },

    removeEntry(btn, section) {
        const row = btn.closest('.entry-row');
        const container = row?.parentElement;
        if (container && container.children.length > 1) { row.remove(); if (section === 'manpower') ProjectPage
                .updateManpowerTotal(); } else UI.toast('Must have at least one entry.', 'error');
    },

    previewSmallImage(input, previewId) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const existing = input.closest('.entry-row').querySelector('.image-preview-sm');
            if (existing) existing.remove();
            const div = document.createElement('div');
            div.className = 'image-preview-sm';
            div.style.cssText =
                'margin-top:4px;max-width:50px;max-height:50px;border-radius:4px;overflow:hidden;border:1px solid var(--line);';
            div.innerHTML =
                `<img src="${e.target.result}" alt="preview" style="width:100%;height:auto;display:block;" />`;
            input.closest('.field').appendChild(div);
        };
        reader.readAsDataURL(file);
    },

    updateManpowerTotal() {
        const entries = document.querySelectorAll('#manpowerEntries .entry-row');
        let total = 0;
        entries.forEach(row => { const c = row.querySelector('.mp-count'); if (c) total += parseInt(c
                    .value) || 0; });
        document.getElementById('manpowerTotal').textContent = 'Total: ' + total;
        document.getElementById('manpowerTotalDisplay').textContent = 'Total: ' + total;
    },


    // ════════════ v7.2: MOBILE STEP MODE ════════════
    //
    // On a phone the daily form is a very long scroll of small inputs —
    // hard to fill one-handed on site. Step mode shows ONE section at a
    // time with large touch targets and a progress bar.
    //
    // Design choice: this only SHOWS and HIDES the existing sections. The
    // markup, the gather logic and the submit path are untouched, so the
    // desktop form and the phone form can never drift apart or disagree
    // about what was captured.

    _DAILY_STEPS: [
        { id: 'dateWeatherSection',    label: 'Date and Weather' },
        { id: 'manpowerSection',       label: 'Manpower' },
        { id: 'equipmentSection',      label: 'Equipment' },
        { id: 'workSection',           label: 'Work Accomplished' },
        { id: 'materialsSection',      label: 'Materials Delivered' },
        { id: 'materialsUsedSection',  label: 'Materials Used' },
        { id: 'issuesSection',         label: 'Issues and Delays' },
        { id: 'visitorsSection',       label: 'Visitors' },
        { id: 'photosSection',         label: 'Photos' }
    ],

    /** isMobileView - phone-sized viewport (matches the CSS breakpoint). */
    isMobileView() {
        return window.matchMedia('(max-width: 720px)').matches;
    },

    /**
     * initDailySteps - Enables step mode on small screens, and plain
     * scrolling everywhere else. Called whenever the form opens.
     */
    initDailySteps() {
        const bar = document.getElementById('dailyStepBar');
        const nav = document.getElementById('dailyStepNav');
        const submitRow = document.getElementById('dailySubmitRow');
        if (!bar || !nav || !submitRow) return;

        if (!this.isMobileView()) {
            // desktop: everything visible, no stepping
            bar.hidden = true;
            nav.hidden = true;
            submitRow.hidden = false;
            this._DAILY_STEPS.forEach(s => {
                const el = document.getElementById(s.id);
                if (el) el.style.display = '';
            });
            this._dailyStepIdx = null;
            return;
        }

        bar.hidden = false;
        nav.hidden = false;
        this._dailyStepIdx = 0;
        this._renderDailyStep();
    },

    _renderDailyStep() {
        const idx = this._dailyStepIdx;
        if (idx === null || idx === undefined) return;
        const steps = this._DAILY_STEPS;

        steps.forEach((s, i) => {
            const el = document.getElementById(s.id);
            if (el) el.style.display = (i === idx) ? '' : 'none';
        });

        const track = document.getElementById('dsbTrack');
        if (track) {
            track.innerHTML = steps.map((_, i) =>
                `<span class="dsb-seg ${i < idx ? 'done' : i === idx ? 'now' : ''}"></span>`
            ).join('');
        }
        const title = document.getElementById('dsbTitle');
        if (title) title.textContent = (idx + 1) + ' · ' + steps[idx].label;
        const count = document.getElementById('dsbCount');
        if (count) count.textContent = (idx + 1) + ' of ' + steps.length;

        const prev = document.getElementById('dsbPrev');
        const next = document.getElementById('dsbNext');
        const submitRow = document.getElementById('dailySubmitRow');
        const isLast = idx === steps.length - 1;
        if (prev) prev.style.visibility = idx === 0 ? 'hidden' : 'visible';
        if (next) next.textContent = isLast ? 'Review and Save' : 'Next →';
        // On the final step, show the real save controls instead of "next"
        if (submitRow) submitRow.hidden = !isLast;
        const nav = document.getElementById('dailyStepNav');
        if (nav) nav.hidden = false;

        const form = document.getElementById('dailyAddForm');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    dailyStep(delta) {
        if (this._dailyStepIdx === null || this._dailyStepIdx === undefined) return;
        const next = this._dailyStepIdx + delta;
        if (next < 0 || next >= this._DAILY_STEPS.length) return;

        // Validate the date before letting anyone past step 1 — it is the
        // one field the whole record depends on.
        if (delta > 0 && this._dailyStepIdx === 0) {
            const d = document.getElementById('dr-date');
            if (d && !d.value) { UI.toast('Please select a date first.', 'error'); return; }
        }
        this._dailyStepIdx = next;
        this._renderDailyStep();
    },

    /** jumpToDailyStep - used by the review summary to fix a section. */
    jumpToDailyStep(i) {
        if (!this.isMobileView()) return;
        this._dailyStepIdx = Math.max(0, Math.min(i, this._DAILY_STEPS.length - 1));
        this._renderDailyStep();
    },


    /**
     * openDeletedRecords (v7.5) - Super Admin recovery view.
     *
     * Deleted drafts are retained for 30 days rather than removed, so an
     * accidental deletion is a nuisance instead of data loss.
     */
    async openDeletedRecords() {
        let rows = [];
        try {
            rows = await DataService.listDeletedRecords(this._currentProjectId);
        } catch (err) { UI.toast('' + err.message, 'error'); return; }

        const overlay = document.createElement('div');
        overlay.id = 'deletedRecordsModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;max-width:640px;width:100%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:13px 18px;border-bottom:1px solid var(--line);background:var(--blueprint-tint);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">Recently Deleted</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('deletedRecordsModal').remove()">${Icon.close({size:12})}</span>
                </div>
                <div style="padding:14px 18px;overflow:auto;">
                    ${rows.length ? `
                    <table><thead><tr>
                        <th>Date</th><th>Record</th><th>Deleted By</th><th>Deleted</th><th style="text-align:right">Days Left</th><th></th>
                    </tr></thead><tbody>
                    ${rows.map(r => `<tr>
                        <td class="mono" style="font-size:11.5px">${r.date}</td>
                        <td><span class="req-id">${r.id}</span></td>
                        <td style="font-size:11.5px;color:var(--ink-soft)">${r.deletedBy}</td>
                        <td class="mono" style="font-size:11px">${r.deletedAt}</td>
                        <td class="amt"><span class="stamp ${r.daysLeft <= 7 ? 'rejected' : 'pending'}">${r.daysLeft}</span></td>
                        <td><button class="btn-sm success" onclick="ProjectPage.restoreRecord('${r.id}')">Restore</button></td>
                    </tr>`).join('')}
                    </tbody></table>` : `
                    <div class="empty">
                        <div class="empty-ico">${Icon.trash({size:22})}</div>
                        <h4>Nothing deleted</h4>
                        <p>Deleted drafts appear here for 30 days before being permanently removed.</p>
                    </div>`}
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    },

    async restoreRecord(id) {
        try {
            await DataService.restoreDailyRecord(id);
            UI.toast('Record restored.', 'success');
            const m = document.getElementById('deletedRecordsModal');
            if (m) m.remove();
            await this.open(this._currentProjectId, true);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    toggleAddRecord() {
        const form = document.getElementById('dailyAddForm');
        if (form) form.classList.toggle('open');
        if (form && form.classList.contains('open')) {
            setTimeout(() => this.initDailySteps(), 30);   // v7.2
            this.syncOTLock();                             // v9: OT lock state
        }
        // v6.4: leaving the form ends edit mode and restores the button label
        if (form && !form.classList.contains('open')) {
            this._editingRecordId = null;
            const btn = form.querySelector('.submit-row .btn-primary');
            if (btn) btn.textContent = 'Save Record (Draft)';
            const banner = document.getElementById('dailyEditBanner');
            if (banner) banner.remove();
        }
    },

    /**
     * editDailyRecord (v6.4) - Loads a draft back into the form for
     * editing. Every section is repopulated from the saved rows; photo
     * FILE inputs can't be prefilled by the browser, so existing photos
     * are kept server-side and new uploads are appended.
     */
    editDailyRecord(id) {
        const r = (this._data.dailyRecords || []).find(x => x.id === id);
        if (!r) return;
        const form = document.getElementById('dailyAddForm');
        if (form && !form.classList.contains('open')) form.classList.add('open');
        this._editingRecordId = id;
        this._populateDailyForm(r);
        setTimeout(() => this.initDailySteps(), 30);   // v7.2
        const btn = form ? form.querySelector('.submit-row .btn-primary') : null;
        if (btn) btn.textContent = 'Update Draft';
        if (form && !document.getElementById('dailyEditBanner')) {
            const banner = document.createElement('div');
            banner.id = 'dailyEditBanner';
            banner.style.cssText = 'background:var(--blueprint-tint);border:1px solid var(--line);border-left:3px solid var(--blueprint);border-radius:8px;padding:9px 13px;font-size:12px;margin-bottom:12px;';
            banner.innerHTML = `${Icon.pencil({size:12})} Editing draft <b>${id}</b> (${r.date}). Existing photos are kept; new uploads will be added.`;
            form.prepend(banner);
        }
        form && form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    _populateDailyForm(r) {
        document.getElementById('dr-date').value = r.date || '';
        document.getElementById('dr-weather-am').value = r.weatherAM || '';
        document.getElementById('dr-weather-pm').value = r.weatherPM || '';

        const fill = (section, rows, clsMap, perRow) => {
            const container = document.getElementById(section + 'Entries');
            if (!container) return;
            // reset to a single blank row, then clone up to the data count
            const first = container.querySelector('.entry-row');
            container.querySelectorAll('.entry-row').forEach((el, i) => { if (i > 0) el.remove(); });
            if (first) first.querySelectorAll('input, select').forEach(el => { if (el.type !== 'file') el.value = ''; });
            for (let i = 1; i < (rows || []).length; i++) this.addEntry(section);
            const els = container.querySelectorAll('.entry-row');
            (rows || []).forEach((data, i) => {
                const row = els[i];
                if (!row) return;
                Object.keys(clsMap).forEach(key => {
                    const el = row.querySelector(clsMap[key]);
                    if (!el || el.type === 'file') return;
                    const val = data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
                    if (el.tagName === 'SELECT' && val &&
                        ![...el.options].some(o => o.value === val)) {
                        const opt = document.createElement('option');
                        opt.value = val;
                        opt.textContent = val + ' (from draft)';
                        el.appendChild(opt);
                    }
                    el.value = val;
                });
                if (perRow) perRow(row, data);
            });
        };

        fill('manpower', r.manpower, {
            name: '.mp-person', personnelId: '.mp-person-id', role: '.mp-role', count: '.mp-count',
            amIn: '.mp-am-in', amOut: '.mp-am-out', pmIn: '.mp-pm-in', pmOut: '.mp-pm-out',
            otIn: '.mp-ot-in', otOut: '.mp-ot-out'
        });
        this.syncOTLock();   // v9: re-lock/unlock OT fields per the record's date
        fill('equipment', r.equipment, { name: '.eq-name', qty: '.eq-qty', status: '.eq-status', remarks: '.eq-remarks' });
        fill('work', r.workAccomplished, { location: '.wk-location', scope: '.wk-scope', description: '.wk-desc', percentComplete: '.wk-pct' },
            (row, data) => { row.dataset.existingImage = data.image || ''; });
        fill('materials', r.materialsDelivered, { material: '.mat-name', qty: '.mat-qty', unit: '.mat-unit', supplier: '.mat-supplier' });
        fill('materialsUsed', r.materialsUsed, { material: '.mu-name', qty: '.mu-qty', unit: '.mu-unit', sow: '.mu-sow' });
        fill('issues', r.issues, { description: '.iss-desc', cause: '.iss-cause', timeLost: '.iss-time' },
            (row, data) => { row.dataset.existingImage = data.image || ''; });
        fill('visitors', r.visitors, { name: '.vis-name', company: '.vis-company', purpose: '.vis-purpose', timeIn: '.vis-time-in', timeOut: '.vis-time-out', remarks: '.vis-remarks' });
    },

    async deleteDailyRecordUI(id) {
        const ok = await Confirm.open('Delete draft?', 'The draft will be hidden and can be restored by a Super Admin for 30 days.');
        if (!ok) return;
        try {
            await DataService.deleteDailyRecord(id);
            UI.toast('Draft deleted.', 'success');
            await this.open(this._currentProjectId, true);   // v6.5: quiet refresh
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    viewRecord(index) {
        const records = this._dailyRecords || [];
        const record = records[index];
        if (!record) { UI.toast('Record not found.', 'error'); return; }
        PrintModal.open(record, this._recordMeta(record));
    },

    /** _recordMeta (v3/v8/v9) - Header info shared by every record modal.
     *  v8: preparedBy is the person's NAME (resolved by the backend
     *  from the Users sheet), never the raw email.
     *  v9: sowNames map so scope cells read "1.a — Excavation". */
    _recordMeta(record) {
        const sowNames = {};
        (this._sowItems || []).forEach(s => { sowNames[s.id] = s.description || ''; });
        return {
            projectName: (this._data && this._data.name) || this._currentProjectId || '',
            preparedBy: record.createdByName || record.createdBy || '',
            sowNames: sowNames
        };
    },

    async viewRecordById(id) {
        const p = this._data;
        if (!p) { UI.toast('Project data not loaded.', 'error'); return; }
        const record = (p.dailyRecords || []).find(r => r.id === id);
        if (!record) { UI.toast('Record not found.', 'error'); return; }
        PrintModal.open(record, this._recordMeta(record));
    },

    async submitDailyForApproval(recordId) {
        const confirmed = await Confirm.open('Submit for Approval?', 'Submit this daily record for approval?');
        if (!confirmed) return;
        try {
            await DataService.submitDailyRecordForApproval(recordId);
            UI.toast('Daily record submitted for approval.', 'success');
            await this.open(this._currentProjectId, true);   // v6.5: quiet refresh
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    async approveDailyRecord(recordId) {
        const confirmed = await Confirm.open('Approve Daily Record?', 'Approve this daily record?');
        if (!confirmed) return;
        try {
            await DataService.approveDailyRecord(recordId);
            UI.toast('Daily record approved.', 'success');
            await this.open(this._currentProjectId, true);   // v6.5: quiet refresh
            if (typeof ApprovalsPage !== 'undefined' && ApprovalsPage.load) ApprovalsPage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    async rejectDailyRecord(recordId) {
        const confirmed = await Confirm.open('Reject Daily Record?', 'Reject this daily record?');
        if (!confirmed) return;
        try {
            await DataService.rejectDailyRecord(recordId);
            UI.toast('Daily record rejected.', 'error');
            await this.open(this._currentProjectId, true);   // v6.5: quiet refresh
            if (typeof ApprovalsPage !== 'undefined' && ApprovalsPage.load) ApprovalsPage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    async forceApproveDailyRecord(recordId) {
        const confirmed = await Confirm.open('Force Approve?', 'As Super Admin, you can force approve this daily record instantly.');
        if (!confirmed) return;
        try {
            await DataService.approveDailyRecord(recordId);
            UI.toast('Daily record force-approved.', 'success');
            await this.open(this._currentProjectId, true);   // v6.5: quiet refresh
            if (typeof ApprovalsPage !== 'undefined' && ApprovalsPage.load) ApprovalsPage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    async forceRejectDailyRecord(recordId) {
        const confirmed = await Confirm.open('Force Reject?', 'As Super Admin, you can force reject this daily record instantly.');
        if (!confirmed) return;
        try {
            await DataService.rejectDailyRecord(recordId);
            UI.toast('Daily record force-rejected.', 'error');
            await this.open(this._currentProjectId, true);   // v6.5: quiet refresh
            if (typeof ApprovalsPage !== 'undefined' && ApprovalsPage.load) ApprovalsPage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    // ─── PHOTOS ────────────────────────────────────────────────
    /**
     * renderPhotos - Project photo gallery (v7.4)
     *
     * The photos already exist inside the daily records; previously they
     * were shown as one flat, unlabelled grid, which made it impossible
     * to answer questions like "what did the foundation look like in
     * May?" without opening every report.
     *
     * Each image now carries its provenance (date, SOW item, source
     * section), which enables three views:
     *   · By Date    - a site diary, newest first
     *   · By SOW     - every photo for one scope of work
     *   · Timeline   - one SOW across time, each photo paired with the
     *                  % complete recorded on that date, which is what
     *                  makes the gallery useful in client meetings and
     *                  in disputes.
     */
    renderPhotos(p) {
        const container = document.getElementById('proj-tab-photos');
        if (!container) return;

        // ── collect with provenance ──
        const sowName = {};
        (p.sowItems || []).forEach(s => { sowName[s.id] = s.description || s.id; });

        const items = [];
        (p.dailyRecords || []).forEach(record => {
            if (record.status === 'rejected') return;
            const date = record.date || '';
            (record.photos || []).forEach(u => {
                // v8: photos may be { url, caption } objects or plain URL strings
                const isObj = u && typeof u === 'object';
                items.push({
                    url: isObj ? u.url : u, date: date, sowId: '', source: 'General',
                    pct: null, note: isObj ? (u.caption || '') : ''
                });
            });
            (record.workAccomplished || []).forEach(w => {
                if (!w.image) return;
                items.push({
                    url: w.image, date: date, sowId: w.scope || '',
                    source: 'Work Accomplished',
                    pct: w.percentComplete !== undefined && w.percentComplete !== ''
                        ? parseFloat(w.percentComplete) : null
                });
            });
            (record.issues || []).forEach(iss => {
                if (!iss.image) return;
                items.push({
                    url: iss.image, date: date, sowId: '', source: 'Issue',
                    pct: null, note: iss.description || ''
                });
            });
        });

        const photos = items
            .filter(i => typeof i.url === 'string' && i.url.indexOf('http') === 0)
            .map(i => Object.assign({}, i, { url: driveImgSrc(i.url) }))
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));

        this._galleryItems = photos;
        if (!this._galleryView) this._galleryView = 'date';
        if (!this._gallerySow) this._gallerySow = '';

        const sowsWithPhotos = [...new Set(photos.filter(i => i.sowId).map(i => i.sowId))];

        let html = `
            <div class="section-head"><h2>Project Photos</h2><div class="rule"></div>
                <span class="badge">${photos.length} image${photos.length === 1 ? '' : 's'}</span>
            </div>`;

        if (!photos.length) {
            html += `<div class="panel"><div class="empty">
                <div class="empty-ico">${Icon.camera({size:12})}</div>
                <h4>No photos yet</h4>
                <p>Photos attached to Daily Site Records appear here automatically -
                   from the Photos section, work-accomplished rows, and issue reports.</p>
            </div></div>`;
            container.innerHTML = html;
            return;
        }

        html += `<div class="gallery-toolbar">
            <button class="btn-sm ${this._galleryView === 'date' ? 'primary' : ''}" onclick="ProjectPage.setGalleryView('date')">By Date</button>
            <button class="btn-sm ${this._galleryView === 'sow' ? 'primary' : ''}" onclick="ProjectPage.setGalleryView('sow')">By SOW</button>
            <button class="btn-sm ${this._galleryView === 'timeline' ? 'primary' : ''}" onclick="ProjectPage.setGalleryView('timeline')">Timeline</button>`;
        if (this._galleryView === 'timeline' || this._galleryView === 'sow') {
            html += `<select class="gallery-sow-select" onchange="ProjectPage.setGallerySow(this.value)">
                <option value="">All SOW items</option>
                ${sowsWithPhotos.map(id => `<option value="${id}" ${this._gallerySow === id ? 'selected' : ''}>${id} - ${(sowName[id] || '').slice(0, 40)}</option>`).join('')}
            </select>`;
        }
        html += `</div>`;

        const urls = photos.map(i => i.url);
        const tile = (i) => {
            const gi = urls.indexOf(i.url);
            return `<div class="gal-item" onclick="ProjectPage.openGalleryLightbox(${gi})">
                <img src="${i.url}" alt="${i.source}" loading="lazy" />
                ${i.sowId ? `<span class="gal-sow">${i.sowId}</span>` : ''}
                <span class="gal-meta">${i.source}${i.pct !== null && !isNaN(i.pct) ? ' · ' + i.pct + '%' : ''}</span>
            </div>`;
        };

        if (this._galleryView === 'date') {
            const byDate = {};
            photos.forEach(i => { (byDate[i.date] = byDate[i.date] || []).push(i); });
            Object.keys(byDate).sort((a, b) => b.localeCompare(a)).forEach(d => {
                html += `<div class="gal-group-head">${d || 'Undated'}<span class="rule"></span>
                    <span class="mono" style="font-size:10px;">${byDate[d].length} photo${byDate[d].length === 1 ? '' : 's'}</span></div>
                    <div class="gal-grid">${byDate[d].map(tile).join('')}</div>`;
            });
        } else if (this._galleryView === 'sow') {
            const list = this._gallerySow ? photos.filter(i => i.sowId === this._gallerySow) : photos;
            const bySow = {};
            list.forEach(i => { const k = i.sowId || 'General / Issues'; (bySow[k] = bySow[k] || []).push(i); });
            Object.keys(bySow).sort().forEach(k => {
                html += `<div class="gal-group-head">${k}${sowName[k] ? ' - ' + sowName[k] : ''}<span class="rule"></span>
                    <span class="mono" style="font-size:10px;">${bySow[k].length}</span></div>
                    <div class="gal-grid">${bySow[k].map(tile).join('')}</div>`;
            });
        } else {
            // Timeline: one SOW across time, oldest first, with the %
            // complete recorded on that date beside each photo.
            const sid = this._gallerySow || sowsWithPhotos[0] || '';
            const list = photos.filter(i => i.sowId === sid).sort((a, b) => String(a.date).localeCompare(String(b.date)));
            html += `<div class="gal-group-head">${sid}${sowName[sid] ? ' - ' + sowName[sid] : ''}<span class="rule"></span>
                <span class="mono" style="font-size:10px;">progress over time</span></div>`;
            if (!list.length) {
                html += `<div class="panel"><div class="empty"><p>No photos tagged to this SOW item yet.
                    Attach photos to work-accomplished rows to build a progress timeline.</p></div></div>`;
            } else {
                html += `<div class="gal-timeline">` + list.map(i => {
                    const gi = urls.indexOf(i.url);
                    return `<div class="gal-tl-item" onclick="ProjectPage.openGalleryLightbox(${gi})">
                        <div class="gal-tl-img"><img src="${i.url}" alt="${i.date}" loading="lazy" />
                            ${i.pct !== null && !isNaN(i.pct) ? `<span class="gal-tl-pct">${i.pct}%</span>` : ''}
                        </div>
                        <div class="gal-tl-cap">${i.date}</div>
                    </div>`;
                }).join('') + `</div>`;
            }
        }

        html += `<div class="data-source-note">Photos are collected from every non-rejected Daily Site Record - the Photos section, work-accomplished rows, and issue reports. Nothing is uploaded separately here.</div>`;
        container.innerHTML = html;
    },

    setGalleryView(v) {
        this._galleryView = v;
        this.renderPhotos(this._data);
    },

    setGallerySow(id) {
        this._gallerySow = id;
        this.renderPhotos(this._data);
    },

    openGalleryLightbox(idx) {
        const urls = (this._galleryItems || []).map(i => i.url);
        if (urls.length) Lightbox.open(urls, idx);
    },


});