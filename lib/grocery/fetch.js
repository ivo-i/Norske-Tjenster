'use strict';

const { getChain, listChainsForPairing } = require('./registry');
const { buildGroceryPairingLine } = require('./pairing-display');

/**
 * @param {string} chainId
 * @param {string} slug
 * @returns {Promise<{ ok: boolean, status: number, slug: string, html?: string }>}
 */
async function fetchStorePage(chainId, slug) {
  const chain = getChain(chainId);
  return chain.fetchPage(slug);
}

/**
 * @param {string} chainId
 * @param {string} slug
 * @returns {Promise<{ slug: string, name: string, numericId: string|null, jsonLd: object, telephone: string|null, postalCode: string|null }>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadStoreBySlug(chainId, slug) {
  const chain = getChain(chainId);
  const normalized = chain.normalizeSlug(slug);
  let page = await chain.fetchPage(normalized);
  if (!page.ok || !page.html) {
    const err = new Error(page.status === 404 ? 'STORE_NOT_FOUND' : 'STORE_FETCH_FAILED');
    err.status = page.status;
    throw err;
  }
  let { jsonLd, numericId: parsedNumericId } = chain.parseStoreHtml(page.html);
  if (page.ok && page.html && !jsonLd) {
    await sleep(600);
    page = await chain.fetchPage(normalized);
    if (!page.ok || !page.html) {
      const err = new Error(page.status === 404 ? 'STORE_NOT_FOUND' : 'STORE_FETCH_FAILED');
      err.status = page.status;
      throw err;
    }
    ({ jsonLd, numericId: parsedNumericId } = chain.parseStoreHtml(page.html));
  }
  if (!jsonLd) {
    const err = new Error('STORE_PARSE_FAILED');
    err.status = page.status;
    throw err;
  }
  const addr = jsonLd.address || {};
  const telephone = jsonLd.telephone || null;
  const postalCode = addr.postalCode || null;
  let outSlug = normalized;
  if (typeof chain.canonicalSlugFromParsed === 'function') {
    const c = chain.canonicalSlugFromParsed(jsonLd);
    if (c) outSlug = c;
  }
  let numericId = parsedNumericId;
  if ((numericId == null || numericId === '') && typeof chain.slugDerivedNumericId === 'function') {
    const fromSlug = chain.slugDerivedNumericId(outSlug);
    if (fromSlug) numericId = fromSlug;
  }
  return {
    slug: outSlug,
    name: jsonLd.name || normalized,
    numericId,
    jsonLd,
    telephone,
    postalCode,
  };
}

/**
 * @param {string} chainId
 * @returns {Promise<{ slug: string, url: string, label: string }[]>}
 */
async function fetchStoreEntries(chainId) {
  const chain = getChain(chainId);
  return chain.listStores();
}

/**
 * All stores from every pairing-enabled chain, for a single pairing screen.
 * @param {'en'|'no'} lang
 * @returns {Promise<{ chainId: string, slug: string, label: string, line: string }[]>}
 */
async function fetchMergedStoreEntriesForPairing(lang) {
  const chains = listChainsForPairing();
  const results = await Promise.all(
    chains.map(async (c) => {
      try {
        const list = await fetchStoreEntries(c.id);
        return { id: c.id, list };
      } catch (err) {
        console.error(`[grocery] listStores failed for chain ${c.id}:`, err && err.message ? err.message : err);
        return { id: c.id, list: null };
      }
    }),
  );
  const out = [];
  for (const { id: chainId, list } of results) {
    const chain = getChain(chainId);
    const chainLabel = lang === 'no' ? chain.labelNo : chain.labelEn;
    if (!Array.isArray(list) || list.length === 0) {
      continue;
    }
    for (const row of list) {
      if (!row || !row.slug) continue;
      const line = buildGroceryPairingLine(chainId, chainLabel, row);
      out.push({
        chainId,
        slug: row.slug,
        label: row.label || row.slug,
        line,
      });
    }
  }
  const loc = lang === 'no' ? 'nb' : 'en';
  out.sort((a, b) => a.line.localeCompare(b.line, loc));
  return out;
}

module.exports = {
  fetchStorePage,
  loadStoreBySlug,
  fetchStoreEntries,
  fetchMergedStoreEntriesForPairing,
};
