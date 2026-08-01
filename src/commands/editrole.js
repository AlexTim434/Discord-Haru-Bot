const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit-role')
    .setDescription('[Админ] Переименовать существующую роль')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption((option) => option.setName('role').setDescription('Роль').setRequired(true))
    .addStringOption((option) => option.setName('name').setDescription('Новое название').setRequired(true)),
  async execute(interaction) {
    const role = interaction.options.getRole('role');
    const name = interaction.options.getString('name');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await role.setName(name, `Роль переименована вручную через /edit-role (${interaction.user.tag})`);
    } catch (error) {
      console.error(`Не удалось переименовать роль ${role.id}:`, error);
      await interaction.editReply(
        'Не получилось переименовать роль. Скорее всего, роль бота стоит ниже этой роли в списке ролей сервера — подними роль бота выше.',
      );
      return;
    }

    await interaction.editReply(`Роль ${role} обновлена.`);
  },
};
