const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'auras.json');

const DEFAULT_PALETTE = [
  { name: 'Огненная аура', color: '#E74C3C' },
  { name: 'Ледяная аура', color: '#5DADE2' },
  { name: 'Королевская аура', color: '#8E44AD' },
  { name: 'Изумрудная аура', color: '#2ECC71' },
  { name: 'Золотая аура', color: '#F1C40F' },
  { name: 'Тёмная аура', color: '#34495E' },
  { name: 'Розовая аура', color: '#FF6EB4' },
  { name: 'Электрическая аура', color: '#1ABC9C' },
  { name: 'Кровавая аура', color: '#C0392B' },
];

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveStore(list) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(list, null, 2));
}

function listAll() {
  return loadStore();
}

async function ensureSeeded(guild) {
  let list = loadStore();

  if (!list.length) {
    list = [];
    for (const aura of DEFAULT_PALETTE) {
      const role = await guild.roles.create({
        name: aura.name,
        color: aura.color,
        permissions: [],
        mentionable: false,
        reason: 'Стартовый набор аур',
      });
      list.push({ name: aura.name, color: aura.color, roleId: role.id });
    }
    saveStore(list);
    return list;
  }

  let changed = false;
  for (const aura of list) {
    if (guild.roles.cache.has(aura.roleId)) continue;

    const role = await guild.roles.create({
      name: aura.name,
      color: aura.color,
      permissions: [],
      mentionable: false,
      reason: 'Восстановление удалённой вручную роли ауры',
    });
    aura.roleId = role.id;
    changed = true;
  }
  if (changed) saveStore(list);

  return list;
}

async function addAura(guild, name, color) {
  const list = loadStore();
  const role = await guild.roles.create({
    name,
    color,
    permissions: [],
    mentionable: false,
    reason: 'Новая аура (добавлена вручную)',
  });
  list.push({ name, color, roleId: role.id });
  saveStore(list);
  return role;
}

async function removeAura(guild, name) {
  const list = loadStore();
  const index = list.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
  if (index === -1) return false;

  const [removed] = list.splice(index, 1);
  const role = guild.roles.cache.get(removed.roleId);
  if (role) await role.delete('Аура удалена из списка');
  saveStore(list);
  return true;
}

function getAllRoleIds() {
  return loadStore().map((a) => a.roleId);
}

module.exports = { listAll, ensureSeeded, addAura, removeAura, getAllRoleIds };
