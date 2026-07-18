// ================================================================
//  core/ui.js — Shared UI primitives: toast, loading, confirm, lightbox
//
//  PURPOSE: Small presentation helpers used by every page module.
//    UI.toast(msg, type)      -> transient notification
//    UI.showLoading(el)       -> loader overlay while fetching
//    Confirm.open(title, msg) -> Promise<boolean> dialog
//    Lightbox                 -> fullscreen photo viewer with keys
// ================================================================

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

    /**
     * showSkeleton (v6.5) - Structure-aware placeholder. Instead of a
     * blank spinner, the page's shape (header, KPI cards, rows) appears
     * immediately and shimmers until the real data lands, so the wait
     * feels far shorter and the layout doesn't jump on arrival.
     */
    showSkeleton(container, kind) {
        if (!container) return;
        const bar = (w, h, mt) =>
            `<div class="sk-bar" style="width:${w};height:${h || '12px'};margin-top:${mt || '8px'};"></div>`;
        const card = () =>
            `<div class="sk-card">${bar('55%', '9px', '0')}${bar('80%', '20px')}${bar('40%', '9px')}</div>`;
        let body = '';
        if (kind === 'project') {
            body = `
                <div class="sk-head">${bar('38%', '22px', '0')}${bar('22%', '11px')}</div>
                <div class="sk-tabs">${[1,2,3,4,5,6].map(() => '<div class="sk-tab"></div>').join('')}</div>
                <div class="sk-kpis">${[1,2,3,4].map(card).join('')}</div>
                <div class="sk-panel">${[1,2,3,4,5].map(() => bar('100%', '14px', '12px')).join('')}</div>`;
        } else {
            body = `
                <div class="sk-head">${bar('30%', '20px', '0')}</div>
                <div class="sk-kpis">${[1,2,3,4].map(card).join('')}</div>
                <div class="sk-panel">${[1,2,3,4].map(() => bar('100%', '14px', '12px')).join('')}</div>`;
        }
        container.innerHTML = `<div class="skeleton" aria-busy="true" aria-label="Loading">${body}</div>`;
    },
    
    setContent(container, html) {
        if (container) container.innerHTML = html;
    }
};

// ─── CONFIRM DIALOG ─────────────────────────────────────────────

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

/**
 * fmtMoney / fmtNum (v5) - System-wide number formatting.
 * fmtMoney(12345.6) -> "12,345.60"   (always 2 decimals, comma-grouped)
 * fmtNum(12345.6)   -> "12,345.6"    (comma-grouped, no forced decimals)
 * Every peso figure in the UI should render as ₱${fmtMoney(x)}.
 */
function fmtMoney(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('en-PH', { maximumFractionDigits: 2 });
}