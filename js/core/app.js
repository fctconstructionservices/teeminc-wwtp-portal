// ================================================================
//  core/app.js — Application shell: routing, session, role checks
//
//  PURPOSE: The App singleton owns the current user (persisted in
//  localStorage under 'fctc_user'), page navigation, role gating
//  (release-cash = superadmin only, record-cash = approvers only),
//  the light/dark theme toggle, and the pending-approvals badge.
//
//  NOTE: navigate() delegates to each page module's load(); page
//  modules are attached to window by their own files under js/pages/.
// ================================================================

const App = {
    currentUser: null,
    _pendingCount: 0,

    init() {
        // v7.0: a stored profile is not a session — without a valid token
        // the server will reject everything, so require the token too and
        // re-confirm identity with the server (this also restores the
        // View As state after a refresh).
        // v7.0.1: a profile saved by the OLD login system has no token.
        // Clear it silently so the user simply sees the login page instead
        // of a confusing "session expired" error on first load.
        if (localStorage.getItem('fctc_user') && !getSessionToken()) {
            try { localStorage.removeItem('fctc_user'); } catch (_) {}
            this.currentUser = null;
        }

        const saved = localStorage.getItem('fctc_user');
        if (saved && getSessionToken()) {
            try {
                this.currentUser = JSON.parse(saved);
                if (this.currentUser && this.currentUser.loggedIn) {
                    this.updateUserBadges();
                    this.navigate('home');
                    this.refreshIdentity();
                    return;
                }
            } catch (_) {}
        }
        setSessionToken('');
        this.navigate('login');
        const theme = localStorage.getItem('fctc_theme') || 'light';
        if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    },

    async navigate(page) {
        // ─── RELEASE CASH: Super Admin only ──────────────────
        if (page === 'release-cash' && !this.isSuperAdmin()) {
            UI.toast('Access denied. Super Admin only.', 'error');
            if (page !== 'home') {
                setTimeout(() => this.navigate('home'), 800);
                return;
            }
        }

        // ─── KNOWLEDGE BASE: the three databases moved here ───
        // v11 BATCH F1: Materials, Equipment and Manpower are no longer
        // pages of their own. The old names still resolve, so existing
        // links, the home tiles, the search page's deep links and
        // anything a browser has cached keep working — they just land on
        // the Knowledge Base with the right tab open.
        const KB_ALIASES = { materials: 'materials', equipment: 'equipment', manpower: 'manpower' };
        if (KB_ALIASES[page]) {
            const tab = KB_ALIASES[page];
            page = 'knowledge';
            this._kbTab = tab;
        } else if (page === 'knowledge' || page === 'knowledge-base') {
            page = 'knowledge';
            if (!this._kbTab) this._kbTab = 'materials';
        }

        // ─── PRINT TEMPLATE: Super Admin only ─────────────────
        // This is the company's identity on documents that go to
        // clients, so it is guarded here and again on the server in
        // savePrintTemplate().
        if (page === 'print-template' && !this.isSuperAdmin()) {
            UI.toast('Access denied. Super Admin only.', 'error');
            setTimeout(() => this.navigate('home'), 800);
            return;
        }

        // ─── RECORD CASH: Approvers only ──────────────────────
        if (page === 'record-cash' && !this.isApprover()) {
            UI.toast('Access denied. Approvers only.', 'error');
            if (page !== 'home') {
                setTimeout(() => this.navigate('home'), 800);
                return;
            }
        }

        // v7.0.1: these hit the API, so they must not run without a
        // session — otherwise a stale localStorage profile (or the login
        // page itself) triggers calls that fail with "Session expired".
        if (getSessionToken()) {
            if (page === 'portfolio') {
                PortfolioPage.load();
            }
            if (page === 'request') {
                loadProjectsDropdown();
            }
            if (page === 'record-cash') {
                setTimeout(loadIncomingProjectsDropdown, 100);
            }
        }

        // v12: one shell for the whole app. Rendered on every navigation
        // so the highlighted group can never drift from where you are.
        if (typeof Nav !== 'undefined') Nav.render(page);

        // v28: the chat dock is part of the shell, so it is started once
        // and simply keeps running — its open threads, scroll position
        // and poll all survive moving between pages. The login screen is
        // the one place it must not appear.
        if (typeof ChatDock !== 'undefined') {
            if (page === 'login' || !this.currentUser) ChatDock.stop();
            else ChatDock.start();
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById('page-' + page);
        if (target) {
            target.classList.add('active');
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: false });
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
        
        if (page === 'home') await HomePage.load();
        if (page === 'finance') await FinancePage.load();
        // v11 BATCH F1: one call replaces three. KnowledgeBasePage loads
        // each database lazily on first open, so switching to it to read
        // a lesson no longer pulls three full catalogues over the wire.
        if (page === 'knowledge') await KnowledgeBasePage.load(this._kbTab || 'materials');
        if (page === 'quotations') await QuotationsPage.load();   // v11 BATCH F2
        if (page === 'purchase-requests') await PurchaseRequestsPage.load();   // v11 BATCH G1
        if (page === 'payables') await PayablesPage.load();   // v11 BATCH G2
        if (page === 'approvals') await ApprovalsPage.load();
        if (page === 'print-template') await PrintTemplatePage.load();
        if (page === 'release-cash') {
            setTimeout(loadReleaseDropdown, 100);
        }
        if (page === 'liquidate') {
            setTimeout(loadLiquidateDropdown, 100);   // v4: auto-list reviewed advances to liquidate
            setTimeout(loadLiquidationVendors, 120);  // v11 BATCH H3: supplier names + TIN
        }

        this.updateUserBadges();
        await this.updateApprovalBadge();

        document.querySelectorAll('.topbar .actions').forEach(el => el.classList.remove('open'));
    },


    // ══════════ v7.0: VIEW AS (impersonation) ══════════

    /**
     * Super Admin only. The target is stored on the SERVER session, never
     * in the browser — otherwise "who am I" would again be a value the
     * client controls, which is the exact hole this release closes.
     * Every action performed while viewing-as is logged as
     * "real@email (as target@email)", so the audit trail never loses the
     * real actor.
     */
    async openViewAs() {
        let users = [];
        try { users = await DataService.getViewAsUsers(); }
        catch (err) { UI.toast('' + err.message, 'error'); return; }

        const overlay = document.createElement('div');
        overlay.id = 'viewAsModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,33,.55);z-index:1200;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;max-width:420px;width:100%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:13px 18px;border-bottom:1px solid var(--line);background:var(--blueprint-tint);display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-family:'Oswald';font-size:13px;text-transform:uppercase;color:var(--blueprint);margin:0;">View As — Test Another User</h3>
                    <span style="cursor:pointer;color:var(--ink-soft);" onclick="document.getElementById('viewAsModal').remove()">${Icon.close({size:12})}</span>
                </div>
                <div style="padding:14px 18px;overflow:auto;">
                    <div style="font-size:11.5px;color:var(--ink-soft);margin-bottom:10px;line-height:1.5;">
                        You will see the system exactly as they do. Every action is still recorded under your real identity.
                    </div>
                    ${users.map(u => `
                        <button onclick="App.applyViewAs('${u.email}')" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;background:var(--surface);cursor:pointer;">
                            <span style="width:26px;height:26px;border-radius:50%;background:var(--blueprint);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-family:'Oswald';font-size:10px;">${(u.name || u.email).slice(0, 2).toUpperCase()}</span>
                            <span style="font-weight:600;font-size:12.5px;">${u.name || u.email}</span>
                            <span style="font-family:'IBM Plex Mono';font-size:10px;color:var(--ink-soft);margin-left:auto;border:1px solid var(--line);border-radius:4px;padding:1px 6px;">${u.role}</span>
                        </button>`).join('')}
                </div>
            </div>`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    },

    async applyViewAs(email) {
        try {
            await DataService.setViewAs(email);
            const m = document.getElementById('viewAsModal');
            if (m) m.remove();
            await this.refreshIdentity();
            UI.toast('Viewing as ' + email, 'success');
            this.navigate('home');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    async stopViewAs() {
        try {
            await DataService.setViewAs('');
            await this.refreshIdentity();
            UI.toast('Back to your own account.', 'success');
            this.navigate('home');
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    /** refreshIdentity - re-reads who the server thinks we are. */
    async refreshIdentity() {
        try {
            const me = await DataService.whoAmI();
            this.currentUser = me.user;
            localStorage.setItem('fctc_user', JSON.stringify(me.user));
            this._realUser = me.realUser;
            this._impersonating = me.impersonating;
            this.renderImpersonationBanner();
            this.updateUserBadges();
        } catch (err) { /* session handling covers this */ }
    },

    renderImpersonationBanner() {
        let bar = document.getElementById('impersonationBar');
        if (!this._impersonating) { if (bar) bar.remove(); return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'impersonationBar';
            bar.style.cssText = 'position:sticky;top:0;z-index:900;background:var(--amber);color:#1C2321;padding:7px 14px;font-size:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
            document.body.prepend(bar);
        }
        bar.innerHTML = `${Icon.eye({size:13})} <b>Viewing as ${(this.currentUser || {}).email || ''}</b>
            <span style="opacity:.8;">— this is not your own account (${(this._realUser || {}).email || ''}). All actions remain logged under your real identity.</span>
            <button onclick="App.stopViewAs()" style="margin-left:auto;background:#1C2321;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;">Stop</button>`;
    },

    logout() {
        // v7.0: revoke the session server-side, not just locally — a
        // token left valid on the server would still work if copied.
        try { DataService.logout(); } catch (e) {}
        // Stop the heartbeat before the token goes, or the poll keeps
        // firing against a revoked session and reports you as online.
        if (typeof ChatDock !== 'undefined') ChatDock.stop();
        setSessionToken('');
        localStorage.removeItem('fctc_user');
        this.currentUser = null;
        this.navigate('login');
        UI.toast('Logged out.', 'success');
    },

    toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('fctc_theme', next);
        UI.toast(next === 'dark' ? 'Dark mode' : 'Light mode', 'success');
    },

    getUser() {
        return this.currentUser;
    },

    hasRole(role) {
        if (!this.currentUser) return false;
        return this.currentUser.role === role;
    },

    isAdmin() {
        return this.hasRole('admin') || this.hasRole('superadmin');
    },

    isApprover() {
        return this.hasRole('approver') || this.hasRole('admin') || this.hasRole('superadmin');
    },

    // ✅ NEW: Check if user is Super Admin
    isSuperAdmin() {
        return this.hasRole('superadmin');
    },

    isRequestOnly() {
        return this.hasRole('request-only');
    },

    canApprove() {
        return this.isApprover() || this.isAdmin();
    },

    canSubmit() {
        return true;
    },

    updateUserBadges() {
        const user = this.getUser();
        if (!user) return;

        // v7.0: superadmin-only controls (e.g. View As). Note this is a
        // convenience, not a control — the server enforces the real check.
        const isSA = user.role === 'superadmin';
        document.querySelectorAll('.superadmin-only').forEach(el => {
            el.style.display = isSA ? '' : 'none';
        });
        
        const name = user.name || 'User';
        const email = user.email || '';
        
        document.querySelectorAll('.requester-badge').forEach(el => {
            const strong = el.querySelector('strong');
            if (strong) {
                strong.textContent = name;
            } else {
                const text = el.textContent;
                const colonIndex = text.indexOf(':');
                if (colonIndex > -1) {
                    const prefix = text.substring(0, colonIndex + 1);
                    el.textContent = `${prefix} ${name}`;
                } else {
                    el.textContent = `Requesting as: ${name}`;
                }
            }
        });
        
        const homeLabel = document.getElementById('home-user-label');
        if (homeLabel) {
            const roleLabel = user.roleLabel || user.role || 'User';
            homeLabel.textContent = `${roleLabel} — ${name}`;
        }
    },

    async updateApprovalBadge() {
        if (!getSessionToken()) return;   // v7.0.1: no session, no call
        try {
            const user = this.getUser();
            if (!user) return;
            
            const pendingData = await DataService.getPendingApprovals();
            const userEmail = this.getUser().email.toLowerCase();

            // Count pending cash advances (excluding self)
            const pendingCashAdvances = (pendingData.cashAdvances || []).filter(function(r) {
                return r.requestorEmail && r.requestorEmail.toLowerCase() !== userEmail;
            });
            
            // Count reviewing releases (for Admins)
            const pendingReleases = (pendingData.releases || []).filter(function(r) {
                return r.releasedBy && r.releasedBy.toLowerCase() !== userEmail;
            });
            
            const pendingMaterials = (pendingData.materials || []).filter(function(m) {
                return m.requestedBy && m.requestedBy.toLowerCase() !== userEmail;
            });
            
            const pendingEquipment = (pendingData.equipment || []).filter(function(e) {
                return e.requestedBy && e.requestedBy.toLowerCase() !== userEmail;
            });
            
            const pendingEstimates = pendingData.estimates || [];
            const pendingDailyRecords = (pendingData.dailyRecords || []).filter(function(d) {
                return d.createdBy && d.createdBy.toLowerCase() !== userEmail;
            });

            // v3: incoming cash + manpower now count toward the badge
            const pendingIncoming = (pendingData.incomingCash || []).filter(function(r) {
                return r.requestorEmail && r.requestorEmail.toLowerCase() !== userEmail;
            });
            const pendingManpower = (pendingData.manpower || []).filter(function(m) {
                return m.requestedBy && m.requestedBy.toLowerCase() !== userEmail;
            });

            this._pendingCount = pendingCashAdvances.length + pendingReleases.length + 
                                 pendingIncoming.length + pendingManpower.length +
                                 pendingMaterials.length + pendingEquipment.length + 
                                 pendingEstimates.length + pendingDailyRecords.length;
            
            document.querySelectorAll('.t-badge, #approvalBadgeHome').forEach(el => {
                el.textContent = this._pendingCount;
            });
        } catch (err) {
            console.error('Error updating badge:', err);
        }
    }
};

// ─── TOGGLE MENU (mobile topbar) ──────────────────────────────
function toggleMenu() {
    document.querySelectorAll('.topbar .actions').forEach(el => el.classList.toggle('open'));
}