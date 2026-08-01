const {
  SlashCommandBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const yandexMusic = require('../services/yandexMusic');
const musicPlayer = require('../services/musicPlayer');

const SEARCH_SELECT_ID = 'music-search-select';

function formatDuration(ms) {
  const totalSeconds = Math.round((ms ?? 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

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
    .setDescription('Музыка из Яндекс.Музыки в голосовом канале')
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
        .addStringOption((opt) => opt.setName('query').setDescription('Что искать').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Тип поиска (по умолчанию — трек)')
            .addChoices(
              { name: 'Трек', value: 'track' },
              { name: 'Исполнитель', value: 'artist' },
              { name: 'Альбом', value: 'album' },
            ),
        ),
    )
    .addSubcommand((sub) => sub.setName('favorites').setDescription('Включить любимые треки'))
    .addSubcommand((sub) => sub.setName('radio').setDescription('Включить "Мою волну"'))
    .addSubcommand((sub) => sub.setName('skip').setDescription('Пропустить текущий трек'))
    .addSubcommand((sub) => sub.setName('pause').setDescription('Поставить на паузу'))
    .addSubcommand((sub) => sub.setName('resume').setDescription('Снять с паузы'))
    .addSubcommand((sub) => sub.setName('queue').setDescription('Показать очередь'))
    .addSubcommand((sub) => sub.setName('stop').setDescription('Остановить и выйти из канала')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'queue') {
      const { current, upcoming, radioActive } = musicPlayer.getQueue(interaction.guild.id);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Очередь');
      const currentLine = current
        ? `Сейчас играет: **${current.title}** — ${current.artists} (${formatDuration(current.durationMs)})`
        : 'Сейчас ничего не играет.';
      embed.setDescription(currentLine + (radioActive ? '\n📻 Режим радио включён' : ''));
      if (upcoming.length) {
        embed.addFields({
          name: 'Дальше',
          value: upcoming
            .slice(0, 10)
            .map((t, i) => `${i + 1}. ${t.title} — ${t.artists} (${formatDuration(t.durationMs)})`)
            .join('\n'),
        });
      }
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'skip') {
      const skipped = musicPlayer.skip(interaction.guild.id);
      await interaction.reply({
        content: skipped ? 'Пропускаю...' : 'Сейчас ничего не играет.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'pause') {
      const ok = musicPlayer.pause(interaction.guild.id);
      await interaction.reply({ content: ok ? 'Пауза.' : 'Нечего ставить на паузу.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'resume') {
      const ok = musicPlayer.resume(interaction.guild.id);
      await interaction.reply({ content: ok ? 'Продолжаю.' : 'Нечего продолжать.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'stop') {
      musicPlayer.stop(interaction.guild.id);
      await interaction.reply({ content: 'Остановил и вышел из канала.', flags: MessageFlags.Ephemeral });
      return;
    }

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
      const results = await yandexMusic.searchTracks(query, 1);
      if (!results.length) {
        await interaction.editReply(`Ничего не нашёл по запросу "${query}".`);
        return;
      }
      await musicPlayer.enqueue(voiceChannel, results);
      await interaction.editReply(`Добавил в очередь: **${results[0].title}** — ${results[0].artists}`);
      return;
    }

    if (sub === 'favorites') {
      const tracks = await yandexMusic.getFavorites();
      if (!tracks.length) {
        await interaction.editReply('В любимых треках пусто.');
        return;
      }
      await musicPlayer.enqueue(voiceChannel, tracks);
      await interaction.editReply(`Добавил в очередь ${tracks.length} любимых треков.`);
      return;
    }

    if (sub === 'radio') {
      const radio = await yandexMusic.startRadio();
      await musicPlayer.playRadio(voiceChannel, radio);
      await interaction.editReply('Включил "Мою волну" 📻');
      return;
    }

    if (sub === 'search') {
      const query = interaction.options.getString('query');
      const type = interaction.options.getString('type') ?? 'track';

      let options = [];
      if (type === 'track') {
        const tracks = await yandexMusic.searchTracks(query);
        options = tracks.map((t) => ({
          label: t.title.slice(0, 100),
          description: t.artists.slice(0, 100),
          value: `track:${t.id}`,
        }));
      } else if (type === 'artist') {
        const artists = await yandexMusic.searchArtists(query);
        options = artists.map((a) => ({ label: a.name.slice(0, 100), value: `artist:${a.id}` }));
      } else {
        const albums = await yandexMusic.searchAlbums(query);
        options = albums.map((a) => ({
          label: a.title.slice(0, 100),
          description: a.artists.slice(0, 100),
          value: `album:${a.id}`,
        }));
      }

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

    const [type, idStr] = interaction.values[0].split(':');
    const id = Number(idStr);

    let tracks = [];
    if (type === 'track') {
      tracks = await yandexMusic.getTracksByIds([id]);
    } else if (type === 'artist') {
      tracks = await yandexMusic.getArtistTracks(id);
    } else {
      tracks = await yandexMusic.getAlbumTracks(id);
    }

    if (!tracks.length) {
      await interaction.editReply({ content: 'Не нашёл треков для этого выбора.', components: [] });
      return;
    }

    await musicPlayer.enqueue(voiceChannel, tracks);
    const summary =
      tracks.length === 1 ? `**${tracks[0].title}** — ${tracks[0].artists}` : `${tracks.length} треков`;
    await interaction.editReply({ content: `Добавил в очередь: ${summary}.`, components: [] });
  },
};
