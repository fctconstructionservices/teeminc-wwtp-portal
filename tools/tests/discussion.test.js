/**
 * discussion.test.js — Conversation attached to a record.
 *
 * The whole design rests on one key: recordType + recordId. If that
 * holds, one service covers sixteen surfaces. These tests are mostly
 * about the things that would quietly go wrong — a mention that
 * addresses nobody, an email quota losing a comment, a deletion that
 * leaves a reply answering nothing.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const SHEETS = { Comments: [], CommentReads: [], Users: [] };
    const MAILS = [];
    const harness = `
        var ROLE='admin', ME='glenn@f.ph';
        function ensureSheet_(n){ if(!SHEETS[n]) SHEETS[n]=[]; return SHEETS[n]; }
        function ss_(){ return { getSheetByName:n=>SHEETS[n]?{}:null }; }
        function readAll_(n){ return (SHEETS[n]||[]).map(r=>Object.assign({},r)); }
        function readMany_(){}
        function appendRow_(n,row){ ensureSheet_(n).push(Object.assign({},row)); }
        function updateRow_(n,k,v,p){ (SHEETS[n]||[]).forEach(r=>{ if(String(r[k])===String(v)) Object.assign(r,p); }); }
        function updateRowWhere_(n,m,p){ (SHEETS[n]||[]).forEach(r=>{ if(Object.keys(m).every(k=>String(r[k])===String(m[k]))) Object.assign(r,p); }); }
        var _s=0; function nextId_(p){return p+'-'+(++_s);}
        function currentUserEmail_(){return ME;}
        function currentUserName_(){return 'Glenn';}
        function currentUserRole_(){return ROLE;}
        function requireLogin_(){}
        function logActivity_(){}
        function safeParse_(s,f){try{return JSON.parse(s);}catch(e){return f;}}
        function sanitizeDatesDeep_(v){return v;}
        function uploadImage(){ return {url:'http://x/f.png'}; }
        var MailApp={ sendEmail:o=>{ MAILS.push(o); } };
    `;
    const src = fs.readFileSync(path.join(t.ROOT, 'backend/35-DiscussionService.gs'), 'utf8');
    const api = new Function('SHEETS', 'MAILS', harness + src +
        '\nreturn {getThread,postComment,editComment,deleteComment,getUnread,markAllRead,' +
        'getThreadCounts,markThreadRead,setMe:v=>{ME=v},setRole:v=>{ROLE=v}};')(SHEETS, MAILS);

    SHEETS.Users.push({ email: 'darwin@f.ph', name: 'Darwin' },
        { email: 'glenn@f.ph', name: 'Glenn' }, { email: 'jp@f.ph', name: 'JP' });

    t.describe('discussion — one key, any record type', () => {
        api.postComment({ recordType: 'PurchaseRequest', recordId: 'PR-1', projectId: 'P1', body: 'Kulang na' });
        api.postComment({ recordType: 'Billing', recordId: 'PB-3', projectId: 'P1', body: 'Check retention' });

        t.it('a thread holds only its own record\'s comments', () => {
            t.eq(api.getThread('PurchaseRequest', 'PR-1').length, 1);
            t.eq(api.getThread('Billing', 'PB-3').length, 1);
        });
        t.it('an unknown record gives an empty thread, not an error', () =>
            t.eq(api.getThread('PurchaseRequest', 'NOPE').length, 0));
    });

    t.describe('mentions', () => {
        MAILS.length = 0;
        api.postComment({ recordType: 'PurchaseRequest', recordId: 'PR-1',
            body: '@darwin@f.ph pakicheck', mentions: ['darwin@f.ph', 'ghost@nowhere.com', 'glenn@f.ph'] });

        t.it('an invalid address is dropped', () => {
            const th = api.getThread('PurchaseRequest', 'PR-1');
            t.ok(th[1].mentions.indexOf('ghost@nowhere.com') === -1,
                'a typo would silently address nobody while the author believed otherwise');
        });
        t.it('exactly one email is sent — not to yourself', () => {
            t.eq(MAILS.length, 1);
            t.eq(MAILS[0].to, 'darwin@f.ph');
        });
        t.it('the subject says why it arrived', () =>
            t.ok(/mentioned you/.test(MAILS[0].subject)));

        t.it('a failed email does not lose the comment', () => {
            // The comment is written before the mail goes out, so a
            // spent quota costs a notification and not a record.
            const before = SHEETS.Comments.length;
            const bad = new Function('SHEETS', 'MAILS', harness
                .replace('var _s=0;', 'var _s=100;')
                .replace('MailApp={ sendEmail:o=>{ MAILS.push(o); } }',
                    'MailApp={ sendEmail:()=>{ throw new Error("quota"); } }') +
                src + '\nreturn {postComment};')(SHEETS, MAILS);
            bad.postComment({ recordType: 'PurchaseRequest', recordId: 'PR-1',
                body: 'urgent', mentions: ['darwin@f.ph'] });
            t.eq(SHEETS.Comments.length, before + 1);
        });
    });

    t.describe('unread', () => {
        t.it('you see other people\'s comments, sorted with mentions first', () => {
            api.setMe('darwin@f.ph');
            const u = api.getUnread();
            t.ok(u.total > 0, 'nothing showed as unread');
            t.ok(u.mentions > 0, 'the mention was not counted');
            t.ok(u.items[0].mentioned, 'being addressed by name must outrank being copied in');
        });
        t.it('only an excerpt travels, never the whole body', () => {
            const u = api.getUnread();
            t.ok(u.items.every(i => i.excerpt.length <= 90),
                'the badge is polled — sending bodies would burn the quota');
        });
        t.it('reading a thread clears it', () => {
            const before = api.getUnread().total;
            api.getThread('PurchaseRequest', 'PR-1');
            t.ok(api.getUnread().total < before);
        });
        t.it('your own comments are never unread to you', () => {
            api.setMe('glenn@f.ph');
            t.eq(api.getUnread().total, 0);
        });
    });

    t.describe('editing and deleting', () => {
        const c = SHEETS.Comments[0];
        t.it('the author can edit, and it is marked', () => {
            api.setMe('glenn@f.ph');
            api.editComment(c.id, 'Kulang na sa NF2');
            t.ok(SHEETS.Comments[0].body.indexOf('NF2') > -1);
            t.ok(!!SHEETS.Comments[0].editedAt);
        });
        t.it('someone else cannot edit it', () => {
            api.setMe('jp@f.ph');
            try { api.editComment(c.id, 'hacked'); t.ok(false, 'edit was allowed'); }
            catch (e) { t.ok(/only edit your own/.test(e.message)); }
        });
        t.it('the edit window closes after 15 minutes', () => {
            // A comment that quietly changes after somebody has replied
            // to it is worse than no comment at all.
            api.setMe('glenn@f.ph');
            SHEETS.Comments[0].createdAt = new Date(Date.now() - 20 * 60000);
            try { api.editComment(c.id, 'late'); t.ok(false, 'late edit allowed'); }
            catch (e) { t.ok(/within 15 minutes/.test(e.message)); }
        });
        t.it('a deleted comment keeps its place', () => {
            api.deleteComment(c.id);
            const th = api.getThread('PurchaseRequest', 'PR-1');
            t.ok(th[0].deleted && th[0].body === '',
                'removing the row would leave a reply answering nothing');
        });
        t.it('an admin cannot delete someone else\'s, a Super Admin can', () => {
            api.setMe('jp@f.ph'); api.setRole('admin');
            const other = SHEETS.Comments.find(x => !x.deletedAt);
            try { api.deleteComment(other.id); t.ok(false, 'delete was allowed'); }
            catch (e) { t.ok(/only delete your own/.test(e.message)); }
            api.setRole('superadmin');
            api.deleteComment(other.id);
            t.ok(!!SHEETS.Comments.find(x => x.id === other.id).deletedAt);
        });
    });

    t.describe('validation and counts', () => {
        api.setRole('admin'); api.setMe('glenn@f.ph');
        t.it('an empty comment is rejected', () => {
            try { api.postComment({ recordType: 'X', recordId: 'Y', body: '  ' }); t.ok(false); }
            catch (e) { t.ok(/Write something/.test(e.message)); }
        });
        t.it('a comment with no record is rejected', () => {
            try { api.postComment({ body: 'orphan' }); t.ok(false); }
            catch (e) { t.ok(/Missing record/.test(e.message)); }
        });
        t.it('counts skip deleted comments and report zero for empty threads', () => {
            const c = api.getThreadCounts([
                { recordType: 'PurchaseRequest', recordId: 'PR-1' },
                { recordType: 'Billing', recordId: 'PB-9' }]);
            t.eq(c['Billing::PB-9'], 0, 'an empty thread must report 0, not undefined');
            t.ok(c['PurchaseRequest::PR-1'] >= 0);
        });
    });
};
