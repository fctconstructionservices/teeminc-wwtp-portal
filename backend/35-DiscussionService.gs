/**
 * 35-DiscussionService.gs — Conversation attached to a record. (v14)
 *
 * WHY THREADS AND NOT A CHAT ROOM. In a chat room, "ok approved na"
 * scrolls away from whatever it approved, and six months later nobody
 * can find why a variation was allowed. Here the conversation lives ON
 * the purchase request, and it is still there when someone opens that
 * record next year.
 *
 * ── THE KEY THAT MAKES THIS WORK EVERYWHERE ──────────────────
 *
 * A comment is identified by recordType + recordId, and nothing else.
 * A thread on ('PurchaseRequest', 'PR-2026-0042') is the same code as
 * one on ('Billing', 'PB-0003'). That is why one service and one
 * component cover sixteen places rather than sixteen implementations
 * that drift apart.
 *
 * ── ABOUT THE LAG, HONESTLY ──────────────────────────────────
 *
 * Apps Script has no push. I said that meant notifications were
 * impossible; I was wrong, because EMAIL IS PUSH. A mention sends one,
 * and it reaches somebody who is not looking at the screen.
 *
 * Three tiers, deliberately:
 *   1. EMAIL on a mention — reaches you with the app closed
 *   2. BADGE COUNT polled every 90s — one number, not the messages
 *   3. THE THREAD — only when you open the record
 *
 * Tier 2 is why the poll is a separate, tiny endpoint. Polling the
 * threads themselves would burn the quota this system runs on.
 */

var COMMENT_TYPES = ['CashAdvance', 'Liquidation', 'CashRelease', 'IncomingCash',
  'Material', 'Equipment', 'Manpower', 'DailyRecord', 'Estimate', 'Billing',
  'OTRequest', 'PurchaseRequest', 'PurchaseOrder', 'Quotation', 'Project', 'SOWItem'];

/** EDIT_WINDOW_MIN - how long a comment stays editable.
 *  A comment that quietly changes after somebody has replied to it is
 *  worse than no comment at all, so the window is short and hard. */
var EDIT_WINDOW_MIN = 15;

function _commentKey_(type, id) {
  return String(type || '').trim() + '::' + String(id || '').trim();
}

/**
 * getThread - every live comment on one record, oldest first.
 *
 * Reading also MARKS IT READ. A thread you are looking at is not
 * unread, and making that a second call the client has to remember is
 * how badges get stuck on forever.
 */
function getThread(recordType, recordId) {
  requireLogin_();
  ensureSheet_('Comments');
  var key = _commentKey_(recordType, recordId);
  var me = currentUserEmail_().toLowerCase();

  var users = {};
  readAll_('Users').forEach(function (u) {
    users[String(u.email).toLowerCase()] = u.name || u.email;
  });

  var rows = readAll_('Comments')
    .filter(function (c) { return _commentKey_(c.recordType, c.recordId) === key; })
    .map(function (c) {
      var deleted = !!String(c.deletedAt || '').trim();
      return {
        id: c.id,
        author: c.author,
        authorName: users[String(c.author).toLowerCase()] || c.author,
        // A deleted comment keeps its place. Removing the row would
        // leave a reply answering nothing, which reads as a different
        // conversation than the one that happened.
        body: deleted ? '' : String(c.body || ''),
        deleted: deleted,
        attachmentUrl: deleted ? '' : String(c.attachmentUrl || ''),
        attachmentName: deleted ? '' : String(c.attachmentName || ''),
        mentions: safeParse_(c.mentionsJSON, []),
        createdAt: c.createdAt,
        editedAt: c.editedAt || '',
        isMine: String(c.author).toLowerCase() === me
      };
    })
    .sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });

  markThreadRead(recordType, recordId);
  return sanitizeDatesDeep_(rows);
}

/**
 * postComment - adds a comment and emails anyone mentioned.
 *
 * data: { recordType, recordId, projectId, body, mentions[],
 *         attachmentBase64, attachmentName, attachmentMime }
 */
function postComment(data) {
  requireLogin_();
  ensureSheet_('Comments');
  if (!data || !data.recordType || !data.recordId) throw new Error('Missing record reference.');

  var body = String(data.body || '').trim();
  var hasFile = !!(data.attachmentBase64 && data.attachmentName);
  if (!body && !hasFile) throw new Error('Write something, or attach a file.');
  if (body.length > 4000) throw new Error('That comment is too long — keep it under 4,000 characters.');

  // Mentions are validated against real users. An unchecked list would
  // let a typo silently address nobody, and the author would believe
  // they had told someone.
  var valid = {};
  readAll_('Users').forEach(function (u) { valid[String(u.email).toLowerCase()] = u; });
  var mentions = (Array.isArray(data.mentions) ? data.mentions : [])
    .map(function (m) { return String(m).toLowerCase().trim(); })
    .filter(function (m) { return valid[m]; })
    .filter(function (m, i, a) { return a.indexOf(m) === i; });

  var att = { url: '', name: '' };
  if (hasFile) {
    var up = uploadImage(data.attachmentBase64, data.attachmentName, data.attachmentMime || '');
    if (up && up.url) att = { url: up.url, name: data.attachmentName };
  }

  var id = nextId_('CMT');
  var now = new Date();
  appendRow_('Comments', {
    id: id,
    recordType: String(data.recordType).trim(),
    recordId: String(data.recordId).trim(),
    projectId: String(data.projectId || ''),
    author: currentUserEmail_().toLowerCase(),
    body: body,
    attachmentUrl: att.url,
    attachmentName: att.name,
    mentionsJSON: JSON.stringify(mentions),
    createdAt: now,
    editedAt: '',
    deletedAt: ''
  });

  if (mentions.length) {
    _emailMentions_(mentions, data, body, valid);
  }

  return { success: true, id: id, mentioned: mentions.length };
}

/**
 * _emailMentions_ - the only real push this system has.
 *
 * Wrapped in try/catch, and deliberately: a mail quota that has run out
 * must not lose the comment. The comment is already written by the time
 * this runs, so a failure here costs a notification, not a record.
 */
function _emailMentions_(mentions, data, body, users) {
  var me = currentUserName_();
  var label = String(data.recordType).replace(/([A-Z])/g, ' $1').trim();
  var subject = me + ' mentioned you on ' + label + ' ' + data.recordId;

  mentions.forEach(function (email) {
    if (email === currentUserEmail_().toLowerCase()) return;   // no self-notifications
    try {
      MailApp.sendEmail({
        to: email,
        subject: '[FCTC] ' + subject,
        htmlBody:
          '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15181A;line-height:1.5">' +
          '<p><b>' + _esc_(me) + '</b> mentioned you on <b>' + _esc_(label) + ' ' +
          _esc_(data.recordId) + '</b>:</p>' +
          '<blockquote style="border-left:3px solid #D98A00;margin:0;padding:6px 14px;color:#3A4145">' +
          _esc_(body).replace(/\n/g, '<br>') + '</blockquote>' +
          '<p style="color:#697077;font-size:12px">Open the Operations Board to reply. ' +
          'This message was sent because you were mentioned by name.</p></div>'
      });
    } catch (err) {
      // Most likely the daily mail quota. Logged so it is visible rather
      // than being a notification that silently never arrived.
      logActivity_('Mention email to ' + email + ' failed: ' + err.message, 'a');
    }
  });
}

function _esc_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** editComment - author only, and only inside the window. */
function editComment(id, body) {
  requireLogin_();
  var c = readAll_('Comments').find(function (x) { return x.id === id; });
  if (!c) throw new Error('Comment not found.');
  if (String(c.author).toLowerCase() !== currentUserEmail_().toLowerCase()) {
    throw new Error('You can only edit your own comments.');
  }
  if (String(c.deletedAt || '').trim()) throw new Error('That comment was deleted.');

  var age = (new Date() - new Date(c.createdAt)) / 60000;
  if (age > EDIT_WINDOW_MIN) {
    throw new Error('Comments can only be edited within ' + EDIT_WINDOW_MIN +
      ' minutes. Post a correction instead — a comment that changes after ' +
      'someone has replied to it is worse than no comment.');
  }

  var text = String(body || '').trim();
  if (!text) throw new Error('A comment cannot be emptied — delete it instead.');
  updateRow_('Comments', 'id', id, { body: text, editedAt: new Date() });
  return { success: true };
}

/**
 * deleteComment - author or Super Admin. Marks, never removes.
 * A removed row leaves a reply answering nothing.
 */
function deleteComment(id) {
  requireLogin_();
  var c = readAll_('Comments').find(function (x) { return x.id === id; });
  if (!c) throw new Error('Comment not found.');
  var me = currentUserEmail_().toLowerCase();
  if (String(c.author).toLowerCase() !== me && currentUserRole_() !== 'superadmin') {
    throw new Error('You can only delete your own comments.');
  }
  updateRow_('Comments', 'id', id, { deletedAt: new Date() });
  logActivity_('Comment on ' + c.recordType + ' ' + c.recordId + ' deleted by ' +
    currentUserName_(), 'a');
  return { success: true };
}

// ============================================================
//  UNREAD
// ============================================================

/**
 * markThreadRead - stores WHEN, not WHICH.
 *
 * One row per person per thread holding a timestamp, rather than a row
 * per comment per person. On a busy project the second shape grows
 * without limit and turns every badge count into a full scan.
 */
function markThreadRead(recordType, recordId) {
  ensureSheet_('CommentReads');
  var me = currentUserEmail_().toLowerCase();
  var key = _commentKey_(recordType, recordId);
  var row = readAll_('CommentReads').find(function (r) {
    return String(r.reader).toLowerCase() === me && _commentKey_(r.recordType, r.recordId) === key;
  });
  if (row) updateRowWhere_('CommentReads', { id: row.id }, { readAt: new Date() });
  else appendRow_('CommentReads', {
    id: nextId_('CRD'), reader: me,
    recordType: String(recordType).trim(), recordId: String(recordId).trim(),
    readAt: new Date()
  });
  return { success: true };
}

/**
 * getUnread - the badge. Polled every 90 seconds, so it is built to be
 * CHEAP: three sheets, no joins beyond a map lookup, and it returns
 * counts plus at most fifteen recent items — never the comment bodies.
 */
function getUnread() {
  requireLogin_();
  ensureSheet_('Comments');
  ensureSheet_('CommentReads');
  readMany_(['Comments', 'CommentReads', 'Users']);

  var me = currentUserEmail_().toLowerCase();

  var readAt = {};
  readAll_('CommentReads').forEach(function (r) {
    if (String(r.reader).toLowerCase() !== me) return;
    readAt[_commentKey_(r.recordType, r.recordId)] = new Date(r.readAt).getTime();
  });

  var users = {};
  readAll_('Users').forEach(function (u) {
    users[String(u.email).toLowerCase()] = u.name || u.email;
  });

  var items = [], total = 0, mentionCount = 0;

  readAll_('Comments').forEach(function (c) {
    if (String(c.author).toLowerCase() === me) return;          // your own is not news
    if (String(c.deletedAt || '').trim()) return;

    var key = _commentKey_(c.recordType, c.recordId);
    var when = new Date(c.createdAt).getTime();
    if (readAt[key] && when <= readAt[key]) return;

    total++;
    var mentioned = safeParse_(c.mentionsJSON, []).indexOf(me) > -1;
    if (mentioned) mentionCount++;

    items.push({
      id: c.id, recordType: c.recordType, recordId: c.recordId,
      projectId: c.projectId || '',
      authorName: users[String(c.author).toLowerCase()] || c.author,
      // A short excerpt only. The badge is a prompt to go and read the
      // thread, not a way to read it from the notification list.
      excerpt: String(c.body || '').slice(0, 90),
      mentioned: mentioned,
      createdAt: c.createdAt
    });
  });

  items.sort(function (a, b) {
    // Mentions first: being addressed by name outranks being copied in.
    if (a.mentioned !== b.mentioned) return a.mentioned ? -1 : 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return sanitizeDatesDeep_({
    total: total,
    mentions: mentionCount,
    items: items.slice(0, 15)
  });
}

/** markAllRead - clears the bell in one action. */
function markAllRead() {
  requireLogin_();
  var un = getUnread();
  var seen = {};
  (un.items || []).forEach(function (i) {
    var k = _commentKey_(i.recordType, i.recordId);
    if (seen[k]) return;
    seen[k] = true;
    markThreadRead(i.recordType, i.recordId);
  });
  return { success: true, cleared: Object.keys(seen).length };
}

/**
 * getThreadCounts - comment counts for a list of records, so a register
 * can show "3 comments" on a row without loading three threads.
 *
 * refs: [{ recordType, recordId }]
 */
function getThreadCounts(refs) {
  requireLogin_();
  ensureSheet_('Comments');
  var want = {};
  (refs || []).forEach(function (r) { want[_commentKey_(r.recordType, r.recordId)] = 0; });

  readAll_('Comments').forEach(function (c) {
    if (String(c.deletedAt || '').trim()) return;
    var k = _commentKey_(c.recordType, c.recordId);
    if (want[k] !== undefined) want[k]++;
  });
  return want;
}
