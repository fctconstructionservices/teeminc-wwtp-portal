// ================================================================
//  init.js — Boot sequence (must be the LAST script loaded)
//
//  PURPOSE: Injects static icons into the shell, then App.init()
//  restores the saved session and navigates to home or login.
// ================================================================

function populateStaticIcons() {
    document.querySelectorAll('.hamburger').forEach(el => el.innerHTML = Icon.menu({ size: 20 }));
    document.querySelectorAll('.theme-toggle').forEach(el => el.innerHTML = Icon.themeToggle({ size: 18 }));
    document.querySelectorAll('.close-modal, .lb-close').forEach(el => el.innerHTML = Icon.close({ size: 18 }));
    document.querySelectorAll('.btn-arrow').forEach(el => el.innerHTML = Icon.arrowRight({ size: 15 }));
}

document.addEventListener('DOMContentLoaded', () => { populateStaticIcons(); App.init(); });
