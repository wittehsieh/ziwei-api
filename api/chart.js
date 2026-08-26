// iztro internally reads calendar-date components off Date objects using
// the process's local timezone (not a fixed UTC), so an ambient TZ far
// from UTC (e.g. UTC+14) could shift `targetDate` by a day. Pin the
// process to UTC so that interpretation is deterministic regardless of
// which host/platform this ends up running on.
process.env.TZ = 'UTC';

const { resolveChartInput, ChartInputError } = require('../lib/resolve-chart-input');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function usage() {
  return {
    usage: 'POST /api/chart',
    body: {
      dateType: '"solar" | "lunar"，預設 solar',
      date: '出生日期，格式 "YYYY-M-D"，例如 "1985-9-2"（必填）',
      isLeapMonth: '農曆閏月，只在 dateType=lunar 時有意義，預設 false',
      gender: '"男" | "女"（必填）',
      hourIndex: '時辰索引 0-12（子=0，...，晚子=12）。與 birthTime 二選一，優先使用',
      birthTime: '民用鐘錶時間 "HH:MM"，例如 "06:50"。提供時必須同時提供 location，系統會自動換算真太陽時來決定時辰',
      location: {
        city: '城市名稱（中文或英文皆可，例如 "台北" 或 "Taipei"）',
        country: '國家名稱，用來消歧義（可省略）',
        或直接提供: { latitude: 'number', longitude: 'number', timezoneId: 'IANA 時區，例如 "Asia/Taipei"' },
      },
      targetDate: '要查詢大限/流年/流月/流日的目標日期，格式 "YYYY-M-D"，例如 "2027-6-15"。省略則預設為系統現在的時間（查「目前」的運限）',
      lang: '預設 "zh-TW"',
    },
    response: {
      astrolabe: '本命盤（12宮位、主星/副星/雜曜、命主身主、五行局等），與 targetDate 無關，永遠是同一張本命盤',
      horoscope: '{ decadal, yearly, monthly, daily } 大限/流年/流月/流日，以 targetDate（或現在）為基準計算，永遠全部回傳',
      horoscopeAsOf: '實際用來計算運限的日期 { solarDate, lunarDate }',
      hourUsed: '實際用於排盤的時辰 { index, branch, range }',
      solarTime: '若走 birthTime+location 路徑，回傳真太陽時換算結果；走 hourIndex 路徑則為 null',
      plainText: '命盤＋四種運限的純文字版本，方便 AI 直接閱讀',
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

  try {
    const result = resolveChartInput(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ChartInputError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message || '排盤失敗' });
  }
};
