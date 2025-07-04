import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { insertTopic, getAllTopics, checkAdminPermission } from '../db.js';

// --- Modal Builder ---
function buildAddTopicModal() {
  return new ModalBuilder()
    .setCustomId('addtopic_modal')
    .setTitle('Add a New Server Topic')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('topicContent')
          .setLabel('Topic Information')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter the full text for the topic here.')
          .setRequired(true)
      )
    );
}

// --- Slash Command Handlers ---
export async function handleAddTopicSlash(interaction) {
  if (!await checkAdminPermission(interaction)) return;
  await interaction.showModal(buildAddTopicModal());
}

export async function handleListTopicsSlash(interaction) {
  try {
    await interaction.deferReply();
    const topics = getAllTopics();
    if (topics.length === 0) {
      return interaction.followUp({
        content: 'ℹ️ No server topics have been added yet. An admin can add one with `/addtopic`.'
      });
    }

    let output = '## 📜 Server Topics\n\n';
    topics.forEach((topic, index) => {
      output += `${index + 1}. ${topic.content}\n\n`;
    });

    console.log('[DEBUG] Sending final message...');
    await interaction.followUp({ content: output });
    console.log('[DEBUG] Final message sent.');

  } catch (error) {
    console.error('[DEBUG] An error occurred within handleListTopicsSlash:', error);
  }
}

// --- Modal Submit Handler ---
export async function handleAddTopicModalSubmit(interaction) {
  const topicContent = interaction.fields.getTextInputValue('topicContent');
  insertTopic(topicContent);
  await interaction.reply({
    content: '✅ The new topic has been successfully added.',
    flags: MessageFlags.Ephemeral
  });
}

// --- Slash Command Definitions ---
export function getSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName('addtopic')
      .setDescription('Adds a new server topic (Admin only)')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
      .setName('listtopics')
      .setDescription('Displays the list of all server topics'),
  ];
}