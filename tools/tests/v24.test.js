/**
 * v24.test.js — Rendering a PDF drawing to images.
 *
 * Drive gives no inline preview for a PDF and Apps Script cannot
 * rasterise one, so a PDF drawing was invisible on the Drawings tab and
 * unprintable in a report. The browser can render it, and it already
 * has the file in memory — so it happens before the upload.
 *
 * The tests that matter most here are the ones about FAILURE: a render
 * that goes wrong must never cost somebody their drawing.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const pr = t.read('js/core/pdf-render.js');
    const PR = new Function('window', 'document', pr + '\nreturn PdfRender;')({}, {});

    t.describe('a PDF is recognised however it arrives', () => {
        t.it('by mime type', () => t.ok(PR.isPdf({ type: 'application/pdf', name: 'x' })));
        t.it('by extension when the phone gives no type', () =>
            t.ok(PR.isPdf({ type: '', name: 'S-101.pdf' })));
        t.it('case-insensitively', () => t.ok(PR.isPdf({ type: '', name: 'S-101.PDF' })));
        t.it('an image is not a PDF', () => t.ok(!PR.isPdf({ type: 'image/png', name: 'a.png' })));
        t.it('null does not throw', () => t.ok(!PR.isPdf(null)));
    });

    t.describe('the render settings are deliberate', () => {
        t.it('2x scale — roughly 144 dpi', () =>
            // Sharp on a retina screen and clean printed at A4. Higher
            // looks no better and multiplies the upload size, which
            // matters on a site connection.
            t.eq(PR.SCALE, 2.0));
        t.it('JPEG at 0.92, not PNG', () =>
            // A drawing is thin dark lines on white. PNG handles that
            // well and produces files three to five times larger,
            // against an 8 MB ceiling.
            t.ok(PR.QUALITY >= 0.9 && PR.QUALITY <= 0.95));
        t.it('capped at 12 pages', () =>
            t.eq(PR.MAX_PAGES, 12, 'a longer set becomes slow enough to look like a hang'));
        t.it('the data-URL prefix is stripped for upload', () =>
            t.eq(PR.base64('data:image/jpeg;base64,AAAB'), 'AAAB'));
    });

    t.describe('the canvas is filled white first', () => {
        t.it('a transparent PDF page would otherwise render black', () =>
            // A PDF page has no background of its own. Without the fill,
            // a drawing comes out as white lines on black.
            t.ok(/fillStyle = '#FFFFFF'/.test(pr)));
    });

    t.describe('a failed render never costs the drawing', () => {
        const so = t.read('js/pages/project/project-siteops.js');
        t.it('the original PDF is uploaded regardless', () => {
            t.ok(/fileBase64: b64/.test(so));
            t.ok(/could not be rendered for preview/.test(so),
                'the upload must continue and the drawing must still land');
        });
        t.it('a preview that fails to store does not lose the row', () =>
            t.ok(/failed to upload: ' \+ err\.message/.test(t.read('backend/23-SiteOpsService.gs'))));
        t.it('progress is shown while rendering', () =>
            t.ok(/Rendering page \$\{done\} of \$\{total\}/.test(so),
                'twelve sheets is not instant, and silence reads as a hang'));
    });

    t.describe('storage', () => {
        const be = t.read('backend/23-SiteOpsService.gs');
        t.it('pages are stored as JSON, not a column each', () =>
            // A set can be one sheet or twelve; a fixed number of columns
            // would be wrong for both.
            t.ok(/previewUrls: previewUrls\.length \? JSON\.stringify/.test(be)));
        t.it('they are parsed server-side', () =>
            t.ok(/d\.previews = safeParse_/.test(be),
                'so no page has to know it was stored as JSON'));
        t.it('the column is declared in the schema', () =>
            t.ok(/'previewUrls'/.test(t.read('backend/01-Schemas.gs'))));
    });

    t.describe('the printed set', () => {
        const rp = t.read('js/pages/project/project-reports.js');
        t.it('a multi-sheet PDF prints as several pages', () =>
            t.ok(/shots\.forEach\(\(url, i\)/.test(rp)));
        t.it('sheets are numbered only when there is more than one', () =>
            t.ok(/shots\.length > 1 \?/.test(rp),
                'a single drawing must not be titled "sheet 1 of 1"'));
        t.it('a PDF uploaded before this feature explains itself', () =>
            t.ok(/uploaded before rendering existed/.test(rp)));
    });
};
