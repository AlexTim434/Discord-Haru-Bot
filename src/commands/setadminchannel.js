const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const verification = require('../services/verification');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-admin-channel')
    .setDescription('[Админ] Закрыть канал ото всех, кроме роли "Модератор"')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Канал, который должен быть виден только модераторам')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const moderatorRole = await verification.setAdminChannel(interaction.guild, channel.id);
    if (!moderatorRole) {
      await interaction.editReply('Не получилось найти канал.');
      return;
    }

    await interaction.editReply(
      `Готово! ${channel} теперь виден только роли ${moderatorRole} — выдай её тем, кому нужен доступ.`,
    );
  },
};
