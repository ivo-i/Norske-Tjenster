'use strict';

const { createClient } = require('../http');
const { extractGroceryJsonLd, extractMenyStoreNumericId } = require('../parse-meny-page');
const { normalizeStoreName } = require('../normalize-name');

const SITEMAP_URL = 'https://meny.no/sitemap/content.xml';
const STORE_BASE = 'https://meny.no/finn-butikk';

function slugToLabel(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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
  if (Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  } else if (raw != null && typeof raw !== 'string') {
    raw = String(raw);
  }
  if (!raw || typeof raw !== 'string') {
    throw new Error('SITEMAP_FETCH_FAILED');
  }
  const seen = new Set();
  const out = [];
  const locRe = /<loc>(https:\/\/meny\.no\/finn-butikk\/[^<]+)<\/loc>/gi;
  let m;
  while ((m = locRe.exec(raw)) !== null) {
    const url = m[1].replace(/\/$/, '');
    const slug = url.split('/').pop();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      url: `${url}/`,
      label: slugToLabel(slug),
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'nb'));
  return out;
}

function normalizeSlug(input) {
  let s = (input || '').trim().toLowerCase();
  const prefix = 'https://meny.no/finn-butikk/';
  if (s.startsWith(prefix)) {
    s = s.slice(prefix.length);
  }
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return s;
}

/**
 * @param {string} slug
 * @returns {Promise<{ ok: boolean, status: number, slug: string, html?: string }>}
 */
async function fetchPage(slug) {
  const normalized = normalizeSlug(slug);
  const url = `${STORE_BASE}/${encodeURIComponent(normalized)}/`;
  const client = createClient();
  const res = await client.get(url);
  return {
    ok: res.status === 200,
    status: res.status,
    slug: normalized,
    html: typeof res.data === 'string' ? res.data : '',
  };
}

function parseStoreHtml(html) {
  return {
    jsonLd: extractGroceryJsonLd(html),
    numericId: extractMenyStoreNumericId(html),
  };
}

function matchesStoreIdentity(html, expectedNumericId, refs, refName) {
  const id = extractMenyStoreNumericId(html);
  if (expectedNumericId && id === String(expectedNumericId)) return true;
  if (refs && refs.telephone && refs.postalCode) {
    const ld = extractGroceryJsonLd(html);
    if (!ld) return false;
    const addr = ld.address || {};
    if (ld.telephone === refs.telephone && addr.postalCode === refs.postalCode) return true;
  }
  if (refName) {
    const ld = extractGroceryJsonLd(html);
    if (ld && ld.name && normalizeStoreName(ld.name) === normalizeStoreName(refName)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  id: 'meny',
  pairingEnabled: true,
  labelEn: 'Meny',
  labelNo: 'Meny',
  listStores,
  slugToLabel,
  normalizeSlug,
  fetchPage,
  parseStoreHtml,
  matchesStoreIdentity,
};
