'use strict';

const constants = require('./constants');
const { fetchStoreEntries, slugToLabel } = require('./sitemap');
const {
  loadStoreBySlug,
  fetchStorePage,
  normalizeSlug,
  normalizeMenyStoreName,
  matchesStoreIdentity,
} = require('./fetch-store');
const { extractGroceryJsonLd, extractGroceryStoreNumericId } = require('./parse-page');
const { computeShopStatus } = require('./status');
const { resolveSlugByIdentity } = require('./repair');

module.exports = {
  ...constants,
  fetchStoreEntries,
  slugToLabel,
  loadStoreBySlug,
  fetchStorePage,
  normalizeSlug,
  normalizeMenyStoreName,
  matchesStoreIdentity,
  extractGroceryJsonLd,
  extractGroceryStoreNumericId,
  computeShopStatus,
  resolveSlugByIdentity,
};
