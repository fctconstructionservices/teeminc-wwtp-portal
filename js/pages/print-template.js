// ================================================================
//  pages/print-template.js — Print template editor (v11 BATCH E)
//
//  PURPOSE: Lets a Super Admin set the company letterhead that every
//  printed document in the system carries — logo, name, address, TIN,
//  PCAB licence, accent colour, signature blocks, watermark.
//
//  WHY IT MATTERS. Before this, every print produced a bare browser
//  page. A cash advance form, a daily record or an SWA billing handed
//  to a client had nothing on it identifying FCTC. The company details
//  were not merely unprinted — they existed nowhere in the codebase.
//
//  THE PREVIEW IS THE REAL RENDERER. The panel on the right calls
//  PrintDoc.letterheadHTML() and PrintDoc.signatureHTML() with the
//  values currently in the form, so what you see is produced by exactly
//  the code that will print. A separate mock preview would drift from
//  the real output the first time either side changed, and you would
//  only find out from a client.
//
//  Super Admin only, enforced in App.navigate() and again on the server
//  in savePrintTemplate().
// ================================================================

const PrintTemplatePage = {

    _t: null,

    async load() {
        const container = document.getElementById('printTemplateContent');
        if (!container) return;
        UI.showLoading(container);
        try {
            this._t = Object.assign({}, PrintDoc.DEFAULTS, await DataService.getPrintTemplate());
            container.innerHTML = this._formHTML();
            this.preview();
        } catch (err) {
            UI.toast('Could not load the print template: ' + (err.message || err), 'error');
        }
    },

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    },

    _formHTML() {
        const t = this._t;
        const e = this._esc.bind(this);
        const sel = (v, x) => v === x ? 'selected' : '';
        const chk = v => v ? 'checked' : '';

        const signRows = (t.signatories && t.signatories.length
            ? t.signatories
            : [{ label: '', name: '', position: '' }]
        ).map((s, i) => this._signRowHTML(s, i)).join('');

        return `
        <div class="section-head"><h2>Print Template</h2><div class="rule"></div>
            <span class="badge">Applies to every printed document</span>
        </div>
        <p class="data-source-note" style="margin-bottom:14px;">
            This letterhead appears on every document the system prints — cash advances,
            liquidations, daily records, estimates, SWA billings and datasheets. Changes take
            effect on the next print, for everyone.
        </p>

        <div class="pt-layout">
            <div class="pt-form">

                <div class="panel" style="padding:16px;margin-bottom:14px;">
                    <div class="ps-title" style="margin-bottom:10px;">Company identity</div>
                    <div class="field"><label>Company name *</label>
                        <input type="text" id="pt-companyName" value="${e(t.companyName)}" /></div>
                    <div class="field"><label>Tagline</label>
                        <input type="text" id="pt-tagline" value="${e(t.tagline)}" placeholder="e.g. Civil Works &amp; General Engineering" /></div>
                    <div class="field"><label>Address line 1</label>
                        <input type="text" id="pt-addressLine1" value="${e(t.addressLine1)}" /></div>
                    <div class="field"><label>Address line 2</label>
                        <input type="text" id="pt-addressLine2" value="${e(t.addressLine2)}" /></div>
                    <div class="db-form-grid">
                        <div class="field"><label>Phone</label>
                            <input type="text" id="pt-phone" value="${e(t.phone)}" /></div>
                        <div class="field"><label>Email</label>
                            <input type="text" id="pt-email" value="${e(t.email)}" /></div>
                        <div class="field"><label>Website</label>
                            <input type="text" id="pt-website" value="${e(t.website)}" /></div>
                        <div class="field"><label>TIN</label>
                            <input type="text" id="pt-tin" value="${e(t.tin)}" /></div>
                        <div class="field"><label>PCAB licence no.</label>
                            <input type="text" id="pt-pcabLicense" value="${e(t.pcabLicense)}" /></div>
                    </div>
                </div>

                <div class="panel" style="padding:16px;margin-bottom:14px;">
                    <div class="ps-title" style="margin-bottom:10px;">Logo and layout</div>
                    <div class="field">
                        <label>Logo</label>
                        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                            <div class="pt-logo-box" id="pt-logo-box">
                                ${t.logoUrl ? `<img src="${e(t.logoUrl)}" alt="Current logo" />` : '<span>No logo</span>'}
                            </div>
                            <div>
                                <input type="file" accept="image/*" id="pt-logo-file" style="max-width:210px;" />
                                <p style="font-size:11px;color:var(--ink-soft);margin-top:4px;">
                                    PNG with a transparent background prints best. A wide logo works
                                    better than a tall one — the header only gives it so much height.
                                </p>
                                ${t.logoUrl ? `<button class="btn-sm danger" style="margin-top:4px;" onclick="PrintTemplatePage.removeLogo()">Remove logo</button>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="db-form-grid">
                        <div class="field"><label>Header layout</label>
                            <select id="pt-headerLayout" onchange="PrintTemplatePage.preview()">
                                <option value="logo-left" ${sel(t.headerLayout, 'logo-left')}>Logo left — logo beside the details</option>
                                <option value="logo-center" ${sel(t.headerLayout, 'logo-center')}>Logo centred — formal issues</option>
                                <option value="minimal" ${sel(t.headerLayout, 'minimal')}>Minimal — name and title only</option>
                            </select>
                        </div>
                        <div class="field"><label>Logo height (px)</label>
                            <input type="number" min="20" max="120" id="pt-logoHeight" value="${parseInt(t.logoHeight, 10) || 54}" oninput="PrintTemplatePage.preview()" /></div>
                        <div class="field"><label>Accent colour</label>
                            <div style="display:flex;gap:6px;align-items:center;">
                                <input type="color" id="pt-accentColor" value="${e(t.accentColor)}" oninput="PrintTemplatePage.preview()" style="width:44px;padding:2px;height:32px;" />
                                <input type="text" id="pt-accentHex" value="${e(t.accentColor)}" style="flex:1;font-family:'IBM Plex Mono',monospace;" oninput="PrintTemplatePage.syncHex()" />
                            </div>
                        </div>
                        <div class="field"><label>Paper size</label>
                            <select id="pt-paperSize" onchange="PrintTemplatePage.preview()">
                                <option value="A4" ${sel(t.paperSize, 'A4')}>A4</option>
                                <option value="Letter" ${sel(t.paperSize, 'Letter')}>Letter</option>
                            </select>
                        </div>
                        <div class="field"><label>Page margin (mm)</label>
                            <input type="number" min="5" max="30" id="pt-marginMm" value="${parseInt(t.marginMm, 10) || 12}" oninput="PrintTemplatePage.preview()" /></div>
                    </div>
                    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:6px;">
                        <label style="display:flex;gap:6px;align-items:center;font-size:12px;">
                            <input type="checkbox" id="pt-showLogo" ${chk(t.showLogo)} onchange="PrintTemplatePage.preview()" style="width:auto;" /> Show logo</label>
                        <label style="display:flex;gap:6px;align-items:center;font-size:12px;">
                            <input type="checkbox" id="pt-showDivider" ${chk(t.showDivider)} onchange="PrintTemplatePage.preview()" style="width:auto;" /> Rule under the header</label>
                    </div>
                </div>

                <div class="panel" style="padding:16px;margin-bottom:14px;">
                    <div class="ps-title" style="margin-bottom:10px;">Signature blocks</div>
                    <p style="font-size:11.5px;color:var(--ink-soft);margin:0 0 8px;">
                        Printed at the foot of each document. Leave the name blank to print an
                        empty line to sign on. Remove all rows if you would rather each document
                        keep its own signature row — the SWA billing already has one.
                    </p>
                    <div id="pt-signs">${signRows}</div>
                    <button class="btn-sm" onclick="PrintTemplatePage.addSign()">+ Add block</button>
                </div>

                <div class="panel" style="padding:16px;margin-bottom:14px;">
                    <div class="ps-title" style="margin-bottom:10px;">Footer and watermark</div>
                    <div class="field"><label>Footer text</label>
                        <input type="text" id="pt-footerText" value="${e(t.footerText)}" placeholder="e.g. This document is system-generated." oninput="PrintTemplatePage.preview()" /></div>
                    <div style="display:flex;gap:18px;flex-wrap:wrap;margin:4px 0 10px;">
                        <label style="display:flex;gap:6px;align-items:center;font-size:12px;">
                            <input type="checkbox" id="pt-showPreparedBy" ${chk(t.showPreparedBy)} onchange="PrintTemplatePage.preview()" style="width:auto;" /> Show who printed it</label>
                        <label style="display:flex;gap:6px;align-items:center;font-size:12px;">
                            <input type="checkbox" id="pt-showTimestamp" ${chk(t.showTimestamp)} onchange="PrintTemplatePage.preview()" style="width:auto;" /> Show print date and time</label>
                    </div>
                    <div class="field"><label>Watermark</label>
                        <input type="text" id="pt-watermark" value="${e(t.watermark)}" placeholder="e.g. DRAFT — leave blank for none" oninput="PrintTemplatePage.preview()" />
                        <p style="font-size:11px;color:var(--ink-soft);margin-top:4px;">
                            Prints diagonally across every document. Clear it before issuing anything to a client.
                        </p>
                    </div>
                </div>

                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;">
                    <button class="btn-primary" id="pt-save" onclick="PrintTemplatePage.save()">Save template</button>
                    <button class="btn-sm" onclick="PrintTemplatePage.testPrint()">${Icon.printer({size:12})} Test print</button>
                    <button class="btn-sm danger" style="margin-left:auto" onclick="PrintTemplatePage.reset()">Reset to defaults</button>
                </div>
            </div>

            <div class="pt-preview-col">
                <div class="ps-title" style="margin-bottom:8px;">Live preview</div>
                <!-- v28: the sheet is rendered at its REAL width and then
                     scaled down to fit. It used to be drawn at whatever
                     width the column happened to be, with overflow
                     hidden — so a long address wrapped at a different
                     point than it does on paper, and anything past the
                     bottom was simply clipped away. -->
                <div class="pt-paper-stage" id="pt-stage">
                    <div class="pt-paper" id="pt-preview"></div>
                </div>
                <p style="font-size:11px;color:var(--ink-soft);margin-top:8px;">
                    Shown at true page size, scaled to fit — text wraps here exactly where it
                    wraps on paper. Use <b>Test print</b> to check it on real paper.
                </p>
            </div>
        </div>`;
    },

    _signRowHTML(s, i) {
        const e = this._esc.bind(this);
        return `<div class="pt-sign-row" data-i="${i}">
            <input type="text" class="pt-sign-label" placeholder="Label, e.g. Prepared by" value="${e(s.label)}" oninput="PrintTemplatePage.preview()" />
            <input type="text" class="pt-sign-name" placeholder="Name (optional)" value="${e(s.name)}" oninput="PrintTemplatePage.preview()" />
            <input type="text" class="pt-sign-pos" placeholder="Position (optional)" value="${e(s.position)}" oninput="PrintTemplatePage.preview()" />
            <button class="btn-sm danger" title="Remove this block" onclick="this.closest('.pt-sign-row').remove();PrintTemplatePage.preview()">${Icon.close({size:11})}</button>
        </div>`;
    },

    addSign() {
        const wrap = document.getElementById('pt-signs');
        if (wrap.querySelectorAll('.pt-sign-row').length >= 4) {
            UI.toast('Four signature blocks is the most that fits across a page.', 'error');
            return;
        }
        wrap.insertAdjacentHTML('beforeend', this._signRowHTML({ label: '', name: '', position: '' }, wrap.children.length));
        this.preview();
    },

    syncHex() {
        const hex = document.getElementById('pt-accentHex').value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            document.getElementById('pt-accentColor').value = hex;
            this.preview();
        }
    },

    /** _collect - the form as a template object. */
    _collect() {
        const v = id => (document.getElementById(id)?.value || '').trim();
        const c = id => !!document.getElementById(id)?.checked;
        const signatories = Array.from(document.querySelectorAll('.pt-sign-row')).map(r => ({
            label: r.querySelector('.pt-sign-label').value.trim(),
            name: r.querySelector('.pt-sign-name').value.trim(),
            position: r.querySelector('.pt-sign-pos').value.trim()
        })).filter(s => s.label);

        return {
            companyName: v('pt-companyName'), tagline: v('pt-tagline'),
            addressLine1: v('pt-addressLine1'), addressLine2: v('pt-addressLine2'),
            phone: v('pt-phone'), email: v('pt-email'), website: v('pt-website'),
            tin: v('pt-tin'), pcabLicense: v('pt-pcabLicense'),
            logoUrl: this._t.logoUrl || '',
            logoHeight: parseInt(v('pt-logoHeight'), 10) || 54,
            accentColor: document.getElementById('pt-accentColor')?.value || '#24455A',
            headerLayout: v('pt-headerLayout') || 'logo-left',
            showLogo: c('pt-showLogo'), showDivider: c('pt-showDivider'),
            paperSize: v('pt-paperSize') || 'A4',
            marginMm: parseInt(v('pt-marginMm'), 10) || 12,
            footerText: v('pt-footerText'),
            showTimestamp: c('pt-showTimestamp'), showPreparedBy: c('pt-showPreparedBy'),
            signatories, watermark: v('pt-watermark')
        };
    },

    /**
     * preview - renders through PrintDoc itself. The module's cache is
     * temporarily pointed at the form's current values, so the preview
     * cannot drift from the real output — there is only one renderer.
     */
    /**
     * PAPER_MM - the printable widths the template offers.
     * A4 is 210mm across, US Letter 215.9mm (8.5in).
     */
    PAPER_MM: { A4: 210, Letter: 215.9 },

    /**
     * _fitPreview - scale the true-size sheet down to the column.
     *
     * The sheet is laid out at its real millimetre width so wrapping and
     * page depth match the printer. It is then scaled as a whole, which
     * is the only way a preview can be trusted: shrinking the container
     * instead re-wraps the text, and a preview that wraps differently
     * from the page is worse than none because it is believed.
     */
    _fitPreview() {
        const stage = document.getElementById('pt-stage');
        const paper = document.getElementById('pt-preview');
        if (!stage || !paper) return;

        const available = stage.clientWidth;
        const paperPx = paper.offsetWidth;
        if (!available || !paperPx) return;

        // Never scale UP — a small window shrinks the sheet, a wide one
        // leaves it at 100% rather than blowing it up past its real size.
        const scale = Math.min(1, available / paperPx);
        paper.style.transform = `scale(${scale})`;
        // The stage must claim the SCALED height; a transform does not
        // affect layout, so without this the note below it would sit
        // under the sheet.
        stage.style.height = (paper.offsetHeight * scale) + 'px';
    },

    preview() {
        const box = document.getElementById('pt-preview');
        if (!box) return;
        const draft = this._collect();
        const saved = PrintDoc._tpl;
        PrintDoc._tpl = draft;
        try {
            box.style.setProperty('--pd-accent', draft.accentColor);
            // True page geometry, so what wraps here wraps on paper.
            const mm = this.PAPER_MM[draft.paperSize] || this.PAPER_MM.A4;
            const margin = Math.max(0, parseFloat(draft.marginMm) || 0);
            box.style.width = mm + 'mm';
            box.style.padding = margin + 'mm';
            box.innerHTML =
                PrintDoc.watermarkHTML() +
                PrintDoc.letterheadHTML({
                    title: 'Cash Advance Request',
                    meta: 'CA-2026-0184 · 06 Aug 2026'
                }) +
                `<div class="pt-sample">
                    <div class="pt-sample-row"><span>Project</span><span>BF2/NF2 Lagoon Liner Project</span></div>
                    <div class="pt-sample-row"><span>Requestor</span><span>Darwin Fabon</span></div>
                    <div class="pt-sample-row"><span>Amount</span><span>PHP 148,500.00</span></div>
                    <div class="pt-sample-row"><span>Scope</span><span>B.2 — Excavation, Lagoon NF2</span></div>
                    <p class="pt-sample-body">Sample content, so you can judge the header and footer against a real page.</p>
                </div>` +
                PrintDoc.signatureHTML() +
                PrintDoc.footerHTML();
        } finally {
            PrintDoc._tpl = saved;
        }
        this._fitPreview();
        // One listener for the life of the page, not one per keystroke.
        if (!this._fitBound) {
            this._fitBound = () => this._fitPreview();
            window.addEventListener('resize', this._fitBound);
        }
    },

    async uploadLogo(file) {
        const b64 = await fileToBase64_(file);
        const up = await DataService.uploadImage(b64, file.name, file.type);
        if (!up || !up.url) throw new Error('The logo did not upload.');
        this._t.logoUrl = up.url;
        const box = document.getElementById('pt-logo-box');
        if (box) box.innerHTML = `<img src="${this._esc(up.url)}" alt="Current logo" />`;
        this.preview();
    },

    removeLogo() {
        this._t.logoUrl = '';
        const box = document.getElementById('pt-logo-box');
        if (box) box.innerHTML = '<span>No logo</span>';
        this.preview();
        UI.toast('Logo removed — save to apply.', 'success');
    },

    async save() {
        const btn = document.getElementById('pt-save');
        const original = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;
        try {
            const file = document.getElementById('pt-logo-file')?.files?.[0];
            if (file) { btn.textContent = 'Uploading logo...'; await this.uploadLogo(file); }

            const data = this._collect();
            if (!data.companyName) {
                UI.toast('Company name is required — it is the one thing every document must carry.', 'error');
                return;
            }
            const res = await DataService.savePrintTemplate(data);
            // The cache backs every print in the session, so it has to go
            // the moment the template changes, or the next print would
            // still carry the old letterhead.
            PrintDoc.clearCache();
            this._t = Object.assign({}, PrintDoc.DEFAULTS, (res && res.template) || data);
            UI.toast('Print template saved — it applies to every document from the next print.', 'success');
            this.preview();
            // The logo is the app's mark as well as the letterhead's, so
            // the page headers repaint now rather than after a reload.
            // (The nav bar's own copy refreshes on the next navigation —
            // re-rendering it here would need the current page id, which
            // Nav owns and does not expose.)
            if (typeof Nav !== 'undefined' && Nav.paintBranding) {
                PrintDoc.load(true)
                    .then(() => Nav.paintBranding())
                    .catch(() => {});
            }
        } catch (err) {
            UI.toast('' + err.message, 'error');
        } finally {
            btn.textContent = original;
            btn.disabled = false;
        }
    },

    async reset() {
        const ok = await Confirm.open('Reset the print template?',
            'Restores the default letterhead. Your logo, company details, signature blocks and colours are cleared, and every printed document changes with it.');
        if (!ok) return;
        try {
            const res = await DataService.resetPrintTemplate();
            PrintDoc.clearCache();
            this._t = Object.assign({}, PrintDoc.DEFAULTS, (res && res.template) || {});
            await this.load();
            UI.toast('Print template reset.', 'success');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /**
     * testPrint - prints the preview with the UNSAVED form values, so
     * you can check paper before committing a change that reaches every
     * document in the system.
     */
    testPrint() {
        const draft = this._collect();
        const saved = PrintDoc._tpl;
        PrintDoc._tpl = draft;
        const w = window.open('', '_blank');
        if (!w) {
            PrintDoc._tpl = saved;
            UI.toast('Allow pop-ups for this site to run a test print.', 'error');
            return;
        }
        w.document.write(PrintDoc.documentHTML({
            title: 'Print Template Test',
            meta: 'Sample document · ' + new Date().toLocaleDateString(),
            body: `<div style="margin:18px 0;font-size:12px;">
                <p><b>This is a test page.</b> Check the logo size, the accent colour, the margins
                and where the footer lands on real paper.</p>
                <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:11.5px;">
                    <thead><tr>
                        <th style="border-bottom:1px solid #D6D2C4;text-align:left;padding:5px;">Item</th>
                        <th style="border-bottom:1px solid #D6D2C4;text-align:left;padding:5px;">Description</th>
                        <th style="border-bottom:1px solid #D6D2C4;text-align:right;padding:5px;">Amount</th>
                    </tr></thead>
                    <tbody>
                        <tr><td style="padding:5px;">B.2</td><td style="padding:5px;">Excavation — Lagoon NF2</td><td style="padding:5px;text-align:right;">148,500.00</td></tr>
                        <tr><td style="padding:5px;">C.1</td><td style="padding:5px;">Geotextile underlayment</td><td style="padding:5px;text-align:right;">96,200.00</td></tr>
                    </tbody>
                </table>
            </div>`
        }));
        w.document.close();
        PrintDoc._tpl = saved;
        setTimeout(() => { try { w.focus(); } catch (e) {} }, 250);
    }
};
