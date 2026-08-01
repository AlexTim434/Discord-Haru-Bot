const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const auras = require('./auras');
const auraPicker = require('./auraPicker');
const roleNameGenerator = require('./roleNameGenerator');
const { makeCircleSwatchPng } = require('../utils/pngSwatch');

const HUE_SELECT_ID = 'add-aura-hue';
const SHADE_SELECT_PREFIX = 'add-aura-shade:';

// Discord не даёт настоящей "пипетки" — ни слайдера, ни цветового круга,
// только кнопки/select-меню. Компромисс: выбор оттенка, потом выбор
// насыщенности внутри него (12 оттенков × 5 уровней = 60 цветов без единого
// ввода HEX вручную), в духе одноразового кастомного customId у
// verify-setup-модалки — состояние (выбранный оттенок) кодируется в самом
// customId второго меню, отдельное хранилище не нужно.
const SHADE_LABELS = ['Светлый', 'Приглушённый', 'Средний', 'Насыщенный', 'Тёмный'];

const HUES = {
  red: { label: 'Красный', shades: ['#FFCDD2', '#EF5350', '#E53935', '#C62828', '#7F0000'] },
  orange: { label: 'Оранжевый', shades: ['#FFE0B2', '#FFA726', '#FB8C00', '#E65100', '#8C4A00'] },
  amber: { label: 'Янтарный', shades: ['#FFECB3', '#FFCA28', '#FFB300', '#FF8F00', '#8C5A00'] },
  yellow: { label: 'Жёлтый', shades: ['#FFF9C4', '#FFEE58', '#FDD835', '#F9A825', '#8C6D00'] },
  lime: { label: 'Лаймовый', shades: ['#F0F4C3', '#D4E157', '#C0CA33', '#9E9D24', '#5C6613'] },
  green: { label: 'Зелёный', shades: ['#C8E6C9', '#66BB6A', '#43A047', '#2E7D32', '#1B4D20'] },
  teal: { label: 'Бирюзовый', shades: ['#B2DFDB', '#4DB6AC', '#00897B', '#00695C', '#003D33'] },
  cyan: { label: 'Голубой', shades: ['#B3E5FC', '#4FC3F7', '#039BE5', '#0277BD', '#01364D'] },
  blue: { label: 'Синий', shades: ['#BBDEFB', '#5C9CE6', '#1E63C4', '#154A94', '#0B2952'] },
  indigo: { label: 'Индиго', shades: ['#C5CAE9', '#7986CB', '#3F51B5', '#283593', '#131A4D'] },
  purple: { label: 'Фиолетовый', shades: ['#E1BEE7', '#AB47BC', '#8E24AA', '#6A1B9A', '#3B0F57'] },
  pink: { label: 'Розовый', shades: ['#F8BBD0', '#F06292', '#D81B60', '#AD1457', '#650B33'] },
  gray: { label: 'Серый', shades: ['#F5F5F5', '#BDBDBD', '#757575', '#424242', '#0D0D0D'] },
};

// "Средний" — представитель оттенка на первом шаге (превью для всей группы).
const HUE_PREVIEW_SHADE_INDEX = 2;

// Discord не рендерит role.color прямо в select-меню, а обычные Unicode-эмодзи
// дают только ~9 цветов и не различают оттенки внутри одного цвета — поэтому
// точные превью делаем через emoji ПРИЛОЖЕНИЯ бота (не сервера — не тратит
// ограниченные 50 слотов гильдии), по одному круглому PNG-кружку на каждый
// из 65 HEX. Создаются один раз при старте (warmupSwatchEmojis), дальше
// переиспользуются между рестартами — ищем по имени перед созданием.
//
// Префикс "swc_" (было "sw_" для первой, квадратной версии, см. историю) —
// смена префикса при переходе на круглые превью заставляет warmup создать их
// заново вместо переиспользования старых квадратных картинок; заодно чистим
// старые "sw_"-эмодзи, чтобы они не висели неиспользуемыми в списке приложения.
const SWATCH_PREFIX = 'swc_';
const LEGACY_SWATCH_PREFIX = 'sw_';
const swatchEmojis = new Map(); // hex -> {id, name}

function swatchEmojiName(hex) {
  return `${SWATCH_PREFIX}${hex.replace('#', '').toLowerCase()}`;
}

function allSwatchHexes() {
  const hexes = new Set();
  for (const hue of Object.values(HUES)) {
    for (const hex of hue.shades) hexes.add(hex);
  }
  return hexes;
}

async function warmupSwatchEmojis(client) {
  const existing = await client.application.emojis.fetch();
  const byName = new Map([...existing.values()].map((emoji) => [emoji.name, emoji]));

  const legacy = [...existing.values()].filter((emoji) => emoji.name.startsWith(LEGACY_SWATCH_PREFIX));
  for (const emoji of legacy) {
    try {
      await client.application.emojis.delete(emoji);
    } catch (error) {
      console.error(`Не удалось удалить устаревший эмодзи-образец ${emoji.name}:`, error);
    }
  }
  if (legacy.length) console.log(`Удалено устаревших (квадратных) эмодзи-образцов: ${legacy.length}`);

  for (const hex of allSwatchHexes()) {
    const name = swatchEmojiName(hex);
    let emoji = byName.get(name);
    if (!emoji) {
      try {
        emoji = await client.application.emojis.create({ attachment: makeCircleSwatchPng(hex), name });
      } catch (error) {
        console.error(`Не удалось создать эмодзи-образец цвета для ${hex}:`, error);
        continue;
      }
    }
    swatchEmojis.set(hex, { id: emoji.id, name: emoji.name });
  }
}

function swatchEmoji(hex) {
  return swatchEmojis.get(hex);
}

function buildHueSelectPayload() {
  const select = new StringSelectMenuBuilder()
    .setCustomId(HUE_SELECT_ID)
    .setPlaceholder('Выбери оттенок')
    .addOptions(
      Object.entries(HUES).map(([key, hue]) => {
        const option = { label: hue.label, value: key };
        const emoji = swatchEmoji(hue.shades[HUE_PREVIEW_SHADE_INDEX]);
        if (emoji) option.emoji = emoji;
        return option;
      }),
    );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Новая аура — шаг 1 из 2')
    .setDescription(
      'Выбери оттенок цвета. На следующем шаге уточнишь насыщенность, а название придумает ИИ.',
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function buildShadeSelectPayload(hueKey) {
  const hue = HUES[hueKey];
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${SHADE_SELECT_PREFIX}${hueKey}`)
    .setPlaceholder('Выбери насыщенность')
    .addOptions(
      hue.shades.map((hex, i) => {
        const option = { label: SHADE_LABELS[i], description: hex, value: hex };
        const emoji = swatchEmoji(hex);
        if (emoji) option.emoji = emoji;
        return option;
      }),
    );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Новая аура — шаг 2 из 2')
    .setDescription(`Оттенок: **${hue.label}**. Теперь выбери насыщенность.`);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

async function handleHueSelect(interaction) {
  const hueKey = interaction.values[0];
  if (!HUES[hueKey]) return;
  await interaction.update(buildShadeSelectPayload(hueKey));
}

async function handleShadeSelect(interaction) {
  const hueKey = interaction.customId.slice(SHADE_SELECT_PREFIX.length);
  const hex = interaction.values[0];
  const hue = HUES[hueKey];

  await interaction.update({
    embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription('Генерирую название ауры...')],
    components: [],
  });

  const existingNames = auras.listAll().map((a) => a.name);
  const name = await roleNameGenerator.generateAuraName(hex, hue?.label, existingNames);

  const role = await auras.addAura(interaction.guild, name, hex);
  await auraPicker.publish(interaction.guild);

  await interaction.editReply({
    content: `Готово! Новая аура ${role} создана и опубликована.`,
    embeds: [],
    components: [],
  });
}

module.exports = {
  HUE_SELECT_ID,
  SHADE_SELECT_PREFIX,
  buildHueSelectPayload,
  handleHueSelect,
  handleShadeSelect,
  warmupSwatchEmojis,
};
