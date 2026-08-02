const fs = require('fs');
const path = require('path');
const steamGames = require('./steamGames');
const steamDetails = require('./steamDetails');
const roleNameGenerator = require('./roleNameGenerator');
const rankGames = require('./rankGames');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'gameRoles.json');

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

async function getOrCreateRole(guild, gameName) {
  const rankLadder = rankGames.getRankLadder(gameName);
  if (rankLadder?.roles?.length) {
    const lowestRank = rankLadder.roles[0];
    const existingRankRole = guild.roles.cache.get(lowestRank.id);
    if (existingRankRole) return existingRankRole;

    // Лестница числится в данных, но её роль на сервере удалена (например,
    // вручную во время чистки) — без очистки записи она бы вечно "затеняла"
    // обычную роль этой игры в ростере (см. roster.js), хотя выдавать уже
    // нечего. Забываем протухшую лестницу и идём по обычному пути ниже.
    rankGames.removeRankLadder(gameName);
  }

  const key = gameName.toLowerCase();
  const store = loadStore();
  const cached = store[key];

  if (cached) {
    const existingRole = guild.roles.cache.get(cached.roleId);
    if (existingRole) return existingRole;
  }

  const appid = steamGames.getAppId(gameName);
  const description = appid ? await steamDetails.fetchShortDescription(appid) : null;
  const roleName = await roleNameGenerator.generateSingleRoleName(gameName, description);

  const role = await guild.roles.create({
    name: roleName,
    permissions: [],
    mentionable: false,
    reason: `Авто-роль за любимую игру: ${gameName}`,
  });

  store[key] = { roleId: role.id, roleName: role.name, gameName };
  saveStore(store);

  return role;
}

async function removeGenericRole(guild, gameName) {
  const key = gameName.toLowerCase();
  const store = loadStore();
  const cached = store[key];
  if (!cached) return;

  const role = guild.roles.cache.get(cached.roleId);
  if (role) {
    await role.delete(`Заменено ранговой системой для игры: ${gameName}`);
  }

  delete store[key];
  saveStore(store);
}

function listAll() {
  return loadStore();
}

// Вызывается из roleDelete в index.js — когда админ удаляет обычную игровую
// роль прямо в Discord (а не через бот-команды), запись держала бы мёртвый
// roleId вечно.
function forgetRole(roleId) {
  const store = loadStore();
  const key = Object.keys(store).find((k) => store[k].roleId === roleId);
  if (!key) return false;

  delete store[key];
  saveStore(store);
  return true;
}

// Есть ли у участника роль за игру gameName — не создаёт роль, если её ещё
// не было (значит игру ещё никто не выбирал, доступа ни у кого нет).
function hasGameRole(member, gameName) {
  const ladder = rankGames.getRankLadder(gameName);
  if (ladder?.roles?.length) {
    return ladder.roles.some((r) => member.roles.cache.has(r.id));
  }

  const key = gameName.toLowerCase();
  const roleId = loadStore()[key]?.roleId;
  return roleId ? member.roles.cache.has(roleId) : false;
}

module.exports = { getOrCreateRole, removeGenericRole, listAll, hasGameRole, forgetRole };
