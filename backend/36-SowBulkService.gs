/**
 * 36-SowBulkService.gs — Adding a whole bill of quantities at once. (v15)
 *
 * WHY. Entering a BOQ one row at a time through a modal is forty
 * separate form submissions for a job of any size. Nobody does that
 * twice — they enter half of it and give up, and the project runs on an
 * incomplete scope.
 *
 * ── INDENTATION IS THE STRUCTURE ─────────────────────────────
 *
 * You paste an outline. The indentation makes the tree, and the tree
 * makes the ids:
 *
 *     General Requirements                  →  1
 *       Mobilization | 1 | lot              →  1.1
 *       Temporary facilities | 1 | lot      →  1.2
 *     Earthworks                            →  2
 *       Clearing | 12000 | sq.m             →  2.1
 *       Excavation                          →  2.2
 *         Lagoon BF2 | 4200 | cu.m          →  2.2.1
 *         Lagoon NF2 | 5100 | cu.m          →  2.2.2
 *
 * NOBODY TYPES AN ID. That matters more than it sounds: the ids are
 * structural in this system, so a person typing them by hand is a
 * person who can silently put an item under the wrong heading.
 *
 * ── WHAT MAKES SOMETHING A TITLE ─────────────────────────────
 *
 * An item with anything indented beneath it is a title. Everything else
 * is priced and needs a quantity and a unit.
 *
 * Darwin's rule was "not indented = title", which is exactly right for
 * a two-level BOQ. This is the same rule generalised: at three levels,
 * "Excavation" IS indented and IS still a heading, because things sit
 * under it. Deriving from children rather than from depth means the
 * rule does not break the first time someone nests one level further.
 */

/**
 * parseSowOutline_ - text in, structured rows out. Pure, so the client
 * can preview exactly what the server will write.
 *
 * Columns after the description are separated by | or by a tab:
 *     description | qty | unit
 *
 * Returns { rows, errors }. Never throws on bad input — a paste of
 * forty lines with one mistake should show the mistake, not refuse the
 * other thirty-nine.
 */
function parseSowOutline_(text) {
  var lines = String(text || '').replace(/\r/g, '').split('\n');
  var rows = [], errors = [];
  var counters = [];       // running number at each depth
  var stack = [];          // id at each depth

  lines.forEach(function (raw, i) {
    if (!raw.trim()) return;                       // blank lines separate sections
    if (/^\s*(#|\/\/)/.test(raw)) return;          // let people keep notes in the paste

    // A tab is worth two spaces. Mixing them in one paste is common
    // when half of it came from Excel and half was typed.
    var expanded = raw.replace(/\t/g, '  ');
    var indent = expanded.length - expanded.replace(/^ +/, '').length;
    var depth = Math.floor(indent / 2);            // 2 spaces per level

    var parts = expanded.trim().split(/\s*\|\s*/);
    var desc = String(parts[0] || '').trim();
    var qty = parts.length > 1 ? parseFloat(parts[1]) : null;
    var unit = parts.length > 2 ? String(parts[2]).trim() : '';

    if (!desc) {
      errors.push({ line: i + 1, text: raw, message: 'No description on this line.' });
      return;
    }
    if (desc.length > 200) {
      errors.push({ line: i + 1, text: raw, message: 'Description is over 200 characters.' });
      return;
    }

    // Jumping two levels at once is almost always a stray space, and
    // silently accepting it puts the item under the wrong parent.
    if (depth > stack.length) {
      errors.push({
        line: i + 1, text: raw,
        message: 'Indented too far — this jumps ' + (depth - stack.length) +
          ' level(s) past its parent. Check for a stray space.'
      });
      return;
    }

    counters = counters.slice(0, depth + 1);
    stack = stack.slice(0, depth);
    counters[depth] = (counters[depth] || 0) + 1;

    var id = stack.length ? stack[stack.length - 1] + '.' + counters[depth]
                          : String(counters[depth]);
    stack.push(id);

    rows.push({
      line: i + 1, id: id, depth: depth, description: desc,
      qty: (qty === null || isNaN(qty)) ? 0 : qty,
      unit: unit,
      isTitle: false                                // decided below
    });
  });

  // A title is anything with something beneath it. Decided AFTER the
  // whole outline is read, because you cannot know whether a line is a
  // heading until you have seen the line after it.
  rows.forEach(function (r, i) {
    var next = rows[i + 1];
    r.isTitle = !!(next && next.depth > r.depth);
  });

  // A priced item with no quantity is the single most common paste
  // mistake, and it is the one that quietly breaks the budget check
  // later, so it is caught here rather than at billing time.
  rows.forEach(function (r) {
    if (r.isTitle) { r.qty = 0; r.unit = ''; return; }
    if (!(r.qty > 0)) {
      errors.push({
        line: r.line, text: r.description,
        message: 'Needs a quantity — write it as "' + r.description + ' | 100 | sq.m". ' +
          'Indent something under it instead if it is meant to be a heading.'
      });
    } else if (!r.unit) {
      errors.push({ line: r.line, text: r.description, message: 'Needs a unit after the quantity.' });
    }
  });

  return { rows: rows, errors: errors };
}

/**
 * previewSowOutline - what WOULD be created. Read-only, so the person
 * sees the generated ids and which rows became titles before anything
 * is written. Also reports collisions with what is already there.
 */
function previewSowOutline(projectId, text) {
  requireLogin_();
  var parsed = parseSowOutline_(text);

  var existing = {};
  readAll_('SOWItems').forEach(function (s) {
    if (s.projectId === projectId) existing[String(s.id).trim()] = s.description || '';
  });

  parsed.rows.forEach(function (r) {
    r.collides = existing[r.id] !== undefined;
    r.existingDescription = r.collides ? existing[r.id] : '';
  });

  var collisions = parsed.rows.filter(function (r) { return r.collides; });
  return {
    rows: parsed.rows,
    errors: parsed.errors,
    titles: parsed.rows.filter(function (r) { return r.isTitle; }).length,
    priced: parsed.rows.filter(function (r) { return !r.isTitle; }).length,
    collisions: collisions.length,
    existingCount: Object.keys(existing).length
  };
}

/**
 * addSOWItemsBulk - writes the whole outline.
 *
 * ALL OR NOTHING. Validation runs over every row first; one bad line
 * and nothing is written. A half-imported bill of quantities is worse
 * than none, because the person believes it worked and only finds the
 * gap when a billing will not go through.
 */
function addSOWItemsBulk(projectId, text, opts) {
  assertProjectEditor_(projectId);
  opts = opts || {};

  var parsed = parseSowOutline_(text);
  if (parsed.errors.length) {
    throw new Error(parsed.errors.length + ' line(s) need fixing before anything can be imported:\n' +
      parsed.errors.slice(0, 6).map(function (e) { return '  Line ' + e.line + ': ' + e.message; }).join('\n') +
      (parsed.errors.length > 6 ? '\n  …and ' + (parsed.errors.length - 6) + ' more' : ''));
  }
  if (!parsed.rows.length) throw new Error('Nothing to import — paste an outline first.');

  var existing = {};
  readAll_('SOWItems').forEach(function (s) {
    if (s.projectId === projectId) existing[String(s.id).trim()] = true;
  });

  var clashes = parsed.rows.filter(function (r) { return existing[r.id]; });
  if (clashes.length && !opts.replaceExisting) {
    throw new Error(clashes.length + ' of these ids already exist on this project (' +
      clashes.slice(0, 5).map(function (c) { return c.id; }).join(', ') +
      '). Import into an empty project, or tick "replace" to overwrite them.');
  }

  var now = new Date();
  var written = 0, replaced = 0, groups = 0;

  parsed.rows.forEach(function (r, i) {
    var row = {
      id: r.id, projectId: projectId,
      description: r.description,
      budget: 0, actual: 0,
      startDate: '', endDate: '', status: '',
      qty: r.qty, unit: r.unit,
      budgetMode: 'manual', predecessors: '',
      isMilestone: '', baselineStart: '', baselineEnd: '',
      sortOrder: (i + 1) * 1000,
      isTitle: r.isTitle ? 'TRUE' : ''
    };

    if (existing[r.id]) {
      // Replace the DESCRIPTION and structure, never the money. An
      // import that wipes a budget somebody set by hand would be a very
      // expensive convenience.
      updateRowWhere_('SOWItems', { id: r.id, projectId: projectId }, {
        description: r.description, qty: r.qty, unit: r.unit,
        isTitle: row.isTitle, sortOrder: row.sortOrder
      });
      replaced++;
    } else {
      appendRow_('SOWItems', row);
      written++;
    }

    // Only priced items get an estimate group. A title has nothing to
    // price — giving it one is what put draft estimates nobody could
    // approve on the Estimates tab.
    if (!r.isTitle && !existing[r.id]) {
      appendRow_('EstimateGroups', {
        id: nextId_('EG'), projectId: projectId, sowId: r.id,
        sowDescription: r.description, status: 'draft',
        submittedBy: '', approvedAt: '', createdAt: now, updatedAt: now
      });
      groups++;
    }
  });

  logActivity_('Bill of quantities imported into ' + projectId + ' — ' +
    written + ' added, ' + replaced + ' updated, ' +
    parsed.rows.filter(function (r) { return r.isTitle; }).length + ' title(s), ' +
    groups + ' estimate group(s) created', 'blue', projectId);

  return {
    success: true, added: written, updated: replaced,
    titles: parsed.rows.filter(function (r) { return r.isTitle; }).length,
    priced: parsed.rows.filter(function (r) { return !r.isTitle; }).length,
    estimateGroups: groups
  };
}
