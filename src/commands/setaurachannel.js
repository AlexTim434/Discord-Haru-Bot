const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const guildConfig = require('../services/guildConfig');
const auraPicker = require('../services/auraPicker');
const { deleteChannelMessage } = require('../utils/channelCleanup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-aura-channel')
    .setDescription('[Админ] Указать канал для выбора ауры (цветной роли)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Текстовый канал для выбора ауры')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const oldChannelId = guildConfig.getAuraChannelId(interaction.guild.id);
    const oldMessageId = guildConfig.getAuraMessageId(interaction.guild.id);
    await deleteChannelMessage(interaction.guild, oldChannelId, oldMessageId);

    guildConfig.setAuraChannel(interaction.guild.id, channel.id);
    await auraPicker.publish(interaction.guild);

    await interaction.editReply(`Готово! Список аур теперь в ${channel}.`);
  },
};
