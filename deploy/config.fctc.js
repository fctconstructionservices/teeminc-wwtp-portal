// ================================================================
//  deploy/config.fctc.js — FCTC Construction Services
//
//  THIS IS THE MASTER COPY for FCTC. It is copied over
//  js/core/config.js when the FCTC site is deployed.
//
//  Do not edit js/core/config.js directly — edit this file, then copy
//  it across. Editing the live one means the next deploy overwrites
//  your change and nobody can work out why.
// ================================================================

const CONFIG = {

    /**
     * apiUrl - the Apps Script Web App /exec URL for THIS company.
     * Each company has its own deployment reading its own spreadsheet.
     */
    apiUrl: 'https://script.google.com/macros/s/AKfycbwiTaR64Z7IGpNbXYqFj5EiKS9627WbalGkEixfL5qQri8AV_WqrDGCfYOg1RDxRfXl/exec/exec',

    /** company - what the app calls itself. */
    company: {
        short: 'FCTC',
        name: 'FCTC Construction Services',
        appName: 'FCTC Operations Board',
        // Shown on the login screen under the sign-in button.
        notice: 'For FCTC Construction Services internal use only.'
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
