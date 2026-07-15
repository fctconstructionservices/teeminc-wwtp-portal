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
                        <div style="font-family:'Oswald',sans-serif;font-size:16px;text-transform:uppercase;letter-spacing:0.05em;">FCTC Construction Services</div>
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
                <div id="manpowerEntries"><div class="entry-row"><div class="field"><label>Trade / Role</label><input type="text" class="mp-role" placeholder="e.g. Foreman" /></div><div class="field"><label>Number Present</label><input type="number" class="mp-count" placeholder="0" min="0" /></div><div class="field" style="grid-column:3/-1;display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'manpower')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('manpower')">+ Add Role</button></div>
                <div class="manpower-total" id="manpowerTotalDisplay">Total: 0</div>
            </div>
            <div class="daily-form-section" id="equipmentSection">
                <div class="section-label">Equipment on Site <span class="rule"></span></div>
                <div id="equipmentEntries"><div class="entry-row"><div class="field"><label>Equipment</label><input type="text" class="eq-name" placeholder="e.g. Excavator" /></div><div class="field"><label>Qty</label><input type="number" class="eq-qty" placeholder="1" min="0" /></div><div class="field"><label>Status</label><input type="text" class="eq-status" placeholder="Operational" /></div><div class="field"><label>Remarks</label><input type="text" class="eq-remarks" placeholder="Optional" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'equipment')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('equipment')">+ Add Equipment</button></div>
            </div>
            <div class="daily-form-section" id="workSection">
                <div class="section-label">Work Accomplished <span class="rule"></span></div>
                <div id="workEntries"><div class="entry-row"><div class="field"><label>Location</label><input type="text" class="wk-location" /></div><div class="field"><label>Scope</label><input type="text" class="wk-scope" /></div><div class="field" style="grid-column:1/-1;"><label>Description</label><textarea class="wk-desc" rows="1"></textarea></div><div class="field"><label>% Complete</label><input type="number" class="wk-pct" min="0" max="100" /></div><div class="field"><label>Photo</label><input type="file" accept="image/*" class="wk-image" data-photo onchange="ProjectPage.previewSmallImage(this,'wk-preview-${Date.now()}')" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'work')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('work')">+ Add Work Item</button></div>
            </div>
            <div class="daily-form-section" id="materialsSection">
                <div class="section-label">Materials Delivered <span class="rule"></span></div>
                <div id="materialsEntries"><div class="entry-row"><div class="field"><label>Material</label><input type="text" class="mat-name" /></div><div class="field"><label>Qty</label><input type="number" class="mat-qty" min="0" /></div><div class="field"><label>Unit</label><input type="text" class="mat-unit" /></div><div class="field"><label>Supplier / DR No.</label><input type="text" class="mat-supplier" /></div><div class="field" style="display:flex;gap:6px;align-items:end;justify-content:flex-end;"><button class="btn-sm danger" onclick="ProjectPage.removeEntry(this,'materials')">${Icon.close({size:13})}</button></div></div></div>
                <div class="add-btn-row"><button class="btn-sm primary" onclick="ProjectPage.addEntry('materials')">+ Add Material</button></div>
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
            issues: getRows('issues', { description: '.iss-desc', cause: '.iss-cause', timeLost: '.iss-time', image: '.iss-image' }),
            visitors: getRows('visitors', { name: '.vis-name', company: '.vis-company', purpose: '.vis-purpose', timeIn: '.vis-time-in', timeOut: '.vis-time-out', remarks: '.vis-remarks' }),
            photos: []
        };
    },

    async submitDailyRecord(projectId) {
        const data = this.gatherDailyFormData();
        if (!data.date) { UI.toast('Please select a date.', 'error'); return; }

        const existingRecords = this._data ? this._data.dailyRecords : [];
        const duplicate = existingRecords.some(record => {
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

        const confirmed = await Confirm.open('Save Daily Record?', `Save record for ${data.date}?`);
        if (!confirmed) return;
        try {
            await DataService.addDailyRecord(projectId, data);
            UI.toast('Daily record saved as draft!', 'success');
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
                    if (isCreator) {
                        actionsHtml = `<button class="btn-sm primary" onclick="ProjectPage.submitDailyForApproval('${r.id}')">Submit</button>`;
                    } else {
                        actionsHtml = `<span style="font-size:10px;color:var(--ink-soft);">Can't submit</span>`;
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
    },

    viewRecord(index) {
        const records = this._dailyRecords || [];
        const record = records[index];
        if (!record) { UI.toast('Record not found.', 'error'); return; }
        PrintModal.open(record);
    },

    async viewRecordById(id) {
        const p = this._data;
        if (!p) { UI.toast('Project data not loaded.', 'error'); return; }
        const record = (p.dailyRecords || []).find(r => r.id === id);
        if (!record) { UI.toast('Record not found.', 'error'); return; }
        PrintModal.open(record);
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
        const images = p.photos || [];
        (p.dailyRecords || []).forEach(record => {
            if (record.workAccomplished) {
                record.workAccomplished.forEach(w => { if (w.image) images.push(w.image); });
            }
            if (record.issues) {
                record.issues.forEach(iss => { if (iss.image) images.push(iss.image); });
            }
        });
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
