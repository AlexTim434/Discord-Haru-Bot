const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const auras = require('../services/auras');
const auraPicker = require('../services/auraPicker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-aura')
    .setDescription('[Админ] Удалить ауру из списка')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((option) =>
      option.setName('name').setDescription('Название ауры').setAutocomplete(true).setRequired(true),
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = auras
      .listAll()
      .map((a) => a.name)
      .filter((name) => name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(matches.map((name) => ({ name, value: name })));
  },
  async execute(interaction) {
    const name = interaction.options.getString('name');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const removed = await auras.removeAura(interaction.guild, name);
    if (!removed) {
      await interaction.editReply(`Не нашёл ауру с названием "${name}".`);
      return;
    }

    await auraPicker.publish(interaction.guild);
    await interaction.editReply(`Аура **${name}** удалена.`);
  },
};
