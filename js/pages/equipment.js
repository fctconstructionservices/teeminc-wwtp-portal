// ================================================================
//  pages/equipment.js — Equipment database page (v8)
//
//  PURPOSE: Mirror of pages/materials.js for the equipment catalog:
//  filter tabs, search, EquipPrintModal datasheet and role-gated
//  approval.
//
//  v8 UX REWRITE (same treatment as Materials):
//   - Cached list; Approved/Pending/Warehouse switch instantly.
//   - Client-side instant search that never steals focus.
//   - Pressed-state feedback + cache-fed modal on card click.
//   - NEW: Warehouse tab (equipment currently idle at the warehouse,
//     from completed transfers), with cached data + manual refresh.
// ================================================================

const EquipmentPage = {
    _allEquipment: [],
    _warehouse: null,
    _currentFilter: 'approved',
    _query: '',
    _loaded: false,

    async load(force) {
        const container = document.getElementById('equipmentContent');
        if (!this._loaded || force) {
            UI.showLoading(container);
            try {
                this._allEquipment = (await DataService.getAllEquipment() || []).map(x => ({ ...x, status: String(x.status || '').toLowerCase() }));
                this._loaded = true;
            } catch (err) {
                console.error('Equipment error:', err);
                UI.toast('Error loading equipment.', 'error');
                return;
            }
        }
        this._query = '';
        this.renderShell(container);
    },

    async _refreshCache() {
        try {
            this._allEquipment = (await DataService.getAllEquipment() || []).map(x => ({ ...x, status: String(x.status || '').toLowerCase() }));
        } catch (e) {}
    },

    _matches(e, q) {
        return ['id', 'name', 'brand', 'model', 'serial', 'category', 'type', 'capacity', 'powerSource', 'ownership']
            .some(f => e[f] && String(e[f]).toLowerCase().includes(q));
    },

    _filteredList() {
        const q = this._query.trim().toLowerCase();
        if (q) return this._allEquipment.filter(e => this._matches(e, q));
        if (this._currentFilter === 'approved') return this._allEquipment.filter(e => e.status === 'approved');
        return this._allEquipment.filter(e => e.status === 'pending');
    },

    renderShell(container) {
        let html = `
                <div class="section-head"><h2>Tools & Equipment Database</h2><div class="rule"></div>
                    <button class="btn-primary" onclick="EquipmentPage.showAddForm()" style="padding:6px 14px;font-size:11px;">+ Add New Equipment</button>
                </div>
                <div id="equipAddForm" style="display:none;margin-bottom:20px;">
                    <div class="panel"><div class="panel-head"><h3>Add New Equipment</h3><button class="btn-ghost" onclick="EquipmentPage.hideAddForm()" style="padding:4px 12px;font-size:11px;">Cancel</button></div>
                    <div style="padding:16px;">
                        <form id="equipForm" onsubmit="return EquipmentPage.submitEquipment(event)">
                            <div class="db-form-grid">
                                <div class="field"><label>Category / Type *</label>
                                    <select id="equip-category" required>
                                        <option value="">Select...</option>
                                        <option>Heavy Equipment</option><option>Light Equipment</option>
                                        <option>Power Tools</option><option>Hand Tools</option>
                                        <option>Safety Equipment</option><option>Other</option>
                                    </select>
                                </div>
                                <div class="field"><label>Capacity / Rating</label><input type="text" id="equip-capacity" placeholder="e.g. 1.2 cu.m, 50 kVA" /></div>
                                <div class="field"><label>Unit</label>
                                    <select id="equip-unit"><option value="">Select...</option>
                                        <option>pcs</option><option>unit</option><option>set</option><option>kg</option><option>liters</option>
                                    </select>
                                </div>
                                <div class="field"><label>Brand *</label><input type="text" id="equip-brand" required placeholder="e.g. Caterpillar" /></div>
                                <div class="field"><label>Model</label><input type="text" id="equip-model" placeholder="e.g. CAT 320" /></div>
                                <div class="field"><label>Serial Number</label><input type="text" id="equip-serial" placeholder="e.g. CAT320-2021-001" /></div>
                                <div class="field"><label>Power Source</label>
                                    <select id="equip-power"><option value="">Select...</option>
                                        <option>Electric</option><option>Diesel</option><option>Gasoline</option>
                                        <option>Hydraulic</option><option>Manual</option><option>Battery</option><option>Other</option>
                                    </select>
                                </div>
                                <div class="field"><label>Ownership Type</label>
                                    <select id="equip-ownership"><option value="">Select...</option>
                                        <option>Owned</option><option>Rented</option><option>Leased</option><option>Borrowed</option>
                                    </select>
                                </div>
                                <div class="field"><label>Acquisition Date</label><input type="date" id="equip-acq" /></div>
                                <div class="field"><label>Condition</label>
                                    <select id="equip-condition"><option value="">Select...</option>
                                        <option>New</option><option>Good</option><option>Fair</option>
                                        <option>Needs Repair</option><option>For Disposal</option>
                                    </select>
                                </div>
                                <div class="field full"><label>Notes / Remarks</label><input type="text" id="equip-notes" /></div>
                                <div class="field full"><label>Photo</label>
                                    <div class="file-drop"><input type="file" accept="image/*" id="equip-image" onchange="EquipmentPage.previewEquipImage(event)" /></div>
                                    <div class="image-preview" id="equipImagePreview"><img id="equipImagePreviewImg" src="#" alt="Preview" /></div>
                                </div>
                                <div class="field full"><label>Manual (PDF)</label>
                                    <div class="file-drop"><input type="file" accept=".pdf" id="equip-manual" /></div>
                                </div>
                            </div>
                            <div class="submit-row"><button type="submit" class="btn-primary">Submit for Approval</button><button type="button" class="btn-ghost" onclick="EquipmentPage.hideAddForm()">Cancel</button></div>
                        </form>
                    </div></div>
                </div>
                <div class="searchbar"><span class="search-icon">${Icon.search({size:15})}</span><input type="text" id="equipSearch" placeholder="Search by ID, Brand, Model, Category..." oninput="EquipmentPage.onSearchInput(this.value)" /></div>
                <div class="status-tabs" id="equipStatusTabs"></div>
                <div class="list-container" id="equipListContainer"></div>`;
        UI.setContent(container, html);
        this.renderTabs();
        if (this._currentFilter === 'warehouse' && !this._query.trim()) this.renderWarehouse();
        else this.renderList();
    },

    renderTabs() {
        const el = document.getElementById('equipStatusTabs');
        if (!el) return;
        const q = this._query.trim();
        const approved = this._allEquipment.filter(e => e.status === 'approved').length;
        const pending = this._allEquipment.filter(e => e.status === 'pending').length;
        el.innerHTML = `
            <button class="${!q && this._currentFilter === 'approved' ? 'active' : ''}" onclick="EquipmentPage.setFilter('approved')">${Icon.checkCircle({size:13})} Approved (${approved})</button>
            <button class="${!q && this._currentFilter === 'pending' ? 'active' : ''}" onclick="EquipmentPage.setFilter('pending')">${Icon.hourglass({size:13})} Pending (${pending})</button>
            <button class="${!q && this._currentFilter === 'warehouse' ? 'active' : ''}" onclick="EquipmentPage.setFilter('warehouse')">${Icon.warehouse({size:13})} Warehouse</button>
            ${q ? `<button class="active" onclick="EquipmentPage.clearSearch()">${Icon.search({size:13})} Search Results (${this._filteredList().length}) ${Icon.close({size:11})}</button>` : ''}`;
    },

    renderList() {
        const el = document.getElementById('equipListContainer');
        if (!el) return;
        const list = this._filteredList();
        if (!list.length) {
            el.innerHTML = `<div class="empty"><p>No equipment found${this._query.trim() ? ` for "${this._query.trim()}"` : ''}.</p></div>`;
            return;
        }
        let html = '';
        list.forEach(e => {
            const imgHtml = e.image ? `<img src="${e.image}" alt="${esc(e.brand)}" loading="lazy" />` :
                `<span>${Icon.wrench({size:24})}</span>`;
            html += `
            <div class="mat-card" onclick="EquipmentPage.viewEquipment('${e.id}', this)" style="transition:transform .08s ease, box-shadow .08s ease;">
                <div class="mc-thumb">${imgHtml}</div>
                <div class="mc-body">
                    <div class="mc-title">${e.brand || 'Unnamed'} ${e.model ? '— ' + e.model : ''}</div>
                    <div class="mc-meta">
                        <span class="req-id">${e.id}</span>
                        <span>${e.category || ''} ${e.type && e.type !== e.category ? '→ ' + e.type : ''}</span>
                        <span>${e.unit || ''}</span>
                        ${e.status === 'pending' ? '<span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">Pending</span>' : ''}
                        ${e.status === 'approved' ? '<span class="stamp approved" style="transform:none;padding:1px 8px;font-size:9px;">Approved</span>' : ''}
                        ${e.status === 'pending' && App.isApprover() ? `<button class="btn-sm success" onclick="event.stopPropagation();EquipmentPage.approveEquipment('${e.id}')" style="margin-left:8px;">Approve</button>` : ''}
                    </div>
                </div>
                <div style="color:var(--ink-soft);">›</div>
            </div>`;
        });
        el.innerHTML = html;
    },

    onSearchInput(value) {
        this._query = value || '';
        this.renderTabs();
        if (!this._query.trim() && this._currentFilter === 'warehouse') this.renderWarehouse();
        else this.renderList();
    },

    clearSearch() {
        this._query = '';
        const inp = document.getElementById('equipSearch');
        if (inp) inp.value = '';
        this.renderTabs();
        if (this._currentFilter === 'warehouse') this.renderWarehouse();
        else this.renderList();
    },

    setFilter(filter) {
        this._currentFilter = filter;
        this._query = '';
        const inp = document.getElementById('equipSearch');
        if (inp) inp.value = '';
        this.renderTabs();
        if (filter === 'warehouse') this.renderWarehouse();
        else this.renderList();
    },

    /**
     * renderWarehouse (v8) - Tools & equipment currently sitting idle
     * at the office warehouse (from completed transfers). Same cache-
     * plus-refresh pattern as the Materials page; the cache is shared
     * with MaterialsPage when available so the two tabs stay in step.
     */
    async renderWarehouse(force) {
        const el = document.getElementById('equipListContainer');
        if (!el) return;
        if (!this._warehouse || force) {
            // reuse the Materials page cache if it already pulled stock
            if (!force && typeof MaterialsPage !== 'undefined' && MaterialsPage._warehouse) {
                this._warehouse = MaterialsPage._warehouse;
            } else {
                el.innerHTML = `<div class="empty"><p>Loading warehouse stock…</p></div>`;
                try {
                    this._warehouse = await DataService.getWarehouseStock();
                    if (typeof MaterialsPage !== 'undefined') MaterialsPage._warehouse = this._warehouse;
                } catch (err) {
                    UI.toast('' + err.message, 'error');
                    el.innerHTML = `<div class="empty"><p>Could not load warehouse stock.</p></div>`;
                    return;
                }
            }
        }
        const wh = this._warehouse;
        const eqs = wh.equipment || [];
        let html = `
            <div class="kpi-strip" style="margin:14px 0;">
                <div class="kpi-card"><div class="k-label">Equipment Types</div><div class="k-val">${eqs.length}</div><div class="k-sub">distinct items idle</div></div>
                <div class="kpi-card"><div class="k-label">Total Units</div><div class="k-val">${fmtNum(eqs.reduce((s, e) => s + e.qty, 0))}</div><div class="k-sub">in the warehouse</div></div>
                <div class="kpi-card warn"><div class="k-label">Pending Transfers</div><div class="k-val">${wh.pendingCount || 0}</div><div class="k-sub">awaiting approval</div></div>
            </div>
            <div class="section-head"><h2 style="font-size:13px;">Equipment in Warehouse</h2><div class="rule"></div>
                <button class="btn-sm" onclick="EquipmentPage.renderWarehouse(true)" title="Re-pull the latest stock">${Icon.refresh({size:12})} Refresh</button>
            </div>
            <div class="panel"><table><thead><tr><th>Equipment</th><th style="text-align:right">Qty</th><th>Last From</th><th>Date</th></tr></thead><tbody>`;
        if (!eqs.length) {
            html += `<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);padding:22px">No equipment in the warehouse. Units land here through completed transfers out of projects.</td></tr>`;
        } else {
            eqs.forEach(e => {
                html += `<tr>
                    <td>${esc(e.item)}</td>
                    <td class="amt"><b>${fmtNum(e.qty)}</b></td>
                    <td class="mono" style="font-size:11px">${e.lastFrom}</td>
                    <td class="mono" style="font-size:11px">${e.lastDate || '—'}</td>
                </tr>`;
            });
        }
        html += `</tbody></table></div>
            <div class="data-source-note">Warehouse contents are derived entirely from <b>completed transfers</b>. To pull a unit into a site, create a transfer (Warehouse → Project) from that project's Equipment tab. Check here for idle units before renting or buying.</div>`;
        el.innerHTML = html;
    },

    showAddForm() { const f = document.getElementById('equipAddForm'); if (f) f.style.display = 'block'; },
    hideAddForm() { const f = document.getElementById('equipAddForm'); if (f) f.style.display = 'none'; },
    previewEquipImage(e) {
        const file = e.target.files[0];
        const preview = document.getElementById('equipImagePreview');
        const img = document.getElementById('equipImagePreviewImg');
        if (file) { const r = new FileReader();
            r.onload = function(ev) { img.src = ev.target.result;
                preview.classList.add('open'); };
            r.readAsDataURL(file); } else preview.classList.remove('open');
    },
    async submitEquipment(e) {
        e.preventDefault();
        const data = {
            category: document.getElementById('equip-category').value,
            type: document.getElementById('equip-category').value,
            capacity: document.getElementById('equip-capacity').value.trim(),
            unit: document.getElementById('equip-unit').value,
            brand: document.getElementById('equip-brand').value.trim(),
            model: document.getElementById('equip-model').value.trim(),
            serial: document.getElementById('equip-serial').value.trim(),
            powerSource: document.getElementById('equip-power').value,
            ownership: document.getElementById('equip-ownership').value,
            acquisitionDate: document.getElementById('equip-acq').value,
            condition: document.getElementById('equip-condition').value,
            notes: document.getElementById('equip-notes').value.trim(),
            image: document.getElementById('equipImagePreviewImg').src || 'https://placehold.co/600x400/5B6360/FFFFFF?text=Equipment',
            manual: document.getElementById('equip-manual').files[0] ? document.getElementById('equip-manual')
                .files[0].name : ''
        };
        if (!data.category || !data.brand) { UI.toast('Category and Brand are required.', 'error'); return; }
        const confirmed = await Confirm.open('Submit for Approval?', '');
        if (!confirmed) return;
        try {
            const result = await DataService.requestEquipment(data);
            UI.toast(`${result.id} submitted for approval!`, 'success');
            document.getElementById('equipForm').reset();
            document.getElementById('equipImagePreview').classList.remove('open');
            this.hideAddForm();
            await this._refreshCache();
            this._currentFilter = 'pending';
            this._query = '';
            const inp = document.getElementById('equipSearch');
            if (inp) inp.value = '';
            this.renderTabs();
            this.renderList();
        } catch (err) { UI.toast('' + err.message, 'error'); }
        return false;
    },
    async approveEquipment(id) {
        const btn = Busy.pressed();
        const confirmed = await Confirm.open('Approve Equipment?', '');
        if (!confirmed) return;
        await Busy.run(btn, 'Approving', async () => {
            try { await DataService.approveEquipment(id);
                UI.toast('Equipment approved!', 'success');
                await this._refreshCache();
                this.renderTabs();
                this.renderList(); } catch (err) { UI.toast('' + err.message, 'error'); }
        });
    },
    viewEquipment(id, cardEl) {
        if (cardEl) {
            cardEl.style.transform = 'scale(.985)';
            cardEl.style.boxShadow = 'inset 0 0 0 2px var(--safety)';
            setTimeout(() => { cardEl.style.transform = ''; cardEl.style.boxShadow = ''; }, 180);
        }
        const eq = this._allEquipment.find(e => e.id === id);
        if (!eq) { UI.toast('Not found.', 'error'); return; }
        EquipPrintModal.open(eq);
    }
};
