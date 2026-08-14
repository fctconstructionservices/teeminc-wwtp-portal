/**
 * 39-TaskService.gs — The calendar, and work assigned on it. (v18)
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────
 *
 * Everything else in this system records what HAS happened: a receipt,
 * a billing, a daily report. Nothing records what SHOULD happen and by
 * when. That gap is filled today by messages that scroll away and by
 * remembering, which is why things get missed.
 *
 * A task is a date, a person, and a thing to do. Assigned by a Super
 * Admin, completed by the person it was given to.
 *
 * ── PROOF, AND WHY IT IS NOT OPTIONAL BY DEFAULT ────────────
 *
 * "Done" from the person who was supposed to do it is worth very
 * little on its own — not because people lie, but because "done" and
 * "done properly" drift apart with nobody meaning any harm.
 *
 * A task can require proof: a photo, a file, or a note. When it does,
 * it cannot be marked complete without one. The assigner decides at
 * the moment of assigning, which is when they actually know whether
 * proof matters.
 *
 * ── ONE DESIGN DECISION WORTH STATING ───────────────────────
 *
 * A completed task is never deleted and never edited. It is a record
 * of what was asked and what came back. If the work was wrong, the
 * task is REOPENED — which keeps the first completion and its proof
 * attached, so the history shows both attempts rather than only the
 * one that succeeded.
 */

var TASK_STATUSES = ['open', 'done', 'cancelled'];

/** Proof modes, in ascending strictness. */
var TASK_PROOF = { none: 'none', note: 'note', file: 'file' };

/**
 * getTasksForMonth - every task in a month, plus a per-day count so the
 * calendar can render without a second call.
 *
 * @param month  'YYYY-MM'
 */
function getTasksForMonth(month) {
  requireLogin_();
  ensureSheet_('Tasks');

  var m = String(month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) {
    m = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  }

  var me = currentUserEmail_().toLowerCase();
  var isAdmin = currentUserRole_() === 'superadmin' || currentUserRole_() === 'admin';

  var users = {};
  readAll_('Users').forEach(function (u) {
    users[String(u.email).toLowerCase()] = u.name || u.email;
  });

  // ── v18.2 FIX: THE DATE COMES BACK AS A DATE ──
  // A due date is written as the string '2026-08-20'. Google Sheets
  // recognises that shape and CONVERTS IT to a real date value, so it
  // reads back as a Date object — and String(date) is
  // "Wed Aug 20 2026 00:00:00 GMT+0800", which does not begin with
  // "2026-08".
  //
  // So every task was stored correctly and then filtered out of every
  // month. Assigning appeared to do nothing at all.
  //
  // Everything now goes through taskDay_, which accepts either shape.
  // Fixing it only at the point of writing would leave the tasks
  // already in the sheet invisible forever.
  var byDay = {};
  var rows = readAll_('Tasks').filter(function (t) {
    if (taskDay_(t.dueDate).indexOf(m) !== 0) return false;
    // Someone who is not an admin sees only what concerns them. A task
    // list that shows everybody's work to everybody is a list people
    // stop reading.
    if (!isAdmin && String(t.assignedTo).toLowerCase() !== me &&
        String(t.assignedBy).toLowerCase() !== me) return false;
    return true;
  }).map(function (t) {
    var day = taskDay_(t.dueDate);
    byDay[day] = byDay[day] || { total: 0, open: 0, overdue: 0, mine: 0, titles: [] };
    byDay[day].total++;
    // The grid writes the titles into the day, so a month can be read
    // without clicking anything. Three is what fits a cell; beyond that
    // the count carries the rest.
    if (byDay[day].titles.length < 3) {
      byDay[day].titles.push({
        title: t.title,
        status: low_(t.status) || 'open',
        mine: String(t.assignedTo).toLowerCase() === me
      });
    }
    if (low_(t.status) === 'open') {
      byDay[day].open++;
      if (day < Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')) {
        byDay[day].overdue++;
      }
    }
    if (String(t.assignedTo).toLowerCase() === me) byDay[day].mine++;

    return {
      id: t.id,
      title: t.title,
      detail: t.detail || '',
      dueDate: day,
      projectId: t.projectId || '',
      assignedTo: t.assignedTo,
      assignedToName: users[String(t.assignedTo).toLowerCase()] || t.assignedTo,
      assignedBy: t.assignedBy,
      assignedByName: users[String(t.assignedBy).toLowerCase()] || t.assignedBy,
      priority: t.priority || 'normal',
      proofRequired: t.proofRequired || 'none',
      status: low_(t.status) || 'open',
      completedAt: t.completedAt || '',
      completedBy: t.completedBy || '',
      completedByName: users[String(t.completedBy).toLowerCase()] || t.completedBy || '',
      proofNote: t.proofNote || '',
      proofUrl: t.proofUrl || '',
      reopenedAt: t.reopenedAt || '',
      isMine: String(t.assignedTo).toLowerCase() === me,
      canComplete: String(t.assignedTo).toLowerCase() === me || currentUserRole_() === 'superadmin'
    };
  });

  rows.sort(function (a, b) {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    var p = { high: 0, normal: 1, low: 2 };
    return (p[a.priority] || 1) - (p[b.priority] || 1);
  });

  return sanitizeDatesDeep_({ month: m, tasks: rows, byDay: byDay });
}

/**
 * createTask - Super Admin assigns work.
 *
 * Admins can assign too. Restricting it to the Super Admin alone would
 * mean every routine reminder waits on one person, which is how a
 * feature stops being used.
 */
function createTask(data) {
  requireApprover_('assigning a task');
  ensureSheet_('Tasks');

  var title = String((data && data.title) || '').trim();
  if (!title) throw new Error('Give the task a title.');
  if (title.length > 200) throw new Error('Keep the title under 200 characters.');

  var due = String((data && data.dueDate) || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('Pick a due date.');

  var to = String((data && data.assignedTo) || '').trim().toLowerCase();
  var user = readAll_('Users').find(function (u) {
    return String(u.email).toLowerCase() === to;
  });
  // Assigning to an address that is not a user means nobody is doing
  // it, and the assigner would never find out.
  if (!user) throw new Error('Assign it to somebody — that email is not a user.');
  if (low_(user.status) === 'inactive') {
    throw new Error(user.name + ' is inactive and would never see this task.');
  }

  var proof = TASK_PROOF[String((data && data.proofRequired) || 'none')] || 'none';
  var id = nextId_('TSK');

  appendRow_('Tasks', {
    id: id,
    title: title,
    detail: String((data && data.detail) || ''),
    // Written with a leading apostrophe so Sheets keeps it as TEXT.
    // Without it the cell is converted to a date value and comes back a
    // Date — which is the bug above. New rows are now stored in the one
    // shape, and taskDay_ still handles the old ones.
    dueDate: "'" + due,
    projectId: String((data && data.projectId) || ''),
    assignedTo: to,
    assignedBy: currentUserEmail_().toLowerCase(),
    priority: ['low', 'normal', 'high'].indexOf(String(data.priority)) > -1 ? data.priority : 'normal',
    proofRequired: proof,
    status: 'open',
    createdAt: new Date(),
    completedAt: '', completedBy: '', proofNote: '', proofUrl: '',
    reopenedAt: '', reopenReason: ''
  });

  // v18.2: no email. Tasks live in the system — the assignee sees them
  // at the top of their calendar the moment they log in, which is where
  // they can act on them. An email is a second copy that goes stale the
  // moment the task changes, and it cannot be marked done.

  logActivity_('Task assigned to ' + (user.name || to) + ' — "' + title + '" due ' + due,
    'blue', id);
  return { success: true, id: id };
}

/**
 * completeTask - the assignee marks it done.
 *
 * Proof is enforced HERE, on the server. A client-side check is a
 * courtesy; this is the rule.
 */
function completeTask(id, proof) {
  requireLogin_();
  var t = readAll_('Tasks').find(function (x) { return x.id === id; });
  if (!t) throw new Error('Task not found.');

  var me = currentUserEmail_().toLowerCase();
  if (String(t.assignedTo).toLowerCase() !== me && currentUserRole_() !== 'superadmin') {
    throw new Error('Only the person a task is assigned to can complete it.');
  }
  if (low_(t.status) === 'done') throw new Error('That task is already done.');
  if (low_(t.status) === 'cancelled') throw new Error('That task was cancelled.');

  proof = proof || {};
  var note = String(proof.note || '').trim();
  var url = '';

  if (proof.fileBase64 && proof.fileName) {
    var up = uploadImage(proof.fileBase64, proof.fileName, proof.fileMime || '');
    if (up && up.url) url = up.url;
  }

  var need = String(t.proofRequired || 'none');
  if (need === 'file' && !url) {
    throw new Error('This task needs a photo or file as proof of completion.');
  }
  if (need === 'note' && !note && !url) {
    throw new Error('This task needs a note saying what was done.');
  }

  updateRow_('Tasks', 'id', id, {
    status: 'done',
    completedAt: new Date(),
    completedBy: me,
    proofNote: note,
    proofUrl: url
  });

  logActivity_('Task completed — "' + t.title + '" by ' + currentUserName_() +
    (url ? ' with proof attached' : ''), 'g', id);
  return { success: true };
}

/**
 * reopenTask - the work came back wrong.
 *
 * The first completion and its proof are KEPT. Clearing them would
 * leave a record showing only the attempt that succeeded, and the
 * history of a disputed item is exactly when both attempts matter.
 */
function reopenTask(id, reason) {
  requireApprover_('reopening a task');
  var t = readAll_('Tasks').find(function (x) { return x.id === id; });
  if (!t) throw new Error('Task not found.');
  if (low_(t.status) !== 'done') throw new Error('Only a completed task can be reopened.');

  updateRow_('Tasks', 'id', id, {
    status: 'open',
    reopenedAt: new Date(),
    reopenReason: String(reason || '')
  });
  logActivity_('Task reopened — "' + t.title + '"' + (reason ? ': ' + reason : '') +
    '. The earlier completion and proof are kept.', 'a', id);
  return { success: true };
}

/** cancelTask - it no longer needs doing. Kept, not deleted: a task
 *  that vanishes leaves the assignee wondering what happened to it. */
function cancelTask(id, reason) {
  requireApprover_('cancelling a task');
  var t = readAll_('Tasks').find(function (x) { return x.id === id; });
  if (!t) throw new Error('Task not found.');
  if (low_(t.status) === 'done') throw new Error('A completed task cannot be cancelled.');
  updateRow_('Tasks', 'id', id, { status: 'cancelled', reopenReason: String(reason || '') });
  logActivity_('Task cancelled — "' + t.title + '"', 'a', id);
  return { success: true };
}

/** deleteTask - Super Admin, and only something never acted on. */
function deleteTask(id) {
  requireSuperAdmin_('deleting a task');
  var t = readAll_('Tasks').find(function (x) { return x.id === id; });
  if (!t) throw new Error('Task not found.');
  if (low_(t.status) === 'done') {
    throw new Error('A completed task is a record of what was asked and what came back. ' +
      'Cancel or reopen it instead.');
  }
  deleteRow_('Tasks', 'id', id);
  logActivity_('Task deleted — "' + t.title + '"', 'a', id);
  return { success: true };
}

/**
 * getMyTaskSummary - the counts the dashboard needs, without loading
 * a month of tasks to derive them.
 */
function getMyTaskSummary() {
  requireLogin_();
  ensureSheet_('Tasks');
  var me = currentUserEmail_().toLowerCase();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var open = 0, overdue = 0, dueToday = 0, assignedByMe = 0;
  readAll_('Tasks').forEach(function (t) {
    if (low_(t.status) !== 'open') return;
    var due = taskDay_(t.dueDate);
    if (String(t.assignedTo).toLowerCase() === me) {
      open++;
      if (due < today) overdue++;
      else if (due === today) dueToday++;
    } else if (String(t.assignedBy).toLowerCase() === me) {
      assignedByMe++;
    }
  });
  return { open: open, overdue: overdue, dueToday: dueToday, assignedByMe: assignedByMe };
}


/**
 * getAssignableUsers (v18.1) - The people a task can be given to.
 *
 * The task modal was reading the user list out of getHomeData, which
 * does not return one — so the picker was empty and there was no way to
 * assign anything to anybody. Its own endpoint, returning only what a
 * picker needs.
 *
 * Inactive users are excluded rather than shown greyed out: an inactive
 * account cannot log in, so a task assigned to one would sit there
 * forever with nobody able to see it.
 */
function getAssignableUsers() {
  requireLogin_();
  return readAll_('Users')
    .filter(function (u) { return low_(u.status || 'active') !== 'inactive'; })
    .map(function (u) {
      return {
        email: String(u.email || '').toLowerCase(),
        // The NAME is what a person picks by. An email address in a
        // dropdown makes you translate before you can choose.
        name: u.name || u.email,
        role: u.role || ''
      };
    })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
}


/**
 * taskDay_ (v18.2) - a due date as 'YYYY-MM-DD', whatever shape it
 * arrives in.
 *
 * A date written to Sheets as a string is converted to a real date
 * value, so it reads back as a Date. Both shapes exist in the sheet
 * already, which is why this accepts either rather than being fixed at
 * the point of writing.
 */
function taskDay_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  // The leading apostrophe is Sheets' text marker and is not always
  // stripped on read.
  var s = String(v).trim().replace(/^'/, '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Anything else — a locale string, an ISO timestamp — is parsed.
  var d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
