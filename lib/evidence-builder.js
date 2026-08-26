/**
 * Deterministic evidence assembly: given a computed astrolabe/horoscope and
 * the user's current question, decide exactly which knowledge/*.md entries
 * are relevant -- so the LLM only has to write up evidence we've already
 * looked up, instead of guessing which knowledge to recall (the problem
 * with relying on ChatGPT's own file-search retrieval over this same
 * knowledge base).
 */
const {
  PALACE_NAMES,
  THREE_DIRECTION,
  starBasics,
  starPalaceMatrix,
  dualStarCombos,
  transformationByStar,
  transformationByPalace,
  palaceMeanings,
  domainRecipes,
} = require('./knowledge');

const MUTAGEN_LABELS = ['祿', '權', '科', '忌'];

// iztro names the life palace "命宮" (with the 宮 suffix) but leaves every
// other palace bare ("財帛", "官祿", ...); the knowledge base uses the bare
// form ("命") for all twelve, so normalize before any lookup/comparison.
function normalizePalaceName(name) {
  return name === '命宮' ? '命' : name;
}

function findPalace(astrolabe, palaceName) {
  return astrolabe.palaces.find((p) => normalizePalaceName(p.name) === palaceName);
}

const DOMAIN_KEYWORDS = {
  mindset: ['心情', '心態', '情緒', '想法', '自我認知', '個性'],
  career: ['工作', '事業', '職業', '升遷', '跳槽', '換工作', '職場', '創業', '老闆'],
  finance: ['財運', '錢', '收入', '投資', '理財', '存錢', '資產', '財務', '買房', '負債'],
  relationship: ['感情', '戀愛', '交往', '伴侶', '結婚', '婚姻', '分手', '對象', '桃花', '另一半'],
  health: ['健康', '身體', '壓力', '睡眠', '生病', '精神狀況'],
  family: ['家庭', '父母', '小孩', '子女', '家人', '親子'],
};

function detectDomains(question) {
  if (!question) return [];
  return Object.keys(DOMAIN_KEYWORDS).filter((domain) =>
    DOMAIN_KEYWORDS[domain].some((kw) => question.includes(kw))
  );
}

function detectExplicitPalaces(question) {
  if (!question) return [];
  // "命" 是單字，容易在「命盤」「算命」「命理」等常見詞裡誤判成指名命宮；
  // 其餘十一個宮位都是不容易誤觸的雙字詞，可以直接比對子字串。
  return PALACE_NAMES.filter((p) => (p === '命' ? question.includes('命宮') : question.includes(p)));
}

// 問題若明確點出某個時間顆粒度（今天／這個月／今年／大限），直接對應到那一層；
// 只有「運勢」「最近」這類沒指定顆粒度的籠統說法，才退而求其次預設用流年代表
// 「現在」。這套判斷同時用在廣泛問題和聚焦問題上 -- 例如「我今年適合談戀愛嗎」
// 雖然命中了 relationship 領域（聚焦問題），但問題裡的「今年」還是要能讓它拿到
// 流年（＋大限脈絡）資料，不能因為是聚焦問題就只看呼叫端有沒有明確傳 scope。
const SPECIFIC_LAYER_KEYWORDS = {
  daily: ['今天', '明天', '今日', '明日', '這幾天'],
  monthly: ['這個月', '下個月', '本月', '這月'],
  yearly: ['今年', '明年', '去年', '流年'],
  decadal: ['大限', '大運', '這十年', '未來十年'],
};
const GENERIC_TIMING_KEYWORDS = ['運勢', '運氣', '運程', '最近', '近期', '這陣子', '這段時間', '接下來', '決策', '決定'];

function detectRequestedTimeLayer(question) {
  if (!question) return null;
  for (const layer of ['daily', 'monthly', 'yearly', 'decadal']) {
    if (SPECIFIC_LAYER_KEYWORDS[layer].some((kw) => question.includes(kw))) return layer;
  }
  if (GENERIC_TIMING_KEYWORDS.some((kw) => question.includes(kw))) return 'yearly';
  return null;
}

// 時間層彼此有從屬關係（本命→大限→流年→流月→流日），任何一層都不能脫離它的上層
// 單獨解讀（見 3.10）。所以請求某一層時，自動把它的上層也一併附上 -- 例如問「今年
// 運勢」只會直接命中 yearly，但流年必須放在大限的脈絡下解讀，所以也要附上 decadal。
const LAYER_ANCESTORS = {
  decadal: [],
  yearly: ['decadal'],
  monthly: ['decadal', 'yearly'],
  daily: ['decadal', 'yearly', 'monthly'],
};
const LAYER_ORDER = ['decadal', 'yearly', 'monthly', 'daily'];

function expandLayersWithAncestors(layers) {
  const set = new Set();
  for (const layer of layers) {
    (LAYER_ANCESTORS[layer] || []).forEach((ancestor) => set.add(ancestor));
    set.add(layer);
  }
  return LAYER_ORDER.filter((layer) => set.has(layer));
}

function findNatalPalaceOfStar(astrolabe, starName) {
  return astrolabe.palaces.find((p) =>
    (p.majorStars || []).some((s) => s.name === starName) ||
    (p.minorStars || []).includes(starName)
  );
}

function buildStarEvidence(starName, palaceName, brightness, natalMutagen) {
  const entry = {
    name: starName,
    brightness: brightness || null,
    basics: starBasics.get(starName) || null,
    palaceCombo: starPalaceMatrix.get(`${starName}×${palaceName}`) || null,
  };
  if (natalMutagen) {
    entry.natalMutagen = natalMutagen;
    entry.transformationCombo = transformationByStar.get(`${starName}+化${natalMutagen}`) || null;
  }
  return entry;
}

function buildPalaceEvidence(astrolabe, palaceName, roles) {
  const palace = findPalace(astrolabe, palaceName);
  if (!palace) return null;

  const majorStars = palace.majorStars || [];
  const stars = majorStars.map((s) => buildStarEvidence(s.name, palaceName, s.brightness, s.mutagen));

  let dualStarCombo = null;
  if (majorStars.length === 2) {
    dualStarCombo = dualStarCombos.get(`${majorStars[0].name}+${majorStars[1].name}`) || null;
  }

  return {
    palace: palaceName,
    roles, // ['本宮'] / ['三方'] / ['對宮'] / ['次要'] -- 供 LLM 判斷影響力層級（本宮>對宮>三方，見 03 的「解讀方式」）
    heavenlyStem: palace.heavenlyStem,
    earthlyBranch: palace.earthlyBranch,
    isBodyPalace: palace.isBodyPalace,
    meaning: palaceMeanings.get(palaceName) || null,
    majorStars: stars,
    minorStars: palace.minorStars || [],
    adjectiveStars: palace.adjectiveStars || [],
    dualStarCombo,
  };
}

function buildHoroscopeEvidence(astrolabe, item, relevantPalaceNames) {
  const ownPalaceLabelForRelevant = {};
  (item.palaceNames || []).forEach((label, idx) => {
    const natalPalace = astrolabe.palaces.find((p) => p.index === idx);
    if (!natalPalace) return;
    const normalized = normalizePalaceName(natalPalace.name);
    if (relevantPalaceNames.includes(normalized)) {
      ownPalaceLabelForRelevant[normalized] = label;
    }
  });

  const mutagenStars = (item.mutagen || []).map((starName, i) => {
    const label = MUTAGEN_LABELS[i];
    const natalPalaceRaw = findNatalPalaceOfStar(astrolabe, starName);
    const natalPalace = natalPalaceRaw ? normalizePalaceName(natalPalaceRaw.name) : null;
    return {
      star: starName,
      mutagen: label,
      natalPalace,
      isInRelevantPalace: natalPalace ? relevantPalaceNames.includes(natalPalace) : false,
      transformationByStar: transformationByStar.get(`${starName}+化${label}`) || null,
      transformationByPalace: natalPalace
        ? transformationByPalace.get(`化${label}×${natalPalace}`) || null
        : null,
    };
  });

  return {
    heavenlyStem: item.heavenlyStem,
    earthlyBranch: item.earthlyBranch,
    ownPalaceLabelForRelevant,
    mutagenStars,
  };
}

/**
 * @param {object} astrolabe - simplifyAstrolabe() output
 * @param {object} [horoscope] - simplifyAllHoroscopes() output; only needed for a
 *   focused question whose `scope` isn't 'natal', or for a broad/general question
 *   that also mentions timing/fortune (pulls in decadal + yearly when available)
 * @param {'natal'|'decadal'|'yearly'|'monthly'|'daily'} [scope] - only consulted
 *   for focused questions; broad questions ignore it and decide purely from
 *   whether the question itself mentions timing/fortune
 * @param {string} question - this turn's question (re-evaluated every call, never cached across turns)
 * @param {{solarDate:string,lunarDate:string}} [horoscopeAsOf] - the actual calendar
 *   date the horoscope layers were computed for (resolveChartInput's return value),
 *   so "today/this year/next year" language in the answer is grounded to a real date
 *   instead of the LLM guessing what "now" means
 */
function buildEvidence({ astrolabe, horoscope, scope = 'natal', question, horoscopeAsOf = null }) {
  const explicitPalaces = detectExplicitPalaces(question);
  const explicitDomains = detectDomains(question);
  // 問題沒有命中任何特定領域關鍵字、也沒指名特定宮位 -- 視為「整體命盤/整體個性」
  // 這類廣泛問題（例如「幫我看看我的命盤」「論命」），六大面向（心態／工作／財運／
  // 健康／伴侶／子女父母）全部展開；問題若聚焦在特定領域（例如「換工作好嗎」），
  // 則只展開該領域。
  const isBroad = explicitDomains.length === 0 && explicitPalaces.length === 0;
  const domainsHit = isBroad ? Object.keys(DOMAIN_KEYWORDS) : explicitDomains;

  const primaryPalaces = new Set(explicitPalaces);
  const secondaryPalaces = new Set();
  const domainRecipesHit = [];

  for (const domain of domainsHit) {
    const recipe = domainRecipes.get(domain);
    if (!recipe) continue;
    domainRecipesHit.push({ domain, ...recipe });
    (recipe.primary || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((p) => primaryPalaces.add(p));
    (recipe.secondary || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((p) => secondaryPalaces.add(p));
  }

  if (primaryPalaces.size === 0 && secondaryPalaces.size === 0) {
    primaryPalaces.add('命');
  }

  // 三方四正只展開「本宮」（依 03 的定義，三方四正是圍繞單一本宮的支援結構），
  // 次要宮位（domain recipe 的 secondary）本身已是策展過的清單，不再逐一展開。
  const palaceRoles = new Map();
  const addRole = (name, role) => {
    if (!palaceRoles.has(name)) palaceRoles.set(name, new Set());
    palaceRoles.get(name).add(role);
  };

  for (const p of primaryPalaces) {
    addRole(p, '本宮');
    const group = THREE_DIRECTION[p];
    if (group) {
      const [, trine1, trine2, opposite] = group;
      addRole(trine1, '三方');
      addRole(trine2, '三方');
      addRole(opposite, '對宮');
    }
  }
  for (const p of secondaryPalaces) {
    if (!palaceRoles.has(p)) addRole(p, '次要');
  }

  const relevantPalaceNames = Array.from(palaceRoles.keys());
  const palaces = relevantPalaceNames
    .map((name) => buildPalaceEvidence(astrolabe, name, Array.from(palaceRoles.get(name))))
    .filter(Boolean);

  const evidence = { scope, question, isBroad, horoscopeAsOf, domainRecipesHit, palaces, horoscopeLayers: {} };

  // 呼叫端明確傳入非 natal 的 scope，代表呼叫端已經知道這是時間相關的問題（例如
  // 前端某個「看流年」按鈕），這個訊號比關鍵字判斷更可靠，一律優先採用；只有呼叫端
  // 留給預設值 'natal' 時，才靠問題文字判斷要不要補上時間層 -- 不論是廣泛問題還是
  // 聚焦問題都適用同一套判斷（例如「我今年適合談戀愛嗎」雖然聚焦 relationship
  // 領域，問題裡的「今年」還是要能讓它拿到流年＋大限資料）。
  const inferredLayer = detectRequestedTimeLayer(question);
  const requestedLayers = scope !== 'natal'
    ? [scope]
    : (inferredLayer ? [inferredLayer] : []);
  const layersToInclude = expandLayersWithAncestors(requestedLayers);
  for (const layer of layersToInclude) {
    if (!horoscope || !horoscope[layer]) {
      if (scope === 'natal') continue; // 沒有明確要求時間層、也沒有 horoscope 資料 -- 退回只做本命分析，不報錯
      throw new Error(`scope="${layer}" 需要提供 horoscope.${layer} 資料`);
    }
    evidence.horoscopeLayers[layer] = buildHoroscopeEvidence(astrolabe, horoscope[layer], relevantPalaceNames);
  }

  return evidence;
}

module.exports = { buildEvidence, detectDomains, detectExplicitPalaces };
