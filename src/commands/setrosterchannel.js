const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const guildConfig = require('../services/guildConfig');
const roster = require('../services/roster');

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
    guildConfig.setRosterChannel(interaction.guild.id, channel.id);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await roster.updateRoster(interaction.guild);

    await interaction.editReply(`Готово! Список участников по играм теперь веду в ${channel}.`);
  },
};
