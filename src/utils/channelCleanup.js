// Общий помощник для сеттеров каналов (роль/ростер/аура/правила) — при
// повторном вызове сеттера старое сервисное сообщение раньше оставалось
// висеть в прежнем канале (или в том же канале, если messageId просто
// обнулялся) и админу приходилось чистить его руками. Вызывать ДО того, как
// сеттер в guildConfig обнулит messageId — иначе старый ID уже потерян.
async function deleteChannelMessage(guild, channelId, messageId) {
  if (!channelId || !messageId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  await message.delete().catch((error) => console.error(`Не удалось удалить старое сообщение в #${channel.name}:`, error));
}

module.exports = { deleteChannelMessage };
