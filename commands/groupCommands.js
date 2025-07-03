const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField,
  MessageFlags
} = require('discord.js');

const {
  nanoid, sendDMAndReply, checkAdminPermission, getSetting, setSetting,
  getGroups, getGroupById, getGroupsByCreatorId, insertGroup,
  updateGroupAnnouncementMessageId, updateGroupPrivateChannelAndStatus,
  getAcceptedUsers, insertAccepted, removeAccepted,
  insertApplicant, getApplicant, removeApplicant, getApplicantsForGroup, removeAllApplicantsForGroup,
  getInterests, upsertInterests
} = require('../db');

function buildCreateGroupModal() {
  return new ModalBuilder()
    .setCustomId('creategroup_modal')
    .setTitle('Create a Group')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('groupName').setLabel('Group Name').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('topics').setLabel('Topics (comma separated)').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('memberCount').setLabel('Member Count (3 or 4)').setStyle(TextInputStyle.Short).setRequired(true))
    );
}

function buildRegisterInterestsModal() {
  return new ModalBuilder()
    .setCustomId('registerinterests_modal')
    .setTitle('Register Your Interests')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('interests')
          .setLabel('Enter your interests (comma separated)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

function buildApplyModal(groupName, groupId) {
  return new ModalBuilder()
    .setCustomId(`apply_modal_${groupId}`)
    .setTitle(`Apply to ${groupName}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Why do you want to join this group?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

async function createPrivateGroupChannel(guild, group, acceptedIds, parentCategoryId) {
  const channelName = group.groupName.toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '-channel';

  const permissions = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    ...acceptedIds.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }))
  ];

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parentCategoryId,
    permissionOverwrites: permissions,
    topic: `A private channel for the group: "${group.groupName}". Topics: ${group.topics}`,
    nsfw: true,
  });

  return channel.id;
}

async function sendGroupAnnouncement(group, user, client, announceChannelId) {
  const announceChannel = await client.channels.fetch(announceChannelId);
  const applyButton = new ButtonBuilder()
    .setCustomId(`apply_${group.id}`)
    .setLabel('✨ Apply ✨')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(applyButton);

  const announcement = await announceChannel.send({
    content:
      '✨ **New Group Created!** ✨\n\n' +
      '**Creator:** ' + user.username + '\n' +
      '**Group Name:** ' + group.groupName + '\n' +
      '**Description:** ' + group.description + '\n' +
      '**Member Count:** ' + group.memberCount + '\n' +
      '**Topics:** ' + group.topics + '\n\n' +
      'Click the **✨ Apply ✨** button to join this group!',
    components: [row]
  });

  updateGroupAnnouncementMessageId(group.id, announcement.id);
}

async function disableApplyButton(group, client, announceChannelId) {
  if (!group.announcementMessageId) return;
  try {
    const announceChannel = await client.channels.fetch(announceChannelId);
    const msg = await announceChannel.messages.fetch(group.announcementMessageId);
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('apply_disabled')
        .setLabel('✨ Group Full ✨')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await msg.edit({ components: [disabledRow] });
  } catch (e) {
    console.error('Error disabling apply button:', e);
  }
}

async function completeGroup(interaction, group, client, announceChannelId, groupCategoryId) {
    const acceptedUsers = getAcceptedUsers(group.id);
    const remainingApplicants = getApplicantsForGroup(group.id);

    // Create the private channel
    const channelId = await createPrivateGroupChannel(interaction.guild, group, acceptedUsers, groupCategoryId);
    updateGroupPrivateChannelAndStatus(group.id, channelId, 1);
    await disableApplyButton(group, client, announceChannelId);

    // Clean up: Reject and notify all remaining applicants
    if (remainingApplicants.length > 0) {
        for (const applicant of remainingApplicants) {
            const user = await client.users.fetch(applicant.userId).catch(() => null);
            if (user) {
                user.send(`ℹ️ The group "${group.groupName}" you applied to has been filled. Your application has been closed.`).catch(() => {});
            }
        }
        removeAllApplicantsForGroup(group.id);
    }
    return channelId;
}

async function handleCreateGroupSlash(interaction) {
  const isAllowed = getSetting('group_creation_allowed');
  if (isAllowed === 'false') {
    return interaction.reply({
      content: '⛔ Group creation is currently disabled by an administrator.',
      flags: MessageFlags.Ephemeral
    });
  }
  await interaction.showModal(buildCreateGroupModal());
}

async function handleListApplicationsSlash(interaction) {
    const creatorId = interaction.user.id;
    const creatorGroups = getGroupsByCreatorId(creatorId);
    let foundApplicants = false;

    if (creatorGroups.length === 0) {
        await interaction.reply({ 
            content: '🧙 You haven\'t created any groups, so you have no applications to manage.', 
            flags: MessageFlags.Ephemeral 
        });
        return;
    }
    
    await interaction.reply({ content: '🧙 Sending your pending applications to your DMs...', flags: MessageFlags.Ephemeral });

    for (const group of creatorGroups) {
        const applicants = getApplicantsForGroup(group.id);
        if (applicants.length > 0) {
            foundApplicants = true;
            
            for (const applicant of applicants) {
                const interests = getInterests(applicant.userId) || 'No interests provided.';
                const applicationButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`accept_${group.id}_${applicant.userId}`)
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_${group.id}_${applicant.userId}`)
                        .setLabel('Reject')
                        .setStyle(ButtonStyle.Danger)
                );

                try {
                    await interaction.user.send({
                        content:
                            `---\n**Applicant for Group: ${group.groupName}**\n` +
                            `**Applicant:** ${applicant.userName} (<@${applicant.userId}>)\n` +
                            `**Reason:** ${applicant.reason}\n` +
                            `**Interests:** ${interests}`,
                        components: [applicationButtons]
                    });
                } catch (e) {
                    console.error(`Could not send DM to user ${creatorId}. They may have DMs disabled.`);
                    await interaction.editReply({ content: '❌ I tried to send your applications to your DMs, but they are disabled. Please enable them and try again.'});
                    return;
                }
            }
        }
    }

    if (!foundApplicants) {
        await interaction.user.send({ content: '🧙 You have no pending applications for any of your groups.' }).catch(() => {
            interaction.editReply({ content: '❌ I tried to send you a message, but your DMs seem to be disabled.' });
        });
    }
}

async function handleListMyGroupsSlash(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const creatorId = interaction.user.id;
    const myGroups = getGroupsByCreatorId(creatorId);

    if (myGroups.length === 0) {
        return interaction.followUp({ 
            content: "🧙 You haven't created any groups yet. Use `/creategroup` to start one!",
            flags: MessageFlags.Ephemeral 
        });
    }

    let output = "🧙 **Here are the groups you've created:**\n\n";
    for (const group of myGroups) {
        const acceptedUserIds = getAcceptedUsers(group.id);
        const acceptedCount = acceptedUserIds.length;
        
        let membersInterests = '';
        if(acceptedCount > 0) {
            const memberDetails = await Promise.all(acceptedUserIds.map(async (id) => {
                const user = await interaction.client.users.fetch(id).catch(() => ({ username: 'Unknown User' }));
                const interests = getInterests(id) || 'No interests registered.';
                return `  - ${user.username}: *${interests}*`;
            }));
            membersInterests = `\n**Members' Interests:**\n${memberDetails.join('\n')}`;
        }

        output +=
          `**Name:** ${group.groupName} (ID: ${group.id})\n` +
          `**Members:** ${acceptedCount} / ${group.memberCount}\n` +
          `**Status:** ${group.isFull ? '✅ Complete' : '⏳ Pending'}\n` +
          `**Group Topics:** ${group.topics}\n` +
          `**Description:** ${group.description}${membersInterests}\n`;

        if (myGroups.indexOf(group) !== myGroups.length - 1) {
            output += '----------------------\n';
        }
    }

    await sendDMAndReply(interaction, output, "🧙 I've sent a list of your created groups to your DMs!");
}

async function handleAllowGroupCreationSlash(interaction) {
  if (!await checkAdminPermission(interaction)) return;
  setSetting('group_creation_allowed', 'true');
  await interaction.reply({ content: '✅ Group creation is now **enabled**.', flags: MessageFlags.Ephemeral });
}

async function handleStopGroupCreationSlash(interaction) {
  if (!await checkAdminPermission(interaction)) return;
  setSetting('group_creation_allowed', 'false');
  await interaction.reply({ content: '⛔ Group creation is now **disabled**.', flags: MessageFlags.Ephemeral });
}

async function handleRegisterInterestsSlash(interaction) {
  await interaction.showModal(buildRegisterInterestsModal());
}

async function handleListGroupsSlash(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const groups = getGroups();
  if (groups.length === 0) {
    await interaction.user.send('🧙 No groups found.');
    await interaction.followUp({ content: '🧙 Group list sent to your DMs (or no groups found).', flags: MessageFlags.Ephemeral });
    return;
  }

  let output = '🧙 **Group List:**\n\n';
  groups.forEach((g, index) => {
    output +=
      '**Group ID:** ' + g.id + '\n' +
      '**Name:** ' + g.groupName + '\n' +
      '**Creator:** ' + g.creatorName + '\n' +
      '**Member Count:** ' + g.memberCount + '\n' +
      '**Status:** ' + (g.isFull ? 'Complete' : 'Pending') + '\n';

    if (groups.length > 1 && index !== groups.length - 1) output += '----------------------\n';
  });

  await sendDMAndReply(interaction, output, '🧙 Group list sent to your DMs!');
}

async function handleForceGroupSlash(interaction, announceChannelId, groupCategoryId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const groupId = interaction.options.getString('groupid');
  const group = getGroupById(groupId);
  if (!group) {
    await interaction.followUp({ content: '🧙 Group not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (group.isFull) {
    await interaction.followUp({ content: '🧙 Group is already marked as complete.', flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const channelId = await completeGroup(interaction, group, interaction.client, announceChannelId, groupCategoryId);
    await interaction.user.send('🧙 Group forced to complete. Private channel created: <#' + channelId + '>');
    await interaction.followUp({ content: '🧙 Group forced to complete. Check your DMs for details.', flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error('Error forcing group:', err);
    await interaction.followUp({ content: '🧙 An error occurred forcing the group.', flags: MessageFlags.Ephemeral });
  }
}

async function handleShowApplicantsSlash(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const creatorId = interaction.user.id;
    const creatorGroups = getGroupsByCreatorId(creatorId);
    let foundApplicants = false;

    if (creatorGroups.length === 0) {
        await interaction.user.send('🧙 You haven\'t created any groups yet. Use `/creategroup` to get started!');
    } else {
        for (const group of creatorGroups) {
            const applicants = getApplicantsForGroup(group.id);
            if (applicants.length > 0) {
                foundApplicants = true;
                for (const applicant of applicants) {
                    const interests = getInterests(applicant.userId) || 'No interests provided.';
                    const applicationButtons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`accept_${group.id}_${applicant.userId}`)
                            .setLabel('Accept')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`reject_${group.id}_${applicant.userId}`)
                            .setLabel('Reject')
                            .setStyle(ButtonStyle.Danger)
                    );

                    await interaction.user.send({
                        content: 
                            `--- **Applicant for Group: ${group.groupName} (ID: ${group.id})** ---\n` +
                            `**Applicant:** ${applicant.userName} (<@${applicant.userId}>)\n` +
                            `**Reason:** ${applicant.reason}\n` +
                            `**Interests:** ${interests}`,
                        components: [applicationButtons]
                    }).catch(e => console.error(`Could not DM user ${interaction.user.id}`, e));
                }
            }
        }

        if (!foundApplicants) {
            await interaction.user.send('🧙 You have no pending applications for any of your groups.');
        }
    }

    await interaction.followUp({ content: '🧙 Your applicant list has been sent to your DMs!' });
}

async function handleCreateGroupModalSubmit(interaction, client, announceChannelId) {
  const groupName = interaction.fields.getTextInputValue('groupName');
  const description = interaction.fields.getTextInputValue('description');
  const topics = interaction.fields.getTextInputValue('topics');
  const memberCount = parseInt(interaction.fields.getTextInputValue('memberCount'));

  if (![3, 4].includes(memberCount)) {
    return interaction.reply({ content: 'Member count must be 3 or 4.', flags: MessageFlags.Ephemeral });
  }

  const groupId = nanoid();

  insertGroup({
    id: groupId,
    creatorId: interaction.user.id,
    creatorName: interaction.user.username,
    groupName,
    description,
    memberCount,
    topics
  });

  insertAccepted(groupId, interaction.user.id);

  await sendGroupAnnouncement({ id: groupId, groupName, description, memberCount, topics }, interaction.user, client, announceChannelId);

  return interaction.reply({ content: 'Your group has been created and announced!', flags: MessageFlags.Ephemeral });
}

async function handleRegisterInterestsModalSubmit(interaction) {
  const interestsText = interaction.fields.getTextInputValue('interests').trim();
  upsertInterests(interaction.user.id, interestsText);
  return interaction.reply({ content: 'Your interests have been saved!', flags: MessageFlags.Ephemeral });
}

async function handleApplyModalSubmit(interaction, client) {
  const groupId = interaction.customId.split('_')[2];
  const reason = interaction.fields.getTextInputValue('reason');
  const group = getGroupById(groupId);

  if (!group) return interaction.reply({ content: 'Group not found.', flags: MessageFlags.Ephemeral });
  if (group.isFull) return interaction.reply({ content: 'Sorry, this group is full.', flags: MessageFlags.Ephemeral });
  if (getAcceptedUsers(groupId).includes(interaction.user.id)) return interaction.reply({ content: 'You are already a member.', flags: MessageFlags.Ephemeral });
  if (getApplicant(groupId, interaction.user.id)) return interaction.reply({ content: 'You already applied.', flags: MessageFlags.Ephemeral });

  insertApplicant(groupId, interaction.user.id, interaction.user.username, reason);

  const creatorUser = await client.users.fetch(group.creatorId).catch(() => null);
  if (creatorUser) {
    const interests = getInterests(interaction.user.id) || 'No interests provided.';
    const applicationButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`accept_${group.id}_${interaction.user.id}`)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`reject_${group.id}_${interaction.user.id}`)
            .setLabel('Reject')
            .setStyle(ButtonStyle.Danger)
    );

    creatorUser.send({
        content: '🧙 **' + interaction.user.username + '** applied to your group **' + group.groupName + '**.\n' +
                 'Reason: ' + reason + '\n' +
                 'Interests: ' + interests,
        components: [applicationButtons]
    }).catch(() => { });
  }

  return interaction.reply({ content: 'Your application has been sent to the group creator.', flags: MessageFlags.Ephemeral });
}

async function handleApplyButtonInteraction(interaction) {
  const groupId = interaction.customId.split('_')[1];
  const group = getGroupById(groupId);

  if (!group) return interaction.reply({ content: 'Group not found or expired.', flags: MessageFlags.Ephemeral });
  if (group.isFull) return interaction.reply({ content: 'Sorry, this group is full.', flags: MessageFlags.Ephemeral });
  if (getAcceptedUsers(groupId).includes(interaction.user.id)) return interaction.reply({ content: 'You are already a member.', flags: MessageFlags.Ephemeral });
  if (getApplicant(groupId, interaction.user.id)) return interaction.reply({ content: 'You already applied.', flags: MessageFlags.Ephemeral });

  return interaction.showModal(buildApplyModal(group.groupName, group.id));
}

async function handleApplicationAction(interaction, client, announceChannelId, groupCategoryId) {
  const [action, groupId, applicantId] = interaction.customId.split('_');
  
  const group = getGroupById(groupId);
  if (!group) {
    return interaction.update({ content: 'This group no longer exists.', components: [] });
  }

  if (group.isFull) {
      return interaction.update({
          content: `${interaction.message.content}\n\n❌ **This group is already full.** You cannot accept more members.`,
          components: []
      });
  }

  if (interaction.user.id !== group.creatorId) {
    return interaction.reply({ content: 'You are not the creator of this group.', flags: MessageFlags.Ephemeral });
  }
  
  const applicant = await client.users.fetch(applicantId).catch(() => null);
  if (!applicant) {
    return interaction.update({ content: `Could not find the applicant. They may have left the server.`, components: [] });
  }

  const applicantRow = getApplicant(groupId, applicantId);
  if (!applicantRow) {
    return interaction.update({ content: 'This application was already handled.', components: [] });
  }

  if (action === 'accept') {
    insertAccepted(groupId, applicantId);
    removeApplicant(groupId, applicantId);

    applicant.send(`🧙 You have been **accepted** to the group "${group.groupName}". Congrats!`).catch(() => {});
    await interaction.update({
      content: `${interaction.message.content}\n\n✅ You accepted **${applicant.username}**.`,
      components: []
    });

    const newAcceptedCount = getAcceptedUsers(groupId).length;
    if (newAcceptedCount >= group.memberCount) {
        try {
            const channelId = await completeGroup(interaction, group, client, announceChannelId, groupCategoryId);
            await interaction.user.send(`✨ Your group, **${group.groupName}**, is now full! The private channel <#${channelId}> has been created.`);
        } catch (e) {
            console.error("Error during automatic group completion:", e);
            await interaction.user.send(`⚠️ Your group, **${group.groupName}**, is full, but I encountered an error creating the private channel. An admin may need to use \`/forcegroup\`.`);
        }
    }

  } else if (action === 'reject') {
    removeApplicant(groupId, applicantId);
    
    applicant.send(`🧙 Your application to "${group.groupName}" was **rejected**.`).catch(() => {});
    await interaction.update({
      content: `${interaction.message.content}\n\n❌ You rejected **${applicant.username}**'s application.`,
      components: []
    });
  }
}

function getSlashCommands() {
  return [
    new SlashCommandBuilder().setName('creategroup').setDescription('Create a new group within HoT'),
    new SlashCommandBuilder().setName('listapplications').setDescription('List all pending applications for the groups you have created.'),
    new SlashCommandBuilder().setName('listgroups').setDescription('List all groups in the server.'),
    new SlashCommandBuilder().setName('listmygroups').setDescription("Lists all the groups you've created and their status."),
    new SlashCommandBuilder().setName('forcegroup').setDescription('Force a group to complete').addStringOption(o => o.setName('groupid').setDescription('The Group ID').setRequired(true)),
    new SlashCommandBuilder().setName('registerinterests').setDescription('Register your interests used for group matching'),
    new SlashCommandBuilder().setName('showapplicants').setDescription('Shows pending applications for your groups.'),
    new SlashCommandBuilder()
      .setName('allowgroupcreation')
      .setDescription('Allows users to create new groups (Admin only)')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
      .setName('stopgroupcreation')
      .setDescription('Stops users from creating new groups (Admin only)')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  ];
}

module.exports = {
  handleCreateGroupSlash,
  handleAllowGroupCreationSlash,
  handleStopGroupCreationSlash,
  handleListApplicationsSlash,
  handleListMyGroupsSlash,
  handleRegisterInterestsSlash,
  handleListGroupsSlash,
  handleForceGroupSlash,
  handleShowApplicantsSlash,
  handleCreateGroupModalSubmit,
  handleRegisterInterestsModalSubmit,
  handleApplyModalSubmit,
  handleApplyButtonInteraction,
  handleApplicationAction,
  getSlashCommands
};