// ================================================================
//  core/pdf-render.js — Turning a PDF drawing into something the
//                       system can show. (v24)
//
//  ── THE PROBLEM THIS SOLVES ─────────────────────────────────
//
//  Google Drive gives no inline preview for a PDF. So a drawing
//  uploaded as a PDF showed a placeholder on the Drawings tab and could
//  not be embedded in a printed report — which is most of the value of
//  both.
//
//  Apps Script cannot render a PDF; there is no library and no service.
//  The browser can: PDF.js rasterises a page to a canvas at whatever
//  resolution you ask for, and that happens BEFORE the file is
//  uploaded, on the machine that already has the file in memory.
//
//  ── WHAT THIS IS HONESTLY NOT ───────────────────────────────
//
//  A PDF is vector. An image is not. A rendered page is sharp on screen
//  and sharp printed at A4, and it does NOT survive being zoomed
//  indefinitely the way the original does.
//
//  So the original PDF is kept and still linked. The image is a preview
//  and a print copy, not a replacement — and "Open the PDF" stays on
//  every card for the times somebody needs to read a dimension off it.
//
//  ── WHY EVERY PAGE, NOT JUST THE FIRST ──────────────────────
//
//  A drawing PDF is usually one sheet, but a set is not. Rendering only
//  page one would silently drop sheets 2 to 6 from the printed set —
//  and a set that is quietly incomplete is worse than one that is
//  obviously a PDF.
// ================================================================

const PdfRender = {

    /** PDF.js from the same CDN the rest of the app uses. Loaded on
     *  demand: most sessions never upload a PDF, and this is ~350KB. */
    CDN: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174',

    /** Render scale. 2.0 gives roughly 144 dpi against a PDF's nominal
     *  72 — sharp on a retina screen and clean printed at A4. Higher
     *  looks no better on screen and makes the upload several times
     *  larger, which matters on a site connection. */
    SCALE: 2.0,

    /** JPEG rather than PNG, at 0.92. A drawing is mostly white with
     *  thin dark lines; PNG handles that well but produces files three
     *  to five times larger, and 8 MB is the upload ceiling. At 0.92 the
     *  artefacts are not visible on a line drawing. */
    QUALITY: 0.92,

    /** Beyond this the upload becomes slow enough that people assume it
     *  has hung. A set larger than this is told to be split. */
    MAX_PAGES: 12,

    _lib: null,

    async _load() {
        if (this._lib) return this._lib;
        if (window.pdfjsLib) { this._lib = window.pdfjsLib; return this._lib; }

        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = this.CDN + '/pdf.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error(
                'Could not load the PDF reader. Check the connection and try again, ' +
                'or upload the drawing as an image.'));
            document.head.appendChild(s);
        });

        if (!window.pdfjsLib) throw new Error('The PDF reader did not load.');
        // The worker must come from the same version, or PDF.js fails
        // with an error that says nothing useful.
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = this.CDN + '/pdf.worker.min.js';
        this._lib = window.pdfjsLib;
        return this._lib;
    },

    /** isPdf - by type first, then extension. A file picked on a phone
     *  sometimes arrives with an empty type. */
    isPdf(file) {
        if (!file) return false;
        if (String(file.type || '').toLowerCase() === 'application/pdf') return true;
        return /\.pdf$/i.test(String(file.name || ''));
    },

    /**
     * render - every page of a PDF as a JPEG data URL.
     *
     * @param file      the File object
     * @param onProgress (done, total) => void, for the upload button
     * @returns { pages: [{ dataUrl, width, height }], pageCount, truncated }
     */
    async render(file, onProgress) {
        const lib = await this._load();
        const buf = await file.arrayBuffer();

        const doc = await lib.getDocument({ data: buf }).promise;
        const total = doc.numPages;
        const count = Math.min(total, this.MAX_PAGES);
        const pages = [];

        for (let n = 1; n <= count; n++) {
            const page = await doc.getPage(n);
            const viewport = page.getViewport({ scale: this.SCALE });

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');

            // A PDF page has no background of its own. Without this the
            // transparent areas render black, and a drawing comes out as
            // white lines on black.
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;

            pages.push({
                dataUrl: canvas.toDataURL('image/jpeg', this.QUALITY),
                width: canvas.width,
                height: canvas.height
            });

            // Free it immediately. A large set holds several hundred
            // megabytes of canvas otherwise, and a phone runs out.
            canvas.width = 0;
            canvas.height = 0;

            if (onProgress) onProgress(n, count);
        }

        return { pages: pages, pageCount: total, truncated: total > count };
    },

    /** base64 - the payload the upload endpoint expects, without the
     *  data-URL prefix. */
    base64(dataUrl) {
        return String(dataUrl).split(',')[1] || '';
    }
};
