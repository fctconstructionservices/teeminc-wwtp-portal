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

    App.updateUserBadges();

    const label = document.getElementById('home-user-label');
    if (label) {
        label.textContent = `${user.roleLabel} — ${user.name}`;
    }

    UI.toast(`Welcome, ${user.name}! (${user.roleLabel})`, 'success');
    App.navigate('home');
    return false;
}
