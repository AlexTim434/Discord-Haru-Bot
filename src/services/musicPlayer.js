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
const yandexMusic = require('./yandexMusic');

// guildId -> { connection, player, queue: Track[], current: Track|null, radio: {sessionId, batchId}|null }
const states = new Map();

function getState(guildId) {
  let state = states.get(guildId);
  if (!state) {
    state = { connection: null, player: null, queue: [], current: null, radio: null };
    states.set(guildId, state);
  }
  return state;
}

function spawnFfmpegResource(streamUrl) {
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
  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw });
  resource.playStream.once('close', () => ffmpeg.kill('SIGKILL'));
  return resource;
}

async function playNext(guildId) {
  const state = getState(guildId);
  if (!state.player) return;

  if (!state.queue.length && state.radio) {
    const { batchId, tracks } = await yandexMusic.continueRadio(state.radio.sessionId, state.radio.batchId);
    state.radio.batchId = batchId;
    state.queue.push(...tracks);
  }

  const next = state.queue.shift();
  if (!next) {
    state.current = null;
    return;
  }

  state.current = next;
  const streamUrl = await yandexMusic.getStreamUrl(next.id).catch((error) => {
    console.error(`Не удалось получить ссылку на трек "${next.title}":`, error);
    return null;
  });

  if (!streamUrl) {
    await playNext(guildId);
    return;
  }

  state.player.play(spawnFfmpegResource(streamUrl));
}

function ensurePlayer(guildId) {
  const state = getState(guildId);
  if (!state.player) {
    state.player = createAudioPlayer();
    state.player.on(AudioPlayerStatus.Idle, () => {
      playNext(guildId).catch((error) => console.error('Не удалось запустить следующий трек:', error));
    });
    state.player.on('error', (error) => console.error('Ошибка аудиоплеера:', error));
  }
  return state.player;
}

async function connect(voiceChannel) {
  const state = getState(voiceChannel.guild.id);
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

async function enqueue(voiceChannel, tracks) {
  await connect(voiceChannel);
  const state = getState(voiceChannel.guild.id);
  state.queue.push(...tracks);
  if (!state.current) await playNext(voiceChannel.guild.id);
}

async function playRadio(voiceChannel, { sessionId, batchId, tracks }) {
  await connect(voiceChannel);
  const state = getState(voiceChannel.guild.id);
  state.radio = { sessionId, batchId };
  state.queue.push(...tracks);
  if (!state.current) await playNext(voiceChannel.guild.id);
}

function skip(guildId) {
  const state = getState(guildId);
  if (!state.current) return false;
  state.player?.stop();
  return true;
}

function pause(guildId) {
  return getState(guildId).player?.pause() ?? false;
}

function resume(guildId) {
  return getState(guildId).player?.unpause() ?? false;
}

function stop(guildId) {
  const state = getState(guildId);
  state.queue = [];
  state.radio = null;
  state.current = null;
  state.player?.stop();
  state.connection?.destroy();
  state.connection = null;
}

function getQueue(guildId) {
  const state = getState(guildId);
  return { current: state.current, upcoming: [...state.queue], radioActive: Boolean(state.radio) };
}

module.exports = { connect, enqueue, playRadio, skip, pause, resume, stop, getQueue };
