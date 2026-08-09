/**
 * True (apparent) solar time calculation. Same logic as the web app's
 * docs/solar-time.js, ported to Node (astronomy-engine via npm instead of
 * the vendored browser bundle; Node's Intl has the same ICU timezone data
 * as browsers).
 */
const Astronomy = require('astronomy-engine');

/** 時辰 index (0-12) boundaries, matching iztro's own hour-index convention. */
const HOUR_INDEX_BOUNDARIES = [
  { index: 0, startMin: 0 * 60, endMin: 1 * 60 },
  { index: 1, startMin: 1 * 60, endMin: 3 * 60 },
  { index: 2, startMin: 3 * 60, endMin: 5 * 60 },
  { index: 3, startMin: 5 * 60, endMin: 7 * 60 },
  { index: 4, startMin: 7 * 60, endMin: 9 * 60 },
  { index: 5, startMin: 9 * 60, endMin: 11 * 60 },
  { index: 6, startMin: 11 * 60, endMin: 13 * 60 },
  { index: 7, startMin: 13 * 60, endMin: 15 * 60 },
  { index: 8, startMin: 15 * 60, endMin: 17 * 60 },
  { index: 9, startMin: 17 * 60, endMin: 19 * 60 },
  { index: 10, startMin: 19 * 60, endMin: 21 * 60 },
  { index: 11, startMin: 21 * 60, endMin: 23 * 60 },
  { index: 12, startMin: 23 * 60, endMin: 24 * 60 },
];

function getOffsetMinutes(timeZoneId, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneId,
    timeZoneName: 'longOffset',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const part = dtf.formatToParts(date).find((p) => p.type === 'timeZoneName');
  const m = part && part.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

function civilToUtc(year, month, day, hour, minute, timeZoneId) {
  const base = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = base;
  for (let i = 0; i < 3; i++) {
    const offset = getOffsetMinutes(timeZoneId, new Date(guess));
    const candidate = base - offset * 60000;
    if (candidate === guess) break;
    guess = candidate;
  }
  return new Date(guess);
}

function trueSolarHours(utcDate, latitude, longitude) {
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  const hourAngle = Astronomy.HourAngle(Astronomy.Body.Sun, utcDate, observer);
  return (hourAngle + 12) % 24;
}

function hourIndexFromDecimalHours(decimalHours) {
  let totalMin = Math.round(decimalHours * 60);
  if (totalMin >= 24 * 60) totalMin -= 24 * 60;
  for (const b of HOUR_INDEX_BOUNDARIES) {
    if (totalMin >= b.startMin && totalMin < b.endMin) return b.index;
  }
  return 0;
}

/**
 * @param {{year:number,month:number,day:number}} birthDate
 * @param {{hour:number,minute:number}} birthTime civil wall-clock time
 * @param {{latitude:number,longitude:number,timezoneId:string}} location
 */
function calculateTrueSolarTime(birthDate, birthTime, location) {
  const utcInstant = civilToUtc(
    birthDate.year, birthDate.month, birthDate.day,
    birthTime.hour, birthTime.minute,
    location.timezoneId
  );

  const solarDecimalHours = trueSolarHours(utcInstant, location.latitude, location.longitude);
  const trueSolarTotalMin = Math.round(solarDecimalHours * 60) % (24 * 60);
  const civilTotalMin = birthTime.hour * 60 + birthTime.minute;

  let diff = trueSolarTotalMin - civilTotalMin;
  if (diff > 12 * 60) diff -= 24 * 60;
  if (diff < -12 * 60) diff += 24 * 60;

  return {
    civilMinutes: civilTotalMin,
    trueSolarMinutes: trueSolarTotalMin,
    correctionMinutes: diff,
    trueSolarHour: Math.floor(trueSolarTotalMin / 60),
    trueSolarMinute: trueSolarTotalMin % 60,
    hourIndex: hourIndexFromDecimalHours(solarDecimalHours),
  };
}

module.exports = { calculateTrueSolarTime, hourIndexFromDecimalHours, civilToUtc, getOffsetMinutes };
