const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const auras = require('./auras');
const guildConfig = require('./guildConfig');

const SELECT_CUSTOM_ID = 'aura-select';

function buildComponents(auraList) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(SELECT_CUSTOM_ID)
    .setPlaceholder('Выбери свою ауру')
    .addOptions(auraList.map((aura) => ({ label: aura.name, value: aura.roleId })));

  return [new ActionRowBuilder().addComponents(select)];
}

function buildEmbed(auraList) {
  const lines = auraList.map((aura) => `<@&${aura.roleId}>`).join('\n');
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Выбери себе ауру')
    .setDescription(
      `Выбери цвет ника в списке ниже. Можно менять в любое время — старая аура снимается автоматически.\n\n${lines}`,
    )
    .setTimestamp();
}

async function publish(guild) {
  const auraList = await auras.ensureSeeded(guild);
  const channelId = guildConfig.getAuraChannelId(guild.id);
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const payload = { embeds: [buildEmbed(auraList)], components: buildComponents(auraList) };
  const messageId = guildConfig.getAuraMessageId(guild.id);

  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      return;
    }
  }

  const sent = await channel.send(payload);
  guildConfig.setAuraMessageId(guild.id, sent.id);
}

async function handleSelect(interaction) {
  const selectedRoleId = interaction.values[0];
  const allAuraRoleIds = auras.getAllRoleIds();
  const member = interaction.member;

  const rolesToRemove = allAuraRoleIds.filter((id) => id !== selectedRoleId && member.roles.cache.has(id));
  if (rolesToRemove.length) {
    await member.roles.remove(rolesToRemove);
  }
  await member.roles.add(selectedRoleId);

  const role = interaction.guild.roles.cache.get(selectedRoleId);
  await interaction.reply({
    content: `Готово! Твоя аура теперь — ${role ? role.name : 'выбрана'}.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { publish, handleSelect, SELECT_CUSTOM_ID };
