// ================================================================
//  core/discussion.js — A conversation attached to a record. (v14)
//
//  ONE COMPONENT, SIXTEEN PLACES.
//
//      Discussion.mount(container, 'PurchaseRequest', 'PR-2026-0042')
//
//  A thread is identified by recordType + recordId and nothing else, so
//  the code that draws one on a billing is the code that draws one on a
//  daily site record. Sixteen separate implementations would drift
//  apart within a month; this cannot.
//
//  ── WHY IT LOADS THE WAY IT DOES ─────────────────────────────
//
//  The thread is fetched ONLY when the record is opened. There is no
//  polling here — that would burn the Apps Script quota this system
//  runs on. The bell polls a single number instead; see nav.js.
//
//  A posted comment appears IMMEDIATELY, before the server confirms.
//  On Apps Script a round trip is a second or more, and a comment box
//  that sits there doing nothing after you press send gets pressed
//  again. If the save fails the comment is marked and can be retried,
//  which is honest — pretending it saved would be worse.
// ================================================================

const Discussion = {

    _people: null,        // cached for the session; the user list rarely changes
    _mentionOpen: false,

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _when(v) {
        const d = new Date(v);
        if (isNaN(d)) return '';
        const mins = Math.round((Date.now() - d) / 60000);
        // Relative for anything today, absolute after that. "3 days ago"
        // is harder to reason about than a date once you are looking
        // back at a record rather than following a conversation.
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + ' min ago';
        if (mins < 1440) return Math.round(mins / 60) + ' h ago';
        return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) +
               ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    },

    _initials(name) {
        return String(name || '?').trim().split(/\s+/).slice(0, 2)
            .map(w => w[0]).join('').toUpperCase();
    },

    async _loadPeople() {
        if (this._people) return this._people;
        try {
            const home = await DataService.getHomeData();
            this._people = (home && home.users) || [];
        } catch (err) { this._people = []; }
        return this._people;
    },

    /**
     * mount - draws a thread into a container.
     *
     * @param el          the element to fill
     * @param recordType  'PurchaseRequest', 'Billing', 'DailyRecord', ...
     * @param recordId    the record's own id
     * @param opts        { projectId, title }
     */
    async mount(el, recordType, recordId, opts) {
        if (!el || !recordType || !recordId) return;
        opts = opts || {};
        el.dataset.dType = recordType;
        el.dataset.dId = recordId;
        el.dataset.dProject = opts.projectId || '';

        el.innerHTML = `<div class="dsc">
            <div class="dsc-head">${Icon.messageSquare ? Icon.messageSquare({size:13}) : '💬'}
                <b>Discussion</b><span class="dsc-count">loading…</span></div>
            <div class="dsc-list"><div class="dsc-empty">Loading…</div></div>
        </div>`;

        await this._loadPeople();
        await this.refresh(el);
    },

    async refresh(el) {
        const type = el.dataset.dType, id = el.dataset.dId;
        let rows = [];
        try {
            rows = await DataService.getThread(type, id);
        } catch (err) {
            el.querySelector('.dsc-list').innerHTML =
                `<div class="dsc-empty">Could not load the discussion: ${this._esc(err.message)}</div>`;
            return;
        }
        this._paint(el, rows);
    },

    _paint(el, rows) {
        const e = this._esc.bind(this);
        const live = rows.filter(r => !r.deleted).length;

        el.innerHTML = `<div class="dsc">
            <div class="dsc-head">${Icon.messageSquare ? Icon.messageSquare({size:13}) : '💬'}
                <b>Discussion</b>
                <span class="dsc-count">${live ? live + (live === 1 ? ' comment' : ' comments') : 'no comments yet'}</span>
            </div>

            <div class="dsc-list">
                ${rows.length ? rows.map(r => this._msg(r)).join('') : `
                    <div class="dsc-empty">Nothing here yet. Anything written on this record stays
                    with it — including for whoever opens it next year.</div>`}
            </div>

            <div class="dsc-compose pd-noprint">
                <textarea class="dsc-input" rows="2"
                    placeholder="Write a comment. Type @ to mention someone."
                    oninput="Discussion.onType(this)"
                    onkeydown="Discussion.onKey(event, this)"></textarea>
                <div class="dsc-actions">
                    <label class="dsc-attach" title="Attach a file">
                        ${Icon.paperclip ? Icon.paperclip({size:14}) : '📎'}
                        <input type="file" onchange="Discussion.onFile(this)" />
                        <span class="dsc-fname"></span>
                    </label>
                    <span class="dsc-hint">Ctrl + Enter to send</span>
                    <button class="btn-sm primary" onclick="Discussion.send(this)">Send</button>
                </div>
                <div class="dsc-mentions" hidden></div>
            </div>
        </div>`;
    },

    _msg(r) {
        const e = this._esc.bind(this);
        if (r.deleted) {
            return `<div class="dsc-msg is-gone">
                <span class="dsc-av">–</span>
                <div class="dsc-body"><em>Comment deleted</em></div>
            </div>`;
        }
        const canEdit = r.isMine &&
            ((Date.now() - new Date(r.createdAt)) / 60000) < 15;
        const canDelete = r.isMine || (App.getUser() || {}).role === 'superadmin';

        return `<div class="dsc-msg" data-id="${e(r.id)}">
            <span class="dsc-av">${e(this._initials(r.authorName))}</span>
            <div class="dsc-body">
                <div class="dsc-who">${e(r.authorName)}
                    <time>${e(this._when(r.createdAt))}${r.editedAt ? ' · edited' : ''}</time>
                    <span class="dsc-tools pd-noprint">
                        ${canEdit ? `<button onclick="Discussion.startEdit('${e(r.id)}')" title="Edit">${Icon.pencil({size:11})}</button>` : ''}
                        ${canDelete ? `<button onclick="Discussion.remove('${e(r.id)}')" title="Delete">${Icon.trash({size:11})}</button>` : ''}
                    </span>
                </div>
                <p class="dsc-text">${this._render(r.body)}</p>
                ${r.attachmentUrl ? `<a class="dsc-file" href="${e(r.attachmentUrl)}" target="_blank" rel="noopener">
                    ${Icon.paperclip ? Icon.paperclip({size:11}) : '📎'} ${e(r.attachmentName || 'attachment')}</a>` : ''}
            </div>
        </div>`;
    },

    /**
     * _render - escapes first, then highlights mentions.
     *
     * The order matters: highlighting before escaping would let someone
     * write markup into a comment and have it run.
     */
    _render(body) {
        const safe = this._esc(body);
        const known = (this._people || []).map(p => String(p.email || '').toLowerCase());
        return safe
            .replace(/@([\w.+-]+@[\w.-]+)/g, (m, addr) =>
                known.indexOf(addr.toLowerCase()) > -1
                    ? `<span class="dsc-mention">@${this._nameFor(addr)}</span>`
                    : m)
            .replace(/\n/g, '<br>');
    },

    _nameFor(email) {
        const p = (this._people || []).find(x =>
            String(x.email || '').toLowerCase() === String(email).toLowerCase());
        return this._esc(p ? (p.name || p.email) : email);
    },

    // ─── mentions ────────────────────────────────────────────

    onType(ta) {
        const box = ta.closest('.dsc-compose').querySelector('.dsc-mentions');
        const upto = ta.value.slice(0, ta.selectionStart);
        const m = /@([\w.+-]*)$/.exec(upto);
        if (!m) { box.hidden = true; return; }

        const q = m[1].toLowerCase();
        const hits = (this._people || [])
            .filter(p => (String(p.name || '') + ' ' + String(p.email || '')).toLowerCase().indexOf(q) > -1)
            .slice(0, 6);

        if (!hits.length) { box.hidden = true; return; }
        box.hidden = false;
        box.innerHTML = hits.map((p, i) => `
            <button class="${i === 0 ? 'is-active' : ''}"
                onmousedown="event.preventDefault();Discussion.pickMention('${this._esc(p.email)}', this)">
                <b>${this._esc(p.name || p.email)}</b><em>${this._esc(p.email)}</em>
            </button>`).join('');
    },

    pickMention(email, btn) {
        const box = btn.closest('.dsc-mentions');
        const ta = box.closest('.dsc-compose').querySelector('.dsc-input');
        const upto = ta.value.slice(0, ta.selectionStart);
        const rest = ta.value.slice(ta.selectionStart);
        ta.value = upto.replace(/@[\w.+-]*$/, '@' + email + ' ') + rest;
        box.hidden = true;
        ta.focus();
    },

    onKey(ev, ta) {
        const box = ta.closest('.dsc-compose').querySelector('.dsc-mentions');
        if (!box.hidden) {
            const btns = Array.from(box.querySelectorAll('button'));
            const cur = btns.findIndex(b => b.classList.contains('is-active'));
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                ev.preventDefault();
                const n = ev.key === 'ArrowDown' ? (cur + 1) % btns.length
                                                 : (cur - 1 + btns.length) % btns.length;
                btns.forEach((b, i) => b.classList.toggle('is-active', i === n));
                return;
            }
            if (ev.key === 'Enter' && cur > -1) { ev.preventDefault(); btns[cur].onmousedown(new Event('x')); return; }
            if (ev.key === 'Escape') { box.hidden = true; return; }
        }
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            this.send(ta.closest('.dsc-compose').querySelector('.btn-sm'));
        }
    },

    onFile(input) {
        const f = input.files && input.files[0];
        const label = input.closest('.dsc-attach').querySelector('.dsc-fname');
        label.textContent = f ? f.name : '';
    },

    // ─── posting ─────────────────────────────────────────────

    async send(btn) {
        const wrap = btn.closest('.dsc');
        const el = wrap.parentElement;
        const ta = wrap.querySelector('.dsc-input');
        const fileEl = wrap.querySelector('.dsc-attach input');
        const body = ta.value.trim();
        const file = fileEl.files && fileEl.files[0];

        if (!body && !file) { UI.toast('Write something, or attach a file.', 'error'); return; }

        const mentions = (body.match(/@([\w.+-]+@[\w.-]+)/g) || [])
            .map(m => m.slice(1).toLowerCase());

        // Drawn immediately. On Apps Script a round trip is a second or
        // more, and a box that does nothing after Send gets pressed
        // again — which is how a comment ends up posted twice.
        const user = App.getUser() || {};
        const list = wrap.querySelector('.dsc-list');
        const empty = list.querySelector('.dsc-empty');
        if (empty) empty.remove();
        const temp = document.createElement('div');
        temp.className = 'dsc-msg is-sending';
        temp.innerHTML = `<span class="dsc-av">${this._esc(this._initials(user.name))}</span>
            <div class="dsc-body">
                <div class="dsc-who">${this._esc(user.name || 'You')}<time>sending…</time></div>
                <p class="dsc-text">${this._render(body)}</p>
            </div>`;
        list.appendChild(temp);
        list.scrollTop = list.scrollHeight;
        ta.value = '';
        btn.disabled = true;

        try {
            const payload = {
                recordType: el.dataset.dType, recordId: el.dataset.dId,
                projectId: el.dataset.dProject, body: body, mentions: mentions
            };
            if (file) {
                payload.attachmentBase64 = await fileToBase64_(file);
                payload.attachmentName = file.name;
                payload.attachmentMime = file.type;
            }
            const res = await DataService.postComment(payload);
            if (res && res.mentioned) {
                UI.toast(`${res.mentioned} person(s) mentioned — they have been emailed.`, 'success');
            }
            fileEl.value = '';
            wrap.querySelector('.dsc-fname').textContent = '';
            await this.refresh(el);
            if (typeof Nav !== 'undefined' && Nav.refreshBell) Nav.refreshBell();
        } catch (err) {
            // Marked, not silently dropped. Pretending it saved would be
            // worse than admitting it did not.
            temp.classList.remove('is-sending');
            temp.classList.add('is-failed');
            temp.querySelector('time').textContent = 'not sent';
            ta.value = body;
            UI.toast('' + err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    },

    startEdit(id) {
        const msg = document.querySelector(`.dsc-msg[data-id="${id}"]`);
        if (!msg) return;
        const p = msg.querySelector('.dsc-text');
        const current = p.innerText;
        p.outerHTML = `<div class="dsc-editing">
            <textarea rows="2">${this._esc(current)}</textarea>
            <div>
                <button class="btn-sm primary" onclick="Discussion.saveEdit('${this._esc(id)}', this)">Save</button>
                <button class="btn-sm" onclick="Discussion.cancelEdit(this)">Cancel</button>
            </div>
        </div>`;
    },

    async saveEdit(id, btn) {
        const wrap = btn.closest('.dsc-editing');
        const text = wrap.querySelector('textarea').value.trim();
        const el = btn.closest('.dsc').parentElement;
        try {
            await DataService.editComment(id, text);
            await this.refresh(el);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    },

    cancelEdit(btn) {
        const el = btn.closest('.dsc').parentElement;
        this.refresh(el);
    },

    async remove(id) {
        const ok = await Confirm.open('Delete this comment?',
            'It will show as deleted rather than disappearing — removing it outright would leave any reply answering nothing.');
        if (!ok) return;
        const el = document.querySelector(`.dsc-msg[data-id="${id}"]`).closest('.dsc').parentElement;
        try {
            await DataService.deleteComment(id);
            await this.refresh(el);
        } catch (err) { UI.toast('' + err.message, 'error'); }
    }
};
