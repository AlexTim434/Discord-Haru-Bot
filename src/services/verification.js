const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const guildConfig = require('./guildConfig');

const ACCEPT_CUSTOM_ID = 'verify-accept';
const UNVERIFIED_ROLE_NAME = 'Не верифицирован';
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

async function restrictChannel(channel, roleId) {
  if (!channel?.permissionOverwrites) return;
  try {
    await channel.permissionOverwrites.edit(roleId, { ViewChannel: false }, { reason: 'Гейт верификации' });
  } catch (error) {
    console.error(`Не удалось ограничить канал ${channel.name}:`, error);
  }
}

async function allowChannel(channel, roleId) {
  if (!channel?.permissionOverwrites) return;
  try {
    await channel.permissionOverwrites.edit(
      roleId,
      { ViewChannel: true },
      { reason: 'Гейт верификации: канал должен оставаться видимым' },
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
  const role = await ensureUnverifiedRole(guild);

  guildConfig.setGateChannel(guild.id, gateChannelId);
  guildConfig.setRulesChannel(guild.id, rulesChannelId);
  guildConfig.setRulesText(guild.id, rulesText);

  const excluded = new Set([gateChannelId, rulesChannelId]);
  const channels = await guild.channels.fetch();
  let restrictedCount = 0;
  for (const channel of channels.values()) {
    if (!channel || channel.type === ChannelType.GuildCategory) continue;

    if (excluded.has(channel.id)) {
      await allowChannel(channel, role.id);
      continue;
    }

    await restrictChannel(channel, role.id);
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

  return { restrictedCount, roleId: role.id };
}

async function applyGateToNewChannel(channel) {
  if (!channel.guild || channel.type === ChannelType.GuildCategory) return;
  const roleId = guildConfig.getUnverifiedRoleId(channel.guild.id);
  if (!roleId) return;

  const gateId = guildConfig.getGateChannelId(channel.guild.id);
  const rulesId = guildConfig.getRulesChannelId(channel.guild.id);
  if (channel.id === gateId || channel.id === rulesId) return;

  await restrictChannel(channel, roleId);
}

async function assignUnverified(member) {
  const roleId = guildConfig.getUnverifiedRoleId(member.guild.id);
  if (!roleId) return;
  await member.roles.add(roleId).catch((error) => console.error('Не удалось выдать роль "не верифицирован":', error));
}

async function handleAccept(interaction) {
  const member = interaction.member;
  const key = `${interaction.guild.id}:${member.id}`;

  if (processingAccept.has(key)) {
    await interaction.reply({ content: 'Секунду, уже обрабатываю твоё нажатие...', flags: MessageFlags.Ephemeral });
    return;
  }
  processingAccept.add(key);

  try {
    const roleId = guildConfig.getUnverifiedRoleId(interaction.guild.id);

    if (roleId && member.roles.cache.has(roleId)) {
      await member.roles
        .remove(roleId)
        .catch((error) => console.error('Не удалось снять роль "не верифицирован":', error));

      const welcomeChannelId = guildConfig.getWelcomeChannelId(interaction.guild.id);
      const welcomeChannel = welcomeChannelId
        ? await interaction.guild.channels.fetch(welcomeChannelId).catch(() => null)
        : null;

      if (welcomeChannel) {
        await welcomeChannel.send(
          `${member}, расскажи, во что любишь играть, и получи тематическую роль на сервере.\n\n` +
            'Введи команду **/fav-game** и выбери одну или несколько своих любимых игр — я сам подберу роль.',
        );
      }
    }

    await interaction.reply({ content: 'Добро пожаловать! Доступ к серверу открыт.', flags: MessageFlags.Ephemeral });
  } finally {
    processingAccept.delete(key);
  }
}

module.exports = { setup, applyGateToNewChannel, assignUnverified, handleAccept, ACCEPT_CUSTOM_ID };
