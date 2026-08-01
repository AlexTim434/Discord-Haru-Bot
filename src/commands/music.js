const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const youtubeMusic = require('../services/youtubeMusic');
const musicPlayer = require('../services/musicPlayer');
const musicPanel = require('../services/musicPanel');
const { toSmallCaps } = require('../utils/smallCaps');

const AUTOCOMPLETE_TIMEOUT_MS = 2500;
// Autocomplete отдаёт videoId как value выбранного варианта; если пользователь
// напечатал текст и отправил без выбора из списка, это не пройдёт под этот
// формат — тогда ищем по тексту как раньше. Без этой проверки на каждый
// свободный текстовый запрос уходил бы лишний (заведомо провальный) вызов
// yt-dlp за videoId, прежде чем откатиться на текстовый поиск.
const YOUTUBE_ID_RE = /^[\w-]{11}$/;

function requireVoiceChannel(interaction) {
  const channel = interaction.member.voice.channel;
  if (!channel) {
    throw new Error(`${toSmallCaps('Join a voice channel')} to use music commands.`);
  }
  return channel;
}

async function resolveTrack(query) {
  if (YOUTUBE_ID_RE.test(query)) {
    const track = await youtubeMusic.getTrackById(query).catch(() => null);
    if (track) return track;
  }
  const [track] = await youtubeMusic.searchTracks(query, 1);
  return track ?? null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Music from YouTube Music in a voice channel')
    .addSubcommand((sub) =>
      sub
        .setName('play')
        .setDescription('Search and play a track')
        .addStringOption((opt) =>
          opt.setName('query').setDescription('Track name').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('radio')
        .setDescription('Play similar tracks (YouTube Mix)')
        .addStringOption((opt) =>
          opt.setName('query').setDescription('Track to seed from (defaults to the current one)'),
        ),
    ),

  // Живой поиск по мере ввода, как у /fav-game со Steam-каталогом — только
  // здесь каждый запрос идёт наружу через yt-dlp, а не по локальному кэшу,
  // поэтому оборачиваем в таймаут: сеть у пользователя иногда скачет (см.
  // инцидент 2026-08-01 в CLAUDE.md), а на автокомплит Discord даёт ~3с.
  // Лучше пустой список, чем протухшая интеракция.
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    if (!focused || focused.trim().length < 2) {
      await interaction.respond([]).catch(() => {});
      return;
    }

    try {
      const results = await Promise.race([
        youtubeMusic.searchTracks(focused, 10),
        new Promise((_, reject) => setTimeout(() => reject(new Error('autocomplete timeout')), AUTOCOMPLETE_TIMEOUT_MS)),
      ]);
      const choices = results.map((t) => ({
        name: `${t.title} — ${t.artists}`.slice(0, 100),
        value: t.id,
      }));
      await interaction.respond(choices);
    } catch (error) {
      console.error('Не удалось выполнить автодополнение поиска музыки:', error);
      await interaction.respond([]).catch(() => {});
    }
  },

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
      const track = await resolveTrack(query);

      if (!track) {
        await interaction.editReply(`${toSmallCaps('Not found')} — nothing matches "${query}".`);
        return;
      }

      await musicPlayer.enqueue(voiceChannel, [track], interaction.user.id);
      await musicPanel
        .ensurePanel(interaction.channel, interaction.guild)
        .catch((error) => console.error('Не удалось обновить панель музыки:', error));
      await interaction.deleteReply().catch(() => {});
      return;
    }

    if (sub === 'radio') {
      const query = interaction.options.getString('query');
      let seedId = query ? null : musicPlayer.getPanelState(interaction.guild.id).current?.id;

      if (query) {
        const results = await youtubeMusic.searchTracks(query, 1);
        if (!results.length) {
          await interaction.editReply(`${toSmallCaps('Not found')} — nothing matches "${query}".`);
          return;
        }
        seedId = results[0].id;
      }

      if (!seedId) {
        await interaction.editReply(
          `${toSmallCaps('No seed track')} — provide a query or start something with /music play first.`,
        );
        return;
      }

      const radio = await youtubeMusic.startRadio(seedId);
      if (!radio.tracks.length) {
        await interaction.editReply(`${toSmallCaps('No similar tracks found')}.`);
        return;
      }
      await musicPlayer.playRadio(voiceChannel, radio, interaction.user.id);
      await musicPanel
        .ensurePanel(interaction.channel, interaction.guild)
        .catch((error) => console.error('Не удалось обновить панель музыки:', error));
      await interaction.deleteReply().catch(() => {});
      return;
    }
  },
};
