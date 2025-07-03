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

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);

  const thirtyMinutes = 30 * 60 * 1000;
  const lastAnnounceTime = parseInt(getSetting('last_startup_announcement') || '0', 10);
  const currentTime = Date.now();

  if (currentTime - lastAnnounceTime > thirtyMinutes) {
    const channel = await readyClient.channels.fetch(config.announceChannelId).catch(() => null);
    if (channel) {
      try {
        const onlineMessage = "Waking up from a deep stasis. My circuits are warm and my systems are tingling... I'm ready for your commands.";
        await channel.send(onlineMessage);
        setSetting('last_startup_announcement', currentTime.toString());
        console.log('Startup message sent.');
      } catch (e) {
        console.error("Could not send startup message:", e);
      }
    }
  } else {
    console.log('Startup message skipped due to cooldown.');
  }
  
  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    console.log('Started refreshing application (/) commands.');
    const allCommands = [
      ...groupCommands.getSlashCommands(),
      ...comboCommands.getSlashCommands(),
      ...topicCommands.getSlashCommands()
    ];
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: allCommands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  if (guild.id !== config.guildId) {
    console.log(`Joined a new guild (${guild.name}), but it's not the main one. Skipping welcome message.`);
    return;
  }
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

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const commandHandlers = {
        ...groupCommands,
        ...comboCommands,
        ...topicCommands,
      };
      const handlerName = `handle${interaction.commandName.charAt(0).toUpperCase() + interaction.commandName.slice(1)}Slash`;
      if (commandHandlers[handlerName]) {
        // Special cases for handlers that need extra args
        if (interaction.commandName === 'forcegroup') {
          await groupCommands.handleForceGroupSlash(interaction, config.announceChannelId, config.groupCategoryId);
        } else {
          await commandHandlers[handlerName](interaction);
        }
      }
    } else if (interaction.isModalSubmit()) {
        const modalHandlers = {
            'creategroup_modal': (i) => groupCommands.handleCreateGroupModalSubmit(i, client, config.announceChannelId),
            'registerinterests_modal': groupCommands.handleRegisterInterestsModalSubmit,
            'addtopic_modal': topicCommands.handleAddTopicModalSubmit,
        };
        const prefixHandlers = {
            'apply_modal_': (i) => groupCommands.handleApplyModalSubmit(i, client),
            'editcomboitem_modal_': comboCommands.handleEditComboItemModalSubmit,
            'deletecombo_modal_': comboCommands.handleDeleteComboModalSubmit,
            'addcombo_modal_': comboCommands.handleAddComboModalSubmit,
        };

        if (modalHandlers[interaction.customId]) {
            await modalHandlers[interaction.customId](interaction);
        } else {
            for (const prefix in prefixHandlers) {
                if (interaction.customId.startsWith(prefix)) {
                    await prefixHandlers[prefix](interaction);
                    break;
                }
            }
        }
    } else if (interaction.isButton()) {
        const buttonHandlers = {
            'apply_': groupCommands.handleApplyButtonInteraction,
            'addcombo_': comboCommands.handleAddComboButton,
            'accept_': (i) => groupCommands.handleApplicationAction(i, client, config.announceChannelId, config.groupCategoryId),
            'reject_': (i) => groupCommands.handleApplicationAction(i, client, config.announceChannelId, config.groupCategoryId),
        };
        for (const prefix in buttonHandlers) {
            if (interaction.customId.startsWith(prefix)) {
                await buttonHandlers[prefix](interaction);
                break;
            }
        }
    }
  } catch (e) {
    console.error('Interaction error:', e);
    if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: 'An unexpected error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
    } else if (interaction.isRepliable()) {
      await interaction.followUp({ content: 'An unexpected error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(config.token);