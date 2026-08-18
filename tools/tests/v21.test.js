/**
 * v21.test.js — Attendance, QA/QC, and the Timeline default.
 *
 * The Timeline tests are the interesting ones. The bug was not that a
 * value was wrong — both creation paths produced a valid schedule. They
 * produced DIFFERENT valid schedules, so the Timeline behaved
 * differently depending on which button had made the row. That is the
 * hardest kind of bug to report, because each screen looks correct on
 * its own.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    t.describe('one schedule default, both creation paths', () => {
        const bulk = t.read('backend/36-SowBulkService.gs');
        const proj = t.read('backend/05-ProjectService.gs');

        t.it('the default is two working days', () => {
            // Not one. A one-day task has start === finish, so moving the
            // start immediately pushes the finish and the duration can
            // never change on screen — it looks broken even though the
            // arithmetic is right.
            t.ok(/DEFAULT_SOW_DAYS = 2/.test(bulk));
        });
        t.it('import and add-one call the same helper', () => {
            t.ok(/defaultSowEnd_\(kickoff\)/.test(bulk));
            t.ok(/defaultSowEnd_\(startDate\)/.test(proj));
            t.ok(!/Utilities\.formatDate\(tomorrow/.test(proj),
                'the old two-day-by-accident default must be gone');
        });

        const api = new Function('Utilities', 'Session', 'readAll_',
            bulk.match(/function _bulkStartDate_[\s\S]*?\n}/)[0] + '\n' +
            bulk.match(/function defaultSowEnd_[\s\S]*?\n}/)[0] +
            '\nvar DEFAULT_SOW_DAYS=2;\nreturn {_bulkStartDate_, defaultSowEnd_};')(
            { formatDate: d => { const m = new Date(d.getTime() + 8 * 3600 * 1000);
                const p = n => String(n).padStart(2, '0');
                return m.getUTCFullYear() + '-' + p(m.getUTCMonth() + 1) + '-' + p(m.getUTCDate()); } },
            { getScriptTimeZone: () => 'Asia/Manila' }, () => []);

        t.it('two working days from a Wednesday is Thursday', () =>
            t.eq(api.defaultSowEnd_('2026-08-12'), '2026-08-13'));
        t.it('a Sunday start is moved to a weekday', () => {
            // A task beginning on a Sunday shows a duration the site
            // cannot work, and every dependent date inherits the error.
            const s = api._bulkStartDate_('2026-08-16');
            const d = new Date(s + 'T00:00:00Z');
            t.ok(d.getUTCDay() !== 0 && d.getUTCDay() !== 6, 'got ' + s);
        });
    });

    t.describe('the Timeline left pane', () => {
        const css = t.read('css/pages/gantt.css');
        const cols = /grid-template-columns: (152px[^;]*);/.exec(css);

        t.it('the Days column fits three digits', () => {
            t.ok(!!cols, 'the fixed column template is missing');
            t.ok(/70px/.test(cols[1]),
                'at 54px a three-digit duration was clipped — and that is the number ' +
                'people are checking on this row');
        });
        t.it('the SOW name is frozen at a FIXED width', () => {
            // With minmax(120px, 1fr) the name stretched to fill the pane,
            // so when the detail columns scrolled away it kept its
            // stretched width and covered them.
            const task = /\.gt-cell-left \.gt-task \{([^}]*)\}/.exec(css)[1];
            t.ok(/position: sticky/.test(task));
            t.ok(/width: 152px/.test(task));
        });
    });

    t.describe('attendance is by date, with times and signatures', () => {
        const daily = t.read('js/pages/project/project-daily.js');

        t.it('every in and out time is its own column', () => {
            ['AM in', 'AM out', 'PM in', 'PM out', 'OT in', 'OT out'].forEach(c =>
                t.ok(daily.indexOf(c) > -1, c + ' is missing'));
        });
        t.it('each row carries a signature', () => t.ok(/att-sig/.test(daily)));
        t.it('it prints through the shared letterhead', () => {
            // Not a look-alike built here — an attendance sheet with a
            // different header from the daily report it came from looks
            // like it came from somewhere else.
            t.ok(/PrintDoc\.documentHTML/.test(daily));
            t.ok(/landscape: true/.test(daily), '10 columns will not fit portrait');
        });

        const P = new Function('return {' +
            daily.match(/_spanHours\(a, b\) \{[\s\S]*?\n    \},/)[0].replace(/,$/, '') + '};')();

        t.it('an overnight shift is not negative hours', () => {
            // 22:00 to 02:00 is four hours worked. Subtracting naively
            // gives −20, which would reduce somebody's pay for working
            // late.
            t.ok(Math.abs(P._spanHours('22:00', '02:00') - 4) < 0.01);
            t.ok(Math.abs(P._spanHours('07:00', '12:00') - 5) < 0.01);
        });
        t.it('a missing time is zero, not NaN', () => t.eq(P._spanHours('', '12:00'), 0));
    });

    t.describe('SOW ids survive Google Sheets', () => {
        // An id like "1" or "1.10" LOOKS numeric, so Sheets converts the
        // cell. It reads back as "1" → 1 and "1.10" → 1.1, which does two
        // things:
        //   · the lookup by id fails — the "SOW item not found" toast;
        //   · "1.10" and "1.1" become THE SAME ROW.
        // The second is silent data loss in any section with ten or more
        // items.
        const util = t.read('backend/03-SheetUtils.gs');
        const key = new Function(
            util.match(/function _cellKey_[\s\S]*?\n}/)[0] + '\nreturn _cellKey_;')();

        t.it('a number read back resolves to its text form', () => {
            t.eq(key(1), '1');
            t.eq(key(1.1), '1.1');
        });
        t.it("Sheets' text marker is stripped", () => {
            t.eq(key("'1.10"), '1.10');
            t.eq(key("'2.20"), '2.20');
        });
        t.it('a trailing-zero id keeps its identity when written as text', () => {
            // This is the whole point: "1.10" must stay "1.10" and NOT
            // collapse onto "1.1".
            t.ok(key("'1.10") !== key("'1.1"),
                '1.10 and 1.1 must remain distinct rows');
        });
        t.it('identifiers are forced to text in the WRITE LAYER', () => {
            // Not at the call site. There are more than a dozen places
            // that write a sowId, and guarding each is a list somebody
            // will add to and forget — which is exactly how this bug came
            // back twice. Guarding the one function every write goes
            // through is not.
            const util = t.read('backend/03-SheetUtils.gs');
            t.ok(/function _textIfIdentifier_/.test(util));
            t.ok(/ID_COLUMNS/.test(util));
            const cols = /var ID_COLUMNS = \{([\s\S]*?)\};/.exec(util)[1];
            ['id:', 'sowId:', 'groupId:', 'prId:', 'poId:', 'predecessors:'].forEach(c =>
                t.ok(cols.indexOf(c) > -1, c + ' must be treated as an identifier'));
            t.ok(cols.indexOf('qty:') === -1 && cols.indexOf('amount:') === -1,
                'a quantity and an amount ARE numbers — forcing those to text ' +
                'would break every sum in the system');
        });

        t.it('appendRow_ and both update paths apply it', () => {
            const util = t.read('backend/03-SheetUtils.gs');
            t.ok(/_textIfIdentifier_\(h, v\)/.test(util), 'appendRow_ is unguarded');
            t.eq((util.match(/_textIfIdentifier_\(key, patch\[key\]\)/g) || []).length, 2,
                'both update paths must be guarded');
        });

        t.it('the estimate bulk write is guarded too', () => {
            // saveEstimates writes rows directly rather than through
            // appendRow_, so it bypasses the layer. An unguarded sowId
            // there stops matching its SOW item, and the next save
            // creates a SECOND group beside it — two identical scopes on
            // the Estimates tab after an import.
            t.ok(/_textIfIdentifier_\(h, v\)/.test(t.read('backend/07-EstimateService.gs')));
        });

        t.it('every SOW lookup keys on the normalised id', () => {
            // A sowId stored as the number 1.1 and one stored as "1.1"
            // are different keys. Every map that joins an estimate to a
            // scope must normalise, or the join silently fails.
            const files = ['backend/07-EstimateService.gs', 'backend/17-BillingService.gs',
                'backend/22-PortfolioService.gs', 'backend/05-ProjectService.gs'];
            const bad = [];
            files.forEach(f => {
                const src = t.read(f);
                if (/\[g\.sowId\]|\[row\.sowId\]|\[s\.id\](?!\s*=)/.test(
                    src.replace(/_cellKey_\([^)]*\)/g, 'KEY'))) bad.push(f);
            });
            t.ok(bad.length === 0, 'raw id used as a map key in: ' + bad.join(', '));
        });
        t.it('lookups normalise both sides', () => {
            t.ok(/_cellKey_\(values\[r\]\[cols\[c\]\.i\]\) !== _cellKey_/.test(util),
                'a bare String() comparison misses rows that are really there');
        });
        t.it('the repair is reachable from the UI', () => {
            // The function and the endpoint existed but nothing called
            // them — so the fix shipped and could not be run. A repair
            // with no button is a repair that does not exist.
            const sow = t.read('js/pages/project/project-sow.js');
            t.ok(/repairIds/.test(sow), 'no handler');
            t.ok(/_needsIdRepair/.test(sow), 'no detection');
            t.ok(/typeof s\.id === 'number'/.test(sow),
                'detection must key on the TYPE — JSON preserves it, so a converted ' +
                'id arrives as a number and needs no server round trip to spot');
        });

        t.it('a merged pair is shown, not swallowed by a toast', () => {
            const sow = t.read('js/pages/project/project-sow.js');
            t.ok(/_showCollisions/.test(sow),
                'a pair that needs renaming by hand has to be read and acted on');
        });

        t.it('there is a repair for ids already corrupted', () => {
            // Fixing the write only helps new rows. Every existing SOW
            // item was written as a bare string.
            const bulk = t.read('backend/36-SowBulkService.gs');
            t.ok(/function repairSowIds/.test(bulk));
            t.ok(/cannot be told apart/.test(bulk),
                'a merged pair must be REPORTED, not guessed at — guessing would ' +
                'reassign somebody\'s budget to the wrong scope');
        });
    });

    t.describe('a copied quotation appears in the register', () => {
        const dup = t.read('backend/34-DuplicateService.gs');
        t.it('it writes a Quotations row, not just a Projects row', () => {
            // The register reads the Quotations sheet. Writing only a
            // Projects row meant the copy was created correctly, stored
            // correctly, and never appeared anywhere.
            t.ok(/appendRow_\('Quotations'/.test(dup));
        });
        t.it('the quote number comes from the shared generator', () => {
            t.ok(/nextQuoteNumber_\(\)/.test(dup),
                'two routes must not produce two numbering schemes');
        });
        t.it('a duplicate number or project id is refused', () => {
            t.ok(/already exists/.test(dup));
            t.ok(/already in use/.test(dup));
        });
        t.it('the quoted value is NOT copied', () => {
            // A price carried over from another job is a number nobody
            // has decided, sitting in the register looking like one
            // somebody did.
            t.ok(/quotedValue: 0/.test(dup));
        });
        t.it('the modal exposes both ids', () => {
            const q = t.read('js/pages/quotations.js');
            t.ok(/dup-qno/.test(q) && /dup-pid/.test(q),
                'they were generated silently, so a copy that did not appear ' +
                'left no number to search for');
        });
    });

    t.describe('navigation', () => {
        const nav = t.read('js/core/nav.js');
        t.it('Settings is its own group and holds the print template', () => {
            t.ok(/id: 'settings'/.test(nav));
            const settings = nav.slice(nav.indexOf("id: 'settings'"));
            t.ok(/print-template/.test(settings));
        });
        t.it('Approvals no longer holds it', () => {
            const ap = nav.slice(nav.indexOf("id: 'approvals', label: 'Approvals'"),
                nav.indexOf("id: 'settings'"));
            t.ok(!/print-template/.test(ap));
        });
        t.it('Suppliers appears under Knowledge', () => {
            const kb = nav.slice(nav.indexOf("id: 'knowledge', label: 'Knowledge'"));
            t.ok(/tab: 'suppliers'/.test(kb));
        });
        t.it('signing out asks first, and is not an X', () => {
            // An X means "close this". People pressed it expecting to
            // dismiss something and were signed out instead.
            t.ok(/confirmLogout/.test(nav));
            t.ok(/Icon\.logout/.test(nav));
            t.ok(/function logout|logout\(o\)/.test(t.read('js/core/icons.js')));
        });
        t.it('the duplicate Knowledge tab bar is hidden', () => {
            t.ok(/\.kb-tabs \{ display: none/.test(t.read('css/pages/knowledge.css')),
                'two bars doing the same job makes people click the one that does not highlight');
        });
    });

    t.describe('QA/QC replaces the Punchlist tab', () => {
        const core = t.read('js/pages/project/project-core.js');
        const qa = t.read('js/pages/project/project-qaqc.js');
        const rep = t.read('js/pages/project/project-reports.js');

        t.it('the tab is QA/QC and punchlist sits inside it', () => {
            t.ok(/data-tab="qaqc"/.test(core));
            t.ok(!/data-tab="punchlist"/.test(core));
            t.ok(/id: 'punchlist'/.test(qa), 'the punchlist must not be lost');
        });
        t.it('inspections, NCRs and tests are sub-tabs', () => {
            ['inspection', 'ncr', 'test'].forEach(k =>
                t.ok(new RegExp("id: '" + k + "'").test(qa), k + ' missing'));
        });
        t.it('each has a report section', () => {
            // A quality report showing only the punchlist implies the
            // punchlist was all the quality control there was.
            ['inspections', 'ncrs', 'tests'].forEach(k =>
                t.ok(new RegExp("id: '" + k + "'").test(rep), k + ' has no report section'));
            t.ok(/_rsPunchlist/.test(rep), 'the punchlist report must survive');
        });
        t.it('an NCR cannot be closed without a disposition', () => {
            // Closing one with nothing recorded says a problem stopped
            // being tracked, not that it was resolved.
            t.ok(/Say how it was resolved before closing/.test(t.read('backend/41-QaqcService.gs')));
        });
    });
};
