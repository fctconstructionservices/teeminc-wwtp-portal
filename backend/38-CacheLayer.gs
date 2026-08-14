/**
 * 38-CacheLayer.gs — Making the same answer cost nothing twice. (v17)
 *
 * ── THE MEASUREMENT ─────────────────────────────────────────
 *
 * getProjectData reads 24 sheets. Every call, from scratch. The memo in
 * 03-SheetUtils.gs only lives for the duration of one request, so
 * opening the same project twice costs exactly the same as opening it
 * once, and a room of four people opening it costs four times.
 *
 * CacheService survives BETWEEN requests. That is the whole win.
 *
 * ── WHY STALE DATA IS THE ONLY REAL RISK, AND HOW IT IS HANDLED ──
 *
 * In a system that holds money, a stale figure is worse than a slow
 * one. Somebody approves against a budget that was already spent.
 *
 * The usual approach is to call an invalidate function from every write
 * path. This system has more than forty of them, and the one that gets
 * forgotten is the one that bites — silently, months later.
 *
 * So invalidation is NOT distributed. The API dispatcher already knows
 * which actions write (WRITE_ACTION_RE, used for locking). One call in
 * that one place clears the cache for every write there will ever be,
 * including ones nobody has written yet.
 *
 * Belt and braces on top of that: nothing is cached for longer than
 * CACHE_TTL, so even a hypothetical missed invalidation self-corrects
 * within minutes rather than persisting until someone notices.
 */

/** Short enough that a missed invalidation cannot last, long enough to
 *  cover the way people actually work — open a project, look at four
 *  tabs, go back to the dashboard. */
var CACHE_TTL = 600;               // seconds

/** CacheService rejects values over 100KB. A big project's payload is
 *  larger than that, so it is split across numbered chunks. */
var CACHE_CHUNK = 90000;

function _cache_() {
  try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

/**
 * _cacheGet_ - reassembles a chunked value, or null.
 *
 * Returns null on ANY inconsistency — a missing chunk, a parse failure,
 * a version mismatch. A half-read cache entry must never be served as
 * if it were data.
 */
function _cacheGet_(key) {
  var c = _cache_();
  if (!c) return null;
  try {
    var head = c.get(key + ':head');
    if (!head) return null;
    var meta = JSON.parse(head);
    if (meta.v !== CACHE_VERSION) return null;

    var keys = [];
    for (var i = 0; i < meta.n; i++) keys.push(key + ':' + i);
    var parts = c.getAll(keys);

    var buf = '';
    for (var j = 0; j < meta.n; j++) {
      var p = parts[key + ':' + j];
      // A chunk expired mid-read. Discard the whole thing.
      if (p === undefined || p === null) return null;
      buf += p;
    }
    return JSON.parse(buf);
  } catch (err) {
    return null;
  }
}

function _cachePut_(key, value) {
  var c = _cache_();
  if (!c) return;
  try {
    var s = JSON.stringify(value);
    // Beyond this a payload is better fetched than cached — the
    // reassembly cost starts to outweigh the sheet reads.
    if (s.length > CACHE_CHUNK * 12) return;

    var n = Math.ceil(s.length / CACHE_CHUNK);
    var map = {};
    for (var i = 0; i < n; i++) {
      map[key + ':' + i] = s.substring(i * CACHE_CHUNK, (i + 1) * CACHE_CHUNK);
    }
    c.putAll(map, CACHE_TTL);
    // The head is written LAST and expires FIRST. A reader either sees
    // a complete set or no head at all — never a head pointing at
    // chunks that have gone.
    c.put(key + ':head', JSON.stringify({ n: n, v: CACHE_VERSION }), CACHE_TTL - 30);
  } catch (err) {
    // A cache that cannot write must never break the request it was
    // meant to speed up.
  }
}

/**
 * CACHE_VERSION - bump this and every cached entry is ignored at once.
 *
 * Deploying a change to what getProjectData RETURNS, without bumping
 * this, would serve the old shape to anyone with a warm cache. One
 * character here is the whole deployment story.
 */
var CACHE_VERSION = 'v17.1';

/**
 * invalidateProjectCache_ - called from ONE place: the API dispatcher,
 * on any action that writes.
 *
 * It clears everything rather than reasoning about which project a
 * write touched. Working out that a receipt against a PO affects the
 * project's cost, its EVM, its portfolio row and its cashflow is
 * exactly the kind of reasoning that is right today and wrong after the
 * next feature. Clearing everything is never wrong — it only costs the
 * next reader one uncached load.
 */
function invalidateProjectCache_() {
  var c = _cache_();
  if (!c) return;
  try {
    // Cheaper and more reliable than enumerating keys: move the
    // generation forward and every existing key becomes unreachable.
    var gen = Number(c.get('cache:gen') || 0) + 1;
    c.put('cache:gen', String(gen), 21600);
  } catch (err) { /* never break a write */ }
}

function _gen_() {
  var c = _cache_();
  if (!c) return '0';
  try { return String(c.get('cache:gen') || '0'); } catch (e) { return '0'; }
}

/** _cacheKey_ - the generation is IN the key, so a bump orphans
 *  everything without a delete. */
function _cacheKey_(name, id) {
  return 'g' + _gen_() + ':' + name + ':' + String(id || '');
}

// ============================================================
//  CACHED READS
// ============================================================

/**
 * getProjectDataCached - what the frontend now calls.
 *
 * The uncached function is untouched and still exported, so anything
 * that must be certain of freshness can bypass the cache entirely.
 */
function getProjectDataCached(projectId) {
  var key = _cacheKey_('proj', projectId);
  var hit = _cacheGet_(key);
  if (hit) {
    hit._cached = true;    // the client shows a quiet freshness marker
    return hit;
  }
  var data = getProjectData(projectId);
  if (data) _cachePut_(key, data);
  return data;
}

function getHomeDataCached() {
  // Keyed per user: the dashboard shows what YOU can approve, and one
  // shared entry would show Glenn's queue to JP.
  var key = _cacheKey_('home', currentUserEmail_().toLowerCase());
  var hit = _cacheGet_(key);
  if (hit) { hit._cached = true; return hit; }
  var data = getHomeData();
  if (data) _cachePut_(key, data);
  return data;
}

function getPortfolioDataCached() {
  var key = _cacheKey_('portfolio', currentUserEmail_().toLowerCase());
  var hit = _cacheGet_(key);
  if (hit) { hit._cached = true; return hit; }
  var data = getPortfolioData();
  if (data) _cachePut_(key, data);
  return data;
}

/** clearAllCaches - for the Super Admin, when something looks wrong.
 *  A cache you cannot clear by hand is a cache you stop trusting. */
function clearAllCaches() {
  requireSuperAdmin_('clearing the cache');
  invalidateProjectCache_();
  logActivity_('Cache cleared by ' + currentUserName_(), 'a');
  return { success: true };
}
