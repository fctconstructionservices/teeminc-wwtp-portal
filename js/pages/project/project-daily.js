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
            <div class="daily-form-section"><div class="section-label">Date & Weather <span class="rule"></span></div>
                <div class="sub-fields">
                    <div class="field"><label>Date *</label><input type="date" id="dr-date" value="${today}" required /></div>
                    <div class="field"><label>Weather AM</label><input type="text" id="dr-weather-am" placeholder="e.g. Sunny" /></div>
                    <div class="field"><label>Weather PM</label><input type="text" id="dr-weather-pm" placeholder="e.g. Cloudy" /></div>
                </div>
            </div>
            <div class="daily-form-section" id="manpowerSection">
                <div class="section-label">Manpower <span class="rule"></span><span style="font-weight:400;font-size:10px;color:var(--ink-soft);" id="manpowerTotal">Total: 0</span></div>
                <div id="manpowerEntries"><div class="entry-row"><div class="field"><label>Trade / Role</label><select class="mp-role">${this._manpowerOptions()}</select></div><div class="field"><label>Number Present</label><input type="number" class="mp-count" placeholder="0" min="0" /></div><div class="field" style="grid-column:3/-1;display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'manpower')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('manpower')">+ Add Role</button></div>
                <div class="manpower-total" id="manpowerTotalDisplay">Total: 0</div>
            </div>
            <div class="daily-form-section" id="equipmentSection">
                <div class="section-label">Equipment on Site <span class="rule"></span></div>
                <div id="equipmentEntries"><div class="entry-row"><div class="field"><label>Equipment</label><select class="eq-name">${this._equipmentOptionsDaily()}</select></div><div class="field"><label>Qty</label><input type="number" class="eq-qty" placeholder="1" min="0" /></div><div class="field"><label>Status</label><input type="text" class="eq-status" placeholder="Operational" /></div><div class="field"><label>Remarks</label><input type="text" class="eq-remarks" placeholder="Optional" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'equipment')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('equipment')">+ Add Equipment</button></div>
            </div>
            <div class="daily-form-section" id="workSection">
                <div class="section-label">Work Accomplished <span class="rule"></span></div>
                <div id="workEntries"><div class="entry-row"><div class="field"><label>Location</label><input type="text" class="wk-location" /></div><div class="field"><label>Scope (SOW Item)</label><select class="wk-scope">${this._sowOptions()}</select></div><div class="field" style="grid-column:1/-1;"><label>Description</label><textarea class="wk-desc" rows="1"></textarea></div><div class="field"><label>% Complete</label><input type="number" class="wk-pct" min="0" max="100" /></div><div class="field"><label>Photo</label><input type="file" accept="image/*" class="wk-image" data-photo onchange="ProjectPage.previewSmallImage(this,'wk-preview-${Date.now()}')" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'work')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('work')">+ Add Work Item</button></div>
            </div>
            <div class="daily-form-section" id="materialsSection">
                <div class="section-label">Materials Delivered <span class="rule"></span></div>
                <div id="materialsEntries"><div class="entry-row"><div class="field"><label>Material</label><select class="mat-name" onchange="ProjectPage.syncMaterialUnit(this)">${this._materialOptionsDaily()}</select></div><div class="field"><label>Qty</label><input type="number" class="mat-qty" min="0" /></div><div class="field"><label>Unit</label><input type="text" class="mat-unit" readonly placeholder="auto" title="Filled automatically from the material database" /></div><div class="field"><label>Supplier / DR No.</label><input type="text" class="mat-supplier" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'materials')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('materials')">+ Add Material</button></div>
            </div>
            <div class="daily-form-section" id="materialsUsedSection">
                <div class="section-label">Materials Used <span class="rule"></span></div>
                <div id="materialsUsedEntries"><div class="entry-row"><div class="field"><label>Material (on-site only)</label><select class="mu-name" onchange="ProjectPage.syncUsedMaterialUnit(this)">${this._siteMaterialOptionsDaily()}</select></div><div class="field"><label>Qty Used</label><input type="number" class="mu-qty" min="0" /></div><div class="field"><label>Unit</label><input type="text" class="mu-unit" readonly placeholder="auto" /></div><div class="field"><label>Used For (SOW)</label><select class="mu-sow">${this._sowOptions()}</select></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'materialsUsed')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('materialsUsed')">+ Add Usage</button></div>
                <div class="muted" style="font-size:11px;color:var(--ink-soft);margin-top:4px;">Deducted from site stock (delivered − used). You can't log more than what remains.</div>
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
                <div id="photosEntries"><div class="entry-row"><div class="field"><label>Photo</label><input type="file" accept="image/*" class="photo-input" data-photo onchange="ProjectPage.previewSmallImage(this,'photo-preview-${Date.now()}')" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'photos')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('photos')">+ Add Photo</button></div>
            </div>
            <div class="submit-row">
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
    _sowOptions() {
        const items = this._sowItems || [];
        return '<option value="">Select SOW...</option>' +
            items.map(s => `<option value="${s.id}">${s.id} — ${(s.description || '').replace(/"/g, '&quot;')}</option>`).join('');
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
    /** syncMaterialUnit (v3) - Auto-fills the Unit from the selected material. */
    syncMaterialUnit(selectEl) {
        const row = selectEl.closest('.entry-row');
        if (!row) return;
        const unitInput = row.querySelector('.mat-unit');
        const opt = selectEl.selectedOptions[0];
        if (unitInput) unitInput.value = (opt && opt.dataset.unit) || '';
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
            manpower: getRows('manpower', { role: '.mp-role', count: '.mp-count' }),
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

        const photoInputs = document.querySelectorAll('#photosEntries input[type="file"][data-photo]');
        const photoPromises = [];
        photoInputs.forEach(input => {
            if (input.files && input.files.length > 0) {
                const file = input.files[0];
                photoPromises.push(fileToBase64_(file).then(base64 => {
                    return DataService.uploadImage(base64, file.name, file.type);
                }).catch(err => {
                    console.error('Photo upload error:', err);
                    return null;
                }));
            }
        });
        const photoResults = await Promise.all(photoPromises);
        data.photos = photoResults.filter(r => r && r.url).map(r => r.url);

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

    renderDailyRecords(p) {
        const container = document.getElementById('proj-tab-daily');
        const dailyRecords = p.dailyRecords || [];
        let html = `
            <div class="add-record-toggle">
                <button class="btn-ghost" onclick="ProjectPage.toggleAddRecord()">+ Add Daily Site Record</button>
            </div>
            <div class="add-record-form" id="dailyAddForm">
                ${this._buildDailyFormHTML()}
            </div>
            <div class="panel">
                <div class="panel-head">
                    <h3>Site Daily Log</h3>
                    <span class="mono" style="font-size:11px;color:var(--ink-soft)">${dailyRecords.length} entries</span>
                </div>
                <div class="daily-log-scroll" style="max-height:400px;overflow-y:auto;padding:8px 16px;">
        `;
        if (dailyRecords.length === 0) {
            html += `<div class="empty"><p>No daily records yet.</p></div>`;
        } else {
            const sorted = [...dailyRecords].sort((a,b) => new Date(b.date) - new Date(a.date));
            sorted.forEach((r) => {
                const totalManpower = r.manpower ? r.manpower.reduce((s, m) => s + (parseInt(m.count) || 0), 0) : 0;
                const dateObj = new Date(r.date);
                const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                const day = dateObj.getDate();

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
                    // v6.4: drafts are editable/deletable by their creator
                    // (super admin can also delete); frozen once submitted.
                    if (isCreator) {
                        actionsHtml = `
                            <button class="btn-sm primary" onclick="ProjectPage.submitDailyForApproval('${r.id}')">Submit</button>
                            <button class="btn-sm" onclick="ProjectPage.editDailyRecord('${r.id}')">Edit</button>
                            <button class="btn-sm danger" onclick="ProjectPage.deleteDailyRecordUI('${r.id}')">Delete</button>`;
                    } else if (isSuperAdmin) {
                        actionsHtml = `<button class="btn-sm danger" onclick="ProjectPage.deleteDailyRecordUI('${r.id}')">Delete</button>`;
                    } else {
                        actionsHtml = `<span style="font-size:10px;color:var(--ink-soft);">Draft (creator only)</span>`;
                    }
                } else if (r.status === 'pending') {
                    if (isCreator) {
                        actionsHtml = `<span style="font-size:10px;color:var(--ink-soft);">Waiting for approval</span>`;
                    } else if (isSuperAdmin) {
                        actionsHtml = `
                            <button class="btn-sm success" onclick="ProjectPage.forceApproveDailyRecord('${r.id}')">Force Approve</button>
                            <button class="btn-sm danger" onclick="ProjectPage.forceRejectDailyRecord('${r.id}')">Force Reject</button>
                        `;
                    } else if (isApprover) {
                        actionsHtml = `
                            <button class="btn-sm success" onclick="ProjectPage.approveDailyRecord('${r.id}')">Approve</button>
                            <button class="btn-sm danger" onclick="ProjectPage.rejectDailyRecord('${r.id}')">Reject</button>
                        `;
                    }
                }

                html += `
                    <div class="daily-record-item">
                        <div class="dr-badge">${day}</div>
                        <div class="dr-body">
                            <div class="dr-title">${formattedDate} · ${r.weatherAM || '—'} / ${r.weatherPM || '—'}</div>
                            <div class="dr-meta">
                                <time>${r.date || '—'}</time>
                                <span>${Icon.users({size:13})} ${totalManpower} people</span>
                                ${statusBadge}
                            </div>
                        </div>
                        <div class="dr-actions" style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
                            ${actionsHtml}
                            <button class="btn-sm" onclick="ProjectPage.viewRecordById('${r.id}')">${Icon.search({size:13})}</button>
                        </div>
                    </div>
                `;
            });
        }
        html += `</div></div>`;
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
        if (section === 'manpower') this.updateManpowerTotal();
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

    toggleAddRecord() {
        const form = document.getElementById('dailyAddForm');
        if (form) form.classList.toggle('open');
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
        const btn = form ? form.querySelector('.submit-row .btn-primary') : null;
        if (btn) btn.textContent = 'Update Draft';
        if (form && !document.getElementById('dailyEditBanner')) {
            const banner = document.createElement('div');
            banner.id = 'dailyEditBanner';
            banner.style.cssText = 'background:var(--blueprint-tint);border:1px solid var(--line);border-left:3px solid var(--blueprint);border-radius:8px;padding:9px 13px;font-size:12px;margin-bottom:12px;';
            banner.innerHTML = `✏️ Editing draft <b>${id}</b> (${r.date}). Existing photos are kept; new uploads will be added.`;
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

        fill('manpower', r.manpower, { role: '.mp-role', count: '.mp-count' });
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
        const ok = await Confirm.open('Delete draft?', 'This permanently removes the draft record. This cannot be undone.');
        if (!ok) return;
        try {
            await DataService.deleteDailyRecord(id);
            UI.toast('Draft deleted.', 'success');
            await this.open(this._currentProjectId);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    viewRecord(index) {
        const records = this._dailyRecords || [];
        const record = records[index];
        if (!record) { UI.toast('Record not found.', 'error'); return; }
        PrintModal.open(record, this._recordMeta(record));
    },

    /** _recordMeta (v3) - Header info shared by every record modal. */
    _recordMeta(record) {
        return {
            projectName: (this._data && this._data.name) || this._currentProjectId || '',
            preparedBy: record.createdBy || ''
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
            await this.open(this._currentProjectId);
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
            await this.open(this._currentProjectId);
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
            await this.open(this._currentProjectId);
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
            await this.open(this._currentProjectId);
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
            await this.open(this._currentProjectId);
            if (typeof ApprovalsPage !== 'undefined' && ApprovalsPage.load) ApprovalsPage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    // ─── PHOTOS ────────────────────────────────────────────────
    renderPhotos(p) {
        const container = document.getElementById('proj-tab-photos');
        // v5 (item 10): the gallery never included record.photos — the
        // photos users actually upload on the daily form — and old rows
        // contain fakepath junk. Collect everything, keep only real URLs,
        // and rewrite Drive viewer links to embeddable thumbnails.
        let images = [];
        (p.dailyRecords || []).forEach(record => {
            (record.photos || []).forEach(u => images.push(u));
            (record.workAccomplished || []).forEach(w => { if (w.image) images.push(w.image); });
            (record.issues || []).forEach(iss => { if (iss.image) images.push(iss.image); });
        });
        images = images
            .filter(u => typeof u === 'string' && u.indexOf('http') === 0)
            .map(u => driveImgSrc(u));
        if (images.length === 0) {
            images.push('https://placehold.co/600x400/24455A/FFFFFF?text=No+Photos');
        }

        let html = `<div class="section-head"><h2>Project Photos</h2><div class="rule"></div><span class="badge">${images.length} images</span></div>
                <div class="photo-grid">`;
        images.forEach((img, idx) => {
            html += `
                    <div class="photo-item" onclick="Lightbox.open(${JSON.stringify(images)}, ${idx})">
                        <img src="${img}" alt="Project photo" />
                    </div>`;
        });
        html += `</div>`;
        container.innerHTML = html;
        this._photoImages = images;
    },

});