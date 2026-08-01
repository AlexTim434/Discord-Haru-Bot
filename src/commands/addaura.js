const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const auraColorPicker = require('../services/auraColorPicker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-aura')
    .setDescription('[Админ] Добавить новую ауру — выбрать цвет, название придумает ИИ')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(interaction) {
    await interaction.reply({ ...auraColorPicker.buildHueSelectPayload(), flags: MessageFlags.Ephemeral });
  },
};
