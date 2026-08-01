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

function listAll() {
  return loadStore();
}

module.exports = { saveRankLadder, getRankLadder, listAll };
