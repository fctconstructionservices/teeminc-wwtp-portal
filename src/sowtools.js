import { all, batchAll, first, run } from './db.js';
import { logActivity, low, nextId, nowIso, num, requireRole } from './util.js';

/**
 * parseSowOutline - turn a pasted bill of quantities into scope items.
 *
 * FORMAT: indentation gives the hierarchy (two spaces per level, a tab
 * counts as two — mixing them is common when half the paste came from
 * Excel), and `description | qty | unit` prices a line. Ids are
 * GENERATED from position, so the person pastes structure and gets
 * 1, 1.1, 1.2, 2 … without numbering anything by hand.
 */
function parseSowOutline(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const rows = [];
  const errors = [];
  let counters = [];
  let stack = [];

  lines.forEach((raw, i) => {
    if (!raw.trim()) return;                 // blank lines separate sections
    if (/^\s*(#|\/\/)/.test(raw)) return;    // let people keep notes in the paste

    const expanded = raw.replace(/\t/g, '  ');
    const indent = expanded.length - expanded.replace(/^ +/, '').length;
    const depth = Math.floor(indent / 2);

    const parts = expanded.trim().split(/\s*\|\s*/);
    const desc = String(parts[0] || '').trim();
    const qtyRaw = parts.length > 1 ? parseFloat(parts[1]) : null;
    const unit = parts.length > 2 ? String(parts[2]).trim() : '';

    if (!desc) { errors.push({ line: i + 1, text: raw, message: 'No description on this line.' }); return; }
    if (desc.length > 200) { errors.push({ line: i + 1, text: raw, message: 'Description is over 200 characters.' }); return; }

    // Jumping two levels at once is almost always a stray space, and
    // accepting it silently puts the item under the wrong parent.
    if (depth > stack.length) {
      errors.push({
        line: i + 1, text: raw,
        message: `Indented too far — this jumps ${depth - stack.length} level(s) past its parent. Check for a stray space.`,
      });
      return;
    }

    counters = counters.slice(0, depth + 1);
    stack = stack.slice(0, depth);
    counters[depth] = (counters[depth] || 0) + 1;

    const id = stack.length ? `${stack[stack.length - 1]}.${counters[depth]}` : String(counters[depth]);
    stack.push(id);

    rows.push({
      line: i + 1, id, depth, description: desc,
      qty: qtyRaw === null || Number.isNaN(qtyRaw) ? 0 : qtyRaw,
      unit,
      isTitle: false,   // decided below
    });
  });

  // A title is anything with something beneath it — decided only after
  // the whole outline is read, because you cannot know a line is a
  // heading until you have seen the line after it.
  rows.forEach((r, i) => {
    const next = rows[i + 1];
    r.isTitle = !!(next && next.depth > r.depth);
  });

  // A priced item with no quantity is the most common paste mistake and
  // the one that quietly breaks the budget check later, so it is caught
  // here rather than at billing time.
  for (const r of rows) {
    if (r.isTitle) { r.qty = 0; r.unit = ''; continue; }
    if (!(r.qty > 0)) {
      errors.push({
        line: r.line, text: r.description,
        message: `Needs a quantity — write it as "${r.description} | 100 | sq.m". Indent something under it instead if it is meant to be a heading.`,
      });
    } else if (!r.unit) {
      errors.push({ line: r.line, text: r.description, message: 'Needs a unit after the quantity.' });
    }
  }

  return { rows, errors };
}

/**
 * previewSowOutline - what WOULD be created, read-only, so the person
 * sees the generated ids and which rows became titles before anything
 * is written. Also reports collisions with what is already there.
 */
export async function previewSowOutline(env, _identity, projectId, text) {
  const parsed = parseSowOutline(text);
  const existingRows = await all(env, 'SELECT id, description FROM SOWItems WHERE projectId = ?', projectId);
  const existing = new Map(existingRows.map((s) => [String(s.id).trim(), s.description || '']));

  for (const r of parsed.rows) {
    r.collides = existing.has(r.id);
    r.existingDescription = r.collides ? existing.get(r.id) : '';
  }

  return {
    rows: parsed.rows,
    errors: parsed.errors,
    titles: parsed.rows.filter((r) => r.isTitle).length,
    priced: parsed.rows.filter((r) => !r.isTitle).length,
    collisions: parsed.rows.filter((r) => r.collides).length,
    existingCount: existing.size,
  };
}

export async function addSOWItemsBulk(env, identity, projectId, text, opts) {
  const o = opts || {};
  const parsed = parseSowOutline(text);
  if (!parsed.rows.length) throw new Error('Nothing to add.');
  if (parsed.errors.length && !o.ignoreErrors) {
    throw new Error(`${parsed.errors.length} line(s) need fixing before this can be imported.`);
  }

  const existingRows = await all(env, 'SELECT id, sortOrder FROM SOWItems WHERE projectId = ?', projectId);
  const taken = new Set(existingRows.map((r) => String(r.id).trim()));
  let sortOrder = existingRows.reduce((m, r) => Math.max(m, num(r.sortOrder)), 0);

  let added = 0, updated = 0;
  for (const item of parsed.rows) {
    if (taken.has(item.id)) {
      // A collision updates the description and quantity but never the
      // budget or actual — those are money, and a paste must not move
      // money without anyone deciding to.
      await run(
        env,
        'UPDATE SOWItems SET description = ?, qty = ?, unit = ?, isTitle = ? WHERE projectId = ? AND id = ?',
        item.description, item.qty, item.unit, item.isTitle ? '1' : '', projectId, item.id
      );
      updated++;
      continue;
    }
    sortOrder += 1000;
    await run(
      env,
      `INSERT INTO SOWItems (id, projectId, description, budget, actual, startDate, endDate, status,
         qty, unit, budgetMode, predecessors, isMilestone, baselineStart, baselineEnd, sortOrder, isTitle)
       VALUES (?, ?, ?, 0, 0, '', '', 'On Track', ?, ?, 'manual', '', '', '', '', ?, ?)`,
      item.id, projectId, item.description, item.qty, item.unit, String(sortOrder), item.isTitle ? '1' : ''
    );
    taken.add(item.id);
    added++;
  }
  await logActivity(env, identity.email, `${added} scope item(s) added, ${updated} updated in ${projectId}.`, 'blue');
  return { success: true, added, updated, skipped: 0 };
}

export async function repairSowSchedules(env, identity, projectId) {
  // A scope item with an end before its start renders as a negative bar
  // on the Gantt and breaks the critical-path walk.
  const rows = await all(env, 'SELECT id, startDate, endDate FROM SOWItems WHERE projectId = ?', projectId);
  let fixed = 0;
  for (const r of rows) {
    if (r.startDate && r.endDate && String(r.endDate) < String(r.startDate)) {
      await run(env, 'UPDATE SOWItems SET endDate = ? WHERE projectId = ? AND id = ?', r.startDate, projectId, r.id);
      fixed++;
    }
  }
  return { success: true, fixed };
}

export async function repairSowIds(env, identity, projectId) {
  // Sheets used to coerce ids like "1.10" into the number 1.1, which
  // collided with a real "1.1". D1 stores them as TEXT, so the only
  // repair still needed is trimming stray whitespace.
  const rows = await all(env, 'SELECT id FROM SOWItems WHERE projectId = ?', projectId);
  let fixed = 0;
  for (const r of rows) {
    const trimmed = String(r.id).trim();
    if (trimmed !== String(r.id)) {
      await run(env, 'UPDATE SOWItems SET id = ? WHERE projectId = ? AND id = ?', trimmed, projectId, r.id);
      fixed++;
    }
  }
  return { success: true, fixed };
}

/**
 * auditSowTitles - which heading rows carry an estimate they should not.
 *
 * A title row is a heading: pricing it double-counts it against its own
 * children. Returns one row per offending heading — the tab renders the
 * list directly, and `safeToRemove` marks the ones whose estimate group
 * is empty and can therefore be dropped without losing any figures.
 */
export async function auditSowTitles(env, _identity, projectId) {
  const [rows, groups] = await Promise.all([
    all(env, 'SELECT * FROM SOWItems WHERE projectId = ?', projectId),
    all(env, 'SELECT id, sowId, status FROM EstimateGroups WHERE projectId = ?', projectId),
  ]);
  const groupBySow = new Map(groups.map((g) => [String(g.sowId).trim(), g]));

  const titles = rows.filter((r) => r.isTitle && String(r.isTitle) !== 'false');
  const out = [];
  for (const s of titles) {
    const g = groupBySow.get(String(s.id).trim());
    if (!g) continue;

    const [mats, labor, equip, indirect] = await batchAll(env, [
      ['SELECT cost FROM EstimateMaterials WHERE groupId = ?', g.id],
      ['SELECT cost FROM EstimateLabor WHERE groupId = ?', g.id],
      ['SELECT cost FROM EstimateEquipment WHERE groupId = ?', g.id],
      ['SELECT amount FROM EstimateIndirect WHERE groupId = ?', g.id],
    ]);
    const lineCount = mats.length + labor.length + equip.length + indirect.length;
    const value = [...mats, ...labor, ...equip].reduce((t, r) => t + num(r.cost), 0)
      + indirect.reduce((t, r) => t + num(r.amount), 0);

    out.push({
      sowId: s.id,
      description: s.description,
      groupId: g.id,
      status: g.status,
      lineCount,
      value: Math.round(value * 100) / 100,
      flagged: true,
      safeToRemove: lineCount === 0,
    });
  }
  return out;
}

export async function cleanSowTitleEstimates(env, identity, projectId) {
  const audit = await auditSowTitles(env, null, projectId);
  let cleaned = 0;
  for (const o of audit) {
    await run(env, 'UPDATE SOWItems SET budget = 0 WHERE projectId = ? AND id = ?', projectId, o.sowId);
    const groups = await all(env, 'SELECT id FROM EstimateGroups WHERE projectId = ? AND sowId = ?', projectId, o.sowId);
    for (const g of groups) {
      await run(env, 'DELETE FROM EstimateMaterials WHERE groupId = ?', g.id);
      await run(env, 'DELETE FROM EstimateLabor WHERE groupId = ?', g.id);
      await run(env, 'DELETE FROM EstimateEquipment WHERE groupId = ?', g.id);
      await run(env, 'DELETE FROM EstimateIndirect WHERE groupId = ?', g.id);
      await run(env, 'DELETE FROM EstimateGroups WHERE id = ?', g.id);
    }
    cleaned++;
  }
  await logActivity(env, identity.email, `${cleaned} title rows cleaned in ${projectId}.`, 'a');
  return { success: true, cleaned };
}

// ─── PROJECT DELETE / DUPLICATE ────────────────────────────────

const CHILD_TABLES = [
  'SOWItems', 'DailyRecords', 'EstimateGroups', 'Billings', 'VariationOrders',
  'CashAdvanceRequests', 'CashRelease', 'IncomingCashRequests', 'Liquidations',
  'OTRequests', 'Punchlist', 'SafetyRecords', 'Drawings', 'QaqcRecords',
  'ProjectDocuments', 'PurchaseRequests', 'PurchaseOrders', 'Receipts',
  'SupplierInvoices', 'Tasks', 'Comments', 'Quotations', 'LessonsLearned',
];

export async function previewProjectDelete(env, identity, projectId) {
  requireRole(identity, ['superadmin'], 'deleting a project');
  const counts = {};
  let total = 0;
  for (const t of CHILD_TABLES) {
    const r = await first(env, `SELECT COUNT(*) AS n FROM "${t}" WHERE projectId = ?`, projectId);
    const n = r ? r.n : 0;
    if (n) { counts[t] = n; total += n; }
  }
  const proj = await first(env, 'SELECT name FROM Projects WHERE id = ?', projectId);
  return { projectId, name: proj ? proj.name : '', counts, total };
}

export async function deleteProject(env, identity, projectId, confirmName) {
  requireRole(identity, ['superadmin'], 'deleting a project');
  const proj = await first(env, 'SELECT name FROM Projects WHERE id = ?', projectId);
  if (!proj) throw new Error('That project no longer exists.');
  // Typing the name is the only guard between a click and losing a
  // project's entire history.
  if (String(confirmName || '').trim() !== String(proj.name).trim()) {
    throw new Error('The typed name does not match the project name.');
  }

  const groups = await all(env, 'SELECT id FROM EstimateGroups WHERE projectId = ?', projectId);
  for (const g of groups) {
    await run(env, 'DELETE FROM EstimateMaterials WHERE groupId = ?', g.id);
    await run(env, 'DELETE FROM EstimateLabor WHERE groupId = ?', g.id);
    await run(env, 'DELETE FROM EstimateEquipment WHERE groupId = ?', g.id);
    await run(env, 'DELETE FROM EstimateIndirect WHERE groupId = ?', g.id);
  }
  for (const t of CHILD_TABLES) {
    await run(env, `DELETE FROM "${t}" WHERE projectId = ?`, projectId);
  }
  await run(env, 'DELETE FROM Projects WHERE id = ?', projectId);
  await logActivity(env, identity.email, `Project "${proj.name}" (${projectId}) deleted.`, 'a');
  return { success: true };
}

export async function duplicatePreview(env, _identity, sourceId) {
  const proj = await first(env, 'SELECT id, name FROM Projects WHERE id = ?', sourceId);
  if (!proj) throw new Error('That project no longer exists.');
  const [sow, groups] = await Promise.all([
    first(env, 'SELECT COUNT(*) AS n FROM SOWItems WHERE projectId = ?', sourceId),
    first(env, 'SELECT COUNT(*) AS n FROM EstimateGroups WHERE projectId = ?', sourceId),
  ]);
  return {
    source: proj,
    sowItems: sow ? sow.n : 0,
    estimateGroups: groups ? groups.n : 0,
  };
}

export async function duplicateProject(env, identity, sourceId, opts) {
  requireRole(identity, ['superadmin', 'admin'], 'duplicating a project');
  const o = opts || {};
  const src = await first(env, 'SELECT * FROM Projects WHERE id = ?', sourceId);
  if (!src) throw new Error('That project no longer exists.');

  const newId = o.newId || nextId('PID');
  const existing = await first(env, 'SELECT id FROM Projects WHERE id = ?', newId);
  if (existing) throw new Error('A project with that id already exists.');

  await run(
    env,
    `INSERT INTO Projects (id, name, status, revenue, expenses, cashPosition, clientId, location,
       startDate, endDate, contractValue, retentionPct, editorsJSON, downpaymentPct, copiedFrom,
       archivedAt, archiveReason, previousStatus, vatPct, vatRegistered)
     VALUES (?, ?, 'Quotation', 0, 0, 0, ?, ?, '', '', ?, ?, ?, ?, ?, '', '', '', ?, ?)`,
    newId, o.newName || `${src.name} (copy)`, src.clientId || '', src.location || '',
    num(src.contractValue), num(src.retentionPct), src.editorsJSON || '[]',
    num(src.downpaymentPct), sourceId, num(src.vatPct), src.vatRegistered || 0
  );

  const sow = await all(env, 'SELECT * FROM SOWItems WHERE projectId = ?', sourceId);
  for (const s of sow) {
    await run(
      env,
      `INSERT INTO SOWItems (id, projectId, description, budget, actual, startDate, endDate, status,
         qty, unit, budgetMode, predecessors, isMilestone, baselineStart, baselineEnd, sortOrder, isTitle)
       VALUES (?, ?, ?, ?, 0, '', '', 'On Track', ?, ?, ?, ?, ?, '', '', ?, ?)`,
      s.id, newId, s.description, o.includeBudgets ? num(s.budget) : 0,
      num(s.qty), s.unit || '', s.budgetMode || 'manual', s.predecessors || '',
      s.isMilestone || '', s.sortOrder || '', s.isTitle || ''
    );
  }

  if (o.includeEstimates) {
    const groups = await all(env, 'SELECT * FROM EstimateGroups WHERE projectId = ?', sourceId);
    for (const g of groups) {
      const newGroupId = nextId('EG');
      await run(
        env,
        `INSERT INTO EstimateGroups (id, projectId, sowId, sowDescription, status, submittedBy)
         VALUES (?, ?, ?, ?, 'draft', ?)`,
        newGroupId, newId, g.sowId || '', g.sowDescription || '', low(identity.email)
      );
      for (const [table, cols] of [
        ['EstimateMaterials', ['material', 'materialName', 'desc', 'qty', 'rate', 'cost', 'unit']],
        ['EstimateLabor', ['role', 'desc', 'qty', 'duration', 'rate', 'cost']],
        ['EstimateEquipment', ['equipment', 'equipName', 'desc', 'qty', 'duration', 'rate', 'cost', 'unit']],
        ['EstimateIndirect', ['desc', 'type', 'amount', 'multiplier']],
      ]) {
        const rows = await all(env, `SELECT * FROM "${table}" WHERE groupId = ?`, g.id);
        for (const r of rows) {
          const placeholders = cols.map(() => '?').join(', ');
          await run(
            env,
            `INSERT INTO "${table}" (id, groupId, ${cols.map((c) => `"${c}"`).join(', ')}) VALUES (?, ?, ${placeholders})`,
            nextId('EST'), newGroupId, ...cols.map((c) => r[c])
          );
        }
      }
    }
  }

  await logActivity(env, identity.email, `Project ${sourceId} duplicated as ${newId}.`, 'g');
  return { success: true, id: newId };
}

export async function generateProjectRetrospective(env, identity, projectId) {
  const proj = await first(env, 'SELECT * FROM Projects WHERE id = ?', projectId);
  if (!proj) throw new Error('That project no longer exists.');

  const [sow, billings, releases, daily] = await Promise.all([
    all(env, 'SELECT budget, actual, isTitle FROM SOWItems WHERE projectId = ?', projectId),
    all(env, 'SELECT netAmount, status FROM Billings WHERE projectId = ?', projectId),
    all(env, 'SELECT amount, status FROM CashRelease WHERE projectId = ?', projectId),
    first(env, 'SELECT COUNT(*) AS n FROM DailyRecords WHERE projectId = ?', projectId),
  ]);

  const budget = sow.filter((s) => !s.isTitle || String(s.isTitle) === 'false').reduce((t, s) => t + num(s.budget), 0);
  const billed = billings.filter((b) => low(b.status) === 'paid').reduce((t, b) => t + num(b.netAmount), 0);
  const spent = releases.filter((r) => ['released', 'reviewed'].includes(low(r.status))).reduce((t, r) => t + num(r.amount), 0);

  const findings = [];
  if (budget > 0 && spent > budget) findings.push(`Spend exceeded budget by ${(spent - budget).toFixed(2)}.`);
  if (budget > 0 && spent <= budget) findings.push(`Delivered within budget, ${(budget - spent).toFixed(2)} unspent.`);
  if (!daily || !daily.n) findings.push('No daily records were filed for this project.');

  return {
    projectId,
    projectName: proj.name,
    metrics: { budget, billed, spent, margin: billed - spent, dailyRecords: daily ? daily.n : 0 },
    findings,
    suggestions: [],
  };
}
