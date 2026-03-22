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

module.exports = { createClient };
