import { all, batchAll, first, run } from './db.js';
import { dayOf, isAdmin, logActivity, low, nextId, nowIso, num, requireRole, safeParse, safeParseArray } from './util.js';

// ─── FINANCE ───────────────────────────────────────────────────

export async function getPendingCashReleases(env) {
  return all(env, "SELECT * FROM CashRelease WHERE lower(status) = 'pending' ORDER BY createdAt DESC");
}

export async function getReleasesToLiquidate(env, identity) {
  const [releases, liquidations] = await batchAll(env, [
    "SELECT * FROM CashRelease WHERE lower(status) IN ('released', 'reviewed') ORDER BY createdAt DESC",
    'SELECT cashAdvanceId, amount, status FROM Liquidations',
  ]);
  const done = new Map();
  for (const l of liquidations) {
    if (low(l.status) === 'rejected') continue;
    done.set(l.cashAdvanceId, (done.get(l.cashAdvanceId) || 0) + num(l.amount));
  }
  const me = low(identity.email);
  return releases
    .map((r) => ({ ...r, liquidated: done.get(r.originalRequestId) || 0 }))
    .filter((r) => num(r.amount) - r.liquidated > 0.005)
    .filter((r) => isAdmin(identity) || low(r.requestorEmail) === me);
}

export async function getPendingDailyRecords(env) {
  return all(env, "SELECT * FROM DailyRecords WHERE lower(status) = 'pending' ORDER BY date DESC");
}

// ─── MY REQUESTS ───────────────────────────────────────────────

const REQUEST_SOURCES = [
  ['CashAdvanceRequests', 'requestorEmail', 'amount', 'Cash Advance'],
  ['CashRelease', 'requestorEmail', 'amount', 'Cash Release'],
  ['IncomingCashRequests', 'requestorEmail', 'amount', 'Incoming Cash'],
  ['Liquidations', 'requestorEmail', 'amount', 'Liquidation'],
  ['PurchaseRequests', 'requestorEmail', 'totalAmount', 'Purchase Request'],
  ['Materials', 'requestedBy', null, 'Material'],
  ['Equipment', 'requestedBy', null, 'Equipment'],
  ['Manpower', 'requestedBy', null, 'Manpower'],
];

async function myRequestsByStatus(env, identity, statuses) {
  const me = low(identity.email);
  const list = statuses.map((s) => `'${s}'`).join(',');
  const results = await batchAll(
    env,
    REQUEST_SOURCES.map(([table, emailCol, amountCol]) => [
      `SELECT *, '${table}' AS _table FROM "${table}" WHERE lower("${emailCol}") = ? AND lower(status) IN (${list})`,
      me,
    ])
  );
  const out = [];
  results.forEach((rows, i) => {
    const [, , amountCol, typeLabel] = REQUEST_SOURCES[i];
    for (const r of rows) {
      out.push({ ...r, requestType: typeLabel, amount: amountCol ? num(r[amountCol]) : 0 });
    }
  });
  return out;
}

export const getMyPendingRequests = (env, identity) => myRequestsByStatus(env, identity, ['pending']);
export const getMyApprovedRequests = (env, identity) => myRequestsByStatus(env, identity, ['approved', 'released', 'reviewed', 'ordered', 'paid']);
export const getMyRejectedRequests = (env, identity) => myRequestsByStatus(env, identity, ['rejected', 'cancelled']);

const LOOKUP_TABLES = [
  'CashAdvanceRequests', 'CashRelease', 'IncomingCashRequests', 'Liquidations',
  'PurchaseRequests', 'Materials', 'Equipment', 'Manpower', 'Billings',
  'DailyRecords', 'OTRequests', 'EstimateGroups',
];

export async function getRequestById(env, _identity, id) {
  const results = await batchAll(
    env,
    LOOKUP_TABLES.map((t) => [`SELECT *, '${t}' AS _table FROM "${t}" WHERE id = ?`, id])
  );
  for (const rows of results) if (rows.length) return rows[0];
  throw new Error('That request no longer exists.');
}

// ─── PROCUREMENT ───────────────────────────────────────────────

export async function getPurchaseRequests(env) {
  const [prs, lines] = await batchAll(env, [
    'SELECT * FROM PurchaseRequests ORDER BY createdAt DESC',
    'SELECT * FROM PRLines ORDER BY sortOrder',
  ]);
  const byPr = new Map();
  for (const l of lines) {
    if (!byPr.has(l.prId)) byPr.set(l.prId, []);
    byPr.get(l.prId).push(l);
  }
  return prs.map((p) => ({ ...p, lines: byPr.get(p.id) || [], approvals: safeParseArray(p.approvalsJSON) }));
}

export async function getPurchaseOrders(env) {
  const [pos, lines] = await batchAll(env, [
    'SELECT * FROM PurchaseOrders ORDER BY createdAt DESC',
    'SELECT * FROM POLines ORDER BY sortOrder',
  ]);
  const byPo = new Map();
  for (const l of lines) {
    if (!byPo.has(l.poId)) byPo.set(l.poId, []);
    byPo.get(l.poId).push(l);
  }
  return pos.map((p) => ({ ...p, lines: byPo.get(p.id) || [] }));
}

export async function getReceipts(env, _identity, poId) {
  const rows = poId
    ? await all(env, 'SELECT * FROM Receipts WHERE poId = ? ORDER BY createdAt DESC', poId)
    : await all(env, 'SELECT * FROM Receipts ORDER BY createdAt DESC');
  return rows.map((r) => ({ ...r, lines: safeParseArray(r.linesJSON) }));
}

export async function checkPrBudget(env, _identity, projectId, sowId, amount) {
  const sow = await first(env, 'SELECT budget, actual, description FROM SOWItems WHERE projectId = ? AND id = ?', projectId, sowId);
  if (!sow) return { state: 'unknown', message: 'No matching scope of work.' };
  const budget = num(sow.budget);
  const used = num(sow.actual);
  const remaining = budget - used;
  const requested = num(amount);
  if (budget <= 0) return { state: 'nobudget', message: 'That scope has no budget set.', budget, used, remaining };
  if (requested > remaining) {
    return { state: 'over', message: `Over budget by ${(requested - remaining).toFixed(2)}.`, budget, used, remaining };
  }
  return { state: 'ok', message: 'Within budget.', budget, used, remaining };
}

// ─── QUOTATIONS ────────────────────────────────────────────────

export async function getQuotations(env) {
  return all(env, 'SELECT * FROM Quotations ORDER BY createdAt DESC');
}

export async function getQuotationRevisions(env, _identity, quotationId) {
  const rows = await all(env, 'SELECT * FROM QuotationRevisions WHERE quotationId = ? ORDER BY revision DESC', quotationId);
  return rows.map((r) => ({ ...r, snapshot: safeParse(r.snapshotJSON, null) }));
}

// ─── LESSONS LEARNED / KNOWLEDGE BASE ──────────────────────────

export async function getLessons(env) {
  const rows = await all(env, 'SELECT * FROM LessonsLearned ORDER BY capturedAt DESC');
  return rows.map((l) => ({
    ...l,
    metrics: safeParse(l.metricsJSON, {}),
    findings: safeParseArray(l.findingsJSON),
    suggestions: safeParseArray(l.suggestionsJSON),
  }));
}

export async function getRetrospectiveCandidates(env) {
  return all(
    env,
    `SELECT id, name, status, endDate FROM Projects
     WHERE lower(status) IN ('completed', 'closed')
       AND id NOT IN (SELECT projectId FROM LessonsLearned WHERE source = 'auto')`
  );
}

// ─── DISCUSSIONS ───────────────────────────────────────────────

export async function getThread(env, _identity, recordType, recordId) {
  const rows = await all(
    env,
    "SELECT * FROM Comments WHERE recordType = ? AND recordId = ? AND (deletedAt IS NULL OR deletedAt = '') ORDER BY createdAt",
    recordType, recordId
  );
  return rows.map((c) => ({ ...c, mentions: safeParseArray(c.mentionsJSON) }));
}

export async function getThreadCounts(env, _identity, refs) {
  const list = Array.isArray(refs) ? refs : [];
  if (!list.length) return {};
  const results = await batchAll(
    env,
    list.map((r) => [
      "SELECT COUNT(*) AS n FROM Comments WHERE recordType = ? AND recordId = ? AND (deletedAt IS NULL OR deletedAt = '')",
      r.recordType, r.recordId,
    ])
  );
  const out = {};
  list.forEach((r, i) => {
    out[`${r.recordType}:${r.recordId}`] = results[i][0] ? results[i][0].n : 0;
  });
  return out;
}

/** THE THINGS THAT CONCERN YOU
 *
 * Three sources, one list:
 *   · a comment that names you
 *   · a comment on a request YOU submitted — it is your request, so a
 *     reply on it is addressed to you whether or not anyone typed your
 *     name
 *   · a task assigned to you
 *
 * Anything else on a thread is somebody else's conversation. Notifying
 * on every comment in the system is how a bell becomes noise people
 * stop reading, which is the same as having no bell at all.
 */
const NOTIFY_DAYS = 30;

export async function getUnread(env, identity) {
  const me = low(identity.email);
  const since = new Date(Date.now() - NOTIFY_DAYS * 86400000).toISOString();

  const [comments, reads, users, tasks, ...mine] = await batchAll(env, [
    ["SELECT * FROM Comments WHERE (deletedAt IS NULL OR deletedAt = '') AND createdAt >= ? ORDER BY createdAt DESC", since],
    ['SELECT recordType, recordId, readAt FROM CommentReads WHERE lower(reader) = ?', me],
    'SELECT email, name FROM Users',
    ["SELECT id, title, projectId, assignedBy, createdAt, status FROM Tasks WHERE lower(assignedTo) = ? AND lower(status) = 'open' AND createdAt >= ? ORDER BY createdAt DESC", me, since],
    // Records this person submitted, so a reply on one reaches them.
    ['SELECT id FROM CashAdvanceRequests WHERE lower(requestorEmail) = ?', me],
    ['SELECT id FROM CashRelease WHERE lower(requestorEmail) = ?', me],
    ['SELECT id FROM IncomingCashRequests WHERE lower(requestorEmail) = ?', me],
    ['SELECT id FROM Liquidations WHERE lower(requestorEmail) = ?', me],
    ['SELECT id FROM PurchaseRequests WHERE lower(requestorEmail) = ?', me],
    ['SELECT id FROM DailyRecords WHERE lower(createdBy) = ?', me],
  ]);

  const myRecords = new Set();
  for (const rows of mine) for (const r of rows) myRecords.add(String(r.id));

  const nameOf = new Map(users.map((u) => [low(u.email), u.name || u.email]));
  const readAt = new Map();
  for (const r of reads) readAt.set(`${r.recordType}:${r.recordId}`, r.readAt);

  const items = [];
  let total = 0;
  let mentions = 0;

  for (const c of comments) {
    if (low(c.author) === me) continue;   // your own words are not news

    const mentioned = safeParseArray(c.mentionsJSON).map(low).includes(me);
    const onMyRecord = myRecords.has(String(c.recordId));
    if (!mentioned && !onMyRecord) continue;

    const seen = readAt.get(`${c.recordType}:${c.recordId}`);
    const read = !!seen && String(c.createdAt) <= String(seen);
    if (!read) { total++; if (mentioned) mentions++; }

    items.push({
      kind: 'comment',
      recordType: c.recordType,
      recordId: c.recordId,
      projectId: c.projectId || '',
      authorName: nameOf.get(low(c.author)) || c.author,
      excerpt: String(c.body || '').slice(0, 160),
      mentioned,
      read,
      createdAt: c.createdAt,
    });
  }

  for (const t of tasks) {
    const seen = readAt.get(`Task:${t.id}`);
    const read = !!seen && String(t.createdAt) <= String(seen);
    if (!read) total++;
    items.push({
      kind: 'task',
      recordType: 'Task',
      recordId: t.id,
      projectId: t.projectId || '',
      authorName: nameOf.get(low(t.assignedBy)) || t.assignedBy || 'System',
      excerpt: `Task assigned to you: ${t.title || t.id}`,
      mentioned: false,
      read,
      createdAt: t.createdAt,
    });
  }

  items.sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1));
  const shown = items.slice(0, 40);
  return { total, mentions, shown: shown.length, items: shown };
}

export async function markThreadRead(env, identity, recordType, recordId) {
  const me = low(identity.email);
  const existing = await first(
    env, 'SELECT id FROM CommentReads WHERE lower(reader) = ? AND recordType = ? AND recordId = ?',
    me, recordType, recordId
  );
  if (existing) {
    await run(env, 'UPDATE CommentReads SET readAt = ? WHERE id = ?', nowIso(), existing.id);
  } else {
    await run(
      env, 'INSERT INTO CommentReads (id, reader, recordType, recordId, readAt) VALUES (?, ?, ?, ?, ?)',
      nextId('CRD'), me, recordType, recordId, nowIso()
    );
  }
  return { success: true };
}

export async function markAllRead(env, identity) {
  const me = low(identity.email);
  // Tasks are marked too, otherwise "mark all read" clears the comments
  // and leaves the badge showing a number the panel cannot explain.
  const [threads, tasks] = await batchAll(env, [
    "SELECT DISTINCT recordType, recordId FROM Comments WHERE (deletedAt IS NULL OR deletedAt = '')",
    ['SELECT id FROM Tasks WHERE lower(assignedTo) = ?', me],
  ]);
  const targets = [
    ...threads.map((t) => ({ recordType: t.recordType, recordId: t.recordId })),
    ...tasks.map((t) => ({ recordType: 'Task', recordId: t.id })),
  ];
  for (const t of targets) await markThreadRead(env, identity, t.recordType, t.recordId);
  return { success: true, marked: targets.length };
}

export async function postComment(env, identity, data) {
  const d = data || {};
  if (!d.body) throw new Error('A comment needs a body.');
  const id = nextId('CMT');
  await run(
    env,
    `INSERT INTO Comments (id, recordType, recordId, projectId, author, body, attachmentUrl,
       attachmentName, mentionsJSON, createdAt, editedAt, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')`,
    id, d.recordType || '', d.recordId || '', d.projectId || '', low(identity.email), d.body,
    d.attachmentUrl || '', d.attachmentName || '', JSON.stringify(d.mentions || []), nowIso()
  );
  // Reported back so the composer can say how many people were named.
  // They will see it on their bell, which is the only channel — nothing
  // is emailed.
  const mentioned = (Array.isArray(d.mentions) ? d.mentions : []).filter(Boolean).length;
  return { success: true, id, mentioned };
}

export async function editComment(env, identity, id, body) {
  const c = await first(env, 'SELECT author FROM Comments WHERE id = ?', id);
  if (!c) throw new Error('That comment no longer exists.');
  if (low(c.author) !== low(identity.email)) throw new Error('You can only edit your own comment.');
  await run(env, 'UPDATE Comments SET body = ?, editedAt = ? WHERE id = ?', body, nowIso(), id);
  return { success: true };
}

export async function deleteComment(env, identity, id) {
  const c = await first(env, 'SELECT author FROM Comments WHERE id = ?', id);
  if (!c) throw new Error('That comment no longer exists.');
  if (low(c.author) !== low(identity.email) && !isAdmin(identity)) {
    throw new Error('You can only delete your own comment.');
  }
  await run(env, 'UPDATE Comments SET deletedAt = ? WHERE id = ?', nowIso(), id);
  return { success: true };
}

// ─── PORTFOLIO ─────────────────────────────────────────────────

// ─── SEARCH ────────────────────────────────────────────────────

// ─── SETTINGS / PRINT TEMPLATE ─────────────────────────────────

const SETTING_PRINT_TEMPLATE = 'printTemplate';

/**
 * defaultPrintTemplate - what a document carries before anyone edits it.
 *
 * The company name comes from the Worker's COMPANY_NAME var rather than
 * being written in: this same file runs for both companies, and a
 * hard-coded name is how one company's letterhead ends up on the
 * other's paperwork.
 */
function defaultPrintTemplate(env) {
  return {
    companyName: (env && env.COMPANY_NAME) || 'Company',
    tagline: '', addressLine1: '', addressLine2: '', phone: '', email: '', website: '',
    tin: '', pcabLicense: '',
    logoUrl: '', logoHeight: 54, accentColor: '#24455A', headerLayout: 'logo-left',
    showLogo: true, showDivider: true,
    paperSize: 'A4', marginMm: 12,
    footerText: '', showTimestamp: true, showPreparedBy: true,
    signatories: [
      { label: 'Prepared by', name: '', position: '' },
      { label: 'Reviewed by', name: '', position: '' },
      { label: 'Approved by', name: '', position: '' },
    ],
    watermark: '',
  };
}

async function getSetting(env, key) {
  const row = await first(env, 'SELECT value FROM Settings WHERE key = ?', key);
  if (!row) return null;
  return safeParse(row.value, null);
}

async function setSetting(env, identity, key, value) {
  const exists = await first(env, 'SELECT key FROM Settings WHERE key = ?', key);
  if (exists) {
    await run(
      env, 'UPDATE Settings SET value = ?, updatedBy = ?, updatedAt = ? WHERE key = ?',
      JSON.stringify(value), low(identity.email), nowIso(), key
    );
  } else {
    await run(
      env, 'INSERT INTO Settings (key, value, updatedBy, updatedAt) VALUES (?, ?, ?, ?)',
      key, JSON.stringify(value), low(identity.email), nowIso()
    );
  }
  return value;
}

export async function getPrintTemplate(env) {
  const saved = (await getSetting(env, SETTING_PRINT_TEMPLATE)) || {};
  const out = defaultPrintTemplate(env);
  // Merged OVER the defaults rather than replacing them, so a template
  // saved before a field existed still produces a complete document.
  for (const k of Object.keys(out)) {
    if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') out[k] = saved[k];
  }
  if (Array.isArray(saved.signatories) && saved.signatories.length) {
    out.signatories = saved.signatories.slice(0, 4);
  }
  // `false` is a legitimate saved value that the truthiness test above drops.
  for (const k of ['showLogo', 'showDivider', 'showTimestamp', 'showPreparedBy']) {
    if (typeof saved[k] === 'boolean') out[k] = saved[k];
  }
  return out;
}

export async function savePrintTemplate(env, identity, data) {
  requireRole(identity, ['superadmin'], 'changing the print template');
  await setSetting(env, identity, SETTING_PRINT_TEMPLATE, data || {});
  await logActivity(env, identity.email, 'Print template updated.', 'blue');
  return await getPrintTemplate(env);
}

export async function resetPrintTemplate(env, identity) {
  requireRole(identity, ['superadmin'], 'resetting the print template');
  await setSetting(env, identity, SETTING_PRINT_TEMPLATE, {});
  await logActivity(env, identity.email, 'Print template reset to defaults.', 'a');
  return defaultPrintTemplate(env);
}

// ─── TRANSFERS / WAREHOUSE ─────────────────────────────────────

export async function getWarehouseStock(env) {
  const transfers = await all(env, "SELECT * FROM Transfers WHERE lower(status) = 'approved'");
  const stock = new Map();
  for (const t of transfers) {
    const key = `${t.itemType}:${t.item}`;
    const cur = stock.get(key) || { itemType: t.itemType, item: t.item, unit: t.unit, qty: 0 };
    if (low(t.toLoc) === 'warehouse') cur.qty += num(t.qty);
    if (low(t.fromLoc) === 'warehouse') cur.qty -= num(t.qty);
    stock.set(key, cur);
  }
  return [...stock.values()].filter((s) => s.qty > 0.0001);
}

export async function getTransferOptions(env, _identity, fromLoc, itemType) {
  if (low(fromLoc) === 'warehouse') {
    const stock = await getWarehouseStock(env);
    return stock.filter((s) => !itemType || s.itemType === itemType);
  }
  const records = await all(
    env, 'SELECT materialsDeliveredJSON, materialsUsedJSON FROM DailyRecords WHERE projectId = ?', fromLoc
  );
  const onSite = new Map();
  for (const r of records) {
    for (const m of safeParseArray(r.materialsDeliveredJSON)) {
      const key = m.material || m.name || '';
      if (!key) continue;
      const cur = onSite.get(key) || { itemType: 'Material', item: key, unit: m.unit || '', qty: 0 };
      cur.qty += num(m.qty);
      onSite.set(key, cur);
    }
    for (const m of safeParseArray(r.materialsUsedJSON)) {
      const key = m.material || m.name || '';
      if (!key) continue;
      const cur = onSite.get(key) || { itemType: 'Material', item: key, unit: m.unit || '', qty: 0 };
      cur.qty -= num(m.qty);
      onSite.set(key, cur);
    }
  }
  return [...onSite.values()].filter((s) => s.qty > 0.0001);
}

// ─── BACKUP ────────────────────────────────────────────────────

export async function getBackupStatus(env, identity) {
  requireRole(identity, ['superadmin', 'admin'], 'viewing backup status');
  const last = await getSetting(env, 'lastBackup');
  return {
    lastRun: last && last.at ? last.at : '',
    lastBy: last && last.by ? last.by : '',
    // D1 is a managed database with Cloudflare's own point-in-time
    // recovery; the sheet-era manual copy has no equivalent here.
    note: 'D1 keeps automatic point-in-time backups. Manual copies are no longer needed.',
  };
}

export async function runBackupNow(env, identity) {
  requireRole(identity, ['superadmin'], 'running a backup');
  await setSetting(env, identity, 'lastBackup', { at: nowIso(), by: low(identity.email) });
  await logActivity(env, identity.email, 'Backup checkpoint recorded.', 'blue');
  return { success: true, at: nowIso() };
}
