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
    /** _sowLabel (v9 — item 3) - "1.a — Excavation" style label from
     *  meta.sowNames (id → description map supplied by ProjectPage). */
    _sowLabel(scope, meta) {
        if (!scope) return '—';
        const name = meta && meta.sowNames ? meta.sowNames[scope] : '';
        return name ? scope + ' — ' + name : scope;
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
                    ${r.manpower && r.manpower.length ? (r.manpower.some(m => m.name || m.amIn || m.pmIn || m.otIn) ? `<table class="ps-table"><thead><tr><th>Name</th><th>Trade / Role</th><th>#</th><th>AM In</th><th>AM Out</th><th>PM In</th><th>PM Out</th><th>OT In</th><th>OT Out</th><th>Signature</th></tr></thead><tbody>${r.manpower.map(m => `<tr><td>${m.name || '—'}</td><td>${m.role || '—'}</td><td>${m.count || 1}</td><td>${m.amIn || '—'}</td><td>${m.amOut || '—'}</td><td>${m.pmIn || '—'}</td><td>${m.pmOut || '—'}</td><td>${m.otIn || '—'}</td><td>${m.otOut || '—'}</td><td style="text-align:center;">${m.signature ? `<img class="mp-sig" src="${driveImgSrc(m.signature)}" alt="" onerror="this.style.display='none'" />` : ''}</td></tr>`).join('')}</tbody></table>` : `<table class="ps-table"><thead><tr><th>Trade / Role</th><th>Number Present</th><th>Signature</th></tr></thead><tbody>${r.manpower.map(m => `<tr><td>${m.role}</td><td>${m.count}</td><td style="text-align:center;">${m.signature ? `<img class="mp-sig" src="${driveImgSrc(m.signature)}" alt="" onerror="this.style.display='none'" />` : ''}</td></tr>`).join('')}</tbody></table>`) : `<p style="font-size:12px;color:var(--ink-soft);">No manpower recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Equipment on Site</div>
                    ${r.equipment && r.equipment.length ? `<table class="ps-table"><thead><tr><th>Equipment</th><th>Qty</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${r.equipment.map(e => `<tr><td>${e.name}</td><td>${e.qty}</td><td>${e.status || '—'}</td><td>${e.remarks || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No equipment recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Work Accomplished</div>
                    ${r.workAccomplished && r.workAccomplished.length ? `<table class="ps-table"><thead><tr><th>Location/Area</th><th>Scope of Work</th><th>Description</th><th>% Complete</th></tr></thead><tbody>${r.workAccomplished.map(w => `<tr><td>${w.location || '—'}</td><td>${PrintModal._sowLabel(w.scope, meta)}</td><td>${w.description || '—'}</td><td>${w.percentComplete || 0}%</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No work accomplished recorded.</p>`}
                    ${PrintModal._photoGrid((r.workAccomplished || []).filter(w => w.image).map(w => ({
                        url: w.image,
                        caption: 'Work: ' + [PrintModal._sowLabel(w.scope, meta), w.description || w.location].filter(Boolean).join(' — ')
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
                    <button class="btn-primary" onclick="PrintDoc.print()">${Icon.printer({size:14})} Print</button>
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
    _e(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /**
     * renderPrintView (v11 BATCH H3) - The material datasheet.
     *
     * ── WHAT WAS WRONG ──
     * The heading read "Brand — Specifications". A brand is not an
     * identifier and a specification string is not a name, so two
     * different cements from the same supplier produced the same
     * heading, and a material with no brand produced "Material — ".
     *
     * Worse: the two fields the request form marks REQUIRED — Material
     * Name and Material Description — appeared NOWHERE in the datasheet.
     * The record you were shown was missing the only two things you had
     * to type to create it.
     *
     * The heading is now the ID and the description, and every field on
     * the request form has a place here, in the order the form asks for
     * them. Blank fields print as an em-dash rather than being dropped:
     * on a SPEC SHEET "not specified" is information, unlike a request
     * modal where an empty row is only noise.
     */
    renderPrintView(m) {
        const e = this._e.bind(this);
        const imgHtml = m.image
            ? `<img src="${driveImgSrc(m.image)}" alt="${e(m.name || m.id)}"
                    onerror="this.style.display='none'" />`
            : `<div class="no-img-placeholder">${Icon.package({size:28})}<br>No Image</div>`;
        const V = (label, val, full) =>
            `<div class="dg-item${full ? ' full' : ''}"><span class="dg-label">${label}</span><span class="dg-value">${e(val) || '—'}</span></div>`;

        return `
                <div class="detail-print-header">
                    <div class="dph-left">
                        <h2>${e(m.id)} — ${e(m.desc || m.description || m.name) || 'Material'}</h2>
                        <div class="dph-id">${e(m.name) || ''}${m.category ? ' · ' + e(m.category) : ''}${m.subcategory ? ' → ' + e(m.subcategory) : ''}</div>
                    </div>
                    <div class="dph-right">${imgHtml}</div>
                </div>

                <div class="print-section"><div class="ps-title">General Information</div>
                    <div class="detail-grid">
                        ${V('Material ID', m.id)}
                        ${V('Material Name', m.name)}
                        ${V('Description', m.desc || m.description, true)}
                        ${V('Category', m.category)}
                        ${V('Subcategory', m.subcategory)}
                        ${V('Unit of Measurement', m.unit)}
                    </div>
                </div>

                <div class="print-section"><div class="ps-title">Identification and Sourcing</div>
                    <div class="detail-grid">
                        ${V('Brand', m.brand)}
                        ${V('Model / Serial No.', m.model)}
                        ${V('Supplier', m.supplier)}
                        ${V('Reference Rate', m.rate ? '₱' + fmtMoney(parseFloat(m.rate) || 0) + (m.unit ? ' / ' + e(m.unit) : '') : '')}
                    </div>
                </div>

                <div class="print-section"><div class="ps-title">Technical Specifications</div>
                    <div class="detail-grid">
                        ${V('Specifications', m.specs, true)}
                        ${V('Grade', m.grade)}
                        ${V('Size / Dimension', m.size)}
                        ${V('Length', m.length)}
                        ${V('Thickness', m.thickness)}
                        ${V('Weight', m.weight)}
                        ${V('Standard / Code Reference', m.standardCode, true)}
                    </div>
                </div>

                <div class="print-section"><div class="ps-title">Additional Information</div>
                    <div class="detail-grid">
                        ${V('Typical Use / Application', m.application, true)}
                        ${V('Notes / Remarks', m.notes, true)}
                        ${V('Status', m.status)}
                        ${V('Requested By', m.requestedBy)}
                    </div>
                </div>

                ${AttachmentGallery.render(m.docsJSON || m.pdfUrl, 'Specification documents')}

                <div class="print-actions">
                    <button class="btn-primary" onclick="PrintDoc.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="MatPrintModal.close()">Close</button>
                </div>`;
    }
};

// ─── EQUIPMENT PRINT MODAL ─────────────────────────────────────

/* v10: material datasheets can carry a PDF spec sheet plus the photo —
   both now render through the shared gallery. */
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
    _e(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /**
     * renderPrintView (v11 BATCH H3) - The equipment datasheet.
     *
     * Same fault as the material one: the heading was "Brand — Model",
     * which is not an identifier — two identical excavators produced
     * identical headings and there was no way to tell which record you
     * had open. It leads with the equipment ID now.
     *
     * Every field the request form collects is present, in the order it
     * is asked for. Blanks print as an em-dash: on a spec sheet, "not
     * specified" is information.
     */
    renderPrintView(q) {
        const e = this._e.bind(this);
        const imgHtml = q.image
            ? `<img src="${driveImgSrc(q.image)}" alt="${e(q.name || q.id)}"
                    onerror="this.style.display='none'" />`
            : `<div class="no-img-placeholder">${Icon.wrench({size:28})}<br>No Image</div>`;
        const V = (label, val, full) =>
            `<div class="dg-item${full ? ' full' : ''}"><span class="dg-label">${label}</span><span class="dg-value">${e(val) || '—'}</span></div>`;
        const headline = q.desc || q.name ||
            [q.brand, q.model].filter(Boolean).join(' ') || q.category || 'Equipment';

        return `
                <div class="detail-print-header">
                    <div class="dph-left">
                        <h2>${e(q.id)} — ${e(headline)}</h2>
                        <div class="dph-id">${e(q.category) || ''}${q.ownership ? ' · ' + e(q.ownership) : ''}</div>
                    </div>
                    <div class="dph-right">${imgHtml}</div>
                </div>

                <div class="print-section"><div class="ps-title">General Information</div>
                    <div class="detail-grid">
                        ${V('Equipment ID', q.id)}
                        ${V('Name', q.name)}
                        ${V('Description', q.desc || q.description, true)}
                        ${V('Category / Type', q.category || q.type)}
                        ${V('Unit of Measurement', q.unit)}
                    </div>
                </div>

                <div class="print-section"><div class="ps-title">Identification and Sourcing</div>
                    <div class="detail-grid">
                        ${V('Brand', q.brand)}
                        ${V('Model', q.model)}
                        ${V('Serial No.', q.serial)}
                        ${V('Supplier', q.supplier)}
                        ${V('Reference Rate', q.rate ? '₱' + fmtMoney(parseFloat(q.rate) || 0) + (q.unit ? ' / ' + e(q.unit) : '') : '')}
                    </div>
                </div>

                <div class="print-section"><div class="ps-title">Specifications and Condition</div>
                    <div class="detail-grid">
                        ${V('Capacity', q.capacity)}
                        ${V('Power Source', q.powerSource)}
                        ${V('Ownership', q.ownership)}
                        ${V('Acquisition Date', q.acquisitionDate)}
                        ${V('Condition', q.condition)}
                    </div>
                </div>

                <div class="print-section"><div class="ps-title">Additional Information</div>
                    <div class="detail-grid">
                        ${V('Operating Manual', q.manual, true)}
                        ${V('Notes / Remarks', q.notes, true)}
                        ${V('Status', q.status)}
                        ${V('Requested By', q.requestedBy)}
                    </div>
                </div>

                ${AttachmentGallery.render(q.docsJSON, 'Supporting documents')}

                <div class="print-actions">
                    <button class="btn-primary" onclick="PrintDoc.print()">${Icon.printer({size:14})} Print</button>
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
                    <button class="btn-primary" onclick="PrintDoc.print()">${Icon.printer({size:14})} Print</button>
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

// ─── ATTACHMENT GALLERY (v10) ──────────────────────────────────
/**
 * AttachmentGallery — the single component every modal uses to show
 * files that were attached to a record.
 *
 * WHY IT EXISTS: request modals previously listed attachments as plain
 * text links, so an approver could not see a receipt without opening a
 * new tab — and in practice approved without looking. (The links were
 * often missing entirely, because the row carries `attachmentsJSON` as
 * a string while the modal looked for a parsed `attachments` array.)
 *
 * Usage:  AttachmentGallery.render(list, 'Attachments')
 *   list: [{ url, name }] — or a JSON string, or a single URL string.
 * Images render as thumbnails that open in a lightbox; anything else
 * (PDF, DWG) becomes a labelled card that opens in a new tab. A URL
 * that fails to load collapses to a caption instead of a broken box.
 */
const AttachmentGallery = {
    _items: [],

    /** normalize — accepts an array, a JSON string, or a bare URL. */
    normalize(input) {
        let list = [];
        if (!input) return list;
        if (typeof input === 'string') {
            const t = input.trim();
            if (t.startsWith('[')) { try { list = JSON.parse(t) || []; } catch (e) { list = []; } }
            else if (t) list = [{ url: t, name: '' }];
        } else if (Array.isArray(input)) {
            list = input.slice();
        }
        return list
            .map(a => (typeof a === 'string' ? { url: a, name: '' } : a))
            .filter(a => a && a.url);
    },

    _isImage(a) {
        const u = String(a.url || '').toLowerCase();
        if (/\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/.test(u)) return true;
        if (/\.(pdf|dwg|dxf|docx?|xlsx?|zip)(\?|$)/.test(u)) return false;
        // Drive thumbnail/uc links are images; viewer links are unknown but
        // render fine through driveImgSrc, so treat them as images.
        return u.indexOf('drive.google.com') > -1 || u.indexOf('googleusercontent') > -1;
    },

    /**
     * render(input, label) — returns HTML. Empty input returns '' so
     * callers can drop it in unconditionally.
     */
    render(input, label) {
        const list = this.normalize(input);
        if (!list.length) return '';
        this._items = list;
        const cells = list.map((a, i) => {
            const nm = String(a.name || '').replace(/"/g, '&quot;') || ('File ' + (i + 1));
            if (this._isImage(a)) {
                return `
                <button type="button" class="att-card" onclick="AttachmentGallery.open(${i})" title="${nm}">
                    <img src="${driveImgSrc(a.url)}" alt="${nm}" loading="lazy"
                        onerror="this.style.display='none';this.parentElement.querySelector('.att-fallback').style.display='flex';" />
                    <span class="att-fallback">${Icon.warning({size:15})} Preview unavailable</span>
                    <span class="att-cap">${Icon.camera({size:11})} <span>${nm}</span></span>
                </button>`;
            }
            const ext = (String(a.url).match(/\.(\w{2,4})(\?|$)/) || [, 'FILE'])[1].toUpperCase();
            return `
                <a class="att-card att-doc" href="${a.url}" target="_blank" rel="noopener" title="${nm}">
                    <span class="att-ext">${Icon.fileText({size:20})}<b>${ext}</b></span>
                    <span class="att-cap">${Icon.fileText({size:11})} <span>${nm}</span></span>
                </a>`;
        }).join('');
        return `
            <div class="att-block">
                <div class="att-label">${label || 'Attachments'} <span class="att-count">${list.length}</span></div>
                <div class="att-grid">${cells}</div>
            </div>`;
    },

    open(i) {
        const a = this._items[i];
        if (!a) return;
        // v11 BATCH H2: the lightbox used to sit at z-index 1200 while the
        // request modal sits at 2000, so an attachment opened BEHIND the
        // modal that opened it and the modal had to be closed first. The
        // stacking is fixed in CSS; this comment is here because the two
        // numbers are far apart in the codebase and easy to break again.
        this._openedFrom = document.querySelector('.print-modal-overlay.open');
        let box = document.getElementById('attLightbox');
        if (!box) {
            box = document.createElement('div');
            box.id = 'attLightbox';
            box.className = 'att-lightbox';
            // ── v11 BATCH H2 FIX: the X did not close the lightbox ──
            // The close button contains an SVG icon, so a click lands on
            // the <svg> or its <path>, never on the button itself.
            // `e.target.dataset.close` was therefore always undefined and
            // only Escape or an outside click worked. closest() walks up
            // from whatever was actually clicked to the element carrying
            // the marker.
            box.addEventListener('click', e => {
                if (e.target === box || (e.target.closest && e.target.closest('[data-close]'))) {
                    AttachmentGallery.close();
                }
            });
            document.body.appendChild(box);
        }
        const nm = String(a.name || 'Attachment').replace(/</g, '&lt;');
        box.innerHTML = `
            <button type="button" class="att-lb-close" data-close="1" aria-label="Close">${Icon.close({size:20})}</button>
            <div class="att-lb-frame"><img src="${driveImgSrc(a.url)}" alt="${nm}" /></div>
            <div class="att-lb-cap">${nm} · <a href="${a.url}" target="_blank" rel="noopener">Open original</a></div>`;
        box.classList.add('open');
        this._esc = e => {
            if (e.key !== 'Escape') return;
            // Stop the modal underneath from also closing on the same key.
            e.stopPropagation();
            AttachmentGallery.close();
        };
        document.addEventListener('keydown', this._esc, true);
    },

    close() {
        const box = document.getElementById('attLightbox');
        if (box) box.classList.remove('open');
        if (this._esc) document.removeEventListener('keydown', this._esc, true);
    }
};
