-- This is your first migration, which sets up the entire initial database.

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  creatorId TEXT,
  creatorName TEXT,
  groupName TEXT,
  description TEXT,
  memberCount INTEGER,
  topics TEXT,
  announcementMessageId TEXT,
  privateChannelId TEXT,
  isFull INTEGER DEFAULT 0
);

CREATE TABLE accepted (
  groupId TEXT,
  userId TEXT,
  PRIMARY KEY (groupId, userId)
);

CREATE TABLE applicants (
  groupId TEXT,
  userId TEXT,
  userName TEXT,
  reason TEXT,
  PRIMARY KEY (groupId, userId)
);

CREATE TABLE interests (
  userId TEXT PRIMARY KEY,
  interests TEXT
);

CREATE TABLE combo_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL
);