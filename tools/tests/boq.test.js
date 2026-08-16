/**
 * boq.test.js — Importing a bill of quantities from an indented outline.
 *
 * Indentation is the syntax, so most of these are about the ways a paste
 * goes wrong: a tab where spaces were expected, a leaf with no quantity,
 * an accidental double indent that would silently reparent an item.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const SHEETS = { SOWItems: [], EstimateGroups: [], Projects: [] };
    const harness = `
        function readAll_(n){ return (SHEETS[n]||[]).map(r=>Object.assign({},r)); }
        function appendRow_(n,row){ (SHEETS[n]=SHEETS[n]||[]).push(Object.assign({},row)); }
        function updateRowWhere_(n,m,p){ (SHEETS[n]||[]).forEach(r=>{ if(Object.keys(m).every(k=>String(r[k])===String(m[k]))) Object.assign(r,p); }); }
        var _s=0; function nextId_(p){return p+'-'+(++_s);}
        function requireLogin_(){} function assertProjectEditor_(){} function logActivity_(){}
        // v19: imported items are now given a real one-day schedule, so
        // the service needs the date helpers.
        function buildSowTree_(r){ return (r||[]).map(x=>Object.assign({isHeading:false},x)); }
        var Utilities={formatDate:(d)=>{
            const m=new Date(d.getTime()+8*3600*1000);
            const p=n=>String(n).padStart(2,'0');
            return m.getUTCFullYear()+'-'+p(m.getUTCMonth()+1)+'-'+p(m.getUTCDate());
        }};
        var Session={getScriptTimeZone:()=>'Asia/Manila'};
    `;
    const api = new Function('SHEETS', harness +
        fs.readFileSync(path.join(t.ROOT, 'backend/36-SowBulkService.gs'), 'utf8') +
        '\nreturn {parseSowOutline_, previewSowOutline, addSOWItemsBulk, repairSowSchedules, _bulkStartDate_};')(SHEETS);

    t.describe('BOQ outline — structure', () => {
        const p = api.parseSowOutline_(
            'General Requirements\n' +
            '  Mobilization | 1 | lot\n' +
            '  Temporary facilities | 1 | lot\n' +
            'Earthworks\n' +
            '  Clearing | 12000 | sq.m\n' +
            '  Excavation\n' +
            '    Lagoon BF2 | 4200 | cu.m\n' +
            '    Lagoon NF2 | 5100 | cu.m');

        t.it('a clean outline parses without errors', () => t.eq(p.errors.length, 0));
        t.it('ids are generated from the indentation', () =>
            t.eq(p.rows.map(r => r.id).join(' '), '1 1.1 1.2 2 2.1 2.2 2.2.1 2.2.2'));

        const g = id => p.rows.find(r => r.id === id);
        t.it('a line with items under it is a title', () => t.ok(g('1').isTitle));
        t.it('a leaf is priced', () => t.ok(!g('1.1').isTitle));
        t.it('2.2 is indented AND a title — depth alone would get this wrong', () => {
            // "not indented = title" holds for two levels. Deriving from
            // children instead means it does not break at three.
            t.ok(g('2.2').isTitle);
            t.ok(!g('2.2.1').isTitle);
        });
        t.it('a title carries no quantity even if one was typed', () =>
            t.ok(g('1').qty === 0 && g('1').unit === ''));
    });

    t.describe('BOQ outline — bad input', () => {
        t.it('a leaf with no quantity is caught', () => {
            const p = api.parseSowOutline_('Earthworks\n  Excavation');
            t.ok(p.errors.some(e => /Needs a quantity/.test(e.message)));
        });
        t.it('a quantity with no unit is caught', () => {
            const p = api.parseSowOutline_('Earthworks\n  Excavation | 100');
            t.ok(p.errors.some(e => /Needs a unit/.test(e.message)));
        });
        t.it('a two-level jump is refused, not silently reparented', () => {
            const p = api.parseSowOutline_('Earthworks\n      Too deep | 1 | lot');
            t.ok(p.errors.some(e => /Indented too far/.test(e.message)),
                'a stray space would otherwise put the item under the wrong heading');
        });
        t.it('blank lines and comments are ignored', () => {
            t.eq(api.parseSowOutline_('A | 1 | lot\n\n\nB | 2 | lot').rows.length, 2);
            t.eq(api.parseSowOutline_('# note\nA | 1 | lot').rows.length, 1);
        });
        t.it('a tab counts as one level, and separates columns', () => {
            t.eq(api.parseSowOutline_('Head\n\tChild | 5 | pc').rows[1].id, '1.1');
            const r = api.parseSowOutline_('Head\n  Child\t|\t5\t|\tpc').rows[1];
            t.ok(r.qty === 5 && r.unit === 'pc', 'half a paste often comes from Excel');
        });
    });

    t.describe('BOQ import — writing', () => {
        const res = api.addSOWItemsBulk('P1',
            'General Requirements\n  Mobilization | 1 | lot\nEarthworks\n  Excavation | 4200 | cu.m');

        t.it('writes every row', () => t.eq(res.added, 4));
        t.it('splits titles from priced items', () =>
            t.ok(res.titles === 2 && res.priced === 2));
        t.it('creates estimate groups only for priced items', () => {
            t.eq(res.estimateGroups, 2);
            t.ok(!SHEETS.EstimateGroups.find(g => g.sowId === '1'),
                'a title with an estimate group is what put unapprovable drafts on the tab');
        });

        t.it('one bad line blocks the whole import', () => {
            const before = SHEETS.SOWItems.length;
            try { api.addSOWItemsBulk('P2', 'Head\n  No quantity here'); t.ok(false, 'it imported'); }
            catch (e) { t.ok(/need fixing/.test(e.message)); }
            t.eq(SHEETS.SOWItems.length, before,
                'a half-imported BOQ is worse than none — the gap only surfaces at billing');
        });

        t.it('existing ids are refused by default', () => {
            try {
                api.addSOWItemsBulk('P1', 'General Requirements\n  Mobilization | 2 | lot');
                t.ok(false, 'it overwrote silently');
            } catch (e) { t.ok(/already exist/.test(e.message)); }
        });

        t.it('replacing updates the description but NEVER the budget', () => {
            SHEETS.SOWItems.find(s => s.id === '1.1').budget = 180000;
            api.addSOWItemsBulk('P1', 'General Requirements\n  Revised | 2 | lot',
                { replaceExisting: true });
            const row = SHEETS.SOWItems.find(s => s.id === '1.1');
            t.eq(row.description, 'Revised');
            t.eq(row.budget, 180000,
                'an import that wiped a hand-set budget would be a very expensive convenience');
        });
    });

    t.describe('imported items are schedulable', () => {
        // Items were written with no start and no finish. On the Timeline
        // that is a BROKEN row, not an unscheduled one: the chain needs
        // two of start, duration and finish before it can derive the
        // third, so changing a duration did nothing at all.
        t.it('a priced item gets a real one-day window', () => {
            const rows = SHEETS.SOWItems.filter(s => s.isTitle !== 'TRUE');
            t.ok(rows.length > 0);
            t.ok(rows.every(r => !!r.startDate && !!r.endDate),
                'an item with no dates cannot compute a duration from anything');
        });
        t.it('a title gets none — its span comes from its children', () => {
            const titles = SHEETS.SOWItems.filter(s => s.isTitle === 'TRUE');
            t.ok(titles.every(r => !r.startDate));
        });
        t.it('the placeholder never lands on a weekend', () => {
            // A Sunday start shows a duration the site cannot work, and
            // every dependent date inherits the error.
            const d = new Date(api._bulkStartDate_('2026-08-15') + 'T00:00:00Z');
            t.ok(d.getUTCDay() !== 0 && d.getUTCDay() !== 6,
                'got ' + api._bulkStartDate_('2026-08-15'));
        });
        t.it('repair never overwrites a date somebody set', () => {
            SHEETS.SOWItems.push({ id: '9.9', projectId: 'PX', isTitle: '',
                startDate: '2026-03-01', endDate: '2026-03-10' });
            SHEETS.SOWItems.push({ id: '9.8', projectId: 'PX', isTitle: '',
                startDate: '', endDate: '' });
            SHEETS.Projects = [{ id: 'PX', startDate: '2026-09-01' }];
            const res = api.repairSowSchedules('PX');
            t.eq(res.fixed, 1, 'only the empty one');
            t.eq(SHEETS.SOWItems.find(s => s.id === '9.9').startDate, '2026-03-01',
                'a placeholder must never overwrite a decision');
        });
    });

    t.describe('BOQ preview', () => {
        t.it('reports collisions and the split before anything is written', () => {
            const pv = api.previewSowOutline('P1', 'General Requirements\n  Mobilization | 1 | lot');
            t.ok(pv.collisions > 0);
            t.ok(pv.titles === 1 && pv.priced === 1);
        });
    });

    t.describe('the Gantt frozen column', () => {
        const css = t.read('css/pages/gantt.css');

        t.it('only the SOW name is frozen, not the whole left pane', () => {
            // The pane was ~540px of sticky, so scrolling right left
            // almost no room for the bars and covered the chart.
            t.ok(/\.gt-cell-left \.gt-task\s*\{[^}]*position: sticky/.test(css),
                'the name column must stay while the detail columns scroll away');
            t.ok(!/\.gt-cell-left \{[^}]*position: sticky/.test(css),
                'the whole left pane must no longer be sticky');
        });

        t.it('the bar percentage passes BEHIND the name column', () => {
            // At z-index 2 the label tied with the frozen column and,
            // being later in the DOM, painted over the SOW name.
            const lbl = /\.gt-bar-lbl\s*\{([^}]*)\}/.exec(css)[1];
            const z = parseInt(/z-index:\s*(\d+)/.exec(lbl)[1], 10);
            const task = /\.gt-cell-left \.gt-task\s*\{([^}]*)\}/.exec(css)[1];
            const tz = parseInt(/z-index:\s*(\d+)/.exec(task)[1], 10);
            t.ok(z < tz, `bar label z-index ${z} must be below the name column's ${tz}`);
        });

        t.it('the header cell tracks the rows below it', () => {
            t.ok(/\.gt-head-left > div:first-child\s*\{[^}]*position: sticky/.test(css),
                '"SOW item" must stay above the names it labels');
        });
    });
};
