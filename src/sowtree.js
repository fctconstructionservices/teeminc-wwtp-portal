import { num } from './util.js';

function truthy(v) {
  if (v === true) return true;
  const t = String(v == null ? '' : v).trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes';
}

/** trimId - ids compare trimmed, and a trailing dot is cosmetic. */
function trimId(v) {
  return String(v == null ? '' : v).trim().replace(/\.+$/, '');
}

/** levelOf - 1 for "2", 2 for "2.2", 3 for "2.2.1". */
function levelOf(id) {
  const t = trimId(id);
  return t ? t.split('.').length : 1;
}

function isChildOf(child, parent) {
  const c = trimId(child), p = trimId(parent);
  if (!c || !p || c === p) return false;
  return c.indexOf(p + '.') === 0;
}

function directParent(id) {
  const t = trimId(id);
  const i = t.lastIndexOf('.');
  return i === -1 ? '' : t.slice(0, i);
}

/**
 * naturalKey - sorts 1.2 before 1.10.
 * Plain string sorting puts "1.10" first, which reads as a bug to
 * anyone with more than nine items under a heading.
 */
function naturalKey(id) {
  return trimId(id).split('.').map((seg) => {
    const n = parseInt(seg, 10);
    return Number.isNaN(n) ? '~' + seg : ('000000000' + n).slice(-9);
  }).join('.');
}

/**
 * buildSowTree - annotates and ORDERS a project's scope items.
 *
 * Adds: level, parentId, isHeading, childCount, rollup{Budget,Actual,
 * Estimate,Progress}, spanStart/spanEnd and treeOrder.
 *
 * ORDERING is depth-first so a child always follows its parent; without
 * it a heading and its children could be separated by an unrelated item
 * and the indentation would be nonsense. Siblings keep a manual
 * sortOrder when set, else fall back to natural id order.
 *
 * WHAT MAKES A HEADING — two rules, and the second is what makes
 * existing data behave:
 *   1. A title flagged at creation is always a heading, even before
 *      anything sits under it. Otherwise a freshly added title looks
 *      like a priced item and the Estimates tab waits forever for an
 *      estimate that will never come.
 *   2. An item that has been PRICED is never a heading, whatever sits
 *      beneath it. Deriving purely from ids broke data created before
 *      titles existed: a priced "1" became a heading the moment someone
 *      added "1.1", and its estimate vanished from the tab even though
 *      the money was still there.
 *
 * PROGRESS IS BUDGET-WEIGHTED, not averaged: a heading holding one
 * ₱980,000 item at 0% and two ₱50,000 items at 100% must not read 67%.
 */
export function buildSowTree(items) {
  const list = (items || []).slice();
  if (!list.length) return list;

  const byId = new Map();
  for (const s of list) byId.set(trimId(s.id), s);

  const descendants = new Map();
  for (const p of list) {
    descendants.set(trimId(p.id), list.filter((c) => isChildOf(c.id, p.id)));
  }

  for (const s of list) {
    const id = trimId(s.id);
    const kids = descendants.get(id) || [];
    const direct = kids.filter((c) => directParent(c.id) === id);

    s.level = levelOf(s.id);
    // A parent id with no row of its own means this item is top-level
    // for display purposes — a child without a heading is not an error.
    const dp = directParent(s.id);
    s.parentId = dp && byId.has(dp) ? dp : '';

    const ownEstimate = num(s.estimateTotal);
    const ownBudget = num(s.budget);
    s.isHeading = truthy(s.isTitle) || (kids.length > 0 && ownEstimate <= 0 && ownBudget <= 0);
    s.childCount = direct.length;

    const own = [s, ...kids];
    const r2 = (n) => Math.round(n * 100) / 100;
    s.rollupBudget = r2(own.reduce((a, x) => a + num(x.budget), 0));
    s.rollupActual = r2(own.reduce((a, x) => a + num(x.actual), 0));
    s.rollupEstimate = r2(own.reduce((a, x) => a + num(x.estimateTotal), 0));

    const priced = own.filter((x) => !(descendants.get(trimId(x.id)) || []).length && num(x.budget) > 0);
    const wsum = priced.reduce((a, x) => a + num(x.budget), 0);
    s.rollupProgress = wsum
      ? Math.round((priced.reduce((a, x) => a + num(x.budget) * num(x.progress), 0) / wsum) * 10) / 10
      : (s.isHeading ? null : num(s.progress));

    // A heading has no dates of its own to drag; it reports the span of
    // whatever sits beneath it, which is what the Timeline draws.
    if (s.isHeading) {
      const dated = kids.filter((k) => k.startDate && k.endDate);
      s.spanStart = dated.reduce((mn, k) => (!mn || k.startDate < mn ? k.startDate : mn), '');
      s.spanEnd = dated.reduce((mx, k) => (!mx || k.endDate > mx ? k.endDate : mx), '');
    } else {
      s.spanStart = s.startDate || '';
      s.spanEnd = s.endDate || '';
    }
  }

  // ── depth-first ordering ──
  const childrenOf = new Map();
  for (const s of list) {
    const key = s.parentId || '';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(s);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => {
      const ao = Number(a.sortOrder), bo = Number(b.sortOrder);
      const aHas = Number.isFinite(ao), bHas = Number.isFinite(bo);
      if (aHas && bHas && ao !== bo) return ao - bo;
      return naturalKey(a.id).localeCompare(naturalKey(b.id));
    });
  }

  const ordered = [];
  const seen = new Set();
  const walk = (parentKey) => {
    for (const s of childrenOf.get(parentKey) || []) {
      const id = trimId(s.id);
      if (seen.has(id)) continue;   // guards a malformed id cycle
      seen.add(id);
      s.treeOrder = ordered.length;
      ordered.push(s);
      walk(id);
    }
  };
  walk('');

  // Anything unreachable is appended rather than lost.
  for (const s of list) {
    const id = trimId(s.id);
    if (!seen.has(id)) { seen.add(id); s.treeOrder = ordered.length; ordered.push(s); }
  }

  return ordered;
}
