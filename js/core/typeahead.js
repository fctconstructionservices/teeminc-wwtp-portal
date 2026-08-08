// ================================================================
//  core/typeahead.js — Type-to-search with the match highlighted
//                      (v11 BATCH I2b)
//
//  WHY NOT A <datalist>. That is what I2 used, and it was the wrong
//  call. A datalist gives the browser complete control: no highlighting
//  of what you typed, no control over how many rows show, different
//  behaviour in every browser, and on some it will not open at all until
//  you press the down arrow. On a site form filled in at speed, that is
//  the difference between a field that helps and one that gets ignored.
//
//  This is the behaviour that worked before: type "12mm" and the list
//  shows "Rebar 12mm" with the 12mm HIGHLIGHTED, so you can see WHY each
//  row matched. Matching is on any part of the string, not just the
//  start, because nobody types a material from its first word.
//
//  FREE TEXT IS ALWAYS ALLOWED. The catalogue is a convenience, never a
//  gate — a new hire or a one-off delivery has to be enterable, and a
//  picker that refuses unknown values is how records stop being kept.
//
//  Keyboard: arrows move, Enter picks, Escape closes without changing
//  what you typed.
// ================================================================

const Typeahead = {

    _open: null,
    _items: [],
    _active: -1,
    _input: null,

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /** _mark - wraps every occurrence of the typed text in <mark>. */
    _mark(text, q) {
        const t = String(text == null ? '' : text);
        if (!q) return this._esc(t);
        const lower = t.toLowerCase();
        const needle = q.toLowerCase();
        let out = '', i = 0;
        while (i < t.length) {
            const at = lower.indexOf(needle, i);
            if (at === -1) { out += this._esc(t.slice(i)); break; }
            out += this._esc(t.slice(i, at)) +
                   '<mark>' + this._esc(t.slice(at, at + needle.length)) + '</mark>';
            i = at + needle.length;
        }
        return out;
    },

    /**
     * attach - wires an input to a source of suggestions.
     *
     * @param input   the <input>
     * @param source  () => [{ label, sub, value, data }]  (or plain strings)
     * @param onPick  (item) => void, after a suggestion is chosen
     *
     * The source is a FUNCTION, not an array, so a list that grows while
     * the form is open — a material added in another tab, a person added
     * mid-session — is picked up without rewiring anything.
     */
    attach(input, source, onPick) {
        if (!input || input._taWired) return;
        input._taWired = true;
        input.setAttribute('autocomplete', 'off');
        input.addEventListener('input', () => this._show(input, source, onPick));
        input.addEventListener('focus', () => this._show(input, source, onPick));
        input.addEventListener('keydown', e => this._key(e, input, source, onPick));
        input.addEventListener('blur', () => {
            // A click on a suggestion fires blur before the click lands,
            // so the close is deferred just long enough for it to arrive.
            setTimeout(() => this.close(), 160);
        });
    },

    _normalise(list) {
        return (list || []).map(x => typeof x === 'string'
            ? { label: x, sub: '', value: x, data: null }
            : { label: x.label || x.value || '', sub: x.sub || '', value: x.value !== undefined ? x.value : (x.label || ''), data: x.data || x });
    },

    _show(input, source, onPick) {
        const q = String(input.value || '').trim();
        const all = this._normalise(typeof source === 'function' ? source() : source);

        // Anywhere in the string, not just the start — nobody types a
        // material from its first word. "12mm" has to find "Rebar 12mm".
        const hits = q
            ? all.filter(x => (x.label + ' ' + x.sub).toLowerCase().indexOf(q.toLowerCase()) > -1)
            : all;

        if (!hits.length) { this.close(); return; }

        this._items = hits.slice(0, 12);   // more than a dozen is a list, not a suggestion
        this._active = -1;
        this._input = input;

        let box = this._open;
        if (!box) {
            box = document.createElement('div');
            box.className = 'ta-box';
            document.body.appendChild(box);
            this._open = box;
        }
        box.innerHTML = this._items.map((x, i) => `
            <div class="ta-item" data-i="${i}">
                <span class="ta-label">${this._mark(x.label, q)}</span>
                ${x.sub ? `<span class="ta-sub">${this._mark(x.sub, q)}</span>` : ''}
            </div>`).join('');

        Array.from(box.querySelectorAll('.ta-item')).forEach(el => {
            // mousedown, not click: it fires before blur, so the pick is
            // not lost to the input closing first.
            el.addEventListener('mousedown', ev => {
                ev.preventDefault();
                this._pick(parseInt(el.dataset.i, 10), onPick);
            });
        });

        const r = input.getBoundingClientRect();
        box.style.left = (r.left + window.scrollX) + 'px';
        box.style.top = (r.bottom + window.scrollY + 2) + 'px';
        box.style.minWidth = r.width + 'px';
        box.style.display = 'block';
    },

    _key(e, input, source, onPick) {
        if (!this._open || this._open.style.display === 'none') {
            if (e.key === 'ArrowDown') this._show(input, source, onPick);
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = this._items.length;
            this._active = e.key === 'ArrowDown'
                ? (this._active + 1) % n
                : (this._active - 1 + n) % n;
            Array.from(this._open.querySelectorAll('.ta-item')).forEach((el, i) =>
                el.classList.toggle('is-active', i === this._active));
        } else if (e.key === 'Enter') {
            if (this._active > -1) { e.preventDefault(); this._pick(this._active, onPick); }
        } else if (e.key === 'Escape') {
            // Closes without changing what was typed — a picker that
            // overwrites your text on Escape is worse than no picker.
            this.close();
        }
    },

    _pick(i, onPick) {
        const item = this._items[i];
        if (!item || !this._input) return;
        this._input.value = item.value;
        this._input.dispatchEvent(new Event('input', { bubbles: true }));
        this._input.dispatchEvent(new Event('change', { bubbles: true }));
        if (onPick) onPick(item, this._input);
        this.close();
    },

    close() {
        if (this._open) this._open.style.display = 'none';
        this._items = [];
        this._active = -1;
    }
};

// Reposition rather than leave a suggestion box floating over the wrong
// field when the page moves underneath it.
window.addEventListener('scroll', () => Typeahead.close(), true);
window.addEventListener('resize', () => Typeahead.close());
