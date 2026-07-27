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

/**
 * driveImgSrc (v5 PHOTO FIX) - Old records stored Drive VIEWER page URLs
 * (…/file/d/ID/view…), which always render broken inside <img>. This
 * rewrites any Drive link to the /thumbnail endpoint, which streams the
 * actual image. New uploads already store the thumbnail form.
 */
function driveImgSrc(url) {
    if (!url) return url;
    const m = String(url).match(/drive\.google\.com\/file\/d\/([\w-]+)/) ||
              String(url).match(/[?&]id=([\w-]+)/);
    if (m && String(url).indexOf('thumbnail') === -1) {
        return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200';
    }
    return url;
}

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
                    ${PrintModal._photoGrid((r.workAccomplished || []).filter(w => w.image).map(w => ({
                        url: w.image,
                        caption: 'Work: ' + [w.scope, w.description || w.location].filter(Boolean).join(' — ')
                    })))}
                </div>
                <div class="print-section"><div class="ps-title">Materials Delivered</div>
                    ${r.materialsDelivered && r.materialsDelivered.length ? `<table class="ps-table"><thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Supplier / DR No.</th></tr></thead><tbody>${r.materialsDelivered.map(m => `<tr><td>${m.material}</td><td>${m.qty}</td><td>${m.unit || '—'}</td><td>${m.supplier || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No materials delivered recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Materials Used</div>
                    ${r.materialsUsed && r.materialsUsed.length ? `<table class="ps-table"><thead><tr><th>Material</th><th>Qty Used</th><th>Unit</th><th>Used For (SOW)</th></tr></thead><tbody>${r.materialsUsed.map(m => `<tr><td>${m.material}</td><td>${m.qty}</td><td>${m.unit || '—'}</td><td>${m.sow || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No materials used recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Issues / Delays</div>
                    ${r.issues && r.issues.length ? `<table class="ps-table"><thead><tr><th>Description</th><th>Cause</th><th>Time Lost (hrs)</th></tr></thead><tbody>${r.issues.map(iss => `<tr><td>${iss.description || '—'}</td><td>${iss.cause || '—'}</td><td>${iss.timeLost || 0}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No issues recorded.</p>`}
                    ${PrintModal._photoGrid((r.issues || []).filter(i => i.image).map(i => ({
                        url: i.image,
                        caption: 'Issue: ' + (i.description || i.cause || '')
                    })))}
                </div>
                <div class="print-section"><div class="ps-title">Visitors</div>
                    ${r.visitors && r.visitors.length ? `<table class="ps-table"><thead><tr><th>Name</th><th>Company / Role</th><th>Purpose</th><th>Time In</th><th>Time Out</th><th>Remarks</th></tr></thead><tbody>${r.visitors.map(v => `<tr><td>${v.name}</td><td>${v.company || '—'} ${v.role ? '· ' + v.role : ''}</td><td>${v.purpose || '—'}</td><td>${v.timeIn || '—'}</td><td>${v.timeOut || '—'}</td><td>${v.remarks || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No visitors recorded.</p>`}
                </div>
                ${(r.photos && r.photos.length) ? `
                <div class="print-section"><div class="ps-title">Site Photos <span style="font-weight:400;font-size:10px;color:var(--ink-soft);">(${r.photos.length})</span></div>
                    ${PrintModal._photoGrid(r.photos.map((p, i) => {
                        const isObj = p && typeof p === 'object';
                        return { url: isObj ? p.url : p, caption: (isObj && p.caption) ? p.caption : ('Site Photo ' + (i + 1)) };
                    }))}
                </div>` : ''}
                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="PrintModal.close()">Close</button>
                </div>`;
        return html;
    },

    /**
     * _photoGrid (v8) - Presentation-ready photo grid: the ACTUAL
     * pictures render (not just links), each with its caption so the
     * printout reads like a proper site report. Broken images collapse
     * to a note instead of a broken-icon box.
     */
    _photoGrid(items) {
        if (!items || !items.length) return '';
        return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin-top:10px;">
            ${items.map(it => `
                <figure style="margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg);break-inside:avoid;">
                    <img src="${driveImgSrc(it.url)}" alt="${(it.caption || '').replace(/"/g, '&quot;')}" loading="lazy"
                        style="width:100%;height:160px;object-fit:cover;display:block;"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
                    <div style="display:none;padding:18px 10px;text-align:center;font-size:11px;color:var(--ink-soft);">Image unavailable</div>
                    <figcaption style="padding:6px 9px;font-size:10.5px;line-height:1.4;color:var(--ink);border-top:1px solid var(--line);">${it.caption || '—'}</figcaption>
                </figure>`).join('')}
        </div>`;
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
                    <div class="print-mono" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--ink-soft);">Total Estimate: ₱${fmtMoney(grandTotal)}</div>
                </div>

                <div class="bm-summary">
                    <div class="bm-card"><div class="bm-label">Materials</div><div class="bm-value">₱${fmtMoney(matTotal)}</div></div>
                    <div class="bm-card"><div class="bm-label">Equipment</div><div class="bm-value">₱${fmtMoney(eqTotal)}</div></div>
                    <div class="bm-card"><div class="bm-label">Manpower</div><div class="bm-value">₱${fmtMoney(laborTotal)}</div></div>
                    <div class="bm-card"><div class="bm-label">Indirect Costs</div><div class="bm-value">₱${fmtMoney(indirectTotal)}</div></div>
                </div>

                <div class="print-section"><div class="ps-title">BOM (Materials)</div>
                    ${materials.length ? `<table class="ps-table"><thead><tr><th>Material</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>${materials.map(m => `<tr><td>${m.materialName || m.material}</td><td>${m.desc || '—'}</td><td style="text-align:right">${m.qty}</td><td style="text-align:right">₱${fmtMoney(parseFloat(m.rate || 0))}</td><td style="text-align:right">₱${fmtMoney(parseFloat(m.cost || 0))}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No materials assigned.</p>`}
                </div>

                <div class="print-section"><div class="ps-title">Equipment Needed</div>
                    ${equipment.length ? `<table class="ps-table"><thead><tr><th>Equipment</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Duration</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>${equipment.map(e => `<tr><td>${e.equipName || e.equipment}</td><td>${e.desc || '—'}</td><td style="text-align:right">${e.qty}</td><td style="text-align:right">${e.duration}</td><td style="text-align:right">₱${fmtMoney(parseFloat(e.rate || 0))}</td><td style="text-align:right">₱${fmtMoney(parseFloat(e.cost || 0))}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No equipment assigned.</p>`}
                </div>

                <div class="print-section"><div class="ps-title">Manpower</div>
                    ${labor.length ? `<table class="ps-table"><thead><tr><th>Role</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Duration</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>${labor.map(l => `<tr><td>${l.role}</td><td>${l.desc || '—'}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">${l.duration}</td><td style="text-align:right">₱${fmtMoney(parseFloat(l.rate || 0))}</td><td style="text-align:right">₱${fmtMoney(parseFloat(l.cost || 0))}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No manpower assigned.</p>`}
                </div>

                <div class="print-section"><div class="ps-title">Indirect Costs</div>
                    ${indirect.length ? `<table class="ps-table"><thead><tr><th>Description</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead><tbody>${indirect.map(i => `<tr><td>${i.desc || '—'}</td><td>${i.type || '—'}</td><td style="text-align:right">₱${fmtMoney(parseFloat(i.amount || 0))}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No indirect costs assigned.</p>`}
                </div>

                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="SOWBreakdownModal.close()">Close</button>
                </div>`;
        return html;
    }
};
// ─── SEARCH DETAIL MODAL (v8) ──────────────────────────────────
//  Generic detail view for a global-search result: renders the
//  key/value `detail` payload the backend attached to the result.
//  Materials/Equipment usually route to their own datasheet modals
//  instead (see SearchPage.open); this is the catch-all.

const SearchDetailModal = {
    open(result) {
        const existing = document.getElementById('searchDetailModal');
        if (existing) existing.remove();
        const detail = result.detail || {};
        const overlay = document.createElement('div');
        overlay.id = 'searchDetailModal';
        overlay.className = 'print-modal-overlay open';
        overlay.innerHTML = `
            <div class="print-modal-content" style="max-width:560px;">
                <button class="close-modal" onclick="document.getElementById('searchDetailModal').remove();document.body.style.overflow='';">${Icon.close({size:18})}</button>
                <div class="print-header">
                    <h2>${result.type} — ${result.id}</h2>
                    <div class="print-meta">${result.label || ''}</div>
                </div>
                ${result.image ? `<div style="text-align:center;margin-bottom:14px;"><img src="${driveImgSrc(result.image)}" alt="" style="max-width:100%;max-height:220px;border-radius:8px;border:1px solid var(--line);" onerror="this.style.display='none'" /></div>` : ''}
                <div class="print-section"><div class="ps-title">Details</div>
                    <div class="detail-grid">
                        ${Object.keys(detail).map(k => `
                            <div class="dg-item ${String(detail[k]).length > 40 ? 'full' : ''}">
                                <span class="dg-label">${k}</span>
                                <span class="dg-value">${detail[k]}</span>
                            </div>`).join('')}
                    </div>
                </div>
                <div class="print-actions">
                    <button class="btn-ghost" onclick="document.getElementById('searchDetailModal').remove();document.body.style.overflow='';">Close</button>
                </div>
            </div>`;
        overlay.addEventListener('click', e => {
            if (e.target === overlay) { overlay.remove(); document.body.style.overflow = ''; }
        });
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }
};
