'use strict';

/** Luxon weekday: Monday = 1 … Sunday = 7 */
const NUM_TO_DAY = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

const LOWER_TO_DAY = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function isStoreLikeType(types) {
  if (!types) return false;
  if (Array.isArray(types)) {
    return types.includes('Store') || types.includes('LocalBusiness') || types.includes('GroceryStore');
  }
  return types === 'Store' || types === 'LocalBusiness' || types === 'GroceryStore';
}

function normalizeSingleDayToken(token) {
  if (token == null) return null;
  if (typeof token === 'number' && token >= 1 && token <= 7) {
    return NUM_TO_DAY[token];
  }
  const asNum = Number(token);
  if (
    Number.isFinite(asNum)
    && asNum >= 1
    && asNum <= 7
    && String(token).trim() === String(asNum)
  ) {
    return NUM_TO_DAY[asNum];
  }
  const s = String(token).toLowerCase().trim();
  if (LOWER_TO_DAY[s]) return LOWER_TO_DAY[s];
  for (const [k, dayName] of Object.entries(LOWER_TO_DAY)) {
    if (s.includes(k)) return dayName;
  }
  if (s.includes('schema.org')) {
    for (const [k, dayName] of Object.entries(LOWER_TO_DAY)) {
      if (s.includes(k)) return dayName;
    }
  }
  return null;
}

/**
 * @param {unknown} dayOfWeek
 * @returns {string[]}
 */
function expandDayOfWeek(dayOfWeek) {
  if (dayOfWeek == null) return [];
  if (Array.isArray(dayOfWeek)) {
    const out = [];
    for (const t of dayOfWeek) {
      const d = normalizeSingleDayToken(t);
      if (d) out.push(d);
    }
    return out;
  }
  const d = normalizeSingleDayToken(dayOfWeek);
  return d ? [d] : [];
}

/**
 * @param {{ dayOfWeek?: unknown, opens?: string, closes?: string }[]} rows
 */
function flattenOpeningHoursSpecification(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!row || !row.opens || !row.closes) continue;
    const days = expandDayOfWeek(row.dayOfWeek);
    if (days.length === 0) continue;
    for (const dayOfWeek of days) {
      out.push({
        dayOfWeek,
        opens: String(row.opens),
        closes: String(row.closes),
      });
    }
  }
  return out;
}

/**
 * Coop JSON-LD often has bare OpeningHoursSpecification rows (no opens/closes) for closed days,
 * plus a duplicate wrong row with hours for the same day. Treat bare rows as explicitly closed.
 * @param {unknown[]} rows raw LD rows
 * @returns {Set<string>} schema day names e.g. Sunday
 */
function bareClosedWeekdaysFromCoopLdRows(rows) {
  const closed = new Set();
  if (!Array.isArray(rows)) return closed;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const opens = row.opens || row.open;
    const closes = row.closes || row.close;
    if (opens && closes) continue;
    for (const d of expandDayOfWeek(row.dayOfWeek)) {
      closed.add(d);
    }
  }
  return closed;
}

/** @param {string|undefined} s */
function toIsoDateOnly(s) {
  if (!s) return s;
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  return str;
}

function normalizeSpecialSpecs(specs) {
  if (!Array.isArray(specs)) return [];
  const out = [];
  for (const spec of specs) {
    if (!spec || typeof spec !== 'object') continue;
    const validFrom = toIsoDateOnly(spec.validFrom);
    const validThrough = toIsoDateOnly(spec.validThrough || spec.validTo || spec.validFrom);
    if (!validFrom || !validThrough) continue;
    const opens = spec.opens || spec.open;
    const closes = spec.closes || spec.close;
    if (opens && closes) {
      out.push({
        validFrom,
        validThrough,
        opens: String(opens),
        closes: String(closes),
      });
    } else {
      out.push({ validFrom, validThrough });
    }
  }
  return out;
}

/**
 * @param {object} store raw Store / LocalBusiness from Coop JSON-LD
 */
function normalizeCoopStoreObject(store) {
  const addr = store.address && typeof store.address === 'object' ? store.address : {};
  const postalCode = addr.postalCode != null ? String(addr.postalCode) : '';
  let openingHoursSpecification = flattenOpeningHoursSpecification(store.openingHoursSpecification);
  const bareClosed = bareClosedWeekdaysFromCoopLdRows(store.openingHoursSpecification);
  if (bareClosed.size > 0) {
    openingHoursSpecification = openingHoursSpecification.filter((r) => !bareClosed.has(r.dayOfWeek));
  }
  const specialOpeningHoursSpecification = normalizeSpecialSpecs(store.specialOpeningHoursSpecification);

  return {
    '@type': 'GroceryStore',
    name: store.name ? String(store.name) : '',
    telephone: store.telephone != null ? String(store.telephone) : '',
    address: { postalCode },
    openingHoursSpecification,
    specialOpeningHoursSpecification,
  };
}

/** Coop embeds authoritative hours in INITIAL_DATA (ISO weekday 1=Mon…7=Sun, closed flag). */
function hhmmFromCoopInitialTime(t) {
  if (t == null) return null;
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * @param {string} html
 * @returns {{ dayOfWeek: string, opens: string, closes: string }[]|null}
 */
function parseCoopInitialOpeningHoursFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const m = html.match(/"openingHours":(\[[\s\S]*?\]),"specOpeningHours"/);
  if (!m) return null;
  let arr;
  try {
    arr = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  /** @type {Record<number, object>} */
  const lastByDow = {};
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const d = row.dayOfWeek;
    if (typeof d !== 'number' || d < 1 || d > 7) continue;
    lastByDow[d] = row;
  }
  const out = [];
  for (let dow = 1; dow <= 7; dow += 1) {
    const row = lastByDow[dow];
    if (!row || row.closed === true) continue;
    const opens = hhmmFromCoopInitialTime(row.from1);
    const closes = hhmmFromCoopInitialTime(row.to1);
    if (!opens || !closes) continue;
    out.push({
      dayOfWeek: NUM_TO_DAY[dow],
      opens,
      closes,
    });
  }
  return out.length > 0 ? out : null;
}

/** Coop avvikende åpningstider: DD.MM.YYYY in INITIAL_DATA.specOpeningHours */
function parseCoopNorwegianCalendarDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Avvikende åpningstider from INITIAL_DATA (same payload as vanlige åpningstider).
 * @returns {object[]|null} null if absent/unparseable
 */
function parseCoopInitialSpecOpeningHoursFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const m = html.match(/"specOpeningHours":(\[[\s\S]*?\]),"address"/);
  if (!m) return null;
  let arr;
  try {
    arr = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const iso = parseCoopNorwegianCalendarDate(row.date);
    if (!iso) continue;
    if (row.closed === true) {
      out.push({ validFrom: iso, validThrough: iso });
      continue;
    }
    if (row.closed === false && row.from1 != null && row.to1 != null) {
      const opens = hhmmFromCoopInitialTime(row.from1);
      const closes = hhmmFromCoopInitialTime(row.to1);
      if (opens && closes) out.push({ validFrom: iso, validThrough: iso, opens, closes });
    }
  }
  return out;
}

/**
 * Find Store-like JSON-LD with opening hours in Coop HTML.
 * Prefer INITIAL_DATA.openingHours when present (JSON-LD is often incomplete vs Coop’s own UI).
 * @param {string} html
 * @returns {object|null} shape compatible with computeShopStatus
 */
function extractCoopStoreJsonLd(html) {
  if (!html || typeof html !== 'string') return null;
  const initialSpecs = parseCoopInitialOpeningHoursFromHtml(html);
  const initialSpecials = parseCoopInitialSpecOpeningHoursFromHtml(html);
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const candidates = Array.isArray(data) ? data : [data];
    for (const obj of candidates) {
      if (!obj || typeof obj !== 'object') continue;
      if (!isStoreLikeType(obj['@type'])) continue;
      const hasLdHours = Array.isArray(obj.openingHoursSpecification) && obj.openingHoursSpecification.length > 0;
      if (!hasLdHours && !(initialSpecs && initialSpecs.length > 0)) continue;
      const normalized = normalizeCoopStoreObject({
        ...obj,
        openingHoursSpecification: hasLdHours ? obj.openingHoursSpecification : [],
      });
      if (initialSpecs && initialSpecs.length > 0) {
        normalized.openingHoursSpecification = initialSpecs;
      }
      if (initialSpecials !== null && initialSpecials.length > 0) {
        normalized.specialOpeningHoursSpecification = initialSpecials;
      }
      return normalized;
    }
  }
  return null;
}

module.exports = {
  extractCoopStoreJsonLd,
  parseCoopInitialOpeningHoursFromHtml,
  parseCoopInitialSpecOpeningHoursFromHtml,
  flattenOpeningHoursSpecification,
  expandDayOfWeek,
  normalizeCoopStoreObject,
  bareClosedWeekdaysFromCoopLdRows,
  normalizeSpecialSpecs,
};
