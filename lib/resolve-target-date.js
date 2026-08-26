/**
 * Parses a relative/explicit date reference out of the question text, so
 * "明年運勢" and "今年運勢" actually resolve to different calendar years
 * instead of both silently defaulting to the server's current date.
 * Without this, evidence-builder's layer detection (今年→yearly,
 * 明年→yearly) would correctly pick the *scope* but resolveChartInput would
 * still compute whichever year "now" happens to be, for both.
 *
 * @param {string} question
 * @param {Date} [now] - injectable for testing; defaults to actual now
 * @returns {string|null} "YYYY-M-D" suitable for chartInput.targetDate, or
 *   null if the question has no date reference (caller should leave
 *   targetDate unset and let resolveChartInput default to "now")
 */
function resolveTargetDateFromQuestion(question, now = new Date()) {
  if (!question) return null;

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();

  // 明確年份，例如「2027年」「2027 年運勢」
  const explicitYearMatch = /(\d{4})\s*年/.exec(question);
  if (explicitYearMatch) {
    return `${explicitYearMatch[1]}-6-15`; // 年中隨便一天，只是為了讓 horoscope() 落在對的年份
  }

  if (question.includes('明天') || question.includes('明日')) {
    const d = new Date(Date.UTC(year, month - 1, day + 1));
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  }
  if (question.includes('今天') || question.includes('今日')) {
    return `${year}-${month}-${day}`;
  }
  if (question.includes('去年')) {
    return `${year - 1}-6-15`;
  }
  if (question.includes('明年')) {
    return `${year + 1}-6-15`;
  }
  if (question.includes('下個月') || question.includes('下月')) {
    const rolledOver = month === 12;
    return `${rolledOver ? year + 1 : year}-${rolledOver ? 1 : month + 1}-15`;
  }
  if (question.includes('今年') || question.includes('這個月') || question.includes('本月') || question.includes('這月')) {
    return `${year}-${month}-${day}`;
  }

  return null;
}

module.exports = { resolveTargetDateFromQuestion };
