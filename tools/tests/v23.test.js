/**
 * v23.test.js — Drawings on screen, on paper, and the letterhead.
 *
 * The duplicate-function check at the bottom is here because of a
 * mistake I made writing this batch: an edit script searched for its
 * closing pattern across the WHOLE file, matched an earlier one in a
 * different render function, and spliced a duplicate copy of
 * renderDrawings into the file. JavaScript takes the last definition,
 * so the change appeared to do nothing.
 *
 * The syntax was valid. The tests passed. Only a check for the shape of
 * the file caught it.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    t.describe('drawings are shown, not tabulated', () => {
        const so = t.read('js/pages/project/project-siteops.js');

        t.it('a grid replaces the table', () => {
            t.ok(/dwg-grid/.test(so));
            t.ok(!/<th>Drawing No\.<\/th>/.test(so), 'the table markup is still there');
        });
        t.it('the drawing itself is rendered', () => {
            t.ok(/driveImgSrc\(d\.fileUrl\)/.test(so));
            t.ok(/loading="lazy"/.test(so), 'a project can hold fifty drawings');
        });
        t.it('links are escaped', () => t.ok(/escUrl\(d\.fileUrl\)/.test(so)));
        t.it('a PDF gets an honest placeholder, not a broken image', () =>
            t.ok(/no-preview/.test(so)));
        t.it('a superseded drawing is visibly marked', () =>
            // It stays visible — knowing an old revision exists matters —
            // but it must never pass for the current one at a glance.
            t.ok(/is-old/.test(so)));
    });

    t.describe('one drawing per printed page', () => {
        const rp = t.read('js/pages/project/project-reports.js');

        t.it('the section exists and is selectable', () => {
            t.ok(/_rsDrawingSheets/.test(rp));
            t.ok(/id: 'drawingSheets'/.test(rp));
        });
        t.it('each drawing starts a new page and fills it', () => {
            t.ok(/dwg-sheet \{ page-break-before:always/.test(rp));
            t.ok(/max-height:215mm/.test(rp),
                'a drawing printed small enough to share a page is one nobody can ' +
                'read a dimension from');
        });
        t.it('superseded drawings are excluded from the printed set', () =>
            // A printed set containing an old revision is worse than no
            // printed set: somebody builds from it, and the paper looks
            // exactly as official as the current one.
            t.ok(/d\.status === 'Current'/.test(rp)));
        t.it('each sheet carries its own title block', () =>
            t.ok(/ds-block/.test(rp),
                'a page torn off on its own must still say what it is and which revision'));
    });

    t.describe('the letterhead survives a long title', () => {
        const pd = t.read('js/core/print-doc.js');

        t.it('the document title is out of the right-hand block', () => {
            // It sat beside the company details in a fixed share of the
            // width. "Attendance — BF2/NF2 Lagoon Liner — 2026-08"
            // wrapped to three lines and pushed the block taller than the
            // logo, breaking the alignment of the whole header.
            t.ok(!/pd-right">\$\{docTitle\}/.test(pd));
            t.ok(/pd-docblock/.test(pd));
        });
        t.it('all three header layouts were updated', () =>
            t.eq((pd.match(/pd-head pd-(minimal|center|left)/g) || []).length, 3));
        t.it('a long title wraps without distorting anything', () =>
            t.ok(/word-break:break-word/.test(pd)));
    });

    t.describe('no page file defines the same function twice', () => {
        // JavaScript takes the LAST definition in an object literal, so a
        // duplicate silently makes an edit to the first one dead code —
        // valid syntax, passing tests, and no visible change.
        const walk = dir => {
            const out = [];
            const go = d => {
                if (!fs.existsSync(d)) return;
                fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
                    const p = path.join(d, e.name);
                    if (e.isDirectory()) go(p);
                    else if (e.name.endsWith('.js')) out.push(p);
                });
            };
            go(path.join(t.ROOT, dir));
            return out;
        };

        // Control keywords are not methods, and a file may legitimately
        // define the same name on two DIFFERENT objects — modals.js has
        // several, each with its own open() and close(). Only files that
        // hold ONE top-level object are checked, and keywords are
        // excluded. A test that reports things which are fine is a test
        // people learn to ignore.
        const KEYWORDS = { if: 1, for: 1, while: 1, switch: 1, catch: 1,
            function: 1, return: 1, else: 1, do: 1, try: 1 };

        const offenders = [];
        walk('js').forEach(f => {
            const src = fs.readFileSync(f, 'utf8');
            const objects = (src.match(/^(?:const|var|let) [A-Z][\w]* = \{/gm) || []).length
                + (src.match(/^Object\.assign\(/gm) || []).length;
            if (objects !== 1) return;

            const seen = {};
            const re = /^    (?:async )?([a-zA-Z_][\w]*)\s*\([^)]*\)\s*\{/gm;
            let m;
            while ((m = re.exec(src)) !== null) {
                const name = m[1];
                if (KEYWORDS[name]) continue;
                if (seen[name]) offenders.push(path.relative(t.ROOT, f) + ' \u2192 ' + name);
                seen[name] = 1;
            }
        });

        t.it('every method name is defined once per file', () =>
            t.ok(offenders.length === 0,
                'duplicate definitions — the earlier one is dead code: ' +
                offenders.slice(0, 6).join(', ')));
    });
};
