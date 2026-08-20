// ================================================================
//  core/busy.js — Every button says what it is doing. (v18)
//
//  ── THE PROBLEM ─────────────────────────────────────────────
//
//  Apps Script round trips take a second or more. A button that looks
//  identical before and after you press it tells the person nothing,
//  so they press it again — and on a Save, that is two records; on an
//  Approve, that is two approvals racing each other.
//
//  Every fix for this so far has been written by hand, per button, and
//  most buttons never got one. This makes it one call:
//
//      await Busy.run(btn, 'Saving', async () => { ... });
//
//  The label is a VERB IN PROGRESS — Save becomes Saving, Approve
//  becomes Approving. That is deliberate: a spinner says "something is
//  happening", a changed word says "your click registered and THIS is
//  what it started".
//
//  ── WHAT IT GUARANTEES ──────────────────────────────────────
//
//  The button is disabled for the whole operation, so a double click
//  cannot become a double submit — the guarantee that matters most,
//  because the others are cosmetic and this one protects the data.
//
//  The original label always comes back, including when the operation
//  throws. A button stuck on "Saving..." after a failure is worse than
//  no feedback at all: it looks like the system is still working when
//  it has already given up.
// ================================================================

const Busy = {

    /** Common labels, so the whole app phrases the same action the same
     *  way. A screen that says "Saving" in one place and "Please wait"
     *  in another reads as two different systems. */
    VERBS: {
        save: 'Saving', submit: 'Submitting', approve: 'Approving',
        reject: 'Rejecting', delete: 'Deleting', send: 'Sending',
        upload: 'Uploading', import: 'Importing', release: 'Releasing',
        pay: 'Paying', cancel: 'Cancelling', generate: 'Generating',
        create: 'Creating', add: 'Adding', update: 'Updating',
        login: 'Signing in', search: 'Searching', print: 'Preparing'
    },

    /** _verb - guesses from the button's own text, so most callers do
     *  not have to pass a label at all. */
    _verb(text) {
        const t = String(text || '').trim().toLowerCase();
        for (const k in this.VERBS) {
            if (t.indexOf(k) === 0) return this.VERBS[k];
        }
        return 'Working';
    },

    /**
     * run - the whole thing.
     *
     * @param btn    the element, or its id
     * @param label  optional; guessed from the button text when omitted
     * @param fn     the async work
     */
    async run(btn, label, fn) {
        // Called as run(btn, fn) — the label is optional and this is the
        // form most call sites will use.
        if (typeof label === 'function') { fn = label; label = null; }

        const el = typeof btn === 'string' ? document.getElementById(btn) : btn;
        if (!el) return await fn();

        // Already running. Returning rather than queueing is correct: the
        // person pressed twice meaning once.
        if (el.dataset.busy === '1') return;

        const original = el.innerHTML;
        const wasDisabled = el.disabled;
        const text = el.textContent;

        el.dataset.busy = '1';
        el.disabled = true;
        el.classList.add('is-busy');
        el.innerHTML = `<span class="busy-dot"></span>${this._esc(label || this._verb(text))}...`;

        try {
            return await fn();
        } finally {
            // ALWAYS restored, including on a throw. A button stuck on
            // "Saving..." after a failure looks like the system is still
            // working when it has already given up.
            el.dataset.busy = '';
            el.disabled = wasDisabled;
            el.classList.remove('is-busy');
            el.innerHTML = original;
        }
    },

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    /**
     * auto - the same thing, for a handler that was never given its
     * button.
     *
     * Almost every button in this app is wired as
     * `onclick="Page.doThing('id')"` — no `this`, so the handler has no
     * way to reach the element that was pressed. Passing it would mean
     * editing several hundred call sites twice: the markup and the
     * signature.
     *
     * Instead the last pressed button is captured on the way down (a
     * capture-phase listener runs before the inline handler), so a
     * handler can simply say what it is doing:
     *
     *     await Busy.auto('Approving', async () => { ... });
     *
     * Falls back to running the work plainly if it cannot find a button,
     * so a handler called from code rather than a click still works.
     */
    _last: null,

    async auto(label, fn) {
        if (typeof label === 'function') { fn = label; label = null; }
        return await this.run(this._last, label, fn);
    },

    /**
     * pressed - the button being clicked RIGHT NOW.
     *
     * Needed by any handler that opens a confirm dialog first: pressing
     * "Confirm" is itself a click, so by the time the dialog resolves
     * the captured button is the dialog's — which is then removed from
     * the page. Grab the real one before awaiting anything.
     */
    pressed() { return this._last; },

    /** Captured in the capture phase, which runs BEFORE the inline
     *  onclick — so by the time the handler asks, this is already set. */
    listen() {
        if (this._listening) return;
        this._listening = true;
        document.addEventListener('click', (e) => {
            const el = e.target && e.target.closest && e.target.closest('button');
            this._last = el || null;
        }, true);
    },

    /**
     * wire - retrofits every button that calls a known async action,
     * without editing each call site.
     *
     * This exists because there are several hundred buttons and editing
     * them one at a time would take longer than it is worth and would
     * miss some. Anything wired here gets the busy state for free; the
     * important paths still call Busy.run directly, because an explicit
     * label reads better than a guessed one.
     */
    wireAll(root) {
        const scope = root || document;
        scope.querySelectorAll('button[onclick]:not([data-busy-wired])').forEach(el => {
            const code = el.getAttribute('onclick') || '';
            // Only wrap handlers that look asynchronous. Wrapping a
            // synchronous toggle would make it flicker for no reason.
            if (!/\b(save|submit|approve|reject|delete|send|upload|import|release|pay|cancel|generate|create|add|update|do|run)/i.test(code)) return;
            el.dataset.busyWired = '1';
            const handler = el.onclick;
            if (!handler) return;
            el.onclick = function (ev) {
                const r = handler.call(this, ev);
                if (r && typeof r.then === 'function') {
                    Busy.run(this, () => r);
                }
                return r;
            };
        });
    }
};
