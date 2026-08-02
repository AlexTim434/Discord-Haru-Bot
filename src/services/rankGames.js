const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'rankGames.json');

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
}

function saveRankLadder(gameName, roles) {
  const store = loadStore();
  store[gameName.toLowerCase()] = {
    gameName,
    levels: roles.length,
    roles: roles.map((r) => ({ id: r.id, name: r.name })),
    createdAt: new Date().toISOString(),
  };
  saveStore(store);
}

function getRankLadder(gameName) {
  const store = loadStore();
  return store[gameName.toLowerCase()] ?? null;
}

function removeRankLadder(gameName) {
  const store = loadStore();
  delete store[gameName.toLowerCase()];
  saveStore(store);
}

function listAll() {
  return loadStore();
}

// Вызывается из roleDelete в index.js — когда админ удаляет ранговую роль
// прямо в Discord (а не через /remove-ranks), эта запись держала бы мёртвый
// ID вечно, затеняя обычную роль игры в ростере (см. roster.js). Убирает
// только удалённый ранг; если это был последний ранг лестницы — убирает и
// саму лестницу.
function forgetRole(roleId) {
  const store = loadStore();
  let changed = false;

  for (const key of Object.keys(store)) {
    const entry = store[key];
    const before = entry.roles.length;
    entry.roles = entry.roles.filter((r) => r.id !== roleId);
    if (entry.roles.length === before) continue;

    changed = true;
    entry.levels = entry.roles.length;
    if (!entry.roles.length) delete store[key];
  }

  if (changed) saveStore(store);
  return changed;
}

module.exports = { saveRankLadder, getRankLadder, removeRankLadder, forgetRole, listAll };
