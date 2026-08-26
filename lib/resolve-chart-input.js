/**
 * Shared birth-data -> astrolabe/horoscope resolution, extracted from
 * api/chart.js so api/interpret.js can accept the same `chartInput` shape
 * without duplicating the hourIndex/birthTime+location/targetDate parsing.
 * Behavior is unchanged from the original inline logic in api/chart.js.
 */
const {
  HOUR_OPTIONS,
  computeAstrolabe,
  simplifyAstrolabe,
  simplifyAllHoroscopes,
  formatChartText,
} = require('./chart-logic');
const { calculateTrueSolarTime } = require('./solar-time');
const { findLocation } = require('./location-lookup');

class ChartInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ChartInputError';
    this.status = status;
  }
}

/**
 * @param {object} body - same shape as POST /api/chart's body
 * @returns {{astrolabe, horoscope, horoscopeAsOf, hourUsed, solarTime, plainText}}
 */
function resolveChartInput(body) {
  const {
    dateType = 'solar',
    date,
    isLeapMonth = false,
    gender,
    hourIndex,
    birthTime,
    location: locationInput,
    targetDate,
    lang = 'zh-TW',
  } = body || {};

  if (!date || !gender) {
    throw new ChartInputError('缺少必要參數：date、gender');
  }
  if (gender !== '男' && gender !== '女') {
    throw new ChartInputError('gender 必須是 "男" 或 "女"');
  }

  let horoscopeDateArg;
  if (targetDate !== undefined && targetDate !== null && targetDate !== '') {
    const tm = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(targetDate);
    if (!tm) {
      throw new ChartInputError('targetDate 格式必須是 "YYYY-M-D"，例如 "2027-6-15"');
    }
    horoscopeDateArg = new Date(Date.UTC(Number(tm[1]), Number(tm[2]) - 1, Number(tm[3]), 12, 0, 0));
    if (Number.isNaN(horoscopeDateArg.getTime())) {
      throw new ChartInputError('targetDate 不是合法日期');
    }
  }

  let hourValue;
  let solarTimeResult = null;
  let resolvedLocation = null;

  if (hourIndex !== undefined && hourIndex !== null) {
    hourValue = Number(hourIndex);
    if (!Number.isInteger(hourValue) || hourValue < 0 || hourValue > 12) {
      throw new ChartInputError('hourIndex 必須是 0-12 的整數');
    }
  } else if (birthTime) {
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(birthTime);
    if (!timeMatch) {
      throw new ChartInputError('birthTime 格式必須是 "HH:MM"，例如 "06:50"');
    }
    const hh = Number(timeMatch[1]);
    const mm = Number(timeMatch[2]);
    if (hh > 23 || mm > 59) {
      throw new ChartInputError('birthTime 不是合法時間');
    }

    if (!locationInput) {
      throw new ChartInputError('提供 birthTime 時必須同時提供 location，系統才能換算真太陽時');
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
        throw new ChartInputError(`找不到城市「${locationInput.city}」，請確認拼寫，或改用 latitude/longitude/timezoneId 直接提供座標`);
      }
      resolvedLocation = found;
    } else {
      throw new ChartInputError('location 必須提供 city，或直接提供 latitude/longitude/timezoneId');
    }

    let birthDate;
    try {
      if (dateType === 'lunar') {
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
      throw new ChartInputError('無法解析出生日期：' + (err.message || ''));
    }

    try {
      solarTimeResult = calculateTrueSolarTime(birthDate, { hour: hh, minute: mm }, resolvedLocation);
      hourValue = solarTimeResult.hourIndex;
    } catch (err) {
      throw new ChartInputError('真太陽時計算失敗：' + (err.message || ''), 500);
    }
  } else {
    throw new ChartInputError('必須提供 hourIndex，或提供 birthTime + location');
  }

  let astrolabeRaw;
  try {
    astrolabeRaw = computeAstrolabe({
      dateType, date, hour: hourValue, gender, isLeapMonth, useTrueSolarTime: false, lang,
    });
  } catch (err) {
    throw new ChartInputError(err.message || '排盤失敗', 500);
  }

  const astrolabe = simplifyAstrolabe(astrolabeRaw);
  const horoscopeRaw = horoscopeDateArg ? astrolabeRaw.horoscope(horoscopeDateArg) : astrolabeRaw.horoscope();
  const horoscope = simplifyAllHoroscopes(horoscopeRaw);
  const hourOpt = HOUR_OPTIONS.find((o) => o.value === hourValue);
  const plainText = formatChartText(astrolabe, horoscope);

  return {
    astrolabe,
    horoscope,
    horoscopeAsOf: { solarDate: horoscopeRaw.solarDate, lunarDate: horoscopeRaw.lunarDate },
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
  };
}

module.exports = { resolveChartInput, ChartInputError };
