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
                ${(() => {
                    // v8 (6.9): once EVERY estimate group is approved, the
                    // project cost is final — unlock DUPA + Summary exports.
                    const groups = est.groups || [];
                    const allApproved = groups.length > 0 && groups.every(g => g.status === 'approved');
                    if (!allApproved) return '';
                    return `<div class="panel" style="margin-bottom:14px;background:var(--blueprint-tint);">
                        <div style="padding:11px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                            <b style="font-family:'Oswald';font-size:11.5px;text-transform:uppercase;color:var(--blueprint);">All estimates approved — exports ready:</b>
                            <button class="btn-sm primary" onclick="ProjectPage.printDUPA()">${Icon.printer({size:12})} Print DUPA (PDF)</button>
                            <button class="btn-sm" onclick="ProjectPage.printEstimateSummary()">${Icon.printer({size:12})} Summary (PDF)</button>
                            <button class="btn-sm" onclick="ProjectPage.exportEstimateSummaryExcel()">${Icon.spreadsheet({size:12})} Summary (Excel)</button>
                        </div>
                    </div>`;
                })()}
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
                                    ? `<span style="font-size:10.5px;color:var(--green);">${Icon.check({size:11})} Approved by you — awaiting other admins</span>`
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
                                ${(() => {
                                    // v8 (6.8): Cost per Unit = subtotal ÷ SOW quantity
                                    const sow = (p.sowItems || []).find(s => s.id === group.sowId);
                                    const qty = sow ? parseFloat(sow.qty) : 0;
                                    if (!qty || isNaN(qty)) return '';
                                    return `<div class="eg-subtotal" style="font-size:12px;opacity:.85;">
                                        <span class="eg-subtotal-label">Cost per Unit <span style="font-weight:400;font-size:10px;">(÷ ${fmtNum(qty)} ${sow.unit || 'unit'})</span></span>
                                        ₱${fmtMoney((group._total || 0) / qty)}<span style="font-size:10px;color:var(--ink-soft);"> / ${sow.unit || 'unit'}</span>
                                    </div>`;
                                })()}
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
                    ${this._canEdit !== false ? `<button class="btn-primary" onclick="ProjectPage.addSOWGroup()">+ Add SOW Group</button>
                    <button class="btn-ghost" onclick="ProjectPage.saveAllEstimates()">${Icon.save({size:14})} Save All Drafts</button>` : ''}

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
                    // v10: searchable picker instead of a native <select> —
                    // a few hundred approved materials cannot be found by
                    // first-letter jump-scrolling alone.
                    const matSSId = `ss-mat-${gIdx}-${idx}`;
                    const matOpts = (options || []).map(m => ({
                        value: m.id,
                        label: ProjectPage._materialLabel(m),
                        group: m.category || 'Uncategorized',
                        meta: [m.unit, m.rate ? '₱' + fmtMoney(m.rate) : ''].filter(Boolean).join(' · '),
                        keywords: [m.id, m.brand, m.model, m.specs, m.grade, m.size, m.subcategory].filter(Boolean).join(' '),
                        unit: m.unit || '',
                        rate: parseFloat(m.rate) || 0
                    }));
                    const matCurrent = matOpts.find(o => String(o.value) === String(item.material));
                    html += `
                                <div class="field"><label>Material</label>
                                    ${isLocked ? `<span style="font-size:12px;font-weight:500;">${item.materialName || item.material || '—'}</span>` :
                                    SearchSelect.render({
                                        id: matSSId,
                                        value: item.material || '',
                                        display: matCurrent ? matCurrent.label : (item.materialName || ''),
                                        placeholder: 'Search name, brand, ID, spec...',
                                        options: matOpts,
                                        onSelect: (v, o) => ProjectPage.selectMaterialForItem(gIdx, idx, v, o)
                                    })}
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
                    // v10: searchable role picker
                    const lbSSId = `ss-lab-${gIdx}-${idx}`;
                    const lbOpts = (options || []).map(mp => ({
                        value: mp.role || '',
                        label: mp.role || '',
                        group: mp.classification || 'Other',
                        meta: mp.classification || '',
                        keywords: [mp.id, mp.code, mp.notes].filter(Boolean).join(' ')
                    }));
                    // keep a legacy role selectable even if it left the catalog
                    if (item.role && !lbOpts.some(o => String(o.value) === String(item.role))) {
                        lbOpts.unshift({ value: item.role, label: item.role + ' (legacy)', group: 'Legacy', meta: '' });
                    }
                    html += `
                                <div class="field"><label>Role</label>
                                    ${isLocked ? `<span style="font-size:12px;font-weight:500;">${item.role || '—'}</span>` :
                                    SearchSelect.render({
                                        id: lbSSId,
                                        value: item.role || '',
                                        display: item.role || '',
                                        placeholder: 'Search role or trade...',
                                        options: lbOpts,
                                        onSelect: (v) => ProjectPage.updateEstimateItem(gIdx, idx, catKey, 'role', v)
                                    })}
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
                    // v10: searchable equipment picker
                    const eqSSId = `ss-eq-${gIdx}-${idx}`;
                    const eqOpts = (options || []).map(e => ({
                        value: e.id,
                        label: ProjectPage._equipmentLabel(e),
                        group: e.category || e.type || 'Uncategorized',
                        meta: [e.unit, e.rate ? '₱' + fmtMoney(e.rate) : ''].filter(Boolean).join(' · '),
                        keywords: [e.id, e.brand, e.model, e.serial, e.capacity, e.powerSource, e.ownership].filter(Boolean).join(' '),
                        unit: e.unit || '',
                        rate: parseFloat(e.rate) || 0
                    }));
                    const eqCurrent = eqOpts.find(o => String(o.value) === String(item.equipment));
                    // v5 (item 7): Equipment · Qty · Unit(auto) · Days · Rate · Cost
                    html += `
                                <div class="field"><label>Equipment</label>
                                    ${isLocked ? `<span style="font-size:12px;font-weight:500;">${item.equipName || item.equipment || '—'}</span>` :
                                    SearchSelect.render({
                                        id: eqSSId,
                                        value: item.equipment || '',
                                        display: eqCurrent ? eqCurrent.label : (item.equipName || ''),
                                        placeholder: 'Search brand, model, category...',
                                        options: eqOpts,
                                        onSelect: (v, o) => ProjectPage.selectEquipmentForItem(gIdx, idx, v, o)
                                    })}
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

    /**
     * selectMaterialForItem (v10) - receives the chosen VALUE and OPTION
     * from SearchSelect rather than a <select> element, so the unit and
     * DB rate still auto-fill exactly as before.
     */
    selectMaterialForItem(gIdx, idx, materialId, opt) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) return;
        const group = est.groups[gIdx];
        if (group.status === 'approved' || group.status === 'pending') return;
        const item = group.materials && group.materials[idx];
        if (!item) return;

        if (!materialId) {
            item.material = '';
            item.materialName = '';
            this.renderEstimates(this._data);
            return;
        }

        const isDuplicate = group.materials.some((m, i) => i !== idx && String(m.material) === String(materialId));
        if (isDuplicate) {
            UI.toast('This material is already on this SOW estimate. Adjust the qty on the existing line instead.', 'error');
            this.renderEstimates(this._data);   // restores the previous label
            return;
        }

        item.material = materialId;
        item.unit = opt ? (opt.unit || '') : '';            // auto-fills from the material DB
        item.materialName = opt ? opt.label : '';
        item.rate = opt && opt.rate ? opt.rate : (item.rate || 0);
        item.cost = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
        this.renderEstimates(this._data);
        this.renderSOWBudget(this._data);
    },

    /** selectEquipmentForItem (v10) - value + option from SearchSelect. */
    selectEquipmentForItem(gIdx, idx, equipId, opt) {
        const est = this._estimatesData;
        if (!est || !est.groups[gIdx]) return;
        const group = est.groups[gIdx];
        if (group.status === 'approved' || group.status === 'pending') return;
        const item = group.equipment && group.equipment[idx];
        if (!item) return;

        if (!equipId) {
            item.equipment = '';
            item.equipName = '';
            this.renderEstimates(this._data);
            return;
        }

        const isDuplicate = group.equipment.some((e, i) => i !== idx && String(e.equipment) === String(equipId));
        if (isDuplicate) {
            UI.toast('This equipment is already on this SOW estimate. Adjust the qty or duration on the existing line instead.', 'error');
            this.renderEstimates(this._data);
            return;
        }

        item.equipment = equipId;
        item.equipName = opt ? opt.label : '';
        item.unit = opt ? (opt.unit || '') : '';            // auto-fills from the equipment DB
        item.rate = opt && opt.rate ? opt.rate : (item.rate || 0);
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
            // v6.7 PERF: save ONLY the group being submitted — the old code
            // pushed EVERY group's line items on each submit, so a 10-group
            // project rewrote all four estimate sheets ten times over.
            await DataService.saveEstimates(this._currentProjectId, [group]);
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
// ════════ v8: DUPA + SUMMARY EXPORTS (item 6.9) ════════
// Available only when ALL estimate groups are approved. The Summary
// intentionally HIDES indirect costs by folding them into Material
// and Labor: if both direct costs exist, each takes half the
// indirect; if one side is zero, the other absorbs it all.
// NOTE: equipment cost is folded into the Labor Cost column.

Object.assign(ProjectPage, {

    /** _estimateSummaryRows - one row per approved SOW group, with the
     *  indirect-cost split applied. */
    _estimateSummaryRows() {
        const p = this._data || {};
        const groups = (this._estimatesData && this._estimatesData.groups) || [];
        return groups.map(g => {
            const sow = (p.sowItems || []).find(s => s.id === g.sowId) || {};
            const mat = (g.materials || []).reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
            const lab = (g.labor || []).reduce((s, l) => s + (parseFloat(l.cost) || 0), 0)
                      + (g.equipment || []).reduce((s, e) => s + (parseFloat(e.cost) || 0), 0);
            const ind = (g.indirect || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
            let matCost, labCost;
            if (mat > 0 && lab > 0) { matCost = mat + ind / 2; labCost = lab + ind / 2; }
            else if (mat <= 0)      { matCost = 0;             labCost = lab + ind; }
            else                    { matCost = mat + ind;     labCost = 0; }
            const total = matCost + labCost;
            const qty = parseFloat(sow.qty) || 0;
            return {
                itemNo: g.sowId,
                description: g.sowDescription || sow.description || '',
                qty: qty,
                unit: sow.unit || '',
                unitCost: qty ? total / qty : 0,
                matCost: matCost,
                labCost: labCost,
                total: total
            };
        });
    },

    /**
     * _openPrintWindow (v11 BATCH E) - Now routes through PrintDoc so
     * the estimate summary and DUPA carry the same company letterhead as
     * every other printed document.
     *
     * These two prints open a NEW WINDOW, which does not inherit this
     * page's stylesheet, so PrintDoc.documentHTML() inlines the
     * letterhead CSS along with the caller's own table styles. Signature
     * blocks come from the template rather than being hard-coded here.
     *
     * The template is loaded BEFORE window.open(): a popup opened and
     * then left blank while an await resolves reads as a broken button,
     * and some blockers close it.
     */
    async _openPrintWindow(title, bodyHtml, opts) {
        opts = opts || {};
        await PrintDoc.load();
        const w = window.open('', '_blank');
        if (!w) { UI.toast('Popup blocked — please allow popups for this site.', 'error'); return; }
        const p = this._data || {};
        w.document.write(PrintDoc.documentHTML({
            title: title,
            meta: [p.name, p.location].filter(Boolean).join(' · '),
            landscape: !!opts.landscape,
            body: bodyHtml,
            css: `
                h1{font-size:17px;text-transform:uppercase;letter-spacing:.04em;margin:0 0 2px;}
                h2{font-size:13px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.03em;border-bottom:2px solid var(--pd-accent);padding-bottom:3px;}
                .meta{font-size:11px;color:#5B6360;margin-bottom:14px;}
                table{width:100%;border-collapse:collapse;margin-bottom:10px;}
                th,td{border:1px solid #c9c5b8;padding:5px 7px;font-size:11px;text-align:left;}
                th{background:#eef1f3;text-transform:uppercase;font-size:9.5px;letter-spacing:.04em;}
                td.amt,th.amt{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
                tr.total td{font-weight:700;background:#f6f4ec;}
                .grand{font-size:13px;font-weight:700;text-align:right;margin-top:8px;}
                .break{page-break-inside:avoid;}
            `
        }));
        w.document.close();
        setTimeout(() => { try { w.focus(); } catch (e) {} }, 300);
    },

    /** printDUPA - Detailed Unit Price Analysis: full line items per
     *  approved SOW group (materials, labor, equipment, indirect). */
    printDUPA() {
        const p = this._data || {};
        const groups = (this._estimatesData && this._estimatesData.groups) || [];
        let grand = 0;
        let body = `<h1>DUPA — Detailed Unit Price Analysis</h1>
            <div class="meta"><b>${p.name || this._currentProjectId}</b> · ${p.client || ''} · Generated ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>`;
        groups.forEach(g => {
            const sow = (p.sowItems || []).find(s => s.id === g.sowId) || {};
            const qty = parseFloat(sow.qty) || 0;
            const cat = (title, rows, cols) => {
                if (!rows || !rows.length) return '';
                let sum = 0;
                let h = `<table><thead><tr>${cols.map(c => `<th class="${c.amt ? 'amt' : ''}">${c.h}</th>`).join('')}</tr></thead><tbody>`;
                rows.forEach(r => {
                    h += `<tr>${cols.map(c => `<td class="${c.amt ? 'amt' : ''}">${c.f(r)}</td>`).join('')}</tr>`;
                    sum += parseFloat(r.cost !== undefined ? r.cost : r.amount) || 0;
                });
                h += `<tr class="total"><td colspan="${cols.length - 1}">${title} Subtotal</td><td class="amt">₱${fmtMoney(sum)}</td></tr></tbody></table>`;
                return h;
            };
            const money = v => '₱' + fmtMoney(parseFloat(v) || 0);
            body += `<div class="break"><h2>${g.sowId} — ${g.sowDescription || sow.description || ''} <span style="font-weight:400;font-size:10.5px;">(${fmtNum(qty)} ${sow.unit || ''})</span></h2>`;
            body += cat('Materials', g.materials, [
                { h: 'Material', f: r => r.name || '—' }, { h: 'Qty', f: r => fmtNum(parseFloat(r.qty) || 0), amt: true },
                { h: 'Unit', f: r => r.unit || '' }, { h: 'Unit Price', f: r => money(r.price), amt: true }, { h: 'Amount', f: r => money(r.cost), amt: true }]);
            body += cat('Labor', g.labor, [
                { h: 'Role', f: r => r.role || r.name || '—' }, { h: 'Count', f: r => fmtNum(parseFloat(r.count || r.qty) || 0), amt: true },
                { h: 'Days', f: r => fmtNum(parseFloat(r.days) || 0), amt: true }, { h: 'Rate/Day', f: r => money(r.rate), amt: true }, { h: 'Amount', f: r => money(r.cost), amt: true }]);
            body += cat('Equipment', g.equipment, [
                { h: 'Equipment', f: r => r.name || '—' }, { h: 'Qty', f: r => fmtNum(parseFloat(r.qty || r.count) || 0), amt: true },
                { h: 'Duration', f: r => fmtNum(parseFloat(r.days || r.duration) || 0), amt: true }, { h: 'Rate', f: r => money(r.rate), amt: true }, { h: 'Amount', f: r => money(r.cost), amt: true }]);
            body += cat('Indirect Costs', g.indirect, [
                { h: 'Item', f: r => r.name || r.label || '—' }, { h: 'Basis', f: r => r.basis || (r.pct ? r.pct + '%' : '—') }, { h: 'Amount', f: r => money(r.amount), amt: true }]);
            const gt = g._total || 0;
            grand += gt;
            body += `<div class="grand">SOW Total: ₱${fmtMoney(gt)}${qty ? ` &nbsp;·&nbsp; Unit Cost: ₱${fmtMoney(gt / qty)} / ${sow.unit || 'unit'}` : ''}</div></div>`;
        });
        body += `<div class="grand" style="font-size:15px;border-top:2px solid #1c2321;padding-top:8px;">PROJECT TOTAL: ₱${fmtMoney(grand)}</div>
            `;   // v11 BATCH E: the signature row is no longer hard-coded here —
                 // PrintDoc appends the blocks defined in the print template,
                 // so labels and names are set once and apply to every document.
        this._openPrintWindow('DUPA — ' + (p.name || this._currentProjectId), body);
    },

    /** printEstimateSummary - client-facing summary; indirect hidden
     *  inside Material/Labor per the split rule. */
    printEstimateSummary() {
        const p = this._data || {};
        const rows = this._estimateSummaryRows();
        const grand = rows.reduce((s, r) => s + r.total, 0);
        let body = `<h1>Cost Estimate Summary</h1>
            <div class="meta"><b>${p.name || this._currentProjectId}</b> · ${p.client || ''} · Generated ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <table><thead><tr>
                <th>Item No</th><th>Description</th><th class="amt">Qty</th><th>Unit</th>
                <th class="amt">Unit Cost</th><th class="amt">Material Cost</th><th class="amt">Labor Cost</th><th class="amt">Total</th>
            </tr></thead><tbody>`;
        rows.forEach(r => {
            body += `<tr>
                <td>${r.itemNo}</td><td>${r.description}</td>
                <td class="amt">${fmtNum(r.qty)}</td><td>${r.unit}</td>
                <td class="amt">₱${fmtMoney(r.unitCost)}</td>
                <td class="amt">₱${fmtMoney(r.matCost)}</td>
                <td class="amt">₱${fmtMoney(r.labCost)}</td>
                <td class="amt">₱${fmtMoney(r.total)}</td>
            </tr>`;
        });
        body += `<tr class="total"><td colspan="5">TOTAL</td>
            <td class="amt">₱${fmtMoney(rows.reduce((s, r) => s + r.matCost, 0))}</td>
            <td class="amt">₱${fmtMoney(rows.reduce((s, r) => s + r.labCost, 0))}</td>
            <td class="amt">₱${fmtMoney(grand)}</td></tr></tbody></table>
            `;   // v11 BATCH E: the signature row is no longer hard-coded here —
                 // PrintDoc appends the blocks defined in the print template,
                 // so labels and names are set once and apply to every document.
        this._openPrintWindow('Estimate Summary — ' + (p.name || this._currentProjectId), body);
    },

    /** exportEstimateSummaryExcel - same summary, as .xlsx (SheetJS). */
    exportEstimateSummaryExcel() {
        if (typeof XLSX === 'undefined') { UI.toast('Excel library not loaded — refresh the page and try again.', 'error'); return; }
        const p = this._data || {};
        const rows = this._estimateSummaryRows();
        const aoa = [
            ['COST ESTIMATE SUMMARY'],
            [p.name || this._currentProjectId, p.client || ''],
            ['Generated', new Date().toLocaleDateString('en-PH')],
            [],
            ['Item No', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Material Cost', 'Labor Cost', 'Total']
        ];
        rows.forEach(r => aoa.push([r.itemNo, r.description, r.qty, r.unit,
            Math.round(r.unitCost * 100) / 100, Math.round(r.matCost * 100) / 100,
            Math.round(r.labCost * 100) / 100, Math.round(r.total * 100) / 100]));
        aoa.push(['', 'TOTAL', '', '',
            '', Math.round(rows.reduce((s, r) => s + r.matCost, 0) * 100) / 100,
            Math.round(rows.reduce((s, r) => s + r.labCost, 0) * 100) / 100,
            Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100]);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 10 }, { wch: 42 }, { wch: 9 }, { wch: 7 }, { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Summary');
        XLSX.writeFile(wb, `Estimate-Summary-${(p.name || this._currentProjectId).replace(/[^\w-]+/g, '_')}.xlsx`);
    }
});
