'use strict';

const meny = require('./chains/meny');
const kiwi = require('./chains/kiwi');
const joker = require('./chains/joker');
const rema = require('./chains/rema');
const coop = require('./chains/coop');

/** @type {Record<string, typeof meny>} */
const CHAINS = {
  meny,
  kiwi,
  joker,
  rema,
  coop,
};

function getChain(chainId) {
  const c = CHAINS[chainId];
  if (!c) {
    const err = new Error('UNKNOWN_GROCERY_CHAIN');
    err.chainId = chainId;
    throw err;
  }
  return c;
}

/**
 * Chains shown in pairing step 1 (brand).
 * @returns {{ id: string, labelEn: string, labelNo: string }[]}
 */
function listChainsForPairing() {
  return Object.values(CHAINS)
    .filter((c) => c.pairingEnabled)
    .map((c) => ({
      id: c.id,
      labelEn: c.labelEn,
      labelNo: c.labelNo,
    }));
}

module.exports = {
  CHAINS,
  getChain,
  listChainsForPairing,
};
