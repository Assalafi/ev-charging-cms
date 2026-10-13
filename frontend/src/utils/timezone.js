// All dashboard dates are presented in West Africa Time, regardless of the
// browser's own timezone. API timestamps remain ISO instants.
export const TIME_ZONE = 'Africa/Lagos';
export const LOCALE = 'en-NG';

const withCalendarOptions = (defaults, options) => {
  const merged = { ...defaults, ...options };
  if (['weekday', 'year', 'month', 'day'].some(key => options[key] !== undefined)) delete merged.dateStyle;
  if (['hour', 'minute', 'second', 'timeZoneName'].some(key => options[key] !== undefined)) delete merged.timeStyle;
  return merged;
};

const asDate = value => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTime = (value, options = {}) => {
  const date = asDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(LOCALE, withCalendarOptions({
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }, options)).format(date);
};

export const formatDate = (value, options = {}) => {
  const date = asDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(LOCALE, withCalendarOptions({
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
  }, options)).format(date);
};

export const formatTime = (value, options = {}) => {
  const date = asDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...options
  }).format(date);
};

export const formatWeekday = value => {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: 'long' }).format(date) : '-';
};

export const dateKey = (value = new Date()) => {
  const date = asDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const todayKey = () => dateKey(new Date());
