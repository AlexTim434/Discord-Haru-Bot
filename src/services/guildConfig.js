const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'guildConfig.json');

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

function setRosterChannel(guildId, channelId) {
  const store = loadStore();
  store[guildId] = { ...store[guildId], rosterChannelId: channelId, rosterMessageId: null };
  saveStore(store);
}

function getRosterChannelId(guildId) {
  const store = loadStore();
  return store[guildId]?.rosterChannelId ?? null;
}

function setRosterMessageId(guildId, messageId) {
  const store = loadStore();
  store[guildId] = { ...store[guildId], rosterMessageId: messageId };
  saveStore(store);
}

function getRosterMessageId(guildId) {
  const store = loadStore();
  return store[guildId]?.rosterMessageId ?? null;
}

function setAuraChannel(guildId, channelId) {
  const store = loadStore();
  store[guildId] = { ...store[guildId], auraChannelId: channelId, auraMessageId: null };
  saveStore(store);
}

function getAuraChannelId(guildId) {
  const store = loadStore();
  return store[guildId]?.auraChannelId ?? null;
}

function setAuraMessageId(guildId, messageId) {
  const store = loadStore();
  store[guildId] = { ...store[guildId], auraMessageId: messageId };
  saveStore(store);
}

function getAuraMessageId(guildId) {
  const store = loadStore();
  return store[guildId]?.auraMessageId ?? null;
}

function setGateChannel(guildId, channelId) {
  const store = loadStore();
  store[guildId] = { ...store[guildId], gateChannelId: channelId };
  saveStore(store);
}

function getGateChannelId(guildId) {
  const store = loadStore();
  return store[guildId]?.gateChannelId ?? null;
}

function setRulesChannel(guildId, channelId) {
  const store = loadStore();
  store[guildId] = { ...store[guildId], rulesChannelId: channelId, rulesMessageId: null };
  saveStore(store);
}

function getRulesChannelId(guildId) {
  const store = loadStore();
  return store[guildId]?.rulesChannelId ?? null;
}

function setRulesMessageId(guildId, messageId) {
  const store = loadStore();
  store[guildId] = { ...store[guildId], rulesMessageId: messageId };
  saveStore(store);
}

function getRulesMessageId(guildId) {
  const store = loadStore();
  return store[guildId]?.rulesMessageId ?? null;
}

function setRulesText(guildId, text) {
  const store = loadStore();
  store[guildId] = { ...store[guildId], rulesText: text };
  saveStore(store);
}

function getRulesText(guildId) {
  const store = loadStore();
  return store[guildId]?.rulesText ?? null;
}

function setUnverifiedRoleId(guildId, roleId) {
  const store = loadStore();
  store[guildId] = { ...store[guildId], unverifiedRoleId: roleId };
  saveStore(store);
}

function getUnverifiedRoleId(guildId) {
  const store = loadStore();
  return store[guildId]?.unverifiedRoleId ?? null;
}

module.exports = {
  setRosterChannel,
  getRosterChannelId,
  setRosterMessageId,
  getRosterMessageId,
  setAuraChannel,
  getAuraChannelId,
  setAuraMessageId,
  getAuraMessageId,
  setGateChannel,
  getGateChannelId,
  setRulesChannel,
  getRulesChannelId,
  setRulesMessageId,
  getRulesMessageId,
  setRulesText,
  getRulesText,
  setUnverifiedRoleId,
  getUnverifiedRoleId,
};
