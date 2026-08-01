const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const guildConfig = require('../services/guildConfig');
const auraPicker = require('../services/auraPicker');

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
    guildConfig.setAuraChannel(interaction.guild.id, channel.id);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await auraPicker.publish(interaction.guild);

    await interaction.editReply(`Готово! Список аур теперь в ${channel}.`);
  },
};
