const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const youtubeMusic = require('../services/youtubeMusic');
const musicPlayer = require('../services/musicPlayer');
const musicPanel = require('../services/musicPanel');

const SEARCH_SELECT_ID = 'music-search-select';

function requireVoiceChannel(interaction) {
  const channel = interaction.member.voice.channel;
  if (!channel) {
    throw new Error('Зайди в голосовой канал, чтобы использовать музыкальные команды.');
  }
  return channel;
}

module.exports = {
  SEARCH_SELECT_ID,

  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Музыка из YouTube Music в голосовом канале')
    .addSubcommand((sub) =>
      sub
        .setName('play')
        .setDescription('Найти и включить трек')
        .addStringOption((opt) => opt.setName('query').setDescription('Название трека').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('search')
        .setDescription('Поиск с выбором из списка')
        .addStringOption((opt) => opt.setName('query').setDescription('Что искать').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('radio')
        .setDescription('Включить похожие треки (YouTube Mix)')
        .addStringOption((opt) =>
          opt.setName('query').setDescription('От какого трека оттолкнуться (по умолчанию — текущий)'),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    let voiceChannel;
    try {
      voiceChannel = requireVoiceChannel(interaction);
    } catch (error) {
      await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'play') {
      const query = interaction.options.getString('query');
      const results = await youtubeMusic.searchTracks(query, 1);
      if (!results.length) {
        await interaction.editReply(`Ничего не нашёл по запросу "${query}".`);
        return;
      }
      await musicPlayer.enqueue(voiceChannel, results, interaction.user.id);
      await musicPanel
        .ensurePanel(interaction.channel, interaction.guild)
        .catch((error) => console.error('Не удалось обновить панель музыки:', error));
      await interaction.editReply(`Добавил в очередь: **${results[0].title}** — ${results[0].artists}`);
      return;
    }

    if (sub === 'radio') {
      const query = interaction.options.getString('query');
      let seedId = query ? null : musicPlayer.getPanelState(interaction.guild.id).current?.id;

      if (query) {
        const results = await youtubeMusic.searchTracks(query, 1);
        if (!results.length) {
          await interaction.editReply(`Ничего не нашёл по запросу "${query}".`);
          return;
        }
        seedId = results[0].id;
      }

      if (!seedId) {
        await interaction.editReply(
          'Укажи query, от какого трека оттолкнуться, либо сначала запусти что-нибудь через /music play.',
        );
        return;
      }

      const radio = await youtubeMusic.startRadio(seedId);
      if (!radio.tracks.length) {
        await interaction.editReply('Не удалось найти похожие треки для этого трека.');
        return;
      }
      await musicPlayer.playRadio(voiceChannel, radio, interaction.user.id);
      await musicPanel
        .ensurePanel(interaction.channel, interaction.guild)
        .catch((error) => console.error('Не удалось обновить панель музыки:', error));
      await interaction.editReply('Включил похожие треки 📻');
      return;
    }

    if (sub === 'search') {
      const query = interaction.options.getString('query');
      const tracks = await youtubeMusic.searchTracks(query);
      const options = tracks.map((t) => ({
        label: t.title.slice(0, 100),
        description: t.artists.slice(0, 100),
        value: `track:${t.id}`,
      }));

      if (!options.length) {
        await interaction.editReply(`Ничего не нашёл по запросу "${query}".`);
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`${SEARCH_SELECT_ID}:${interaction.user.id}:${voiceChannel.id}`)
        .setPlaceholder('Выбери, что включить')
        .addOptions(options);

      await interaction.editReply({
        content: 'Выбери из списка:',
        components: [new ActionRowBuilder().addComponents(select)],
      });
    }
  },

  async handleSearchSelect(interaction) {
    const [, expectedUserId, voiceChannelId] = interaction.customId.split(':');
    if (interaction.user.id !== expectedUserId) {
      await interaction.reply({ content: 'Это не твоё меню выбора.', flags: MessageFlags.Ephemeral });
      return;
    }

    const voiceChannel = interaction.guild.channels.cache.get(voiceChannelId);
    if (!voiceChannel) {
      await interaction.update({ content: 'Голосовой канал недоступен, зайди в него и попробуй снова.', components: [] });
      return;
    }

    await interaction.deferUpdate();

    const [, videoId] = interaction.values[0].split(':');
    const track = await youtubeMusic.getTrackById(videoId);

    if (!track) {
      await interaction.editReply({ content: 'Не нашёл трек для этого выбора.', components: [] });
      return;
    }

    await musicPlayer.enqueue(voiceChannel, [track], interaction.user.id);
    await musicPanel
      .ensurePanel(interaction.channel, interaction.guild)
      .catch((error) => console.error('Не удалось обновить панель музыки:', error));
    await interaction.editReply({
      content: `Добавил в очередь: **${track.title}** — ${track.artists}.`,
      components: [],
    });
  },
};
