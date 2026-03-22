'use strict';

/** Lowercase, Norwegian letters to ASCII, collapse space, strip leading chain prefix (Meny). */
function normalizeStoreName(name) {
  if (!name || typeof name !== 'string') return '';
  let s = name.toLowerCase().trim();
  s = s
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^meny\s+/, '')
    .replace(/^kiwi\s+/, '')
    .replace(/^rema\s+1000\s+/, '')
    .replace(/^joker\s+/, '')
    .replace(/^extra\s+/, '')
    .replace(/^coop\s+mega\s+/, '')
    .replace(/^coop\s+prix\s+/, '')
    .replace(/^coop\s+marked\s+/, '')
    .replace(/^matkroken\s+/, '');
}

/** Compare phone strings allowing country code / formatting differences (repair identity). */
function phonesLooselyMatch(storePhone, refPhone) {
  const a = String(storePhone || '').replace(/\D/g, '');
  const b = String(refPhone || '').replace(/\D/g, '');
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 8 && b.length >= 8 && (a.endsWith(b) || b.endsWith(a))) return true;
  return false;
}

module.exports = { normalizeStoreName, phonesLooselyMatch };
