'use strict';

/**
 * Extract numeric store id from Norwegian grocery site HTML (finn-butikk#?q=…).
 * @param {string} html
 * @returns {string|null}
 */
function extractGroceryStoreNumericId(html) {
  if (!html) return null;
  let best = null;
  const patterns = [
    /finn-butikk#\?q=(\d{6,20})/g,
    /finn-butikk#\\?\?q=(\d{6,20})/g,
    /\/finn-butikk#[^"']*q=(\d{6,20})/g,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      best = m[1];
    }
  }
  return best;
}

/**
 * Parse GroceryStore JSON-LD embedded in Next.js __next_s push.
 * @param {string} html
 * @returns {object|null}
 */
function extractGroceryJsonLd(html) {
  if (!html || html.indexOf('"type":"application/ld+json"') === -1) return null;
  const needle = '"type":"application/ld+json"';
  let pos = 0;
  while ((pos = html.indexOf(needle, pos)) !== -1) {
    const pushStart = html.lastIndexOf('.push([0,', pos);
    if (pushStart === -1) break;
    const brace = html.indexOf('{', pushStart);
    if (brace === -1) break;
    const end = findMatchingBrace(html, brace);
    if (end === -1) break;
    const blob = html.slice(brace, end + 1);
    try {
      const obj = JSON.parse(blob);
      if (obj.type === 'application/ld+json' && typeof obj.children === 'string') {
        const inner = JSON.parse(obj.children);
        const types = inner['@type'];
        const isGrocery = Array.isArray(types)
          ? types.includes('GroceryStore')
          : types === 'GroceryStore';
        if (isGrocery) {
          return inner;
        }
      }
    } catch {
      /* try next occurrence */
    }
    pos += needle.length;
  }
  return null;
}

/**
 * @param {string} s
 * @param {number} openIdx index of {
 */
function findMatchingBrace(s, openIdx) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === '\\') {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

module.exports = {
  extractGroceryStoreNumericId,
  extractGroceryJsonLd,
};
