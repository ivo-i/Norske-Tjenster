'use strict';

const grocery = require('../grocery');
const menyChain = require('../grocery/chains/meny');
const { normalizeStoreName } = require('../grocery/normalize-name');

function normalizeMenyStoreName(name) {
  return normalizeStoreName(name);
}

async function fetchStorePage(slug) {
  return grocery.fetchStorePage('meny', slug);
}

async function loadStoreBySlug(slug) {
  return grocery.loadStoreBySlug('meny', slug);
}

function normalizeSlug(input) {
  return menyChain.normalizeSlug(input);
}

function matchesStoreIdentity(html, expectedNumericId, refs, refName) {
  return menyChain.matchesStoreIdentity(html, expectedNumericId, refs, refName);
}

module.exports = {
  fetchStorePage,
  normalizeSlug,
  normalizeMenyStoreName,
  loadStoreBySlug,
  matchesStoreIdentity,
};
