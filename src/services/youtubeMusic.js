const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap-plus').default;

const BIN_PATH = path.join(__dirname, '..', '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

// Бинарник yt-dlp не коммитится (см. .gitignore, bin/) — скачивается один раз при
// первом использовании на каждой машине/хосте, кэшируется на диске между запусками.
let wrapPromise = null;

async function getWrap() {
  if (!wrapPromise) {
    wrapPromise = (async () => {
      if (!fs.existsSync(BIN_PATH)) {
        fs.mkdirSync(path.dirname(BIN_PATH), { recursive: true });
        await YTDlpWrap.downloadFromGithub(BIN_PATH);
      }
      return new YTDlpWrap(BIN_PATH);
    })();
  }
  return wrapPromise;
}

function formatTrack(entry) {
  return {
    id: entry.id,
    title: entry.title,
    artists: entry.uploader || entry.channel || '',
    durationMs: Math.round((entry.duration ?? 0) * 1000),
  };
}

async function fetchFlatEntries(target, extraArgs = []) {
  const wrap = await getWrap();
  const raw = await wrap.getVideoInfo([target, '--flat-playlist', '--no-warnings', ...extraArgs]);
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(Boolean).map(formatTrack);
}

async function searchTracks(query, limit = 5) {
  return fetchFlatEntries(`ytsearch${limit}:${query}`);
}

async function getTrackById(videoId) {
  const [track] = await fetchFlatEntries(`https://www.youtube.com/watch?v=${videoId}`);
  return track ?? null;
}

async function getStreamUrl(videoId) {
  const wrap = await getWrap();
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const stdout = await wrap.execPromise(['-f', 'bestaudio/best', '-g', '--no-playlist', url]);
  return stdout.trim().split('\n')[0] || null;
}

// Аналога персонального "Моей волны" у YouTube нет — вместо rotor-сессии Yandex
// используем авто-плейлист Mix (RD+videoId), затравленный конкретным треком. Без
// личной авторизации YouTube отдаёт анонимный Mix, который без сигнала о вкусе
// слушателя чаще "подстраховывается" треками того же артиста/канала — если бы
// продолжение всегда затравливалось последним треком партии, эта однородность
// накапливалась бы от партии к партии. Поэтому следующая затравка выбирается
// случайно из партии (не всегда последний трек), а часть продолжений вообще
// возвращается к исходному seed-треку, чтобы плейлист не "залипал" на артисте.
const RADIO_BATCH_SIZE = 15;
const RESEED_FROM_ORIGINAL_CHANCE = 0.25;

async function fetchMix(seedVideoId) {
  return fetchFlatEntries(`https://www.youtube.com/watch?v=${seedVideoId}&list=RD${seedVideoId}`, [
    '--playlist-end',
    String(RADIO_BATCH_SIZE),
  ]);
}

function pickNextSeed(tracks, originalSeedId) {
  if (Math.random() < RESEED_FROM_ORIGINAL_CHANCE) return originalSeedId;
  // Первый трек партии — обычно сам seed, берём случайный из остальных ради разнообразия.
  const candidates = tracks.length > 1 ? tracks.slice(1) : tracks;
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

async function startRadio(seedVideoId) {
  const tracks = await fetchMix(seedVideoId);
  if (!tracks.length) return { seedId: seedVideoId, originalSeedId: seedVideoId, tracks: [] };
  return { seedId: pickNextSeed(tracks, seedVideoId), originalSeedId: seedVideoId, tracks };
}

async function continueRadio(seedVideoId, originalSeedId = seedVideoId) {
  const tracks = await fetchMix(seedVideoId);
  if (!tracks.length) return { seedId: seedVideoId, originalSeedId, tracks: [] };
  return { seedId: pickNextSeed(tracks, originalSeedId), originalSeedId, tracks };
}

module.exports = {
  searchTracks,
  getTrackById,
  getStreamUrl,
  startRadio,
  continueRadio,
};
