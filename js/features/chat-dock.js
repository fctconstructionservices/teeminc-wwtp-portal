// ================================================================
//  features/chat-dock.js — the docked chat
//
//  Lives on the app shell rather than on a page, so it survives
//  navigation: open threads, scroll position and the poll all carry
//  across from Finance to a project to Approvals without reconnecting.
//
//  POLLING, NOT PUSHING. One request carries the heartbeat, the presence
//  list and any new messages together. It runs every 5 seconds while a
//  window is open and every 30 when the dock is closed — a closed dock
//  is not being read, so only its unread badge has to stay current.
//  Sending is immediate and never waits for a tick; the interval only
//  governs how quickly the OTHER person sees it.
//
//  A truly instant version needs a WebSocket (Durable Objects, paid
//  plan). This is deliberately the cheap version, and the interval is
//  the one number to change if it ever needs to be quicker.
// ================================================================

const ChatDock = {
    OPEN_MS: 5000,
    CLOSED_MS: 30000,
    MAX_WINDOWS: 3,
    MAX_MB: 10,

    _boot: null,        // { me, people, conversations }
    _windows: [],       // [{ id, view, min }]  view: 'list' | 'new' | convoId
    _messages: {},      // convoId -> [message]
    _reads: {},         // convoId -> [{reader, name, lastReadAt}]
    _pending: {},       // windowId -> [attachment]
    _since: null,
    _timer: null,
    _busy: false,
    _open: false,

    // ── lifecycle ───────────────────────────────────────────
    async start() {
        if (this._started) return;
        this._started = true;
        this._host = document.getElementById('chatDock');
        if (!this._host) return;
        await this.refresh();
        this._schedule();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.tick();
        });
    },

    stop() {
        clearInterval(this._timer);
        this._timer = null;
        this._started = false;
        this._windows = [];
        this._open = false;
        if (this._host) this._host.innerHTML = '';
    },

    _schedule() {
        clearInterval(this._timer);
        const ms = (this._open || this._openConvoIds().length) ? this.OPEN_MS : this.CLOSED_MS;
        this._timer = setInterval(() => this.tick(), ms);
    },

    _openConvoIds() {
        return this._windows
            .filter(w => w.view !== 'list' && w.view !== 'new' && !w.min)
            .map(w => w.view);
    },

    async refresh() {
        try {
            this._boot = await DataService.chatBootstrap();
            this._since = this._boot.serverTime;
            this.render();
        } catch (err) { /* the dock must never break the page */ }
    },

    /** tick - the combined heartbeat + presence + new-message poll. */
    async tick() {
        if (document.hidden || this._busy) return;
        this._busy = true;
        try {
            const ids = this._openConvoIds();
            const res = await DataService.chatSync(ids, this._since);
            this._since = res.serverTime;

            // Presence rides along, so the list never needs its own poll.
            if (this._boot && res.presence) {
                this._boot.people.forEach(p => {
                    if (res.presence[p.email]) p.state = res.presence[p.email];
                });
                this._boot.conversations.forEach(c => {
                    if (c.other && res.presence[c.other]) c.otherState = res.presence[c.other];
                });
            }

            // Unread now comes back on EVERY poll, so a closed dock
            // learns it has something waiting. A conversation you are
            // looking at is read by definition, so it never shows a
            // count against itself.
            if (res.unread) {
                const looking = new Set(this._openConvoIds());
                (this._boot.conversations || []).forEach(c => {
                    c.unread = looking.has(c.id) ? 0 : (res.unread[c.id] || 0);
                });
                // A brand-new conversation started by someone else has
                // no row here yet; fetch the list so it can appear.
                const known = new Set((this._boot.conversations || []).map(c => c.id));
                if (Object.keys(res.unread).some(id => !known.has(id))) this.refresh();
            }

            Object.keys(res.messages || {}).forEach(cid => {
                const list = this._messages[cid] || [];
                const known = new Set(list.map(m => m.id));
                res.messages[cid].forEach(m => { if (!known.has(m.id)) list.push(m); });
                list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
                this._messages[cid] = list;

                const c = (this._boot.conversations || []).find(x => x.id === cid);
                const last = list[list.length - 1];
                if (c && last) {
                    const mine = last.author === this._boot.me.email;
                    const who = mine ? 'You' : this._nameOf(last.author).split(' ')[0];
                    const text = last.body || (last.attachments.length ? 'Attachment' : '');
                    c.last = c.type === 'group' ? `${who}: ${text}` : text;
                    c.lastAt = last.createdAt;
                }
            });
            Object.assign(this._reads, res.reads || {});

            // Anything arriving in a window you are looking at is read.
            ids.forEach(cid => {
                if ((res.messages || {})[cid]) DataService.chatMarkRead(cid).catch(() => {});
            });
            this.render();
        } catch (err) { /* silent: a failed poll retries on the next tick */ }
        finally { this._busy = false; }
    },


    // ── helpers ─────────────────────────────────────────────
    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    _nameOf(email) {
        if (!this._boot) return email;
        if (email === this._boot.me.email) return this._boot.me.name || 'You';
        const p = this._boot.people.find(x => x.email === email);
        return p ? p.name : email;
    },
    _initials(name) {
        return String(name || '?').trim().split(/\s+/).slice(0, 2)
            .map(w => w[0]).join('').toUpperCase() || '?';
    },
    _clock(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    },
    _dayLabel(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const that = new Date(d); that.setHours(0, 0, 0, 0);
        const diff = Math.round((today - that) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        return d.toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' });
    },
    _shortWhen(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const that = new Date(d); that.setHours(0, 0, 0, 0);
        const diff = Math.round((today - that) / 86400000);
        if (diff === 0) return this._clock(iso);
        if (diff === 1) return 'Yesterday';
        if (diff < 7) return d.toLocaleDateString('en-PH', { weekday: 'short' });
        return d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
    },
    _unreadTotal() {
        return (this._boot && this._boot.conversations || []).reduce((n, c) => n + (c.unread || 0), 0);
    },

    // ── render ──────────────────────────────────────────────
    /**
     * render - redraw the dock, WITHOUT throwing away what is being typed.
     *
     * The poll redraws every few seconds. Replacing innerHTML replaces
     * the textarea too, so a half-written message — or a half-filled
     * group form — vanished mid-sentence as soon as a tick landed. The
     * fields are snapshotted here and put back afterwards, along with
     * the caret, so a redraw is invisible to someone in the middle of a
     * sentence.
     */
    render() {
        if (!this._host || !this._boot) return;
        const snapshot = this._snapshotInputs();
        const n = this._unreadTotal();

        this._host.innerHTML =
            this._windows.map(w => this._win(w)).join('') +
            `<button class="dk-launch" onclick="ChatDock.toggle()" aria-expanded="${this._open}">
                <span class="dk-dot"></span> Chat
                ${n ? `<span class="dk-badge">${n}</span>` : ''}
            </button>`;
        this._host.hidden = false;
        this._restoreInputs(snapshot);
        this._scroll();
    },

    _snapshotInputs() {
        const active = document.activeElement;
        const snap = { values: {}, checked: {}, focusId: null, start: 0, end: 0 };
        this._host.querySelectorAll('input, textarea').forEach(el => {
            if (!el.id && el.type !== 'checkbox') return;
            if (el.type === 'checkbox') { snap.checked[el.value] = el.checked; return; }
            if (el.type === 'file') return;
            snap.values[el.id] = el.value;
            if (el === active) {
                snap.focusId = el.id;
                try { snap.start = el.selectionStart; snap.end = el.selectionEnd; } catch (e) {}
            }
        });
        return snap;
    },

    _restoreInputs(snap) {
        Object.keys(snap.values).forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value !== snap.values[id]) el.value = snap.values[id];
        });
        this._host.querySelectorAll('input[type="checkbox"]').forEach(el => {
            if (snap.checked[el.value]) el.checked = true;
        });
        if (snap.focusId) {
            const el = document.getElementById(snap.focusId);
            if (el) {
                el.focus();
                // Without this the caret jumps to the end on every tick,
                // which is just as disruptive as losing the text.
                try { el.setSelectionRange(snap.start, snap.end); } catch (e) {}
            }
        }
    },

    _win(w) {
        const isList = w.view === 'list';
        const isNew = w.view === 'new';
        const c = (isList || isNew) ? null : (this._boot.conversations || []).find(x => x.id === w.view);
        if (!isList && !isNew && !c) return '';

        const e = this._esc.bind(this);
        const online = (this._boot.people || []).filter(p => p.state === 'online').length;

        let head;
        if (isList) {
            head = `<span class="dk-av stack"><b>${this._boot.conversations.length}</b></span>
                <span class="dk-title"><b>Messages</b><small>${online} online</small></span>`;
        } else if (isNew) {
            head = `<span class="dk-av stack"><b>+</b></span>
                <span class="dk-title"><b>New group</b><small>Pick who is in it</small></span>`;
        } else {
            const av = c.type === 'group'
                ? `<span class="dk-av stack"><b>${c.members.length}</b></span>`
                : `<span class="dk-av" data-state="${c.otherState || 'off'}">${e(this._initials(c.name))}</span>`;
            const sub = c.type === 'group'
                ? `${c.members.length} members`
                : (c.otherState === 'online' ? '<span class="on">Online</span>'
                    : c.otherState === 'away' ? 'Away' : 'Offline');
            head = `${av}<span class="dk-title"><b>${e(c.name)}</b><small>${sub}</small></span>`;
        }

        const back = (!isList) ? `
            <button class="dk-btn" title="Back to messages" aria-label="Back to messages"
                onclick="event.stopPropagation();ChatDock.back('${w.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>` : '';
        const close = w.id !== 'main' ? `
            <button class="dk-btn" title="Close" aria-label="Close"
                onclick="event.stopPropagation();ChatDock.closeWin('${w.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>` : '';

        let body, composer = '';
        if (isList) body = this._list();
        else if (isNew) body = this._newGroup(w);
        else { body = this._thread(w, c); composer = this._composer(w, c); }

        return `
        <section class="dk-win ${w.min ? 'is-min' : ''}">
            <div class="dk-head" onclick="ChatDock.toggleMin('${w.id}')">
                ${head}
                <span class="dk-acts">
                    ${back}
                    <button class="dk-btn" title="${w.min ? 'Expand' : 'Minimise'}" aria-label="${w.min ? 'Expand' : 'Minimise'}"
                        onclick="event.stopPropagation();ChatDock.toggleMin('${w.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${w.min ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>
                    </button>
                    ${close}
                </span>
            </div>
            <div class="dk-body" id="dk-body-${w.id}">${body}</div>
            ${composer}
        </section>`;
    },

    _list() {
        const e = this._esc.bind(this);
        const convos = this._boot.conversations || [];
        const groups = convos.filter(c => c.type === 'group');
        const dms = convos.filter(c => c.type === 'dm');
        const people = this._boot.people || [];

        const row = c => `
            <button class="dk-row" onclick="ChatDock.open('${e(c.id)}')">
                ${c.type === 'group'
                    ? `<span class="dk-av stack"><b>${c.members.length}</b></span>`
                    : `<span class="dk-av" data-state="${c.otherState || 'off'}">${e(this._initials(c.name))}</span>`}
                <span class="dk-meta">
                    <span class="dk-name">${e(c.name)}</span>
                    <span class="dk-last">${e(c.last || 'No messages yet')}</span>
                </span>
                <span class="dk-right">
                    <span class="dk-time">${e(this._shortWhen(c.lastAt))}</span>
                    ${c.unread ? `<span class="dk-badge">${c.unread}</span>` : ''}
                </span>
            </button>`;

        // Someone with no thread yet is still reachable — otherwise you
        // could only message people you had already messaged.
        const started = new Set(dms.map(c => c.other));
        const fresh = people.filter(p => !started.has(p.email));

        return `
        <div class="dk-seek">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <label class="sr-only" for="dkq">Search people and groups</label>
            <input id="dkq" type="text" placeholder="Search people and groups" oninput="ChatDock.filter(this.value)" />
        </div>
        <div id="dk-list">
            ${groups.length ? `<div class="dk-grouphdr">Groups<button onclick="ChatDock.newGroup()">+ New</button></div>${groups.map(row).join('')}`
                : `<div class="dk-grouphdr">Groups<button onclick="ChatDock.newGroup()">+ New</button></div>`}
            ${dms.length ? `<div class="dk-grouphdr">Direct messages</div>${dms.map(row).join('')}` : ''}
            ${fresh.length ? `<div class="dk-grouphdr">Everyone else</div>${fresh.map(p => `
                <button class="dk-row" onclick="ChatDock.startDm('${e(p.email)}')">
                    <span class="dk-av" data-state="${p.state}">${e(this._initials(p.name))}</span>
                    <span class="dk-meta"><span class="dk-name">${e(p.name)}</span><span class="dk-last">${e(p.role)}</span></span>
                    <span class="dk-right"></span>
                </button>`).join('')}` : ''}
            ${!convos.length && !people.length ? '<div class="dk-empty">Nobody else is set up in the system yet.</div>' : ''}
        </div>`;
    },

    _thread(w, c) {
        const e = this._esc.bind(this);
        const me = this._boot.me.email;
        const msgs = this._messages[c.id] || [];
        if (!msgs.length) return '<div class="dk-empty">No messages yet. Say something.</div>';

        const reads = this._reads[c.id] || [];
        let lastDay = '';
        const rows = msgs.map(m => {
            let out = '';
            const day = this._dayLabel(m.createdAt);
            if (day !== lastDay) { lastDay = day; out += `<div class="dk-day"><span>${e(day)}</span></div>`; }

            const mine = m.author === me;
            const name = this._nameOf(m.author);
            const atts = (m.attachments || []).map(a => `
                <a class="dk-att" href="${e(a.url)}" target="_blank" rel="noopener">
                    <span class="dk-ext ${a.kind === 'img' ? 'img' : 'pdf'}">${a.kind === 'img' ? 'IMG' : 'PDF'}</span>
                    <span><span class="dk-att-name">${e(a.name)}</span><span class="dk-att-sub">Drive</span></span>
                </a>`).join('');

            out += `
                <div class="dk-msg ${mine ? 'me' : ''}">
                    <span class="dk-av">${e(this._initials(name))}</span>
                    <div class="dk-bubble ${m.deleted ? 'gone' : ''}">
                        ${c.type === 'group' && !mine ? `<span class="dk-who">${e(name)}</span>` : ''}
                        <p>${m.deleted ? 'This message was deleted' : e(m.body)}</p>
                        ${atts}
                        <span class="dk-stamp">${e(this._clock(m.createdAt))}</span>
                    </div>
                </div>`;

            // Receipts only on YOUR last message: repeating them down the
            // thread is noise, and the newest one answers the question.
            if (mine && m === msgs[msgs.length - 1]) {
                const seen = reads.filter(r => r.reader !== me && r.lastReadAt && r.lastReadAt >= m.createdAt);
                if (c.type === 'group') {
                    out += seen.length
                        ? `<div class="dk-receipt"><span class="lbl">Seen</span>${seen.map(r =>
                            `<span class="dk-seen" title="${e(r.name)}">${e(this._initials(r.name))}</span>`).join('')}</div>`
                        : `<div class="dk-receipt"><span class="dk-ticks">Sent</span></div>`;
                } else {
                    out += `<div class="dk-receipt"><span class="dk-ticks ${seen.length ? 'read' : ''}">${seen.length ? 'Read' : 'Sent'}</span></div>`;
                }
            }
            return out;
        }).join('');

        return `<div class="dk-log">${rows}</div>`;
    },

    _composer(w, c) {
        const e = this._esc.bind(this);
        const files = this._pending[w.id] || [];
        const to = c.type === 'group' ? c.name : c.name.split(' ')[0];
        return `
        <div class="dk-composer">
            ${files.length ? `<div class="dk-chips">${files.map((f, i) => `
                <span class="dk-chip">
                    <span class="dk-ext ${f.kind === 'img' ? 'img' : 'pdf'}" style="width:18px;height:18px;font-size:6.5px;">${f.kind === 'img' ? 'IMG' : 'PDF'}</span>
                    ${e(f.name)}
                    <button onclick="ChatDock.dropFile('${w.id}',${i})" aria-label="Remove ${e(f.name)}">&times;</button>
                </span>`).join('')}</div>` : ''}
            <div class="dk-crow">
                <input type="file" id="dk-file-${w.id}" accept="image/*,application/pdf" hidden
                    onchange="ChatDock.pickFile('${w.id}', this)" />
                <button class="dk-mini" title="Attach a PDF or image" aria-label="Attach a PDF or image"
                    onclick="document.getElementById('dk-file-${w.id}').click()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5l-8.6 8.6a5 5 0 01-7-7l8.5-8.6a3.5 3.5 0 015 5l-8.6 8.5a2 2 0 01-2.8-2.8l7.9-7.9"/></svg>
                </button>
                <label class="sr-only" for="dk-box-${w.id}">Message</label>
                <textarea id="dk-box-${w.id}" rows="1" placeholder="Message ${e(to)}…"
                    onkeydown="ChatDock.onKey(event,'${w.id}')"></textarea>
                <button class="dk-mini send" title="Send" aria-label="Send" onclick="ChatDock.send('${w.id}')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
            </div>
        </div>`;
    },

    _newGroup(w) {
        const e = this._esc.bind(this);
        return `
        <div class="dk-form">
            <label for="dk-gname">Group name</label>
            <input type="text" id="dk-gname" maxlength="60" placeholder="e.g. NYK-TDG Gymnasium CR" />
            <label>Members</label>
            <div class="dk-picks">
                ${(this._boot.people || []).map(p => `
                    <label class="dk-pick">
                        <input type="checkbox" value="${e(p.email)}" />
                        <span class="dk-av" data-state="${p.state}" style="width:22px;height:22px;font-size:8.5px;">${e(this._initials(p.name))}</span>
                        ${e(p.name)}
                    </label>`).join('')}
            </div>
            <div class="row">
                <button class="btn-sm" onclick="ChatDock.back('${w.id}')">Cancel</button>
                <button class="btn-sm primary" onclick="ChatDock.createGroup('${w.id}')">Create group</button>
            </div>
        </div>`;
    },

    _scroll() {
        this._windows.forEach(w => {
            if (w.view === 'list' || w.view === 'new') return;
            const el = document.getElementById('dk-body-' + w.id);
            if (el) el.scrollTop = el.scrollHeight;
        });
    },

    // ── actions ─────────────────────────────────────────────
    toggle() {
        this._open = !this._open;
        this._windows = this._open ? [{ id: 'main', view: 'list', min: false }] : [];
        this._schedule();
        this.render();
        if (this._open) this.refresh();
    },

    toggleMin(id) {
        const w = this._windows.find(x => x.id === id);
        if (!w) return;
        w.min = !w.min;
        this._schedule();
        this.render();
    },

    closeWin(id) {
        this._windows = this._windows.filter(w => w.id !== id);
        this._schedule();
        this.render();
    },

    back(id) {
        const w = this._windows.find(x => x.id === id);
        if (!w) return;
        w.view = 'list';
        this._schedule();
        this.render();
    },

    newGroup() {
        const main = this._windows.find(w => w.id === 'main');
        if (main) { main.view = 'new'; this.render(); }
    },

    async createGroup(wid) {
        const name = (document.getElementById('dk-gname') || {}).value || '';
        const picked = Array.from(document.querySelectorAll('.dk-picks input:checked')).map(i => i.value);
        try {
            const res = await DataService.chatCreateGroup(name, picked);
            await this.refresh();
            this.open(res.id);
        } catch (err) { UI.toast(err.message, 'error'); }
    },

    async startDm(email) {
        try {
            const res = await DataService.chatStartDm(email);
            await this.refresh();
            this.open(res.id);
        } catch (err) { UI.toast(err.message, 'error'); }
    },

    async open(cid) {
        const c = (this._boot.conversations || []).find(x => x.id === cid);
        if (c) c.unread = 0;

        // A conversation already on screen is raised rather than opened
        // twice; otherwise a third window is added, and past that the
        // main window switches instead — four does not fit a laptop.
        const already = this._windows.find(w => w.view === cid);
        if (already) { already.min = false; }
        else {
            const main = this._windows.find(w => w.id === 'main');
            if (main && (main.view === 'list' || main.view === 'new')) main.view = cid;
            else if (this._windows.length < this.MAX_WINDOWS) {
                this._windows.unshift({ id: 'w' + Date.now(), view: cid, min: false });
            } else if (main) main.view = cid;
        }

        this._schedule();
        this.render();

        if (!this._messages[cid]) {
            try {
                const h = await DataService.chatHistory(cid, null);
                this._messages[cid] = h.messages;
            } catch (err) { this._messages[cid] = []; }
        }
        DataService.chatMarkRead(cid).catch(() => {});
        this.render();
    },

    filter(q) {
        const needle = String(q || '').toLowerCase();
        document.querySelectorAll('#dk-list .dk-row').forEach(row => {
            const name = (row.querySelector('.dk-name') || {}).textContent || '';
            row.style.display = name.toLowerCase().includes(needle) ? '' : 'none';
        });
    },

    onKey(e, wid) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(wid); }
    },

    async pickFile(wid, input) {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        if (file.size > this.MAX_MB * 1024 * 1024) {
            UI.toast(`That file is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${this.MAX_MB} MB.`, 'error');
            return;
        }
        const w = this._windows.find(x => x.id === wid);
        const cid = w && w.view;
        if (!cid) return;

        this._pending[wid] = this._pending[wid] || [];
        const slot = { name: file.name, kind: /^image\//i.test(file.type) ? 'img' : 'pdf', uploading: true };
        this._pending[wid].push(slot);
        this.render();

        try {
            const b64 = await fileToBase64_(file);
            const up = await DataService.chatUpload(cid, b64, file.name, file.type);
            Object.assign(slot, up, { uploading: false });
        } catch (err) {
            this._pending[wid] = this._pending[wid].filter(f => f !== slot);
            UI.toast('That attachment did not upload: ' + err.message, 'error');
        }
        this.render();
    },

    dropFile(wid, i) {
        (this._pending[wid] || []).splice(i, 1);
        this.render();
    },

    async send(wid) {
        const w = this._windows.find(x => x.id === wid);
        if (!w) return;
        const cid = w.view;
        const box = document.getElementById('dk-box-' + wid);
        const text = (box && box.value || '').trim();
        const files = (this._pending[wid] || []).filter(f => !f.uploading);
        if (!text && !files.length) return;
        if ((this._pending[wid] || []).some(f => f.uploading)) {
            UI.toast('Still uploading — one moment.', 'warn');
            return;
        }

        if (box) box.value = '';
        this._pending[wid] = [];

        try {
            const res = await DataService.chatSend(cid, text, files);
            // Shown immediately rather than waiting for the next poll:
            // your own message appearing a beat late reads as a failure.
            (this._messages[cid] = this._messages[cid] || []).push({
                id: res.id, author: this._boot.me.email, body: text,
                attachments: files, createdAt: res.createdAt, deleted: false
            });
            const c = (this._boot.conversations || []).find(x => x.id === cid);
            if (c) {
                c.last = (c.type === 'group' ? 'You: ' : '') + (text || 'Attachment');
                c.lastAt = res.createdAt;
            }
            this._since = res.createdAt;
            this.render();
        } catch (err) {
            if (box) box.value = text;   // never silently swallow what was typed
            UI.toast(err.message, 'error');
        }
    }
};
