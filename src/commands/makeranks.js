const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const steamGames = require('../services/steamGames');
const steamDetails = require('../services/steamDetails');
const roleNameGenerator = require('../services/roleNameGenerator');
const rankGames = require('../services/rankGames');
const gameRoles = require('../services/gameRoles');
const roster = require('../services/roster');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('make-ranks')
    .setDescription('[Админ] Сгенерировать тематическую лестницу рангов для игры')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((option) =>
      option.setName('game').setDescription('Игра').setAutocomplete(true).setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Количество рангов (2-10)')
        .setMinValue(2)
        .setMaxValue(10)
        .setRequired(true),
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const matches = steamGames.search(focused);
    await interaction.respond(matches.map((name) => ({ name, value: name })));
  },
  async execute(interaction) {
    const game = interaction.options.getString('game');
    const levels = interaction.options.getInteger('levels');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const appid = steamGames.getAppId(game);
    const description = appid ? await steamDetails.fetchShortDescription(appid) : null;

    let names;
    try {
      names = await roleNameGenerator.generateRankNames(game, description, levels);
    } catch (error) {
      console.error(`Не удалось сгенерировать ранги для "${game}":`, error);
      await interaction.editReply(`Не получилось сгенерировать ранги: ${error.message}`);
      return;
    }

    const roles = [];
    for (const name of names) {
      const role = await interaction.guild.roles.create({
        name,
        permissions: [],
        mentionable: false,
        reason: `Ранговая роль для игры "${game}" (создано через /make-ranks)`,
      });
      roles.push(role);
    }

    rankGames.saveRankLadder(game, roles);
    await gameRoles.removeGenericRole(interaction.guild, game);
    await roster.updateRoster(interaction.guild).catch((error) => console.error('Не удалось обновить ростер:', error));

    const list = roles.map((r, i) => `${i + 1}. <@&${r.id}>`).join('\n');
    await interaction.editReply(
      `Создал ${roles.length} ранг(ов) для **${game}** (от младшего к старшему):\n${list}\n` +
        'Старая обычная роль (если была) удалена — теперь **/fav-game** будет выдавать младший ранг.',
    );
  },
};
