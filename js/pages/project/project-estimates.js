// ================================================================
//  pages/project/project-estimates.js — Estimates tab
//
//  PURPOSE: Extends ProjectPage with the per-SOW estimate editor:
//  materials/labor/equipment/indirect line items with dropdowns fed
//  by the approved Materials & Equipment databases, live totals,
//  and the draft -> pending -> approved workflow that writes the
//  approved total back into the SOW budget.
// ================================================================

Object.assign(ProjectPage, {

    // ─── ESTIMATES ──────────────────────────────────────────────
    renderEstimates(p) {
        const container = document.getElementById('proj-tab-estimates');
        const est = this._estimatesData || { groups: [] };

        const approvedMats = this._approvedMaterials || [];
        const approvedEquip = this._approvedEquipment || [];

        let grandTotal = 0;
        (est.groups || []).forEach(g => {
            // v5 (item 8): indirect costs derive from direct costs, so a
            // draft group recomputes them live before totalling. Locked
            // groups keep the frozen values persisted at approval time.
            if (g.status !== 'approved' && g.status !== 'pending') this._recomputeIndirect(g);
            const matSum = (g.materials || []).reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
            const eqSum = (g.equipment || []).reduce((s, e) => s + (parseFloat(e.cost) || 0), 0);
            const labSum = (g.labor || []).reduce((s, l) => s + (parseFloat(l.cost) || 0), 0);
            const indSum = (g.indirect || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
            g._total = matSum + eqSum + labSum + indSum;
            grandTotal += g._total;
        });

        let html = `
                <div class="section-head"><h2>Project Estimates</h2><div class="rule"></div>
                    <span class="badge">Total Estimate: ₱${fmtMoney(grandTotal)}</span>
                </div>
                <p style="font-size:11px;color:var(--ink-soft);margin-bottom:12px;">
                    Each SOW has its own Materials, Labor, Equipment, and Indirect Costs. 
                    <strong>Draft</strong> → <strong>Submit for Approval</strong> → <strong>Approved</strong> (locked).
                </p>

                <div id="estGroupsContainer">`;

        if ((est.groups || []).length === 0) {
            html += `<div class="empty"><p>No SOW groups. Add a new SOW group below.</p></div>`;
        } else {
            (est.groups || []).forEach((group, gIdx) => {
                const isApproved = group.status === 'approved';
                const isPending = group.status === 'pending';
                const isDraft = group.status === 'draft' || !group.status;
                const isLocked = isApproved || isPending;
                const cardCls = isApproved ? 'approved' : isPending ? 'pending' : 'draft';
                const readonlyCls = isLocked ? 'readonly' : '';

                const currentEmail = ((App.getUser() && App.getUser().email) || '').toLowerCase();
                // v3 FIX: submitter detection used p.requests, which the
                // backend never returned — so the submitter kept seeing the
                // Approve button after submitting. EstimateGroups now
                // carries submittedBy, which is authoritative.
                const currentUser = App.getUser();
                const myEmail = currentUser ? String(currentUser.email).toLowerCase() : '';
                const isSubmitter = !!(isPending && group.submittedBy &&
                    String(group.submittedBy).toLowerCase() === myEmail);
                // v5 (item 13): mirrors the central multi-sig rules — only
                // ADMIN role approves, never the submitter, and never twice
                // (approvedBy comes from the Approvals signature sheet).
                const alreadySigned = isPending && (group.approvedBy || []).some(e => String(e).toLowerCase() === myEmail);
                const canApproveThis = isPending && !isSubmitter && !alreadySigned &&
                    currentUser && currentUser.role === 'admin';
                const hideStatusForSubmitter = isPending && isSubmitter;
                const awaitingOthers = isPending && alreadySigned;

                html += `
                        <div class="est-group-card ${cardCls} ${readonlyCls}" data-group-idx="${gIdx}">
                            <div class="eg-header">
                                <span class="eg-sow">${group.sowId || '—'}</span>
                                <span class="eg-desc">${group.sowDescription || 'No description'}</span>
                                ${awaitingOthers
                                    ? `<span style="font-size:10.5px;color:var(--green);">✓ Approved by you — awaiting other admins</span>`
                                    : hideStatusForSubmitter
                                    ? `<span style="font-size:10.5px;color:var(--ink-soft);">Submitted — awaiting approval</span>`
                                    : `<span class="eg-status ${group.status || 'draft'}">${group.status || 'draft'}</span>`}
                                <div class="eg-actions">
                                    ${canApproveThis ? `<button class="btn-sm success" onclick="ProjectPage.approveEstimateGroup('${gIdx}')">Approve</button>` : ''}
                                    ${isApproved ? `<span style="font-size:11px;color:var(--green);">${Icon.lock({size:12})} Approved</span>` : ''}
                                </div>
                            </div>
                            <div class="eg-body">
                                ${this._renderEstimateCategory('Materials', group.materials || [], gIdx, 'materials', isLocked, approvedMats)}
                                ${this._renderEstimateCategory('Labor', group.labor || [], gIdx, 'labor', isLocked, this._approvedManpower || [])}
                                ${this._renderEstimateCategory('Equipment', group.equipment || [], gIdx, 'equipment', isLocked, approvedEquip)}
                                ${this._renderEstimateCategory('Indirect Costs', group.indirect || [], gIdx, 'indirect', isLocked)}
                                <div class="eg-subtotal">
                                    <span class="eg-subtotal-label">Subtotal</span>
                                    ₱${fmtMoney((group._total || 0))}
                                </div>
                                ${isDraft ? `<div class="eg-footer-actions" style="margin-top:12px;display:flex;justify-content:flex-end;border-top:1px dashed var(--line);padding-top:12px;">
                                    <button class="btn-sm amber" onclick="ProjectPage.submitEstimateGroup('${gIdx}')">Submit for Approval</button>
                                </div>` : ''}
                            </div>
                        </div>`;
            });
        }

        html += `
                </div>
                <div class="submit-row" style="margin-top:16px;">
                    <button class="btn-primary" onclick="ProjectPage.addSOWGroup()">+ Add SOW Group</button>
                    <button class="btn-ghost" onclick="ProjectPage.saveAllEstimates()">${Icon.save({size:14})} Save All Drafts</button>

                </div>`;

        container.innerHTML = html;

        setTimeout(() => {
            if (this._data) {
                this.renderSOWBudget(this._data);
            }
        }, 100);
    },

    _renderEstimateCategory(label, items, gIdx, cat, isLocked, options = []) {
        if (!items) items = [];
        const catKey = cat;
        let html = `
                <div class="eg-category">
                    <div class="eg-cat-label">
                        ${label} 
                        <span class="eg-cat-total">(${items.length} items · ₱${fmtMoney(items.reduce((s, i) => s + (parseFloat(i.cost || i.amount || 0)), 0))})</span>
                    </div>
                    <div class="eg-cat-items">`;

        if (items.length === 0) {
            html += `<div style="font-size:11px;color:var(--ink-soft);padding:4px 0;">No items added.</div>`;
        } else {
            items.forEach((item, idx) => {
                const cost = parseFloat(item.cost || item.amount || 0);
                html += `<div class="eg-item-row" data-item-idx="${idx}" data-cat="${catKey}">`;

                if (cat === 'materials') {
                    // v5 (item 5): Material · Qty · Unit(auto) · Rate · Cost
                    const matOptionsHtml = (options || []).map(m => {
                        const labelText = ProjectPage._materialLabel(m);
                        const sel = String(item.material) === String(m.id) ? 'selected' : '';
                        return `<option value="${m.id}" data-name="${labelText}" data-rate="${m.rate || 0}" data-unit="${m.unit || ''}" ${sel}>${labelText}</option>`;
                    }).join('');
                    html += `
                                <div class="field"><label>Material</label>
                                    ${isLocked ? `<span style="font-size:12px;font-weight:500;">${item.materialName || item.material || '—'}</span>` :
                                    `<select class="est-mat-select" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" onchange="ProjectPage.selectMaterialForItem(${gIdx},${idx},this)">
                                        <option value="">Select...</option>
                                        ${matOptionsHtml}
                                    </select>`}
                                </div>
                                <div class="field"><label>Qty</label>
                                    ${isLocked ? `<span style="font-size:12px;">${item.qty || 0}</span>` :
                                    `<input type="number" class="est-item-qty" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.qty || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','qty',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Unit</label>
                                    <span style="font-size:12px;color:var(--ink-soft);" title="Auto from the material database">${item.unit || '—'}</span>
                                </div>
                                <div class="field"><label>Rate</label>
                                    ${isLocked ? `<span style="font-size:12px;">₱${fmtMoney((item.rate || 0))}</span>` :
                                    `<input type="number" class="est-item-rate" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.rate || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','rate',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Cost</label>
                                    <span class="cost-display">₱${fmtMoney(cost)}</span>
                                </div>
                                ${!isLocked ? `<div class="field"><button class="remove-btn" onclick="ProjectPage.removeEstimateItem(${gIdx},${idx},'${catKey}')">${Icon.close({size:13})}</button></div>` : ''}
                            `;
                } else if (cat === 'labor') {
                    // v5 (items 4 & 6): Role from the approved Manpower DB ·
                    // Qty · Days · Rate · Cost
                    const mpOptionsHtml = (options || []).map(mp => {
                        const sel = String(item.role) === String(mp.role) ? 'selected' : '';
                        return `<option value="${(mp.role || '').replace(/"/g, '&quot;')}" ${sel}>${mp.role}${mp.classification ? ' (' + mp.classification + ')' : ''}</option>`;
                    }).join('');
                    html += `
                                <div class="field"><label>Role</label>
                                    ${isLocked ? `<span style="font-size:12px;font-weight:500;">${item.role || '—'}</span>` :
                                    `<select class="est-item-role" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','role',this.value)">
                                        <option value="">Select role...</option>
                                        ${mpOptionsHtml}
                                        ${item.role && !(options || []).some(mp => String(mp.role) === String(item.role)) ? `<option value="${item.role}" selected>${item.role} (legacy)</option>` : ''}
                                    </select>`}
                                </div>
                                <div class="field"><label>Qty</label>
                                    ${isLocked ? `<span style="font-size:12px;">${item.qty || 0}</span>` :
                                    `<input type="number" class="est-item-qty" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.qty || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','qty',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Days</label>
                                    ${isLocked ? `<span style="font-size:12px;">${item.duration || 0}</span>` :
                                    `<input type="number" class="est-item-duration" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.duration || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','duration',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Rate</label>
                                    ${isLocked ? `<span style="font-size:12px;">₱${fmtMoney((item.rate || 0))}</span>` :
                                    `<input type="number" class="est-item-rate" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.rate || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','rate',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Cost</label>
                                    <span class="cost-display">₱${fmtMoney(cost)}</span>
                                </div>
                                ${!isLocked ? `<div class="field"><button class="remove-btn" onclick="ProjectPage.removeEstimateItem(${gIdx},${idx},'${catKey}')">${Icon.close({size:13})}</button></div>` : ''}
                            `;
                } else if (cat === 'equipment') {
                    const eqOptionsHtml = (options || []).map(e => {
                        const labelText = ProjectPage._equipmentLabel(e);
                        const sel = String(item.equipment) === String(e.id) ? 'selected' : '';
                        return `<option value="${e.id}" data-name="${labelText}" data-rate="${e.rate || 0}" data-unit="${e.unit || ''}" ${sel}>${labelText}</option>`;
                    }).join('');
                    // v5 (item 7): Equipment · Qty · Unit(auto) · Days · Rate · Cost
                    html += `
                                <div class="field"><label>Equipment</label>
                                    ${isLocked ? `<span style="font-size:12px;font-weight:500;">${item.equipName || item.equipment || '—'}</span>` :
                                    `<select class="est-eq-select" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" onchange="ProjectPage.selectEquipmentForItem(${gIdx},${idx},this)">
                                        <option value="">Select...</option>
                                        ${eqOptionsHtml}
                                    </select>`}
                                </div>
                                <div class="field"><label>Qty</label>
                                    ${isLocked ? `<span style="font-size:12px;">${item.qty || 0}</span>` :
                                    `<input type="number" class="est-item-qty" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.qty || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','qty',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Unit</label>
                                    <span style="font-size:12px;color:var(--ink-soft);" title="Auto from the equipment database">${item.unit || '—'}</span>
                                </div>
                                <div class="field"><label>Days</label>
                                    ${isLocked ? `<span style="font-size:12px;">${item.duration || 0}</span>` :
                                    `<input type="number" class="est-item-duration" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.duration || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','duration',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Rate</label>
                                    ${isLocked ? `<span style="font-size:12px;">₱${fmtMoney((item.rate || 0))}</span>` :
                                    `<input type="number" class="est-item-rate" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.rate || 0}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','rate',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Cost</label>
                                    <span class="cost-display">₱${fmtMoney(cost)}</span>
                                </div>
                                ${!isLocked ? `<div class="field"><button class="remove-btn" onclick="ProjectPage.removeEstimateItem(${gIdx},${idx},'${catKey}')">${Icon.close({size:13})}</button></div>` : ''}
                            `;
                } else if (cat === 'indirect') {
                    // v5 (item 8): Description · Type · Multiplier · Cost.
                    //   Non-VAT: cost = (materials + labor + equipment) × multiplier
                    //   VAT:     cost = (direct + non-VAT indirect) × multiplier (default 12%)
                    const isVat = item.type === 'VAT';
                    html += `
                                <div class="field"><label>Description</label>
                                    ${isLocked ? `<span style="font-size:12px;">${item.desc || '—'}</span>` :
                                    `<input type="text" class="est-item-desc" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.desc || ''}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','desc',this.value)" />`}
                                </div>
                                <div class="field"><label>Type</label>
                                    ${isLocked ? `<span style="font-size:12px;">${item.type || '—'}</span>` :
                                    `<select class="est-item-type" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','type',this.value)">
                                        <option value="Contingency" ${item.type === 'Contingency' ? 'selected' : ''}>Contingency</option>
                                        <option value="Overhead" ${item.type === 'Overhead' ? 'selected' : ''}>Overhead</option>
                                        <option value="Miscellaneous" ${item.type === 'Miscellaneous' ? 'selected' : ''}>Miscellaneous</option>
                                        <option value="Other" ${item.type === 'Other' ? 'selected' : ''}>Other</option>
                                        <option value="VAT" ${item.type === 'VAT' ? 'selected' : ''}>VAT (computed last)</option>
                                    </select>`}
                                </div>
                                <div class="field"><label>Multiplier ${isVat ? '(VAT rate)' : ''}</label>
                                    ${isLocked ? `<span style="font-size:12px;">${(parseFloat(item.multiplier) || 0)}</span>` :
                                    `<input type="number" step="0.01" min="0" class="est-item-mult" data-g="${gIdx}" data-idx="${idx}" data-cat="${catKey}" value="${item.multiplier !== undefined && item.multiplier !== '' ? item.multiplier : 0}" title="${isVat ? '(direct + non-VAT indirect) × this rate' : '(materials + labor + equipment) × this multiplier'}" onchange="ProjectPage.updateEstimateItem(${gIdx},${idx},'${catKey}','multiplier',parseFloat(this.value)||0)" />`}
                                </div>
                                <div class="field"><label>Cost</label>
                                    <span class="cost-display" title="${isVat ? '(direct + non-VAT indirect) × rate' : 'direct cost × multiplier'}">₱${fmtMoney(cost)}</span>
                                </div>
                                ${!isLocked ? `<div class="field"><button class="remove-btn" onclick="ProjectPage.removeEstimateItem(${gIdx},${idx},'${catKey}')">${Icon.close({size:13})}</button></div>` : ''}
                            `;
                }

                html += `</div>`;
            });
        }

        html += `
                    </div>
                    ${!isLocked ? `<div class="eg-add-btn"><button class="btn-sm" onclick="ProjectPage.addEstimateItem(${gIdx},'${catKey}')">+ Add</button></div>` : ''}
                </div>`;
        return html;
    },

    addEstimateItem(gIdx, cat) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) { UI.toast('Group not found.', 'error'); return; }
        const group = est.groups[gIdx];
        if (group.status === 'approved' || group.status === 'pending') { UI.toast('This estimate has been submitted and can no longer be edited.', 'error'); return; }
        const newItem = { id: 'est-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4) };
        if (cat === 'materials') { newItem.material = '';
            newItem.materialName = '';
            newItem.desc = '';
            newItem.qty = 0;
            newItem.rate = 0;
            newItem.cost = 0; } else if (cat === 'labor') { newItem.role = '';
            newItem.desc = '';
            newItem.qty = 0;
            newItem.duration = 0;
            newItem.rate = 0;
            newItem.cost = 0; } else if (cat === 'equipment') { newItem.equipment = '';
            newItem.equipName = '';
            newItem.desc = '';
            newItem.qty = 0;
            newItem.duration = 0;
            newItem.rate = 0;
            newItem.cost = 0; } else if (cat === 'indirect') { newItem.desc = '';
            newItem.type = 'Contingency';
            newItem.multiplier = 0;   // v5: cost = direct × multiplier
            newItem.amount = 0;
            newItem.cost = 0; }
        group[cat].push(newItem);
        this.renderEstimates(this._data);
        this.renderSOWBudget(this._data);
    },

    removeEstimateItem(gIdx, idx, cat) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) { UI.toast('Group not found.', 'error'); return; }
        const group = est.groups[gIdx];
        if (group.status === 'approved' || group.status === 'pending') { UI.toast('This estimate has been submitted and can no longer be edited.', 'error'); return; }
        if (group[cat] && group[cat].length > idx) {
            group[cat].splice(idx, 1);
            this.renderEstimates(this._data);
            this.renderSOWBudget(this._data);
        }
    },

    updateEstimateItem(gIdx, idx, cat, field, value) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) return;
        const group = est.groups[gIdx];
        if (group.status === 'approved' || group.status === 'pending') return;
        const item = group[cat] && group[cat][idx];
        if (!item) return;
        item[field] = value;
        if (cat === 'materials') {
            item.cost = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
        } else if (cat === 'labor' || cat === 'equipment') {
            item.cost = (parseFloat(item.qty) || 0) * (parseFloat(item.duration) || 0) * (parseFloat(item.rate) || 0);
        } else if (cat === 'indirect') {
            // v5 (item 8): switching a row to VAT seeds the editable default
            // 12% rate; actual costs are derived in _recomputeIndirect.
            if (field === 'type' && value === 'VAT' && !(parseFloat(item.multiplier) > 0)) {
                item.multiplier = 0.12;
            }
        }
        this._recomputeIndirect(group);   // direct changes ripple into indirect + VAT
        this.renderEstimates(this._data);
        this.renderSOWBudget(this._data);
    },

    /**
     * _recomputeIndirect (v5, item 8) - Derives every indirect cost from
     * the group's DIRECT cost (materials + labor + equipment):
     *   non-VAT rows: cost = direct × multiplier
     *   VAT rows:     cost = (direct + all non-VAT indirect) × multiplier
     * VAT rows are moved to the END so the base they need is always
     * settled first (and reads naturally on screen). Computed values are
     * stored in `amount` so backend totals/rollups stay unchanged.
     */
    _recomputeIndirect(group) {
        if (!group || group.status === 'approved' || group.status === 'pending') return;
        const ind = group.indirect || [];
        if (!ind.length) return;

        const direct =
            (group.materials || []).reduce((s, m) => s + (parseFloat(m.cost) || 0), 0) +
            (group.labor || []).reduce((s, l) => s + (parseFloat(l.cost) || 0), 0) +
            (group.equipment || []).reduce((s, e) => s + (parseFloat(e.cost) || 0), 0);

        // stable partition: non-VAT keep their order, VAT rows go last
        const nonVat = ind.filter(i => i.type !== 'VAT');
        const vat = ind.filter(i => i.type === 'VAT');
        group.indirect = nonVat.concat(vat);

        let nonVatSum = 0;
        nonVat.forEach(i => {
            const m = parseFloat(i.multiplier) || 0;
            i.amount = direct * m;
            i.cost = i.amount;
            nonVatSum += i.amount;
        });
        const vatBase = direct + nonVatSum;
        vat.forEach(i => {
            const m = (i.multiplier === undefined || i.multiplier === '' ) ? 0.12 : (parseFloat(i.multiplier) || 0);
            i.multiplier = m;
            i.amount = vatBase * m;
            i.cost = i.amount;
        });
    },

    _materialLabel(m) {
        if (!m) return '';
        return m.name || [m.brand, m.specs].filter(Boolean).join(' ') || m.id;
    },

    _equipmentLabel(e) {
        if (!e) return '';
        return e.name || [e.brand, e.model].filter(Boolean).join(' ') || e.id;
    },

    selectMaterialForItem(gIdx, idx, selectEl) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) return;
        const group = est.groups[gIdx];
        if (group.status === 'approved' || group.status === 'pending') return;
        const item = group.materials && group.materials[idx];
        if (!item) return;

        const materialId = selectEl.value;
        if (!materialId) {
            item.material = '';
            item.materialName = '';
            this.renderEstimates(this._data);
            return;
        }

        const isDuplicate = group.materials.some((m, i) => i !== idx && String(m.material) === String(materialId));
        if (isDuplicate) {
            UI.toast('This material is already added to this SOW estimate. Adjust the qty on the existing line instead.', 'error');
            selectEl.value = item.material || '';
            return;
        }

        const opt = selectEl.selectedOptions[0];
        item.material = materialId;
        item.unit = opt ? (opt.dataset.unit || '') : '';   // v5: unit auto-fills from the material
        item.materialName = opt ? opt.dataset.name : '';
        item.rate = opt ? (parseFloat(opt.dataset.rate) || 0) : (item.rate || 0);
        item.cost = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
        this.renderEstimates(this._data);
        this.renderSOWBudget(this._data);
    },

    selectEquipmentForItem(gIdx, idx, selectEl) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) return;
        const group = est.groups[gIdx];
        if (group.status === 'approved' || group.status === 'pending') return;
        const item = group.equipment && group.equipment[idx];
        if (!item) return;

        const equipId = selectEl.value;
        if (!equipId) {
            item.equipment = '';
            item.equipName = '';
            this.renderEstimates(this._data);
            return;
        }

        const isDuplicate = group.equipment.some((e, i) => i !== idx && String(e.equipment) === String(equipId));
        if (isDuplicate) {
            UI.toast('This equipment is already added to this SOW estimate. Adjust the qty/duration on the existing line instead.', 'error');
            selectEl.value = item.equipment || '';
            return;
        }

        const opt = selectEl.selectedOptions[0];
        item.equipment = equipId;
        item.equipName = opt ? opt.dataset.name : '';
        item.unit = opt ? (opt.dataset.unit || '') : '';   // v5: unit auto-fills from the equipment
        item.rate = opt ? (parseFloat(opt.dataset.rate) || 0) : (item.rate || 0);
        item.cost = (parseFloat(item.qty) || 0) * (parseFloat(item.duration) || 0) * (parseFloat(item.rate) || 0);
        this.renderEstimates(this._data);
        this.renderSOWBudget(this._data);
    },

    addSOWGroup() {
        const est = this._estimatesData;
        const p = this._data;
        if (!p || !this._sowItems) { UI.toast('No SOW items available.', 'error'); return; }
        const existingIds = (est.groups || []).map(g => g.sowId);
        const available = this._sowItems.filter(s => !existingIds.includes(s.id));
        if (available.length === 0) {
            UI.toast('All SOW items already have estimate groups.', 'error');
            return;
        }
        const sow = available[0];
        const currentUser = App.getUser();
        est.groups.push({
            sowId: sow.id,
            sowDescription: sow.description || '—',
            status: 'draft',
            createdBy: currentUser ? currentUser.email : '',
            materials: [],
            labor: [],
            equipment: [],
            indirect: []
        });
        this.renderEstimates(this._data);
        this.renderSOWBudget(this._data);
        UI.toast(`Added estimate group for ${sow.id}`, 'success');
    },

    async submitEstimateGroup(gIdx) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) { UI.toast('Group not found.', 'error'); return; }
        const group = est.groups[gIdx];
        if (group.status === 'approved') { UI.toast('Already approved.', 'error'); return; }
        if (group.status === 'pending') { UI.toast('Already submitted for approval.', 'error'); return; }
        const hasData = (group.materials && group.materials.length > 0) ||
            (group.labor && group.labor.length > 0) ||
            (group.equipment && group.equipment.length > 0) ||
            (group.indirect && group.indirect.length > 0);
        if (!hasData) { UI.toast('Add at least one item before submitting.', 'error'); return; }
        const confirmed = await Confirm.open('Submit for Approval?',
            `Submit ${group.sowId} — ${group.sowDescription} for approval?`);
        if (!confirmed) return;

        const submitBtn = document.querySelector(`.est-group-card[data-group-idx="${gIdx}"] .eg-footer-actions button`);
        const originalLabel = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) { submitBtn.textContent = 'Submitting...'; submitBtn.disabled = true; }

        try {
            await DataService.saveEstimates(this._currentProjectId, est.groups);
            await DataService.submitEstimatesForApproval(this._currentProjectId, group.sowId);
            group.status = 'pending';
            // v5 (item 3 FIX): mark the submitter locally too. Without this,
            // the immediate re-render didn't know who submitted, so the
            // Submit/Approve buttons flashed instead of the
            // "Submitted — awaiting approval" text until a full reload.
            group.submittedBy = (App.getUser() && App.getUser().email) || '';
            group.approvedBy = [];
            this.renderEstimates(this._data);
            this.renderSOWBudget(this._data);
            UI.toast(`${group.sowId} submitted for approval.`, 'success');
            this._updateApprovalBadge();
        } catch (err) {
            UI.toast('' + err.message, 'error');
            if (submitBtn) { submitBtn.textContent = originalLabel; submitBtn.disabled = false; }
        }
    },

    async approveEstimateGroup(gIdx) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) { UI.toast('Group not found.', 'error'); return; }
        const group = est.groups[gIdx];
        if (group.status !== 'pending') { UI.toast('Only pending estimates can be approved.', 'error'); return; }
        
        const currentUser = App.getUser();
        const currentUserEmail = currentUser ? currentUser.email.toLowerCase() : '';
        if (group.createdBy && group.createdBy.toLowerCase() === currentUserEmail) {
            UI.toast('You cannot approve your own estimate submission.', 'error');
            return;
        }
        
        const confirmed = await Confirm.open('Approve Estimate?',
            `Approve ${group.sowId} — ${group.sowDescription}? This will lock it from further edits and set it as this SOW's official Budget.`);
        if (!confirmed) return;
        
        try {
            // v5 (item 13 FIX): this used to call approveEstimates directly,
            // BYPASSING the multi-signature engine — one person finalized it
            // instantly and no signature was recorded, so the item never
            // behaved like the other approvals. It now signs through the
            // same engine as the Approvals inbox.
            const result = await DataService.approveItemGeneric(group.id, 'Estimate');
            const myEmail = (App.getUser() && App.getUser().email || '').toLowerCase();
            if (result && result.awaiting) {
                group.approvedBy = (group.approvedBy || []).concat([myEmail]);
                UI.toast(`${group.sowId}: your approval is recorded — awaiting the other admins.`, 'success');
            } else {
                group.status = 'approved';
                UI.toast(`${group.sowId} approved and locked. SOW Budget updated.`, 'success');
            }
            this.renderEstimates(this._data);
            this.renderSOWBudget(this._data);
            this._updateApprovalBadge();
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async saveAllEstimates() {
        const est = this._estimatesData;
        if (!est) { UI.toast('No data to save.', 'error'); return; }
        try {
            await DataService.saveEstimates(this._currentProjectId, est.groups);
            UI.toast('All estimates saved!', 'success');
            this.renderSOWBudget(this._data);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },
});