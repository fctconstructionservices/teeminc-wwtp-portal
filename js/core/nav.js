// ================================================================
//  core/nav.js — The grouped navigation shell (v12 CONTROL ROOM)
//
//  WHAT CHANGED AND WHY.
//
//  Every page used to render its own topbar, so the same brand block
//  and back button existed twenty-odd times and the person had no idea
//  what else the system contained until they returned home. There was
//  no sense of place: you were either on the home tiles or lost inside
//  one page.
//
//  This replaces all of that with ONE shell, rendered once:
//
//    · a top bar of six GROUPS, always visible
//    · a sub bar of the pages inside the current group
//    · a right rail on Home showing what is waiting for you
//
//  THE GROUPING IS BY WHAT THE WORK IS, not by which sheet it lives in.
//  "Money in" and "Money out" rather than one Finance bucket, because
//  everything here is finance — what a person needs at the moment they
//  are hunting for a page is which direction the money is going.
//
//  Page ids are unchanged, so every existing App.navigate() call, deep
//  link and button keeps working. This is a shell around the app, not a
//  rewrite of it.
// ================================================================

const Nav = {

    /**
     * GROUPS - the whole system, in the order it is used.
     *
     * `roles` omitted means everyone who can see the page at all. The
     * filtering still happens in App.navigate; this only decides what
     * is worth showing, so a request-only user is not given a bar full
     * of things that will refuse them.
     */
    /**
     * GROUPS - the six sections from the Control Room direction.
     *
     * Named for the DEPARTMENT the work belongs to, which is how people
     * already talk about it: "that's a procurement thing", "ask finance".
     * An earlier draft split money into "Money in" and "Money out";
     * that reads well on a nav bar but it is not how anybody refers to
     * the work, and a label you have to translate in your head is worse
     * than a familiar one.
     *
     * `roles` omitted means everyone who can reach the page at all. The
     * real gate is still App.navigate; this only decides what is worth
     * showing, so a request-only user is not handed a bar full of
     * things that will refuse them.
     */
    GROUPS: [
        {
            id: 'projects', label: 'Projects',
            pages: [
                { id: 'home', label: 'Dashboard' },
                { id: 'portfolio', label: 'Portfolio', roles: ['superadmin', 'admin', 'approver'] }
            ]
        },
        {
            id: 'finance', label: 'Finance',
            pages: [
                { id: 'finance', label: 'Overview', roles: ['superadmin', 'admin', 'approver'] },
                { id: 'request', label: 'Cash advance' },
                { id: 'liquidate', label: 'Liquidate' },
                { id: 'release-cash', label: 'Release cash', roles: ['superadmin'] },
                { id: 'record-cash', label: 'Record cash received', roles: ['superadmin', 'admin', 'approver'] },
                { id: 'payables', label: 'Payables', roles: ['superadmin', 'admin', 'approver'] }
            ]
        },
        {
            id: 'procurement', label: 'Procurement',
            pages: [
                { id: 'purchase-requests', label: 'Purchase requests' },
                { id: 'knowledge', label: 'Suppliers', tab: 'suppliers', roles: ['superadmin', 'admin', 'approver'] }
            ]
        },
        {
            id: 'commercial', label: 'Commercial',
            roles: ['superadmin', 'admin', 'approver'],
            pages: [{ id: 'quotations', label: 'Quotations' }]
        },
        {
            id: 'knowledge', label: 'Knowledge',
            pages: [
                { id: 'knowledge', label: 'Materials', tab: 'materials' },
                { id: 'knowledge', label: 'Tools & equipment', tab: 'equipment' },
                { id: 'knowledge', label: 'Manpower', tab: 'manpower' },
                { id: 'knowledge', label: 'Lessons learned', tab: 'lessons' },
                { id: 'search', label: 'Search records' }
            ]
        },
        {
            id: 'approvals', label: 'Approvals',
            pages: [
                { id: 'approvals', label: 'Approval Dashboard' },
                { id: 'print-template', label: 'Print template', roles: ['superadmin'] }
            ]
        }
    ],

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _allowed(entry, role) {
        return !entry.roles || entry.roles.indexOf(role) > -1;
    },

    /**
     * groupOf - which group a page belongs to, for highlighting.
     *
     * The Knowledge Base is ONE page that appears in two groups —
     * Suppliers under Procurement, Materials under Knowledge. Matching
     * on the page id alone would always return the first group found, so
     * opening Materials would light up Procurement. The tab is checked
     * first, and only then the page.
     */
    groupOf(pageId, tab) {
        if (tab) {
            for (const g of this.GROUPS) {
                if (g.pages.some(p => p.id === pageId && p.tab === tab)) return g.id;
            }
        }
        for (const g of this.GROUPS) {
            if (g.pages.some(p => p.id === pageId && !p.tab)) return g.id;
        }
        for (const g of this.GROUPS) {
            if (g.pages.some(p => p.id === pageId)) return g.id;
        }
        return null;
    },

    /**
     * render - draws the bar for the current page.
     * Called on every navigation; cheap, and it means the highlighted
     * group can never drift from where you actually are.
     */
    render(pageId, tab) {
        const host = document.getElementById('appNav');
        if (!host) return;

        const user = (typeof App !== 'undefined' && App.getUser && App.getUser()) || {};
        const role = user.role || '';
        const e = this._esc.bind(this);

        // Login and other chrome-free screens get no bar at all.
        if (!user.email || pageId === 'login') { host.innerHTML = ''; host.hidden = true; return; }
        host.hidden = false;

        const groups = this.GROUPS
            .filter(g => this._allowed(g, role))
            .map(g => ({ ...g, pages: g.pages.filter(p => this._allowed(p, role)) }))
            .filter(g => g.pages.length);

        // The active tab decides the group when a page lives in two.
        const activeTab = tab || (typeof KnowledgeBasePage !== 'undefined' && KnowledgeBasePage._tab) || '';
        const currentGroup = this.groupOf(pageId, activeTab) || (groups[0] && groups[0].id);
        const group = groups.find(g => g.id === currentGroup);

        // v12: the SAME logo the print template already uses. It is set
        // once, under Print template, and read here — uploading it in two
        // places is how the app and the letterhead end up different, and
        // a letterhead that does not match the app is the kind of detail
        // a client notices.
        const url = (typeof PrintDoc !== 'undefined' && PrintDoc._tpl && PrintDoc._tpl.logoUrl) || '';
        const logo = url
            ? `<img src="${e(url)}" alt="FCTC" onerror="this.replaceWith(document.createTextNode('F'))" />`
            : 'F';

        host.innerHTML = `
            <div class="nav-bar">
                <button class="nav-mark" onclick="App.navigate('home')" title="Dashboard">
                    <i>${logo}</i><span>FCTC</span>
                </button>
                <nav class="nav-groups" aria-label="Sections">
                    ${groups.map(g => `
                        <button class="${g.id === currentGroup ? 'cur' : ''}"
                                aria-current="${g.id === currentGroup ? 'page' : 'false'}"
                                onclick="Nav.goGroup('${e(g.id)}')">${e(g.label)}</button>`).join('')}
                </nav>
                <span class="nav-sp"></span>
                <button class="nav-icon" onclick="App.navigate('search')" title="Search records">${Icon.search({ size: 15 })}</button>
                <button class="nav-icon" onclick="App.toggleTheme()" title="Light or dark">${Icon.themeToggle({ size: 15 })}</button>
                <span class="nav-who">${e(user.name || user.email)}<em>${e(this._roleLabel(role))}</em></span>
                <button class="nav-icon" onclick="App.logout()" title="Sign out">${Icon.logout ? Icon.logout({ size: 15 }) : Icon.close({ size: 15 })}</button>
                <button class="nav-burger" onclick="Nav.toggleMobile()" aria-label="Menu">${Icon.menu({ size: 17 })}</button>
            </div>
            ${group ? `
            <div class="nav-sub" aria-label="${e(group.label)}">
                ${group.pages.map(p => `
                    <button class="${p.id === pageId && (!p.tab || p.tab === activeTab) ? 'cur' : ''}"
                            onclick="Nav.go('${e(p.id)}'${p.tab ? `,'${e(p.tab)}'` : ''})">${e(p.label)}</button>`).join('')}
            </div>` : ''}`;
    },

    _roleLabel(r) {
        return { superadmin: 'Super Admin', admin: 'Admin', approver: 'Approver',
                 'request-only': 'Requester' }[r] || r;
    },

    /** goGroup - opens a group at its first page. */
    goGroup(gid) {
        const user = (typeof App !== 'undefined' && App.getUser && App.getUser()) || {};
        const g = this.GROUPS.find(x => x.id === gid);
        if (!g) return;
        const first = g.pages.filter(p => this._allowed(p, user.role || ''))[0];
        if (first) this.go(first.id, first.tab);
    },

    go(pageId, tab) {
        this.closeMobile();
        App.navigate(pageId);
        // The Knowledge Base is one page with several tabs, so a nav
        // entry has to be able to land on a specific one.
        if (tab && typeof KnowledgeBasePage !== 'undefined' && KnowledgeBasePage.switchTab) {
            setTimeout(() => {
                KnowledgeBasePage.switchTab(tab);
                // Redraw so the bar follows the tab that was just opened.
                this.render(pageId, tab);
            }, 40);
        }
    },

    toggleMobile() {
        document.getElementById('appNav')?.classList.toggle('open');
    },
    closeMobile() {
        document.getElementById('appNav')?.classList.remove('open');
    }
};
