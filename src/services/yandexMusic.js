const MY_WAVE_SEED = 'user:onyourwave';

// yamd2 — чисто ESM-пакет ("type": "module"), а проект на CommonJS,
// поэтому подключаем его через динамический import() и кэшируем инстанс.
let apiPromise = null;

async function getWrappedApi() {
  if (!apiPromise) {
    apiPromise = (async () => {
      if (!process.env.YANDEX_MUSIC_TOKEN || !process.env.YANDEX_MUSIC_UID) {
        throw new Error('YANDEX_MUSIC_TOKEN / YANDEX_MUSIC_UID не заданы в .env');
      }
      const { WrappedYMApi } = await import('yamd2');
      const wrapped = new WrappedYMApi();
      await wrapped.init({
        access_token: process.env.YANDEX_MUSIC_TOKEN,
        uid: Number(process.env.YANDEX_MUSIC_UID),
      });
      return wrapped;
    })();
  }
  return apiPromise;
}

function formatTrack(track) {
  return {
    id: track.id,
    title: track.title,
    artists: (track.artists ?? []).map((a) => a.name).join(', '),
    durationMs: track.durationMs,
  };
}

async function searchTracks(query, limit = 5) {
  const wrapped = await getWrappedApi();
  const result = await wrapped.getApi().search.tracks(query);
  return (result.tracks?.results ?? []).slice(0, limit).map(formatTrack);
}

async function searchArtists(query, limit = 5) {
  const wrapped = await getWrappedApi();
  const result = await wrapped.getApi().search.artists(query);
  return (result.artists?.results ?? []).slice(0, limit).map((a) => ({ id: a.id, name: a.name }));
}

async function searchAlbums(query, limit = 5) {
  const wrapped = await getWrappedApi();
  const result = await wrapped.getApi().search.albums(query);
  return (result.albums?.results ?? []).slice(0, limit).map((a) => ({
    id: a.id,
    title: a.title,
    artists: (a.artists ?? []).map((ar) => ar.name).join(', '),
  }));
}

async function getArtistTracks(artistId, limit = 20) {
  const wrapped = await getWrappedApi();
  const result = await wrapped.getApi().artists.getArtistTracks(artistId);
  return (result.tracks ?? []).slice(0, limit).map(formatTrack);
}

async function getAlbumTracks(albumId) {
  const wrapped = await getWrappedApi();
  const album = await wrapped.getApi().albums.getAlbumWithTracks(albumId);
  return (album.volumes ?? []).flat().map(formatTrack);
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function getTracksByIds(ids, concurrency = 10) {
  const wrapped = await getWrappedApi();
  const api = wrapped.getApi();
  // api.tracks.getTracks() (пакетный POST) в yamd2 сейчас багованный и возвращает undefined —
  // используем getTrack() поштучно, небольшими партиями, чтобы не запрашивать всё разом.
  const tracks = [];
  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((id) => api.tracks.getTrack(String(id)).catch(() => null)),
    );
    tracks.push(...chunkResults.flat().filter(Boolean));
  }
  return tracks.map(formatTrack);
}

async function getFavorites(limit = 30) {
  const wrapped = await getWrappedApi();
  const liked = await wrapped.getApi().user.getLikedTracks();
  const ids = shuffle(liked.library.tracks.map((t) => t.id)).slice(0, limit);
  if (!ids.length) return [];
  return getTracksByIds(ids);
}

async function startRadio(seed = MY_WAVE_SEED) {
  const wrapped = await getWrappedApi();
  const session = await wrapped.getApi().radio.createRotorSession([seed], true);
  return {
    sessionId: session.radioSessionId,
    batchId: session.batchId,
    tracks: session.sequence.map((entry) => formatTrack(entry.track)),
  };
}

async function continueRadio(sessionId, batchId) {
  const wrapped = await getWrappedApi();
  const result = await wrapped.getApi().radio.postRotorSessionTracks(sessionId, { batchId });
  return {
    batchId: result.batchId,
    tracks: result.sequence.map((entry) => formatTrack(entry.track)),
  };
}

async function getStreamUrl(trackId) {
  const wrapped = await getWrappedApi();
  return wrapped.getDownloadUrlForFFmpeg(trackId);
}

module.exports = {
  searchTracks,
  searchArtists,
  searchAlbums,
  getArtistTracks,
  getAlbumTracks,
  getTracksByIds,
  getFavorites,
  startRadio,
  continueRadio,
  getStreamUrl,
};
