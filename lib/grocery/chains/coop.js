'use strict';

const { createClient, bodyToUtf8 } = require('../http');
const { extractCoopStoreJsonLd } = require('../parse-coop-ld');
const { normalizeStoreName, phonesLooselyMatch } = require('../normalize-name');

const SITEMAP_URL = 'https://www.coop.no/api/sitemap/nb-NO/0/sitemap.xml';
const STORE_BASE = 'https://www.coop.no/butikker';

/** First path segment allowlist (grocery banners only). */
const BANNER_ALLOWLIST = new Set(['extra', 'coop-mega', 'coop-prix', 'coop-marked-matkroken']);

function slugToLabel(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function titleCaseBanner(seg) {
  return String(seg || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function coopPlaceLabel(banner, storeSegment) {
  const b = titleCaseBanner(banner);
  let rest = String(storeSegment || '');
  const pref = `${banner}-`;
  if (rest.toLowerCase().startsWith(pref)) {
    rest = rest.slice(pref.length);
  }
  let tail = slugToLabel(rest).trim();
  tail = tail.replace(/\s+\d+$/, '').trim();
  return `${b} ${tail}`.trim();
}

function numericIdFromCoopSlug(fullSlug) {
  const parts = String(fullSlug || '').split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const m = last.match(/-(\d+)$/);
  return m ? m[1] : null;
}

function numericIdFromCoopHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const m = html.match(/\/butikker\/[a-z0-9-]+\/[a-z0-9-]+-(\d{3,10})(?:["'/]|\s|$)/i);
  return m ? m[1] : null;
}

function parseButikkUrlsFromSitemapXml(raw) {
  const out = [];
  const locRe = /<loc>\s*(https?:\/\/www\.coop\.no\/butikker\/[^<]+)\s*<\/loc>/gi;
  let m;
  while ((m = locRe.exec(raw)) !== null) {
    let href = m[1].replace(/\/$/, '').trim();
    try {
      const u = new URL(href);
      const segs = u.pathname.split('/').filter(Boolean);
      const bi = segs.indexOf('butikker');
      if (bi < 0 || segs.length < bi + 3) continue;
      const banner = segs[bi + 1].toLowerCase();
      const storeSeg = segs[bi + 2];
      if (!BANNER_ALLOWLIST.has(banner)) continue;
      out.push({ banner, storeSeg, href: `${u.origin}/butikker/${banner}/${storeSeg}` });
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * @returns {Promise<{ slug: string, url: string, label: string }[]>}
 */
async function listStores() {
  const client = createClient();
  const res = await client.get(SITEMAP_URL, {
    responseType: 'text',
    transformResponse: [(body) => body],
  });
  if (res.status !== 200) {
    throw new Error('SITEMAP_FETCH_FAILED');
  }
  let raw = res.data;
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  else if (raw != null && typeof raw !== 'string') raw = String(raw);
  if (!raw || typeof raw !== 'string') {
    throw new Error('SITEMAP_FETCH_FAILED');
  }
  const seen = new Set();
  const out = [];
  for (const { banner, storeSeg, href } of parseButikkUrlsFromSitemapXml(raw)) {
    const slug = `${banner}/${storeSeg}`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      url: `${href}/`,
      label: coopPlaceLabel(banner, storeSeg),
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'nb'));
  return out;
}

function normalizeSlug(input) {
  let s = String(input || '').trim();
  const lower = s.toLowerCase();
  const prefixes = [
    'https://www.coop.no/butikker/',
    'https://www.coop.no/butikker',
    'http://www.coop.no/butikker/',
    'http://www.coop.no/butikker',
    'https://coop.no/butikker/',
    'https://coop.no/butikker',
    'http://coop.no/butikker/',
    'http://coop.no/butikker',
  ];
  for (const p of prefixes) {
    if (lower.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }
  s = s.replace(/^\/+/, '').replace(/\/+$/, '').trim();
  const parts = s.split('/').filter(Boolean);
  if (parts.length !== 2) return '';
  const bannerLc = parts[0].toLowerCase();
  if (!BANNER_ALLOWLIST.has(bannerLc)) return '';
  return `${bannerLc}/${parts[1]}`;
}

/**
 * @param {string} slug
 * @returns {Promise<{ ok: boolean, status: number, slug: string, html?: string }>}
 */
async function fetchPage(slug) {
  const normalized = normalizeSlug(slug);
  if (!normalized) {
    return { ok: false, status: 404, slug: String(slug || '').trim(), html: '' };
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length !== 2) {
    return { ok: false, status: 404, slug: normalized, html: '' };
  }
  const [a, b] = parts;
  const url = `${STORE_BASE}/${encodeURIComponent(a)}/${encodeURIComponent(b)}/`;
  const client = createClient();
  const res = await client.get(url);
  return {
    ok: res.status === 200,
    status: res.status,
    slug: normalized,
    html: bodyToUtf8(res.data),
  };
}

function parseStoreHtml(html) {
  return {
    jsonLd: extractCoopStoreJsonLd(html),
    numericId: numericIdFromCoopHtml(html),
  };
}

function htmlSuggestsNumericStoreId(html, expectedNumericId) {
  if (!html || !expectedNumericId) return false;
  const id = String(expectedNumericId);
  if (!/^\d+$/.test(id)) return false;
  const tail = `-${id}`;
  return html.includes(tail) && html.includes('coop.no/butikker');
}

/**
 * Resolve slug from sitemap list only (no per-store HTML). Coop slugs encode numeric id in the tail.
 * @param {{ slug: string, label?: string }[]} entries
 * @param {string|null} numericId
 * @param {{ telephone?: string|null, postalCode?: string|null }} refs
 * @param {string} [avoidSlug]
 * @param {string|null} [refName]
 * @returns {string|null}
 */
function pickCoopSlugFromEntryList(entries, numericId, refs, avoidSlug, refName) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const avoid = avoidSlug != null ? String(avoidSlug).trim() : '';
  const idStr = numericId != null && String(numericId).trim() !== '' ? String(numericId).trim() : '';

  if (idStr) {
    const byId = entries.filter((e) => e && e.slug && e.slug !== avoid && numericIdFromCoopSlug(e.slug) === idStr);
    if (byId.length === 1) return byId[0].slug;
    if (byId.length > 1 && refName) {
      const want = normalizeStoreName(refName);
      const narrowed = byId.filter((e) => normalizeStoreName(e.label || '') === want);
      if (narrowed.length === 1) return narrowed[0].slug;
    }
    if (byId.length > 0) return byId[0].slug;
  }

  if (refs && refs.telephone && refs.postalCode) {
    return null;
  }

  if (refName) {
    const want = normalizeStoreName(refName);
    const byName = entries.filter(
      (e) => e && e.slug && e.slug !== avoid && normalizeStoreName(e.label || '') === want,
    );
    if (byName.length === 1) return byName[0].slug;
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
  let entries;
  try {
    entries = await listStores();
  } catch {
    return null;
  }
  return pickCoopSlugFromEntryList(entries, numericId, refs, avoidSlug, refName);
}

function matchesStoreIdentity(html, expectedNumericId, refs, refName) {
  const ld = extractCoopStoreJsonLd(html);
  if (!ld) return false;
  if (expectedNumericId && htmlSuggestsNumericStoreId(html, expectedNumericId)) {
    return true;
  }
  const addr = ld.address || {};
  if (refs && refs.telephone && refs.postalCode && ld.telephone) {
    if (
      phonesLooselyMatch(ld.telephone, refs.telephone)
      && String(addr.postalCode || '').trim() === String(refs.postalCode || '').trim()
    ) {
      return true;
    }
  }
  if (refName && ld.name) {
    if (normalizeStoreName(ld.name) === normalizeStoreName(refName)) return true;
  }
  return false;
}

/** Optional: derive settings numeric id from `banner/store-slug` tail (not GLN). */
function slugDerivedNumericId(slug) {
  return numericIdFromCoopSlug(slug);
}

module.exports = {
  id: 'coop',
  pairingEnabled: true,
  labelEn: 'Coop',
  labelNo: 'Coop',
  BANNER_ALLOWLIST,
  listStores,
  slugToLabel,
  normalizeSlug,
  fetchPage,
  parseStoreHtml,
  matchesStoreIdentity,
  slugDerivedNumericId,
  parseButikkUrlsFromSitemapXml,
  numericIdFromCoopSlug,
  pickCoopSlugFromEntryList,
  resolveSlugByIdentityFromCache,
};
