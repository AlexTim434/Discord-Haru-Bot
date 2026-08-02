const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const steamGames = require('../services/steamGames');
const gameRoles = require('../services/gameRoles');
const roster = require('../services/roster');
const guildConfig = require('../services/guildConfig');

const MAX_GAMES = 5;

function addGameOption(builder, index) {
  return builder.addStringOption((option) =>
    option
      .setName(`game${index}`)
      .setDescription(index === 1 ? 'Любимая игра' : `Ещё одна любимая игра (необязательно) #${index}`)
      .setAutocomplete(true)
      .setRequired(index === 1),
  );
}

let commandBuilder = new SlashCommandBuilder()
  .setName('fav-game')
  .setDescription('Укажи одну или несколько своих любимых игр');
for (let i = 1; i <= MAX_GAMES; i += 1) {
  commandBuilder = addGameOption(commandBuilder, i);
}

module.exports = {
  data: commandBuilder,
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const matches = steamGames.search(focused);
    await interaction.respond(matches.map((name) => ({ name, value: name })));
  },
  async execute(interaction) {
    const games = [];
    const seen = new Set();
    for (let i = 1; i <= MAX_GAMES; i += 1) {
      const game = interaction.options.getString(`game${i}`);
      if (!game || seen.has(game.toLowerCase())) continue;
      seen.add(game.toLowerCase());
      games.push(game);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const assignedRoles = [];
    const failedGames = [];
    for (const game of games) {
      try {
        const role = await gameRoles.getOrCreateRole(interaction.guild, game);
        await interaction.member.roles.add(role);
        assignedRoles.push(role);
      } catch (error) {
        console.error(`Не удалось выдать роль за игру "${game}":`, error);
        failedGames.push(game);
      }
    }

    if (assignedRoles.length) {
      // interaction.member.roles.add() для одиночной роли не патчит запись в
      // guild.members.cache (возвращает независимый _clone()) — реальный кэш
      // обновляется только по прилетающему позже gateway-событию
      // GUILD_MEMBER_UPDATE. roster.js читает role.members из этого кэша, так
      // что без принудительного re-fetch свежая роль может не попасть в
      // список (особенно при нестабильной сети — см. CLAUDE.md, инцидент
      // 2026-08-01).
      await interaction.guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => null);
      await roster.updateRoster(interaction.guild).catch((error) => console.error('Не удалось обновить ростер:', error));
    }

    const lines = [];
    if (assignedRoles.length) {
      lines.push(`Выдал роли: ${assignedRoles.map((r) => `<@&${r.id}>`).join(', ')}`);
    }
    if (failedGames.length) {
      lines.push(`Не получилось обработать: ${failedGames.join(', ')}`);
    }

    if (assignedRoles.length) {
      const auraChannelId = guildConfig.getAuraChannelId(interaction.guild.id);
      if (auraChannelId) {
        lines.push(`Также можешь заглянуть в <#${auraChannelId}> и выбрать себе цветную роль (ауру) по вкусу.`);
      }
    }

    await interaction.editReply(lines.join('\n') || 'Не указано ни одной игры.');
  },
};
