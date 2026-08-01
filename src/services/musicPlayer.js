const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
} = require('@discordjs/voice');
const youtubeMusic = require('./youtubeMusic');

const MAX_HISTORY = 20;

// guildId -> { connection, player, guild, resource, queue: Track[], current: Track|null,
//   history: Track[], radio: {seedId, originalSeedId}|null, volume, loopMode, autoplayEnabled,
//   nextFromHistory, forceAdvance, panelChannelId, panelMessageId }
const states = new Map();

let onUpdate = () => {};

function setOnUpdate(callback) {
  onUpdate = callback;
}

function notify(guild) {
  if (guild) onUpdate(guild);
}

function getState(guildId) {
  let state = states.get(guildId);
  if (!state) {
    state = {
      connection: null,
      player: null,
      guild: null,
      resource: null,
      queue: [],
      current: null,
      history: [],
      radio: null,
      volume: 1,
      loopMode: 'off',
      autoplayEnabled: false,
      nextFromHistory: false,
      forceAdvance: false,
      panelChannelId: null,
      panelMessageId: null,
    };
    states.set(guildId, state);
  }
  return state;
}

function spawnFfmpegResource(streamUrl, volume) {
  const ffmpeg = spawn(ffmpegPath, [
    '-i', streamUrl,
    '-analyzeduration', '0',
    '-loglevel', 'error',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ]);
  ffmpeg.on('error', (error) => console.error('Ошибка ffmpeg:', error));
  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw, inlineVolume: true });
  resource.volume.setVolume(volume);
  resource.playStream.once('close', () => ffmpeg.kill('SIGKILL'));
  return resource;
}

async function playTrack(guildId, track) {
  const state = getState(guildId);
  state.current = track;
  const streamUrl = await youtubeMusic.getStreamUrl(track.id).catch((error) => {
    console.error(`Не удалось получить ссылку на трек "${track.title}":`, error);
    return null;
  });

  if (!streamUrl) {
    await playNext(guildId, { forceAdvance: true });
    return;
  }

  const resource = spawnFfmpegResource(streamUrl, state.volume);
  state.resource = resource;
  state.player.play(resource);
  notify(state.guild);
}

async function playNext(guildId, { fromHistory = false, forceAdvance = false } = {}) {
  const state = getState(guildId);
  if (!state.player) return;

  if (state.loopMode === 'track' && state.current && !fromHistory && !forceAdvance) {
    await playTrack(guildId, state.current);
    return;
  }

  if (!state.queue.length && state.radio) {
    const { seedId, tracks } = await youtubeMusic.continueRadio(state.radio.seedId, state.radio.originalSeedId);
    state.radio.seedId = seedId;
    state.queue.push(...tracks);
  } else if (!state.queue.length && state.autoplayEnabled && state.current) {
    const radio = await youtubeMusic.startRadio(state.current.id);
    state.radio = { seedId: radio.seedId, originalSeedId: radio.seedId };
    state.queue.push(...radio.tracks);
  }

  const next = state.queue.shift();
  if (!next) {
    state.current = null;
    notify(state.guild);
    return;
  }

  if (state.current && !fromHistory) {
    state.history.push(state.current);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    if (state.loopMode === 'queue') state.queue.push(state.current);
  }

  await playTrack(guildId, next);
}

function ensurePlayer(guildId) {
  const state = getState(guildId);
  if (!state.player) {
    state.player = createAudioPlayer();
    state.player.on(AudioPlayerStatus.Idle, () => {
      const fromHistory = state.nextFromHistory;
      const forceAdvance = state.forceAdvance;
      state.nextFromHistory = false;
      state.forceAdvance = false;
      playNext(guildId, { fromHistory, forceAdvance }).catch((error) =>
        console.error('Не удалось запустить следующий трек:', error),
      );
    });
    state.player.on('error', (error) => console.error('Ошибка аудиоплеера:', error));
  }
  return state.player;
}

async function connect(voiceChannel) {
  const state = getState(voiceChannel.guild.id);
  state.guild = voiceChannel.guild;
  const player = ensurePlayer(voiceChannel.guild.id);

  if (!state.connection) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    connection.subscribe(player);
    state.connection = connection;
  }

  return state.connection;
}

async function enqueue(voiceChannel, tracks, requestedBy) {
  await connect(voiceChannel);
  const state = getState(voiceChannel.guild.id);
  state.queue.push(...tracks.map((t) => ({ ...t, requestedBy })));
  if (!state.current) await playNext(voiceChannel.guild.id);
  else notify(state.guild);
}

async function playRadio(voiceChannel, { seedId, originalSeedId, tracks }, requestedBy) {
  await connect(voiceChannel);
  const state = getState(voiceChannel.guild.id);
  state.radio = { seedId, originalSeedId };
  state.autoplayEnabled = true;
  state.queue.push(...tracks.map((t) => ({ ...t, requestedBy })));
  if (!state.current) await playNext(voiceChannel.guild.id);
  else notify(state.guild);
}

function back(guildId) {
  const state = getState(guildId);
  if (!state.history.length || !state.current) return false;
  const prevTrack = state.history.pop();
  state.queue.unshift(state.current);
  state.queue.unshift(prevTrack);
  state.nextFromHistory = true;
  state.player?.stop();
  return true;
}

function skip(guildId) {
  const state = getState(guildId);
  if (!state.current) return false;
  state.forceAdvance = true;
  state.player?.stop();
  return true;
}

function pause(guildId) {
  const state = getState(guildId);
  const ok = state.player?.pause() ?? false;
  if (ok) notify(state.guild);
  return ok;
}

function resume(guildId) {
  const state = getState(guildId);
  const ok = state.player?.unpause() ?? false;
  if (ok) notify(state.guild);
  return ok;
}

function stop(guildId) {
  const state = getState(guildId);
  state.queue = [];
  state.history = [];
  state.radio = null;
  state.autoplayEnabled = false;
  state.current = null;
  state.player?.stop();
  state.connection?.destroy();
  state.connection = null;
  notify(state.guild);
}

function shuffleQueue(guildId) {
  const state = getState(guildId);
  for (let i = state.queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
  }
  notify(state.guild);
  return state.queue.length;
}

function setVolume(guildId, value) {
  const state = getState(guildId);
  state.volume = Math.max(0, Math.min(2, value));
  state.resource?.volume?.setVolume(state.volume);
  notify(state.guild);
  return state.volume;
}

function adjustVolume(guildId, delta) {
  const state = getState(guildId);
  return setVolume(guildId, state.volume + delta);
}

function toggleLoop(guildId) {
  const state = getState(guildId);
  const order = ['off', 'track', 'queue'];
  state.loopMode = order[(order.indexOf(state.loopMode) + 1) % order.length];
  notify(state.guild);
  return state.loopMode;
}

function toggleAutoplay(guildId) {
  const state = getState(guildId);
  state.autoplayEnabled = !state.autoplayEnabled;
  if (!state.autoplayEnabled) state.radio = null;
  notify(state.guild);
  return state.autoplayEnabled;
}

function getPlayerStatusLabel(state) {
  if (!state.current) return '⏹ Остановлено';
  if (state.player?.state?.status === AudioPlayerStatus.Paused) return '⏸ Paused';
  return '▶ Playing';
}

function getPanelState(guildId) {
  const state = getState(guildId);
  return {
    current: state.current,
    queue: [...state.queue],
    guild: state.guild,
    loopMode: state.loopMode,
    volume: state.volume,
    autoplayEnabled: state.autoplayEnabled,
    radioActive: Boolean(state.radio),
    playerStatusLabel: getPlayerStatusLabel(state),
    panelChannelId: state.panelChannelId,
    panelMessageId: state.panelMessageId,
  };
}

function setPanelLocation(guildId, channelId, messageId) {
  const state = getState(guildId);
  state.panelChannelId = channelId;
  state.panelMessageId = messageId;
}

module.exports = {
  connect,
  enqueue,
  playRadio,
  back,
  skip,
  pause,
  resume,
  stop,
  shuffleQueue,
  setVolume,
  adjustVolume,
  toggleLoop,
  toggleAutoplay,
  getPanelState,
  setPanelLocation,
  setOnUpdate,
};
