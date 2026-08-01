const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const youtubeMusic = require('../services/youtubeMusic');
const musicPlayer = require('../services/musicPlayer');
const musicPanel = require('../services/musicPanel');
const gameRoles = require('../services/gameRoles');

const GAME_NAME = '7 Days to Die';
const SEARCH_QUERY = 'Pantera The Great Southern Trendkill';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trendkill')
    .setDescription('7 Days to Die fans only: loop Pantera - The Great Southern Trendkill'),

  async execute(interaction) {
    if (!gameRoles.hasGameRole(interaction.member, GAME_NAME)) {
      await interaction.reply({
        content: `Only holders of the "${GAME_NAME}" role can use this.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: 'Join a voice channel first.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [track] = await youtubeMusic.searchTracks(SEARCH_QUERY, 1);
    if (!track) {
      await interaction.editReply('Could not find the track.');
      return;
    }

    await musicPlayer.playNow(voiceChannel, track, interaction.user.id);
    musicPlayer.setLoopMode(interaction.guild.id, 'track');
    await musicPanel
      .ensurePanel(interaction.channel, interaction.guild)
      .catch((error) => console.error('Не удалось обновить панель музыки:', error));
    await interaction.deleteReply().catch(() => {});
  },
};
