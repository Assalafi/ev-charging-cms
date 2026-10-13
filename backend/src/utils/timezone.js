// The platform operates on West Africa Time for calendar boundaries and
// scheduled jobs. Persisted timestamps remain instants; this utility only
// converts calendar values to/from those instants.
const TIME_ZONE = 'Africa/Lagos';
const OFFSET_MS = 60 * 60 * 1000;

function lagosParts(value = new Date()) {
  const instant = value instanceof Date ? value : new Date(value);
  const local = new Date(instant.getTime() + OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
    millisecond: local.getUTCMilliseconds()
  };
}

function lagosDateToUtc(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  return new Date(Date.UTC(year, month, day, hour, minute, second, millisecond) - OFFSET_MS);
}

function parseLagosDate(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error('Dates must use YYYY-MM-DD format');
  }
  const [year, month, day] = value.split('-').map(Number);
  return lagosDateToUtc(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
}

function nextLagosRunAt(frequency, from = new Date()) {
  const parts = lagosParts(from);
  const local = new Date(Date.UTC(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  ));

  if (frequency === 'daily') local.setUTCDate(local.getUTCDate() + 1);
  if (frequency === 'weekly') local.setUTCDate(local.getUTCDate() + 7);
  if (frequency === 'monthly') local.setUTCMonth(local.getUTCMonth() + 1);
  if (frequency === 'yearly') local.setUTCFullYear(local.getUTCFullYear() + 1);

  return new Date(local.getTime() - OFFSET_MS);
}

module.exports = {
  TIME_ZONE,
  OFFSET_MS,
  lagosParts,
  lagosDateToUtc,
  parseLagosDate,
  nextLagosRunAt
};
