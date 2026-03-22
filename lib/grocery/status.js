'use strict';

const { DateTime } = require('luxon');
const { TZ } = require('./constants');

const SCHEMA_DAY_TO_WEEKDAY = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

function schemaDayToWeekday(dayOfWeek) {
  if (dayOfWeek == null || dayOfWeek === '') return null;
  if (typeof dayOfWeek === 'number' && Number.isInteger(dayOfWeek) && dayOfWeek >= 1 && dayOfWeek <= 7) {
    return dayOfWeek;
  }
  const trimmed = String(dayOfWeek).trim();
  const asNum = Number(trimmed);
  if (
    Number.isInteger(asNum)
    && asNum >= 1
    && asNum <= 7
    && trimmed === String(asNum)
  ) {
    return asNum;
  }
  const s = String(dayOfWeek);
  for (const [k, v] of Object.entries(SCHEMA_DAY_TO_WEEKDAY)) {
    if (s.includes(k)) return v;
  }
  return null;
}

function openingIntervalsForDay(jsonLd, dayStartOslo) {
  const dateStr = dayStartOslo.toISODate();
  const specials = jsonLd.specialOpeningHoursSpecification || [];

  for (const spec of specials) {
    if (!spec.validFrom || !spec.validThrough) continue;
    if (dateStr < spec.validFrom || dateStr > spec.validThrough) continue;
    if (spec.opens && spec.closes) {
      const intv = intervalFromStrings(dayStartOslo, spec.opens, spec.closes);
      return intv ? [intv] : [];
    }
    return [];
  }

  const weekday = dayStartOslo.weekday;
  const weekly = jsonLd.openingHoursSpecification || [];
  const out = [];
  for (const row of weekly) {
    const w = schemaDayToWeekday(row.dayOfWeek);
    if (w !== weekday) continue;
    if (!row.opens || !row.closes) continue;
    const intv = intervalFromStrings(dayStartOslo, row.opens, row.closes);
    if (intv) out.push(intv);
  }
  out.sort((a, b) => a.open.toMillis() - b.open.toMillis());
  return out;
}

function intervalFromStrings(dayStartOslo, opens, closes) {
  const op = parseTime(opens);
  const cl = parseTime(closes);
  if (!op || !cl) return null;
  const open = dayStartOslo.set({
    hour: op.h,
    minute: op.m,
    second: 0,
    millisecond: 0,
  });
  let close = dayStartOslo.set({
    hour: cl.h,
    minute: cl.m,
    second: 0,
    millisecond: 0,
  });
  if (close <= open) {
    close = close.plus({ days: 1 });
  }
  return { open, close };
}

function parseTime(s) {
  if (!s || typeof s !== 'string') return null;
  const parts = s.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] || 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m };
}

function currentInterval(jsonLd, now) {
  const dayStart = now.startOf('day');
  const intervals = openingIntervalsForDay(jsonLd, dayStart);
  for (const intv of intervals) {
    if (now >= intv.open && now < intv.close) return intv;
  }
  return null;
}

function isOpen(jsonLd, now) {
  return currentInterval(jsonLd, now) !== null;
}

function nextOpeningAfter(jsonLd, now) {
  const limit = 14;
  for (let add = 0; add < limit; add++) {
    const day = now.startOf('day').plus({ days: add });
    const intervals = openingIntervalsForDay(jsonLd, day);
    for (const intv of intervals) {
      if (intv.open > now) return intv.open;
    }
  }
  return null;
}

function formatOpeningHint(dt, lang) {
  const now = DateTime.now().setZone(TZ);
  const today = now.startOf('day');
  const d = dt.startOf('day');
  const time = dt.toFormat('HH:mm');
  if (lang === 'no') {
    if (d.equals(today)) return `i dag kl. ${time}`;
    if (d.equals(today.plus({ days: 1 }))) return `i morgen kl. ${time}`;
    return `${dt.setLocale('nb').toFormat('cccc')} kl. ${time}`;
  }
  if (d.equals(today)) return `today at ${time}`;
  if (d.equals(today.plus({ days: 1 }))) return `tomorrow at ${time}`;
  return `${dt.setLocale('en').toFormat('cccc')} at ${time}`;
}

/**
 * @param {object} jsonLd
 * @param {string} lang 'no' | 'en'
 */
function computeShopStatus(jsonLd, lang) {
  const now = DateTime.now().setZone(TZ);
  const open = isOpen(jsonLd, now);
  const intv = currentInterval(jsonLd, now);

  let statusText;
  let nextEventText;

  if (open && intv) {
    const closeT = intv.close.toFormat('HH:mm');
    statusText = lang === 'no' ? 'Åpen' : 'Open';
    nextEventText = lang === 'no' ? `Stenger kl. ${closeT}` : `Closes at ${closeT}`;
  } else {
    const next = nextOpeningAfter(jsonLd, now);
    statusText = lang === 'no' ? 'Stengt' : 'Closed';
    if (next) {
      const hint = formatOpeningHint(next, lang);
      nextEventText = lang === 'no' ? `Neste åpning: ${hint}` : `Next opening: ${hint}`;
    } else {
      nextEventText = lang === 'no' ? 'Ingen planlagt åpning (14 dager)' : 'No opening found (14 days)';
    }
  }

  return {
    open,
    statusText,
    nextEventText,
    nowMillis: now.toMillis(),
  };
}

module.exports = {
  computeShopStatus,
  isOpen,
  nextOpeningAfter,
  currentInterval,
  openingIntervalsForDay,
};
