/**
 * Ziwei chart computation, ported unchanged from the web app's server-side
 * logic (docs/index.html's computeAstrolabe/simplifyAstrolabe/
 * simplifyHoroscopeItem/formatChartText). No changes to the chart engine
 * itself -- only what feeds into iztro's existing `hour` parameter.
 */
const { astro } = require('iztro');

const HOUR_OPTIONS = [
  { value: 0, branch: '早子', range: '00:00–01:00' },
  { value: 1, branch: '丑', range: '01:00–03:00' },
  { value: 2, branch: '寅', range: '03:00–05:00' },
  { value: 3, branch: '卯', range: '05:00–07:00' },
  { value: 4, branch: '辰', range: '07:00–09:00' },
  { value: 5, branch: '巳', range: '09:00–11:00' },
  { value: 6, branch: '午', range: '11:00–13:00' },
  { value: 7, branch: '未', range: '13:00–15:00' },
  { value: 8, branch: '申', range: '15:00–17:00' },
  { value: 9, branch: '酉', range: '17:00–19:00' },
  { value: 10, branch: '戌', range: '19:00–21:00' },
  { value: 11, branch: '亥', range: '21:00–23:00' },
  { value: 12, branch: '晚子', range: '23:00–00:00' },
];

const SCOPE_CONFIG = {
  decadal: { label: '大限' },
  yearly: { label: '流年' },
  monthly: { label: '流月' },
  daily: { label: '流日' },
};
const MUTAGEN_LABELS = ['祿', '權', '科', '忌'];

function mapStar(star) {
  return {
    name: star.name,
    brightness: star.brightness || null,
    mutagen: star.mutagen || null,
  };
}

function simplifyAstrolabe(astrolabe) {
  return {
    gender: astrolabe.gender,
    solarDate: astrolabe.solarDate,
    lunarDate: astrolabe.lunarDate,
    chineseDate: astrolabe.chineseDate,
    zodiac: astrolabe.zodiac,
    sign: astrolabe.sign,
    fiveElementsClass: astrolabe.fiveElementsClass,
    soul: astrolabe.soul,
    body: astrolabe.body,
    palaces: astrolabe.palaces.map((palace) => ({
      index: palace.index,
      name: palace.name,
      isBodyPalace: palace.isBodyPalace,
      isOriginalPalace: palace.isOriginalPalace,
      heavenlyStem: palace.heavenlyStem,
      earthlyBranch: palace.earthlyBranch,
      decadalRange: palace.decadal ? palace.decadal.range : null,
      majorStars: (palace.majorStars || []).map(mapStar),
      minorStars: (palace.minorStars || []).map((s) => s.name),
      adjectiveStars: (palace.adjectiveStars || []).map((s) => s.name),
    })),
  };
}

function simplifyHoroscopeItem(item) {
  return {
    heavenlyStem: item.heavenlyStem,
    earthlyBranch: item.earthlyBranch,
    index: item.index,
    palaceNames: item.palaceNames,
    mutagen: item.mutagen,
    stars: (item.stars || []).map((palaceStars) => palaceStars.map(mapStar)),
  };
}

function computeAstrolabe({ dateType, date, hour, gender, isLeapMonth, useTrueSolarTime, lang }) {
  return dateType === 'lunar'
    ? astro.byLunar(date, hour, gender, isLeapMonth, useTrueSolarTime, lang)
    : astro.bySolar(date, hour, gender, useTrueSolarTime, lang);
}

function simplifyAllHoroscopes(horoscopeRaw) {
  return {
    decadal: simplifyHoroscopeItem(horoscopeRaw.decadal),
    yearly: simplifyHoroscopeItem(horoscopeRaw.yearly),
    monthly: simplifyHoroscopeItem(horoscopeRaw.monthly),
    daily: simplifyHoroscopeItem(horoscopeRaw.daily),
  };
}

/** Chart + all four horoscope scopes as plain text, same format as the web app's one-click-copy. */
function formatChartText(astrolabe, horoscope) {
  const lines = [];
  lines.push('【本命】');

  (astrolabe.palaces || []).forEach((palace) => {
    const major = (palace.majorStars || [])
      .map((s) => `${s.name}${s.brightness ? `(${s.brightness})` : ''}${s.mutagen ? `[化${s.mutagen}]` : ''}`)
      .join('、');
    const minor = (palace.minorStars || []).join('、');
    const adjective = (palace.adjectiveStars || []).join('、');

    lines.push(`${palace.name}${palace.isBodyPalace ? '（身宮）' : ''}　${palace.heavenlyStem || ''}${palace.earthlyBranch || ''}`);
    if (major) lines.push(`  主星：${major}`);
    if (minor) lines.push(`  副星：${minor}`);
    if (adjective) lines.push(`  雜曜：${adjective}`);
  });

  lines.push('');
  lines.push('【運限】');

  ['decadal', 'yearly', 'monthly', 'daily'].forEach((scope) => {
    const item = horoscope[scope];
    if (!item) return;
    const cfg = SCOPE_CONFIG[scope];
    const mutagenText = (item.mutagen || [])
      .map((name, i) => `${name}${MUTAGEN_LABELS[i] || ''}`)
      .join('、');
    let ageRangeText = '';
    if (scope === 'decadal') {
      const decadalPalace = (astrolabe.palaces || []).find((p) => p.index === item.index);
      if (decadalPalace && decadalPalace.decadalRange) {
        ageRangeText = `　${decadalPalace.decadalRange[0]}-${decadalPalace.decadalRange[1]}歲`;
      }
    }

    lines.push(`${cfg.label}（${item.heavenlyStem || ''}${item.earthlyBranch || ''}${ageRangeText}）四化：${mutagenText}`);

    (item.palaceNames || []).forEach((name, idx) => {
      const palace = (astrolabe.palaces || []).find((p) => p.index === idx);
      const stemBranch = palace ? `${palace.heavenlyStem || ''}${palace.earthlyBranch || ''}` : '';
      const starsForPalace = (item.stars && item.stars[idx]) || [];
      const starsText = starsForPalace
        .map((s) => `${s.name}${s.mutagen ? `[${s.mutagen}]` : ''}`)
        .join('、');

      lines.push(`  ${stemBranch}　${cfg.label}${name}${starsText ? `　流耀：${starsText}` : ''}`);
    });
    lines.push('');
  });

  return lines.join('\n').trim();
}

module.exports = {
  HOUR_OPTIONS,
  computeAstrolabe,
  simplifyAstrolabe,
  simplifyHoroscopeItem,
  simplifyAllHoroscopes,
  formatChartText,
};
