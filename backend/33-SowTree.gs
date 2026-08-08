/**
 * 33-SowTree.gs — SOW hierarchy (v11 BATCH H4)
 *
 * PURPOSE: A bill of quantities is a tree. "Mobilization and
 * demobilization" sits under "General Requirements"; the heading itself
 * is not priced, the items beneath it are. Until now every surface —
 * SOW Budget, Timeline, Estimates, Reports — showed a flat list, which
 * is not how anyone reads a BOQ.
 *
 * ── THE RULE, AND WHY IT IS THIS ONE ─────────────────────────
 *
 * An item is the PARENT of another when the child's id begins with the
 * parent's id plus a dot:
 *
 *     1        General Requirements        (heading)
 *     1.1        Mobilization and demob
 *     2.2      Excavation                  (heading, and a child of 2)
 *     2.2.1      Excavation — Lagoon BF2
 *
 * The alternative was a `parentId` column. This was chosen because:
 *
 *   · NO SCHEMA CHANGE AND NO MIGRATION. Reorganising the scope of live
 *     projects is not a script worth running on real data.
 *   · The ids in use are already numbered this way — a BOQ always is.
 *   · Nesting is unlimited and costs nothing.
 *
 * The price, stated plainly: THE ID IS NOW STRUCTURAL. Renaming 2.2.1
 * to 3.1 moves it to a different parent. renameSOWId_ (Batch B) already
 * cascades ids through estimates, billings and daily records, so nothing
 * breaks — the tree simply changes, which is correct.
 *
 * ── THE MONEY RULE ───────────────────────────────────────────
 *
 * A heading reports the sum of everything beneath it PLUS anything
 * budgeted on the heading itself.
 *
 * Including the heading's own budget is not decoration. If it were
 * ignored, any project where money had been put on a parent row would
 * silently lose it. Because every row is counted exactly once, the
 * PROJECT TOTAL CANNOT CHANGE because of this feature — which matters,
 * since there are live projects whose numbers clients have already seen.
 *
 * A heading is a PRESENTATION of its children and never a thing in its
 * own right: progress still comes from daily reports on real items,
 * billing still works on the contract basis, and the critical path still
 * runs through real activities.
 */

/** truthy_ - sheets store booleans as TRUE, 'TRUE', 1 or ''. */
function truthy_(v) {
  if (v === true) return true;
  var t = String(v == null ? '' : v).trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes';
}

/** sowTrim_ - ids are compared trimmed; a stray space breaks a tree silently. */
function sowTrim_(v) { return String(v == null ? '' : v).trim(); }

/** sowLevel_ - 1 for "2", 2 for "2.2", 3 for "2.2.1". */
function sowLevel_(id) {
  var t = sowTrim_(id).replace(/\.+$/, '');   // a trailing dot is cosmetic
  if (!t) return 1;
  return t.split('.').length;
}

/** sowIsChildOf_ - true when `child` sits anywhere beneath `parent`. */
function sowIsChildOf_(child, parent) {
  var c = sowTrim_(child).replace(/\.+$/, '');
  var p = sowTrim_(parent).replace(/\.+$/, '');
  if (!c || !p || c === p) return false;
  return c.indexOf(p + '.') === 0;
}

/** sowDirectParent_ - the id one level up, or '' at the top. */
function sowDirectParent_(id) {
  var t = sowTrim_(id).replace(/\.+$/, '');
  var i = t.lastIndexOf('.');
  return i === -1 ? '' : t.slice(0, i);
}

/**
 * sowNaturalKey_ - a sortable key that orders 1.2 before 1.10.
 * Plain string sorting puts "1.10" before "1.2", which reads as a bug
 * to anyone with more than nine items under a heading.
 */
function sowNaturalKey_(id) {
  return sowTrim_(id).replace(/\.+$/, '').split('.').map(function (seg) {
    var n = parseInt(seg, 10);
    return isNaN(n) ? ('~' + seg) : ('000000000' + n).slice(-9);
  }).join('.');
}

/**
 * buildSowTree_ - Annotates and ORDERS a project's SOW items.
 *
 * Adds to each item:
 *   level         1-based depth
 *   parentId      direct parent, '' at the top
 *   isHeading     true when something sits beneath it
 *   childCount    direct children only
 *   rollupBudget  own + all descendants
 *   rollupActual  own + all descendants
 *   rollupProgress budget-weighted across priced descendants
 *   treeOrder     index in the flattened depth-first order
 *
 * ORDERING: depth-first, so a child always follows its parent. Siblings
 * keep the manual sortOrder if one is set, and fall back to the natural
 * id order. Without this, a heading and its children could be separated
 * by an unrelated item and the indentation would be nonsense.
 *
 * PROGRESS IS WEIGHTED BY BUDGET, not averaged. A heading holding one
 * ₱980,000 item at 0% and two ₱50,000 items at 100% must not read 67%.
 */
function buildSowTree_(items, estimateTotals) {
  var list = (items || []).map(function (s) { return s; });
  if (!list.length) return list;

  var byId = {};
  list.forEach(function (s) { byId[sowTrim_(s.id).replace(/\.+$/, '')] = s; });

  // descendants, computed once
  var descendants = {};
  list.forEach(function (p) {
    var pid = sowTrim_(p.id).replace(/\.+$/, '');
    descendants[pid] = list.filter(function (c) { return sowIsChildOf_(c.id, p.id); });
  });

  list.forEach(function (s) {
    var id = sowTrim_(s.id).replace(/\.+$/, '');
    var kids = descendants[id] || [];
    var direct = kids.filter(function (c) { return sowDirectParent_(c.id) === id; });

    s.level = sowLevel_(s.id);
    // A parent id that does not exist as a row means this item is at the
    // top for display purposes — a child with no heading is not an error.
    var dp = sowDirectParent_(s.id);
    s.parentId = (dp && byId[dp]) ? dp : '';
    // ── v11 BATCH I1: WHAT MAKES A HEADING ──
    //
    // Two rules, and the second is the one that fixes existing data.
    //
    // 1. A TITLE FLAGGED AT CREATION is always a heading, even before
    //    anything sits under it. Without this a freshly added title is
    //    indistinguishable from a priced item, so the Timeline reports
    //    "setup incomplete" and the Estimates tab waits for an estimate
    //    that will never come.
    //
    // 2. AN ITEM THAT HAS BEEN PRICED IS NEVER A HEADING, whatever sits
    //    beneath it. Deriving purely from the ids was wrong for data
    //    created before titles existed: an item numbered "1" with a real
    //    estimate became a heading the moment someone added "1.1", and
    //    its estimate vanished from the Estimates tab even though the
    //    money was still in the sheet.
    //
    //    So a heading must have nothing of its own — no estimate, no
    //    budget. That resolves the existing projects with NO migration:
    //    a priced "1" keeps its estimate and simply gains indented
    //    neighbours, and a genuine empty title still becomes a heading.
    //
    //    An explicit flag always wins, so anything the rule gets wrong
    //    can be corrected from the SOW tab.
    var ownEstimate = parseFloat(s.estimateTotal);
    if (isNaN(ownEstimate) && estimateTotals) ownEstimate = parseFloat(estimateTotals[id]);
    ownEstimate = isNaN(ownEstimate) ? 0 : ownEstimate;
    var ownBudget = parseFloat(s.budget) || 0;

    s.isHeading = truthy_(s.isTitle) ||
      (kids.length > 0 && ownEstimate <= 0 && ownBudget <= 0);
    s.childCount = direct.length;

    var own = [s].concat(kids);
    s.rollupBudget = Math.round(own.reduce(function (a, x) {
      return a + (parseFloat(x.budget) || 0); }, 0) * 100) / 100;
    s.rollupActual = Math.round(own.reduce(function (a, x) {
      return a + (parseFloat(x.actual) || 0); }, 0) * 100) / 100;
    // v11 BATCH I1: headings showed budget, actual, variance and progress
    // but not the ESTIMATE — which is the figure the budget is supposed
    // to be checked against, so its absence made the row half a story.
    s.rollupEstimate = Math.round(own.reduce(function (a, x) {
      var v = parseFloat(x.estimateTotal);
      if (isNaN(v) && estimateTotals) v = parseFloat(estimateTotals[sowTrim_(x.id).replace(/\.+$/, '')]);
      return a + (isNaN(v) ? 0 : v);
    }, 0) * 100) / 100;

    var priced = own.filter(function (x) {
      return !(descendants[sowTrim_(x.id).replace(/\.+$/, '')] || []).length &&
             (parseFloat(x.budget) || 0) > 0;
    });
    var wsum = priced.reduce(function (a, x) { return a + (parseFloat(x.budget) || 0); }, 0);
    s.rollupProgress = wsum
      ? Math.round(priced.reduce(function (a, x) {
          return a + (parseFloat(x.budget) || 0) * (parseFloat(x.progress) || 0); }, 0) / wsum * 10) / 10
      : (s.isHeading ? null : (parseFloat(s.progress) || 0));
  });

  // ── depth-first ordering ──
  var childrenOf = {};
  list.forEach(function (s) {
    var key = s.parentId || '';
    (childrenOf[key] = childrenOf[key] || []).push(s);
  });
  Object.keys(childrenOf).forEach(function (k) {
    childrenOf[k].sort(function (a, b) {
      var ao = parseFloat(a.sortOrder), bo = parseFloat(b.sortOrder);
      var aHas = !isNaN(ao), bHas = !isNaN(bo);
      if (aHas && bHas && ao !== bo) return ao - bo;
      return sowNaturalKey_(a.id).localeCompare(sowNaturalKey_(b.id));
    });
  });

  var ordered = [];
  var seen = {};
  var walk = function (parentKey) {
    (childrenOf[parentKey] || []).forEach(function (s) {
      var id = sowTrim_(s.id).replace(/\.+$/, '');
      if (seen[id]) return;              // guards a malformed id cycle
      seen[id] = true;
      s.treeOrder = ordered.length;
      ordered.push(s);
      walk(id);
    });
  };
  walk('');

  // anything unreachable (shouldn't happen) is appended rather than lost
  list.forEach(function (s) {
    var id = sowTrim_(s.id).replace(/\.+$/, '');
    if (!seen[id]) { seen[id] = true; s.treeOrder = ordered.length; ordered.push(s); }
  });

  return ordered;
}

/**
 * sowTreeSpan_ - Earliest start and latest finish beneath a heading, for
 * the Timeline's summary bar. A heading has no dates of its own to drag;
 * it reports its children's span.
 */
function sowTreeSpan_(item, items) {
  if (!item.isHeading) return { start: item.startDate || '', end: item.endDate || '' };
  var kids = (items || []).filter(function (c) { return sowIsChildOf_(c.id, item.id); });
  var starts = [], ends = [];
  kids.forEach(function (c) {
    if (c.startDate) starts.push(String(c.startDate));
    if (c.endDate) ends.push(String(c.endDate));
  });
  if (item.startDate) starts.push(String(item.startDate));
  if (item.endDate) ends.push(String(item.endDate));
  starts.sort(); ends.sort();
  return { start: starts[0] || '', end: ends[ends.length - 1] || '' };
}

// ============================================================
//  CONVERTING AN EXISTING ITEM (v11 BATCH H5)
// ============================================================

/**
 * setSowItemKind - Turns an existing SOW item into a TITLE, or back
 * into a priced item.
 *
 * WHY THIS IS NEEDED. Titles created before the `isTitle` flag existed
 * were indistinguishable from priced items: they were given an estimate
 * group on creation, they appear on the Estimates tab, and if they have
 * no children yet nothing derives them as headings. Hiding them on read
 * was enough to stop them cluttering the screen, but it left the
 * underlying rows wrong — and a record that is wrong in the sheet will
 * eventually surface somewhere the filter does not reach.
 *
 * This fixes the row itself.
 *
 * WHAT IT DOES NOT DO: it never silently deletes an estimate that has
 * money in it. A heading's estimate group is removed only when it is
 * EMPTY. If someone actually priced work against the title, the caller
 * is told what is in there and asked to move it, because deleting
 * priced work to tidy a display is not a trade worth making.
 */
function setSowItemKind(projectId, sowId, isTitle) {
  assertProjectEditor_(projectId);
  var key = { id: sowId, projectId: projectId };
  if (findRowNumWhere_('SOWItems', key) === -1) throw new Error('SOW item not found in this project.');

  if (!isTitle) {
    updateRowWhere_('SOWItems', key, { isTitle: '' });
    logActivity_('SOW ' + sowId + ' changed back to a priced item', 'g', projectId);
    return { success: true, isTitle: false };
  }

  var group = readAll_('EstimateGroups').find(function (g) {
    return g.projectId === projectId && sowTrim_(g.sowId) === sowTrim_(sowId);
  });

  var lines = 0, value = 0;
  if (group) {
    ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment'].forEach(function (sheet) {
      readAll_(sheet).forEach(function (r) {
        if (String(r.groupId) === String(group.id)) { lines++; value += parseFloat(r.cost) || 0; }
      });
    });
    readAll_('EstimateIndirect').forEach(function (r) {
      if (String(r.groupId) === String(group.id)) { lines++; value += parseFloat(r.amount) || 0; }
    });

    if (lines > 0) {
      throw new Error('"' + sowId + '" has ' + lines + ' estimate line(s) worth ' +
        fmtMoney_(value) + ' priced against it. A title carries no estimate of its own — ' +
        'move those lines to the items beneath it first, then mark it as a title. ' +
        'Nothing has been changed.');
    }
    deleteRow_('EstimateGroups', 'id', group.id);
  }

  updateRowWhere_('SOWItems', key, { isTitle: 'TRUE', qty: 0, unit: '', budget: 0, budgetMode: 'manual' });
  logActivity_('SOW ' + sowId + ' marked as a title' +
    (group ? ' — its empty estimate group was removed' : ''), 'blue', projectId);
  return { success: true, isTitle: true, removedGroup: !!group };
}

/**
 * auditSowTitles - Finds SOW items that ARE headings (something sits
 * beneath them) but still carry an estimate group, and reports what is
 * in each one.
 *
 * Read-only. It changes nothing, because the right action depends on
 * what is inside: an empty group can go, a priced one needs a person to
 * decide where that money belongs.
 */
function auditSowTitles(projectId) {
  var items = buildSowTree_(readAll_('SOWItems').filter(function (s) {
    return s.projectId === projectId;
  }));
  var groups = readAll_('EstimateGroups').filter(function (g) { return g.projectId === projectId; });
  var byId = {};
  groups.forEach(function (g) { byId[sowTrim_(g.sowId)] = g; });

  var out = [];
  items.forEach(function (s) {
    if (!s.isHeading) return;
    var g = byId[sowTrim_(s.id)];
    if (!g) return;
    var lines = 0, value = 0;
    ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment'].forEach(function (sheet) {
      readAll_(sheet).forEach(function (r) {
        if (String(r.groupId) === String(g.id)) { lines++; value += parseFloat(r.cost) || 0; }
      });
    });
    readAll_('EstimateIndirect').forEach(function (r) {
      if (String(r.groupId) === String(g.id)) { lines++; value += parseFloat(r.amount) || 0; }
    });
    out.push({
      sowId: s.id, description: s.description, groupId: g.id, status: g.status,
      lineCount: lines, value: Math.round(value * 100) / 100,
      flagged: truthy_(s.isTitle),
      safeToRemove: lines === 0
    });
  });
  return out;
}

/**
 * cleanSowTitleEstimates - Removes the EMPTY estimate groups the audit
 * found. Super Admin only.
 *
 * Groups that hold priced lines are left alone and reported back. This
 * is deliberate: an automated tidy-up that deletes money is worse than
 * the mess it was cleaning.
 */
function cleanSowTitleEstimates(projectId) {
  requireSuperAdmin_('cleaning up estimate groups on SOW titles');
  var audit = auditSowTitles(projectId);
  var removed = [], kept = [];
  audit.forEach(function (a) {
    if (a.safeToRemove) {
      deleteRow_('EstimateGroups', 'id', a.groupId);
      updateRowWhere_('SOWItems', { id: a.sowId, projectId: projectId }, { isTitle: 'TRUE' });
      removed.push(a.sowId);
    } else {
      kept.push(a);
    }
  });
  logActivity_('SOW title cleanup on ' + projectId + ' — ' + removed.length +
    ' empty estimate group(s) removed' +
    (kept.length ? ', ' + kept.length + ' left alone because they hold priced lines' : ''),
    'a', projectId);
  return { success: true, removed: removed, kept: kept };
}
