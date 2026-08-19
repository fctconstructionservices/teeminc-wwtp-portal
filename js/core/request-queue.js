// ================================================================
//  core/request-queue.js — One thing at a time, and try again. (v25)
//
//  ── WHAT THIS IS FOR ────────────────────────────────────────
//
//  An Apps Script web app does not answer a POST directly. It replies
//  with a 302 to script.googleusercontent.com carrying a one-time
//  token, and the browser follows it. Under concurrency that redirect
//  target sometimes returns 404 — the request was fine, the code was
//  fine, and the answer never arrives.
//
//  It is transient, it is Google's, and there is nothing in the backend
//  that can prevent it. What CAN be controlled is how many requests are
//  in the air at once, and what happens when one fails.
//
//  ── WHY IT STARTED SHOWING UP NOW ───────────────────────────
//
//  Opening the dashboard fires: the home payload, the current month,
//  two prefetched months, the notification bell, and a background
//  revalidation behind each cached read. Five or six at once, from one
//  session, to a backend that serialises per user.
//
//  Deleting a project makes it worse in the way that matters: it is the
//  longest write in the system and it holds the document lock for the
//  whole of it. Everything else queues behind it, times out at the
//  network layer, and retries into the same jam. That is why it looked
//  like the delete caused it — the delete did not break anything, it
//  just held the door.
//
//  ── THE TWO RULES ───────────────────────────────────────────
//
//  1. AT MOST TWO REQUESTS IN FLIGHT. Not one: a single lane makes the
//     app feel slower than it is, because a slow read would block a
//     fast one behind it. Two keeps the pipe busy without stampeding.
//
//  2. A FAILED READ IS RETRIED. A failed WRITE IS NOT — see below,
//     because that distinction is the whole safety of this file.
// ================================================================

const RequestQueue = {

    /** How many may be in the air at once. */
    LIMIT: 2,

    /** Retry only these. A 404 here is the redirect flake, not a missing
     *  endpoint — a genuinely wrong URL fails every time and the retries
     *  simply exhaust and report it. */
    RETRY_STATUS: { 404: 1, 429: 1, 500: 1, 502: 1, 503: 1, 504: 1 },

    /** Three attempts. Beyond that the delay a person waits is worse
     *  than the error they could have acted on a minute ago. */
    MAX_TRIES: 3,

    _active: 0,
    _waiting: [],

    /**
     * run - queues a request.
     *
     * @param fn      () => Promise, performs the fetch
     * @param opts    { retry: bool }
     */
    run(fn, opts) {
        return new Promise((resolve, reject) => {
            this._waiting.push({ fn: fn, opts: opts || {}, resolve, reject });
            this._pump();
        });
    },

    _pump() {
        while (this._active < this.LIMIT && this._waiting.length) {
            const job = this._waiting.shift();
            this._active++;
            this._attempt(job, 1);
        }
    },

    async _attempt(job, tryNo) {
        try {
            const result = await job.fn();
            this._active--;
            job.resolve(result);
            this._pump();
        } catch (err) {
            const status = err && err.httpStatus;
            const retryable = job.opts.retry &&
                tryNo < this.MAX_TRIES &&
                (this.RETRY_STATUS[status] || err.name === 'TypeError');

            if (!retryable) {
                this._active--;
                job.reject(err);
                this._pump();
                return;
            }

            // Backoff with a little randomness. Without the jitter, five
            // requests that failed together would all retry at the same
            // instant and recreate the pile-up that caused it.
            const wait = (tryNo * 700) + Math.floor(Math.random() * 400);
            setTimeout(() => this._attempt(job, tryNo + 1), wait);
        }
    },

    /** Depth, for the "still working" indicator. */
    pending() { return this._active + this._waiting.length; }
};
