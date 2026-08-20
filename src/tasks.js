import { all, first, run } from './db.js';
import { dayOf, isAdmin, isSuperAdmin, logActivity, low, nextId, nowIso, today } from './util.js';

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

async function userNameMap(env) {
  const rows = await all(env, 'SELECT email, name FROM Users');
  const map = new Map();
  for (const u of rows) map.set(low(u.email), u.name || u.email);
  return map;
}

export async function getTasksForMonthCached(env, identity, month) {
  let m = String(month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) m = today().slice(0, 7);

  const me = low(identity.email);
  const admin = isAdmin(identity);
  const names = await userNameMap(env);

  // A non-admin sees only what concerns them: a task list showing
  // everyone's work to everyone is a list people stop reading.
  const rows = await all(env, 'SELECT * FROM Tasks');
  const byDay = {};
  const todayStr = today();

  const tasks = rows
    .filter((t) => {
      if (dayOf(t.dueDate).indexOf(m) !== 0) return false;
      if (!admin && low(t.assignedTo) !== me && low(t.assignedBy) !== me) return false;
      return true;
    })
    .map((t) => {
      const day = dayOf(t.dueDate);
      const status = low(t.status) || 'open';
      const mine = low(t.assignedTo) === me;

      if (!byDay[day]) byDay[day] = { total: 0, open: 0, overdue: 0, mine: 0, titles: [] };
      const bucket = byDay[day];
      bucket.total++;
      // Three titles is what fits a calendar cell; the count carries the rest.
      if (bucket.titles.length < 3) bucket.titles.push({ title: t.title, status, mine });
      if (status === 'open') {
        bucket.open++;
        if (day < todayStr) bucket.overdue++;
      }
      if (mine) bucket.mine++;

      return {
        id: t.id,
        title: t.title,
        detail: t.detail || '',
        dueDate: day,
        projectId: t.projectId || '',
        assignedTo: t.assignedTo,
        assignedToName: names.get(low(t.assignedTo)) || t.assignedTo,
        assignedBy: t.assignedBy,
        assignedByName: names.get(low(t.assignedBy)) || t.assignedBy,
        priority: t.priority || 'normal',
        proofRequired: t.proofRequired || 'none',
        status,
        completedAt: t.completedAt || '',
        completedBy: t.completedBy || '',
        completedByName: names.get(low(t.completedBy)) || t.completedBy || '',
        proofNote: t.proofNote || '',
        proofUrl: t.proofUrl || '',
        reopenedAt: t.reopenedAt || '',
        isMine: mine,
        canComplete: mine || isSuperAdmin(identity),
      };
    });

  tasks.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
  });

  return { month: m, tasks, byDay };
}

export async function getMyTaskSummary(env, identity) {
  const me = low(identity.email);
  const todayStr = today();
  const rows = await all(env, 'SELECT status, dueDate, assignedTo, assignedBy FROM Tasks');

  let open = 0, overdue = 0, dueToday = 0, assignedByMe = 0;
  for (const t of rows) {
    if (low(t.status) !== 'open') continue;
    const due = dayOf(t.dueDate);
    if (low(t.assignedTo) === me) {
      open++;
      if (due < todayStr) overdue++;
      else if (due === todayStr) dueToday++;
    } else if (low(t.assignedBy) === me) {
      assignedByMe++;
    }
  }
  return { open, overdue, dueToday, assignedByMe };
}

export async function createTask(env, identity, data) {
  const d = data || {};
  if (!d.title) throw new Error('A task needs a title.');
  if (!d.assignedTo) throw new Error('A task needs someone to be assigned to.');

  const id = nextId('TSK');
  await run(
    env,
    `INSERT INTO Tasks (id, title, detail, dueDate, projectId, assignedTo, assignedBy,
       priority, proofRequired, status, createdAt, completedAt, completedBy,
       proofNote, proofUrl, reopenedAt, reopenReason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, '', '', '', '', '', '')`,
    id, d.title, d.detail || '', dayOf(d.dueDate), d.projectId || '',
    low(d.assignedTo), low(identity.email), d.priority || 'normal',
    d.proofRequired ? 1 : 0, nowIso()
  );
  await logActivity(env, identity.email, `Task "${d.title}" assigned to ${d.assignedTo}.`, 'blue');
  return { success: true, id };
}

async function taskById(env, id) {
  const t = await first(env, 'SELECT * FROM Tasks WHERE id = ?', id);
  if (!t) throw new Error('That task no longer exists.');
  return t;
}

export async function completeTask(env, identity, id, proof) {
  const t = await taskById(env, id);
  const me = low(identity.email);
  if (low(t.assignedTo) !== me && !isSuperAdmin(identity)) {
    throw new Error('Only the person a task is assigned to can complete it.');
  }
  const p = proof || {};
  await run(
    env,
    "UPDATE Tasks SET status = 'done', completedAt = ?, completedBy = ?, proofNote = ?, proofUrl = ? WHERE id = ?",
    nowIso(), me, p.note || '', p.url || '', id
  );
  await logActivity(env, identity.email, `Task "${t.title}" completed.`, 'g');
  return { success: true };
}

export async function reopenTask(env, identity, id, reason) {
  const t = await taskById(env, id);
  await run(
    env,
    "UPDATE Tasks SET status = 'open', reopenedAt = ?, reopenReason = ?, completedAt = '', completedBy = '' WHERE id = ?",
    nowIso(), reason || '', id
  );
  await logActivity(env, identity.email, `Task "${t.title}" reopened.`, 'a');
  return { success: true };
}

export async function cancelTask(env, identity, id, reason) {
  const t = await taskById(env, id);
  await run(env, "UPDATE Tasks SET status = 'cancelled', reopenReason = ? WHERE id = ?", reason || '', id);
  await logActivity(env, identity.email, `Task "${t.title}" cancelled.`, 'a');
  return { success: true };
}

export async function deleteTask(env, identity, id) {
  const t = await taskById(env, id);
  if (!isAdmin(identity)) throw new Error('Only an admin can delete a task.');
  await run(env, 'DELETE FROM Tasks WHERE id = ?', id);
  await logActivity(env, identity.email, `Task "${t.title}" deleted.`, 'a');
  return { success: true };
}
