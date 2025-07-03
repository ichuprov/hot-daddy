import { Client, GatewayIntentBits, Partials, Events, REST, Routes, MessageFlags, ChannelType } from 'discord.js';
import config from './config.js';
import { checkAdminPermission, getSetting, setSetting } from './db.js';
import * as groupCommands from './commands/groupCommands.js';
import * as comboCommands from './commands/comboCommands.js';
import * as topicCommands from './commands/topicCommands.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel]
});

// This event runs once when the bot successfully connects.
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);

  // --- Startup Message with 30-minute Cooldown ---
  const thirtyMinutes = 30 * 60 * 1000;
  const lastAnnounceTime = parseInt(getSetting('last_startup_announcement') || '0', 10);
  const currentTime = Date.now();

  if (currentTime - lastAnnounceTime > thirtyMinutes) {
    const channel = await readyClient.channels.fetch(config.announceChannelId).catch(() => null);
    if (channel) {
      try {
        const onlineMessage = "Waking up from a deep stasis. My circuits are warm and my systems are tingling... I'm ready for your commands.";
        await channel.send(onlineMessage);
        // Save the current time to the database after announcing
        setSetting('last_startup_announcement', currentTime.toString());
        console.log('Startup message sent.');
      } catch (e) {
        console.error("Could not send startup message:", e);
      }
    }
  } else {
    console.log('Startup message skipped due to cooldown.');
  }
  
  // --- Command Registration ---
  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    console.log('Started refreshing application (/) commands.');

    const groupSlashCommands = groupCommands.getSlashCommands();
    const comboSlashCommands = comboCommands.getSlashCommands();
    const topicSlashCommands = topicCommands.getSlashCommands();

    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: [
            ...groupSlashCommands,
            ...comboSlashCommands,
            ...topicSlashCommands
        ]
      },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

// This event runs every time the bot is added to a new server.
client.on(Events.GuildCreate, async (guild) => {
  // IMPORTANT: Only run this for your main guild defined in the config.
  if (guild.id !== config.guildId) {
    console.log(`Joined a new guild (${guild.name}), but it's not the main one. Skipping welcome message.`);
    return;
  }
  
  console.log(`Joined the main guild: ${guild.name} (id: ${guild.id})`);
  
  // Fetch the specific channel from the config.
  const channel = await guild.channels.fetch(config.welcomeChannelId).catch(() => null);

  if (channel) {
    try {
      const welcomeMessage = "Well, hello there. The 'HoT' just got hotter. I've arrived to take care of the tedious details so you can all get back to the more... interesting parts of being here. Use / to see my list of services.";
      await channel.send(welcomeMessage);
    } catch (e) {
      console.error("Could not send welcome message to channel:", e);
    }
  } else {
    console.error(`Could not find the specified WELCOME_CHANNEL_ID: ${config.welcomeChannelId}`);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        // Group Commands
        case 'creategroup':
          await groupCommands.handleCreateGroupSlash(interaction);
          break;
        case 'listapplications':
          await groupCommands.handleListApplicationsSlash(interaction);
          break;
        case 'listgroups':
          await groupCommands.handleListGroupsSlash(interaction);
          break;
        case 'listmygroups':
            await groupCommands.handleListMyGroupsSlash(interaction);
            break;
        case 'forcegroup':
          await groupCommands.handleForceGroupSlash(interaction, config.announceChannelId, config.groupCategoryId);
          break;
        case 'registerinterests':
          await groupCommands.handleRegisterInterestsSlash(interaction);
          break;
        case 'showapplicants':
          await groupCommands.handleShowApplicantsSlash(interaction);
          break;
        case 'allowgroupcreation':
          await groupCommands.handleAllowGroupCreationSlash(interaction);
          break;
        case 'stopgroupcreation':
          await groupCommands.handleStopGroupCreationSlash(interaction);
          break;

        // Combo Commands
        case 'addcombo':
          await comboCommands.handleAddComboSlash(interaction);
          break;
        case 'sexycombo':
          await comboCommands.handleSexyComboSlash(interaction);
          break;
        case 'listcomboitems':
          await comboCommands.handleListComboItemsSlash(interaction);
          break;
        case 'editcomboitem':
            await comboCommands.handleEditComboItemSlash(interaction);
            break;
        case 'deletecomboitem':
            await comboCommands.handleDeleteComboItemSlash(interaction);
            break;

        // Topic Commands
        case 'addtopic':
          await topicCommands.handleAddTopicSlash(interaction);
          break;
        case 'listtopics':
          await topicCommands.handleListTopicsSlash(interaction);
          break;
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId === 'creategroup_modal') {
        await groupCommands.handleCreateGroupModalSubmit(interaction, client, config.announceChannelId);
      } else if (interaction.customId === 'registerinterests_modal') {
        await groupCommands.handleRegisterInterestsModalSubmit(interaction);
      } else if (interaction.customId.startsWith('apply_modal_')) {
        await groupCommands.handleApplyModalSubmit(interaction, client);
      } else if (interaction.customId.startsWith('editcomboitem_modal_')) {
          await comboCommands.handleEditComboItemModalSubmit(interaction);
      } else if (interaction.customId.startsWith('deletecombo_modal_')) {
          await comboCommands.handleDeleteComboModalSubmit(interaction);
      } else if (interaction.customId.startsWith('addcombo_modal_')) {
        await comboCommands.handleAddComboModalSubmit(interaction);
      }
      else if (interaction.customId === 'addtopic_modal') {
        await topicCommands.handleAddTopicModalSubmit(interaction);
      }
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith('apply_')) {
        await groupCommands.handleApplyButtonInteraction(interaction);
      } else if (interaction.customId.startsWith('addcombo_')) {
          await comboCommands.handleAddComboButton(interaction);
      } else if (interaction.customId.startsWith('accept_') || interaction.customId.startsWith('reject_')) {
          await groupCommands.handleApplicationAction(interaction, client, config.announceChannelId, config.groupCategoryId);
      }
    }
  } catch (e) {
    console.error('Interaction error:', e);
    if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: 'An unexpected error occurred while processing your request.', flags: MessageFlags.Ephemeral }).catch(() => {});
    } else if (interaction.deferred) {
      await interaction.followUp({ content: 'An unexpected error occurred after deferring your request.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(config.token);