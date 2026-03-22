'use strict';

/**
 * Pairing list line: "{chainLabel} {place}" — no colon, no slug in parentheses,
 * no duplicate brand or Kiwi numeric segment in the place part.
 */

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripLeadingBrand(text, brand) {
  let t = String(text || '').trim();
  if (!t || !brand) return t;
  const re = new RegExp(`^${escapeRegex(String(brand).trim())}\\s+`, 'i');
  return t.replace(re, '').trim();
}

/** Remove leading numeric token (Kiwi slug segment e.g. 390). */
function stripLeadingNumericSegment(text) {
  return String(text || '').replace(/^\d+\s+/, '').trim();
}

/**
 * @param {string} chainId
 * @param {string} chainLabel e.g. Kiwi, Meny (display form)
 * @param {{ label?: string, slug?: string, line?: string }} row
 * @returns {string}
 */
function buildGroceryPairingLine(chainId, chainLabel, row) {
  if (row.line != null && String(row.line).trim() !== '') {
    return String(row.line).trim();
  }
  const rawLabel = (row.label || row.slug || '').trim();
  let place = stripLeadingBrand(rawLabel, chainLabel);

  if (chainId === 'kiwi') {
    place = stripLeadingNumericSegment(place);
    place = stripLeadingBrand(place, chainLabel);
    place = stripLeadingNumericSegment(place);
  } else if (chainId === 'meny') {
    place = stripLeadingBrand(place, 'Meny');
  } else if (chainId === 'joker') {
    place = stripLeadingBrand(place, 'Joker');
  } else if (chainId === 'coop') {
    place = stripLeadingBrand(place, 'Coop');
  }

  if (!place) {
    place = rawLabel || String(row.slug || '').trim();
  }

  return `${chainLabel} ${place}`.trim();
}

/**
 * Device title at pair time: avoid "Joker Joker X" / "Coop Coop Prix X" when jsonLd.name already includes the brand.
 */
function pairedGroceryDeviceTitle(chainId, chainLabel, storeName) {
  const label = String(chainLabel || '').trim();
  let place = String(storeName || '').trim();
  place = stripLeadingBrand(place, label);
  if (chainId === 'coop') {
    place = stripLeadingBrand(place, 'Coop');
  }
  if (chainId === 'rema') {
    place = stripLeadingBrand(place, 'REMA 1000');
  }
  if (!place) place = String(storeName || '').trim();
  return `${label} ${place}`.trim();
}

module.exports = {
  buildGroceryPairingLine,
  pairedGroceryDeviceTitle,
  stripLeadingBrand,
  stripLeadingNumericSegment,
};
