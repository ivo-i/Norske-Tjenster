'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const RESORTS = {
  oslo: { slug: 'oslo', name: 'Skimore Oslo' },
  drammen: { slug: 'drammen', name: 'Skimore Drammen' },
  kongsberg: { slug: 'kongsberg', name: 'Skimore Kongsberg' },
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
    snowProductionStatus: null,
    messages: [],
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

  const snowIdx = texts.indexOf('Status snøproduksjon');
  if (snowIdx >= 0) {
    const next = texts[snowIdx + 1];
    if (next && !/^\d+%$/.test(next)) {
      result.snowProductionStatus = next;
    }
  }

  const msgIdx = texts.indexOf('Driftsmeldinger');
  const calIdx = texts.indexOf('Aktivitetskalender', msgIdx > -1 ? msgIdx : 0);
  const msgEnd = calIdx >= 0 ? calIdx : texts.length;
  if (msgIdx >= 0) {
    for (let i = msgIdx + 1; i < msgEnd; i += 3) {
      const date = texts[i];
      if (!date || !/^\d{2}\.\d{2}$/.test(date)) break;
      if (i + 2 >= texts.length) break;
      result.messages.push({
        date: texts[i],
        title: texts[i + 1] || '',
        text: texts[i + 2] || '',
      });
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

module.exports = { fetchStatus, getResorts, RESORTS };
