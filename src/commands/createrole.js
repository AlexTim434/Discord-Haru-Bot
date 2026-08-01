const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create-role')
    .setDescription('[Админ] Создать роль вручную с заданным именем')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((option) => option.setName('name').setDescription('Название роли').setRequired(true)),
  async execute(interaction) {
    const name = interaction.options.getString('name');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const role = await interaction.guild.roles.create({
      name,
      permissions: [],
      mentionable: false,
      reason: `Роль создана вручную через /create-role (${interaction.user.tag})`,
    });

    await interaction.editReply(`Роль ${role} создана.`);
  },
};
