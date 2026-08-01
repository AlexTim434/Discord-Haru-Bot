const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const auras = require('../services/auras');
const auraPicker = require('../services/auraPicker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-aura')
    .setDescription('[Админ] Добавить новую ауру в список')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((option) => option.setName('name').setDescription('Название ауры').setRequired(true))
    .addStringOption((option) =>
      option.setName('color').setDescription('Цвет в HEX, например #FF00AA').setRequired(true),
    ),
  async execute(interaction) {
    const name = interaction.options.getString('name');
    const color = interaction.options.getString('color');

    if (!/^#?[0-9a-fA-F]{6}$/.test(color)) {
      await interaction.reply({
        content: 'Цвет должен быть в формате HEX, например `#FF00AA`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await auras.addAura(interaction.guild, name, color.startsWith('#') ? color : `#${color}`);
    await auraPicker.publish(interaction.guild);

    await interaction.editReply(`Аура **${name}** добавлена и опубликована в списке.`);
  },
};
