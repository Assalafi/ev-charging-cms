const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function lagosParts(date = new Date()) {
  const lagosDate = new Date(date.getTime() + LAGOS_OFFSET_MS);
  return {
    year: lagosDate.getUTCFullYear(),
    month: lagosDate.getUTCMonth(),
    day: lagosDate.getUTCDate(),
    weekday: lagosDate.getUTCDay()
  };
}

function lagosDateToUtc(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  return new Date(Date.UTC(year, month, day, hour, minute, second, millisecond) - LAGOS_OFFSET_MS);
}

function parseDateOnly(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error('Dates must use YYYY-MM-DD format');
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = lagosDateToUtc(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );

  const check = lagosParts(parsed);
  if (check.year !== year || check.month !== month - 1 || check.day !== day) {
    throw new Error('Invalid calendar date');
  }

  return parsed;
}

function getPartnerDateRange({ range = 'monthly', startDate, endDate } = {}, now = new Date()) {
  if (startDate || endDate) {
    if (!startDate || !endDate) {
      throw new Error('Both startDate and endDate are required for a custom range');
    }

    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate, true);
    if (start > end) throw new Error('startDate must be before endDate');

    const maximumRangeMs = 366 * 24 * 60 * 60 * 1000;
    if (end - start > maximumRangeMs) {
      throw new Error('Custom date range cannot exceed 366 days');
    }

    return { range: 'custom', start, end };
  }

  const supportedRanges = ['daily', 'weekly', 'monthly', 'yearly'];
  if (!supportedRanges.includes(range)) {
    throw new Error(`Invalid range. Use: ${supportedRanges.join(', ')}`);
  }

  const parts = lagosParts(now);
  let start;

  if (range === 'daily') {
    start = lagosDateToUtc(parts.year, parts.month, parts.day);
  } else if (range === 'weekly') {
    const daysSinceMonday = (parts.weekday + 6) % 7;
    start = lagosDateToUtc(parts.year, parts.month, parts.day - daysSinceMonday);
  } else if (range === 'yearly') {
    start = lagosDateToUtc(parts.year, 0, 1);
  } else {
    start = lagosDateToUtc(parts.year, parts.month, 1);
  }

  return { range, start, end: now };
}

function lagosDateKey(value) {
  const date = new Date(new Date(value).getTime() + LAGOS_OFFSET_MS);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

module.exports = {
  getPartnerDateRange,
  lagosDateKey,
  parseDateOnly
};
