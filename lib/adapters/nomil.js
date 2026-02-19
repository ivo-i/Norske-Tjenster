'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class NOMILAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '4651', // Stryn
    '4650', // Gloppen
    '4648', // Bremanger
    '4649', // Stad
    '4602', // Kinn
  ]);

  constructor() {
    const domain = 'https://tommeplan.nomil.no:9000';
    const applikasjonsId = '380b0118-95ba-4c57-b53c-2f79c3922d65';
    const oppdragsgiverId = '100';
    const fractionMap = {
      "general": ["9999"],
      "glass": ["2612"],
      "paper": ["2410"],
      "plastic": ["2410"],
      "food": ["2110"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return NOMILAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Nordjord Miljøverk (NOMIL)';
  }

  async coversMunicipality(municipalityCode) {
    return NOMILAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
