const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const guildConfig = require('../services/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-welcome-channel')
    .setDescription('[Админ] Канал для сообщения "расскажи, во что играешь" после принятия правил')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Текстовый канал для сообщения после верификации')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    guildConfig.setWelcomeChannel(interaction.guild.id, channel.id);

    await interaction.reply({
      content: `Готово! После принятия правил буду присылать сообщение про /fav-game в ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
