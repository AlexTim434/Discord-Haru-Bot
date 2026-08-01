const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const guildConfig = require('../services/guildConfig');
const roster = require('../services/roster');
const { deleteChannelMessage } = require('../utils/channelCleanup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-roster-channel')
    .setDescription('[Админ] Указать канал для списка "игра → участник → роль"')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Текстовый канал для списка участников')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const oldChannelId = guildConfig.getRosterChannelId(interaction.guild.id);
    const oldMessageId = guildConfig.getRosterMessageId(interaction.guild.id);
    await deleteChannelMessage(interaction.guild, oldChannelId, oldMessageId);

    guildConfig.setRosterChannel(interaction.guild.id, channel.id);
    await roster.updateRoster(interaction.guild);

    await interaction.editReply(`Готово! Список участников по играм теперь веду в ${channel}.`);
  },
};
