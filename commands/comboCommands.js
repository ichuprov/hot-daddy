const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags, PermissionsBitField
} = require('discord.js');

const {
  sendDMAndReply, checkAdminPermission,
  insertComboItem, getComboItems, getComboItemById, updateComboItem, deleteComboItemById,
  getRandomComboItemByType
} = require('../db');

// --- Modal Builders ---
function buildAddComboNameModal(type) {
  const title = type === 'action' ? 'Add a New Action' : 'Add a New Body Part';
  return new ModalBuilder()
    .setCustomId(`addcombo_modal_${type}`)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('itemName')
          .setLabel('Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(type === 'action' ? 'e.g., Kissing, Light Touch' : 'e.g., Neck, Shoulders')
          .setRequired(true)
      )
    );
}

function buildDeleteConfirmationModal(item) {
  return new ModalBuilder()
    .setCustomId(`deletecombo_modal_${item.id}`)
    .setTitle(`Confirm Deletion of: ${item.name}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confirm_delete')
          .setLabel(`Type YES to delete Item #${item.id} (${item.type})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Must be in all caps.')
          .setRequired(true)
      )
    );
}

function buildEditComboItemModal(itemId, currentName, currentType) {
  return new ModalBuilder()
    .setCustomId(`editcomboitem_modal_${itemId}`)
    .setTitle('Edit Combo Item')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(currentName)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('type')
          .setLabel('Type (action or body-part)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(currentType)
      )
    );
}

// --- Command Handlers ---
async function handleAddComboSlash(interaction) {
  const instructionalText =
    "This command allows you to enter an item for the sexy combo generator. " +
    "If this item is an Action (eg light touch, licking) then click the Action button and in the pop up window, " +
    "type in that action. If this item is a body part (eg chest, ears) then click on Body Part and enter the item in the pop window.";

  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('addcombo_action')
        .setLabel('Action')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('addcombo_body-part')
        .setLabel('Body Part')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.reply({
    content: instructionalText,
    components: [buttons],
    flags: MessageFlags.Ephemeral
  });
}

async function handleDeleteComboItemSlash(interaction) {
    if (!await checkAdminPermission(interaction)) return;

    const itemId = interaction.options.getInteger('id');
    const itemToDelete = getComboItemById(itemId);

    if (!itemToDelete) {
        return interaction.reply({ content: `❌ No combo item found with ID: ${itemId}`, flags: MessageFlags.Ephemeral });
    }

    await interaction.showModal(buildDeleteConfirmationModal(itemToDelete));
}

async function handleSexyComboSlash(interaction) {
  const count = interaction.options.getInteger('count') || 1;
  let combos = [];
  let insufficientItems = false;

  for (let i = 0; i < count; i++) {
    const action = getRandomComboItemByType('action');
    const bodyPart = getRandomComboItemByType('body-part');

    if (action && bodyPart) {
      combos.push(`🔥 **${action.name}** - **${bodyPart.name}**`);
    } else {
      insufficientItems = true;
      break;
    }
  }

  if (insufficientItems) {
    return interaction.reply({ content: 'Not enough action or body-part items to create a combo. Please add more using `/addcombo`!' });
  }

  return interaction.reply({ content: 'Sexy Combo:\n' + combos.join('\n') });
}

async function handleListComboItemsSlash(interaction) {
  if (!await checkAdminPermission(interaction)) return;

  const comboItems = getComboItems();
  if (comboItems.length === 0) {
    await sendDMAndReply(
      interaction,
      'No combo items found.',
      'No combo items found. Check your DMs.'
    );
    return;
  }

  let output = '✨ **Combo Items List:**\n\nID\tName\tType\n';
  comboItems.forEach(item => {
    output += `${item.id}\t${item.name}\t${item.type}\n`;
  });

  await sendDMAndReply(
    interaction,
    '```\n' + output + '```',
    'Combo items list sent to your DMs!'
  );
}

async function handleEditComboItemSlash(interaction) {
  if (!await checkAdminPermission(interaction)) return;

  const itemId = interaction.options.getInteger('id');
  const itemToEdit = getComboItemById(itemId);

  if (!itemToEdit) {
    return interaction.reply({ content: `No combo item found with ID: ${itemId}`, flags: MessageFlags.Ephemeral });
  }

  await interaction.showModal(buildEditComboItemModal(itemToEdit.id, itemToEdit.name, itemToEdit.type));
}

// --- Button and Modal Handlers ---
async function handleAddComboButton(interaction) {
  const type = interaction.customId.split('_')[1];
  await interaction.showModal(buildAddComboNameModal(type));
}

async function handleAddComboModalSubmit(interaction) {
  const type = interaction.customId.split('_')[2];
  const name = interaction.fields.getTextInputValue('itemName');

  insertComboItem(name, type);

  await interaction.reply({
    content: `✅ Thanks! Your ${type}, **"${name}"**, has been added to the combo generator.`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleDeleteComboModalSubmit(interaction) {
    if (!await checkAdminPermission(interaction)) return;

    const itemId = parseInt(interaction.customId.split('_')[2]);
    const confirmation = interaction.fields.getTextInputValue('confirm_delete');

    if (confirmation !== 'YES') {
        return interaction.reply({
            content: '❌ Deletion cancelled. You did not type YES to confirm.',
            flags: MessageFlags.Ephemeral
        });
    }

    const result = deleteComboItemById(itemId);

    if (result.changes > 0) {
        await interaction.reply({ content: `✅ Combo item ID **${itemId}** has been deleted.`, flags: MessageFlags.Ephemeral });
    } else {
        await interaction.reply({ content: `⚠️ Could not delete combo item ID **${itemId}**. It may have been deleted by another admin already.`, flags: MessageFlags.Ephemeral });
    }
}

async function handleEditComboItemModalSubmit(interaction) {
  if (!await checkAdminPermission(interaction)) return;

  const editedItemId = parseInt(interaction.customId.split('_')[2]);
  const newName = interaction.fields.getTextInputValue('name');
  const newType = interaction.fields.getTextInputValue('type').toLowerCase();

  if (!['action', 'body-part'].includes(newType)) {
    await sendDMAndReply(
      interaction,
      '❌ Edit failed: Type must be "action" or "body-part".',
      'Invalid type provided. Check your DMs for details.'
    );
    return;
  }

  updateComboItem(editedItemId, newName, newType);
  await sendDMAndReply(
    interaction,
    `✅ Combo item ID **${editedItemId}** updated to Name: **"${newName}"**`,
    'Combo item updated. Check your DMs for confirmation.'
  );
}

// --- Slash Command Definitions for Registration ---
function getSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName('addcombo')
      .setDescription('Adds a new item (action or body-part) to the combo generator.'),
    new SlashCommandBuilder()
      .setName('sexycombo')
      .setDescription('Generates random combinations of actions and body parts')
      .addIntegerOption(option =>
        option.setName('count')
          .setDescription('Number of combos to generate (default is 1)')
          .setRequired(false)),
    new SlashCommandBuilder().setName('listcomboitems').setDescription('Lists all combo items (Admin Only)'),
    new SlashCommandBuilder()
      .setName('editcomboitem')
      .setDescription('Edits an existing combo item (Admin Only)')
      .addIntegerOption(option =>
        option.setName('id')
          .setDescription('The ID of the combo item to edit')
          .setRequired(true)),
    new SlashCommandBuilder()
      .setName('deletecomboitem')
      .setDescription('Deletes a combo item by its ID (Admin Only)')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addIntegerOption(option =>
        option.setName('id')
          .setDescription('The ID of the combo item to delete')
          .setRequired(true)),
  ];
}

module.exports = {
  handleAddComboSlash,
  handleSexyComboSlash,
  handleListComboItemsSlash,
  handleEditComboItemSlash,
  handleEditComboItemModalSubmit,
  handleAddComboButton,
  handleAddComboModalSubmit,
  handleDeleteComboItemSlash,
  handleDeleteComboModalSubmit,
  getSlashCommands
};