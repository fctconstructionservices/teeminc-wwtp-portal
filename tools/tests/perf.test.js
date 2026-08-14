/**
 * perf.test.js — The caching and locking layer.
 *
 * The write-detection tests here guard a real bug: nineteen actions
 * that move money were falling through the old WRITE_ACTION_RE and
 * taking no document lock at all.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const api = t.read('backend/02-Api.gs');
    const isWrite = new Function(
        api.match(/const READ_ACTION_RE[\s\S]*?^}/m)[0]
            .replace(/^const /, 'var ')
            .replace('const READ_ACTION_EXTRA', 'var READ_ACTION_EXTRA') +
        '\nreturn isWriteAction_;')();

    t.describe('write detection defaults to safe', () => {
        // These all move money and none of them took the lock before.
        ['receiveGoods', 'paySupplierInvoice', 'awardQuotation', 'cancelPurchaseRequest',
         'postComment', 'duplicateProject', 'archiveProject', 'deleteProject',
         'uploadImage', 'editComment', 'loseQuotation', 'recordSupplierInvoice',
         'cancelPurchaseOrder', 'cancelReceipt', 'cancelSupplierInvoice'].forEach(a => {
            t.it(a + ' is treated as a write', () => t.ok(isWrite(a),
                'without the lock, two people writing at once silently overwrite each other'));
        });

        ['getProjectData', 'getHomeData', 'searchCoverage', 'listDrafts',
         'previewSowOutline', 'checkPrBudget', 'whoAmI', 'duplicatePreview'].forEach(a => {
            t.it(a + ' is treated as a read', () => t.ok(!isWrite(a)));
        });

        t.it('an unknown action defaults to WRITE', () => {
            // A read misclassified as a write costs milliseconds. A write
            // misclassified as a read corrupts data. The default has to
            // be the cheap mistake.
            t.ok(isWrite('someActionAddedNextYear'));
        });
    });

    t.describe('batch range column letters', () => {
        const su = t.read('backend/03-SheetUtils.gs');
        const col = new Function(su.match(/function _colLetter_[\s\S]*?\n}/)[0] +
            '\nreturn _colLetter_;')();
        [[1, 'A'], [26, 'Z'], [27, 'AA'], [52, 'AZ'], [53, 'BA']].forEach(([n, e]) => {
            t.it(n + ' → ' + e, () => t.eq(col(n), e));
        });
        t.it('zero degrades to A rather than an empty range', () => t.eq(col(0), 'A'));
    });

    t.describe('client cache', () => {
        // A FRESH instance per test. Async test bodies start as soon as
        // they are called, so tests sharing one cache clear each other's
        // entries — and the failure looks like a bug in the cache rather
        // than in the test. A test that depends on other tests not
        // running is a test you cannot trust.
        const src = t.read('js/core/fast-cache.js');
        const mk = () => new Function(src + '\nreturn FastCache;')();
        const FC = mk();

        t.it('reads are cacheable, writes are not', () => {
            t.ok(FC.CACHEABLE.getProjectDataCached);
            t.ok(!FC.CACHEABLE.approveCashAdvance, 'an approval must always hit the server');
            t.ok(!FC.CACHEABLE.postComment);
            t.ok(!FC.CACHEABLE.deleteProject);
        });

        t.it('serves from memory, then revalidates behind the screen', async () => {
            const FC = mk();
            let calls = 0;
            const f = async () => { calls++; return { n: calls }; };
            const a = await FC.wrap('getProjectDataCached', ['P1'], f);
            t.eq(a.n, 1);
            const b = await FC.wrap('getProjectDataCached', ['P1'], f);
            t.eq(b.n, 1, 'the second call must not wait on the network');
            for (let i = 0; i < 50 && calls < 2; i++) await new Promise(r => setTimeout(r, 5));
            t.eq(calls, 2, 'but a refresh must still have run');
        });

        t.it('a different project is a different entry', async () => {
            const FC = mk();
            let calls = 0;
            const f = async () => { calls++; return { n: calls }; };
            FC.clear();
            await FC.wrap('getProjectDataCached', ['P1'], f);
            await FC.wrap('getProjectDataCached', ['P2'], f);
            t.eq(calls, 2, 'sharing an entry would show one project as another');
        });

        t.it('clearing forces a fetch — you never see your own change missing', async () => {
            const FC = mk();
            let calls = 0;
            const f = async () => { calls++; return { n: calls }; };
            FC.clear();
            await FC.wrap('getProjectDataCached', ['P9'], f);
            FC.clear();
            await FC.wrap('getProjectDataCached', ['P9'], f);
            t.eq(calls, 2);
        });

        t.it('identical data does not redraw', async () => {
            const FC = mk();
            // Repainting throws away scroll position and any open row.
            // People notice that more than they notice a stale figure.
            let redraws = 0;
            const same = async () => ({ v: 1 });
            FC.clear();
            await FC.wrap('getProjectDataCached', ['P3'], same, () => redraws++);
            await FC.wrap('getProjectDataCached', ['P3'], same, () => redraws++);
            for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 5));
            t.eq(redraws, 0);
        });

        t.it('changed data does redraw', async () => {
            const FC = mk();
            let redraws = 0, v = 0;
            const changing = async () => ({ v: ++v });
            FC.clear();
            await FC.wrap('getProjectDataCached', ['P4'], changing, () => redraws++);
            await FC.wrap('getProjectDataCached', ['P4'], changing, () => redraws++);
            // The revalidate is fire-and-forget, so this polls rather
            // than guessing a delay — a fixed wait passes on a quiet
            // machine and fails on a busy one.
            for (let i = 0; i < 50 && redraws === 0; i++) await new Promise(r => setTimeout(r, 5));
            t.eq(redraws, 1);
        });
    });

    t.describe('cache safety', () => {
        const cl = t.read('backend/38-CacheLayer.gs');
        t.it('invalidation lives in the dispatcher, not in write functions', () => {
            const dispatcher = t.read('backend/02-Api.gs');
            t.ok(/invalidateProjectCache_\(\)/.test(dispatcher),
                'forty write paths each remembering to invalidate is forty chances to forget');
        });
        t.it('the cache has a version stamp', () => {
            t.ok(/CACHE_VERSION/.test(cl),
                'without one, changing a payload shape serves the old shape to warm caches');
        });
        t.it('entries expire even if invalidation is missed', () => {
            const ttl = parseInt(/CACHE_TTL = (\d+)/.exec(cl)[1], 10);
            t.ok(ttl > 0 && ttl <= 900,
                'a long TTL means a missed invalidation lasts; this is the backstop');
        });
    });
};
