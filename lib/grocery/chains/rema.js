'use strict';

const { createClient } = require('../http');
const { normalizeStoreName, phonesLooselyMatch } = require('../normalize-name');

const STORES_API = 'https://www.rema.no/wp-json/rema-stores/v1/get-stores-data';
const STORE_PAGE_BASE = 'https://www.rema.no/butikker';
const CACHE_TTL_MS = 5 * 60 * 1000;

const API_DAY_TO_SCHEMA = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

/** @type {{ stores: object[]|null, fetchedAt: number }} */
let cache = { stores: null, fetchedAt: 0 };
/** @type {Promise<object[]>|null} */
let fetchInFlight = null;

function foldAscii(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function municipalitySlugFromName(name) {
  return foldAscii(name)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleCaseToken(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function parseRemaEnvelope(html) {
  if (!html || typeof html !== 'string') return null;
  try {
    const o = JSON.parse(html);
    if (o && o._rema && typeof o._rema === 'object') return o._rema;
  } catch {
    return null;
  }
  return null;
}

function parseDayHours(cell) {
  if (!cell || typeof cell !== 'string') return null;
  const t = cell.trim();
  if (!t || /^stengt$/i.test(t)) return null;
  const m = t.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!m) return null;
  return { opens: m[1], closes: m[2] };
}

function mapSpecialOpeningHours(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const validFrom = row.validFrom || row.from || row.dateFrom;
    const validThrough = row.validThrough || row.to || row.dateTo || validFrom;
    const opens = row.opens || row.open;
    const closes = row.closes || row.close;
    if (validFrom && validThrough && opens && closes) {
      out.push({
        validFrom: String(validFrom),
        validThrough: String(validThrough),
        opens: String(opens),
        closes: String(closes),
      });
    }
  }
  return out;
}

function remaStoreToJsonLd(store) {
  const openingHoursSpecification = [];
  const oh = store.openingHours || {};
  for (const [apiDay, schemaDay] of Object.entries(API_DAY_TO_SCHEMA)) {
    const intv = parseDayHours(oh[apiDay]);
    if (!intv) continue;
    openingHoursSpecification.push({
      dayOfWeek: schemaDay,
      opens: intv.opens,
      closes: intv.closes,
    });
  }
  const specialOpeningHoursSpecification = mapSpecialOpeningHours(oh.specialOpeningHours);

  return {
    '@type': 'GroceryStore',
    name: store.name || '',
    telephone: store.phone ? String(store.phone) : '',
    address: {
      postalCode: store.visitPostCode ? String(store.visitPostCode) : '',
    },
    remaStoreId: String(store.id),
    openingHoursSpecification,
    specialOpeningHoursSpecification,
  };
}

async function ensureStores() {
  const now = Date.now();
  if (cache.stores && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.stores;
  }
  if (fetchInFlight) {
    return fetchInFlight;
  }
  fetchInFlight = (async () => {
    const client = createClient();
    const res = await client.get(STORES_API, {
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
      responseType: 'json',
      validateStatus: (status) => status >= 200 && status < 500,
    });
    if (res.status !== 200 || !res.data || !Array.isArray(res.data.stores)) {
      throw new Error('REMA_STORES_FETCH_FAILED');
    }
    cache = { stores: res.data.stores, fetchedAt: Date.now() };
    return cache.stores;
  })();
  try {
    return await fetchInFlight;
  } finally {
    fetchInFlight = null;
  }
}

/**
 * @returns {Promise<{ slug: string, url: string, label: string, line: string }[]>}
 */
async function listStores() {
  const stores = await ensureStores();
  const out = [];
  for (const store of stores) {
    if (!store || store.id == null) continue;
    const slug = String(store.id);
    const short = titleCaseToken(store.shortName || store.visitPlaceName || '');
    const mun = String(store.municipalityName || '').trim();
    const label = short || slug;
    const mslug = municipalitySlugFromName(store.municipalityName);
    const pathSlug = store.slug ? String(store.slug) : '';
    const region = store.regionSlug ? String(store.regionSlug) : '';
    const url =
      region && mslug && pathSlug
        ? `${STORE_PAGE_BASE}/${encodeURIComponent(region)}/${encodeURIComponent(mslug)}/${encodeURIComponent(pathSlug)}/`
        : `${STORE_PAGE_BASE}/`;
    const line = mun ? `REMA 1000 ${label}, ${mun}` : `REMA 1000 ${label}`;
    out.push({ slug, url, label, line });
  }
  out.sort((a, b) => a.line.localeCompare(b.line, 'nb'));
  return out;
}

function normalizeSlug(input) {
  let s = String(input || '').trim();
  const lower = s.toLowerCase();
  if (lower.includes('rema.no')) {
    try {
      const href = lower.startsWith('http') ? s : `https://${s.replace(/^\/\//, '')}`;
      const u = new URL(href);
      const parts = u.pathname.split('/').filter(Boolean);
      const bi = parts.indexOf('butikker');
      if (bi >= 0 && parts.length >= bi + 4) {
        return parts[parts.length - 1];
      }
      if (parts.length > 0) return parts[parts.length - 1];
    } catch {
      /* fall through */
    }
  }
  return s.replace(/^\/+/, '').replace(/\/+$/, '').trim();
}

function findStoreBySlugOrId(stores, slug) {
  const s = String(slug || '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const id = Number(s);
    return stores.find((x) => x && Number(x.id) === id) || null;
  }
  const lower = s.toLowerCase();
  return stores.find((x) => x && String(x.slug || '').toLowerCase() === lower) || null;
}

/**
 * @param {string} slug
 * @returns {Promise<{ ok: boolean, status: number, slug: string, html?: string }>}
 */
async function fetchPage(slug) {
  const normalized = normalizeSlug(slug);
  let stores;
  try {
    stores = await ensureStores();
  } catch {
    return { ok: false, status: 502, slug: normalized };
  }
  const store = findStoreBySlugOrId(stores, normalized);
  if (!store) {
    return { ok: false, status: 404, slug: normalized };
  }
  const canonical = String(store.id);
  return {
    ok: true,
    status: 200,
    slug: canonical,
    html: JSON.stringify({ _rema: store }),
  };
}

function parseStoreHtml(html) {
  const store = parseRemaEnvelope(html);
  if (!store) {
    return { jsonLd: null, numericId: null };
  }
  const jsonLd = remaStoreToJsonLd(store);
  return {
    jsonLd,
    numericId: String(store.id),
  };
}

function canonicalSlugFromParsed(jsonLd) {
  if (jsonLd && jsonLd.remaStoreId) return String(jsonLd.remaStoreId);
  return null;
}

function shouldAvoidStore(store, avoidSlug) {
  if (!avoidSlug) return false;
  const a = String(avoidSlug).trim();
  if (String(store.id) === a) return true;
  if (String(store.slug || '').toLowerCase() === a.toLowerCase()) return true;
  return false;
}

function storeMatchesIdentity(store, expectedNumericId, refs, refName) {
  if (expectedNumericId && String(store.id) === String(expectedNumericId)) {
    return true;
  }
  if (refs && refs.telephone && refs.postalCode) {
    if (
      phonesLooselyMatch(store.phone, refs.telephone)
      && String(store.visitPostCode || '') === String(refs.postalCode)
    ) {
      return true;
    }
  }
  if (refName && store.name) {
    if (normalizeStoreName(store.name) === normalizeStoreName(refName)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {object[]} stores
 * @param {string|null} numericId
 * @param {{ telephone?: string|null, postalCode?: string|null }} refs
 * @param {string} [avoidSlug]
 * @param {string|null} [refName]
 * @returns {string|null}
 */
function resolveSlugByIdentityFromStoreList(stores, numericId, refs, avoidSlug, refName) {
  if (!Array.isArray(stores)) return null;
  for (const store of stores) {
    if (!store || shouldAvoidStore(store, avoidSlug)) continue;
    if (storeMatchesIdentity(store, numericId, refs, refName)) {
      return String(store.id);
    }
  }
  return null;
}

/**
 * @param {string|null} numericId
 * @param {{ telephone?: string|null, postalCode?: string|null }} refs
 * @param {string} [avoidSlug]
 * @param {string|null} [refName]
 * @returns {Promise<string|null>}
 */
async function resolveSlugByIdentityFromCache(numericId, refs, avoidSlug, refName) {
  let stores;
  try {
    stores = await ensureStores();
  } catch {
    return null;
  }
  return resolveSlugByIdentityFromStoreList(stores, numericId, refs, avoidSlug, refName);
}

function matchesStoreIdentity(html, expectedNumericId, refs, refName) {
  const store = parseRemaEnvelope(html);
  if (!store) return false;
  return storeMatchesIdentity(store, expectedNumericId, refs, refName);
}

module.exports = {
  id: 'rema',
  pairingEnabled: true,
  labelEn: 'REMA 1000',
  labelNo: 'REMA 1000',
  listStores,
  normalizeSlug,
  fetchPage,
  parseStoreHtml,
  matchesStoreIdentity,
  canonicalSlugFromParsed,
  resolveSlugByIdentityFromCache,
  resolveSlugByIdentityFromStoreList,
};
