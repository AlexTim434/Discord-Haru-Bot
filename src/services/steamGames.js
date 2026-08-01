const APP_LIST_URL = 'https://api.steampowered.com/IStoreService/GetAppList/v1/';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50000;

// Все названия хранятся в одной строке подряд (без копий на каждое имя),
// offsets[i]..offsets[i+1] — границы имени i внутри catalogText, appids[i] — его appid.
// Так не платим за 170k+ объектов и не дублируем строки во второй структуре.
let catalogText = '';
let offsets = new Uint32Array(0);
let appids = new Uint32Array(0);
let count = 0;
let lastFetch = 0;

function nameAt(i) {
  return catalogText.slice(offsets[i], offsets[i + 1]);
}

async function fetchPage(lastAppid) {
  const params = new URLSearchParams({
    key: process.env.STEAM_API_KEY,
    max_results: String(PAGE_SIZE),
  });
  if (lastAppid !== undefined) params.set('last_appid', String(lastAppid));

  const res = await fetch(`${APP_LIST_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Steam API вернул ${res.status}`);
  const data = await res.json();
  return data.response;
}

async function refresh() {
  if (!process.env.STEAM_API_KEY) {
    throw new Error('STEAM_API_KEY не задан в .env');
  }

  const seen = new Set();
  const names = [];
  const ids = [];
  let lastAppid;

  for (;;) {
    const page = await fetchPage(lastAppid);
    for (const app of page.apps ?? []) {
      const name = app.name?.trim();
      if (!name || name.length > 100) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
      ids.push(app.appid);
    }
    if (!page.have_more_results) break;
    lastAppid = page.last_appid;
  }

  const newOffsets = new Uint32Array(names.length + 1);
  let pos = 0;
  for (let i = 0; i < names.length; i++) {
    newOffsets[i] = pos;
    pos += names[i].length;
  }
  newOffsets[names.length] = pos;

  catalogText = names.join('');
  offsets = newOffsets;
  appids = Uint32Array.from(ids);
  count = names.length;
  lastFetch = Date.now();
  console.log(`Steam: загружено ${count} уникальных названий игр.`);
}

async function ensureFresh() {
  if (Date.now() - lastFetch > CACHE_TTL_MS) {
    await refresh();
  }
}

function search(query, limit = 25) {
  const q = query.trim().toLowerCase();
  if (!q) {
    const out = [];
    for (let i = 0; i < count && out.length < limit; i++) out.push(nameAt(i));
    return out;
  }

  const startsWith = [];
  const includes = [];
  for (let i = 0; i < count; i++) {
    const name = nameAt(i);
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) {
      startsWith.push(name);
      if (startsWith.length >= limit) break;
    } else if (includes.length < limit && lower.includes(q)) {
      includes.push(name);
    }
  }

  return [...startsWith, ...includes].slice(0, limit);
}

function getAppId(name) {
  const target = name.trim().toLowerCase();
  for (let i = 0; i < count; i++) {
    if (nameAt(i).toLowerCase() === target) return appids[i];
  }
  return undefined;
}

module.exports = { refresh, ensureFresh, search, getAppId };
