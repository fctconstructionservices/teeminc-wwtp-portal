// ================================================================
//  core/config.js — Everything that differs between companies.
//
//  ONE CODEBASE, TWO DEPLOYMENTS. The alternative — forking the repo
//  per company — looks simpler on day one and is the more expensive
//  choice by a wide margin: every fix from here on would have to be
//  applied twice, and the two copies drift apart the first time one of
//  them gets a hotfix the other does not.
//
//  So: the code is identical everywhere, and ONLY THIS FILE changes.
//  It is the single thing you edit when standing up a new company.
//
//  ── SETTING UP A SECOND COMPANY ──────────────────────────────
//
//  1. Copy the Google Sheet (File → Make a copy). Empty the data rows;
//     keep the headers. Note the new spreadsheet id from its URL.
//  2. Copy the Apps Script project, point SHEET_ID in 00-Config.gs at
//     the new sheet, and deploy it as a Web App with "Anyone" access.
//     Note the /exec URL.
//  3. Copy this file to config.js in the new deployment and change the
//     four values below.
//  4. Deploy the frontend to Cloudflare Pages.
//
//  Nothing else in the repository is company-specific. There is a test
//  that keeps it that way.
//
//  ── A NOTE ON WHAT IS AND IS NOT SECRET ──────────────────────
//
//  The API URL is NOT a secret and cannot be treated as one: it ships
//  in the browser bundle, so anyone using the app can read it. The
//  Apps Script is deployed as "Anyone" because that is what avoids the
//  CORS preflight failure — the access control is the SESSION TOKEN
//  checked on every call, not the obscurity of the URL.
//
//  The consequence worth understanding: the two companies are separated
//  by having SEPARATE SPREADSHEETS AND SEPARATE DEPLOYMENTS, not by
//  anything in this file. Never point two companies at one backend and
//  try to filter by company in the app — one missed filter and one
//  company reads the other's contracts.
// ================================================================

const CONFIG = {

    /**
     * apiUrl - the Apps Script Web App /exec URL for THIS company.
     * Each company has its own deployment reading its own spreadsheet.
     */
    apiUrl: 'https://script.google.com/macros/s/AKfycbyIuNjph0XC0Jd4yc777cOXrBnzt1rtv8rvzI8X0WISEtuz31CBJmTngv9c7Wcte1Xp_g/exec',

    /** company - what the app calls itself. */
    company: {
        short: 'TEEM',
        name: 'Technical Experts on Environmental Management Inc.',
        appName: 'TEEM - WWTP ERP System',
        // Shown on the login screen under the sign-in button.
        notice: 'Wastewater Treatment Plant Division ERP System'
    },

    /**
     * currency - symbol and locale. Both companies are Philippine
     * today, but a figure formatted for the wrong locale is the kind
     * of error nobody spots until a client does.
     */
    currency: { symbol: '₱', locale: 'en-PH' },

    /**
     * accent - the one accent colour. Giving each company a different
     * accent is not decoration: when you have two tabs open it is the
     * fastest way to know which company you are about to post a cash
     * advance against.
     */
    accent: null   // null keeps the stylesheet default (amber)
};

/**
 * applyConfig - writes the configured identity into the page.
 *
 * Done at runtime rather than by editing index.html per company,
 * because a second copy of the markup is a second thing to keep in
 * step — the same reason the dashboard tiles were removed.
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
