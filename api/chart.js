const {
  HOUR_OPTIONS,
  computeAstrolabe,
  simplifyAstrolabe,
  simplifyAllHoroscopes,
  formatChartText,
} = require('../lib/chart-logic');
const { calculateTrueSolarTime } = require('../lib/solar-time');
const { findLocation } = require('../lib/location-lookup');

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
      lang: '預設 "zh-TW"',
    },
    response: {
      astrolabe: '本命盤（12宮位、主星/副星/雜曜、命主身主、五行局等）',
      horoscope: '{ decadal, yearly, monthly, daily } 大限/流年/流月/流日，永遠全部回傳',
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

  const body = req.body || {};
  const {
    dateType = 'solar',
    date,
    isLeapMonth = false,
    gender,
    hourIndex,
    birthTime,
    location: locationInput,
    lang = 'zh-TW',
  } = body;

  if (!date || !gender) {
    res.status(400).json({ error: '缺少必要參數：date、gender' });
    return;
  }
  if (gender !== '男' && gender !== '女') {
    res.status(400).json({ error: 'gender 必須是 "男" 或 "女"' });
    return;
  }

  let hourValue;
  let solarTimeResult = null;
  let resolvedLocation = null;

  if (hourIndex !== undefined && hourIndex !== null) {
    hourValue = Number(hourIndex);
    if (!Number.isInteger(hourValue) || hourValue < 0 || hourValue > 12) {
      res.status(400).json({ error: 'hourIndex 必須是 0-12 的整數' });
      return;
    }
  } else if (birthTime) {
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(birthTime);
    if (!timeMatch) {
      res.status(400).json({ error: 'birthTime 格式必須是 "HH:MM"，例如 "06:50"' });
      return;
    }
    const hh = Number(timeMatch[1]);
    const mm = Number(timeMatch[2]);
    if (hh > 23 || mm > 59) {
      res.status(400).json({ error: 'birthTime 不是合法時間' });
      return;
    }

    if (!locationInput) {
      res.status(400).json({ error: '提供 birthTime 時必須同時提供 location，系統才能換算真太陽時' });
      return;
    }

    if (locationInput.latitude !== undefined && locationInput.longitude !== undefined && locationInput.timezoneId) {
      resolvedLocation = {
        latitude: Number(locationInput.latitude),
        longitude: Number(locationInput.longitude),
        timezoneId: locationInput.timezoneId,
      };
    } else if (locationInput.city) {
      const found = findLocation({ city: locationInput.city, country: locationInput.country });
      if (!found) {
        res.status(400).json({ error: `找不到城市「${locationInput.city}」，請確認拼寫，或改用 latitude/longitude/timezoneId 直接提供座標` });
        return;
      }
      resolvedLocation = found;
    } else {
      res.status(400).json({ error: 'location 必須提供 city，或直接提供 latitude/longitude/timezoneId' });
      return;
    }

    let birthDate;
    try {
      if (dateType === 'lunar') {
        // Resolve to Gregorian first since solar time needs a real calendar date.
        const preliminary = computeAstrolabe({
          dateType: 'lunar', date, hour: 0, gender, isLeapMonth, useTrueSolarTime: false, lang,
        });
        const [sy, sm, sd] = preliminary.solarDate.split('-').map(Number);
        birthDate = { year: sy, month: sm, day: sd };
      } else {
        const [y, m, d] = date.split('-').map(Number);
        birthDate = { year: y, month: m, day: d };
      }
    } catch (err) {
      res.status(400).json({ error: '無法解析出生日期：' + (err.message || '') });
      return;
    }

    try {
      solarTimeResult = calculateTrueSolarTime(birthDate, { hour: hh, minute: mm }, resolvedLocation);
      hourValue = solarTimeResult.hourIndex;
    } catch (err) {
      res.status(500).json({ error: '真太陽時計算失敗：' + (err.message || '') });
      return;
    }
  } else {
    res.status(400).json({ error: '必須提供 hourIndex，或提供 birthTime + location' });
    return;
  }

  try {
    const astrolabeRaw = computeAstrolabe({
      dateType, date, hour: hourValue, gender, isLeapMonth, useTrueSolarTime: false, lang,
    });
    const astrolabe = simplifyAstrolabe(astrolabeRaw);
    const horoscopeRaw = astrolabeRaw.horoscope();
    const horoscope = simplifyAllHoroscopes(horoscopeRaw);
    const hourOpt = HOUR_OPTIONS.find((o) => o.value === hourValue);
    const plainText = formatChartText(astrolabe, horoscope);

    res.status(200).json({
      astrolabe,
      horoscope,
      hourUsed: hourOpt ? { index: hourOpt.value, branch: hourOpt.branch, range: hourOpt.range } : { index: hourValue },
      solarTime: solarTimeResult
        ? {
            civilTime: birthTime,
            trueSolarTime: `${String(solarTimeResult.trueSolarHour).padStart(2, '0')}:${String(solarTimeResult.trueSolarMinute).padStart(2, '0')}`,
            correctionMinutes: solarTimeResult.correctionMinutes,
            location: resolvedLocation,
          }
        : null,
      plainText,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || '排盤失敗' });
  }
};
