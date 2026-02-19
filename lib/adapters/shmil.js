'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class SHMILAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '1820', // Alstahaug
    '1813', // Brønnøy
    '1827', // Dønna
    '1825', // Grane
    '1826', // Hattfjelldal
    '1818', // Herøy
    '1822', // Leirfjord
    '1812', // Sømna
    '1824', // Vefsn
    '1815', // Vega
    '1816', // Vevelstad
  ]);

  constructor() {
    const domain = 'https://tommeplan.shmil.no:8084';
    const applikasjonsId = '95b6459a-5756-4dc8-8b05-423da7850fd5';
    const oppdragsgiverId = '100';
    const fractionMap = {
      "general": ["1000"],
      "glass": ["1000"],
      "paper": ["1000"],
      "plastic": ["1000"],
      "food": ["2110"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return SHMILAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Søndre Helgeland Miljøverk (SHMIL)';
  }

  async coversMunicipality(municipalityCode) {
    return SHMILAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
