/**
 * xss.test.js — Nothing a person typed reaches innerHTML unescaped.
 *
 * Almost every screen is built by writing a template literal into
 * innerHTML, and almost every value in this system was typed by
 * somebody. Seventeen of twenty-five page files had no escaper at all,
 * so a material description containing a script tag ran the moment
 * anyone opened the list — most likely the Super Admin, who can force
 * approve anything.
 *
 * This test is the thing that stops it coming back, because the fix
 * itself is invisible: a page written without esc() looks exactly like
 * one written with it.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    // Fields that always come from a person.
    const FIELDS = ['name', 'description', 'desc', 'notes', 'remarks', 'brand',
        'specs', 'model', 'title', 'clientName', 'client', 'location', 'address',
        'contactPerson', 'category', 'role', 'trade', 'vendor', 'reason',
        'justification', 'detail', 'body', 'cause', 'actionTaken',
        'personsInvolved', 'recommendation', 'sowDescription', 'drawingNo',
        'discipline', 'invoiceNo', 'deliveryRef', 'decisionNote'];

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

    const pages = walk('js/pages');

    t.describe('the escaper exists and is loaded', () => {
        t.it('js/core/esc.js is present', () => t.ok(t.exists('js/core/esc.js')));
        t.it('index.html loads it FIRST', () => {
            // It has to be defined before any script that renders.
            //
            // Matched against the <script src> tags only. An earlier
            // version of this test searched the raw HTML and tripped over
            // a COMMENT mentioning nav.js — a test that fails on prose is
            // a test people learn to override.
            const html = t.read('index.html');
            const tags = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
            t.ok(tags.length > 0, 'no local scripts found');
            t.eq(tags[0], 'js/core/esc.js',
                'esc.js must be the first local script; it is currently ' + tags[0]);
        });

        t.it('it escapes all five dangerous characters', () => {
            const esc = new Function(t.read('js/core/esc.js') + '\nreturn esc;')();
            t.eq(esc('<script>'), '&lt;script&gt;');
            t.eq(esc('a & b'), 'a &amp; b');
            t.eq(esc('say "hi"'), 'say &quot;hi&quot;');
            t.eq(esc("it's"), 'it&#39;s');
            t.eq(esc(null), '', 'null must not render as the word null');
            t.eq(esc(undefined), '');
        });

        t.it('ampersand is escaped first, so nothing double-escapes', () => {
            const esc = new Function(t.read('js/core/esc.js') + '\nreturn esc;')();
            t.eq(esc('&lt;'), '&amp;lt;',
                'escaping < before & would turn &lt; into &amp;amp;lt;');
        });

        t.it('escUrl drops a javascript: scheme', () => {
            const escUrl = new Function(t.read('js/core/esc.js') + '\nreturn escUrl;')();
            t.eq(escUrl('javascript:alert(1)'), '',
                'a stored URL is user input too');
            t.eq(escUrl('vbscript:x'), '');
            t.ok(escUrl('https://drive.google.com/x').indexOf('https://') === 0,
                'a real link must still work');
            t.ok(escUrl('/local/path').indexOf('/local') === 0);
        });
    });

    t.describe('no user field reaches innerHTML unescaped', () => {
        const offenders = [];
        pages.forEach(f => {
            const src = fs.readFileSync(f, 'utf8');
            const rel = path.relative(t.ROOT, f).replace(/\\/g, '/');
            src.split('\n').forEach((line, i) => {
                FIELDS.forEach(field => {
                    // ${something.field} with no escaper around it
                    const re = new RegExp('\\$\\{\\s*[a-zA-Z_][\\w]*(?:\\.[a-zA-Z_][\\w]*)*\\.'
                        + field + '\\s*\\}', 'g');
                    if (re.test(line)) offenders.push(`${rel}:${i + 1} .${field}`);
                });
            });
        });

        t.it('every page escapes what a person typed', () => {
            t.ok(offenders.length === 0,
                offenders.length + ' unescaped: ' + offenders.slice(0, 8).join(', ') +
                (offenders.length > 8 ? ` …and ${offenders.length - 8} more` : ''));
        });
    });

    t.describe('no page keeps its own weaker escaper', () => {
        t.it('the local escapers are gone', () => {
            // One of them escaped only " and <, leaving & and > through.
            // Seventeen files having no escaper at all is exactly what a
            // per-page helper produces.
            const bad = pages.filter(f =>
                /const esc = |function esc\(/.test(fs.readFileSync(f, 'utf8')))
                .map(f => path.relative(t.ROOT, f));
            t.ok(bad.length === 0, 'local escaper still in: ' + bad.join(', '));
        });
    });
};
