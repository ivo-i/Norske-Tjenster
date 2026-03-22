'use strict';

const { DateTime } = require('luxon');

const TZ = 'Europe/Oslo';
const DAY_NAMES_TODAY = ['i dag', 'today'];
const DAY_NAMES_TOMORROW = ['i morgen', 'tomorrow'];

function matchesDay(dayText, candidates) {
  const lower = (dayText || '').toLowerCase();
  return candidates.some((c) => lower.includes(c));
}

function findTodayEntry(openingHours) {
  if (!openingHours || !openingHours.length) return null;
  const hit = openingHours.find((e) => matchesDay(e.day, DAY_NAMES_TODAY));
  if (hit) return hit;
  const now = DateTime.now().setZone(TZ);
  const weekdayNb = now.setLocale('nb').toFormat('cccc').toLowerCase();
  return openingHours.find((e) => (e.day || '').toLowerCase().includes(weekdayNb)) || null;
}

function findTomorrowEntry(openingHours) {
  if (!openingHours || !openingHours.length) return null;
  const hit = openingHours.find((e) => matchesDay(e.day, DAY_NAMES_TOMORROW));
  if (hit) return hit;
  const tomorrow = DateTime.now().setZone(TZ).plus({ days: 1 });
  const weekdayNb = tomorrow.setLocale('nb').toFormat('cccc').toLowerCase();
  return openingHours.find((e) => (e.day || '').toLowerCase().includes(weekdayNb)) || null;
}

/**
 * @returns {{ kind: 'closed'|'interval'|'unknown', openMin?: number, closeMin?: number, raw?: string }}
 */
function parseHoursInterval(hoursStr) {
  const raw = (hoursStr || '').trim();
  if (!raw || raw === '-') {
    return { kind: 'unknown', raw: raw || '' };
  }
  const lower = raw.toLowerCase();
  if (lower.includes('stengt') || lower.includes('closed')) {
    return { kind: 'closed' };
  }
  const m = raw.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!m) {
    return { kind: 'unknown', raw };
  }
  const [h1, m1] = m[1].split(':').map(Number);
  const [h2, m2] = m[2].split(':').map(Number);
  return {
    kind: 'interval',
    openMin: h1 * 60 + m1,
    closeMin: h2 * 60 + m2,
    raw,
  };
}

function isNowWithinInterval(interval, nowLuxon) {
  if (interval.kind === 'closed') return false;
  if (interval.kind !== 'interval') return null;
  const t = nowLuxon.hour * 60 + nowLuxon.minute;
  const { openMin, closeMin } = interval;
  if (closeMin <= openMin) {
    return t >= openMin || t < closeMin;
  }
  return t >= openMin && t < closeMin;
}

function ceilMinutesUntil(nowLuxon, targetLuxon) {
  if (!targetLuxon || targetLuxon <= nowLuxon) return null;
  return Math.max(1, Math.ceil(targetLuxon.diff(nowLuxon, 'minutes').minutes));
}

/** Same calendar day, wall-clock time in Oslo. */
function atClockOnSameDay(nowLuxon, clockMinTotal) {
  const h = Math.floor(clockMinTotal / 60);
  const mi = clockMinTotal % 60;
  return nowLuxon.set({ hour: h, minute: mi, second: 0, millisecond: 0 });
}

/**
 * Minutes until today's closing time while currently inside opening hours.
 */
function minutesUntilClose(interval, nowLuxon) {
  if (interval.kind !== 'interval') return null;
  const { openMin, closeMin } = interval;
  const nowMin = nowLuxon.hour * 60 + nowLuxon.minute;

  if (closeMin > openMin) {
    if (nowMin < openMin || nowMin >= closeMin) return null;
    const target = atClockOnSameDay(nowLuxon, closeMin);
    return ceilMinutesUntil(nowLuxon, target);
  }

  // Overnight: open evening, close next calendar morning
  if (nowMin >= openMin) {
    const target = nowLuxon.startOf('day').plus({ days: 1 }).set({
      hour: Math.floor(closeMin / 60),
      minute: closeMin % 60,
      second: 0,
      millisecond: 0,
    });
    return ceilMinutesUntil(nowLuxon, target);
  }
  if (nowMin < closeMin) {
    const target = atClockOnSameDay(nowLuxon, closeMin);
    return ceilMinutesUntil(nowLuxon, target);
  }
  return null;
}

/**
 * Minutes until today's opening time (before open, same day).
 */
function minutesUntilOpen(interval, nowLuxon) {
  if (interval.kind !== 'interval') return null;
  const { openMin, closeMin } = interval;
  const nowMin = nowLuxon.hour * 60 + nowLuxon.minute;

  if (closeMin > openMin) {
    if (nowMin >= openMin) return null;
    const target = atClockOnSameDay(nowLuxon, openMin);
    return ceilMinutesUntil(nowLuxon, target);
  }

  // Overnight: closed during "middle" of day between close and evening open
  if (nowMin >= closeMin && nowMin < openMin) {
    const target = atClockOnSameDay(nowLuxon, openMin);
    return ceilMinutesUntil(nowLuxon, target);
  }
  return null;
}

/** Minutes from now until tomorrow's opening time (wall clock in Oslo). */
function minutesUntilTomorrowOpen(openMin, nowLuxon) {
  const target = nowLuxon.startOf('day').plus({ days: 1 }).set({
    hour: Math.floor(openMin / 60),
    minute: openMin % 60,
    second: 0,
    millisecond: 0,
  });
  return ceilMinutesUntil(nowLuxon, target);
}

/** Capability titles carry "Opens in" / "Closes in"; value is only the minute count. */
function formatCountdownMinutes(minutes) {
  if (minutes === null || minutes === undefined) return '0';
  if (minutes <= 0) return '0';
  return String(minutes);
}

/**
 * @param {{ day: string, hours: string }[]} openingHours
 * @param {'no'|'en'} lang
 * @returns {{
 *   open: boolean,
 *   statusText: string,
 *   detailText: string,
 *   opensInText: string,
 *   closesInText: string,
 * }}
 * opensInText / closesInText: minute count or "0" when not applicable.
 */
function computeVenueOpenStatus(openingHours, lang) {
  const now = DateTime.now().setZone(TZ);
  const entry = findTodayEntry(openingHours);

  const tOpen = lang === 'no' ? 'åpent' : 'open';
  const tClosed = lang === 'no' ? 'stengt' : 'closed';
  const tUnknown = lang === 'no' ? 'Ukjent' : 'Unknown';

  const emptyCountdowns = {
    open: false,
    statusText: tUnknown,
    detailText: lang === 'no' ? 'Ingen åpningstider i dag' : 'No opening hours for today',
    opensInText: '0',
    closesInText: '0',
  };

  if (!entry) {
    return emptyCountdowns;
  }

  const interval = parseHoursInterval(entry.hours);
  const within = isNowWithinInterval(interval, now);
  const hoursLine = interval.raw || entry.hours || '-';

  if (interval.kind === 'unknown') {
    return {
      open: false,
      statusText: tUnknown,
      detailText: interval.raw || entry.hours || '-',
      opensInText: '0',
      closesInText: '0',
    };
  }

  if (interval.kind === 'closed') {
    const tomorrow = findTomorrowEntry(openingHours);
    const ti = tomorrow ? parseHoursInterval(tomorrow.hours) : null;
    let detailText = hoursLine;
    let opensInText = '0';
    if (ti && ti.kind === 'interval') {
      opensInText = formatCountdownMinutes(minutesUntilTomorrowOpen(ti.openMin, now));
    } else {
      detailText = lang === 'no' ? 'Stengt i dag' : 'Closed today';
    }
    return { open: false, statusText: tClosed, detailText, opensInText, closesInText: '0' };
  }

  const openMin = interval.openMin;
  const closeMin = interval.closeMin;
  const nowMin = now.hour * 60 + now.minute;

  if (within === true) {
    const closeMins = minutesUntilClose(interval, now);
    const detail = hoursLine;
    return {
      open: true,
      statusText: tOpen,
      detailText: detail,
      opensInText: '0',
      closesInText: formatCountdownMinutes(closeMins),
    };
  }

  // Same calendar day, before opening (e.g. 07:00 for 09:00–21:00)
  if (nowMin < openMin && closeMin > openMin) {
    const openMins = minutesUntilOpen(interval, now);
    return {
      open: false,
      statusText: tClosed,
      detailText: hoursLine,
      opensInText: formatCountdownMinutes(openMins),
      closesInText: '0',
    };
  }

  // Overnight hours: before evening open (e.g. midday before 16:00–02:00)
  if (nowMin < openMin && closeMin <= openMin) {
    const openMins = minutesUntilOpen(interval, now);
    return {
      open: false,
      statusText: tClosed,
      detailText: hoursLine,
      opensInText: formatCountdownMinutes(openMins),
      closesInText: '0',
    };
  }

  const tomorrow = findTomorrowEntry(openingHours);
  const ti = tomorrow ? parseHoursInterval(tomorrow.hours) : null;
  if (ti && ti.kind === 'interval') {
    return {
      open: false,
      statusText: tClosed,
      detailText: hoursLine,
      opensInText: formatCountdownMinutes(minutesUntilTomorrowOpen(ti.openMin, now)),
      closesInText: '0',
    };
  }
  return {
    open: false,
    statusText: tClosed,
    detailText: lang === 'no' ? 'Utenfor åpningstid' : 'Outside opening hours',
    opensInText: '0',
    closesInText: '0',
  };
}

module.exports = {
  computeVenueOpenStatus,
  findTodayEntry,
  parseHoursInterval,
};
