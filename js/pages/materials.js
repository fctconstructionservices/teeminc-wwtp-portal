// ================================================================
//  pages/materials.js — Materials database page
//
//  PURPOSE: Approved/Pending catalog views with search, the
//  material detail datasheet (MatPrintModal) and the role-gated
//  Approve action. New entries are requested through the material
//  request form (features/form-submissions.js).
// ================================================================

const MaterialsPage = {
    _allMaterials: [],
    _currentFilter: 'approved',
    _searchResults: null, // null means use filter

    async load() {
        this._searchResults = null; // clear search
        const container = document.getElementById('materialsContent');
        UI.showLoading(container);
        try {
            this._allMaterials = await DataService.getAllMaterials();
            this.render(container);
        } catch (err) { console.error('Materials error:', err);
            UI.toast('Error loading materials.', 'error'); }
    },

    render(container, items = null) {
        // If items provided, use them; else use filtered list
        let list = items;
        if (!list) {
            const approved = this._allMaterials.filter(m => m.status === 'approved');
            const pending = this._allMaterials.filter(m => m.status === 'pending');
            list = this._currentFilter === 'approved' ? approved : pending;
        }
        // If searchResults is set, use that instead (override)
        if (this._searchResults !== null) {
            list = this._searchResults;
        }

        const approved = this._allMaterials.filter(m => m.status === 'approved');
        const pending = this._allMaterials.filter(m => m.status === 'pending');

        // Build HTML: add form first, then list
        let html = `
                <div class="section-head"><h2>Material Database</h2><div class="rule"></div>
                    <button class="btn-primary" onclick="MaterialsPage.showAddForm()" style="padding:6px 14px;font-size:11px;">+ Add New Material</button>
                </div>
                <div id="matAddForm" style="display:none;margin-bottom:20px;">
                    <div class="panel"><div class="panel-head"><h3>Add New Material</h3><button class="btn-ghost" onclick="MaterialsPage.hideAddForm()" style="padding:4px 12px;font-size:11px;">Cancel</button></div>
                    <div style="padding:16px;">
                        <form id="matForm" onsubmit="return MaterialsPage.submitMaterial(event)">
                            <div class="db-form-grid">
                                <div class="field"><label>Material Name *</label><input type="text" id="mat-name" required /></div>
                                <div class="field full"><label>Material Description *</label><input type="text" id= "mat-desc" required /></div>
                                <div class="field"><label>Category *</label><select id="mat-category" required><option value="">Select...</option><option>Structural Steel</option><option>Concrete</option><option>Finishing</option><option>Electrical</option><option>Plumbing</option><option>Safety</option><option>Other</option></select></div>
                                <div class="field"><label>Subcategory</label><select id="mat-subcategory"><option value="">Select...</option><option>Rebar</option><option>Cement</option><option>Aggregates</option><option>Pipes</option><option>Wires</option><option>Paint</option><option>Other</option></select></div>
                                <div class="field"><label>Unit *</label><select id="mat-unit" required><option value="">Select...</option><option>pcs</option><option>kg</option><option>tons</option><option>m</option><option>sqm</option><option>cu.m</option><option>liters</option><option>bags</option><option>rolls</option></select></div>
                                <div class="field"><label>Brand *</label><input type="text" id="mat-brand" required /></div>
                                <div class="field"><label>Model / Serial</label><input type="text" id="mat-model" /></div>
                                <div class="field full"><label>Specifications</label><textarea id="mat-specs" rows="2"></textarea></div>
                                <div class="field"><label>Grade</label><input type="text" id="mat-grade" /></div>
                                <div class="field"><label>Size</label><input type="text" id="mat-size" /></div>
                                <div class="field"><label>Length</label><input type="text" id="mat-length" /></div>
                                <div class="field"><label>Thickness</label><input type="text" id="mat-thickness" /></div>
                                <div class="field"><label>Weight</label><input type="text" id="mat-weight" /></div>
                                <div class="field full"><label>Standard Code</label><input type="text" id="mat-standard" /></div>
                                <div class="field full"><label>PDF Spec Sheet</label><div class="file-drop"><input type="file" accept=".pdf" id="mat-pdf" /></div></div>
                                <div class="field"><label>Application</label><input type="text" id="mat-application" /></div>
                                <div class="field"><label>Notes</label><input type="text" id="mat-notes" /></div>
                                <div class="field full"><label>Image</label><div class="file-drop"><input type="file" accept="image/*" id="mat-image" onchange="MaterialsPage.previewMatImage(event)" /></div>
                                <div class="image-preview" id="matImagePreview"><img id="matImagePreviewImg" src="#" alt="Preview" /></div></div>
                            </div>
                            <div class="submit-row"><button type="submit" class="btn-primary">Submit for Approval</button><button type="button" class="btn-ghost" onclick="MaterialsPage.hideAddForm()">Cancel</button></div>
                        </form>
                    </div></div>
                </div>
                <div class="searchbar"><span class="search-icon">${Icon.search({size:15})}</span><input type="text" id="matSearch" placeholder="Search by ID, Brand, Specs..." oninput="MaterialsPage.search()" /></div>
                <div class="status-tabs">
                    <button class="${this._currentFilter === 'approved' && this._searchResults === null ? 'active' : ''}" onclick="MaterialsPage.setFilter('approved')">${Icon.checkCircle({size:13})} Approved (${approved.length})</button>
                    <button class="${this._currentFilter === 'pending' && this._searchResults === null ? 'active' : ''}" onclick="MaterialsPage.setFilter('pending')">⏳ Pending (${pending.length})</button>
                    ${this._searchResults !== null ? `<button class="active" onclick="MaterialsPage.clearSearch()">${Icon.search({size:13})} Search Results (${list.length})</button>` : ''}
                </div>
                <div class="list-container">`;
                if (list.length === 0) html += `<div class="empty"><p>No materials found.</p></div>`;
                else {
                    list.forEach(m => {
                        const imgHtml = m.image ? `<img src="${m.image}" alt="${m.brand}" />` :
                            `<span>${Icon.package({size:24})}</span>`;
                        html += `
                        <div class="mat-card" onclick="MaterialsPage.viewMaterial('${m.id}')">
                            <div class="mc-thumb">${imgHtml}</div>
                            <div class="mc-body">
                                <div class="mc-title">${m.brand || 'Unnamed'} — ${m.specs || ''}</div>
                                <div class="mc-meta">
                                    <span class="req-id">${m.id}</span>
                                    <span>${m.category || ''} ${m.subcategory ? '→ ' + m.subcategory : ''}</span>
                                    <span>${m.unit || ''}</span>
                                    ${m.status === 'pending' ? '<span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">Pending</span>' : ''}
                                    ${m.status === 'approved' ? '<span class="stamp approved" style="transform:none;padding:1px 8px;font-size:9px;">Approved</span>' : ''}
                                    ${m.status === 'pending' && App.isApprover() ? `<button class="btn-sm success" onclick="event.stopPropagation();MaterialsPage.approveMaterial('${m.id}')" style="margin-left:8px;">Approve</button>` : ''}
                                </div>
                            </div>
                            <div style="color:var(--ink-soft);">›</div>
                        </div>`;
                    });
                }
                html += `</div>`;
                UI.setContent(container, html);
    },

    setFilter(filter) {
        this._currentFilter = filter;
        this._searchResults = null; // clear search
        this.load();
    },

    clearSearch() {
        this._searchResults = null;
        this.load();
    },

    search() {
        const query = document.getElementById('matSearch').value;
        if (!query.trim()) {
            this._searchResults = null;
            this.load();
            return;
        }
        const container = document.getElementById('materialsContent');
        UI.showLoading(container);
        setTimeout(async () => {
            const results = await DataService.searchMaterials(query);
            this._searchResults = results;
            this.render(container);
        }, 300);
    },

    showAddForm() { const f = document.getElementById('matAddForm'); if (f) f.style.display = 'block'; },
    hideAddForm() { const f = document.getElementById('matAddForm'); if (f) f.style.display = 'none'; },
    previewMatImage(e) {
        const file = e.target.files[0];
        const preview = document.getElementById('matImagePreview');
        const img = document.getElementById('matImagePreviewImg');
        if (file) { const r = new FileReader();
            r.onload = function(ev) { img.src = ev.target.result;
                preview.classList.add('open'); };
            r.readAsDataURL(file); } else preview.classList.remove('open');
    },
    async submitMaterial(e) {
        e.preventDefault();
        const data = {
            name: document.getElementById('mat-name').value,
            description: document.getElementById('mat-desc').value,
            category: document.getElementById('mat-category').value,
            subcategory: document.getElementById('mat-subcategory').value,
            unit: document.getElementById('mat-unit').value,
            brand: document.getElementById('mat-brand').value.trim(),
            model: document.getElementById('mat-model').value.trim(),
            specs: document.getElementById('mat-specs').value.trim(),
            grade: document.getElementById('mat-grade').value.trim(),
            size: document.getElementById('mat-size').value.trim(),
            length: document.getElementById('mat-length').value.trim(),
            thickness: document.getElementById('mat-thickness').value.trim(),
            weight: document.getElementById('mat-weight').value.trim(),
            standardCode: document.getElementById('mat-standard').value.trim(),
            application: document.getElementById('mat-application').value.trim(),
            notes: document.getElementById('mat-notes').value.trim(),
            image: document.getElementById('matImagePreviewImg').src || 'https://placehold.co/600x400/5B6360/FFFFFF?text=Material'
        };
        if (!data.name || !data.description || !data.category || !data.brand || !data.unit) { UI.toast('Required: Material Name, Description,Category, Brand, Unit.',
                'error'); return; }
        const confirmed = await Confirm.open('Submit for Approval?', '');
        if (!confirmed) return;
        try { 
            const result = await DataService.requestMaterial(data);
            UI.toast(`${result.id} submitted for approval!`, 'success');
            document.getElementById('matForm').reset();
            document.getElementById('matImagePreview').classList.remove('open');
            this.hideAddForm();
            this._allMaterials = await DataService.getAllMaterials();
            this._searchResults = null;
            
            // ✅ FIX: Automatically switch to Pending tab after submission (Bug #1)
            this._currentFilter = 'pending';
            this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
        return false;
    },
    async approveMaterial(id) {
        const confirmed = await Confirm.open('Approve Material?', '');
        if (!confirmed) return;
        try { await DataService.approveMaterial(id);
            UI.toast('Material approved!', 'success');
            this._allMaterials = await DataService.getAllMaterials();
            this._searchResults = null;
            this.load(); } catch (err) { UI.toast('' + err.message, 'error'); }
    },
    async viewMaterial(id) {
        const all = await DataService.getAllMaterials();
        const mat = all.find(m => m.id === id);
        if (!mat) { UI.toast('Not found.', 'error'); return; }
        MatPrintModal.open(mat);
    }
};
