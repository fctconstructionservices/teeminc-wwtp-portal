// ================================================================
//  core/fast-cache.js — Making it FEEL instant. (v17)
//
//  ── THE DISTINCTION THAT MATTERS ────────────────────────────
//
//  Making the server faster and making the app feel faster are
//  different problems. The backend cache turns a 3-second load into
//  0.5 seconds — real, and still a wait.
//
//  This turns it into no wait at all: the last version you saw is drawn
//  IMMEDIATELY from memory, a fresh copy is fetched behind it, and the
//  screen updates only if something actually changed. Stale, then
//  revalidated.
//
//  ── WHY THIS IS SAFE IN A SYSTEM THAT HOLDS MONEY ───────────
//
//  Showing a figure that is thirty seconds old is only dangerous if the
//  person cannot tell. Three rules make it safe:
//
//  1. WRITES ARE NEVER CACHED. Only reads. Approving, releasing and
//     billing always hit the server.
//  2. A WRITE CLEARS EVERYTHING. The moment anything is submitted from
//     this browser, every cached read is dropped — so you never see
//     your own change missing, which is the failure people actually
//     notice and lose trust over.
//  3. THE REFRESH ALWAYS RUNS. Cached data is never the final answer;
//     it is what fills the screen while the real answer arrives.
//
//  Nothing is written to disk. This lives in memory for the tab's
//  lifetime, so closing the tab is a full reset and there is no stale
//  copy sitting in storage after a password change.
// ================================================================

const FastCache = {

    _mem: {},
    _inflight: {},

    /** Reads that are worth holding. Anything not listed always goes to
     *  the server — the safe default. */
    CACHEABLE: {
        getProjectDataCached: 1, getProjectData: 1,
        getHomeDataCached: 1, getHomeData: 1,
        getPortfolioDataCached: 1, getPortfolioData: 1,
        getTasksForMonthCached: 1,
        getAllPersonnel: 1, getSuppliers: 1, getMaterials: 1, getEquipment: 1,
        getCatalogs: 1, getPrintTemplate: 1
    },

    /** How long a cached copy may be shown before it is considered too
     *  old to draw at all. Beyond this the person waits — a figure from
     *  five minutes ago is not a reasonable thing to put on screen
     *  without saying so. */
    MAX_AGE: 180000,   // 3 minutes

    _key(action, params) {
        return action + '|' + JSON.stringify(params || []);
    },

    /**
     * wrap - the whole mechanism, around one call.
     *
     * @param action   the endpoint name
     * @param params   its arguments
     * @param fetcher  () => Promise, the real call
     * @param onFresh  (data) => void, called again if the fresh copy differs
     */
    async wrap(action, params, fetcher, onFresh) {
        if (!this.CACHEABLE[action]) return await fetcher();

        const key = this._key(action, params);
        const hit = this._mem[key];
        const fresh = hit && (Date.now() - hit.at) < this.MAX_AGE;

        if (fresh) {
            // Revalidate behind the screen. Deliberately not awaited —
            // awaiting it would reintroduce the wait this exists to
            // remove.
            this._revalidate(key, action, fetcher, onFresh, hit.json);
            return hit.data;
        }

        // Two components asking for the same thing at once — a tab and
        // its parent, say — share one request rather than racing.
        if (this._inflight[key]) return await this._inflight[key];

        const p = fetcher().then(data => {
            this._store(key, data);
            delete this._inflight[key];
            return data;
        }).catch(err => {
            delete this._inflight[key];
            throw err;
        });
        this._inflight[key] = p;
        return await p;
    },

    async _revalidate(key, action, fetcher, onFresh, oldJson) {
        if (this._inflight[key]) return;
        this._inflight[key] = true;
        try {
            const data = await fetcher();
            const json = JSON.stringify(data);
            this._store(key, data, json);
            // Redraw ONLY if something changed. Repainting identical
            // data throws away scroll position and any open row for no
            // reason, and people notice that far more than they notice
            // a stale figure.
            if (onFresh && json !== oldJson) onFresh(data);
        } catch (err) {
            // A failed background refresh is not an error the person
            // needs to see — they are looking at data that worked.
        } finally {
            delete this._inflight[key];
        }
    },

    _store(key, data, json) {
        try {
            this._mem[key] = {
                data: data,
                json: json || JSON.stringify(data),
                at: Date.now()
            };
        } catch (err) { /* unserialisable payload — simply not cached */ }
    },

    /**
     * clear - called after ANY write from this browser.
     *
     * Everything goes, not just the affected project. Working out that
     * a receipt against a PO also changes the portfolio, the cashflow
     * and the dashboard is the kind of reasoning that is correct today
     * and wrong after the next feature. Clearing everything costs one
     * uncached load and is never wrong.
     */
    clear() {
        this._mem = {};
    },

    /** Age of a cached entry in seconds, for the freshness marker. */
    ageOf(action, params) {
        const hit = this._mem[this._key(action, params)];
        return hit ? Math.round((Date.now() - hit.at) / 1000) : null;
    }
};
