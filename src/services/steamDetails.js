const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';

async function fetchShortDescription(appid) {
  if (!appid) return null;

  try {
    const res = await fetch(`${APP_DETAILS_URL}?appids=${appid}&l=russian`);
    if (!res.ok) return null;

    const data = await res.json();
    const entry = data[String(appid)];
    if (!entry?.success) return null;

    const raw = entry.data?.short_description ?? '';
    const clean = raw.replace(/<[^>]*>/g, '').trim();
    return clean || null;
  } catch (error) {
    console.error(`Не удалось получить описание Steam для appid=${appid}:`, error);
    return null;
  }
}

module.exports = { fetchShortDescription };
