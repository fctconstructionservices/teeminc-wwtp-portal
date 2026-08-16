// ================================================================
//  pages/project/project-documents.js — The project's filing cabinet.
//                                        (v20)
//
//  Grouped by category rather than listed by date, because the question
//  people arrive with is "where is the contract", not "what came in on
//  the 14th". A flat chronological list makes you scan everything to
//  find one thing.
//
//  Superseded versions are collapsed under their replacement, so the
//  register reads as "here is the contract" with the history one click
//  away — rather than as five contracts, which is what a flat list
//  would show and is actively misleading.
// ================================================================

Object.assign(ProjectPage, {

    _docs: null,

    async renderDocuments(p) {
        const el = document.getElementById('proj-tab-documents');
        if (!el) return;
        el.innerHTML = '<div class="dc-loading">Loading documents…</div>';
        try {
            this._docs = await DataService.getProjectDocuments(this._currentProjectId);
        } catch (err) {
            el.innerHTML = `<div class="dc-loading">Could not load: ${esc(err.message)}</div>`;
            return;
        }
        this._paintDocuments();
    },

    _paintDocuments() {
        const el = document.getElementById('proj-tab-documents');
        const d = this._docs || { documents: [], categories: [], byCategory: {} };
        const canEdit = this._canEdit !== false;

        const current = d.documents.filter(x => !x.superseded);
        // Old versions live under the document that replaced them.
        const historyOf = {};
        d.documents.filter(x => x.superseded).forEach(old => {
            const heir = d.documents.find(x => x.supersedes === old.id);
            const key = heir ? heir.id : '_orphan';
            (historyOf[key] = historyOf[key] || []).push(old);
        });

        const used = d.categories.filter(c => current.some(x => x.category === c));

        el.innerHTML = `
            <div class="dc-head">
                <div>
                    <h3>Documents</h3>
                    <p>Anything received about this project — contracts, permits, client
                    correspondence, reports. Every file is kept; a replacement becomes a new
                    version and the old one stays underneath it.</p>
                </div>
                ${canEdit ? `<button class="btn-primary" onclick="ProjectPage.openDocForm()">
                    ${Icon.plus ? Icon.plus({ size: 13 }) : '+'} File a document</button>` : ''}
            </div>

            ${current.length ? `
                <div class="dc-filter">
                    <button class="is-on" onclick="ProjectPage.filterDocs('', this)">All (${current.length})</button>
                    ${used.map(c => `<button onclick="ProjectPage.filterDocs('${esc(c)}', this)">
                        ${esc(c)} (${d.byCategory[c]})</button>`).join('')}
                </div>

                <div class="dc-list" id="dcList">
                    ${used.map(cat => `
                        <div class="dc-group" data-cat="${esc(cat)}">
                            <div class="dc-cat">${esc(cat)}</div>
                            ${current.filter(x => x.category === cat)
                                .map(x => this._docRow(x, historyOf[x.id] || [], canEdit)).join('')}
                        </div>`).join('')}
                </div>`
            : `<div class="dc-empty">
                    <b>Nothing filed yet.</b>
                    <p>When a contract, permit or client email arrives about this project, file it
                    here. The person who received it may not be the person who needs it later —
                    and that is usually the moment it matters.</p>
               </div>`}`;
    },

    _docRow(x, history, canEdit) {
        const user = App.getUser() || {};
        const canDelete = user.role === 'superadmin';

        return `<div class="dc-item">
            <span class="dc-icon">${Icon.fileText ? Icon.fileText({ size: 15 }) : '📄'}</span>
            <div class="dc-body">
                <div class="dc-title">
                    <a href="${escUrl(x.fileUrl)}" target="_blank" rel="noopener">${esc(x.title)}</a>
                    ${x.version > 1 ? `<span class="dc-tag v">v${x.version}</span>` : ''}
                    ${x.confidential ? `<span class="dc-tag c">confidential</span>` : ''}
                    ${x.docNo ? `<span class="dc-no">${esc(x.docNo)}</span>` : ''}
                </div>
                ${x.description ? `<p class="dc-desc">${escLines(x.description)}</p>` : ''}
                <div class="dc-meta">
                    ${x.receivedDate ? `Received ${esc(x.receivedDate)}` : ''}
                    ${x.receivedFrom ? ` from <b>${esc(x.receivedFrom)}</b>` : ''}
                    · filed by ${esc(x.uploadedByName)}
                    ${x.fileName ? ` · ${esc(x.fileName)}` : ''}
                </div>

                ${history.length ? `<button class="dc-hist" onclick="ProjectPage.toggleDocHistory('${esc(x.id)}', this)">
                    ${history.length} earlier version${history.length === 1 ? '' : 's'}</button>
                    <div class="dc-old" id="hist-${esc(x.id)}" hidden>
                        ${history.map(o => `<div class="dc-old-row">
                            <a href="${escUrl(o.fileUrl)}" target="_blank" rel="noopener">v${o.version} — ${esc(o.fileName || o.title)}</a>
                            <span>${esc(o.receivedDate)} · superseded</span>
                        </div>`).join('')}
                    </div>` : ''}
            </div>
            <div class="dc-actions">
                ${canEdit ? `<button class="btn-sm" title="File a new version"
                    onclick="ProjectPage.openDocForm('${esc(x.id)}')">New version</button>` : ''}
                ${canDelete ? `<button class="btn-sm danger" title="Delete"
                    onclick="ProjectPage.removeDoc('${esc(x.id)}')">${Icon.trash({ size: 12 })}</button>` : ''}
            </div>
        </div>`;
    },

    toggleDocHistory(id, btn) {
        const box = document.getElementById('hist-' + id);
        if (!box) return;
        box.hidden = !box.hidden;
        btn.classList.toggle('is-open', !box.hidden);
    },

    filterDocs(cat, btn) {
        document.querySelectorAll('.dc-filter button').forEach(b => b.classList.remove('is-on'));
        btn.classList.add('is-on');
        document.querySelectorAll('.dc-group').forEach(g => {
            g.style.display = (!cat || g.dataset.cat === cat) ? '' : 'none';
        });
    },

    /**
     * openDocForm - files a document, or a new version of one.
     *
     * @param supersedes  the document being replaced, if any
     */
    openDocForm(supersedes) {
        const d = this._docs || { categories: [] };
        const prev = supersedes ? d.documents.find(x => x.id === supersedes) : null;
        const today = new Date().toISOString().slice(0, 10);

        document.getElementById('docModal')?.remove();
        const m = document.createElement('div');
        m.className = 'print-modal-overlay open';
        m.id = 'docModal';
        m.innerHTML = `
            <div class="print-modal-content" style="max-width:520px;">
                <button class="close-modal" onclick="document.getElementById('docModal').remove()">${Icon.close({ size: 18 })}</button>
                <div class="print-header">
                    <h2>${prev ? 'New version' : 'File a document'}</h2>
                    <div class="print-meta">${prev ? esc(prev.title) : 'It is kept permanently'}</div>
                </div>

                ${prev ? `<div class="pr-budget-box near">
                    <b>This replaces version ${prev.version}</b>
                    <p>The earlier file is kept and marked superseded. It is not deleted — in a
                    dispute the question is usually <b>when</b> something changed, and a register
                    that overwrites cannot answer that.</p>
                </div>` : ''}

                <div class="field"><label>Title *</label>
                    <input type="text" id="dc-title" maxlength="200"
                        value="${prev ? esc(prev.title) : ''}"
                        placeholder="e.g. Signed contract — AgriFarms" /></div>

                <div class="db-form-grid">
                    <div class="field"><label>Category *</label>
                        <select id="dc-cat">
                            ${(d.categories || []).map(c =>
                                `<option value="${esc(c)}" ${prev && prev.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                        </select></div>
                    <div class="field"><label>Reference number</label>
                        <input type="text" id="dc-no" value="${prev ? esc(prev.docNo) : ''}"
                            placeholder="optional" /></div>
                </div>

                <div class="db-form-grid">
                    <div class="field"><label>Received from</label>
                        <input type="text" id="dc-from" value="${prev ? esc(prev.receivedFrom) : ''}"
                            placeholder="e.g. AgriFarms Corp" /></div>
                    <div class="field"><label>Date received</label>
                        <input type="date" id="dc-date" value="${today}" /></div>
                </div>

                <div class="field"><label>Notes</label>
                    <textarea id="dc-desc" rows="2"
                        placeholder="What it is, and anything about it worth knowing later"></textarea></div>

                <div class="field"><label>File *</label>
                    <div class="file-drop"><input type="file" id="dc-file" /></div>
                    <p style="font-size:11px;color:var(--ink-soft);margin:4px 0 0;">
                        PDF, image, or any document. Keep it under 10 MB.</p></div>

                <label class="dc-conf">
                    <input type="checkbox" id="dc-secret" ${prev && prev.confidential ? 'checked' : ''} />
                    <span><b>Confidential</b> — only approvers and above can see it.
                    Use for contracts and anything with client pricing in it.</span>
                </label>

                <div class="print-actions">
                    <button class="btn-primary" onclick="ProjectPage.saveDoc(this, '${esc(supersedes || '')}')">
                        ${prev ? 'File new version' : 'File it'}</button>
                    <button class="btn-ghost" onclick="document.getElementById('docModal').remove()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        setTimeout(() => document.getElementById('dc-title')?.focus(), 60);
    },

    async saveDoc(btn, supersedes) {
        const v = id => (document.getElementById(id)?.value || '').trim();
        const file = document.getElementById('dc-file')?.files?.[0];

        if (!v('dc-title')) { UI.toast('Give the document a title.', 'error'); return; }
        if (!file) { UI.toast('Attach the file.', 'error'); return; }
        if (file.size > 10 * 1024 * 1024) {
            UI.toast('That file is over 10 MB. Compress it or split it.', 'error');
            return;
        }

        // Captured BEFORE the modal is removed — reading a field out of
        // a detached element returns nothing, which is what made the
        // calendar show "Invalid Date".
        const payload = {
            projectId: this._currentProjectId,
            title: v('dc-title'), docNo: v('dc-no'), category: v('dc-cat'),
            description: v('dc-desc'), receivedFrom: v('dc-from'),
            receivedDate: v('dc-date'),
            confidential: !!document.getElementById('dc-secret')?.checked,
            supersedes: supersedes || ''
        };

        await Busy.run(btn, 'Filing', async () => {
            try {
                payload.fileBase64 = await fileToBase64_(file);
                payload.fileName = file.name;
                payload.fileMime = file.type;
                const res = await DataService.addProjectDocument(payload);
                document.getElementById('docModal')?.remove();
                UI.toast(res.version > 1
                    ? `Filed as version ${res.version}. The earlier one is kept.`
                    : 'Document filed.', 'success');
                await this.renderDocuments();
            } catch (err) { UI.toast('' + err.message, 'error'); }
        });
    },

    async removeDoc(id) {
        const ok = await Confirm.open('Delete this document?',
            'The file is removed from the register permanently. If a newer version replaced it, ' +
            'delete that instead — this one is the history.');
        if (!ok) return;
        try {
            await DataService.deleteProjectDocument(id);
            UI.toast('Deleted.', 'success');
            await this.renderDocuments();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
});
