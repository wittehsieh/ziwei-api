process.env.TZ = 'UTC';

const { resolveChartInput, ChartInputError } = require('../lib/resolve-chart-input');
const { resolveTargetDateFromQuestion } = require('../lib/resolve-target-date');
const { buildEvidence } = require('../lib/evidence-builder');
const { buildMessages } = require('../lib/interpret-prompt');
const { callLlm, LlmError } = require('../lib/llm-client');

const VALID_SCOPES = ['natal', 'decadal', 'yearly', 'monthly', 'daily'];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function usage() {
  return {
    usage: 'POST /api/interpret',
    body: {
      '(命盤來源，二選一)': null,
      astrolabe: '已算好的本命盤（例如先呼叫過 /api/chart 拿到的 astrolabe），與 horoscope 一起提供',
      horoscope: '已算好的 { decadal, yearly, monthly, daily }，與 astrolabe 一起提供',
      chartInput: '只有出生資料時提供，格式與 POST /api/chart 的 body 完全相同，這支 API 會自己排盤',
      question: '這一輪的問題（必填）',
      history: '先前對話紀錄 [{role:"user"|"assistant", content:string}]，由呼叫端保存並每次帶入；本 API 不儲存任何對話狀態（選填，預設空陣列）',
      scope: `'natal'|'decadal'|'yearly'|'monthly'|'daily'，預設 'natal'；除 natal 外都需要 horoscope 或 chartInput 已包含對應時間層資料`,
    },
    response: {
      answer: 'LLM 依命盤與 evidence 生成的解盤文字',
      evidence: '本次用來生成回答的結構化證據（相關宮位、星曜、雙星組合、四化組合等），供除錯與驗證用',
    },
  };
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json(usage());
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed，請用 POST' });
    return;
  }

  const body = req.body || {};
  const { question, history = [], scope = 'natal', astrolabe: astrolabeInput, horoscope: horoscopeInput, chartInput } = body;

  if (!question || typeof question !== 'string') {
    res.status(400).json({ error: '缺少必要參數：question（string）' });
    return;
  }
  if (!VALID_SCOPES.includes(scope)) {
    res.status(400).json({ error: `scope 必須是以下其中之一：${VALID_SCOPES.join(', ')}` });
    return;
  }
  if (!Array.isArray(history)) {
    res.status(400).json({ error: 'history 必須是陣列' });
    return;
  }

  let astrolabe = astrolabeInput;
  let horoscope = horoscopeInput;
  let horoscopeAsOf = body.horoscopeAsOf || null;

  if (!astrolabe) {
    if (!chartInput) {
      res.status(400).json({ error: '必須提供 astrolabe(+horoscope)，或提供 chartInput 讓系統自己排盤' });
      return;
    }
    // 問題文字裡的「今年」「明年」「2027年」等，要真的換算成對應年份的 targetDate，
    // 否則「今年運勢」跟「明年運勢」會因為都沒指定 targetDate，一起 fallback 成伺服器
    // 當下的日期，變成兩個問題查到一模一樣的流年資料。呼叫端若已經自己算好、明確
    // 傳了 chartInput.targetDate，優先尊重呼叫端的值，不覆蓋。
    const inferredTargetDate = resolveTargetDateFromQuestion(question);
    const effectiveChartInput = (chartInput.targetDate === undefined && inferredTargetDate)
      ? { ...chartInput, targetDate: inferredTargetDate }
      : chartInput;
    try {
      const resolved = resolveChartInput(effectiveChartInput);
      astrolabe = resolved.astrolabe;
      horoscope = resolved.horoscope;
      horoscopeAsOf = resolved.horoscopeAsOf;
    } catch (err) {
      if (err instanceof ChartInputError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || '排盤失敗' });
      return;
    }
  }

  let evidence;
  try {
    evidence = buildEvidence({ astrolabe, horoscope, scope, question, horoscopeAsOf });
  } catch (err) {
    res.status(400).json({ error: err.message || '證據組裝失敗' });
    return;
  }

  try {
    const messages = buildMessages({ evidence, question, history });
    const answer = await callLlm(messages);
    res.status(200).json({ answer, evidence });
  } catch (err) {
    if (err instanceof LlmError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message || '解盤失敗' });
  }
};
