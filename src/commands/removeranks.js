const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const rankGames = require('../services/rankGames');
const gameRoles = require('../services/gameRoles');
const roster = require('../services/roster');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-ranks')
    .setDescription('[Админ] Убрать ранговую систему игры и вернуть одну обычную роль')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((option) =>
      option.setName('game').setDescription('Игра с ранговой лестницей').setAutocomplete(true).setRequired(true),
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const games = Object.values(rankGames.listAll())
      .map((entry) => entry.gameName)
      .filter((name) => name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(games.map((name) => ({ name, value: name })));
  },
  async execute(interaction) {
    const game = interaction.options.getString('game');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ladder = rankGames.getRankLadder(game);
    if (!ladder) {
      await interaction.editReply(`У игры "${game}" нет ранговой лестницы.`);
      return;
    }

    // Собираем всех, у кого есть хоть один ранг этой лестницы — после
    // удаления рангов им взамен выдаём единую обычную роль, чтобы они не
    // выпали из ростера этой игры.
    const affectedMemberIds = new Set();
    for (const rankRole of ladder.roles) {
      const role = interaction.guild.roles.cache.get(rankRole.id);
      if (!role) continue;
      for (const memberId of role.members.keys()) {
        affectedMemberIds.add(memberId);
      }
    }

    for (const rankRole of ladder.roles) {
      const role = interaction.guild.roles.cache.get(rankRole.id);
      if (!role) continue;
      await role
        .delete(`Ранговая система убрана через /remove-ranks (${interaction.user.tag})`)
        .catch((error) => console.error(`Не удалось удалить ранговую роль ${rankRole.id}:`, error));
    }

    rankGames.removeRankLadder(game);

    // getOrCreateRole сам разберётся: раз лестницы больше нет, переиспользует
    // уже существующую обычную роль этой игры (если такая случайно осталась
    // от прошлых экспериментов) либо сгенерирует новую через LLM.
    const defaultRole = await gameRoles.getOrCreateRole(interaction.guild, game);

    for (const memberId of affectedMemberIds) {
      const member = await interaction.guild.members.fetch(memberId).catch(() => null);
      if (!member) continue;
      await member.roles
        .add(defaultRole)
        .catch((error) => console.error(`Не удалось выдать обычную роль участнику ${memberId}:`, error));
    }

    // interaction.member.roles.add() не патчит guild.members.cache сразу
    // (см. фикс в favgame.js) — принудительно освежаем кэш перед тем, как
    // roster.js будет читать role.members.
    await Promise.all(
      [...affectedMemberIds].map((memberId) =>
        interaction.guild.members.fetch({ user: memberId, force: true }).catch(() => null),
      ),
    );

    await roster.updateRoster(interaction.guild).catch((error) => console.error('Не удалось обновить ростер:', error));

    await interaction.editReply(
      `Готово! Ранговая лестница для **${game}** удалена. ${affectedMemberIds.size} участник(ов) с рангами получили обычную роль ${defaultRole}.`,
    );
  },
};
