/**
 * backend.test.js — Syntax, contracts, and the SOW tree maths.
 *
 * Apps Script files are not modules, so they are loaded into a sandbox
 * with a stub sheet layer. That is enough to exercise pure logic, which
 * is where the costly mistakes live.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function (t) {

    const beDir = path.join(t.ROOT, 'backend');
    const gs = fs.readdirSync(beDir).filter(f => f.endsWith('.gs')).sort();

    t.describe('every backend file parses', () => {
        gs.forEach(f => {
            t.it(f, () => {
                new vm.Script(fs.readFileSync(path.join(beDir, f), 'utf8'), { filename: f });
            });
        });
    });

    t.describe('every API endpoint resolves to a function', () => {
        const api = fs.readFileSync(path.join(beDir, '02-Api.gs'), 'utf8');
        const all = gs.map(f => fs.readFileSync(path.join(beDir, f), 'utf8')).join('\n');
        const names = [...api.matchAll(/^\s{2}([a-zA-Z_][\w]*):\s*([a-zA-Z_][\w]*),/gm)]
            .map(m => ({ key: m[1], fn: m[2] }));

        t.it('the map is not empty', () => t.ok(names.length > 50, 'only ' + names.length + ' endpoints found'));

        t.it('no endpoint points at a function that does not exist', () => {
            const missing = names.filter(n =>
                !new RegExp('function\\s+' + n.fn + '\\s*\\(').test(all));
            t.ok(missing.length === 0,
                'endpoints with no function: ' + missing.map(m => m.key).join(', '));
        });
    });

    // ── the SOW tree: the maths behind four screens ──────────
    t.describe('SOW tree', () => {
        const src = fs.readFileSync(path.join(beDir, '33-SowTree.gs'), 'utf8');
        const api = new Function(src + '\nreturn {buildSowTree_, sowIsChildOf_, sowNaturalKey_};')();
        const mk = (id, extra) => Object.assign({ id, description: id, budget: 0, actual: 0, progress: 0 }, extra || {});

        t.it('children follow their parent, depth first', () => {
            const r = api.buildSowTree_([mk('2'), mk('1.2', { budget: 1 }), mk('1'), mk('1.1', { budget: 1 }), mk('2.1', { budget: 1 })]);
            t.eq(r.map(x => x.id).join(' '), '1 1.1 1.2 2 2.1');
        });

        t.it('1.2 sorts before 1.10', () => {
            t.ok(api.sowNaturalKey_('1.2') < api.sowNaturalKey_('1.10'),
                'plain string sorting puts 1.10 first, which reads as a bug');
        });

        t.it('a PRICED item is never turned into a heading by gaining children', () => {
            const r = api.buildSowTree_([
                mk('1', { budget: 450000, estimateTotal: 440000 }),
                mk('1.1', { budget: 120000 })]);
            t.ok(!r[0].isHeading, 'its estimate would vanish from the Estimates tab');
        });

        t.it('a flagged title is a heading before it has any children', () => {
            const r = api.buildSowTree_([mk('3', { isTitle: 'TRUE' })]);
            t.ok(r[0].isHeading, 'otherwise the Timeline reports "setup incomplete"');
        });

        t.it("a heading's own budget is added to the roll-up, not ignored", () => {
            const r = api.buildSowTree_([
                mk('5', { isTitle: 'TRUE', budget: 100000 }), mk('5.1', { budget: 40000 })]);
            t.eq(r[0].rollupBudget, 140000, 'money on a parent row would be silently lost');
        });

        t.it('progress is weighted by budget, not averaged', () => {
            const r = api.buildSowTree_([mk('9'),
                mk('9.1', { budget: 980000, progress: 0 }),
                mk('9.2', { budget: 50000, progress: 100 }),
                mk('9.3', { budget: 50000, progress: 100 })]);
            t.ok(r[0].rollupProgress < 15,
                'a plain average would report 67% on a job that has barely started');
        });

        t.it('trailing dots and stray whitespace still form a tree', () => {
            const r = api.buildSowTree_([mk('1.'), mk('1.3.', { budget: 5000 })]);
            t.ok(r[0].isHeading, 'ids like "1.3." are real in this data');
        });

        t.it('an empty list does not throw', () => t.eq(api.buildSowTree_([]).length, 0));
    });

    // ── accrual: the highest-risk maths in the system ────────
    t.describe('cost basis', () => {
        const SHEETS = { CashRelease: [], Liquidations: [], Settings: [] };
        const harness = `
            var _e = {CashRelease:1, Liquidations:1, Settings:1};
            function ss_(){ return { getSheetByName: n => _e[n] ? {} : null }; }
            function readAll_(n){ return (SHEETS[n]||[]).map(r => Object.assign({}, r)); }
            function readMany_(){}
            function low_(v){ return String(v||'').toLowerCase(); }
            function getSetting_(k){ const r=(SHEETS.Settings||[]).find(x=>x.key===k); return r?r.value:null; }
        `;
        const src = fs.readFileSync(path.join(beDir, '30-CostBasis.gs'), 'utf8');
        const api = new Function('SHEETS', harness + src +
            '\nreturn {sowActualCost_, projectActualCost_, splitVat_};')(SHEETS);

        SHEETS.CashRelease.push(
            { id: 'R1', originalRequestId: 'CA1', projectId: 'P', sowId: 'B.2', status: 'Reviewed', amount: 50000 });
        SHEETS.Liquidations.push(
            { id: 'L1', cashAdvanceId: 'CA1', projectId: 'P', status: 'approved', amount: 30000 });

        t.it('an unliquidated advance still counts, so no figure drops', () => {
            t.eq(api.sowActualCost_('P', 'B.2'), 50000,
                'switching to accrual must never make a reported cost fall');
        });

        t.it('a top-up liquidated beyond the release is counted in full', () => {
            SHEETS.Liquidations.push({ id: 'L2', cashAdvanceId: 'CA1', projectId: 'P', status: 'approved', amount: 25000 });
            t.eq(api.sowActualCost_('P', 'B.2'), 55000);
            SHEETS.Liquidations.pop();
        });

        t.it('VAT-inclusive 1,120 splits to 1,000 net + 120', () => {
            const v = api.splitVat_(1120, true, true);
            t.eq(v.net, 1000); t.eq(v.vat, 120);
        });

        t.it('a non-VAT supplier has nothing to split', () => {
            t.eq(api.splitVat_(1000, true, false).vat, 0);
        });
    });

    // ── schema integrity ─────────────────────────────────────
    t.describe('schemas', () => {
        const sch = fs.readFileSync(path.join(beDir, '01-Schemas.gs'), 'utf8');
        t.it('every record sheet has an id column first', () => {
            // Sheets keyed on something else are listed explicitly rather
            // than the rule being loosened: Users are keyed by email,
            // Sessions by token, and the log sheets are append-only
            // journals with no identity of their own. Anything NEW that
            // wants an exception has to be added here on purpose.
            const KEYED_ELSEWHERE = ['Users', 'Sessions', 'LoginAttempts',
                'Approvals', 'ActivityLog', 'Settings'];
            const bad = [...sch.matchAll(/^\s{2}([A-Z][A-Za-z]+):\s*\[\s*'([^']+)'/gm)]
                .filter(m => m[2] !== 'id' && KEYED_ELSEWHERE.indexOf(m[1]) === -1)
                .map(m => m[1]);
            t.ok(bad.length === 0, 'sheets not starting with id: ' + bad.join(', '));
        });
        t.it('no sheet declares the same column twice', () => {
            const dupes = [];
            [...sch.matchAll(/^\s{2}([A-Z][A-Za-z]+):\s*\[([\s\S]*?)\],\s*$/gm)].forEach(m => {
                const cols = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
                const seen = {};
                cols.forEach(c => { if (seen[c]) dupes.push(m[1] + '.' + c); seen[c] = 1; });
            });
            t.ok(dupes.length === 0, 'duplicate columns: ' + dupes.join(', '));
        });
    });
};
