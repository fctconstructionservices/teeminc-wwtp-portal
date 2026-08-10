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

    // ── the field-name class of bug ──────────────────────────
    t.describe('reads match what is written', () => {
        const daily = t.read('js/pages/project/project-daily.js');

        t.it('nothing reads a manpower time field that is never written', () => {
            // The form writes amIn/amOut, pmIn/pmOut, otIn/otOut. Three
            // separate views read `am`, `pm` and `ot` — fields that have
            // never existed — so those columns printed blank on every
            // report and nobody noticed, because a blank cell in a time
            // column looks like a day somebody did not fill in.
            const written = ['amIn', 'amOut', 'pmIn', 'pmOut', 'otIn', 'otOut'];
            written.forEach(f => {
                t.ok(daily.indexOf(f) > -1, `the form no longer writes ${f} — update these tests`);
            });
            const readers = ['js/pages/approvals.js',
                'js/pages/project/project-reports.js', 'js/core/modals.js'];
            const bad = [];
            readers.forEach(rel => {
                const src = t.read(rel);
                [/\['AM', 'am'/, /\['PM', 'pm'/, /\['OT', 'ot'/].forEach(re => {
                    if (re.test(src)) bad.push(rel);
                });
            });
            t.ok(bad.length === 0, 'reading am/pm/ot instead of amIn/amOut in: ' + bad.join(', '));
        });

        t.it('getAllPersonnel returns every column the frontend uses', () => {
            // This builds an explicit object rather than returning the
            // row, so a new column is invisible to the whole frontend
            // until it is added there too. That is how the photo and the
            // signature were written to the sheet and then dropped on
            // the way out.
            const svc = t.read('backend/16-ManpowerService.gs');
            const fn = /function getAllPersonnel\(\)[\s\S]*?\n}/.exec(svc);
            t.ok(fn, 'getAllPersonnel not found');
            ['image', 'signature', 'name', 'role', 'dailyRate'].forEach(f => {
                t.ok(new RegExp('\\b' + f + ':').test(fn[0]),
                    `getAllPersonnel drops ${f} — the frontend will never see it`);
            });
        });

        t.it('a Drive image is always rendered through driveImgSrc', () => {
            // A raw Drive link does not render in an <img>; it needs the
            // direct-view form. Emitting the raw url is why the signature
            // column stayed empty even once the data reached it.
            const bad = [];
            ['js/pages/project/project-reports.js', 'js/pages/approvals.js',
             'js/core/modals.js', 'js/pages/manpower.js'].forEach(rel => {
                const src = t.read(rel);
                if (/src="\$\{e\((?:m|p|r|x)\.(?:signature|image)\)\}"/.test(src)) bad.push(rel);
            });
            t.ok(bad.length === 0, 'raw Drive url in an <img> in: ' + bad.join(', '));
        });
    });

    // ── one codebase, many companies ─────────────────────────
    t.describe('nothing is hardcoded to one company', () => {
        t.it('the backend URL appears only in config.js', () => {
            // Anywhere else and standing up a second company means
            // forking the repository, which means every future fix has
            // to be applied twice.
            const offenders = jsFiles.filter(f => {
                const rel = path.relative(t.ROOT, f).replace(/\\/g, '/');
                if (rel === 'js/core/config.js') return false;
                return /script\.google\.com\/macros/.test(fs.readFileSync(f, 'utf8'));
            }).map(f => path.relative(t.ROOT, f));
            t.ok(offenders.length === 0, 'hardcoded backend URL in: ' + offenders.join(', '));
        });

        t.it('config.js is loaded before data-service.js', () => {
            const c = html.indexOf('js/core/config.js');
            const d = html.indexOf('js/services/data-service.js');
            t.ok(c > -1 && d > -1 && c < d,
                'data-service reads CONFIG at load time, so config must come first');
        });

        t.it('every data-cfg key resolves to something in CONFIG', () => {
            const cfg = t.read('js/core/config.js');
            const keys = [...html.matchAll(/data-cfg="([^"]+)"/g)].map(m => m[1]);
            t.ok(keys.length > 0, 'no branding is config-driven at all');
            const bad = keys.filter(k => {
                const leaf = k.split('.').pop();
                return !new RegExp('\\b' + leaf + '\\s*:').test(cfg);
            });
            t.ok(bad.length === 0, 'data-cfg keys with no value in CONFIG: ' + bad.join(', '));
        });

        t.it('every deploy config defines the same shape as the live one', () => {
            // A second company whose config is missing a key the app
            // reads shows a blank where a name should be — and only on
            // that company's site, so you would not see it.
            const live = t.read('js/core/config.js');
            const keys = ['apiUrl', 'company', 'currency', 'accent',
                          'short', 'name', 'appName', 'notice'];
            const dir = path.join(t.ROOT, 'deploy');
            if (!fs.existsSync(dir)) return;
            fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => {
                const c = fs.readFileSync(path.join(dir, f), 'utf8');
                const missing = keys.filter(k => !new RegExp('\\b' + k + '\\s*:').test(c));
                t.ok(missing.length === 0,
                    `deploy/${f} is missing: ${missing.join(', ')}`);
                t.ok(/function applyConfig/.test(c),
                    `deploy/${f} has no applyConfig — the branding would never be written`);
            });
        });

        t.it('no deploy config still holds the placeholder URL', () => {
            const dir = path.join(t.ROOT, 'deploy');
            if (!fs.existsSync(dir)) return;
            const unfilled = fs.readdirSync(dir)
                .filter(f => f.endsWith('.js') && f !== 'config.company2.js')
                .filter(f => /PASTE_THE_NEW_EXEC_URL_HERE/.test(
                    fs.readFileSync(path.join(dir, f), 'utf8')));
            t.ok(unfilled.length === 0,
                'these would deploy pointing at nothing: ' + unfilled.join(', '));
        });

        t.it('the SPA fallback is configured for Cloudflare Workers', () => {
            // The app is a single page: there is no server route for
            // /payables, so a refresh anywhere but the root would 404.
            //
            // This used to check for a _redirects file. That is the
            // Cloudflare PAGES mechanism, and Workers rejects the rule
            // outright — "infinite loop detected", because Workers
            // strips .html and /index and re-triggers the same rule.
            // The Workers equivalent lives in wrangler.jsonc.
            t.ok(t.exists('wrangler.jsonc'),
                'wrangler.jsonc is missing — the Worker has nothing telling it to serve the site');
            const w = t.read('wrangler.jsonc');
            t.ok(/single-page-application/.test(w),
                'not_found_handling is not set to single-page-application, so refreshing on any screen will 404');
            t.ok(!t.exists('_redirects'),
                '_redirects is a Pages file and Workers REJECTS it — it fails the whole deploy');
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
