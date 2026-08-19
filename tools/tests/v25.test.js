/**
 * v25.test.js — Concurrency, retries, and bulk deletion.
 *
 * ── THE BUG THIS BATCH IS ABOUT ─────────────────────────────
 *
 * Apps Script does not answer a POST directly. It replies with a 302 to
 * script.googleusercontent.com carrying a one-time token, and under
 * concurrency that redirect sometimes returns 404. The request was
 * fine; the answer was lost.
 *
 * Opening the dashboard fired five or six requests at once. Deleting a
 * project made it worse by holding the document lock for a minute while
 * every other request queued behind it — which is why it looked as
 * though the delete had broken something.
 *
 * The retry tests are the important ones, and specifically the ones
 * asserting that a WRITE is never retried.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const Q = new Function(t.read('js/core/request-queue.js') + '\nreturn RequestQueue;')();

    t.describe('at most two requests in flight', () => {
        t.it('eight queued requests peak at two', async () => {
            let inFlight = 0, peak = 0;
            const slow = () => new Promise(r => {
                inFlight++; peak = Math.max(peak, inFlight);
                setTimeout(() => { inFlight--; r('ok'); }, 20);
            });
            await Promise.all(Array.from({ length: 8 }, () => Q.run(slow, { retry: false })));
            t.eq(peak, 2,
                'one lane would make the app feel slower — a slow read would block a fast one');
        });
    });

    t.describe('a read is retried, a write is never', () => {
        t.it('a flaky read recovers', async () => {
            let tries = 0;
            const flaky = async () => {
                tries++;
                if (tries < 3) { const e = new Error('x'); e.httpStatus = 404; throw e; }
                return 'ok';
            };
            t.eq(await Q.run(flaky, { retry: true }), 'ok');
            t.eq(tries, 3);
        });

        t.it('a write is sent exactly once', async () => {
            // Apps Script may have RECEIVED and EXECUTED the request
            // before the answer was lost. Retrying can bill a client
            // twice or release the same cash twice — and the log would
            // show two deliberate actions, not a fault.
            let tries = 0;
            const w = async () => { tries++; const e = new Error('x'); e.httpStatus = 404; throw e; };
            try { await Q.run(w, { retry: false }); t.ok(false, 'it should have thrown'); }
            catch (e) { t.eq(tries, 1); }
        });

        t.it('a genuinely dead URL exhausts its retries and reports', async () => {
            let tries = 0;
            const dead = async () => { tries++; const e = new Error('x'); e.httpStatus = 404; throw e; };
            try { await Q.run(dead, { retry: true }); t.ok(false, 'should throw'); }
            catch (e) { t.eq(tries, 3, 'a wrong URL must not retry forever'); }
        });

        t.it('a permission error is not retried', async () => {
            let tries = 0;
            const denied = async () => { tries++; const e = new Error('no'); e.httpStatus = 403; throw e; };
            try { await Q.run(denied, { retry: true }); t.ok(false, 'should throw'); }
            catch (e) { t.eq(tries, 1, 'a 403 will not fix itself'); }
        });
    });

    t.describe('which actions may be retried', () => {
        const ds = t.read('js/services/data-service.js');
        const isR = new Function(ds.match(/const READ_ONLY_RE[\s\S]*?^}/m)[0]
            .replace('const ', 'var ') + '\nreturn isRetryable_;')();

        ['getProjectData', 'getHomeData', 'searchCoverage', 'listDrafts', 'checkPrBudget']
            .forEach(a => t.it(a + ' is retryable', () => t.ok(isR(a))));

        ['createBilling', 'approveCashAdvance', 'deleteProject', 'receiveGoods',
         'paySupplierInvoice', 'markBillingPaid', 'saveEstimates', 'postComment',
         'repairSowIds'].forEach(a =>
            t.it(a + ' is NOT retryable', () => t.ok(!isR(a))));

        t.it('an unknown action defaults to not retryable', () =>
            t.ok(!isR('someActionAddedNextYear'),
                'the safe mistake is a read sent once, not a write sent twice'));
    });

    t.describe('deleting rows in blocks', () => {
        // deleteRow() one at a time is a round trip each. A project with
        // a few hundred daily records was hundreds of calls, holding the
        // document lock long enough that every other request in the app
        // queued behind it.
        const src = t.read('backend/03-SheetUtils.gs');
        const lines = src.split('\n');
        const a = lines.findIndex(l => l.trim() === 'var run = [];');
        let b = a;
        for (let k = a; k < lines.length; k++) {
            if (lines[k].includes('sh.deleteRows(run[run.length - 1], run.length);')) b = k;
            if (lines[k].trim() === 'return hits.length;') break;
        }
        const body = lines.slice(a, b + 1).join('\n');

        const simulate = (hits, total) => {
            const rows = Array.from({ length: total }, (_, i) => i + 1);
            const calls = [];
            const sh = { deleteRows: (start, n) => {
                calls.push([start, n]);
                rows.splice(rows.indexOf(start), n);
            } };
            new Function('hits', 'sh', body)(hits, sh);
            return { rows, calls };
        };

        t.it('a contiguous block is one call', () => {
            const r = simulate([3, 4, 5], 8);
            t.eq(r.calls.length, 1);
            t.eq(r.rows.join(), '1,2,6,7,8');
        });
        t.it('scattered rows are separate calls, and correct', () => {
            const r = simulate([2, 5, 9], 10);
            t.eq(r.rows.join(), '1,3,4,6,7,8,10');
        });
        t.it('blocks and singles mixed', () => {
            const r = simulate([2, 3, 4, 7, 9, 10], 12);
            t.eq(r.rows.join(), '1,5,6,8,11,12');
            t.ok(r.calls.length < 6, 'collapsed from 6 calls to ' + r.calls.length);
        });
        t.it('deleting every data row keeps the header', () => {
            // Losing row 1 would take the column names with it and break
            // every read of that sheet afterwards.
            const r = simulate([2, 3, 4, 5], 5);
            t.eq(r.rows.join(), '1');
        });
    });

    t.describe('needless concurrency was removed', () => {
        t.it('the calendar prefetches one month at a time, after a delay', () => {
            const cal = t.read('js/pages/calendar.js');
            t.ok(/_prefetching/.test(cal), 'no guard against overlapping prefetches');
            t.ok(/setTimeout\(async \(\) => \{/.test(cal),
                'a prefetch must never compete with something the person is waiting for');
        });
        t.it('the notification bell does not poll during page load', () =>
            t.ok(/setTimeout\(tick, 2500\)/.test(t.read('js/core/nav.js')),
                'an unread count is not urgent enough to slow the page down'));
    });
};
