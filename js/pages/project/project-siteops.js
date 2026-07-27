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
                <button class="${this._plFilter === 'Open' ? 'active' : ''}" onclick="ProjectPage._plFilter='Open';ProjectPage.renderPunchlist(ProjectPage._data)">⚠ Open (${open.length})</button>
                <button class="${this._plFilter === 'Closed' ? 'active' : ''}" onclick="ProjectPage._plFilter='Closed';ProjectPage.renderPunchlist(ProjectPage._data)">${Icon.checkCircle({size:13})} Closed (${closed.length})</button>
            </div>`;

        if (!list.length) {
            html += `<div class="empty"><p>${this._plFilter === 'Open' ? 'Walang open punchlist items — malinis ang site! Use "+ Raise Item" para mag-log ng defect o for-correction.' : 'No closed items yet.'}</p></div>`;
        } else {
            list.forEach(it => {
                html += `
                <div class="panel" style="margin-bottom:10px;">
                    <div style="padding:12px 14px;display:grid;grid-template-columns:1fr auto;gap:10px;">
                        <div>
                            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">
                                <span class="req-id">${it.id}</span>
                                <b style="font-size:13px;">${it.item}</b>
                                <span class="stamp ${prioCls(it.priority)}" style="transform:none;padding:1px 8px;font-size:9px;">${it.priority || 'Medium'}</span>
                                ${it.sowId ? `<span class="mono" style="font-size:10.5px;color:var(--ink-soft);">${it.sowId}</span>` : ''}
                            </div>
                            <div style="font-size:11.5px;color:var(--ink-soft);">
                                ${it.location ? `📍 ${it.location} · ` : ''}${it.assignedTo ? `👤 ${it.assignedTo} · ` : ''}${it.dueDate ? `📅 Due ${it.dueDate} · ` : ''}Raised by ${it.raisedBy || '—'}
                                ${it.status === 'Closed' ? ` · <span style="color:var(--green,#2F7A46);">Closed ${it.closedAt || ''} by ${it.closedBy || ''}</span>` : ''}
                            </div>
                            ${it.remarks ? `<div style="font-size:11.5px;margin-top:4px;">${it.remarks}</div>` : ''}
                            <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">
                                ${it.beforeImage ? `<figure style="margin:0;"><img src="${driveImgSrc(it.beforeImage)}" style="width:130px;height:90px;object-fit:cover;border-radius:6px;border:1px solid var(--line);" onerror="this.parentElement.style.display='none'" /><figcaption style="font-size:9.5px;color:var(--ink-soft);text-align:center;">BEFORE (finding)</figcaption></figure>` : ''}
                                ${it.afterImage ? `<figure style="margin:0;"><img src="${driveImgSrc(it.afterImage)}" style="width:130px;height:90px;object-fit:cover;border-radius:6px;border:1px solid var(--green,#2F7A46);" onerror="this.parentElement.style.display='none'" /><figcaption style="font-size:9.5px;color:var(--green,#2F7A46);text-align:center;">AFTER (rectified)</figcaption></figure>` : ''}
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                            ${it.status === 'Open' && this._canEdit !== false ? `<button class="btn-sm success" onclick="ProjectPage.openPunchCloseModal('${it.id}')">✓ Close</button>` : ''}
                            ${it.status === 'Closed' && isSuper ? `<button class="btn-sm" onclick="ProjectPage.reopenPunchItem('${it.id}')">↩ Re-open</button>` : ''}
                            ${isSuper ? `<button class="btn-sm danger" onclick="ProjectPage.deletePunchItem('${it.id}')">🗑</button>` : ''}
                        </div>
                    </div>
                </div>`;
            });
        }
        html += `<div class="data-source-note">Ang pag-close ng item ay nangangailangan ng <b>AFTER photo</b> bilang proof of rectification (Super Admin can override). Open items na lampas sa due date ay dapat i-follow up sa taong naka-assign.</div>`;
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
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">📋 Raise Punchlist Item</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('punchModal').remove()">✕</span>
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
                        <input type="text" id="pl-assigned" list="pl-people" placeholder="Pangalan o kumpanya (subcon)" />
                        <datalist id="pl-people">${people.map(pp => `<option value="${pp.name}"></option>`).join('')}</datalist>
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
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">✓ Close ${id}</h3>
                </div>
                <div style="padding:14px 18px;">
                    <div class="field"><label>AFTER Photo (proof of rectification) ${isSuper ? '' : '*'}</label><input type="file" accept="image/*" id="plc-after" /></div>
                    <div class="field" style="margin-top:6px;"><label>Closing Remarks</label><input type="text" id="plc-remarks" placeholder="e.g. Chipped and re-grouted, inspected OK" /></div>
                    ${isSuper ? '<div style="font-size:10.5px;color:var(--ink-soft);margin-top:6px;">Super Admin: pwedeng mag-close kahit walang after photo (override).</div>' : '<div style="font-size:10.5px;color:var(--ink-soft);margin-top:6px;">Required ang AFTER photo bilang proof bago ma-close.</div>'}
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
        if (!f && !isSuper) { UI.toast('Attach the AFTER photo bilang proof of rectification.', 'error'); return; }
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
        const typeIcon = t => t === 'Toolbox Talk' ? '🗣' : t === 'Inspection' ? '🔍' : t === 'Incident' ? '🚨' : t === 'Near Miss' ? '⚠' : '⛔';

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
            html += `<div class="empty"><p>Walang safety records${this._sfFilter ? ' ng ganitong type' : ''} pa. I-log ang toolbox talks, inspections, at kahit near misses — importante sa safety culture at sa client audits.</p></div>`;
        } else {
            html += `<div class="panel"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Severity</th><th>Persons Involved</th><th>Action Taken</th><th>By</th><th></th></tr></thead><tbody>`;
            list.forEach(r => {
                html += `<tr>
                    <td class="mono" style="font-size:11px;white-space:nowrap;">${r.recordDate || '—'}</td>
                    <td style="white-space:nowrap;">${typeIcon(r.recordType)} ${r.recordType}</td>
                    <td>${r.description || '—'}${r.image ? ` <a href="${r.image}" target="_blank" title="View photo">📷</a>` : ''}</td>
                    <td>${r.severity ? `<span class="stamp ${sevCls(r.severity)}" style="transform:none;padding:1px 8px;font-size:9px;">${r.severity}</span>` : '—'}</td>
                    <td style="font-size:11.5px;">${r.personsInvolved || '—'}</td>
                    <td style="font-size:11.5px;">${r.actionTaken || '—'}</td>
                    <td style="font-size:11px;">${r.reportedBy || '—'}</td>
                    <td>${r.status === 'Open' && this._canEdit !== false ? `<button class="btn-sm success" title="Mark closed/resolved" onclick="ProjectPage.closeSafetyRecord('${r.id}')">✓</button>` : (r.status === 'Closed' ? '<span class="stamp approved" style="transform:none;padding:1px 8px;font-size:9px;">Closed</span>' : '')}</td>
                </tr>`;
            });
            html += `</tbody></table></div>`;
        }
        html += `<div class="data-source-note">Types: <b>Toolbox Talk</b> (daily safety briefing), <b>Inspection</b>, <b>Incident</b> (may nangyaring aksidente/pinsala), <b>Near Miss</b> (muntik na — dapat i-report para maiwasan), <b>Violation</b> (hindi pagsunod sa safety rules).</div>`;
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
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">🦺 Log Safety Record</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('safetyModal').remove()">✕</span>
                </div>
                <div style="padding:14px 18px;overflow:auto;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div class="field"><label>Type *</label><select id="sf-type"><option>Toolbox Talk</option><option>Inspection</option><option>Incident</option><option>Near Miss</option><option>Violation</option></select></div>
                        <div class="field"><label>Date *</label><input type="date" id="sf-date" value="${new Date().toISOString().slice(0, 10)}" /></div>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>Description *</label><textarea id="sf-desc" rows="2" placeholder="Ano ang nangyari / ano ang topic / ano ang nakita"></textarea></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
                        <div class="field"><label>Severity (kung incident)</label><select id="sf-severity"><option value="">—</option><option>First Aid</option><option>Minor</option><option>Major</option><option>Fatal</option></select></div>
                        <div class="field"><label>Persons Involved</label><input type="text" id="sf-persons" placeholder="Names / crew" /></div>
                    </div>
                    <div class="field" style="margin-top:6px;"><label>Action Taken / Corrective Action</label><input type="text" id="sf-action" /></div>
                    <div class="field" style="margin-top:6px;"><label>Photo (optional)</label><input type="file" accept="image/*" id="sf-image" /></div>
                </div>
                <div style="padding:12px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;">
                    <button class="btn-ghost" onclick="document.getElementById('safetyModal').remove()">Cancel</button>
                    <button class="btn-primary" onclick="ProjectPage.submitSafetyRecord()">Log Record</button>
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    },

    async submitSafetyRecord() {
        const desc = (document.getElementById('sf-desc')?.value || '').trim();
        if (!desc) { UI.toast('Description is required.', 'error'); return; }
        try {
            let image = '';
            const f = document.getElementById('sf-image')?.files?.[0];
            if (f) {
                const b64 = await fileToBase64_(f);
                const up = await DataService.uploadImage(b64, f.name, f.type);
                image = (up && up.url) || '';
            }
            const type = document.getElementById('sf-type')?.value;
            const res = await DataService.addSafetyRecord({
                projectId: this._currentProjectId,
                recordType: type,
                recordDate: document.getElementById('sf-date')?.value,
                description: desc,
                severity: document.getElementById('sf-severity')?.value || '',
                personsInvolved: document.getElementById('sf-persons')?.value || '',
                actionTaken: document.getElementById('sf-action')?.value || '',
                image: image,
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
                <button class="${this._dwgFilter === 'Superseded' ? 'active' : ''}" onclick="ProjectPage._dwgFilter='Superseded';ProjectPage.renderDrawings(ProjectPage._data)">🗂 Superseded (${superseded.length})</button>
            </div>`;

        if (!list.length) {
            html += `<div class="empty"><p>${this._dwgFilter === 'Current' ? 'Wala pang drawings. I-upload ang plans (PDF o image) para laging updated ang site sa latest revision.' : 'No superseded drawings.'}</p></div>`;
        } else {
            html += `<div class="panel"><table><thead><tr><th>Drawing No.</th><th>Title</th><th>Discipline</th><th>Rev</th><th>Date</th><th>File</th><th>Uploaded By</th>${isSuper ? '<th></th>' : ''}</tr></thead><tbody>`;
            list.forEach(d => {
                html += `<tr>
                    <td><span class="req-id">${d.drawingNo}</span></td>
                    <td><b>${d.title || '—'}</b>${d.remarks ? `<div style="font-size:10.5px;color:var(--ink-soft);">${d.remarks}</div>` : ''}</td>
                    <td style="font-size:11.5px;">${d.discipline || '—'}</td>
                    <td class="mono" style="font-size:11px;">${d.revision || '0'}</td>
                    <td class="mono" style="font-size:11px;white-space:nowrap;">${d.drawingDate || '—'}</td>
                    <td>${d.fileUrl ? `<a href="${d.fileUrl}" target="_blank" class="btn-sm">📄 Open${d.fileName ? '' : ''}</a>` : '—'}</td>
                    <td style="font-size:11px;">${d.uploadedBy || '—'}</td>
                    ${isSuper ? `<td><button class="btn-sm danger" onclick="ProjectPage.deleteDrawingItem('${d.id}')">🗑</button></td>` : ''}
                </tr>`;
            });
            html += `</tbody></table></div>`;
        }
        html += `<div class="data-source-note">Revision control: kapag nag-upload ng drawing na PAREHO ang Drawing No., automatic na magiging <b>Superseded</b> ang lumang revision — ang "Current" tab lang ang basehan ng site. Files are stored in the shared Drive folder.</div>`;
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
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">📐 Upload Drawing</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('drawingModal').remove()">✕</span>
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
                    <div style="font-size:10.5px;color:var(--ink-soft);margin-top:6px;">Kapag existing na ang Drawing No., ang lumang revision ay awtomatikong mamamarkahan na Superseded.</div>
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
        if (f.size > 8 * 1024 * 1024) { UI.toast('File too large — keep drawings under 8 MB (i-compress muna ang PDF).', 'error'); return; }
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
     * ONLY the affected tab (walang full-page reload, stays in place).
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
