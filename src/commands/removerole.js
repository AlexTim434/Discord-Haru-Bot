const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-role')
    .setDescription('[Админ] Удалить существующую роль')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption((option) => option.setName('role').setDescription('Роль').setRequired(true)),
  async execute(interaction) {
    const role = interaction.options.getRole('role');
    const roleName = role.name;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await role.delete(`Роль удалена вручную через /remove-role (${interaction.user.tag})`);
    } catch (error) {
      console.error(`Не удалось удалить роль ${role.id}:`, error);
      await interaction.editReply(
        'Не получилось удалить роль. Скорее всего, роль бота стоит ниже этой роли в списке ролей сервера — подними роль бота выше.',
      );
      return;
    }

    // Само удаление уже запустило client.on('roleDelete', ...) в index.js —
    // если это была игровая роль, gameRoles.json/rankGames.json почистятся
    // сами, а ростер обновится без дополнительного кода здесь.
    await interaction.editReply(`Роль **${roleName}** удалена.`);
  },
};
