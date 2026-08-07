// ================================================================
//  core/print-doc.js — Company letterhead for every printed document
//                      (v11 BATCH E)
//
//  THE PROBLEM. Every print in the system called window.print() on a
//  modal and produced a bare browser page. No logo, no company name, no
//  address, no TIN, no PCAB licence, no signature blocks. A client
//  receiving a cash advance form, a daily record or an SWA billing had
//  nothing on the page identifying FCTC. Worse, the header was not
//  merely missing — the company details existed NOWHERE in the codebase,
//  so there was nothing to print even if a header had been added.
//
//  THE APPROACH. Rather than rewrite each of the eight print sites to
//  build its own header, PrintDoc INJECTS a letterhead and footer into
//  whatever container is about to be printed, prints, then removes them.
//  A print site changes by exactly one call:
//
//      onclick="window.print()"   ->   onclick="PrintDoc.print()"
//
//  The document's own content is untouched. That keeps this batch small
//  and means a future template change reaches every document at once
//  instead of needing eight edits.
//
//  TWO OUTPUT PATHS, because the system prints in two different ways:
//    1. MODAL PRINTS — the content is already in the page inside a
//       .print-modal-overlay. print() injects into it.
//    2. NEW-WINDOW PRINTS — the estimate summary and DUPA build a whole
//       standalone document with window.open(). documentHTML() wraps
//       their body in the same letterhead and inlines the CSS, because a
//       popup does not inherit the parent page's stylesheet.
//
//  CACHING. The template is fetched once per session. It is needed on
//  every print and cannot change mid-session unless the Super Admin
//  edits it, and that path clears the cache explicitly.
// ================================================================

const PrintDoc = {

    _tpl: null,
    _loading: null,

    /** DEFAULTS - mirrors defaultPrintTemplate_() on the server, so a
     *  failed fetch still prints something sane rather than nothing. */
    DEFAULTS: {
        companyName: 'FCTC Construction Services',
        tagline: '', addressLine1: '', addressLine2: '',
        phone: '', email: '', website: '', tin: '', pcabLicense: '',
        logoUrl: '', logoHeight: 54, accentColor: '#24455A',
        headerLayout: 'logo-left', showLogo: true, showDivider: true,
        paperSize: 'A4', marginMm: 12,
        footerText: '', showTimestamp: true, showPreparedBy: true,
        signatories: [], watermark: ''
    },

    /** load - fetches and caches. Concurrent callers share one request. */
    async load(force) {
        if (this._tpl && !force) return this._tpl;
        if (this._loading && !force) return this._loading;
        this._loading = (async () => {
            try {
                const t = await DataService.getPrintTemplate();
                this._tpl = Object.assign({}, this.DEFAULTS, t || {});
            } catch (err) {
                // A missing letterhead must never block a print. Fall
                // back to defaults and let the document out.
                console.warn('PrintDoc: template unavailable, using defaults.', err);
                this._tpl = Object.assign({}, this.DEFAULTS);
            }
            this._loading = null;
            return this._tpl;
        })();
        return this._loading;
    },

    /** clearCache - called after the template is saved or reset. */
    clearCache() { this._tpl = null; },

    /** get - the cached template, or defaults if load() has not run. */
    get() { return this._tpl || this.DEFAULTS; },

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /**
     * letterheadHTML - the header block. Three layouts, because a
     * letterhead is the one thing a company has an opinion about:
     *   logo-left    logo beside the details, the usual business form
     *   logo-center  logo above centred details, for formal issues
     *   minimal      a single rule with the name and page title only
     */
    letterheadHTML(opts) {
        opts = opts || {};
        const t = this.get();
        const e = this._esc.bind(this);

        const contact = [
            t.addressLine1, t.addressLine2,
            [t.phone, t.email].filter(Boolean).join('  ·  '),
            t.website,
            [t.tin ? 'TIN: ' + t.tin : '', t.pcabLicense ? 'PCAB: ' + t.pcabLicense : '']
                .filter(Boolean).join('  ·  ')
        ].filter(Boolean).map(l => `<div class="pd-line">${e(l)}</div>`).join('');

        const logo = (t.showLogo && t.logoUrl)
            ? `<img class="pd-logo" src="${e(t.logoUrl)}" alt="" style="height:${parseInt(t.logoHeight, 10) || 54}px" />`
            : '';

        const name = `<div class="pd-name">${e(t.companyName)}</div>` +
            (t.tagline ? `<div class="pd-tagline">${e(t.tagline)}</div>` : '');

        const docTitle = opts.title
            ? `<div class="pd-doctitle">${e(opts.title)}</div>` : '';
        const docMeta = opts.meta
            ? `<div class="pd-docmeta">${e(opts.meta)}</div>` : '';

        if (t.headerLayout === 'minimal') {
            return `<header class="pd-head pd-minimal">
                <div class="pd-name">${e(t.companyName)}</div>
                <div class="pd-right">${docTitle}${docMeta}</div>
            </header>${t.showDivider ? '<div class="pd-rule"></div>' : ''}`;
        }

        if (t.headerLayout === 'logo-center') {
            return `<header class="pd-head pd-center">
                ${logo}
                ${name}
                <div class="pd-contact">${contact}</div>
                ${docTitle}${docMeta}
            </header>${t.showDivider ? '<div class="pd-rule"></div>' : ''}`;
        }

        return `<header class="pd-head pd-left">
            <div class="pd-id">${logo}<div>${name}<div class="pd-contact">${contact}</div></div></div>
            <div class="pd-right">${docTitle}${docMeta}</div>
        </header>${t.showDivider ? '<div class="pd-rule"></div>' : ''}`;
    },

    /**
     * signatureHTML - the signature blocks. Rendered only when the
     * template defines any, so a document that already has its own
     * signature row (the SWA billing does) is not given a second one.
     */
    signatureHTML() {
        const t = this.get();
        const list = Array.isArray(t.signatories) ? t.signatories.filter(s => s && s.label) : [];
        if (!list.length) return '';
        const e = this._esc.bind(this);
        return `<div class="pd-signs" style="grid-template-columns:repeat(${list.length},1fr)">
            ${list.map(s => `<div class="pd-sign">
                <div class="pd-sign-line">${e(s.name) || '&nbsp;'}</div>
                <div class="pd-sign-label">${e(s.label)}</div>
                ${s.position ? `<div class="pd-sign-pos">${e(s.position)}</div>` : ''}
            </div>`).join('')}
        </div>`;
    },

    /**
     * footerHTML - repeats on every printed page in Chrome and Edge via
     * `position: fixed` (see print-modal.css). Firefox and Safari print
     * it once, at the end. That is a browser limitation, not a bug here:
     * true repeating page footers need paged-media support that no
     * browser implements for arbitrary content.
     */
    footerHTML() {
        const t = this.get();
        const e = this._esc.bind(this);
        const bits = [];
        if (t.footerText) bits.push(e(t.footerText));
        if (t.showPreparedBy) {
            const u = (typeof App !== 'undefined' && App.getUser && App.getUser()) || {};
            if (u.name || u.email) bits.push('Prepared by ' + e(u.name || u.email));
        }
        if (t.showTimestamp) bits.push('Printed ' + new Date().toLocaleString());
        if (!bits.length) return '';
        return `<footer class="pd-foot">${bits.join('  ·  ')}</footer>`;
    },

    watermarkHTML() {
        const t = this.get();
        if (!t.watermark) return '';
        return `<div class="pd-watermark">${this._esc(t.watermark)}</div>`;
    },

    /** pageStyleTag - @page size/margins and the accent colour. */
    pageStyleTag() {
        const t = this.get();
        return `<style id="pd-page-style">
            @page { size: ${t.paperSize === 'Letter' ? 'Letter' : 'A4'}; margin: ${parseInt(t.marginMm, 10) || 12}mm; }
            :root { --pd-accent: ${t.accentColor}; }
        </style>`;
    },

    /**
     * print - the modal path. Injects the letterhead, signatures,
     * footer and watermark into the container that is about to print,
     * calls the browser, then removes them so the on-screen modal is
     * unchanged. Nothing is left behind if printing is cancelled,
     * because the cleanup runs on a timer rather than waiting for an
     * afterprint event that Safari does not reliably fire.
     *
     * @param opts.container  CSS selector; defaults to the open modal
     * @param opts.title      document title shown in the letterhead
     * @param opts.meta       small line under the title
     * @param opts.signatures include the signature blocks (default true)
     */
    async print(opts) {
        opts = opts || {};
        await this.load();

        const host = opts.container
            ? document.querySelector(opts.container)
            : document.querySelector('.print-modal-overlay.open .print-modal-content');

        if (!host) { window.print(); return; }

        // derive a sensible title from the document itself when the
        // caller did not pass one
        const title = opts.title !== undefined
            ? opts.title
            : (host.querySelector('.print-header h2')?.textContent || '').trim();
        const meta = opts.meta !== undefined
            ? opts.meta
            : (host.querySelector('.print-header .print-meta')?.textContent || '').trim();

        const style = document.createElement('div');
        style.innerHTML = this.pageStyleTag();
        const styleEl = style.firstElementChild;

        const head = document.createElement('div');
        head.className = 'pd-injected pd-head-wrap';
        head.innerHTML = this.watermarkHTML() + this.letterheadHTML({ title, meta });

        const tail = document.createElement('div');
        tail.className = 'pd-injected pd-tail-wrap';
        tail.innerHTML = (opts.signatures === false ? '' : this.signatureHTML()) + this.footerHTML();

        document.head.appendChild(styleEl);
        host.insertBefore(head, host.firstChild);
        host.appendChild(tail);

        const cleanup = () => {
            head.remove(); tail.remove(); styleEl.remove();
        };

        try {
            window.print();
        } finally {
            // Chrome blocks on window.print(); Safari does not. A short
            // timer covers both without depending on afterprint.
            setTimeout(cleanup, 800);
        }
    },

    /**
     * documentHTML - the new-window path. The estimate summary and DUPA
     * build a whole standalone document with window.open(), which does
     * not inherit this page's stylesheet, so the letterhead CSS has to
     * travel with them.
     *
     * @param opts.title  document title (browser tab + letterhead)
     * @param opts.meta   small line under the title
     * @param opts.body   the caller's HTML
     * @param opts.css    the caller's own extra CSS
     */
    documentHTML(opts) {
        opts = opts || {};
        const t = this.get();
        return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>${this._esc(opts.title || t.companyName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
@page { size: ${t.paperSize === 'Letter' ? 'Letter' : 'A4'}${opts.landscape ? ' landscape' : ''}; margin: ${parseInt(t.marginMm, 10) || 12}mm; }
:root { --pd-accent: ${t.accentColor}; }
body { font-family: 'Inter', Arial, sans-serif; color: #1C2321; margin: 0; padding: 22px; font-size: 12px; }
${this.baseCSS()}
${opts.css || ''}
@media print { .pd-noprint { display: none !important; } }
</style></head><body>
${this.watermarkHTML()}
${this.letterheadHTML({ title: opts.title, meta: opts.meta })}
${opts.body || ''}
${opts.signatures === false ? '' : this.signatureHTML()}
${this.footerHTML()}
<div class="pd-noprint" style="margin-top:22px;text-align:right;">
  <button onclick="window.print()" style="padding:8px 18px;font:inherit;cursor:pointer;">Print / Save as PDF</button>
</div>
</body></html>`;
    },

    /**
     * baseCSS - the letterhead styles as a string, for the new-window
     * path. The in-page path gets the same rules from print-modal.css;
     * this is the single duplicate in the module and it exists because a
     * popup genuinely cannot reach the parent's stylesheet.
     */
    baseCSS() {
        return `
.pd-head { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; }
.pd-head.pd-center { flex-direction:column; align-items:center; text-align:center; gap:4px; }
.pd-head.pd-minimal { align-items:baseline; }
.pd-id { display:flex; gap:14px; align-items:flex-start; }
.pd-logo { display:block; object-fit:contain; }
.pd-name { font-family:'Oswald',sans-serif; font-size:17px; font-weight:600; text-transform:uppercase; letter-spacing:.045em; color:var(--pd-accent); line-height:1.15; }
.pd-tagline { font-size:10.5px; color:#5B6360; font-style:italic; margin-top:1px; }
.pd-contact { margin-top:4px; font-size:10px; color:#5B6360; line-height:1.5; }
.pd-contact .pd-line { white-space:nowrap; }
.pd-right { text-align:right; }
.pd-doctitle { font-family:'Oswald',sans-serif; font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:#1C2321; }
.pd-docmeta { font-family:'IBM Plex Mono',monospace; font-size:10px; color:#5B6360; margin-top:2px; }
.pd-rule { border-bottom:2.5px solid var(--pd-accent); margin:9px 0 16px; }
.pd-signs { display:grid; gap:26px; margin-top:42px; page-break-inside:avoid; }
.pd-sign { text-align:center; }
.pd-sign-line { border-bottom:1px solid #1C2321; padding-bottom:3px; margin-bottom:5px; font-size:11.5px; font-weight:600; min-height:16px; }
.pd-sign-label { font-size:9px; text-transform:uppercase; letter-spacing:.07em; color:#5B6360; }
.pd-sign-pos { font-size:10px; color:#5B6360; margin-top:1px; }
.pd-foot { margin-top:20px; padding-top:7px; border-top:1px solid #D6D2C4; font-size:9px; color:#5B6360; text-align:center; }
.pd-watermark { position:fixed; top:44%; left:50%; transform:translate(-50%,-50%) rotate(-32deg); font-family:'Oswald',sans-serif; font-size:88px; font-weight:600; letter-spacing:.1em; color:rgba(28,35,33,.07); pointer-events:none; z-index:0; white-space:nowrap; }
@media print { .pd-foot { position:fixed; bottom:0; left:0; right:0; background:#fff; } }
`;
    }
};
