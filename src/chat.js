import { all, batchAll, first, run } from './db.js';
import { isAdmin, low, nextId, nowIso, num, safeParseArray } from './util.js';
import { proxyToFileProxy } from './uploads.js';

/**
 * CHAT
 *
 * Messages live in D1; attachments live in Drive. Text is ~200 bytes a
 * line and has to be queried, ordered and searched — that is a database.
 * An attachment is large and is only ever fetched whole — that is Drive.
 *
 * PRESENCE IS POLLED, NOT PUSHED. One request carries the heartbeat, the
 * presence list and any new messages together, so an open conversation
 * costs one round trip every five seconds rather than three. A closed
 * dock drops to thirty seconds, because a closed dock is not being read
 * — only its unread badge has to stay roughly current.
 */

const ONLINE_MS = 60 * 1000;        // seen within a minute
const AWAY_MS = 5 * 60 * 1000;      // seen within five
const PRESENCE_WRITE_MS = 20 * 1000; // don't rewrite lastSeen more often than this
const PAGE = 40;

function presenceOf(lastSeen, now) {
  if (!lastSeen) return 'off';
  const age = now - new Date(lastSeen).getTime();
  if (Number.isNaN(age)) return 'off';
  if (age <= ONLINE_MS) return 'online';
  if (age <= AWAY_MS) return 'away';
  return 'off';
}

/**
 * touchPresence - record that this person is here.
 *
 * The UPDATE is guarded on lastSeen so a five-second poll does not
 * produce a five-second write: "online" only needs about a minute of
 * accuracy, so rewriting more often than every twenty seconds buys
 * nothing and spends the daily write budget four times over.
 */
async function touchPresence(env, email) {
  const now = nowIso();
  const cutoff = new Date(Date.now() - PRESENCE_WRITE_MS).toISOString();
  const res = await run(
    env, 'UPDATE ChatPresence SET lastSeen = ? WHERE email = ? AND lastSeen < ?',
    now, email, cutoff
  );
  if (!res.meta || !res.meta.changes) {
    // Either brand new, or already fresh. INSERT OR IGNORE settles both
    // without a second read to find out which.
    await run(env, 'INSERT OR IGNORE INTO ChatPresence (email, lastSeen) VALUES (?, ?)', email, now);
  }
}

function isMember(convo, email) {
  return safeParseArray(convo.membersJSON).map(low).includes(low(email));
}

async function loadConvo(env, id, identity) {
  const c = await first(env, 'SELECT * FROM ChatConversations WHERE id = ?', id);
  if (!c) throw new Error('That conversation no longer exists.');
  if (!isMember(c, identity.email)) throw new Error('You are not in that conversation.');
  return c;
}

/** dmKey - a DM's id is derived from its two members, sorted, so the
 *  same pair can never end up with two separate threads. */
function dmKey(a, b) {
  return 'dm-' + [low(a), low(b)].sort().join('|');
}

function shapeMessage(m) {
  return {
    id: m.id,
    author: m.author,
    body: m.deletedAt ? '' : (m.body || ''),
    attachments: m.deletedAt ? [] : safeParseArray(m.attachmentsJSON),
    createdAt: m.createdAt,
    deleted: !!m.deletedAt,
  };
}

/**
 * chatBootstrap - everything the dock needs to draw itself, plus the
 * heartbeat. This is the 30-second poll when the dock is closed.
 */
export async function chatBootstrap(env, identity) {
  const me = low(identity.email);
  await touchPresence(env, me);

  const [users, presence, convos, reads] = await batchAll(env, [
    'SELECT email, name, role, roleLabel FROM Users ORDER BY name',
    'SELECT email, lastSeen FROM ChatPresence',
    'SELECT * FROM ChatConversations ORDER BY updatedAt DESC',
    ['SELECT conversationId, lastReadAt FROM ChatReads WHERE lower(reader) = ?', me],
  ]);

  const now = Date.now();
  const seen = new Map(presence.map((p) => [low(p.email), p.lastSeen]));
  const people = users
    .filter((u) => low(u.email) !== me)
    .map((u) => ({
      email: low(u.email),
      name: u.name || u.email,
      role: u.roleLabel || u.role || '',
      state: presenceOf(seen.get(low(u.email)), now),
    }));

  const mine = convos.filter((c) => isMember(c, me));
  const readAt = new Map(reads.map((r) => [r.conversationId, r.lastReadAt]));

  // Unread counts in one query rather than one per conversation.
  let unreadBy = new Map();
  let lastBy = new Map();
  if (mine.length) {
    const ph = mine.map(() => '?').join(',');
    const ids = mine.map((c) => c.id);
    const [rows, lasts] = await batchAll(env, [
      [`SELECT conversationId, author, createdAt FROM ChatMessages
         WHERE conversationId IN (${ph}) AND deletedAt IS NULL`, ...ids],
      [`SELECT m.conversationId, m.author, m.body, m.createdAt, m.attachmentsJSON
         FROM ChatMessages m
         WHERE m.conversationId IN (${ph}) AND m.deletedAt IS NULL
         ORDER BY m.createdAt DESC`, ...ids],
    ]);
    for (const r of rows) {
      if (low(r.author) === me) continue;
      const since = readAt.get(r.conversationId);
      if (!since || String(r.createdAt) > String(since)) {
        unreadBy.set(r.conversationId, (unreadBy.get(r.conversationId) || 0) + 1);
      }
    }
    for (const l of lasts) if (!lastBy.has(l.conversationId)) lastBy.set(l.conversationId, l);
  }

  const nameOf = new Map(users.map((u) => [low(u.email), u.name || u.email]));

  const conversations = mine.map((c) => {
    const members = safeParseArray(c.membersJSON).map(low);
    const other = c.type === 'dm' ? members.find((m) => m !== me) : null;
    const lastMsg = lastBy.get(c.id);
    let preview = '';
    if (lastMsg) {
      const who = low(lastMsg.author) === me ? 'You' : (nameOf.get(low(lastMsg.author)) || '').split(' ')[0];
      const text = lastMsg.body || (safeParseArray(lastMsg.attachmentsJSON).length ? 'Attachment' : '');
      preview = c.type === 'group' ? `${who}: ${text}` : text;
    }
    return {
      id: c.id,
      type: c.type,
      name: c.type === 'group' ? c.name : (nameOf.get(other) || other || ''),
      members,
      other,
      otherState: other ? presenceOf(seen.get(other), now) : null,
      last: preview,
      lastAt: lastMsg ? lastMsg.createdAt : c.updatedAt,
      unread: unreadBy.get(c.id) || 0,
    };
  }).sort((a, b) => (String(a.lastAt) < String(b.lastAt) ? 1 : -1));

  return {
    me: { email: me, name: identity.user.name, isAdmin: isAdmin(identity) },
    people,
    conversations,
    serverTime: nowIso(),
  };
}

/**
 * chatSync - the 5-second poll for an open conversation.
 * Heartbeat, presence and anything said since `since`, in one trip.
 */
export async function chatSync(env, identity, conversationIds, since) {
  const me = low(identity.email);
  await touchPresence(env, me);

  const ids = (Array.isArray(conversationIds) ? conversationIds : []).slice(0, 3);
  const [presence, users] = await batchAll(env, [
    'SELECT email, lastSeen FROM ChatPresence',
    'SELECT email, name FROM Users',
  ]);
  const now = Date.now();
  const seen = new Map(presence.map((p) => [low(p.email), p.lastSeen]));
  const nameOf = new Map(users.map((u) => [low(u.email), u.name || u.email]));

  const out = { presence: {}, messages: {}, reads: {}, unread: {}, serverTime: nowIso() };
  for (const [email] of nameOf) out.presence[email] = presenceOf(seen.get(email), now);

  // UNREAD RIDES ALONG WITH EVERY POLL, open dock or closed.
  // It used to be absent unless a conversation was open, so a closed
  // dock never learned it had anything waiting and the badge stayed
  // blank until you opened it — which is the one moment a badge is
  // useless. Counted in SQL rather than by shipping every message
  // across, so this stays cheap enough to run every five seconds.
  const mineConvos = await all(
    env,
    "SELECT id FROM ChatConversations WHERE membersJSON LIKE ?",
    `%"${me}"%`
  );
  if (mineConvos.length) {
    const cph = mineConvos.map(() => '?').join(',');
    const counts = await all(
      env,
      `SELECT m.conversationId AS id, COUNT(*) AS n
         FROM ChatMessages m
         LEFT JOIN ChatReads r
           ON r.conversationId = m.conversationId AND lower(r.reader) = ?
        WHERE m.conversationId IN (${cph})
          AND m.deletedAt IS NULL
          AND lower(m.author) <> ?
          AND (r.lastReadAt IS NULL OR m.createdAt > r.lastReadAt)
        GROUP BY m.conversationId`,
      me, ...mineConvos.map((c) => c.id), me
    );
    for (const c of counts) out.unread[c.id] = num(c.n);
  }

  if (!ids.length) return out;

  const cutoff = since || new Date(Date.now() - 86400000).toISOString();
  const ph = ids.map(() => '?').join(',');
  const [msgs, reads, convos] = await batchAll(env, [
    [`SELECT * FROM ChatMessages WHERE conversationId IN (${ph}) AND createdAt > ? ORDER BY createdAt`, ...ids, cutoff],
    [`SELECT * FROM ChatReads WHERE conversationId IN (${ph})`, ...ids],
    [`SELECT id, membersJSON FROM ChatConversations WHERE id IN (${ph})`, ...ids],
  ]);

  const allowed = new Set(convos.filter((c) => isMember(c, me)).map((c) => c.id));
  for (const m of msgs) {
    if (!allowed.has(m.conversationId)) continue;
    (out.messages[m.conversationId] = out.messages[m.conversationId] || []).push(shapeMessage(m));
  }
  // Read receipts: how far each member has read, so the sender can show
  // who has seen a given message without a row per message per reader.
  for (const r of reads) {
    if (!allowed.has(r.conversationId)) continue;
    (out.reads[r.conversationId] = out.reads[r.conversationId] || []).push({
      reader: low(r.reader), name: nameOf.get(low(r.reader)) || r.reader, lastReadAt: r.lastReadAt,
    });
  }
  return out;
}

/** chatHistory - one page of a thread, oldest-first, newest page first. */
export async function chatHistory(env, identity, conversationId, before) {
  await loadConvo(env, conversationId, identity);
  const rows = before
    ? await all(env, 'SELECT * FROM ChatMessages WHERE conversationId = ? AND createdAt < ? ORDER BY createdAt DESC LIMIT ?', conversationId, before, PAGE)
    : await all(env, 'SELECT * FROM ChatMessages WHERE conversationId = ? ORDER BY createdAt DESC LIMIT ?', conversationId, PAGE);
  const messages = rows.reverse().map(shapeMessage);
  return { conversationId, messages, hasMore: rows.length === PAGE };
}

export async function chatSend(env, identity, conversationId, body, attachments) {
  const convo = await loadConvo(env, conversationId, identity);
  const text = String(body || '').trim();
  const atts = Array.isArray(attachments) ? attachments : [];
  if (!text && !atts.length) throw new Error('Nothing to send.');
  if (text.length > 4000) throw new Error('That message is too long — 4000 characters is the limit.');

  const id = nextId('MSG');
  const at = nowIso();
  await run(
    env,
    `INSERT INTO ChatMessages (id, conversationId, author, body, attachmentsJSON, createdAt, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    id, conversationId, low(identity.email), text, JSON.stringify(atts), at
  );
  await run(env, 'UPDATE ChatConversations SET updatedAt = ? WHERE id = ?', at, conversationId);
  // Sending is also reading — otherwise your own message counts as
  // unread to you until you happen to open the thread again.
  await markRead(env, low(identity.email), conversationId, at);
  return { id, createdAt: at };
}

async function markRead(env, reader, conversationId, at) {
  const res = await run(
    env, 'UPDATE ChatReads SET lastReadAt = ? WHERE conversationId = ? AND reader = ? AND lastReadAt < ?',
    at, conversationId, reader, at
  );
  if (!res.meta || !res.meta.changes) {
    await run(
      env, 'INSERT OR IGNORE INTO ChatReads (conversationId, reader, lastReadAt) VALUES (?, ?, ?)',
      conversationId, reader, at
    );
  }
}

export async function chatMarkRead(env, identity, conversationId) {
  await loadConvo(env, conversationId, identity);
  await markRead(env, low(identity.email), conversationId, nowIso());
  return { success: true };
}

/** chatStartDm - opens the thread with someone, creating it once. */
export async function chatStartDm(env, identity, email) {
  const me = low(identity.email);
  const them = low(email);
  if (!them || them === me) throw new Error('Pick somebody else.');
  const user = await first(env, 'SELECT email FROM Users WHERE lower(email) = ?', them);
  if (!user) throw new Error('That person is not in the system.');

  const id = dmKey(me, them);
  const existing = await first(env, 'SELECT id FROM ChatConversations WHERE id = ?', id);
  if (!existing) {
    await run(
      env,
      `INSERT INTO ChatConversations (id, type, name, membersJSON, driveFolderId, createdBy, createdAt, updatedAt)
       VALUES (?, 'dm', '', ?, '', ?, ?, ?)`,
      id, JSON.stringify([me, them]), me, nowIso(), nowIso()
    );
  }
  return { id };
}

export async function chatCreateGroup(env, identity, name, members) {
  const me = low(identity.email);
  const title = String(name || '').trim();
  if (!title) throw new Error('A group needs a name.');
  const list = Array.from(new Set([me, ...(Array.isArray(members) ? members : []).map(low)])).filter(Boolean);
  if (list.length < 3) throw new Error('A group needs at least two other people — use a direct message for one.');

  const id = nextId('GRP');
  const at = nowIso();
  await run(
    env,
    `INSERT INTO ChatConversations (id, type, name, membersJSON, driveFolderId, createdBy, createdAt, updatedAt)
     VALUES (?, 'group', ?, ?, '', ?, ?, ?)`,
    id, title, JSON.stringify(list), me, at, at
  );
  return { id };
}

export async function chatAddMember(env, identity, conversationId, email) {
  const convo = await loadConvo(env, conversationId, identity);
  if (convo.type !== 'group') throw new Error('A direct message has exactly two people.');
  const who = low(email);
  const user = await first(env, 'SELECT email FROM Users WHERE lower(email) = ?', who);
  if (!user) throw new Error('That person is not in the system.');

  const members = safeParseArray(convo.membersJSON).map(low);
  if (members.includes(who)) return { success: true, members };
  members.push(who);
  await run(env, 'UPDATE ChatConversations SET membersJSON = ?, updatedAt = ? WHERE id = ?',
    JSON.stringify(members), nowIso(), conversationId);
  return { success: true, members };
}

export async function chatRemoveMember(env, identity, conversationId, email) {
  const convo = await loadConvo(env, conversationId, identity);
  if (convo.type !== 'group') throw new Error('A direct message has exactly two people.');
  const who = low(email);
  // Anyone may add; only an admin may remove — or you may remove
  // yourself, which is leaving rather than removing.
  if (!isAdmin(identity) && who !== low(identity.email)) {
    throw new Error('Only an admin can remove someone else from a group.');
  }
  const members = safeParseArray(convo.membersJSON).map(low).filter((m) => m !== who);
  await run(env, 'UPDATE ChatConversations SET membersJSON = ?, updatedAt = ? WHERE id = ?',
    JSON.stringify(members), nowIso(), conversationId);
  return { success: true, members };
}

/**
 * chatUpload - an attachment, into this conversation's own Drive folder.
 * The folder is created on first use, so an empty thread leaves nothing
 * behind in Drive.
 */
export async function chatUpload(env, identity, conversationId, base64, fileName, mimeType) {
  const convo = await loadConvo(env, conversationId, identity);
  if (!base64 || !fileName) throw new Error('Nothing to upload.');

  const label = convo.type === 'group'
    ? (convo.name || conversationId)
    : safeParseArray(convo.membersJSON).map((m) => String(m).split('@')[0]).sort().join(' & ');
  // Drive rejects a slash in a folder name and would read it as a level.
  const safeLabel = String(label).replace(/[\\/]/g, '-').slice(0, 80);

  const result = await proxyToFileProxy(env, {
    base64, name: fileName, mime: mimeType,
    folderPath: ['Chat', safeLabel],
  });

  const kind = /^image\//i.test(mimeType || '') ? 'img' : 'pdf';
  return { id: result.id, url: result.url, name: fileName, mime: mimeType || '', kind };
}

export async function chatDeleteMessage(env, identity, messageId) {
  const m = await first(env, 'SELECT * FROM ChatMessages WHERE id = ?', messageId);
  if (!m) throw new Error('That message no longer exists.');
  if (low(m.author) !== low(identity.email) && !isAdmin(identity)) {
    throw new Error('You can only delete your own message.');
  }
  // Soft delete: the thread keeps its shape, and "this message was
  // deleted" is more honest than a line silently vanishing.
  await run(env, 'UPDATE ChatMessages SET deletedAt = ? WHERE id = ?', nowIso(), messageId);
  return { success: true };
}
