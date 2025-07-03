const Database = require('better-sqlite3');
const { customAlphabet } = require('nanoid');
const { PermissionsBitField, MessageFlags } = require('discord.js');

const db = new Database('hot-daddy.db');
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);

// The migrate.js script now handles all schema changes.

// --- Settings Management ---
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  // Default to 'false' for group creation if it has never been set.
  if (!row && key === 'group_creation_allowed') {
    return 'false';
  }
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// --- Topic Management ---
function insertTopic(content) {
  db.prepare('INSERT INTO topics (content) VALUES (?)').run(content);
}

function getAllTopics() {
  return db.prepare('SELECT id, content FROM topics ORDER BY id ASC').all();
}

// --- Group Management ---
function getGroups() { return db.prepare('SELECT * FROM groups').all(); }
function getGroupById(id) { return db.prepare('SELECT * FROM groups WHERE id = ?').get(id); }
function getGroupsByCreatorId(creatorId) { return db.prepare('SELECT * FROM groups WHERE creatorId = ?').all(creatorId); }
function insertGroup(group) {
  db.prepare(`INSERT INTO groups
    (id, creatorId, creatorName, groupName, description, memberCount, topics)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(group.id, group.creatorId, group.creatorName, group.groupName, group.description, group.memberCount, group.topics);
}
function updateGroupAnnouncementMessageId(id, messageId) {
  db.prepare('UPDATE groups SET announcementMessageId = ? WHERE id = ?').run(messageId, id);
}
function updateGroupPrivateChannelAndStatus(id, channelId, isFull) {
  db.prepare('UPDATE groups SET privateChannelId = ?, isFull = ? WHERE id = ?').run(channelId, isFull, id);
}

// --- Accepted Members ---
function getAcceptedUsers(groupId) {
  return db.prepare('SELECT userId FROM accepted WHERE groupId = ?').all(groupId).map(r => r.userId);
}
function insertAccepted(groupId, userId) {
  db.prepare('INSERT OR IGNORE INTO accepted (groupId, userId) VALUES (?, ?)').run(groupId, userId);
}
function removeAccepted(groupId, userId) {
  db.prepare('DELETE FROM accepted WHERE groupId = ? AND userId = ?').run(groupId, userId);
}

// --- Applicants ---
function insertApplicant(groupId, userId, userName, reason) {
  db.prepare('INSERT INTO applicants (groupId, userId, userName, reason) VALUES (?, ?, ?, ?)').run(groupId, userId, userName, reason);
}
function getApplicant(groupId, userId) {
  return db.prepare('SELECT * FROM applicants WHERE groupId = ? AND userId = ?').get(groupId, userId);
}
function removeApplicant(groupId, userId) {
  db.prepare('DELETE FROM applicants WHERE groupId = ? AND userId = ?').run(groupId, userId);
}
function getApplicantsForGroup(groupId) {
  return db.prepare('SELECT * FROM applicants WHERE groupId = ?').all(groupId);
}
function removeAllApplicantsForGroup(groupId) {
  return db.prepare('DELETE FROM applicants WHERE groupId = ?').run(groupId);
}

// --- User Interests ---
function getInterests(userId) {
  const row = db.prepare('SELECT interests FROM interests WHERE userId = ?').get(userId);
  return row ? row.interests : null;
}
function upsertInterests(userId, interests) {
  db.prepare(`INSERT INTO interests (userId, interests) VALUES (?, ?)
    ON CONFLICT(userId) DO UPDATE SET interests = excluded.interests`).run(userId, interests);
}

// --- Combo System Items ---
function insertComboItem(name, type) {
  db.prepare('INSERT INTO combo_items (name, type) VALUES (?, ?)').run(name, type);
}
function getComboItems() {
  return db.prepare('SELECT id, name, type FROM combo_items').all();
}
function getComboItemById(id) {
  return db.prepare('SELECT id, name, type FROM combo_items WHERE id = ?').get(id);
}
function updateComboItem(id, name, type) {
  db.prepare('UPDATE combo_items SET name = ?, type = ? WHERE id = ?').run(name, type, id);
}
function getRandomComboItemByType(type) {
  return db.prepare('SELECT name FROM combo_items WHERE type = ? ORDER BY RANDOM() LIMIT 1').get(type);
}
function deleteComboItemById(id) {
    return db.prepare('DELETE FROM combo_items WHERE id = ?').run(id);
}

// --- Utility Functions ---
async function sendDMAndReply(interaction, dmContent, publicReplyContent) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  try {
    await interaction.user.send(dmContent);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: publicReplyContent, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: publicReplyContent, flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error('Error sending DM or reply:', error);
    const fallbackMessage = 'I tried to send you a DM, but couldn\'t. Check your privacy settings or try again later!';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: fallbackMessage, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: fallbackMessage, flags: MessageFlags.Ephemeral });
    }
  }
}

async function checkAdminPermission(interaction) {
  if (!interaction.member || !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.followUp({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    return false;
  }
  return true;
}

module.exports = {
  db,
  nanoid,
  sendDMAndReply,
  checkAdminPermission,
  getSetting,
  setSetting,
  insertTopic,
  getAllTopics,
  getGroups,
  getGroupById,
  getGroupsByCreatorId,
  insertGroup,
  updateGroupAnnouncementMessageId,
  updateGroupPrivateChannelAndStatus,
  getAcceptedUsers,
  insertAccepted,
  removeAccepted,
  insertApplicant,
  getApplicant,
  removeApplicant,
  getApplicantsForGroup,
  removeAllApplicantsForGroup,
  getInterests,
  upsertInterests,
  insertComboItem,
  getComboItems,
  getComboItemById,
  updateComboItem,
  getRandomComboItemByType,
  deleteComboItemById,
};