'use strict';

const { getChain } = require('./registry');

const SCAN_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} chainId
 * @param {string|null} numericId
 * @param {{ telephone?: string|null, postalCode?: string|null }} refs
 * @param {string} [avoidSlug]
 * @param {string|null} [refName]
 * @returns {Promise<string|null>}
 */
async function resolveSlugByIdentity(chainId, numericId, refs, avoidSlug, refName) {
  const chain = getChain(chainId);
  if (typeof chain.resolveSlugByIdentityFromCache === 'function') {
    return chain.resolveSlugByIdentityFromCache(numericId, refs, avoidSlug, refName);
  }
  const entries = await chain.listStores();
  const ordered = [];
  if (avoidSlug) {
    ordered.push(...entries.filter((e) => e.slug !== avoidSlug));
  } else {
    ordered.push(...entries);
  }

  for (const e of ordered) {
    const page = await chain.fetchPage(e.slug);
    await sleep(SCAN_DELAY_MS);
    if (!page.ok || !page.html) continue;
    if (chain.matchesStoreIdentity(page.html, numericId, refs, refName)) {
      return e.slug;
    }
  }
  return null;
}

module.exports = {
  resolveSlugByIdentity,
  SCAN_DELAY_MS,
};
