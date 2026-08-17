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
