export const wuccPositionTitles = [
  'Governor',
  'Deputy Governor',
  'General Secretary',
  'Assistant General Secretary',
  'Financial Secretary',
  'Public Relations Officer',
  'Director of Welfare',
  'Director of Health',
  'Director of Sports',
  'Director of Socials'
];

export const wuccPositionSlugs = [
  'governor',
  'deputy-governor',
  'gsec',
  'agsec',
  'fsec',
  'pro',
  'dwelfare',
  'dhealth',
  'dsport',
  'dsocials'
];

export function normalizePositionTitle(title) {
  return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getWuccPositionTitle(position) {
  const slugIndex = wuccPositionSlugs.indexOf(position?.slug);
  if (slugIndex >= 0) return wuccPositionTitles[slugIndex];

  const displayIndex = Number(position?.display_order || 0) - 1;
  if (displayIndex >= 0 && displayIndex < wuccPositionTitles.length) {
    return wuccPositionTitles[displayIndex];
  }

  return position?.title || 'WUCC Position';
}

export function sortWuccPositions(positions) {
  const order = new Map(wuccPositionTitles.map((title, index) => [normalizePositionTitle(title), index]));
  return [...positions].sort((a, b) => {
    const aOrder = order.get(normalizePositionTitle(getWuccPositionTitle(a))) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(normalizePositionTitle(getWuccPositionTitle(b))) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || Number(a.display_order || 0) - Number(b.display_order || 0);
  });
}
