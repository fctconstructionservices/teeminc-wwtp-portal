/**
 * wiring.test.js — Does every reference point at something real?
 *
 * Every test in here corresponds to a bug that reached Darwin. None of
 * them are hypothetical.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const walk = (rel, ext) => {
        const out = [];
        const go = d => {
            if (!fs.existsSync(d)) return;
            fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
                const p = path.join(d, e.name);
                if (e.isDirectory()) go(p);
                else if (e.name.endsWith(ext) && e.name !== 'bundle.css') out.push(p);
            });
        };
        go(path.join(t.ROOT, rel));
        return out;
    };

    const html = t.read('index.html');
    const jsFiles = walk('js', '.js');
    const cssFiles = walk('css', '.css');
    const allJs = jsFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const allCss = cssFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

    // ── the bug that cost three batches ──────────────────────
    t.describe('getElementById targets exist', () => {
        // Ids created at runtime by a modal or a template literal are
        // not in index.html, so only ids the STATIC markup should own
        // are checked. The daily record form is the case that broke.
        const mustExist = ['appNav', 'dailyAddForm', 'proj-tab-sow', 'proj-tab-estimates',
            'proj-tab-gantt', 'purchaseRequestsContent', 'payablesContent',
            'suppliersContent', 'req-budget', 'liq-vendor', 'liq-vendor-list'];

        mustExist.forEach(id => {
            t.it(`#${id} is defined somewhere`, () => {
                const inHtml = html.indexOf(`id="${id}"`) > -1;
                const inJs = allJs.indexOf(`id="${id}"`) > -1;
                t.ok(inHtml || inJs, `nothing ever creates #${id}, but code looks it up`);
            });
        });

        t.it('nothing looks up the long-dead #addRecordForm', () => {
            const hit = jsFiles.find(f =>
                fs.readFileSync(f, 'utf8').indexOf("getElementById('addRecordForm')") > -1);
            t.ok(!hit, `${hit} looks up an element that does not exist — the form is #dailyAddForm`);
        });

        t.it('the stylesheet targets #dailyAddForm, not #addRecordForm', () => {
            t.ok(allCss.indexOf('#addRecordForm') === -1,
                'CSS targets an element id that does not exist, so those rules never apply');
        });
    });

    // ── every script the app needs is actually loaded ────────
    t.describe('scripts are loaded', () => {
        const needed = ['js/core/typeahead.js', 'js/core/nav.js', 'js/core/icons.js',
            'js/core/modals.js', 'js/core/print-doc.js', 'js/services/data-service.js'];
        needed.forEach(src => {
            t.it(`${src} exists and index.html loads it`, () => {
                t.ok(t.exists(src), `${src} is missing from the repo`);
                t.ok(html.indexOf(src) > -1, `${src} exists but index.html never loads it`);
            });
        });

        t.it('every <script src> points at a file that exists', () => {
            const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
                .filter(s => !/^https?:/.test(s));
            const missing = srcs.filter(s => !t.exists(s));
            t.ok(missing.length === 0, 'index.html loads missing file(s): ' + missing.join(', '));
        });
    });

    // ── the crash in Hotfix 1 ────────────────────────────────
    t.describe('icons are called, not passed', () => {
        t.it('no icon is stored as an unbound method reference', () => {
            // `Icon.wallet` stored in a map and called later loses `this`,
            // which crashed the whole Approvals page. Store the NAME.
            const bad = /:\s*Icon\.[a-zA-Z]+\s*[,}]/.exec(allJs);
            t.ok(!bad, 'an Icon method is stored unbound (' + (bad && bad[0]) +
                ') — it will throw when called. Store the name and call Icon[name]().');
        });
    });

    // ── the blank billing print ──────────────────────────────
    t.describe('print rules', () => {
        t.it('a full-screen overlay that prints carries .printable-overlay', () => {
            const bill = t.read('js/pages/project/project-billings.js');
            t.ok(bill.indexOf('printable-overlay') > -1,
                'the SWA sheet is not a .print-modal-overlay, so without this class the ' +
                'global print rule hides it and the billing prints blank');
        });
        t.it('the print reset uses display:none, not visibility:hidden', () => {
            const pm = t.read('css/components/print-modal.css');
            t.ok(pm.indexOf('body > *:not(.print-modal-overlay)') > -1 &&
                 pm.indexOf('display: none !important') > -1,
                'hidden elements still occupy layout, which is what produced the blank first page');
        });
    });

    // ── search coverage, front and back agreeing ─────────────
    t.describe('search covers what the UI expects', () => {
        t.it('backend and frontend agree on the record type count', () => {
            const be = t.read('backend/12-SearchService.gs');
            const fe = t.read('js/features/search.js');
            const cov = /var SEARCH_COVERAGE = \[([\s\S]*?)\];/.exec(be);
            t.ok(cov, 'SEARCH_COVERAGE is missing from the backend');
            const count = cov[1].split(',').filter(x => x.trim()).length;
            const expected = parseInt(/EXPECTED_TYPES = (\d+)/.exec(fe)[1], 10);
            t.eq(expected, count, 'the stale-backend banner will fire on a correct deployment');
        });
    });

    // ── the token sweep that ate itself ──────────────────────
    t.describe('design tokens resolve', () => {
        const vars = t.read('css/base/variables.css');
        ['--font-display', '--font-body', '--font-num'].forEach(name => {
            t.it(`${name} does not point at itself`, () => {
                const def = new RegExp(name + ':\\s*([^;]+);').exec(vars);
                t.ok(def, name + ' is not defined');
                t.ok(def[1].indexOf('var(' + name + ')') === -1,
                    name + ' resolves to nothing, so no font applies anywhere');
            });
            t.it(`${name} names a real family`, () => {
                const def = new RegExp(name + ':\\s*([^;]+);').exec(vars);
                t.ok(/'[A-Za-z]/.test(def[1]), name + ' has no quoted family name');
            });
        });

        t.it('every font family a token names is actually loaded', () => {
            const html = t.read('index.html');
            const families = [...vars.matchAll(/--font-\w+:\s*'([^']+)'/g)].map(m => m[1]);
            const missing = families.filter(f =>
                html.indexOf(f.replace(/ /g, '+')) === -1);
            t.ok(missing.length === 0,
                'named but never loaded from Google Fonts: ' + missing.join(', '));
        });
    });

    // ── language ─────────────────────────────────────────────
    t.describe('product strings are English', () => {
        t.it('no Tagalog in user-facing labels', () => {
            const words = /\b(anong|ano ang|saan\?|ilan ang|bakit ang|kailan ang|nagawa|ginamit na)\b/i;
            const hits = [];
            jsFiles.forEach(f => {
                const lines = fs.readFileSync(f, 'utf8').split('\n');
                lines.forEach((l, i) => {
                    if (words.test(l)) hits.push(`${path.relative(t.ROOT, f)}:${i + 1}`);
                });
            });
            t.ok(hits.length === 0, 'Tagalog found in: ' + hits.join(', '));
        });
    });
};
