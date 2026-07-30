// ================================================================
//  components/search-select.js — SearchSelect (v10)
//
//  PURPOSE: A searchable replacement for the <select> pickers in the
//  Estimates tab (Materials, Labor, Equipment).
//
//  WHY: a native <select> only jump-scrolls by first letter, so with a
//  few hundred approved catalog entries you are scrolling blind — and
//  "12mm rebar" is unfindable by typing "rebar". This matches on ANY
//  part of the name, brand, ID, category, or specification, groups the
//  results, and shows unit + DB rate on the right so you can confirm
//  the right item before committing.
//
//  Keyboard-first: type to filter, arrow to move, Enter to choose,
//  Escape to close. The committed value lives in a hidden input, so
//  existing save logic keeps reading a plain form field.
// ================================================================

const SearchSelect = {
    _reg: {},          // id -> { options, onSelect, cursor, filtered }

    /**
     * render(cfg) -> HTML string
     *   id, value, display, placeholder,
     *   options: [{ value, label, group, meta, keywords }],
     *   onSelect: function(value, option)   // real function, not a string
     */
    render(cfg) {
        const id = cfg.id;
        this._reg[id] = {
            options: cfg.options || [],
            onSelect: typeof cfg.onSelect === 'function' ? cfg.onSelect : null,
            cursor: -1,
            filtered: []
        };
        const disp = String(cfg.display || '').replace(/"/g, '&quot;');
        const ph = String(cfg.placeholder || 'Search...').replace(/"/g, '&quot;');
        const val = String(cfg.value == null ? '' : cfg.value).replace(/"/g, '&quot;');
        return `
            <div class="ss" data-ss="${id}">
                <input type="hidden" id="${id}-val" value="${val}" />
                <input type="text" class="ss-input" id="${id}" value="${disp}" placeholder="${ph}"
                    autocomplete="off" spellcheck="false"
                    oninput="SearchSelect.onInput('${id}')"
                    onfocus="SearchSelect.onFocus('${id}')"
                    onblur="SearchSelect.onBlur('${id}')"
                    onkeydown="SearchSelect.onKey('${id}', event)" />
                <span class="ss-caret">${Icon.search({ size: 13 })}</span>
                <div class="ss-list" id="${id}-list"></div>
            </div>`;
    },

    _match(opt, needle) {
        if (!needle) return true;
        const hay = [opt.label, opt.group, opt.meta, opt.value, opt.keywords]
            .filter(Boolean).join(' ').toLowerCase();
        // every term must appear somewhere, in any order: "rebar 12"
        // finds "Deformed Rebar 12mm x 6m"
        return needle.toLowerCase().split(/\s+/).filter(Boolean)
            .every(t => hay.indexOf(t) > -1);
    },

    _hl(text, needle) {
        const esc = String(text == null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const t = (needle || '').trim().split(/\s+/)[0];
        if (!t) return esc;
        const i = esc.toLowerCase().indexOf(t.toLowerCase());
        if (i < 0) return esc;
        return esc.slice(0, i) + '<mark>' + esc.slice(i, i + t.length) + '</mark>' + esc.slice(i + t.length);
    },

    _paint(id) {
        const st = this._reg[id];
        const inp = document.getElementById(id);
        const list = document.getElementById(id + '-list');
        if (!st || !inp || !list) return;
        const q = inp.value.trim();
        st.filtered = st.options.filter(o => this._match(o, q));

        if (!st.filtered.length) {
            list.innerHTML = `<div class="ss-empty">No approved entry matches "${
                q.replace(/</g, '&lt;')}". Add it to the database and have it approved first.</div>`;
            list.classList.add('open');
            return;
        }
        let html = '', lastGroup = null;
        st.filtered.forEach((o, i) => {
            if (o.group && o.group !== lastGroup) {
                html += `<div class="ss-group">${String(o.group).replace(/</g, '&lt;')}</div>`;
                lastGroup = o.group;
            }
            html += `<div class="ss-opt${i === st.cursor ? ' sel' : ''}" data-i="${i}"
                        onmousedown="event.preventDefault();SearchSelect.choose('${id}',${i})">
                        <span class="ss-opt-label">${this._hl(o.label, q)}</span>
                        ${o.meta ? `<span class="ss-opt-meta">${String(o.meta).replace(/</g, '&lt;')}</span>` : ''}
                     </div>`;
        });
        list.innerHTML = html;
        list.classList.add('open');
        const sel = list.querySelector('.ss-opt.sel');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    },

    onFocus(id) { const st = this._reg[id]; if (st) st.cursor = -1; this._paint(id); },
    onInput(id) { const st = this._reg[id]; if (st) st.cursor = -1; this._paint(id); },

    onBlur(id) {
        // let a click on an option land first
        setTimeout(() => {
            const list = document.getElementById(id + '-list');
            if (list) list.classList.remove('open');
            // restore the committed label if the user typed then left
            const st = this._reg[id];
            const inp = document.getElementById(id);
            const hid = document.getElementById(id + '-val');
            if (st && inp && hid) {
                const cur = st.options.find(o => String(o.value) === String(hid.value));
                if (cur) inp.value = cur.label;
                else if (!hid.value) inp.value = '';
            }
        }, 140);
    },

    onKey(id, e) {
        const st = this._reg[id];
        if (!st) return;
        if (e.key === 'ArrowDown') {
            st.cursor = Math.min(st.cursor + 1, st.filtered.length - 1); this._paint(id); e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            st.cursor = Math.max(st.cursor - 1, 0); this._paint(id); e.preventDefault();
        } else if (e.key === 'Enter') {
            if (st.cursor >= 0) { this.choose(id, st.cursor); e.preventDefault(); }
        } else if (e.key === 'Escape') {
            const list = document.getElementById(id + '-list');
            if (list) list.classList.remove('open');
        }
    },

    choose(id, i) {
        const st = this._reg[id];
        if (!st) return;
        const opt = st.filtered[i];
        if (!opt) return;
        const inp = document.getElementById(id);
        const hid = document.getElementById(id + '-val');
        if (inp) inp.value = opt.label;
        if (hid) hid.value = opt.value;
        const list = document.getElementById(id + '-list');
        if (list) list.classList.remove('open');
        if (st.onSelect) {
            try { st.onSelect(opt.value, opt); }
            catch (err) { console.error('SearchSelect onSelect:', err); }
        }
    },

    /** value(id) - the committed value, for save-time reads. */
    value(id) {
        const hid = document.getElementById(id + '-val');
        return hid ? hid.value : '';
    }
};
