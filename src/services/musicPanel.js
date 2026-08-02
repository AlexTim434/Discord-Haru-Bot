const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const musicPlayer = require('./musicPlayer');
const { toSmallCaps } = require('../utils/smallCaps');

const PREFIX = 'music-panel';

const LOOP_LABELS = { off: 'Off', track: 'Track', queue: 'Queue' };

const END_REASON = {
  skip: { emoji: '⏭️', text: 'Skipped' },
  stop: { emoji: '✅', text: 'Stopped' },
  ended: { emoji: '🏁', text: 'Queue ended' },
  timeout: { emoji: '💤', text: 'Disconnected (inactivity)' },
};

function formatDuration(ms) {
  const totalSeconds = Math.round((ms ?? 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Компактная строка вместо полной панели, когда играть больше нечего и это
// не радио (оно само подливает треки, так что сюда не доходит) — по образцу
// формата Lary: эмодзи + упоминание того, кто нажал кнопку + статус + трек,
// одной строкой курсивом, без embed'а и кнопок.
function buildFinishedContent(state) {
  const reason = END_REASON[state.endReason];
  const mention = state.endActorId ? `<@${state.endActorId}>` : null;
  const trackLink = `[${state.lastTrack.title}](https://www.youtube.com/watch?v=${state.lastTrack.id})`;
  const line = [reason.emoji, mention, toSmallCaps(reason.text), trackLink].filter(Boolean).join(' ');
  return `*${line}*`;
}

function buildEmbed(state) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTimestamp();

  if (!state.current) {
    return embed.setTitle(`<a:60263cd:1533444661723791461> ${toSmallCaps('Music Panel')}`).setDescription('Nothing is playing yet.');
  }

  const { current } = state;
  embed
    .setTitle(`<a:60263cd:1533444661723791461> ${toSmallCaps('Music Panel')}`)
    .setDescription(`**[${current.title}](https://www.youtube.com/watch?v=${current.id})**`)
    .setThumbnail(`https://i.ytimg.com/vi/${current.id}/hqdefault.jpg`)
    .addFields(
      { name: toSmallCaps('Requested by'), value: current.requestedBy ? `<@${current.requestedBy}>` : '📻 Radio', inline: true },
      { name: toSmallCaps('Artist'), value: current.artists || '—', inline: true },
      { name: toSmallCaps('Duration'), value: formatDuration(current.durationMs), inline: true },
      { name: toSmallCaps('Status'), value: state.playerStatusLabel, inline: true },
      { name: toSmallCaps('Volume'), value: `${Math.round(state.volume * 100)}%`, inline: true },
      { name: toSmallCaps('Loop'), value: LOOP_LABELS[state.loopMode], inline: true },
      { name: toSmallCaps('Autoplay'), value: state.autoplayEnabled ? 'On 🟢' : 'Off', inline: true },
      { name: toSmallCaps('In queue'), value: `${state.queue.length} tracks`, inline: true },
    )
    .setFooter({ text: 'YouTube' });

  return embed;
}

function buildComponents(state) {
  if (!state.current) return [];

  const isPaused = state.playerStatusLabel === '⏸ Paused';

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}:voldown`).setEmoji('🔉').setLabel(toSmallCaps('Vol -')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:back`).setEmoji('⏮').setLabel(toSmallCaps('Back')).setStyle(ButtonStyle.Secondary),
    isPaused
      ? new ButtonBuilder().setCustomId(`${PREFIX}:resume`).setEmoji('▶').setLabel(toSmallCaps('Play')).setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId(`${PREFIX}:pause`).setEmoji('⏸').setLabel(toSmallCaps('Pause')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:skip`).setEmoji('⏭').setLabel(toSmallCaps('Skip')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:volup`).setEmoji('🔊').setLabel(toSmallCaps('Vol +')).setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}:shuffle`).setEmoji('🔀').setLabel(toSmallCaps('Shuffle')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:loop`)
      .setEmoji('🔁')
      .setLabel(toSmallCaps('Loop'))
      .setStyle(state.loopMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:stop`).setEmoji('⏹').setLabel(toSmallCaps('Stop')).setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:autoplay`)
      .setEmoji('🔂')
      .setLabel(toSmallCaps('Autoplay'))
      .setStyle(state.autoplayEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:playlist`).setEmoji('🎶').setLabel(toSmallCaps('Playlist')).setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

function buildQueueEmbed(state) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(toSmallCaps('Queue'));
  const currentLine = state.current
    ? `Now playing: **${state.current.title}** — ${state.current.artists} (${formatDuration(state.current.durationMs)})`
    : 'Nothing is playing.';
  embed.setDescription(currentLine + (state.radioActive ? '\n📻 Autoplay enabled' : ''));
  if (state.queue.length) {
    embed.addFields({
      name: toSmallCaps('Up next'),
      value: state.queue
        .slice(0, 10)
        .map((t, i) => `${i + 1}. ${t.title} — ${t.artists} (${formatDuration(t.durationMs)})`)
        .join('\n'),
    });
  }
  return embed;
}

function buildPayload(state) {
  if (!state.current && state.lastTrack && state.endReason) {
    // SuppressEmbeds — иначе Discord сам разворачивает ссылку на YouTube из
    // content в большую карточку с превью (та самая "золотая рамка").
    return { content: buildFinishedContent(state), embeds: [], components: [], flags: MessageFlags.SuppressEmbeds };
  }
  return { content: '', embeds: [buildEmbed(state)], components: buildComponents(state) };
}

// Обновить панель на месте — там, где она уже есть. Ничего не делает, если
// панели ещё не существует, или если она принадлежит уже закрытой сессии.
//
// Это важно из-за гонки: playRadio() сначала вызывает stop() (уведомление
// "Stopped" на СТАРОЙ панели, sessionId ещё не увеличен — редактируем),
// а затем запускает первый трек радио, который тоже дёргает notify() —
// но это уже НОВАЯ сессия, panelChannelId/panelMessageId ещё указывают на
// старое сообщение (ensurePanel переставит их только по итогу всей команды).
// Без этой проверки такой поздний notify() перезаписывал бы уже готовое
// уведомление "Stopped" обратно в живую панель на чужом, старом сообщении.
async function refresh(guild) {
  const state = musicPlayer.getPanelState(guild.id);
  if (!state.panelChannelId || !state.panelMessageId) return;
  if (state.panelSessionId !== state.sessionId) return;

  const channel = await guild.channels.fetch(state.panelChannelId).catch(() => null);
  if (!channel) return;

  const existing = await channel.messages.fetch(state.panelMessageId).catch(() => null);
  if (!existing) return;

  await existing.edit(buildPayload(state));
}

// Панель живёт в том же сообщении, где кто-то последний раз запустил музыку —
// не в фиксированном админ-канале. Переиспользуем существующее сообщение,
// только если оно принадлежит ТЕКУЩЕЙ сессии (panelSessionId === sessionId).
// Если сессия сменилась — это уже произошло ДО вызова ensurePanel, то есть
// старая панель либо уже сама превратилась в уведомление о скипе/стопе
// (свежий sessionId выставляется только когда играть начинают с нуля), либо
// была явно остановлена ради новой сессии (см. playRadio) — в обоих случаях
// трогать её нельзя, она остаётся историческим сообщением, и создаётся новое.
async function ensurePanel(channel, guild) {
  const state = musicPlayer.getPanelState(guild.id);
  const isCurrentSession = state.panelSessionId === state.sessionId;

  if (isCurrentSession && state.panelChannelId === channel.id && state.panelMessageId) {
    const existing = await channel.messages.fetch(state.panelMessageId).catch(() => null);
    if (existing) {
      await existing.edit(buildPayload(state));
      return;
    }
  }

  if (isCurrentSession && state.panelChannelId && state.panelMessageId && state.panelChannelId !== channel.id) {
    const oldChannel = await guild.channels.fetch(state.panelChannelId).catch(() => null);
    const oldMessage = oldChannel ? await oldChannel.messages.fetch(state.panelMessageId).catch(() => null) : null;
    await oldMessage?.delete().catch(() => {});
  }

  const sent = await channel.send(buildPayload(state));
  musicPlayer.setPanelLocation(guild.id, channel.id, sent.id);
}

function requireSameVoiceChannel(interaction) {
  const memberChannelId = interaction.member.voice.channelId;
  const botChannelId = interaction.guild.members.me.voice.channelId;
  return Boolean(memberChannelId) && memberChannelId === botChannelId;
}

async function handleButtonClick(interaction) {
  const [, action] = interaction.customId.split(':');
  const guildId = interaction.guild.id;

  if (action === 'playlist') {
    const state = musicPlayer.getPanelState(guildId);
    await interaction.reply({ embeds: [buildQueueEmbed(state)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (!requireSameVoiceChannel(interaction)) {
    await interaction.reply({
      content: `${toSmallCaps('Join the same voice channel')} as the bot to control the music.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Тихое подтверждение клика без отдельного сообщения в чат — результат виден
  // в самой панели (она обновится через notify -> refresh сразу после мутации).
  switch (action) {
    case 'voldown':
      musicPlayer.adjustVolume(guildId, -0.1);
      break;
    case 'volup':
      musicPlayer.adjustVolume(guildId, 0.1);
      break;
    case 'back':
      musicPlayer.back(guildId);
      break;
    case 'pause':
      musicPlayer.pause(guildId);
      break;
    case 'resume':
      musicPlayer.resume(guildId);
      break;
    case 'skip':
      musicPlayer.skip(guildId, interaction.user.id);
      break;
    case 'shuffle':
      musicPlayer.shuffleQueue(guildId);
      break;
    case 'loop':
      musicPlayer.toggleLoop(guildId);
      break;
    case 'stop':
      musicPlayer.stop(guildId, interaction.user.id);
      break;
    case 'autoplay':
      musicPlayer.toggleAutoplay(guildId);
      break;
  }

  await interaction.deferUpdate();
}

module.exports = { refresh, ensurePanel, handleButtonClick, buildQueueEmbed, formatDuration, PREFIX };
