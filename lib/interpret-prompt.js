const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system-prompt.md'), 'utf8');

const SCOPE_LABELS = {
  natal: '本命',
  decadal: '大限',
  yearly: '流年',
  monthly: '流月',
  daily: '流日',
};

/**
 * @param {object} evidence - buildEvidence() output
 * @param {string} question - this turn's question
 * @param {Array<{role:'user'|'assistant', content:string}>} [history] - prior turns, caller-maintained
 * @returns {Array<{role:string, content:string}>} messages ready for the OpenAI chat API
 */
function buildMessages({ evidence, question, history = [] }) {
  const scopeLabel = evidence.isBroad
    ? '整體命盤／論命，依本命→大限→流年完整結構回答'
    : (SCOPE_LABELS[evidence.scope] || evidence.scope);
  const userContent = [
    `【本次問題】（${scopeLabel}）`,
    question,
    '',
    '【evidence】',
    '以下是依本次命盤與問題查出的相關宮位、星曜與組合資料，只能依此作答：',
    JSON.stringify(evidence, null, 2),
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userContent },
  ];
}

module.exports = { buildMessages, SYSTEM_PROMPT };
