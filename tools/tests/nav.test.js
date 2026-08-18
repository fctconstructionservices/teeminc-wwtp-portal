/**
 * nav.test.js — The shell: groups, highlighting, and who sees what.
 *
 * The grouping is the first thing a person meets, and a page in the
 * wrong group is a page they will not find. These run against the real
 * Nav module with a stub DOM.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const el = () => {
        const o = { innerHTML: '', hidden: false, classList: { add() {}, remove() {}, toggle() {} },
            querySelectorAll: () => [], addEventListener() {} };
        o.querySelector = () => o;
        return o;
    };
    const host = el();
    // v14: the bell registers a visibilitychange listener and starts a
    // poll timer, so the stub has to provide both — otherwise rendering
    // the shell throws before a single assertion runs.
    const document = { getElementById: id => (id === 'appNav' ? host : el()),
        querySelector: () => el(), querySelectorAll: () => [], createElement: el,
        body: { appendChild() {} }, addEventListener() {}, hidden: false };
    const setInterval = () => 0;
    const DataService = { getUnread: async () => ({ total: 0, mentions: 0, items: [] }) };
    const Icon = new Proxy({}, { get: () => () => '' });
    let USER = { email: 'd@f.ph', name: 'Darwin', role: 'superadmin' };
    const App = { getUser: () => USER, navigate() {}, toggleTheme() {}, logout() {} };
    const PrintDoc = { _tpl: { logoUrl: '' }, load: async () => {} };
    const KnowledgeBasePage = { _tab: 'materials', switchTab() {} };

    const N = new Function('document', 'Icon', 'App', 'PrintDoc', 'KnowledgeBasePage',
        'setInterval', 'DataService',
        fs.readFileSync(path.join(t.ROOT, 'js/core/nav.js'), 'utf8') + '\nreturn Nav;')
        (document, Icon, App, PrintDoc, KnowledgeBasePage, setInterval, DataService);

    t.describe('navigation groups', () => {
        t.it('the seven groups are Projects, Finance, Procurement, Commercial, Knowledge, Approvals, Settings', () => {
            t.eq(N.GROUPS.map(g => g.label).join(' · '),
                'Projects · Finance · Procurement · Commercial · Knowledge · Approvals · Settings');
        });

        const lands = [['finance', 'finance'], ['request', 'finance'], ['payables', 'finance'],
            ['liquidate', 'finance'], ['record-cash', 'finance'], ['release-cash', 'finance'],
            ['purchase-requests', 'procurement'], ['quotations', 'commercial'],
            ['approvals', 'approvals'], ['home', 'projects'], ['portfolio', 'projects'],
            ['search', 'knowledge'], ['print-template', 'settings']];
        lands.forEach(([page, group]) => {
            t.it(`${page} belongs to ${group}`, () => t.eq(N.groupOf(page), group));
        });

        t.it('Suppliers highlights Procurement, not Knowledge', () => {
            // The Knowledge Base is ONE page in TWO groups. Matching on the
            // page id alone always returns the first group found.
            t.eq(N.groupOf('knowledge', 'suppliers'), 'procurement');
        });
        t.it('Materials highlights Knowledge', () => {
            t.eq(N.groupOf('knowledge', 'materials'), 'knowledge');
        });

        t.it('every page in the bar has a section in index.html', () => {
            const html = t.read('index.html');
            const missing = [];
            N.GROUPS.forEach(g => g.pages.forEach(p => {
                if (html.indexOf('id="page-' + p.id + '"') === -1) missing.push(p.id);
            }));
            t.ok(missing.length === 0, 'nav points at pages that do not exist: ' + missing.join(', '));
        });
    });

    t.describe('the shell renders', () => {
        t.it('draws the bar and the current group\'s pages', () => {
            N.render('payables');
            t.ok(host.innerHTML.indexOf('Finance') > -1, 'the group is missing');
            t.ok(host.innerHTML.indexOf('Release cash') > -1, 'the sub-bar is missing');
        });

        t.it('a requester is not shown Commercial or Release cash', () => {
            USER = { email: 'x@f.ph', name: 'Site', role: 'request-only' };
            N.render('request');
            t.ok(host.innerHTML.indexOf('Commercial') === -1,
                'a requester has no business seeing margins on open bids');
            t.ok(host.innerHTML.indexOf('Release cash') === -1, 'Release cash leaked to a requester');
            t.ok(host.innerHTML.indexOf('Cash advance') > -1, 'but they must still get Cash advance');
        });

        t.it('there is no shell on the login screen', () => {
            USER = {};
            N.render('login');
            t.eq(host.hidden, true);
            USER = { email: 'd@f.ph', name: 'D', role: 'superadmin' };
        });
    });

    t.describe('the dashboard does not duplicate the bar', () => {
        t.it('"Start a Transaction" is gone from index.html', () => {
            // Look for the MARKUP, not the words — a comment explaining
            // why it was removed should not fail the test that removed it.
            const html = t.read('index.html');
            t.ok(!/<h2>\s*Start a Transaction\s*<\/h2>/.test(html),
                'the tile heading is still rendered');
            t.ok(!/<div class="tickets">/.test(html),
                'a second, partial copy of the navigation is two things to keep in step');
        });
    });
};
