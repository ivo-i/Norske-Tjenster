'use strict';

const { getChain, listChainsForPairing } = require('./registry');
const {
  fetchStorePage,
  loadStoreBySlug,
  fetchStoreEntries,
  fetchMergedStoreEntriesForPairing,
} = require('./fetch');
const { resolveSlugByIdentity, SCAN_DELAY_MS } = require('./repair');
const { computeShopStatus } = require('./status');
const { normalizeStoreName } = require('./normalize-name');

module.exports = {
  getChain,
  listChainsForPairing,
  fetchStorePage,
  loadStoreBySlug,
  fetchStoreEntries,
  fetchMergedStoreEntriesForPairing,
  resolveSlugByIdentity,
  SCAN_DELAY_MS,
  computeShopStatus,
  normalizeStoreName,
};
