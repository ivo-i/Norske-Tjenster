'use strict';

const { getChain, listChainsForPairing } = require('./registry');

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
async function loadStoreBySlug(chainId, slug) {
  const chain = getChain(chainId);
  const normalized = chain.normalizeSlug(slug);
  const page = await chain.fetchPage(normalized);
  if (!page.ok || !page.html) {
    const err = new Error(page.status === 404 ? 'STORE_NOT_FOUND' : 'STORE_FETCH_FAILED');
    err.status = page.status;
    throw err;
  }
  const { jsonLd, numericId } = chain.parseStoreHtml(page.html);
  if (!jsonLd) {
    const err = new Error('STORE_PARSE_FAILED');
    err.status = page.status;
    throw err;
  }
  const addr = jsonLd.address || {};
  const telephone = jsonLd.telephone || null;
  const postalCode = addr.postalCode || null;
  return {
    slug: normalized,
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
  const out = [];
  for (const c of chains) {
    const chain = getChain(c.id);
    const chainLabel = lang === 'no' ? chain.labelNo : chain.labelEn;
    let list;
    try {
      list = await fetchStoreEntries(c.id);
    } catch {
      continue;
    }
    if (!Array.isArray(list) || list.length === 0) {
      continue;
    }
    for (const row of list) {
      if (!row || !row.slug) continue;
      out.push({
        chainId: c.id,
        slug: row.slug,
        label: row.label || row.slug,
        line: `${chainLabel}: ${row.label || row.slug} (${row.slug})`,
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
