const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Проверка, что бот работает'),
  async execute(interaction) {
    await interaction.reply({ content: 'Pong! 🏓', flags: MessageFlags.Ephemeral });
  },
};
