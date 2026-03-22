'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { DateTime } = require('luxon');

const OSLO_TZ = 'Europe/Oslo';

const RESORTS = {
  oslo: { slug: 'oslo', name: 'SkiMore Oslo' },
  drammen: { slug: 'drammen', name: 'SkiMore Drammen' },
  kongsberg: { slug: 'kongsberg', name: 'SkiMore Kongsberg' },
};

const HTTP_HEADERS = { 'User-Agent': 'Homey/NorwegianPublicServices' };
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

function getResorts() {
  return Object.entries(RESORTS).map(([id, r]) => ({ id, name: r.name }));
}

async function fetchStatus(resortId) {
  const resort = RESORTS[resortId];
  if (!resort) throw new Error(`Unknown resort: ${resortId}`);

  const url = `https://${resort.slug}.skimore.no/loypekart-og-status`;
  const html = await fetchWithRetry(url);

  return parseHtml(html);
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: HTTP_HEADERS,
      });
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findTextIndex(texts, predicate, fromIndex = 0) {
  for (let i = fromIndex; i < texts.length; i++) {
    if (predicate(texts[i], i)) return i;
  }
  return -1;
}

/** Driftsmelding dates on the status page are dd.mm (two segments). */
function isDriftsmeldingDateToken(s) {
  return s && /^\d{1,2}\.\d{1,2}$/.test(s);
}

/** Aktivitetskalender uses dd.mm.yy (or yyyy). */
function isCalendarDateToken(s) {
  return s && /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(s);
}

function calendarDateMatchesToday(dateStr, nowLuxon) {
  const m = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return false;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  return nowLuxon.day === d && nowLuxon.month === mo && nowLuxon.year === y;
}

/**
 * @param {{ date: string, title: string, place: string }[]} activities
 * @param {'no'|'en'} lang
 */
/** First HH:mm in a string, if any. */
function firstTimeInText(s) {
  if (!s) return null;
  const m = String(s).match(/\b(\d{1,2}:\d{2})\b/);
  return m ? m[1] : null;
}

/**
 * Single line for latest driftsmelding: date · time · title (no body).
 * Time is the first HH:mm in title or body, otherwise "–".
 */
function formatLatestDriftsmelding(msg) {
  if (!msg) return '-';
  const date = (msg.date || '').trim() || '–';
  const combined = `${msg.title || ''} ${msg.text || ''}`.trim();
  const time = firstTimeInText(combined) || '–';
  const title = (msg.title || '').trim() || '–';
  return `${date} · ${time} · ${title}`;
}

/**
 * Snøproduksjon level is drawn as an SVG bar (not the next rich-text span — that can be
 * a notification like "Anlegget åpner"). Parse fill width from the first bar path after the heading.
 * @returns {number|null} 0–100
 */
function parseSnowProductionPercentFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const label = 'Status snøproduksjon';
  const i = html.indexOf(label);
  if (i < 0) return null;
  const slice = html.slice(i, i + 12000);
  const svgMatch = slice.match(
    /<svg[^>]*data-bbox="([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"[^>]*>[\s\S]*?<path[^>]*d="([^"]+)"/,
  );
  if (!svgMatch) return null;
  const vbW = parseFloat(svgMatch[3]);
  const d = svgMatch[5];
  const pm = d.match(/M([\d.]+)\s+([\d.]+)v([\d.]+)H([\d.]+)/);
  if (!pm || !vbW || vbW <= 0) return null;
  const xRight = parseFloat(pm[1]);
  const xLeft = parseFloat(pm[4]);
  const fillW = Math.abs(xRight - xLeft);
  return Math.max(0, Math.min(100, Math.round((fillW / vbW) * 100)));
}

function formatActivityToday(activities, lang) {
  const now = DateTime.now().setZone(OSLO_TZ);
  const hits = (activities || []).filter((a) => calendarDateMatchesToday(a.date, now));
  if (hits.length === 0) {
    return lang === 'no' ? 'Nei' : 'No';
  }
  const parts = hits.map((h) => {
    const t = (h.title || '').trim();
    const p = (h.place || '').trim();
    if (t && p) return `${t} — ${p}`;
    return t || p || (lang === 'no' ? 'Ja' : 'Yes');
  });
  return parts.join('; ');
}

function parseHtml(html) {
  const $ = cheerio.load(html);

  const texts = [];
  $('span.wixui-rich-text__text').each(function () {
    const t = $(this).clone().children().remove().end().text().trim();
    if (t) texts.push(t);
  });

  const result = {
    temperature: null,
    humidity: null,
    precipitation: null,
    openingHours: [],
    lifts: { open: 0, total: 0, items: [] },
    slopes: { open: 0, total: 0, items: [] },
    snowProductionPercent: null,
    messages: [],
    calendarActivities: [],
    _parseSuccess: false,
  };

  const weatherIdx = findWeatherSection(texts);
  if (weatherIdx >= 0) {
    result.temperature = parseNumber(texts[weatherIdx + 1]);
    result.humidity = parseNumber(texts[weatherIdx + 3]);
    result.precipitation = parseNumber(texts[weatherIdx + 5]);
  }

  const hoursStart = texts.indexOf('Neste 7 dager:');
  const heiserIdx = texts.indexOf('Heiser', hoursStart > -1 ? hoursStart : 0);
  if (hoursStart >= 0 && heiserIdx > hoursStart) {
    for (let i = hoursStart + 1; i < heiserIdx; i += 2) {
      const day = texts[i];
      const hours = texts[i + 1];
      if (day && hours && /\d{2}:\d{2}/.test(hours)) {
        result.openingHours.push({ day, hours });
      }
    }
  }

  const løyperIdx = texts.indexOf('Løyper', heiserIdx > -1 ? heiserIdx : 0);
  if (heiserIdx >= 0 && løyperIdx > heiserIdx) {
    for (let i = heiserIdx + 1; i < løyperIdx; i += 3) {
      if (i + 2 < løyperIdx) {
        result.lifts.items.push({
          name: texts[i],
          length: texts[i + 1],
          height: texts[i + 2],
        });
      }
    }
  }

  const statsIdx = texts.indexOf('Din Statistikk', løyperIdx > -1 ? løyperIdx : 0);
  const slopeEnd = statsIdx >= 0 ? statsIdx : texts.indexOf('Driftstatus', løyperIdx > -1 ? løyperIdx : 0);
  if (løyperIdx >= 0 && slopeEnd > løyperIdx) {
    for (let i = løyperIdx + 1; i < slopeEnd; i += 3) {
      if (i + 2 < slopeEnd) {
        result.slopes.items.push({
          name: texts[i],
          length: texts[i + 1],
          difficulty: texts[i + 2],
        });
      }
    }
  }

  const driftIdx = texts.indexOf('Driftstatus');
  if (driftIdx >= 0) {
    const afterDrift = driftIdx + 1;

    const liftsLabel = texts.indexOf('Åpne heiser', afterDrift);
    if (liftsLabel >= 0 && liftsLabel - afterDrift >= 3) {
      result.lifts.open = parseInt(texts[afterDrift], 10) || 0;
      result.lifts.total = parseInt(texts[afterDrift + 2], 10) || 0;
    }

    const slopesLabel = texts.indexOf('Åpne løyper', liftsLabel > -1 ? liftsLabel : afterDrift);
    const slopesDataStart = liftsLabel + 1;
    if (slopesLabel >= 0 && liftsLabel >= 0 && slopesLabel - liftsLabel >= 4) {
      result.slopes.open = parseInt(texts[slopesDataStart], 10) || 0;
      result.slopes.total = parseInt(texts[slopesDataStart + 2], 10) || 0;
    }
  }

  result.snowProductionPercent = parseSnowProductionPercentFromHtml(html);

  const msgIdx = findTextIndex(
    texts,
    (t) => t === 'Driftsmeldinger' || (t && t.includes('Driftsmelding')),
  );
  const calIdx = findTextIndex(
    texts,
    (t) => t === 'Aktivitetskalender' || (t && t.includes('Aktivitetskalender')),
    msgIdx >= 0 ? msgIdx : 0,
  );
  const msgEnd = calIdx >= 0 ? calIdx : texts.length;

  if (msgIdx >= 0) {
    for (let i = msgIdx + 1; i < msgEnd; ) {
      if (!isDriftsmeldingDateToken(texts[i])) {
        i += 1;
        continue;
      }
      if (i + 2 >= msgEnd) break;
      result.messages.push({
        date: texts[i],
        title: texts[i + 1] || '',
        text: texts[i + 2] || '',
      });
      i += 3;
    }
  }

  if (calIdx >= 0) {
    for (let i = calIdx + 1; i < texts.length; ) {
      const date = texts[i];
      if (!isCalendarDateToken(date)) break;
      if (i + 2 >= texts.length) break;
      result.calendarActivities.push({
        date,
        title: texts[i + 1] || '',
        place: texts[i + 2] || '',
      });
      i += 3;
    }
  }

  result._parseSuccess = heiserIdx >= 0 || løyperIdx >= 0 || driftIdx >= 0;

  return result;
}

function findWeatherSection(texts) {
  for (let i = texts.length - 1; i >= 0; i--) {
    if (texts[i] === 'I dag' && i + 6 < texts.length && texts[i + 4] === '% luftfuktighet') {
      return i;
    }
  }
  return -1;
}

function parseNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(',', '.').replace(/[^-\d.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

module.exports = {
  fetchStatus,
  getResorts,
  RESORTS,
  formatActivityToday,
  formatLatestDriftsmelding,
};
