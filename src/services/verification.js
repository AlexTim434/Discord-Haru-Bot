const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const guildConfig = require('./guildConfig');
const { deleteChannelMessage } = require('../utils/channelCleanup');

const ACCEPT_CUSTOM_ID = 'verify-accept';
const UNVERIFIED_ROLE_NAME = 'Не верифицирован';
const VERIFIED_ROLE_NAME = 'Верифицирован';
const MODERATOR_ROLE_NAME = 'Модератор';
const processingAccept = new Set();

async function ensureUnverifiedRole(guild) {
  const existingId = guildConfig.getUnverifiedRoleId(guild.id);
  let role = existingId ? guild.roles.cache.get(existingId) : null;
  if (role) return role;

  role = guild.roles.cache.find((r) => r.name === UNVERIFIED_ROLE_NAME);
  if (!role) {
    role = await guild.roles.create({
      name: UNVERIFIED_ROLE_NAME,
      permissions: [],
      mentionable: false,
      reason: 'Роль для гейта верификации новых участников',
    });
  }
  guildConfig.setUnverifiedRoleId(guild.id, role.id);
  return role;
}

// Роль-пропуск, выдаваемая по кнопке "Принимаю". Раньше гейт строился как
// deny для роли "Не верифицирован" при открытом по умолчанию @everyone — это
// оставляло окно гонки прямо в момент захода: участник уже виден на сервере
// (и клиент Discord уже строит список каналов по правам @everyone), а роль
// "Не верифицирован" бот успевает выдать только чуть позже, асинхронно. В
// эту долю секунды клиент мог показать любой обычно закрытый канал. Теперь
// @everyone запрещён на защищённых каналах ВСЕГДА, а доступ возвращает эта
// роль — гонки больше нет, ограничение действует с первой миллисекунды.
async function ensureVerifiedRole(guild) {
  const existingId = guildConfig.getVerifiedRoleId(guild.id);
  let role = existingId ? guild.roles.cache.get(existingId) : null;
  if (role) return role;

  role = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
  if (!role) {
    role = await guild.roles.create({
      name: VERIFIED_ROLE_NAME,
      permissions: [],
      mentionable: false,
      reason: 'Роль-пропуск для гейта верификации',
    });
  }
  guildConfig.setVerifiedRoleId(guild.id, role.id);
  return role;
}

// Роль для каналов, помеченных как "только для админов/модераторов" (см.
// guildConfig.getAdminChannelIds) — там вместо общей роли "Верифицирован"
// доступ получает только эта роль.
async function ensureModeratorRole(guild) {
  const existingId = guildConfig.getModeratorRoleId(guild.id);
  let role = existingId ? guild.roles.cache.get(existingId) : null;
  if (role) return role;

  role = guild.roles.cache.find((r) => r.name === MODERATOR_ROLE_NAME);
  if (!role) {
    role = await guild.roles.create({
      name: MODERATOR_ROLE_NAME,
      permissions: [],
      mentionable: false,
      reason: 'Роль для доступа к админ-каналам',
    });
  }
  guildConfig.setModeratorRoleId(guild.id, role.id);
  return role;
}

async function restrictChannel(channel, allowRoleIds, botRoleId) {
  if (!channel?.permissionOverwrites) return;
  try {
    // Порядок принципиален: у роли бота нет собственного ViewChannel на
    // уровне гильдии — он всегда смотрел на каналы только через дефолтный
    // доступ @everyone. Если запретить @everyone ДО того, как бот явно
    // разрешит себе (и остальным допущенным ролям) этот же канал, бот сам
    // мгновенно потеряет к нему видимость — а следующий же вызов editOverwrite
    // упадёт с Missing Access, потому что Discord не даёт менять права на
    // канале, который ты сейчас не видишь. Поэтому сначала выдаём явные
    // allow, и только потом закрываем @everyone.
    if (botRoleId) {
      await channel.permissionOverwrites.edit(
        botRoleId,
        { ViewChannel: true },
        { reason: 'Гейт верификации: бот должен видеть канал' },
      );
    }
    for (const roleId of allowRoleIds) {
      await channel.permissionOverwrites.edit(
        roleId,
        { ViewChannel: true },
        { reason: 'Гейт верификации: разрешённый доступ' },
      );
    }
    await channel.permissionOverwrites.edit(
      channel.guild.id,
      { ViewChannel: false },
      { reason: 'Гейт верификации: закрыто по умолчанию для @everyone' },
    );
  } catch (error) {
    console.error(`Не удалось ограничить канал ${channel.name}:`, error);
  }
}

async function allowChannel(channel) {
  if (!channel?.permissionOverwrites) return;
  try {
    await channel.permissionOverwrites.edit(
      channel.guild.id,
      { ViewChannel: true },
      { reason: 'Гейт верификации: канал должен оставаться видимым для всех' },
    );
  } catch (error) {
    console.error(`Не удалось разрешить канал ${channel.name}:`, error);
  }
}

function buildRulesEmbed(rulesText) {
  const description = `${rulesText}\n\nПрочитал(а)? Нажми **Принимаю** ниже, чтобы получить доступ к серверу.`.slice(
    0,
    4096,
  );
  return new EmbedBuilder().setColor(0x5865f2).setTitle('Правила сервера').setDescription(description).setTimestamp();
}

function buildAcceptRow() {
  const button = new ButtonBuilder().setCustomId(ACCEPT_CUSTOM_ID).setLabel('Принимаю').setStyle(ButtonStyle.Success);
  return [new ActionRowBuilder().addComponents(button)];
}

async function setup(guild, gateChannelId, rulesChannelId, rulesText) {
  const unverifiedRole = await ensureUnverifiedRole(guild);
  const verifiedRole = await ensureVerifiedRole(guild);
  const moderatorRole = await ensureModeratorRole(guild);
  const botRole = guild.roles.botRoleFor(guild.client.user.id);
  const adminChannelIds = new Set(guildConfig.getAdminChannelIds(guild.id));

  const oldRulesChannelId = guildConfig.getRulesChannelId(guild.id);
  const oldRulesMessageId = guildConfig.getRulesMessageId(guild.id);
  await deleteChannelMessage(guild, oldRulesChannelId, oldRulesMessageId);

  guildConfig.setGateChannel(guild.id, gateChannelId);
  guildConfig.setRulesChannel(guild.id, rulesChannelId);
  guildConfig.setRulesText(guild.id, rulesText);

  // Миграция: у @everyone-запрета не было исключений для тех, кто уже прошёл
  // верификацию под старой моделью (deny для "Не верифицирован" при открытом
  // по умолчанию @everyone) — они не держат ни одной из гейт-ролей вообще.
  // Без этого шага переход на новую модель (deny @everyone + allow для
  // "Верифицирован") мгновенно запер бы их из всех каналов сервера.
  const members = await guild.members.fetch();
  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (member.roles.cache.has(unverifiedRole.id) || member.roles.cache.has(verifiedRole.id)) continue;
    await member.roles
      .add(verifiedRole.id)
      .catch((error) => console.error(`Не удалось перенести на новую роль верификации участника ${member.id}:`, error));
  }

  const excluded = new Set([gateChannelId, rulesChannelId]);
  const channels = await guild.channels.fetch();
  let restrictedCount = 0;
  for (const channel of channels.values()) {
    if (!channel || channel.type === ChannelType.GuildCategory) continue;

    if (excluded.has(channel.id)) {
      await allowChannel(channel);
      continue;
    }

    const allowRoleIds = adminChannelIds.has(channel.id) ? [moderatorRole.id] : [verifiedRole.id];
    await restrictChannel(channel, allowRoleIds, botRole?.id);
    restrictedCount += 1;
  }

  const rulesChannel = await guild.channels.fetch(rulesChannelId).catch(() => null);
  if (rulesChannel) {
    const payload = { embeds: [buildRulesEmbed(rulesText)], components: buildAcceptRow() };
    const existingId = guildConfig.getRulesMessageId(guild.id);
    const existing = existingId ? await rulesChannel.messages.fetch(existingId).catch(() => null) : null;

    if (existing) {
      await existing.edit(payload);
    } else {
      const sent = await rulesChannel.send(payload);
      guildConfig.setRulesMessageId(guild.id, sent.id);
    }
  }

  return { restrictedCount, roleId: unverifiedRole.id };
}

async function applyGateToNewChannel(channel) {
  if (!channel.guild || channel.type === ChannelType.GuildCategory) return;
  const verifiedRoleId = guildConfig.getVerifiedRoleId(channel.guild.id);
  if (!verifiedRoleId) return;

  const gateId = guildConfig.getGateChannelId(channel.guild.id);
  const rulesId = guildConfig.getRulesChannelId(channel.guild.id);
  if (channel.id === gateId || channel.id === rulesId) {
    await allowChannel(channel);
    return;
  }

  const adminChannelIds = guildConfig.getAdminChannelIds(channel.guild.id);
  const moderatorRoleId = guildConfig.getModeratorRoleId(channel.guild.id);
  const allowRoleIds = adminChannelIds.includes(channel.id) && moderatorRoleId ? [moderatorRoleId] : [verifiedRoleId];

  const botRole = channel.guild.roles.botRoleFor(channel.client.user.id);
  await restrictChannel(channel, allowRoleIds, botRole?.id);
}

// Помечает канал как "только для админов/модераторов": вместо общей роли
// "Верифицирован" доступ получает только роль "Модератор". Используется
// командой /set-admin-channel — как для уже существующих каналов, так и
// закрепляется в guildConfig, чтобы будущие /setup-verification не откатили
// это обратно на общий доступ.
async function setAdminChannel(guild, channelId) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  const moderatorRole = await ensureModeratorRole(guild);
  guildConfig.addAdminChannel(guild.id, channelId);

  const botRole = guild.roles.botRoleFor(guild.client.user.id);
  await restrictChannel(channel, [moderatorRole.id], botRole?.id);

  // Убираем оверрайт "Верифицирован", если он остался от предыдущего общего
  // доступа — иначе оба allow-оверрайта продолжат действовать одновременно.
  await channel.permissionOverwrites
    .delete(guildConfig.getVerifiedRoleId(guild.id), 'Канал переведён в admin-only')
    .catch(() => {});

  return moderatorRole;
}

async function assignUnverified(member) {
  const roleId = guildConfig.getUnverifiedRoleId(member.guild.id);
  if (!roleId) return;
  await member.roles.add(roleId).catch((error) => console.error('Не удалось выдать роль "не верифицирован":', error));
}

async function handleAccept(interaction) {
  const member = interaction.member;
  const roleId = guildConfig.getUnverifiedRoleId(interaction.guild.id);

  // Кнопка "Принимаю" физически остаётся в сообщении для всех — Discord не
  // умеет прятать компоненты по конкретному зрителю. Для тех, кто уже
  // верифицирован (роли уже нет), просто тихо сообщаем об этом вместо
  // повторной попытки снять роль/продублировать nudge в welcome-канал.
  if (!roleId || !member.roles.cache.has(roleId)) {
    await interaction.reply({
      content: 'Ты уже верифицирован(а) — доступ к серверу уже открыт.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const key = `${interaction.guild.id}:${member.id}`;

  if (processingAccept.has(key)) {
    await interaction.reply({ content: 'Секунду, уже обрабатываю твоё нажатие...', flags: MessageFlags.Ephemeral });
    return;
  }
  processingAccept.add(key);

  try {
    const verifiedRoleId = guildConfig.getVerifiedRoleId(interaction.guild.id);
    await member.roles
      .remove(roleId)
      .catch((error) => console.error('Не удалось снять роль "не верифицирован":', error));
    if (verifiedRoleId) {
      await member.roles
        .add(verifiedRoleId)
        .catch((error) => console.error('Не удалось выдать роль "верифицирован":', error));
    }

    // Раньше nudge про /fav-game публично уходил в отдельный welcome-канал —
    // пользователь решил, что этот канал должен оставаться местом для
    // приветственных карточек, а не технических инструкций, видимых всем.
    // Теперь nudge — часть того же эфемерного ответа на клик, что и
    // подтверждение доступа: виден только самому участнику, не DM.
    await interaction.reply({
      content:
        'Добро пожаловать! Доступ к серверу открыт.\n\n' +
        'Расскажи, во что любишь играть, и получи тематическую роль — введи команду **/fav-game** и выбери одну ' +
        'или несколько своих любимых игр, я сам подберу роль.',
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    processingAccept.delete(key);
  }
}

module.exports = { setup, applyGateToNewChannel, assignUnverified, handleAccept, setAdminChannel, ACCEPT_CUSTOM_ID };
