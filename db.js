import Database from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { PermissionsBitField, MessageFlags } from 'discord.js';
import config from './config.js'

export const db = new Database(config.databasePath);
export const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row && key === 'group_creation_allowed') {
    return 'false';
  }
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

export function insertTopic(content) {
  db.prepare('INSERT INTO topics (content) VALUES (?)').run(content);
}

export function getAllTopics() {
  return db.prepare('SELECT id, content FROM topics ORDER BY id ASC').all();
}

export function getGroups() { return db.prepare('SELECT * FROM groups').all(); }
export function getGroupById(id) { return db.prepare('SELECT * FROM groups WHERE id = ?').get(id); }
export function getGroupsByCreatorId(creatorId) { return db.prepare('SELECT * FROM groups WHERE creatorId = ?').all(creatorId); }
export function insertGroup(group) {
  db.prepare(`INSERT INTO groups (id, creatorId, creatorName, groupName, description, memberCount, topics) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(group.id, group.creatorId, group.creatorName, group.groupName, group.description, group.memberCount, group.topics);
}
export function updateGroupAnnouncementMessageId(id, messageId) {
  db.prepare('UPDATE groups SET announcementMessageId = ? WHERE id = ?').run(messageId, id);
}
export function updateGroupPrivateChannelAndStatus(id, channelId, isFull) {
  db.prepare('UPDATE groups SET privateChannelId = ?, isFull = ? WHERE id = ?').run(channelId, isFull, id);
}

export function getAcceptedUsers(groupId) {
  return db.prepare('SELECT userId FROM accepted WHERE groupId = ?').all(groupId).map(r => r.userId);
}
export function insertAccepted(groupId, userId) {
  db.prepare('INSERT OR IGNORE INTO accepted (groupId, userId) VALUES (?, ?)').run(groupId, userId);
}
export function removeAccepted(groupId, userId) {
  db.prepare('DELETE FROM accepted WHERE groupId = ? AND userId = ?').run(groupId, userId);
}

export function insertApplicant(groupId, userId, userName, reason) {
  db.prepare('INSERT INTO applicants (groupId, userId, userName, reason) VALUES (?, ?, ?, ?)').run(groupId, userId, userName, reason);
}
export function getApplicant(groupId, userId) {
  return db.prepare('SELECT * FROM applicants WHERE groupId = ? AND userId = ?').get(groupId, userId);
}
export function removeApplicant(groupId, userId) {
  db.prepare('DELETE FROM applicants WHERE groupId = ? AND userId = ?').run(groupId, userId);
}
export function getApplicantsForGroup(groupId) {
  return db.prepare('SELECT * FROM applicants WHERE groupId = ?').all(groupId);
}
export function removeAllApplicantsForGroup(groupId) {
  return db.prepare('DELETE FROM applicants WHERE groupId = ?').run(groupId);
}

export function getInterests(userId) {
  const row = db.prepare('SELECT interests FROM interests WHERE userId = ?').get(userId);
  return row ? row.interests : null;
}
export function upsertInterests(userId, interests) {
  db.prepare(`INSERT INTO interests (userId, interests) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET interests = excluded.interests`).run(userId, interests);
}

export function insertComboItem(name, type) {
  db.prepare('INSERT INTO combo_items (name, type) VALUES (?, ?)').run(name, type);
}
export function getComboItems() {
  return db.prepare('SELECT id, name, type FROM combo_items').all();
}
export function getComboItemById(id) {
  return db.prepare('SELECT id, name, type FROM combo_items WHERE id = ?').get(id);
}
export function updateComboItem(id, name, type) {
  db.prepare('UPDATE combo_items SET name = ?, type = ? WHERE id = ?').run(name, type, id);
}
export function getRandomComboItemByType(type) {
  return db.prepare('SELECT name FROM combo_items WHERE type = ? ORDER BY RANDOM() LIMIT 1').get(type);
}
export function deleteComboItemById(id) {
    return db.prepare('DELETE FROM combo_items WHERE id = ?').run(id);
}

export async function sendDMAndReply(interaction, dmContent, publicReplyContent) {
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
    const fallbackMessage = 'I tried to send you a DM, but couldn\'t. Check your privacy settings!';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: fallbackMessage, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: fallbackMessage, flags: MessageFlags.Ephemeral });
    }
  }
}

export async function checkAdminPermission(interaction) {
  if (!interaction.member || !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const replyOptions = { content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral };
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply(replyOptions);
    } else {
      await interaction.followUp(replyOptions);
    }
    return false;
  }
  return true;
}