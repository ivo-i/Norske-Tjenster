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
    .replace(/^meny\s+/, '');
}

module.exports = { normalizeStoreName };
