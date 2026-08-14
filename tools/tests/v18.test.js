/**
 * v18.test.js — The eight reported bugs.
 *
 * Four are arithmetic, and those are the ones worth guarding: a wrong
 * number does not look like a bug, it looks like a number.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const r2 = n => Math.round(n * 100) / 100;

    t.describe('billing works from the VAT-exclusive value', () => {
        // A ₱1,120,000 contract at 12% VAT is ₱1,000,000 of work plus
        // ₱120,000 of tax. Billing 30% against the gross charges VAT on
        // VAT: the progress amount already contains the tax, and then
        // output VAT is added on top of it again.
        const revised = 1120000, vatPct = 0.12;
        const net = revised / (1 + vatPct);

        t.it('a VAT-inclusive contract is converted to net', () =>
            t.eq(Math.round(net), 1000000));
        t.it('30% bills 300,000 rather than 336,000', () =>
            t.eq(r2(0.30 * net), 300000));
        t.it('retention is taken on the net accomplishment', () =>
            t.eq(r2(0.30 * net * 0.10), 30000));
        t.it('VAT is added back exactly once', () =>
            t.eq(r2(0.30 * net * vatPct), 36000));
        t.it('the amount due is 300,000 − 30,000 + 36,000', () =>
            t.eq(r2(0.30 * net - 0.30 * net * 0.10 + 0.30 * net * vatPct), 306000));

        t.it('the SWA reads the stored VAT rather than deriving its own', () => {
            const swa = t.read('js/pages/project/project-billings.js');
            t.ok(/b\.vatAmount/.test(swa),
                'deriving it separately is how the printed invoice and the books disagree');
        });
        t.it('the Prepared / Reviewed / Noted blocks are gone', () => {
            const swa = t.read('js/pages/project/project-billings.js');
            t.ok(swa.indexOf('<div class="line">Prepared by</div>') === -1,
                'blank lines invite a handwritten approval that matches nothing in the record');
        });
    });

    t.describe('downpayment recoups only what was received', () => {
        const SHEETS = { Projects: [], Billings: [] };
        const src = t.read('backend/17-BillingService.gs');
        const dp = new Function('SHEETS',
            'function readAll_(n){ return (SHEETS[n]||[]).map(r=>Object.assign({},r)); }\n' +
            'function low_(v){return String(v||"").toLowerCase();}\n' +
            src.match(/function dpLedger_[\s\S]*?\n}/)[0] + '\nreturn dpLedger_;')(SHEETS);

        SHEETS.Projects.push({ id: 'P1', downpaymentPct: 0.15 });
        SHEETS.Billings.push({ projectId: 'P1', billingType: 'Downpayment',
            status: 'Approved', grossAmount: 150000 });

        t.it('an approved but UNPAID advance is not recoupable', () => {
            // Approved means the invoice went out, not that money came
            // in. Deducting it bills the client less than they owe.
            t.eq(dp('P1').advance, 0);
            t.eq(dp('P1').pendingAdvance, 150000, 'it should show as pending, not vanish');
        });

        t.it('once paid it becomes recoupable', () => {
            SHEETS.Billings[0].status = 'Paid';
            t.eq(dp('P1').advance, 150000);
            t.eq(dp('P1').pendingAdvance, 0);
        });

        t.it('the first progress billing clears it', () => {
            SHEETS.Billings.push({ projectId: 'P1', billingType: 'Progress',
                status: 'Approved', dpRecoupment: 150000 });
            t.eq(dp('P1').outstanding, 0);
        });
    });

    t.describe('titles are not flagged as missing an estimate', () => {
        const buildSowTree_ = new Function(
            t.read('backend/33-SowTree.gs') + '\nreturn buildSowTree_;')();
        const sows = [
            { id: '1', description: 'General', budget: 0, actual: 0, progress: 0, isTitle: 'TRUE' },
            { id: '1.1', description: 'Mob', budget: 50000, actual: 0, progress: 0 },
            { id: '2', description: 'Earthworks', budget: 0, actual: 0, progress: 0 },
            { id: '2.1', description: 'Excavation', budget: 80000, actual: 0, progress: 0 }];
        const headings = buildSowTree_(sows).filter(x => x.isHeading).map(x => String(x.id));

        t.it('both titles are recognised', () => t.eq(headings.join(','), '1,2'));
        t.it('only priced items are checked for an estimate', () => {
            // A title has nothing to price. Counting one as unestimated
            // produced an alert that approving every real estimate could
            // not clear — the worst kind, one you learn to ignore.
            const checked = sows.filter(s => headings.indexOf(String(s.id)) === -1);
            t.eq(checked.length, 2);
        });
        t.it('the portfolio filters them out', () => {
            const p = t.read('backend/22-PortfolioService.gs');
            t.ok(/isHeading\[String\(s\.id\)\.trim\(\)\]/.test(p));
        });
    });

    t.describe('the daily record SOW picker', () => {
        t.it('hides finished items and carries the current percent', () => {
            const d = t.read('js/pages/project/project-daily.js');
            t.ok(/pct >= 100 && String\(s\.id\) !== String\(includeId/.test(d),
                'a list that keeps offering finished scopes only ever gets longer');
            t.ok(/data-pct=/.test(d), 'the current percent must ride along for the prefill');
            t.ok(/syncSowPct/.test(d));
        });
        t.it('an item being edited is kept even if finished', () => {
            const d = t.read('js/pages/project/project-daily.js');
            t.ok(/includeId/.test(d),
                'editing an old record must not silently lose its scope');
        });
        t.it('the progress map is populated from the payload', () => {
            t.ok(/_sowProgress/.test(t.read('js/pages/project/project-core.js')));
        });
    });

    t.describe('notifications keep what has been read', () => {
        const ds = t.read('backend/35-DiscussionService.gs');
        t.it('each item is marked read or unread', () => t.ok(/read: isRead/.test(ds)));
        t.it('the badge counts unread only', () => {
            // The badge answers "is there anything new"; the list answers
            // "what has been happening". Those are different questions.
            t.ok(ds.indexOf('if (!isRead) {') > -1);
        });
        t.it('the list has a window rather than growing forever', () =>
            t.ok(/NOTIFICATION_WINDOW_DAYS/.test(ds)));
        t.it('the panel distinguishes them visually', () =>
            t.ok(/is-read/.test(t.read('js/core/nav.js'))));
    });

    t.describe('buttons say what they are doing', () => {
        const Busy = new Function('document',
            t.read('js/core/busy.js') + '\nreturn Busy;')({});
        t.it('Save becomes Saving', () => t.eq(Busy._verb('Save Record'), 'Saving'));
        t.it('Approve becomes Approving', () => t.eq(Busy._verb('Approve'), 'Approving'));
        t.it('an unknown verb degrades to Working, never blank', () =>
            t.eq(Busy._verb('Frobnicate'), 'Working'));

        t.it('the login button shows progress and recovers on failure', () => {
            const auth = t.read('js/core/auth.js');
            t.ok(/Signing in/.test(auth));
            t.ok(/restore\(\)/.test(auth),
                'a button stuck busy after a failure looks like it is still trying');
        });
    });

    t.describe('billing end to end', () => {
        // The vatPct crash got through because the arithmetic was tested
        // in isolation and the FUNCTION was never called. This runs the
        // real createBilling against a real project.
        const SHEETS = { Projects: [], Billings: [], VariationOrders: [],
            SOWItems: [], Approvals: [], EstimateGroups: [] };

        const stripGate = src => {
            const i = src.indexOf('function assertContractReady_');
            if (i < 0) return src;
            let d = 0, j = src.indexOf('{', i);
            const start = j;
            for (; j < src.length; j++) {
                if (src[j] === '{') d++;
                else if (src[j] === '}') { d--; if (d === 0) break; }
            }
            return src.slice(0, start) + '{ return; }' + src.slice(j + 1);
        };

        const harness = `
            function readAll_(n){ return (SHEETS[n]||[]).map(r=>Object.assign({},r)); }
            function readMany_(){} function ensureSheet_(){}
            function ss_(){ return {getSheetByName:n=>SHEETS[n]?{}:null}; }
            function appendRow_(n,row){ (SHEETS[n]=SHEETS[n]||[]).push(Object.assign({},row)); }
            function updateRow_(n,k,v,p){ (SHEETS[n]||[]).forEach(r=>{ if(String(r[k])===String(v)) Object.assign(r,p); }); }
            var _s=0; function nextId_(p){return p+'-'+(++_s);}
            function currentUserEmail_(){return 'd@f.ph';} function currentUserName_(){return 'D';}
            function currentUserRole_(){return 'superadmin';}
            function requireLogin_(){} function assertProjectEditor_(){}
            function logActivity_(){} function low_(v){return String(v||'').toLowerCase();}
            function fmtMoney_(n){return String(n);} function fmtDate_(v){return String(v).slice(0,10);}
            function safeParse_(s,f){try{return JSON.parse(s);}catch(e){return f;}}
            function sanitizeDatesDeep_(v){return v;}
            var Utilities={formatDate:()=>'Aug 2026'};
            var Session={getScriptTimeZone:()=>'Asia/Manila'};
            function revisedContractValue_(id,proj){ return parseFloat(proj.contractValue)||0; }
            function autoApproveIfSuper_(){return false;} function notifyApprovers_(){}
            function buildSowTree_(r){ return (r||[]).map(x=>Object.assign({isHeading:false},x)); }
            function computeSOWProgress_(){ return 0; } function groupTotal_(){ return 1000000; }
        `;
        const api = new Function('SHEETS', harness +
            stripGate(t.read('backend/17-BillingService.gs')) +
            '\nreturn {createDownpaymentBilling, createBilling, dpLedger_};')(SHEETS);

        // ₱1,120,000 VAT-inclusive = ₱1,000,000 of work + ₱120,000 tax
        SHEETS.Projects.push({ id: 'P1', contractValue: 1120000,
            retentionPct: 0.10, downpaymentPct: 0.15 });
        SHEETS.SOWItems.push({ id: '1', projectId: 'P1', budget: 1000000 });
        SHEETS.EstimateGroups.push({ id: 'EG1', projectId: 'P1', sowId: '1', status: 'approved' });

        t.it('a downpayment generates', () => {
            api.createDownpaymentBilling('P1', 'Aug 2026');
            const dp = SHEETS.Billings.find(b => b.billingType === 'Downpayment');
            t.eq(dp.grossAmount, 168000, '15% of the VAT-inclusive contract');
        });

        t.it('a progress billing generates — this was the vatPct crash', () => {
            SHEETS.Billings.find(b => b.billingType === 'Downpayment').status = 'Approved';
            api.createBilling('P1', 30, 'Aug 2026');
            const pb = SHEETS.Billings.find(b => b.billingNo === 'PB-0001');
            t.ok(!!pb, 'no billing was created');
            t.eq(pb.grossAmount, 300000, '30% of the NET, not of the gross');
            t.eq(pb.vatAmount, 36000);
            t.eq(pb.retentionAmount, 30000);
            t.eq(pb.dpRecoupment || 0, 0, 'an unpaid advance must not be recouped');
            t.eq(pb.netAmount, 306000);
        });

        t.it('recoupment lands on the first billing after the DP is paid', () => {
            SHEETS.Billings.find(b => b.billingType === 'Downpayment').status = 'Paid';
            api.createBilling('P1', 50, 'Sep 2026');
            const pb2 = SHEETS.Billings.find(b => b.billingNo === 'PB-0002');
            t.eq(pb2.dpRecoupment, 168000, 'the whole advance, at once');
            t.eq(pb2.netAmount, 36000, '200,000 − 20,000 + 24,000 − 168,000');
            t.ok(pb2.netAmount > 0, 'never negative — that would be a credit note');
        });

        t.it('a large advance against a small billing cannot go negative', () => {
            SHEETS.Projects.push({ id: 'P2', contractValue: 1120000,
                retentionPct: 0.10, downpaymentPct: 0.30 });
            SHEETS.SOWItems.push({ id: '1', projectId: 'P2', budget: 1000000 });
            api.createDownpaymentBilling('P2', 'Aug 2026');
            SHEETS.Billings.find(b => b.projectId === 'P2' &&
                b.billingType === 'Downpayment').status = 'Paid';
            api.createBilling('P2', 5, 'Aug 2026');
            const small = SHEETS.Billings.filter(b => b.projectId === 'P2' &&
                b.billingType !== 'Downpayment')[0];
            t.ok(small.netAmount >= 0);
            t.ok(api.dpLedger_('P2').outstanding > 0, 'the remainder must carry forward');
        });

        t.it('a non-VAT project bills with no VAT at all', () => {
            SHEETS.Projects.push({ id: 'P3', contractValue: 1000000,
                retentionPct: 0.10, downpaymentPct: 0, vatRegistered: 'FALSE' });
            SHEETS.SOWItems.push({ id: '1', projectId: 'P3', budget: 1000000 });
            api.createBilling('P3', 10, 'Aug 2026');
            const nv = SHEETS.Billings.filter(b => b.projectId === 'P3')[0];
            t.eq(nv.grossAmount, 100000);
            t.eq(nv.vatAmount, 0);
            t.eq(nv.netAmount, 90000);
        });

        t.it('the revise path uses the same basis as the original', () => {
            const src = t.read('backend/17-BillingService.gs');
            const rev = src.slice(src.indexOf('function reviseBilling'));
            t.ok(/contractNet/.test(rev),
                'a revised billing coming out higher than the one it replaced ' +
                'would be inexplicable to anyone reading it');
        });
    });

    t.describe('the task picker and calendar', () => {
        t.it('there is a real endpoint for assignable users', () => {
            // The modal read getHomeData().users, which does not exist —
            // so the picker was empty and nothing could be assigned.
            const src = t.read('backend/39-TaskService.gs');
            t.ok(/function getAssignableUsers/.test(src));
            t.ok(/name: u\.name \|\| u\.email/.test(src),
                'a picker shows names; an email makes you translate before choosing');
        });
        t.it('inactive users are excluded', () => {
            const src = t.read('backend/39-TaskService.gs');
            t.ok(/!== 'inactive'/.test(src),
                'an inactive account cannot log in, so the task would never be seen');
        });
        t.it('the calendar caches months and prefetches neighbours', () => {
            const cal = t.read('js/pages/calendar.js');
            t.ok(/_months\[/.test(cal));
            t.ok(/_prefetch/.test(cal),
                'almost every use of a calendar is a step to the month either side');
        });
        t.it('a write clears the cached month', () => {
            const cal = t.read('js/pages/calendar.js');
            t.ok(/delete this\._months\[this\._month\]/.test(cal),
                'otherwise you complete a task and it still shows as open');
        });
        t.it('the assignee sees their tasks above the grid', () => {
            const cal = t.read('js/pages/calendar.js');
            t.ok(/_mineHtml/.test(cal));
            t.ok(/t\.isMine && t\.status === 'open'/.test(cal));
        });
    });

    t.describe('tasks', () => {
        const src = t.read('backend/39-TaskService.gs');
        t.it('proof is enforced on the server', () => {
            // A client-side check is a courtesy. This is the rule.
            t.ok(/needs a photo or file as proof/.test(src));
            t.ok(/needs a note saying what was done/.test(src));
        });
        t.it('a completed task cannot be deleted', () =>
            t.ok(/A completed task is a record/.test(src)));
        t.it('reopening keeps the earlier proof', () => {
            t.ok(!/proofUrl: ''[\s\S]{0,200}reopenedAt: new Date/.test(src),
                'clearing it would leave a record showing only the attempt that worked');
        });
        t.it('assigning to a non-user is refused', () =>
            t.ok(/that email is not a user/.test(src)));
        t.it('assigning to an inactive user is refused', () =>
            t.ok(/would never see this task/.test(src)));
    });
};
