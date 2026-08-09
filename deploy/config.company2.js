// ================================================================
//  deploy/config.company2.js — YOUR SECOND COMPANY
//
//  Copy this file, rename it for the company (config.abc.js), and fill
//  in the four things marked CHANGE THIS. Nothing else in the whole
//  repository needs to change.
//
//  HOW IT REACHES THE BROWSER
//
//    Cloudflare Pages runs a build command before it publishes:
//
//        cp deploy/config.abc.js js/core/config.js
//
//    So both companies deploy from the SAME branch, and the only
//    difference between the two live sites is this one file being
//    swapped in at build time. Every fix you push reaches both.
// ================================================================

const CONFIG = {

    // ── CHANGE THIS 1 of 4 ──────────────────────────────────────
    // The Apps Script Web App /exec URL for THIS company's own
    // deployment, reading THIS company's own spreadsheet.
    //
    // Get it from: Apps Script → Deploy → New deployment → Web app
    //              (Execute as: Me · Who has access: Anyone)
    //
    // It MUST be different from FCTC's. Two companies sharing one
    // backend means they share one set of books.
    apiUrl: 'https://script.google.com/macros/s/AKfycbyIuNjph0XC0Jd4yc777cOXrBnzt1rtv8rvzI8X0WISEtuz31CBJmTngv9c7Wcte1Xp_g/exec',

    // ── CHANGE THIS 2 of 4 ──────────────────────────────────────
    company: {
        short: 'TEEM Inc.',                                  // the mark in the top bar
        name: 'Technical Experts on Environmental Management Inc.',                     // the legal name
        appName: 'TEEM Inc - WWTP ERP System',               // browser tab and login
        notice: 'For WWTP Division Internal Use only.'  // under the sign-in button
    },

    // ── CHANGE THIS 3 of 4 (only if not Philippine) ─────────────
    currency: { symbol: '₱', locale: 'en-PH' },

    // ── CHANGE THIS 4 of 4 ──────────────────────────────────────
    // Give this company a DIFFERENT accent from FCTC's amber.
    //
    // This is not decoration. With both companies open in two tabs,
    // the colour is the fastest way to know which one you are about to
    // post a cash advance against — faster than reading the tab title,
    // and you will read the colour whether you mean to or not.
    accent: '#1F7A8C'
};

/**
 * applyConfig - writes the configured identity into the page.
 * Identical in every deployment; only the values above differ.
 */
function applyConfig() {
    const c = CONFIG.company || {};

    document.title = c.appName || 'Operations Board';

    document.querySelectorAll('[data-cfg]').forEach(el => {
        const key = el.dataset.cfg;
        const val = key.split('.').reduce((o, k) => (o || {})[k], CONFIG);
        if (val !== undefined && val !== null) el.textContent = val;
    });

    if (CONFIG.accent) {
        document.documentElement.style.setProperty('--amber', CONFIG.accent);
        document.documentElement.style.setProperty('--safety', CONFIG.accent);
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', applyConfig);
}
