const { EmbedBuilder } = require('discord.js');
const gameRoles = require('./gameRoles');
const rankGames = require('./rankGames');
const guildConfig = require('./guildConfig');

function buildGameToRoles() {
  const generic = gameRoles.listAll();
  const ranked = rankGames.listAll();

  const gameToRoles = new Map();

  for (const entry of Object.values(generic)) {
    if (ranked[entry.gameName.toLowerCase()]) continue;
    gameToRoles.set(entry.gameName, [entry.roleId]);
  }

  for (const entry of Object.values(ranked)) {
    gameToRoles.set(
      entry.gameName,
      entry.roles.map((r) => r.id),
    );
  }

  return gameToRoles;
}

function buildRosterEmbed(guild) {
  const gameToRoles = buildGameToRoles();
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
