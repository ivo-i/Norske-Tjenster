'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class IRISAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '1839', // Beiarn
    '1804', // Bodø
    '1841', // Fauske
    '1838', // Gildeskål
    '1875', // Hamarøy
    '1837', // Meløy
    '1840', // Saltdal
    '1848', // Steigen
    '1845' // Sørfold
  ]);

  constructor() {
    const domain = 'https://iristk.iris-salten.no:8084';
    const applikasjonsId = '95b6459a-5756-4dc8-8b05-423da7850fd5';
    const oppdragsgiverId = '100';
    const fractionMap = {
      "general": ["9999"],
      "glass": ["2612"],
      "paper": ["2400"],
      "plastic": ["3200"],
      "food": ["2110"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return IRISAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'IRIS-Salten';
  }

  async coversMunicipality(municipalityCode) {
    return IRISAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
