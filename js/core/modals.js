// ================================================================
//  core/modals.js — Print/detail modals
//
//  PURPOSE: Read-only, print-friendly views:
//    PrintModal        -> Daily Site Record
//    MatPrintModal     -> Material datasheet
//    EquipPrintModal   -> Equipment datasheet
//    SOWBreakdownModal -> SOW estimate breakdown (BOM/labor/equipment/indirect)
//  Each modal renders into a fixed container in index.html and locks
//  body scroll while open.
// ================================================================

// ─── PRINT MODAL ─────────────────────────────────────────────────

const PrintModal = {
    /**
     * open(record, meta) — meta (v3, optional):
     *   { projectName, preparedBy } shown in the header so the modal
     *   matches the daily record FORM header.
     */
    open(record, meta) {
        const modal = document.getElementById('printModal');
        const body = document.getElementById('printBody');
        body.innerHTML = this.renderPrintView(record, meta || {});
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    },
    close() {
        document.getElementById('printModal').classList.remove('open');
        document.body.style.overflow = '';
    },
    renderPrintView(r, meta) {
        meta = meta || {};
        const totalManpower = r.manpower ? r.manpower.reduce((s, m) => s + (parseInt(m.count) || 0), 0) : 0;
        const statusCls = r.status === 'On Track' ? 'ontrack' : r.status === 'Delayed' ? 'delayed' : 'completed';
        let html = `
                <div class="print-header">
                    <h2>Daily Site Record</h2>
                    <div class="print-meta">${r.date} · <span class="stamp ${statusCls}" style="transform:none;font-size:10px;">${r.status}</span></div>
                </div>
                <div class="print-section"><div class="ps-title">Report Header</div><div class="ps-grid">
                    <div class="item"><span class="label">Project</span><span class="value">${meta.projectName || '—'}</span></div>
                    <div class="item"><span class="label">Prepared By</span><span class="value">${meta.preparedBy || r.createdBy || '—'}</span></div>
                    <div class="item"><span class="label">Report Date</span><span class="value">${r.date || '—'}</span></div>
                </div></div>
                <div class="print-section"><div class="ps-title">Weather & Status</div><div class="ps-grid">
                    <div class="item"><span class="label">Weather AM</span><span class="value">${r.weatherAM || '—'}</span></div>
                    <div class="item"><span class="label">Weather PM</span><span class="value">${r.weatherPM || '—'}</span></div>
                    <div class="item"><span class="label">Status</span><span class="value">${r.status}</span></div>
                </div></div>
                <div class="print-section"><div class="ps-title">Manpower <span style="font-weight:400;font-size:10px;color:var(--ink-soft);">(Total: ${totalManpower})</span></div>
                    ${r.manpower && r.manpower.length ? `<table class="ps-table"><thead><tr><th>Trade / Role</th><th>Number Present</th></tr></thead><tbody>${r.manpower.map(m => `<tr><td>${m.role}</td><td>${m.count}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No manpower recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Equipment on Site</div>
                    ${r.equipment && r.equipment.length ? `<table class="ps-table"><thead><tr><th>Equipment</th><th>Qty</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${r.equipment.map(e => `<tr><td>${e.name}</td><td>${e.qty}</td><td>${e.status || '—'}</td><td>${e.remarks || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No equipment recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Work Accomplished</div>
                    ${r.workAccomplished && r.workAccomplished.length ? `<table class="ps-table"><thead><tr><th>Location/Area</th><th>Scope of Work</th><th>Description</th><th>% Complete</th></tr></thead><tbody>${r.workAccomplished.map(w => `<tr><td>${w.location || '—'}</td><td>${w.scope || '—'}</td><td>${w.description || '—'}</td><td>${w.percentComplete || 0}%</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No work accomplished recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Materials Delivered</div>
                    ${r.materialsDelivered && r.materialsDelivered.length ? `<table class="ps-table"><thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Supplier / DR No.</th></tr></thead><tbody>${r.materialsDelivered.map(m => `<tr><td>${m.material}</td><td>${m.qty}</td><td>${m.unit || '—'}</td><td>${m.supplier || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No materials delivered recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Issues / Delays</div>
                    ${r.issues && r.issues.length ? `<table class="ps-table"><thead><tr><th>Description</th><th>Cause</th><th>Time Lost (hrs)</th></tr></thead><tbody>${r.issues.map(iss => `<tr><td>${iss.description || '—'}</td><td>${iss.cause || '—'}</td><td>${iss.timeLost || 0}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No issues recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Visitors</div>
                    ${r.visitors && r.visitors.length ? `<table class="ps-table"><thead><tr><th>Name</th><th>Company / Role</th><th>Purpose</th><th>Time In</th><th>Time Out</th><th>Remarks</th></tr></thead><tbody>${r.visitors.map(v => `<tr><td>${v.name}</td><td>${v.company || '—'} ${v.role ? '· ' + v.role : ''}</td><td>${v.purpose || '—'}</td><td>${v.timeIn || '—'}</td><td>${v.timeOut || '—'}</td><td>${v.remarks || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No visitors recorded.</p>`}
                </div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="PrintModal.close()">Close</button>
                </div>`;
        return html;
    }
};

// ─── MATERIAL PRINT MODAL ──────────────────────────────────────

const MatPrintModal = {
    open(material) {
        const modal = document.getElementById('matPrintModal');
        const body = document.getElementById('matPrintBody');
        body.innerHTML = this.renderPrintView(material);
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    },
    close() {
        document.getElementById('matPrintModal').classList.remove('open');
        document.body.style.overflow = '';
    },
    renderPrintView(m) {
        const imgHtml = m.image ? `<img src="${m.image}" alt="${m.brand}" />` :
            `<div class="no-img-placeholder">${Icon.package({size:28})}<br>No Image</div>`;
        return `
                <div class="detail-print-header">
                    <div class="dph-left">
                        <h2>${m.brand || 'Material'} — ${m.specs || ''}</h2>
                        <div class="dph-id">${m.id} · ${m.category || ''} ${m.subcategory ? '→ ' + m.subcategory : ''}</div>
                    </div>
                    <div class="dph-right">${imgHtml}</div>
                </div>
                <div class="print-section"><div class="ps-title">General Information</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Material ID</span><span class="dg-value">${m.id}</span></div>
                        <div class="dg-item"><span class="dg-label">Category</span><span class="dg-value">${m.category || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Subcategory</span><span class="dg-value">${m.subcategory || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Unit of Measurement</span><span class="dg-value">${m.unit || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Material Identification</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Brand</span><span class="dg-value">${m.brand || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Model / Serial No.</span><span class="dg-value">${m.model || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Technical Specifications</div>
                    <div class="detail-grid">
                        <div class="dg-item full"><span class="dg-label">Specifications</span><span class="dg-value">${m.specs || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Grade</span><span class="dg-value">${m.grade || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Size / Dimension</span><span class="dg-value">${m.size || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Length</span><span class="dg-value">${m.length || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Thickness</span><span class="dg-value">${m.thickness || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Weight</span><span class="dg-value">${m.weight || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Standard Codes</div>
                    <div class="detail-grid">
                        <div class="dg-item full"><span class="dg-label">Standard / Code Reference</span><span class="dg-value">${m.standardCode || '—'}</span></div>
                    </div>
                </div>
                ${m.pdfUrl ? `<div class="print-section"><div class="ps-title">Documents</div><p style="font-size:12px;display:flex;align-items:center;gap:5px;">${Icon.fileText({size:14})} ${m.pdfUrl}</p></div>` : ''}
                <div class="print-section"><div class="ps-title">Additional Information</div>
                    <div class="detail-grid">
                        <div class="dg-item full"><span class="dg-label">Typical Use / Application</span><span class="dg-value">${m.application || '—'}</span></div>
                        <div class="dg-item full"><span class="dg-label">Notes / Remarks</span><span class="dg-value">${m.notes || '—'}</span></div>
                    </div>
                </div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="MatPrintModal.close()">Close</button>
                </div>`;
    }
};

// ─── EQUIPMENT PRINT MODAL ─────────────────────────────────────

const EquipPrintModal = {
    open(equip) {
        const modal = document.getElementById('equipPrintModal');
        const body = document.getElementById('equipPrintBody');
        body.innerHTML = this.renderPrintView(equip);
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    },
    close() {
        document.getElementById('equipPrintModal').classList.remove('open');
        document.body.style.overflow = '';
    },
    renderPrintView(e) {
        const imgHtml = e.image ? `<img src="${e.image}" alt="${e.brand}" />` :
            `<div class="no-img-placeholder">${Icon.wrench({size:28})}<br>No Image</div>`;
        return `
                <div class="detail-print-header">
                    <div class="dph-left">
                        <h2>${e.brand || 'Equipment'} ${e.model ? '— ' + e.model : ''}</h2>
                        <div class="dph-id">${e.id} · ${e.category || ''} ${e.type ? '→ ' + e.type : ''}</div>
                    </div>
                    <div class="dph-right">${imgHtml}</div>
                </div>
                <div class="print-section"><div class="ps-title">General Information</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Equipment ID</span><span class="dg-value">${e.id}</span></div>
                        <div class="dg-item"><span class="dg-label">Category / Type</span><span class="dg-value">${e.category || '—'}${e.type ? ' (' + e.type + ')' : ''}</span></div>
                        <div class="dg-item"><span class="dg-label">Capacity / Rating</span><span class="dg-value">${e.capacity || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Unit</span><span class="dg-value">${e.unit || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Equipment Identification</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Brand</span><span class="dg-value">${e.brand || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Model</span><span class="dg-value">${e.model || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Serial Number</span><span class="dg-value">${e.serial || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Technical Specifications</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Power Source</span><span class="dg-value">${e.powerSource || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Ownership Type</span><span class="dg-value">${e.ownership || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Acquisition Date</span><span class="dg-value">${e.acquisitionDate || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Condition</span><span class="dg-value">${e.condition || '—'}</span></div>
                    </div>
                </div>
                ${e.manual ? `<div class="print-section"><div class="ps-title">Documents</div><p style="font-size:12px;display:flex;align-items:center;gap:5px;">${Icon.fileText({size:14})} ${e.manual}</p></div>` : ''}
                <div class="print-section"><div class="ps-title">Additional Information</div>
                    <div class="detail-grid">
                        <div class="dg-item full"><span class="dg-label">Notes / Remarks</span><span class="dg-value">${e.notes || '—'}</span></div>
                    </div>
                </div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="EquipPrintModal.close()">Close</button>
                </div>`;
    }
};

// ─── SOW BREAKDOWN MODAL ───────────────────────────────────────

const SOWBreakdownModal = {
    open(sowId, estimatesData) {
        const modal = document.getElementById('sowBreakdownModal');
        const body = document.getElementById('sowBreakdownBody');
        body.innerHTML = this.renderBreakdown(sowId, estimatesData);
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    },
    close() {
        document.getElementById('sowBreakdownModal').classList.remove('open');
        document.body.style.overflow = '';
    },
    renderBreakdown(sowId, data) {
        let materials = [],
            equipment = [],
            labor = [],
            indirect = [];
        if (data.groups) {
            const group = data.groups.find(g => g.sowId === sowId);
            if (group) {
                materials = group.materials || [];
                equipment = group.equipment || [];
                labor = group.labor || [];
                indirect = group.indirect || [];
            }
        } else {
            materials = (data.materials || []).filter(m => m.sow === sowId);
            equipment = (data.equipment || []).filter(e => e.sow === sowId);
            labor = (data.labor || []).filter(l => l.sow === sowId);
            indirect = (data.indirect || []).filter(i => i.sow === sowId);
        }

        const matTotal = materials.reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
        const eqTotal = equipment.reduce((s, e) => s + (parseFloat(e.cost) || 0), 0);
        const laborTotal = labor.reduce((s, l) => s + (parseFloat(l.cost) || 0), 0);
        const indirectTotal = indirect.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        const grandTotal = matTotal + eqTotal + laborTotal + indirectTotal;

        let html = `
                <div class="print-header">
                    <h2>${sowId} — Breakdown</h2>
                    <div class="print-mono" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--ink-soft);">Total Estimate: ₱${grandTotal.toFixed(2)}</div>
                </div>

                <div class="bm-summary">
                    <div class="bm-card"><div class="bm-label">Materials</div><div class="bm-value">₱${matTotal.toFixed(2)}</div></div>
                    <div class="bm-card"><div class="bm-label">Equipment</div><div class="bm-value">₱${eqTotal.toFixed(2)}</div></div>
                    <div class="bm-card"><div class="bm-label">Manpower</div><div class="bm-value">₱${laborTotal.toFixed(2)}</div></div>
                    <div class="bm-card"><div class="bm-label">Indirect Costs</div><div class="bm-value">₱${indirectTotal.toFixed(2)}</div></div>
                </div>

                <div class="print-section"><div class="ps-title">BOM (Materials)</div>
                    ${materials.length ? `<table class="ps-table"><thead><tr><th>Material</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>${materials.map(m => `<tr><td>${m.materialName || m.material}</td><td>${m.desc || '—'}</td><td style="text-align:right">${m.qty}</td><td style="text-align:right">₱${parseFloat(m.rate || 0).toFixed(2)}</td><td style="text-align:right">₱${parseFloat(m.cost || 0).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No materials assigned.</p>`}
                </div>

                <div class="print-section"><div class="ps-title">Equipment Needed</div>
                    ${equipment.length ? `<table class="ps-table"><thead><tr><th>Equipment</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Duration</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>${equipment.map(e => `<tr><td>${e.equipName || e.equipment}</td><td>${e.desc || '—'}</td><td style="text-align:right">${e.qty}</td><td style="text-align:right">${e.duration}</td><td style="text-align:right">₱${parseFloat(e.rate || 0).toFixed(2)}</td><td style="text-align:right">₱${parseFloat(e.cost || 0).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No equipment assigned.</p>`}
                </div>

                <div class="print-section"><div class="ps-title">Manpower</div>
                    ${labor.length ? `<table class="ps-table"><thead><tr><th>Role</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Duration</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>${labor.map(l => `<tr><td>${l.role}</td><td>${l.desc || '—'}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">${l.duration}</td><td style="text-align:right">₱${parseFloat(l.rate || 0).toFixed(2)}</td><td style="text-align:right">₱${parseFloat(l.cost || 0).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No manpower assigned.</p>`}
                </div>

                <div class="print-section"><div class="ps-title">Indirect Costs</div>
                    ${indirect.length ? `<table class="ps-table"><thead><tr><th>Description</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead><tbody>${indirect.map(i => `<tr><td>${i.desc || '—'}</td><td>${i.type || '—'}</td><td style="text-align:right">₱${parseFloat(i.amount || 0).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No indirect costs assigned.</p>`}
                </div>

                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="SOWBreakdownModal.close()">Close</button>
                </div>`;
        return html;
    }
};
