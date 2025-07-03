const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  PermissionsBitField, MessageFlags
} = require('discord.js');

const { insertTopic, getAllTopics, checkAdminPermission } = require('../db');

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
async function handleAddTopicSlash(interaction) {
  if (!await checkAdminPermission(interaction)) return;
  await interaction.showModal(buildAddTopicModal());
}

async function handleListTopicsSlash(interaction) {
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

  await interaction.followUp({ content: output });
}

// --- Modal Submit Handler ---
async function handleAddTopicModalSubmit(interaction) {
  const topicContent = interaction.fields.getTextInputValue('topicContent');
  insertTopic(topicContent);
  await interaction.reply({
    content: '✅ The new topic has been successfully added.',
    flags: MessageFlags.Ephemeral
  });
}

// --- Slash Command Definitions ---
function getSlashCommands() {
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

module.exports = {
  handleAddTopicSlash,
  handleListTopicsSlash,
  handleAddTopicModalSubmit,
  getSlashCommands,
};