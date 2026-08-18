// ================================================================
//  pages/project/project-siteops.js — Punchlist, Safety, Drawings (v9)
//
//  PURPOSE: Extends ProjectPage with the three site-ops tabs:
//    PUNCHLIST — defects/for-correction with before & after photos,
//                Open → Closed lifecycle (closing needs the AFTER
//                photo as proof, Super Admin can override/delete).
//    SAFETY    — toolbox talks, inspections, incidents, near-misses,
//                violations with severity + action taken.
//    DRAWINGS  — drawing/plan register with Drive file uploads and
//                revision control (same drawing no. supersedes).
//  Data comes with getProjectData (p.punchlist, p.safetyRecords,
//  p.drawings) — no extra round-trips on open.
// ================================================================

Object.assign(ProjectPage, {

    // ─────────────────────────────────────────────────────────
    //  PUNCHLIST
    // ─────────────────────────────────────────────────────────

    _plFilter: 'Open',

    renderPunchlist(p) {
        const container = document.getElementById('proj-tab-punchlist');
        if (!container) return;
        const items = p.punchlist || [];
        const isSuper = (App.getUser() || {}).role === 'superadmin';
        const open = items.filter(i => i.status === 'Open');
        const closed = items.filter(i => i.status === 'Closed');
        const list = this._plFilter === 'Open' ? open : closed;
        const prioCls = pr => pr === 'High' ? 'rejected' : pr === 'Low' ? 'approved' : 'pending';

        let html = `
            <div class="section-head"><h2>Punchlist</h2><div class="rule"></div>
                ${this._canEdit !== false ? `<button class="btn-primary" style="padding:6px 14px;font-size:11px;" onclick="ProjectPage.openPunchModal()">+ Raise Item</button>` : ''}
            </div>
            <div class="status-tabs">
                <button class="${this._plFilter === 'Open' ? 'active' : ''}" onclick="ProjectPage._plFilter='Open';ProjectPage.renderPunchlist(ProjectPage._data)">${Icon.warning({size:13})} Open (${open.length})</button>
                <button class="${this._plFilter === 'Closed' ? 'active' : ''}" onclick="ProjectPage._plFilter='Closed';ProjectPage.renderPunchlist(ProjectPage._data)">${Icon.checkCircle({size:13})} Closed (${closed.length})</button>
            </div>`;

        if (!list.length) {
            html += `<div class="empty"><p>${this._plFilter === 'Open' ? 'No open punchlist items. Use "Raise item" to log a defect or a correction.' : 'No closed items yet.'}</p></div>`;
        } else {
            list.forEach(it => {
                html += `
                <div class="panel" style="margin-bottom:10px;">
                    <div style="padding:12px 14px;display:grid;grid-template-columns:1fr auto;gap:10px;">
                        <div>
                            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">
                                <span class="req-id">${it.id}</span>
                                <b style="font-size:13px;">${esc(it.item)}</b>
                                <span class="stamp ${prioCls(it.priority)}" style="transform:none;padding:1px 8px;font-size:9px;">${it.priority || 'Medium'}</span>
                                ${it.sowId ? `<span class="mono" style="font-size:10.5px;color:var(--ink-soft);">${it.sowId}</span>` : ''}
                            </div>
                            <div style="font-size:11.5px;color:var(--ink-soft);">
                                ${it.location ? `${Icon.pin({size:11})} ${esc(it.location)} &middot; ` : ''}${it.assignedTo ? `${Icon.user({size:11})} ${it.assignedTo} &middot; ` : ''}${it.dueDate ? `${Icon.calendar({size:11})} Due ${it.dueDate} &middot; ` : ''}Raised by ${it.raisedBy || '—'}
                                ${it.status === 'Closed' ? ` · <span style="color:var(--green,#2F7A46);">Closed ${it.closedAt || ''} by ${it.closedBy || ''}</span>` : ''}
                            </div>
                            ${it.remarks ? `<div style="font-size:11.5px;margin-top:4px;">${esc(it.remarks)}</div>` : ''}
${AttachmentGallery.render([
                                it.beforeImage ? { url: it.beforeImage, name: 'Before (finding)' } : null,
                                it.afterImage ? { url: it.afterImage, name: 'After (rectified)' } : null
                              ].filter(Boolean), 'Photos')}
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                            ${it.status === 'Open' && this._canEdit !== false ? `<button class="btn-sm success" onclick="ProjectPage.openPunchCloseModal('${it.id}')">${Icon.check({size:12})} Close</button>` : ''}
                            ${it.status === 'Closed' && isSuper ? `<button class="btn-sm" onclick="ProjectPage.reopenPunchItem('${it.id}')">${Icon.restore({size:12})} Re-open</button>` : ''}
                            ${isSuper ? `<button class="btn-sm danger" onclick="ProjectPage.deletePunchItem('${it.id}')">${Icon.trash({size:12})}</button>` : ''}
                        </div>
                    </div>
                </div>`;
            });
        }
        html += `<div class="data-source-note">Closing an item requires an <b>AFTER photo</b> as proof of rectification; the Super Admin can override this. Follow up open items past their due date with the person assigned.</div>`;
        container.innerHTML = html;
    },

    openPunchModal() {
        const existing = document.getElementById('punchModal');
        if (existing) existing.remove();
        const sows = this._sowItems || [];
        const people = (this._data && this._data.personnel) || [];
        const overlay = document.createElement('div');
        overlay.id = 'punchModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;max-width:520px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:13px 18px;border-bottom:1px solid var(--line);background:var(--blueprint-tint);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">${Icon.punchlist({size:13})} Raise Punchlist Item</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('punchModal').remove()">${Icon.close({size:12})}</span>
                </div>
                <div style="padding:14px 18px;overflow:auto;">
                    <div class="field"><label>Item / Defect *</label><input type="text" id="pl-item" placeholder="e.g. Honeycomb sa retaining wall footing" /></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
                        <div class="field"><label>Location</label><input type="text" id="pl-location" placeholder="e.g. NF2 Cell 2, gridline B" /></div>
                        <div class="field"><label>Related SOW</label><select id="pl-sow"><option value="">— none —</option>${sows.map(s => `<option value="${s.id}">${s.id} — ${s.description || ''}</option>`).join('')}</select></div>
                        <div class="field"><label>Priority</label><select id="pl-priority"><option>High</option><option selected>Medium</option><option>Low</option></select></div>
                        <div class="field"><label>Due Date</label><input type="date" id="pl-due" /></div>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>Assigned To</label>
                        <input type="text" id="pl-assigned" list="pl-people" placeholder="Name or subcontractor" />
                        <datalist id="pl-people">${people.map(pp => `<option value="${esc(pp.name)}"></option>`).join('')}</datalist>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>Remarks</label><input type="text" id="pl-remarks" /></div>
                    <div class="field" style="margin-top:6px;"><label>BEFORE Photo (finding)</label><input type="file" accept="image/*" id="pl-before" /></div>
                </div>
                <div style="padding:12px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn-ghost" onclick="document.getElementById('punchModal').remove()">Cancel</button>
                    <button class="btn-primary" onclick="ProjectPage.submitPunchItem()">Raise Item</button>
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    },

    async submitPunchItem() {
        const item = (document.getElementById('pl-item')?.value || '').trim();
        if (!item) { UI.toast('Describe the item/defect.', 'error'); return; }
        let beforeImage = '';
        const f = document.getElementById('pl-before')?.files?.[0];
        try {
            if (f) {
                const b64 = await fileToBase64_(f);
                const up = await DataService.uploadImage(b64, f.name, f.type);
                beforeImage = (up && up.url) || '';
            }
            const res = await DataService.addPunchlistItem({
                projectId: this._currentProjectId,
                item: item,
                location: document.getElementById('pl-location')?.value || '',
                sowId: document.getElementById('pl-sow')?.value || '',
                priority: document.getElementById('pl-priority')?.value || 'Medium',
                assignedTo: document.getElementById('pl-assigned')?.value || '',
                dueDate: document.getElementById('pl-due')?.value || '',
                remarks: document.getElementById('pl-remarks')?.value || '',
                beforeImage: beforeImage
            });
            UI.toast(`${res.id} raised.`, 'success');
            document.getElementById('punchModal')?.remove();
            await this._refreshSiteOps('punchlist');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    openPunchCloseModal(id) {
        const existing = document.getElementById('punchCloseModal');
        if (existing) existing.remove();
        const isSuper = (App.getUser() || {}).role === 'superadmin';
        const overlay = document.createElement('div');
        overlay.id = 'punchCloseModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;max-width:440px;width:100%;">
                <div style="padding:13px 18px;border-bottom:1px solid var(--line);background:var(--blueprint-tint);">
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">${Icon.check({size:12})} Close ${id}</h3>
                </div>
                <div style="padding:14px 18px;">
                    <div class="field"><label>AFTER Photo (proof of rectification) ${isSuper ? '' : '*'}</label><input type="file" accept="image/*" id="plc-after" /></div>
                    <div class="field" style="margin-top:6px;"><label>Closing Remarks</label><input type="text" id="plc-remarks" placeholder="e.g. Chipped and re-grouted, inspected OK" /></div>
                    ${isSuper ? '<div style="font-size:10.5px;color:var(--ink-soft);margin-top:6px;">Super Admin: you may close this without an after photo.</div>' : '<div style="font-size:10.5px;color:var(--ink-soft);margin-top:6px;">An AFTER photo is required as proof before this can be closed.</div>'}
                </div>
                <div style="padding:12px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn-ghost" onclick="document.getElementById('punchCloseModal').remove()">Cancel</button>
                    <button class="btn-primary" onclick="ProjectPage.submitPunchClose('${id}')">Close Item</button>
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    },

    async submitPunchClose(id) {
        const isSuper = (App.getUser() || {}).role === 'superadmin';
        const f = document.getElementById('plc-after')?.files?.[0];
        if (!f && !isSuper) { UI.toast('Attach the AFTER photo as proof of rectification.', 'error'); return; }
        try {
            let afterImage;
            if (f) {
                const b64 = await fileToBase64_(f);
                const up = await DataService.uploadImage(b64, f.name, f.type);
                afterImage = (up && up.url) || '';
            }
            const remarks = document.getElementById('plc-remarks')?.value || '';
            const payload = { status: 'Closed' };
            if (afterImage !== undefined) payload.afterImage = afterImage;
            if (remarks) payload.remarks = remarks;
            await DataService.updatePunchlistItem(id, payload);
            UI.toast(`${id} closed.`, 'success');
            document.getElementById('punchCloseModal')?.remove();
            await this._refreshSiteOps('punchlist');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async reopenPunchItem(id) {
        const ok = await Confirm.open(`Re-open ${id}?`, 'The item goes back to the Open list.');
        if (!ok) return;
        try {
            await DataService.updatePunchlistItem(id, { status: 'Open' });
            UI.toast(`${id} re-opened.`, 'success');
            await this._refreshSiteOps('punchlist');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async deletePunchItem(id) {
        const ok = await Confirm.open(`Delete ${id}?`, 'Super Admin only. This cannot be undone.');
        if (!ok) return;
        try {
            await DataService.deletePunchlistItem(id);
            UI.toast(`${id} deleted.`, 'success');
            await this._refreshSiteOps('punchlist');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    // ─────────────────────────────────────────────────────────
    //  SAFETY
    // ─────────────────────────────────────────────────────────

    _sfFilter: '',

    renderSafety(p) {
        const container = document.getElementById('proj-tab-safety');
        if (!container) return;
        const records = (p.safetyRecords || []).slice().sort((a, b) => String(b.recordDate).localeCompare(String(a.recordDate)));
        const types = ['Toolbox Talk', 'Inspection', 'Incident', 'Near Miss', 'Violation'];
        const list = this._sfFilter ? records.filter(r => r.recordType === this._sfFilter) : records;
        const incidents = records.filter(r => r.recordType === 'Incident').length;
        const nearMiss = records.filter(r => r.recordType === 'Near Miss').length;
        const talks = records.filter(r => r.recordType === 'Toolbox Talk').length;
        const sevCls = sv => sv === 'Major' || sv === 'Fatal' ? 'rejected' : sv === 'Minor' ? 'pending' : 'approved';
        const typeIcon = t => t === 'Toolbox Talk' ? Icon.megaphone({size:12}) : t === 'Inspection' ? Icon.search({size:12}) : t === 'Incident' ? Icon.siren({size:12}) : t === 'Near Miss' ? Icon.warning({size:12}) : Icon.ban({size:12});
        // v11 BATCH D: records now carry an ARRAY of photos. The backend
        // sends `attachments` ready to use and folds any legacy single
        // `image` into it, so pre-v11 rows render identically. The
        // fallback here covers a stale cached payload.
        const photosOf = r => (r.attachments && r.attachments.length)
            ? r.attachments
            : (r.image ? [{ url: r.image, name: 'Photo' }] : []);
        const isSuper = (App.getUser() || {}).role === 'superadmin';

        let html = `
            <div class="section-head"><h2>Safety</h2><div class="rule"></div>
                ${this._canEdit !== false ? `<button class="btn-primary" style="padding:6px 14px;font-size:11px;" onclick="ProjectPage.openSafetyModal()">+ Log Safety Record</button>` : ''}
            </div>
            <div class="kpi-strip" style="margin-bottom:12px;">
                <div class="kpi-card ${incidents ? 'bad' : 'good'}"><div class="k-label">Incidents</div><div class="k-val">${incidents}</div><div class="k-sub">recorded on this project</div></div>
                <div class="kpi-card ${nearMiss ? 'warn' : 'good'}"><div class="k-label">Near Misses</div><div class="k-val">${nearMiss}</div><div class="k-sub">reported — good reporting culture</div></div>
                <div class="kpi-card"><div class="k-label">Toolbox Talks</div><div class="k-val">${talks}</div><div class="k-sub">conducted</div></div>
            </div>
            <div class="status-tabs">
                <button class="${!this._sfFilter ? 'active' : ''}" onclick="ProjectPage._sfFilter='';ProjectPage.renderSafety(ProjectPage._data)">All (${records.length})</button>
                ${types.map(t => `<button class="${this._sfFilter === t ? 'active' : ''}" onclick="ProjectPage._sfFilter='${t}';ProjectPage.renderSafety(ProjectPage._data)">${typeIcon(t)} ${t} (${records.filter(r => r.recordType === t).length})</button>`).join('')}
            </div>`;

        if (!list.length) {
            html += `<div class="empty"><p>No safety records${this._sfFilter ? ' of this type' : ''} yet. Log toolbox talks, inspections, and near misses; they matter for safety culture and client audits.</p></div>`;
        } else {
            html += `<div class="panel"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Severity</th><th>Persons Involved</th><th>Action Taken</th><th>By</th><th></th></tr></thead><tbody>`;
            list.forEach(r => {
                html += `<tr>
                    <td class="mono" style="font-size:11px;white-space:nowrap;">${r.recordDate || '—'}</td>
                    <td style="white-space:nowrap;">${typeIcon(r.recordType)} ${r.recordType}</td>
                    <td>${r.description || '—'}${photosOf(r).length ? `<div style="margin-top:5px">${AttachmentGallery.render(photosOf(r), '')}</div>` : ''}</td>
                    <td>${r.severity ? `<span class="stamp ${sevCls(r.severity)}" style="transform:none;padding:1px 8px;font-size:9px;">${r.severity}</span>` : '—'}</td>
                    <td style="font-size:11.5px;">${r.personsInvolved || '—'}</td>
                    <td style="font-size:11.5px;">${r.actionTaken || '—'}</td>
                    <td style="font-size:11px;">${r.reportedBy || '—'}</td>
                    <td style="white-space:nowrap;">
                        ${r.status === 'Open' && this._canEdit !== false ? `<button class="btn-sm success" title="Mark closed or resolved" onclick="ProjectPage.closeSafetyRecord('${r.id}')">${Icon.check({size:12})}</button>` : (r.status === 'Closed' ? '<span class="stamp approved" style="transform:none;padding:1px 8px;font-size:9px;">Closed</span>' : '')}
                        ${this._canEdit !== false ? `<button class="btn-sm" title="Add more photos to this record" onclick="ProjectPage.addSafetyPhotos('${r.id}')">${Icon.camera({size:12})}</button>` : ''}
                        ${isSuper ? `<button class="btn-sm danger" title="Delete this safety record (Super Admin)" onclick="ProjectPage.deleteSafetyRecordUI('${r.id}')">${Icon.trash({size:12})}</button>` : ''}
                    </td>
                </tr>`;
            });
            html += `</tbody></table></div>`;
        }
        html += `<div class="data-source-note">Types: <b>Toolbox Talk</b> (daily safety briefing), <b>Inspection</b>, <b>Incident</b> (an accident or injury occurred), <b>Near Miss</b> (nothing happened but it nearly did &mdash; report it so it can be prevented), <b>Violation</b> (safety rules were not followed).</div>`;
        container.innerHTML = html;
    },

    openSafetyModal() {
        const existing = document.getElementById('safetyModal');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'safetyModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;max-width:520px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:13px 18px;border-bottom:1px solid var(--line);background:var(--blueprint-tint);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">${Icon.safety({size:13})} Log Safety Record</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('safetyModal').remove()">${Icon.close({size:12})}</span>
                </div>
                <div style="padding:14px 18px;overflow:auto;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div class="field"><label>Type *</label><select id="sf-type"><option>Toolbox Talk</option><option>Inspection</option><option>Incident</option><option>Near Miss</option><option>Violation</option></select></div>
                        <div class="field"><label>Date *</label><input type="date" id="sf-date" value="${new Date().toISOString().slice(0, 10)}" /></div>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>Description *</label><textarea id="sf-desc" rows="2" placeholder="What happened, what was discussed, or what was observed"></textarea></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
                        <div class="field"><label>Severity (for incidents)</label><select id="sf-severity"><option value="">—</option><option>First Aid</option><option>Minor</option><option>Major</option><option>Fatal</option></select></div>
                        <div class="field"><label>Persons Involved</label><input type="text" id="sf-persons" placeholder="Names / crew" /></div>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>Action Taken / Corrective Action</label><input type="text" id="sf-action" /></div>
                    <div class="field" style="margin-top:6px;">
                        <label>Photos (optional)</label>
                        <input type="file" accept="image/*" id="sf-image" multiple />
                        <p style="font-size:11px;color:var(--ink-soft);margin-top:4px;">Select several at once. An incident usually needs the scene, the equipment and the corrective action; a toolbox talk needs the attendance sheet as well as the briefing.</p>
                        <div id="sf-filelist" style="font-size:11px;color:var(--ink-soft);margin-top:4px;"></div>
                    </div>
                </div>
                <div style="padding:12px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn-ghost" onclick="document.getElementById('safetyModal').remove()">Cancel</button>
                    <button class="btn-primary" onclick="ProjectPage.submitSafetyRecord()">Log Record</button>
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        // name the chosen files back to the user — with a multi-select
        // it is otherwise impossible to tell how many were picked
        document.getElementById('sf-image')?.addEventListener('change', function () {
            const list = document.getElementById('sf-filelist');
            const n = this.files ? this.files.length : 0;
            list.textContent = n
                ? `${n} photo${n === 1 ? '' : 's'} selected: ` + Array.from(this.files).map(f => f.name).join(', ')
                : '';
        });
    },

    /**
     * _uploadSafetyPhotos (v11 BATCH D) - Uploads a FileList and returns
     * [{url, name}]. Uploads run one at a time rather than in parallel:
     * Apps Script serializes write requests anyway, and a burst of
     * parallel uploads from a phone on site data was the reliable way to
     * get a timeout halfway through and lose the whole record.
     */
    async _uploadSafetyPhotos(files, onProgress) {
        const out = [];
        const list = Array.from(files || []);
        for (let i = 0; i < list.length; i++) {
            const f = list[i];
            if (onProgress) onProgress(i + 1, list.length, f.name);
            const b64 = await fileToBase64_(f);
            const up = await DataService.uploadImage(b64, f.name, f.type);
            if (up && up.url) out.push({ url: up.url, name: f.name });
        }
        return out;
    },

    /**
     * addSafetyPhotos (v11 BATCH D) - Appends photos to an existing
     * record. The corrective-action photo often only exists days after
     * the incident was filed, and before this the record was frozen with
     * whatever single image it was created with.
     */
    async addSafetyPhotos(id) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = async () => {
            if (!input.files || !input.files.length) return;
            try {
                UI.toast(`Uploading ${input.files.length} photo(s)...`, 'success');
                const attachments = await this._uploadSafetyPhotos(input.files);
                if (!attachments.length) { UI.toast('No photos were uploaded.', 'error'); return; }
                await DataService.updateSafetyRecord(id, { addAttachments: attachments });
                UI.toast(`${attachments.length} photo(s) added to ${id}.`, 'success');
                await this._refreshSiteOps('safety');
            } catch (err) { UI.toast('' + err.message, 'error'); }
        };
        input.click();
    },

    /** deleteSafetyRecordUI (v11 BATCH D) - Super Admin only. */
    async deleteSafetyRecordUI(id) {
        const ok = await Confirm.open(`Delete ${id}?`,
            'This removes the record from the project safety history permanently. That history is what a client audit reads, so delete only genuine mistakes — close the record instead if the issue was simply resolved.');
        if (!ok) return;
        try {
            await DataService.deleteSafetyRecord(id);
            UI.toast(`${id} deleted.`, 'success');
            await this._refreshSiteOps('safety');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async submitSafetyRecord() {
        const desc = (document.getElementById('sf-desc')?.value || '').trim();
        if (!desc) { UI.toast('Description is required.', 'error'); return; }
        try {
            // v11 BATCH D: many photos, uploaded sequentially with the
            // progress reported, because on site data a silent 30-second
            // pause reads as a broken button and people tap it again.
            const files = document.getElementById('sf-image')?.files;
            const attachments = await this._uploadSafetyPhotos(files, (i, n, name) => {
                UI.toast(`Uploading photo ${i} of ${n}: ${name}`, 'success');
            });
            const type = document.getElementById('sf-type')?.value;
            const res = await DataService.addSafetyRecord({
                projectId: this._currentProjectId,
                recordType: type,
                recordDate: document.getElementById('sf-date')?.value,
                description: desc,
                severity: document.getElementById('sf-severity')?.value || '',
                personsInvolved: document.getElementById('sf-persons')?.value || '',
                actionTaken: document.getElementById('sf-action')?.value || '',
                attachments: attachments,
                // talks/inspections are records, not open issues
                status: (type === 'Toolbox Talk' || type === 'Inspection') ? 'Closed' : 'Open'
            });
            UI.toast(`${res.id} logged.`, 'success');
            document.getElementById('safetyModal')?.remove();
            await this._refreshSiteOps('safety');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async closeSafetyRecord(id) {
        const ok = await Confirm.open(`Close ${id}?`, 'Marks the record as resolved/closed.');
        if (!ok) return;
        try {
            await DataService.updateSafetyRecord(id, { status: 'Closed' });
            UI.toast(`${id} closed.`, 'success');
            await this._refreshSiteOps('safety');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    // ─────────────────────────────────────────────────────────
    //  DRAWING PLANS
    // ─────────────────────────────────────────────────────────

    _dwgFilter: 'Current',

    renderDrawings(p) {
        const container = document.getElementById('proj-tab-drawings');
        if (!container) return;
        const drawings = (p.drawings || []).slice().sort((a, b) => String(a.drawingNo).localeCompare(String(b.drawingNo)));
        const isSuper = (App.getUser() || {}).role === 'superadmin';
        const current = drawings.filter(d => d.status === 'Current');
        const superseded = drawings.filter(d => d.status !== 'Current');
        const list = this._dwgFilter === 'Current' ? current : superseded;

        let html = `
            <div class="section-head"><h2>Drawing Plans</h2><div class="rule"></div>
                ${this._canEdit !== false ? `<button class="btn-primary" style="padding:6px 14px;font-size:11px;" onclick="ProjectPage.openDrawingModal()">+ Upload Drawing</button>` : ''}
            </div>
            <div class="status-tabs">
                <button class="${this._dwgFilter === 'Current' ? 'active' : ''}" onclick="ProjectPage._dwgFilter='Current';ProjectPage.renderDrawings(ProjectPage._data)">${Icon.checkCircle({size:13})} Current (${current.length})</button>
                <button class="${this._dwgFilter === 'Superseded' ? 'active' : ''}" onclick="ProjectPage._dwgFilter='Superseded';ProjectPage.renderDrawings(ProjectPage._data)">${Icon.folder({size:13})} Superseded (${superseded.length})</button>
            </div>`;

        if (!list.length) {
            html += `<div class="empty"><p>${this._dwgFilter === 'Current' ? 'No drawings yet. Upload the plans as PDF or image so the site always has the latest revision.' : 'No superseded drawings.'}</p></div>`;
        } else {
            // ── v23: THE DRAWING, NOT A ROW ABOUT THE DRAWING ──
            //
            // This was a table. To find the right plan you read seven
            // columns, opened a file, decided it was the wrong one, went
            // back and opened another. On a phone at the working face
            // that is slow enough that people stop doing it and work
            // from the printed copy in the site office — which is the
            // one that is out of date.
            //
            // A drawing is a visual thing. Showing it is the point.
            html += `<div class="dwg-grid">`;
            list.forEach(d => {
                const pdf = /\.pdf(\?|$)/i.test(String(d.fileName || d.fileUrl || ''));
                html += `<figure class="dwg-card${d.status !== 'Current' ? ' is-old' : ''}">
                    <a class="dwg-thumb${pdf ? ' no-preview' : ''}" href="${escUrl(d.fileUrl)}"
                       target="_blank" rel="noopener" title="Open ${esc(d.drawingNo)}">
                        ${d.fileUrl && !pdf
                            ? `<img src="${driveImgSrc(d.fileUrl)}" alt="${esc(d.title)}" loading="lazy"
                                 onerror="this.parentNode.classList.add('no-preview')" />`
                            : ''}
                        <!-- Drive gives no inline preview for a PDF, so it gets an
                             honest placeholder rather than a broken image. -->
                        <span class="dwg-fallback">${Icon.fileText({ size: 26 })}
                            <em>${pdf ? 'PDF' : 'No preview'}</em></span>
                        <span class="dwg-rev">Rev ${esc(d.revision || '0')}</span>
                        ${d.status !== 'Current' ? `<span class="dwg-old">Superseded</span>` : ''}
                    </a>
                    <figcaption>
                        <b>${esc(d.drawingNo)}</b>
                        <span class="dwg-title">${esc(d.title) || '—'}</span>
                        <span class="dwg-meta">${esc(d.discipline) || '—'}${d.drawingDate ? ' · ' + esc(d.drawingDate) : ''}</span>
                        ${d.remarks ? `<span class="dwg-note">${esc(d.remarks)}</span>` : ''}
                        <span class="dwg-actions">
                            <a class="btn-sm" href="${escUrl(d.fileUrl)}" target="_blank" rel="noopener">Open</a>
                            ${isSuper ? `<button class="btn-sm danger"
                                onclick="ProjectPage.deleteDrawingItem('${esc(d.id)}')">${Icon.trash({ size: 12 })}</button>` : ''}
                        </span>
                    </figcaption>
                </figure>`;
            });
            html += `</div>`;
        }
        html += `<div class="data-source-note">Revision control: uploading the same drawing number automatically marks the older revision <b>Superseded</b>. Only the "Current" tab is authoritative for the site. Files are stored in the shared Drive folder.</div>`;
        container.innerHTML = html;
    },

    openDrawingModal() {
        const existing = document.getElementById('drawingModal');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'drawingModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;max-width:520px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:13px 18px;border-bottom:1px solid var(--line);background:var(--blueprint-tint);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">${Icon.drawing({size:13})} Upload Drawing</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('drawingModal').remove()">${Icon.close({size:12})}</span>
                </div>
                <div style="padding:14px 18px;overflow:auto;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div class="field"><label>Drawing No. *</label><input type="text" id="dwg-no" placeholder="e.g. S-101" /></div>
                        <div class="field"><label>Revision</label><input type="text" id="dwg-rev" placeholder="e.g. 0, A, B" value="0" /></div>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>Title *</label><input type="text" id="dwg-title" placeholder="e.g. NF2 WTP Foundation Plan" /></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
                        <div class="field"><label>Discipline</label><select id="dwg-disc"><option value="">—</option><option>Architectural</option><option>Structural</option><option>Civil</option><option>Electrical</option><option>Mechanical</option><option>Plumbing/Sanitary</option><option>Other</option></select></div>
                        <div class="field"><label>Drawing Date</label><input type="date" id="dwg-date" /></div>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>File (PDF or image) *</label><input type="file" accept=".pdf,image/*" id="dwg-file" /></div>
                    <div class="field" style="margin-top:6px;"><label>Remarks</label><input type="text" id="dwg-remarks" placeholder="e.g. For construction, issued by designer" /></div>
                    <div style="font-size:10.5px;color:var(--ink-soft);margin-top:6px;">If the drawing number already exists, the previous revision is marked Superseded automatically.</div>
                </div>
                <div style="padding:12px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn-ghost" onclick="document.getElementById('drawingModal').remove()">Cancel</button>
                    <button class="btn-primary" id="dwgSubmitBtn" onclick="ProjectPage.submitDrawing()">Upload</button>
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    },

    async submitDrawing() {
        const no = (document.getElementById('dwg-no')?.value || '').trim();
        const title = (document.getElementById('dwg-title')?.value || '').trim();
        const f = document.getElementById('dwg-file')?.files?.[0];
        if (!no || !title) { UI.toast('Drawing No. and Title are required.', 'error'); return; }
        if (!f) { UI.toast('Attach the drawing file (PDF or image).', 'error'); return; }
        if (f.size > 8 * 1024 * 1024) { UI.toast('File too large. Keep drawings under 8 MB; compress the PDF first.', 'error'); return; }
        const btn = document.getElementById('dwgSubmitBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
        try {
            const b64 = await fileToBase64_(f);
            const res = await DataService.addDrawing({
                projectId: this._currentProjectId,
                drawingNo: no,
                title: title,
                discipline: document.getElementById('dwg-disc')?.value || '',
                revision: document.getElementById('dwg-rev')?.value || '0',
                drawingDate: document.getElementById('dwg-date')?.value || '',
                remarks: document.getElementById('dwg-remarks')?.value || '',
                fileBase64: b64,
                fileName: f.name,
                fileMimeType: f.type
            });
            UI.toast(`${no} uploaded (${res.id}).`, 'success');
            document.getElementById('drawingModal')?.remove();
            await this._refreshSiteOps('drawings');
        } catch (err) {
            UI.toast('' + err.message, 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
        }
    },

    async deleteDrawingItem(id) {
        const ok = await Confirm.open(`Delete ${id}?`, 'Super Admin only. This cannot be undone.');
        if (!ok) return;
        try {
            await DataService.deleteDrawing(id);
            UI.toast(`${id} deleted.`, 'success');
            await this._refreshSiteOps('drawings');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * _refreshSiteOps (v9) - Quiet refresh after a site-ops write:
     * re-pulls the project payload in the background and re-renders
     * ONLY the affected tab (no full-page reload, stays in place).
     */
    async _refreshSiteOps(tab) {
        try {
            const p = await DataService.getProjectData(this._currentProjectId, true);
            if (p) {
                this._data.punchlist = p.punchlist || [];
                this._data.safetyRecords = p.safetyRecords || [];
                this._data.drawings = p.drawings || [];
                this._data.otRequests = p.otRequests || [];
            }
        } catch (e) { console.error('siteops refresh:', e); }
        if (tab === 'punchlist') this.renderPunchlist(this._data);
        if (tab === 'safety') this.renderSafety(this._data);
        if (tab === 'drawings') this.renderDrawings(this._data);
    }
});
