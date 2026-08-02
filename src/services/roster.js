const { EmbedBuilder } = require('discord.js');
const gameRoles = require('./gameRoles');
const rankGames = require('./rankGames');
const guildConfig = require('./guildConfig');

function buildGameToRoles(guild) {
  const generic = gameRoles.listAll();
  const ranked = rankGames.listAll();

  const gameToRoles = new Map();

  for (const entry of Object.values(generic)) {
    const ladder = ranked[entry.gameName.toLowerCase()];
    // Ранговая лестница прячет обычную роль той же игры, только пока в ней
    // есть хоть одна реально существующая роль на сервере — иначе (роли
    // лестницы удалили вручную, а данные о ней остались) обычная роль
    // остаётся единственным источником правды о том, кто играет в эту игру.
    const ladderHasLiveRole = ladder?.roles?.some((r) => guild.roles.cache.has(r.id));
    if (ladderHasLiveRole) continue;
    gameToRoles.set(entry.gameName, [entry.roleId]);
  }

  for (const entry of Object.values(ranked)) {
    const liveRoleIds = entry.roles.map((r) => r.id).filter((id) => guild.roles.cache.has(id));
    if (!liveRoleIds.length) continue;
    gameToRoles.set(entry.gameName, liveRoleIds);
  }

  return gameToRoles;
}

function buildRosterEmbed(guild) {
  const gameToRoles = buildGameToRoles(guild);
  const sections = [];

  for (const [gameName, roleIds] of [...gameToRoles.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const lines = [];
    for (const roleId of roleIds) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      for (const member of role.members.values()) {
        lines.push(`- ${member} — ${role.name}`);
      }
    }
    if (lines.length) {
      sections.push(`### ${gameName}\n${lines.join('\n')}`);
    }
  }

  const description = sections.length
    ? sections.join('\n\n').slice(0, 4096)
    : 'Пока никто не выбрал любимую игру — используй **/fav-game**.';

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Кто во что играет')
    .setDescription(description)
    .setTimestamp();
}

async function updateRoster(guild) {
  const channelId = guildConfig.getRosterChannelId(guild.id);
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = buildRosterEmbed(guild);
  const messageId = guildConfig.getRosterMessageId(guild.id);

  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed] });
      return;
    }
  }

  const sent = await channel.send({ embeds: [embed] });
  guildConfig.setRosterMessageId(guild.id, sent.id);
}

module.exports = { updateRoster };
