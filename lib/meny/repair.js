'use strict';

const grocery = require('../grocery');

async function resolveSlugByIdentity(numericId, refs, avoidSlug, refName) {
  return grocery.resolveSlugByIdentity('meny', numericId, refs, avoidSlug, refName);
}

module.exports = {
  resolveSlugByIdentity,
  SCAN_DELAY_MS: grocery.SCAN_DELAY_MS,
};
