'use strict';

const grocery = require('../grocery');
const menyChain = require('../grocery/chains/meny');

async function fetchStoreEntries() {
  return grocery.fetchStoreEntries('meny');
}

module.exports = {
  fetchStoreEntries,
  slugToLabel: menyChain.slugToLabel,
};
