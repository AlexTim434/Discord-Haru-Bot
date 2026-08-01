const groq = require('./groq');

const MAX_ROLE_NAME_LENGTH = 100;

function sanitizeRoleName(name) {
  return name
    .replace(/["'«»`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ROLE_NAME_LENGTH);
}

async function generateSingleRoleName(gameName, description) {
  const messages = [
    {
      role: 'system',
      content:
        'Ты придумываешь короткие атмосферные названия ролей на Discord-сервере для фанатов конкретной игры. ' +
        'Название должно быть на русском языке, отражать сеттинг/тематику игры, звучать как звание, титул или прозвище, ' +
        'а не быть буквальным названием игры. Примеры хорошего стиля: "Нелегальный гонщик" (для гоночной игры), ' +
        '"Магистр джедай" (для Star Wars). Ответь ТОЛЬКО названием роли, без кавычек и пояснений, не длиннее 6 слов.',
    },
    {
      role: 'user',
      content: `Игра: ${gameName}${description ? `\nОписание: ${description}` : ''}`,
    },
  ];

  try {
    const raw = await groq.chat(messages);
    const cleaned = sanitizeRoleName(raw);
    return cleaned || `Фанат ${gameName}`.slice(0, MAX_ROLE_NAME_LENGTH);
  } catch (error) {
    console.error(`Не удалось сгенерировать название роли для "${gameName}":`, error);
    return `Фанат ${gameName}`.slice(0, MAX_ROLE_NAME_LENGTH);
  }
}

async function generateRankNames(gameName, description, levels) {
  const messages = [
    {
      role: 'system',
      content:
        'Ты придумываешь тематическую лестницу воинских/фракционных званий на русском языке для ранговой системы ' +
        'на Discord-сервере, посвящённой конкретной игре. Ранги должны звучать атмосферно и соответствовать сеттингу игры, ' +
        'идти от самого младшего к самому старшему. Ответь СТРОГО в виде JSON-массива строк без каких-либо пояснений, ' +
        `ровно ${levels} элементов, от младшего звания к старшему.`,
    },
    {
      role: 'user',
      content: `Игра: ${gameName}${description ? `\nОписание: ${description}` : ''}\nКоличество рангов: ${levels}`,
    },
  ];

  const raw = await groq.chat(messages);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Не удалось распознать JSON-массив в ответе Groq: ${raw}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length !== levels) {
    throw new Error(`Groq вернул ${parsed?.length ?? '?'} рангов вместо ${levels}`);
  }

  return parsed.map((name) => sanitizeRoleName(String(name)));
}

module.exports = { generateSingleRoleName, generateRankNames };
