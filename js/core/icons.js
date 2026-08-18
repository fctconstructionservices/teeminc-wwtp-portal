// ================================================================
//  core/icons.js — SVG icon library
//
//  PURPOSE: Minimalist line icons rendered as inline SVG strings,
//  currentColor-based so they inherit text color. Consistent size
//  and stroke across the whole app. Usage: Icon.name({ size, color }).
// ================================================================

const Icon = {
    _svg(paths, opts = {}) {
        const size = opts.size || 18;
        const stroke = opts.color || 'currentColor';
        const strokeWidth = opts.strokeWidth || 1.75;
        const cls = opts.class ? ` class="${opts.class}"` : '';
        return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;">${paths}</svg>`;
    },

    // v14 — discussion + notifications
    bell(o) { return this._svg(`<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>`, o); },
    messageSquare(o) { return this._svg(`<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`, o); },
    paperclip(o) { return this._svg(`<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>`, o); },

    // v22 — a door with an arrow leaving it. An X reads as "close this",
    // and people pressed it expecting to dismiss something.
    logout(o) { return this._svg(`<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><polyline points="15 16 20 12 15 8"/><line x1="20" y1="12" x2="9" y2="12"/>`, o); },
    settings(o) { return this._svg(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a1.6 1.6 0 0 0-1.5-1H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 4.6h.1A1.6 1.6 0 0 0 8 3.1V3a2 2 0 1 1 4 0v.1"/>`, o); },

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
    chevronRight(o) { return this._svg(`<polyline points="9 6 15 12 9 18"/>`, o); },

    // ─── v10: icons that replace the emoji used across the app ───
    // Every glyph below stood in as an emoji before v10. Emoji render
    // differently on each OS (Windows shows several as boxes), ignore
    // theme colour, and read as unpolished. These inherit currentColor
    // and match the stroke weight of the set above.
    trash(o) { return this._svg(`<path d="M4 7h16"/><path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><line x1="10.5" y1="11" x2="10.5" y2="17"/><line x1="13.5" y1="11" x2="13.5" y2="17"/>`, o); },
    pencil(o) { return this._svg(`<path d="M12 20h8"/><path d="M16.4 4.6a1.9 1.9 0 0 1 2.7 2.7L8 18.4 4 19.5l1.1-4z"/>`, o); },
    timer(o) { return this._svg(`<circle cx="12" cy="13.5" r="7.5"/><polyline points="12 9.5 12 13.5 14.8 15.2"/><line x1="9.5" y1="2.5" x2="14.5" y2="2.5"/>`, o); },
    transfer(o) { return this._svg(`<path d="M4 9h13"/><polyline points="14 6 17 9 14 12"/><path d="M20 15H7"/><polyline points="10 12 7 15 10 18"/>`, o); },
    warehouse(o) { return this._svg(`<path d="M3 20.5V11l6-3.2V11l6-3.2V11l6-3.2V20.5z"/><line x1="3" y1="20.5" x2="21" y2="20.5"/><rect x="8.5" y="15" width="3.5" height="5.5"/>`, o); },
    punchlist(o) { return this._svg(`<rect x="5" y="4.5" width="14" height="16" rx="1.8"/><path d="M9.5 4.5V3.4h5v1.1"/><path d="M9 10h6"/><path d="M9 13.5h6"/><path d="M9 17h3.5"/>`, o); },
    safety(o) { return this._svg(`<path d="M3.5 18.5a8.5 8.5 0 0 1 17 0z"/><path d="M8 18.5V8.6a4 4 0 0 1 8 0v9.9"/><line x1="2.5" y1="18.5" x2="21.5" y2="18.5"/>`, o); },
    drawing(o) { return this._svg(`<path d="M3.5 20h17L3.5 4z"/><line x1="8.5" y1="20" x2="8.5" y2="15.5"/><line x1="13" y1="20" x2="13" y2="12"/>`, o); },
    spreadsheet(o) { return this._svg(`<rect x="3.5" y="4" width="17" height="16" rx="1.6"/><line x1="3.5" y1="9" x2="20.5" y2="9"/><line x1="9" y1="9" x2="9" y2="20"/><line x1="3.5" y1="14.5" x2="20.5" y2="14.5"/>`, o); },
    arrowUp(o) { return this._svg(`<line x1="12" y1="19" x2="12" y2="5"/><polyline points="6.5 10.5 12 5 17.5 10.5"/>`, o); },
    arrowDown(o) { return this._svg(`<line x1="12" y1="5" x2="12" y2="19"/><polyline points="6.5 13.5 12 19 17.5 13.5"/>`, o); },
    moon(o) { return this._svg(`<path d="M20.5 14.2A8.7 8.7 0 1 1 10.3 3.6a6.8 6.8 0 0 0 10.2 10.6z"/>`, o); },
    restore(o) { return this._svg(`<polyline points="9.5 14 4.5 9 9.5 4"/><path d="M4.5 9h10.2a5.2 5.2 0 0 1 0 10.4H9"/>`, o); },
    refresh(o) { return this._svg(`<path d="M20 12a8 8 0 1 1-2.9-6.2"/><polyline points="20 4 20 9 15 9"/>`, o); },
    hourglass(o) { return this._svg(`<path d="M7 3.5h10"/><path d="M7 20.5h10"/><path d="M8 3.5v3.2c0 1.6 4 3.6 4 5.3s-4 3.7-4 5.3v3.2"/><path d="M16 3.5v3.2c0 1.6-4 3.6-4 5.3s4 3.7 4 5.3v3.2"/>`, { color: 'var(--amber)', ...o }); },
    check(o) { return this._svg(`<polyline points="4.5 12.5 9.5 17.5 19.5 7"/>`, o); },
    folder(o) { return this._svg(`<path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h3.8l1.7 2h8A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/>`, o); },
    calendar(o) { return this._svg(`<rect x="3.5" y="5.5" width="17" height="15" rx="1.6"/><line x1="3.5" y1="10" x2="20.5" y2="10"/><line x1="8" y1="3.5" x2="8" y2="7"/><line x1="16" y1="3.5" x2="16" y2="7"/>`, o); },
    pin(o) { return this._svg(`<path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.9 12 21 12 21z"/><circle cx="12" cy="10" r="2.4"/>`, o); },
    megaphone(o) { return this._svg(`<path d="M3.5 10.5v3l3.5 1 8.5 3.5V6L7 9.5z"/><path d="M18.5 9.2a3.4 3.4 0 0 1 0 5.6"/><path d="M7 14.5V19a1.5 1.5 0 0 0 3 0v-3.4"/>`, o); },
    siren(o) { return this._svg(`<path d="M6.5 19v-6.5a5.5 5.5 0 0 1 11 0V19z"/><line x1="4.5" y1="19" x2="19.5" y2="19"/><line x1="12" y1="3.5" x2="12" y2="5.5"/><line x1="5" y1="6" x2="6.4" y2="7.4"/><line x1="19" y1="6" x2="17.6" y2="7.4"/>`, { color: 'var(--red)', ...o }); },
    eye(o) { return this._svg(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>`, o); },
    circleDot(o) { return this._svg(`<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>`, o); },
    settings(o) { return this._svg(`<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M4.9 7.5l1.7 1M17.4 15.5l1.7 1M4.9 16.5l1.7-1M17.4 8.5l1.7-1"/>`, o); },
    factory(o) { return this.warehouse(o); }
};
