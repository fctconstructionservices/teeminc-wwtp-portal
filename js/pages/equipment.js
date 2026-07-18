// ================================================================
//  pages/equipment.js — Equipment database page
//
//  PURPOSE: Mirror of pages/materials.js for the equipment catalog:
//  filter tabs, search, EquipPrintModal datasheet and role-gated
//  approval.
// ================================================================

const EquipmentPage = {
    _allEquipment: [],
    _currentFilter: 'approved',
    _searchResults: null,

    async load() {
        this._searchResults = null;
        const container = document.getElementById('equipmentContent');
        UI.showLoading(container);
        try {
            this._allEquipment = (await DataService.getAllEquipment() || []).map(x => ({ ...x, status: String(x.status || '').toLowerCase() }));   // v6.1: legacy rows hold 'Pending'
            this.render(container);
        } catch (err) { console.error('Equipment error:', err);
            UI.toast('Error loading equipment.', 'error'); }
    },

    render(container, items = null) {
        let list = items;
        if (!list) {
            const approved = this._allEquipment.filter(e => e.status === 'approved');
            const pending = this._allEquipment.filter(e => e.status === 'pending');
            list = this._currentFilter === 'approved' ? approved : pending;
        }
        if (this._searchResults !== null) {
            list = this._searchResults;
        }

        const approved = this._allEquipment.filter(e => e.status === 'approved');
        const pending = this._allEquipment.filter(e => e.status === 'pending');

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
                <div class="searchbar"><span class="search-icon">${Icon.search({size:15})}</span><input type="text" id="equipSearch" placeholder="Search by ID, Brand, Model, Category..." oninput="EquipmentPage.search()" /></div>
                <div class="status-tabs">
                    <button class="${this._currentFilter === 'approved' && this._searchResults === null ? 'active' : ''}" onclick="EquipmentPage.setFilter('approved')">${Icon.checkCircle({size:13})} Approved (${approved.length})</button>
                    <button class="${this._currentFilter === 'pending' && this._searchResults === null ? 'active' : ''}" onclick="EquipmentPage.setFilter('pending')">⏳ Pending (${pending.length})</button>
                    ${this._searchResults !== null ? `<button class="active" onclick="EquipmentPage.clearSearch()">${Icon.search({size:13})} Search Results (${list.length})</button>` : ''}
                </div>
                <div class="list-container">`;
                if (list.length === 0) html += `<div class="empty"><p>No equipment found.</p></div>`;
                else {
                    list.forEach(e => {
                        const imgHtml = e.image ? `<img src="${e.image}" alt="${e.brand}" />` :
                            `<span>${Icon.wrench({size:24})}</span>`;
                        html += `
                        <div class="mat-card" onclick="EquipmentPage.viewEquipment('${e.id}')">
                            <div class="mc-thumb">${imgHtml}</div>
                            <div class="mc-body">
                                <div class="mc-title">${e.brand || 'Unnamed'} ${e.model ? '— ' + e.model : ''}</div>
                                <div class="mc-meta">
                                    <span class="req-id">${e.id}</span>
                                    <span>${e.category || ''} ${e.type ? '→ ' + e.type : ''}</span>
                                    <span>${e.unit || ''}</span>
                                    ${e.status === 'pending' ? '<span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">Pending</span>' : ''}
                                    ${e.status === 'approved' ? '<span class="stamp approved" style="transform:none;padding:1px 8px;font-size:9px;">Approved</span>' : ''}
                                    ${e.status === 'pending' && App.isApprover() ? `<button class="btn-sm success" onclick="event.stopPropagation();EquipmentPage.approveEquipment('${e.id}')" style="margin-left:8px;">Approve</button>` : ''}
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
        this._searchResults = null;
        this.load();
    },

    clearSearch() {
        this._searchResults = null;
        this.load();
    },

    search() {
        const query = document.getElementById('equipSearch').value;
        if (!query.trim()) {
            this._searchResults = null;
            this.load();
            return;
        }
        const container = document.getElementById('equipmentContent');
        UI.showLoading(container);
        setTimeout(async () => {
            const results = await DataService.searchEquipment(query);
            this._searchResults = results;
            this.render(container);
        }, 300);
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
            this._allEquipment = (await DataService.getAllEquipment() || []).map(x => ({ ...x, status: String(x.status || '').toLowerCase() }));   // v6.1: legacy rows hold 'Pending'
            this._searchResults = null;
            
            // ✅ FIX: Automatically switch to Pending tab after submission (Bug #1)
            this._currentFilter = 'pending';
            this.load();
        } catch (err) { UI.toast('' + err.message, 'error'); }
        return false;
    },
    async approveEquipment(id) {
        const confirmed = await Confirm.open('Approve Equipment?', '');
        if (!confirmed) return;
        try { await DataService.approveEquipment(id);
            UI.toast('Equipment approved!', 'success');
            this._allEquipment = (await DataService.getAllEquipment() || []).map(x => ({ ...x, status: String(x.status || '').toLowerCase() }));   // v6.1: legacy rows hold 'Pending'
            this._searchResults = null;
            this.load(); } catch (err) { UI.toast('' + err.message, 'error'); }
    },
    async viewEquipment(id) {
        const all = await DataService.getAllEquipment();
        const eq = all.find(e => e.id === id);
        if (!eq) { UI.toast('Not found.', 'error'); return; }
        EquipPrintModal.open(eq);
    }
};