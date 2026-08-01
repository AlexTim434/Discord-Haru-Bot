const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-verification')
    .setDescription('[Админ] Настроить гейт верификации (приветствие + правила)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addChannelOption((option) =>
      option
        .setName('gate-channel')
        .setDescription('Канал приветствия (виден до принятия правил)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('rules-channel')
        .setDescription('Канал с правилами (виден до принятия правил)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),
  async execute(interaction) {
    const gateChannel = interaction.options.getChannel('gate-channel');
    const rulesChannel = interaction.options.getChannel('rules-channel');

    const modal = new ModalBuilder()
      .setCustomId(`verify-setup:${gateChannel.id}:${rulesChannel.id}`)
      .setTitle('Текст правил сервера');

    const textInput = new TextInputBuilder()
      .setCustomId('rules-text')
      .setLabel('Правила (можно несколько строк)')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(4000)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await interaction.showModal(modal);
  },
};
