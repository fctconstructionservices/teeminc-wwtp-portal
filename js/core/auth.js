// ================================================================
//  core/auth.js — Login form handler
//
//  PURPOSE: Validates the login form, authenticates through
//  DataService.login() (backend Users sheet is the single source of
//  truth for accounts), persists the session and enters the app.
//
//  CLEANUP NOTE: the legacy client-side USER_DB / ROLE_LABELS tables
//  that previously lived in this file were removed — they were dead
//  code with zero references; authentication has been fully
//  server-side since the DataService bridge was introduced.
// ================================================================

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

    // ── v18: THE LOGIN BUTTON SAYS IT IS WORKING ──
    // Sign-in is the slowest call in the system — a cold Apps Script
    // plus a password hash — and it was the one button with no feedback
    // at all. People pressed it repeatedly, and every extra press counts
    // against the five-attempt lockout even though the first one was
    // fine. Somebody with the right password could lock themselves out
    // by being impatient.
    const btn = document.getElementById('loginBtn') ||
                document.querySelector('#loginForm button[type="submit"]');
    const restore = () => {
        if (!btn) return;
        btn.disabled = false;
        btn.classList.remove('is-busy');
        btn.innerHTML = btn.dataset.label || 'Sign in';
    };
    if (btn) {
        btn.dataset.label = btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('is-busy');
        btn.innerHTML = '<span class="busy-dot"></span>Signing in...';
    }

    let user;
    try {
        // v7.0: the server issues a session token; the browser stores the
        // token, not an identity it could edit.
        const res = await DataService.loginWithPassword(email, pass);
        setSessionToken(res.token);
        user = res.user;
    } catch (err) {
        restore();
        UI.toast('' + err.message, 'error');
        document.getElementById('login-pass-field').classList.add('error');
        return false;
    }

    // The button stays busy through the redirect — the work is not done
    // when the token arrives, it is done when the dashboard is on
    // screen, and re-enabling it here would invite a second submit
    // during the load.
    if (btn) btn.innerHTML = '<span class="busy-dot"></span>Loading your data...';

    localStorage.setItem('fctc_user', JSON.stringify(user));
    App.currentUser = user;

    App.updateUserBadges();

    const label = document.getElementById('home-user-label');
    if (label) {
        label.textContent = `${user.roleLabel} — ${user.name}`;
    }

    UI.toast(`Welcome, ${user.name}! (${user.roleLabel})`, 'success');
    App.navigate('home');
    return false;
}