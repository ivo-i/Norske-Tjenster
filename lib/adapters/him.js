'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class HIMAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '1145', // Bokn
    '4611', // Etne
    '1106', // Haugesund
    '1146', // Tysvær
    '1160' // Vindafjord
  ]);

  constructor() {
    const domain = 'https://renovasjonservice.him.as:1561';
    const applikasjonsId = '9e907e9e-b900-40b0-9df3-8f83be5468a3';
    const oppdragsgiverId = '100';
    const fractionMap = {
      "general": ["9999"],
      "glass": ["1300"],
      "paper": ["1200"],
      "plastic": ["1700"],
      "food": ["1111"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return HIMAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Haugaland Interkommunale Miljøverk IKS (HIM)';
  }

  async coversMunicipality(municipalityCode) {
    return HIMAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
