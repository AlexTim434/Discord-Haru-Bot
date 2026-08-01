require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, MessageFlags, EmbedBuilder } = require('discord.js');
const steamGames = require('./services/steamGames');
const guildConfig = require('./services/guildConfig');
const roster = require('./services/roster');
const auraPicker = require('./services/auraPicker');
const verification = require('./services/verification');
const music = require('./commands/music');
const musicPlayer = require('./services/musicPlayer');
const musicPanel = require('./services/musicPanel');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates],
});

musicPlayer.setOnUpdate((guild) =>
  musicPanel.refresh(guild).catch((error) => console.error('Не удалось обновить панель музыки:', error)),
);

// Без этого обработчика необработанная ошибка на клиенте (например протухшая
// интеракция) роняет весь процесс — см. инцидент 2026-08-01 в CLAUDE.md.
client.on('error', (error) => console.error('Ошибка клиента Discord:', error));

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('clientReady', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();
      console.log(`Загружено ${members.size} участников гильдии ${guild.name}`);
    } catch (error) {
      console.error(`Не удалось загрузить участников гильдии ${guild.name}:`, error);
    }
  }
});

client.on('guildMemberAdd', async (member) => {
  await verification.assignUnverified(member);

  try {
    const gateChannelId = guildConfig.getGateChannelId(member.guild.id);
    const channel = gateChannelId ? await member.guild.channels.fetch(gateChannelId).catch(() => null) : null;

    if (channel) {
      const rulesChannelId = guildConfig.getRulesChannelId(member.guild.id);
      const rulesMention = rulesChannelId ? `<#${rulesChannelId}>` : 'канал с правилами';

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Добро пожаловать в ${member.guild.name}!`)
        .setDescription(
          `Приветствуем тебя, ${member}!\n\n` +
            `Перед тем, как начать общение на сервере, прочти правила в ${rulesMention} и нажми на кнопку "Принимаю".`,
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error(`Не удалось отправить приветствие для ${member.id}:`, error);
  }

  await roster.updateRoster(member.guild).catch((error) => console.error('Не удалось обновить ростер:', error));
});

client.on('channelCreate', (channel) => {
  verification
    .applyGateToNewChannel(channel)
    .catch((error) => console.error('Не удалось ограничить новый канал:', error));
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const oldRoleIds = new Set(oldMember.roles.cache.keys());
  const newRoleIds = new Set(newMember.roles.cache.keys());
  const changed =
    oldRoleIds.size !== newRoleIds.size || [...newRoleIds].some((id) => !oldRoleIds.has(id));
  if (!changed) return;

  await roster.updateRoster(newMember.guild).catch((error) => console.error('Не удалось обновить ростер:', error));
});

client.on('roleUpdate', async (oldRole, newRole) => {
  await roster.updateRoster(newRole.guild).catch((error) => console.error('Не удалось обновить ростер:', error));
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith(musicPanel.PREFIX)) {
    try {
      await musicPanel.handleButtonClick(interaction);
    } catch (error) {
      console.error('Не удалось обработать кнопку панели музыки:', error);
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith(music.SEARCH_SELECT_ID)) {
    try {
      await music.handleSearchSelect(interaction);
    } catch (error) {
      console.error('Не удалось обработать выбор из поиска музыки:', error);
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === auraPicker.SELECT_CUSTOM_ID) {
    try {
      await auraPicker.handleSelect(interaction);
    } catch (error) {
      console.error('Не удалось обработать выбор ауры:', error);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === verification.ACCEPT_CUSTOM_ID) {
    try {
      await verification.handleAccept(interaction);
    } catch (error) {
      console.error('Не удалось обработать принятие правил:', error);
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('verify-setup:')) {
    const [, gateChannelId, rulesChannelId] = interaction.customId.split(':');
    const rulesText = interaction.fields.getTextInputValue('rules-text');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const { restrictedCount } = await verification.setup(interaction.guild, gateChannelId, rulesChannelId, rulesText);
      await interaction.editReply(
        `Готово! Роль "Не верифицирован" настроена, ограничено каналов: ${restrictedCount}. ` +
          `Правила опубликованы в <#${rulesChannelId}>, приветствие будет уходить в <#${gateChannelId}>.`,
      );
    } catch (error) {
      console.error('Не удалось настроить верификацию:', error);
      await interaction.editReply('Не получилось настроить верификацию, смотри логи бота.');
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(error);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const reply = { content: 'Произошла ошибка при выполнении команды.', flags: MessageFlags.Ephemeral };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (replyError) {
      console.error('Не удалось отправить сообщение об ошибке (интеракция протухла?):', replyError);
    }
  }
});

steamGames
  .refresh()
  .then(() => {
    setInterval(() => {
      steamGames.refresh().catch((error) => console.error('Не удалось обновить список игр Steam:', error));
    }, 24 * 60 * 60 * 1000);
  })
  .catch((error) => console.error('Не удалось загрузить список игр Steam при старте:', error));

client.login(process.env.DISCORD_TOKEN);
