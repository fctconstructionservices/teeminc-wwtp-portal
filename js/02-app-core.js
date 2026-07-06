// ================================================================
//  APP CORE - Complete with dynamic user badge updates
//  FIX: Approval badge should count "My Pending Approvals" only
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
                    this.updateTopbarLabel();
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
        const restrictedPages = ['release-cash', 'record-cash'];
        if (restrictedPages.includes(page) && !this.isApprover()) {
            UI.toast('Access denied. Approvers only.', 'error');
            if (page !== 'home') {
                setTimeout(() => this.navigate('home'), 800);
                return;
            }
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

        this.updateTopbarLabel();
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

    isRequestOnly() {
        return this.hasRole('request-only');
    },

    canApprove() {
        return this.isApprover() || this.isAdmin();
    },

    canSubmit() {
        return true;
    },

    updateTopbarLabel() {
        const user = this.getUser();
        if (!user) return;
        const name = user.name || 'User';
        const roleLabel = user.roleLabel || user.role || 'User';
        
        const label = document.getElementById('home-user-label');
        if (label) {
            label.textContent = roleLabel + ' — ' + name;
        }
        
        document.querySelectorAll('.requester-badge').forEach(el => {
            const strong = el.querySelector('strong');
            if (strong) {
                strong.textContent = name;
            } else {
                const text = el.textContent;
                const colonIndex = text.indexOf(':');
                if (colonIndex > -1) {
                    const prefix = text.substring(0, colonIndex + 1);
                    el.textContent = prefix + ' ' + name;
                } else {
                    el.textContent = 'Requesting as: ' + name;
                }
            }
        });
    },

    /**
     * ✅ FIX: Approval badge should count "My Pending Approvals"
     * This means: requests from OTHER users that need approval
     * NOT the current user's own requests
     */
    async updateApprovalBadge() {
        try {
            const user = this.getUser();
            if (!user) return;
            
            const userEmail = user.email.toLowerCase();
            
            // Get all pending requests
            const pendingData = await DataService.getPendingApprovals();
            
            // ✅ FIX: Count only requests from OTHER users (not the current user)
            const pendingRequestsForApproval = pendingData.requests.filter(function(r) {
                return r.requestorEmail && r.requestorEmail.toLowerCase() !== userEmail;
            });
            
            this._pendingCount = pendingRequestsForApproval.length;
            
            // Update all approval badges with the correct count
            document.querySelectorAll('.t-badge, #approvalBadgeHome').forEach(el => {
                el.textContent = this._pendingCount;
            });
        } catch (err) {
            console.error('Error updating badge:', err);
        }
    }
};
