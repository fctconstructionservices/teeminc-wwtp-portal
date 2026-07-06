// ================================================================
//  ICON LIBRARY — minimalist line icons, currentColor-based
//  Konsistent na sukat/stroke sa buong app. Gamitin: Icon.name(opts)
// ================================================================
const Icon = {
    _svg(paths, opts = {}) {
        const size = opts.size || 18;
        const stroke = opts.color || 'currentColor';
        const strokeWidth = opts.strokeWidth || 1.75;
        const cls = opts.class ? ` class="${opts.class}"` : '';
        return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;">${paths}</svg>`;
    },

    menu(o) { return this._svg(`<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>`, o); },
    themeToggle(o) { return this._svg(`<path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>`, o); },
    close(o) { return this._svg(`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`, o); },
    arrowRight(o) { return this._svg(`<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`, o); },

    checkCircle(o) { return this._svg(`<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/>`, { color: 'var(--green)', ...o }); },
    xCircle(o) { return this._svg(`<circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>`, { color: 'var(--red)', ...o }); },
    warning(o) { return this._svg(`<path d="M12 3.5l9.5 16.5h-19z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="16.8" r="0.4" fill="currentColor" stroke="none"/>`, { color: 'var(--amber)', ...o }); },
    ban(o) { return this._svg(`<circle cx="12" cy="12" r="9"/><line x1="6.5" y1="17.5" x2="17.5" y2="6.5"/>`, { color: 'var(--red)', ...o }); },
    lock(o) { return this._svg(`<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>`, o); },

    wallet(o) { return this._svg(`<rect x="3" y="6" width="18" height="13" rx="1.5"/><path d="M3 10h18"/><circle cx="12" cy="14.5" r="1.6"/>`, o); },
    incoming(o) { return this._svg(`<line x1="12" y1="3" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><line x1="4" y1="20" x2="20" y2="20"/>`, o); },
    outgoing(o) { return this._svg(`<line x1="6" y1="18" x2="18" y2="6"/><polyline points="9 6 18 6 18 15"/>`, o); },
    receipt(o) { return this._svg(`<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/>`, o); },
    package(o) { return this._svg(`<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v9l9 5 9-5V8"/><line x1="12" y1="13" x2="12" y2="22"/>`, o); },
    wrench(o) { return this._svg(`<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6 2.7 2.7 6-6a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.7-2.7z"/>`, o); },
    fileText(o) { return this._svg(`<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><line x1="9.5" y1="12" x2="14.5" y2="12"/><line x1="9.5" y1="15.5" x2="14.5" y2="15.5"/>`, o); },
    ruler(o) { return this._svg(`<path d="M4 20L14 4h2l4 16"/><line x1="9" y1="12" x2="17" y2="12"/>`, o); },
    barChart(o) { return this._svg(`<line x1="5" y1="20" x2="5" y2="12"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="19" y1="20" x2="19" y2="15"/>`, o); },
    camera(o) { return this._svg(`<rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M8 7l1.5-2.5h5L16 7"/><circle cx="12" cy="13.5" r="3.2"/>`, o); },
    users(o) { return this._svg(`<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 8.2a2.7 2.7 0 0 1 0 5.2"/><path d="M19 20c0-2.5-1.4-4.3-3.2-5.1"/>`, o); },
    user(o) { return this._svg(`<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>`, o); },
    search(o) { return this._svg(`<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/>`, o); },
    save(o) { return this._svg(`<path d="M5 4h11l3 3v13H5z"/><rect x="8" y="4" width="7" height="5"/><rect x="7" y="13" width="10" height="7"/>`, o); },
    printer(o) { return this._svg(`<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="8" rx="1"/><rect x="7" y="14" width="10" height="6"/>`, o); },
    clipboardList(o) { return this._svg(`<rect x="6" y="4" width="12" height="17" rx="1.5"/><rect x="9" y="2.5" width="6" height="3" rx="1"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/>`, o); },
    plus(o) { return this._svg(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`, o); },
    clock(o) { return this._svg(`<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>`, o); },
    chevronRight(o) { return this._svg(`<polyline points="9 6 15 12 9 18"/>`, o); }
};
