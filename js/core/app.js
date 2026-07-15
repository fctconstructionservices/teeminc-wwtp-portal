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
        const saved = localStorage.getItem('fctc_user');
        if (saved) {
            try {
                this.currentUser = JSON.parse(saved);
                if (this.currentUser && this.currentUser.loggedIn) {
                    this.updateUserBadges();
                    this.navigate('home');
                    return;
                }
            } catch (_) {}
        }
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

        // ─── RECORD CASH: Approvers only ──────────────────────
        if (page === 'record-cash' && !this.isApprover()) {
            UI.toast('Access denied. Approvers only.', 'error');
            if (page !== 'home') {
                setTimeout(() => this.navigate('home'), 800);
                return;
            }
        }

        if (page === 'request') {
            loadProjectsDropdown();
        }
        if (page === 'record-cash') {
            setTimeout(loadIncomingProjectsDropdown, 100);
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
        if (page === 'materials') await MaterialsPage.load();
        if (page === 'equipment') await EquipmentPage.load();
        if (page === 'approvals') await ApprovalsPage.load();
        if (page === 'release-cash') {
            setTimeout(loadReleaseDropdown, 100);
        }

        this.updateUserBadges();
        await this.updateApprovalBadge();

        document.querySelectorAll('.topbar .actions').forEach(el => el.classList.remove('open'));
    },

    logout() {
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
            
            this._pendingCount = pendingCashAdvances.length + pendingReleases.length + 
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
