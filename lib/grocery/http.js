'use strict';

const axios = require('axios');
const { USER_AGENT } = require('./constants');

function createClient() {
  return axios.create({
    timeout: 25000,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 500,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7',
    },
  });
}

/**
 * Coerce axios response body to a UTF-8 string (handles Buffer / odd content-types).
 * @param {unknown} data
 * @returns {string}
 */
function bodyToUtf8(data) {
  if (data == null) return '';
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (typeof data === 'string') return data;
  return '';
}

module.exports = { createClient, bodyToUtf8 };
