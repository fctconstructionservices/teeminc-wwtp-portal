-- Chat: messages live here, attachments live in Drive.
--
-- Text is tiny (~200 bytes a message) and needs to be queried, sorted
-- and searched, which is what a database is for. Attachments are large
-- and are only ever fetched whole, which is what Drive is for.

CREATE TABLE IF NOT EXISTS ChatConversations (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,        -- 'dm' | 'group'
  name          TEXT,                 -- groups only; a DM is named by its members
  membersJSON   TEXT NOT NULL,        -- lowercase emails
  driveFolderId TEXT,                 -- created lazily, on the first attachment
  createdBy     TEXT,
  createdAt     TEXT,
  updatedAt     TEXT                  -- last message, so the list sorts without a join
);

CREATE TABLE IF NOT EXISTS ChatMessages (
  id             TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL,
  author         TEXT NOT NULL,
  body           TEXT,
  attachmentsJSON TEXT,               -- [{id,url,name,mime,size,kind}]
  createdAt      TEXT NOT NULL,
  deletedAt      TEXT
);
CREATE INDEX IF NOT EXISTS idx_chatmsg_convo ON ChatMessages (conversationId, createdAt);

-- READ RECEIPTS WITHOUT A ROW PER MESSAGE PER READER.
-- One row per person per conversation holding how far they have read.
-- "Who has seen this message" is then everyone whose lastReadAt is at or
-- past its timestamp — the same answer, at a fraction of the storage.
CREATE TABLE IF NOT EXISTS ChatReads (
  conversationId TEXT NOT NULL,
  reader         TEXT NOT NULL,
  lastReadAt     TEXT,
  PRIMARY KEY (conversationId, reader)
);

CREATE TABLE IF NOT EXISTS ChatPresence (
  email    TEXT PRIMARY KEY,
  lastSeen TEXT
);
