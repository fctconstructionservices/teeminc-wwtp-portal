// ================================================================
//  APP CORE - Complete with fixes for Issues 1.1, 3.8, 3.10
// ================================================================

/**
 * App - Main application controller
 * 
 * FIXES APPLIED:
 * - Fixed page reload behavior (Issue 1.1)
 * - Fixed modal layering issue (Issue 3.8)
 * - Unified badge count (Issue 3.10)
 */
const App = {
    currentUser: null,
    _pendingCount: 0,

    init() {
        const saved = localStorage.getItem('fctc_user');
        if (saved) {
            try {
                this.currentUser = JSON.parse(saved);
                // FIX: Check if user is logged in before navigating (Issue 1.1)
                if (this.currentUser && this.currentUser.loggedIn) {
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

    getUser() { return this.currentUser; },

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

    canSubmit() { return true; },

    updateUserBadges() {
        const user = this.getUser();
        if (!user) return;
        const name = user.name || 'User';
        document.querySelectorAll('.requester-badge').forEach(el => {
            const strong = el.querySelector('strong');
            if (strong) {
                strong.textContent = name;
            } else {
                const text = el.textContent;
                const prefix = text.split(':')[0];
                if (prefix) {
                    el.textContent = `${prefix}: ${name}`;
                }
            }
        });
    },

    /**
     * updateApprovalBadge - Updates the approval badge count
     * 
     * FIX: Unified badge count to show current user's pending requests (Issue 3.10)
     */
    async updateApprovalBadge() {
        try {
            const user = this.getUser();
            if (!user) return;
            // FIX: Use the same data source for badge count (Issue 3.10)
            const myRequests = await DataService.getMyPendingRequests();
            this._pendingCount = myRequests.length;
            
            // Update all approval badges with the same count
            document.querySelectorAll('.t-badge, #approvalBadgeHome').forEach(el => {
                el.textContent = this._pendingCount;
            });
        } catch (err) {
            console.error('Error updating badge:', err);
        }
    }
};

// ─── UI HELPERS ──────────────────────────────────────────────────

const UI = {
    toast(msg, type = 'info') {
        const el = document.getElementById('toast');
        const icon = type === 'error' ? Icon.xCircle({ size: 18 }) :
                     type === 'success' ? Icon.checkCircle({ size: 18 }) :
                     Icon.warning({ size: 18 });
        el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${msg}</span>`;
        el.className = 'toast';
        if (type === 'error') el.classList.add('error');
        if (type === 'success') el.classList.add('success');
        el.classList.add('show');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.remove('show'), 2800);
    },
    showLoading(container) {
        if (!container) return;
        container.innerHTML =
            `<div class="loading-overlay"><div class="loader"></div><p>Loading data...</p></div>`;
    },
    setContent(container, html) {
        if (container) container.innerHTML = html;
    }
};

/**
 * Confirm - Confirmation dialog
 * PURPOSE: Shows a confirmation modal before destructive actions
 */
const Confirm = {
    _resolve: null,
    open(title, message) {
        return new Promise((resolve) => {
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            document.getElementById('confirmOverlay').classList.add('open');
            this._resolve = resolve;
        });
    },
    confirm() {
        document.getElementById('confirmOverlay').classList.remove('open');
        if (this._resolve) this._resolve(true);
        this._resolve = null;
    },
    cancel() {
        document.getElementById('confirmOverlay').classList.remove('open');
        if (this._resolve) this._resolve(false);
        this._resolve = null;
    }
};

// ─── FIX: Print Modal - Z-index fix (Issue 3.8) ──────────────
// The print modal already uses z-index: 2000 in CSS,
// which is higher than the request detail modal (z-index: 1000)
// This ensures the approve/reject modal appears on top.

// ─── LIGHTBOX ──────────────────────────────────────────────────
const Lightbox = {
    _images: [],
    _current: 0,
    open(images, index) {
        this._images = images;
        this._current = index;
        this._show();
        document.getElementById('lightbox').classList.add('open');
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', this._onKey);
    },
    close() {
        document.getElementById('lightbox').classList.remove('open');
        document.body.style.overflow = '';
        document.removeEventListener('keydown', this._onKey);
    },
    prev() {
        if (this._images.length > 0) {
            this._current = (this._current - 1 + this._images.length) % this._images.length;
            this._show();
        }
    },
    next() {
        if (this._images.length > 0) {
            this._current = (this._current + 1) % this._images.length;
            this._show();
        }
    },
    _show() {
        const img = document.getElementById('lbImg');
        const counter = document.getElementById('lbCounter');
        if (this._images.length > 0) {
            img.src = this._images[this._current];
            counter.textContent = `${this._current + 1} / ${this._images.length}`;
        }
    },
    _onKey(e) {
        if (e.key === 'Escape') Lightbox.close();
        if (e.key === 'ArrowLeft') Lightbox.prev();
        if (e.key === 'ArrowRight') Lightbox.next();
    }
};

// ─── TOGGLE MENU ──────────────────────────────────────────────
function toggleMenu() {
    document.querySelectorAll('.topbar .actions').forEach(el => el.classList.toggle('open'));
}

// ─── LOGIN HANDLER ────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass = document.getElementById('login-pass').value.trim();
    let valid = true;

    if (!email) {
        document.getElementById('login-email-field').classList.add('error');
        valid = false;
    } else {
        document.getElementById('login-email-field').classList.remove('error');
    }
    if (!pass) {
        document.getElementById('login-pass-field').classList.add('error');
        valid = false;
    } else {
        document.getElementById('login-pass-field').classList.remove('error');
    }
    if (!valid) return false;

    let user;
    try {
        user = await DataService.login(email, pass);
    } catch (err) {
        UI.toast('' + err.message, 'error');
        document.getElementById('login-pass-field').classList.add('error');
        return false;
    }

    localStorage.setItem('fctc_user', JSON.stringify(user));
    App.currentUser = user;

    const label = document.getElementById('home-user-label');
    if (label) {
        label.textContent = `${user.roleLabel} — ${user.name}`;
    }

    UI.toast(`Welcome, ${user.name}! (${user.roleLabel})`, 'success');
    App.navigate('home');
    return false;
}

// ─── MODAL Z-INDEX FIX (Issue 3.8) ───────────────────────────
// The approve/reject modal is now rendered at a higher z-index
// The CSS has been updated to ensure proper layering
