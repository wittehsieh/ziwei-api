const fs = require('fs');
const path = require('path');
const { parseSections } = require('./parse');

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'knowledge');

function readFile(name) {
  return fs.readFileSync(path.join(KNOWLEDGE_DIR, name), 'utf8');
}

const PALACE_NAMES = [
  '命', '兄弟', '夫妻', '子女', '財帛', '疾厄',
  '遷移', '僕役', '官祿', '田宅', '福德', '父母',
];

// Hand-copied from 03_palaces_and_three_direction.md's "資料內容" table
// (a fixed naming table, not `## key` + `- field:` combo data -- not worth
// parsing out of prose). Order per palace: [本宮, 三方, 三方, 對宮].
const THREE_DIRECTION = {
  命: ['命', '財帛', '官祿', '遷移'],
  兄弟: ['兄弟', '疾厄', '田宅', '僕役'],
  夫妻: ['夫妻', '遷移', '福德', '官祿'],
  子女: ['子女', '父母', '僕役', '田宅'],
  財帛: ['財帛', '命', '官祿', '福德'],
  疾厄: ['疾厄', '兄弟', '父母', '田宅'],
  遷移: ['遷移', '夫妻', '福德', '命'],
  僕役: ['僕役', '子女', '兄弟', '父母'],
  官祿: ['官祿', '命', '財帛', '夫妻'],
  田宅: ['田宅', '兄弟', '子女', '疾厄'],
  福德: ['福德', '夫妻', '財帛', '遷移'],
  父母: ['父母', '疾厄', '子女', '僕役'],
};

function buildStarBasics() {
  const map = new Map();
  for (const file of ['01_stars_main_and_a.md', '02_stars_b_to_d.md']) {
    for (const { title, fields } of parseSections(readFile(file))) {
      if (title === 'Star Weight Levels') continue; // intro list, not a star entry
      if (Object.keys(fields).length === 0) continue;
      map.set(title, fields);
    }
  }
  return map;
}

function buildStarPalaceMatrix() {
  const map = new Map();
  for (const { title, fields } of parseSections(readFile('04_main_star_x_12_palaces.md'))) {
    if (!title.includes('×')) continue; // skip the file's intro paragraph section, if any
    const [star, palace] = title.split('×').map((s) => s.trim());
    map.set(`${star}×${palace}`, fields);
  }
  return map;
}

function buildDualStarCombos() {
  const map = new Map();
  for (const { title, fields } of parseSections(readFile('05_dual_star_combinations.md'))) {
    if (!title.includes('+')) continue; // skip 通用規則／研究參考／資料範圍
    const [a, b] = title.split('+').map((s) => s.trim());
    // Real charts can present either star first depending on how iztro
    // orders majorStars, so index both directions under the same entry.
    map.set(`${a}+${b}`, fields);
    map.set(`${b}+${a}`, fields);
  }
  return map;
}

function buildTransformationMaps() {
  const byStar = new Map();
  const byPalace = new Map();
  for (const { title, fields } of parseSections(readFile('06_four_transformations.md'))) {
    if (title.includes('+')) {
      const [star, transformation] = title.split('+').map((s) => s.trim());
      byStar.set(`${star}+${transformation}`, fields);
    } else if (title.includes('×')) {
      const [transformation, palace] = title.split('×').map((s) => s.trim());
      byPalace.set(`${transformation}×${palace}`, fields);
    }
  }
  return { transformationByStar: byStar, transformationByPalace: byPalace };
}

function buildPalaceMeanings() {
  const map = new Map();
  for (const { title, fields } of parseSections(readFile('03_palaces_and_three_direction.md'))) {
    if (!PALACE_NAMES.includes(title)) continue; // skip Structure/資料內容/解讀方式 etc.
    map.set(title, fields);
  }
  return map;
}

function buildDomainRecipes() {
  const map = new Map();
  for (const { title, fields } of parseSections(readFile('07_domain_recipes.md'))) {
    if (Object.keys(fields).length === 0) continue;
    map.set(title, fields);
  }
  return map;
}

const starBasics = buildStarBasics();
const starPalaceMatrix = buildStarPalaceMatrix();
const dualStarCombos = buildDualStarCombos();
const { transformationByStar, transformationByPalace } = buildTransformationMaps();
const palaceMeanings = buildPalaceMeanings();
const domainRecipes = buildDomainRecipes();

// 08/09/10 are methodology/rating-engine prose, not per-entry lookup data --
// read whole, appended into the system prompt as-is.
const methodologyNotes = [
  readFile('08_timing_and_rating.md'),
  readFile('09_methodology_and_sources.md'),
  readFile('10_sources_and_provenance.md'),
].join('\n\n---\n\n');

module.exports = {
  PALACE_NAMES,
  THREE_DIRECTION,
  starBasics,
  starPalaceMatrix,
  dualStarCombos,
  transformationByStar,
  transformationByPalace,
  palaceMeanings,
  domainRecipes,
  methodologyNotes,
};
