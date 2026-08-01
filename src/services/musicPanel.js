const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const musicPlayer = require('./musicPlayer');

const PREFIX = 'music-panel';

const LOOP_LABELS = { off: 'Выкл', track: 'Трек', queue: 'Очередь' };

function formatDuration(ms) {
  const totalSeconds = Math.round((ms ?? 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function buildEmbed(state) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🎵 MUSIC PANEL').setTimestamp();

  if (!state.current) {
    return embed.setDescription('Сейчас ничего не играет.');
  }

  const { current } = state;
  embed
    .setDescription(`**[${current.title}](https://www.youtube.com/watch?v=${current.id})**`)
    .setThumbnail(`https://i.ytimg.com/vi/${current.id}/hqdefault.jpg`)
    .addFields(
      { name: 'Запросил', value: current.requestedBy ? `<@${current.requestedBy}>` : '📻 Радио', inline: true },
      { name: 'Автор', value: current.artists || '—', inline: true },
      { name: 'Длительность', value: formatDuration(current.durationMs), inline: true },
      { name: 'Статус', value: state.playerStatusLabel, inline: true },
      { name: 'Громкость', value: `${Math.round(state.volume * 100)}%`, inline: true },
      { name: 'Повтор', value: LOOP_LABELS[state.loopMode], inline: true },
      { name: 'AutoPlay', value: state.autoplayEnabled ? 'Вкл 🟢' : 'Выкл', inline: true },
      { name: 'В очереди', value: `${state.queue.length} треков`, inline: true },
    )
    .setFooter({ text: 'YouTube' });

  return embed;
}

function buildComponents(state) {
  const isPaused = state.playerStatusLabel === '⏸ Paused';

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}:voldown`).setEmoji('🔉').setLabel('Тише').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:back`).setEmoji('⏮').setLabel('Назад').setStyle(ButtonStyle.Secondary),
    isPaused
      ? new ButtonBuilder().setCustomId(`${PREFIX}:resume`).setEmoji('▶').setLabel('Играть').setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId(`${PREFIX}:pause`).setEmoji('⏸').setLabel('Пауза').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:skip`).setEmoji('⏭').setLabel('Дальше').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:volup`).setEmoji('🔊').setLabel('Громче').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}:shuffle`).setEmoji('🔀').setLabel('Перемешать').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:loop`)
      .setEmoji('🔁')
      .setLabel('Повтор')
      .setStyle(state.loopMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:stop`).setEmoji('⏹').setLabel('Стоп').setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:autoplay`)
      .setEmoji('🔂')
      .setLabel('AutoPlay')
      .setStyle(state.autoplayEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:playlist`).setEmoji('🎶').setLabel('Плейлист').setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

function buildQueueEmbed(state) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Очередь');
  const currentLine = state.current
    ? `Сейчас играет: **${state.current.title}** — ${state.current.artists} (${formatDuration(state.current.durationMs)})`
    : 'Сейчас ничего не играет.';
  embed.setDescription(currentLine + (state.radioActive ? '\n📻 Автоподбор включён' : ''));
  if (state.queue.length) {
    embed.addFields({
      name: 'Дальше',
      value: state.queue
        .slice(0, 10)
        .map((t, i) => `${i + 1}. ${t.title} — ${t.artists} (${formatDuration(t.durationMs)})`)
        .join('\n'),
    });
  }
  return embed;
}

function buildPayload(state) {
  return { embeds: [buildEmbed(state)], components: buildComponents(state) };
}

// Обновить панель на месте — там, где она уже есть. Ничего не делает, если
// панели ещё не существует (музыка ни разу не запускалась в этой гильдии).
async function refresh(guild) {
  const state = musicPlayer.getPanelState(guild.id);
  if (!state.panelChannelId || !state.panelMessageId) return;

  const channel = await guild.channels.fetch(state.panelChannelId).catch(() => null);
  if (!channel) return;

  const existing = await channel.messages.fetch(state.panelMessageId).catch(() => null);
  if (!existing) return;

  await existing.edit(buildPayload(state));
}

// Панель живёт в том же сообщении, где кто-то последний раз запустил музыку —
// не в фиксированном админ-канале. Если новый запуск произошёл в другом канале,
// старое сообщение-панель удаляется (best-effort) и создаётся новое здесь.
async function ensurePanel(channel, guild) {
  const state = musicPlayer.getPanelState(guild.id);

  if (state.panelChannelId === channel.id && state.panelMessageId) {
    const existing = await channel.messages.fetch(state.panelMessageId).catch(() => null);
    if (existing) {
      await existing.edit(buildPayload(state));
      return;
    }
  }

  if (state.panelChannelId && state.panelMessageId && state.panelChannelId !== channel.id) {
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
      content: 'Зайди в тот же голосовой канал, что и бот, чтобы управлять музыкой.',
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
      musicPlayer.skip(guildId);
      break;
    case 'shuffle':
      musicPlayer.shuffleQueue(guildId);
      break;
    case 'loop':
      musicPlayer.toggleLoop(guildId);
      break;
    case 'stop':
      musicPlayer.stop(guildId);
      break;
    case 'autoplay':
      musicPlayer.toggleAutoplay(guildId);
      break;
  }

  await interaction.deferUpdate();
}

module.exports = { refresh, ensurePanel, handleButtonClick, buildQueueEmbed, formatDuration, PREFIX };
