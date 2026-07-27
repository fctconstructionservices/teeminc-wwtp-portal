// ================================================================
//  pages/materials.js — Materials database page (v8)
//
//  PURPOSE: Approved/Pending/Warehouse catalog views with search,
//  the material detail datasheet (MatPrintModal) and the role-gated
//  Approve action.
//
//  v8 UX REWRITE:
//   - The list is fetched ONCE and cached; switching Approved /
//     Pending / Warehouse re-renders INSTANTLY from the cache (no
//     loading spinner, no server round-trip).
//   - Search is CLIENT-SIDE and instant: typing filters the cached
//     list without any server call, and only the list re-renders so
//     the search box never loses focus.
//   - Clicking a material gives immediate visual feedback (pressed
//     state) and opens the modal from the cache — no refetch.
//   - Warehouse stock is cached after the first view, with a manual
//     Refresh button.
// ================================================================

const MaterialsPage = {
    _allMaterials: [],
    _warehouse: null,
    _currentFilter: 'approved',
    _query: '',
    _loaded: false,

    async load(force) {
        const container = document.getElementById('materialsContent');
        if (!this._loaded || force) {
            UI.showLoading(container);
            try {
                this._allMaterials = (await DataService.getAllMaterials() || []).map(x => ({ ...x, status: String(x.status || '').toLowerCase() }));
                this._loaded = true;
            } catch (err) {
                console.error('Materials error:', err);
                UI.toast('Error loading materials.', 'error');
                return;
            }
        }
        this._query = '';
        this.renderShell(container);
    },

    /** _refreshCache - silent background refresh after a write. */
    async _refreshCache() {
        try {
            this._allMaterials = (await DataService.getAllMaterials() || []).map(x => ({ ...x, status: String(x.status || '').toLowerCase() }));
        } catch (e) {}
    },

    _matches(m, q) {
        return ['id', 'name', 'desc', 'brand', 'model', 'specs', 'category', 'subcategory', 'grade', 'size']
            .some(f => m[f] && String(m[f]).toLowerCase().includes(q));
    },

    _filteredList() {
        const q = this._query.trim().toLowerCase();
        if (q) return this._allMaterials.filter(m => this._matches(m, q));
        if (this._currentFilter === 'approved') return this._allMaterials.filter(m => m.status === 'approved');
        return this._allMaterials.filter(m => m.status === 'pending');
    },

    /**
     * renderShell - Builds the page frame ONCE (form, search bar,
     * tabs, list container). Tab switches and search keystrokes only
     * touch the list + tab states, so the input keeps focus and
     * everything feels instant.
     */
    renderShell(container) {
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
                                <div class="field full"><label>Material Description *</label><input type="text" id="mat-desc" required /></div>
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
                <div class="searchbar"><span class="search-icon">${Icon.search({size:15})}</span><input type="text" id="matSearch" placeholder="Search by ID, Name, Brand, Specs..." oninput="MaterialsPage.onSearchInput(this.value)" /></div>
                <div class="status-tabs" id="matStatusTabs"></div>
                <div class="list-container" id="matListContainer"></div>`;
        UI.setContent(container, html);
        this.renderTabs();
        if (this._currentFilter === 'warehouse' && !this._query.trim()) this.renderWarehouse();
        else this.renderList();
    },

    renderTabs() {
        const el = document.getElementById('matStatusTabs');
        if (!el) return;
        const q = this._query.trim();
        const approved = this._allMaterials.filter(m => m.status === 'approved').length;
        const pending = this._allMaterials.filter(m => m.status === 'pending').length;
        el.innerHTML = `
            <button class="${!q && this._currentFilter === 'approved' ? 'active' : ''}" onclick="MaterialsPage.setFilter('approved')">${Icon.checkCircle({size:13})} Approved (${approved})</button>
            <button class="${!q && this._currentFilter === 'pending' ? 'active' : ''}" onclick="MaterialsPage.setFilter('pending')">⏳ Pending (${pending})</button>
            <button class="${!q && this._currentFilter === 'warehouse' ? 'active' : ''}" onclick="MaterialsPage.setFilter('warehouse')">🏭 Warehouse</button>
            ${q ? `<button class="active" onclick="MaterialsPage.clearSearch()">${Icon.search({size:13})} Search Results (${this._filteredList().length}) ✕</button>` : ''}`;
    },

    renderList() {
        const el = document.getElementById('matListContainer');
        if (!el) return;
        const list = this._filteredList();
        if (!list.length) {
            el.innerHTML = `<div class="empty"><p>No materials found${this._query.trim() ? ` for "${this._query.trim()}"` : ''}.</p></div>`;
            return;
        }
        let html = '';
        list.forEach(m => {
            const imgHtml = m.image ? `<img src="${m.image}" alt="${m.name || m.brand || ''}" loading="lazy" />` :
                `<span>${Icon.package({size:24})}</span>`;
            html += `
            <div class="mat-card" onclick="MaterialsPage.viewMaterial('${m.id}', this)" style="transition:transform .08s ease, box-shadow .08s ease;">
                <div class="mc-thumb">${imgHtml}</div>
                <div class="mc-body">
                    <div class="mc-title">${m.name || m.brand || 'Unnamed'}</div>
                    <div class="mc-meta">
                        <span class="req-id">${m.id}</span>
                        ${m.brand ? `<span>${m.brand}</span>` : ''}
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
        el.innerHTML = html;
    },

    /** onSearchInput - instant, client-side. Only the list + tabs
     *  re-render, so the input NEVER loses focus. */
    onSearchInput(value) {
        this._query = value || '';
        this.renderTabs();
        if (!this._query.trim() && this._currentFilter === 'warehouse') this.renderWarehouse();
        else this.renderList();
    },

    clearSearch() {
        this._query = '';
        const inp = document.getElementById('matSearch');
        if (inp) inp.value = '';
        this.renderTabs();
        if (this._currentFilter === 'warehouse') this.renderWarehouse();
        else this.renderList();
    },

    /** setFilter - INSTANT: renders from the cache, no server call. */
    setFilter(filter) {
        this._currentFilter = filter;
        this._query = '';
        const inp = document.getElementById('matSearch');
        if (inp) inp.value = '';
        this.renderTabs();
        if (filter === 'warehouse') this.renderWarehouse();
        else this.renderList();
    },

    /**
     * renderWarehouse (v6.9 / v8) - Stock at the office warehouse,
     * derived entirely from completed transfers. v8: the result is
     * CACHED after the first fetch, so revisiting the tab is instant;
     * the Refresh button re-pulls on demand.
     */
    async renderWarehouse(force) {
        const el = document.getElementById('matListContainer');
        if (!el) return;
        if (!this._warehouse || force) {
            el.innerHTML = `<div class="empty"><p>Loading warehouse stock…</p></div>`;
            try {
                this._warehouse = await DataService.getWarehouseStock();
            } catch (err) {
                UI.toast('' + err.message, 'error');
                el.innerHTML = `<div class="empty"><p>Could not load warehouse stock.</p></div>`;
                return;
            }
        }
        const wh = this._warehouse;
        const mats = wh.materials || [];
        const eqs = wh.equipment || [];
        let html = `
            <div class="kpi-strip" style="margin:14px 0;">
                <div class="kpi-card"><div class="k-label">Material Items</div><div class="k-val">${mats.length}</div><div class="k-sub">with stock remaining</div></div>
                <div class="kpi-card"><div class="k-label">Equipment Units</div><div class="k-val">${fmtNum(eqs.reduce((s, e) => s + e.qty, 0))}</div><div class="k-sub">idle in warehouse</div></div>
                <div class="kpi-card warn"><div class="k-label">Pending Transfers</div><div class="k-val">${wh.pendingCount || 0}</div><div class="k-sub">awaiting approval</div></div>
                <div class="kpi-card good"><div class="k-label">Est. Value</div><div class="k-val">₱${fmtMoney(wh.estValue || 0)}</div><div class="k-sub">sa DB rate</div></div>
            </div>
            <div class="section-head"><h2 style="font-size:13px;">Warehouse Stock</h2><div class="rule"></div>
                <button class="btn-sm" onclick="MaterialsPage.renderWarehouse(true)" title="Re-pull the latest stock">⟳ Refresh</button>
            </div>
            <div class="panel"><div class="panel-head"><h3>Materials</h3></div>
            <table><thead><tr><th>Material</th><th>Unit</th><th style="text-align:right">On Hand</th><th>Last From</th><th>Date</th></tr></thead><tbody>`;
        if (!mats.length) {
            html += `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:22px">The warehouse is empty. Stock here comes from completed transfers out of projects.</td></tr>`;
        } else {
            mats.forEach(m => {
                html += `<tr>
                    <td>${m.item}</td>
                    <td class="mono" style="font-size:11.5px">${m.unit || '—'}</td>
                    <td class="amt"><b>${fmtNum(m.qty)}</b></td>
                    <td class="mono" style="font-size:11px">${m.lastFrom}</td>
                    <td class="mono" style="font-size:11px">${m.lastDate || '—'}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>`;
        html += `<div class="panel"><div class="panel-head"><h3>Equipment</h3></div>
            <table><thead><tr><th>Equipment</th><th style="text-align:right">Qty</th><th>Last From</th><th>Date</th></tr></thead><tbody>`;
        if (!eqs.length) {
            html += `<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);padding:22px">No equipment in the warehouse.</td></tr>`;
        } else {
            eqs.forEach(e => {
                html += `<tr>
                    <td>${e.item}</td>
                    <td class="amt"><b>${fmtNum(e.qty)}</b></td>
                    <td class="mono" style="font-size:11px">${e.lastFrom}</td>
                    <td class="mono" style="font-size:11px">${e.lastDate || '—'}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>
            <div class="data-source-note">Warehouse contents are derived entirely from <b>completed transfers</b> - there is no manual encoding. To issue stock to a project, create a transfer (Warehouse → Project) from that project's Site Materials tab. Check here for surplus before purchasing new stock.</div>`;
        el.innerHTML = html;
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
        if (!data.name || !data.description || !data.category || !data.brand || !data.unit) { UI.toast('Required: Material Name, Description, Category, Brand, Unit.',
                'error'); return; }
        const confirmed = await Confirm.open('Submit for Approval?', '');
        if (!confirmed) return;
        try {
            const result = await DataService.requestMaterial(data);
            UI.toast(`${result.id} submitted for approval!`, 'success');
            document.getElementById('matForm').reset();
            document.getElementById('matImagePreview').classList.remove('open');
            this.hideAddForm();
            await this._refreshCache();
            this._currentFilter = 'pending';   // show the new entry immediately
            this._query = '';
            const inp = document.getElementById('matSearch');
            if (inp) inp.value = '';
            this.renderTabs();
            this.renderList();
        } catch (err) { UI.toast('' + err.message, 'error'); }
        return false;
    },
    async approveMaterial(id) {
        const confirmed = await Confirm.open('Approve Material?', '');
        if (!confirmed) return;
        try { await DataService.approveMaterial(id);
            UI.toast('Material approved!', 'success');
            await this._refreshCache();
            this.renderTabs();
            this.renderList(); } catch (err) { UI.toast('' + err.message, 'error'); }
    },
    /**
     * viewMaterial (v8) - INSTANT: opens from the cache (no refetch)
     * with a brief pressed-state so the click visibly registers.
     */
    viewMaterial(id, cardEl) {
        if (cardEl) {
            cardEl.style.transform = 'scale(.985)';
            cardEl.style.boxShadow = 'inset 0 0 0 2px var(--safety)';
            setTimeout(() => { cardEl.style.transform = ''; cardEl.style.boxShadow = ''; }, 180);
        }
        const mat = this._allMaterials.find(m => m.id === id);
        if (!mat) { UI.toast('Not found.', 'error'); return; }
        MatPrintModal.open(mat);
    }
};
