'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class HRAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '3322', // Nesbyen
    '3320', // Flå
    '3324', // Gol
    '3330', // Hol
    '3328', // Ål
    '3326', // Hemsedal
    '3318' // Krødsherrad
  ]);

  constructor() {
    const domain = 'https://tommeplan.vkr.no:9002/';
    const applikasjonsId = '493dc350-a80a-4797-883b-56ae44fc7ff7';
    const oppdragsgiverId = '100';
    const fractionMap = {
      "general": ["9999"],
      "glass": ["2612"],
      "paper": ["10095"],
      "plastic": ["3200"],
      "food": ["111106"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return HRAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Hallingdal Renovasjon';
  }

  async coversMunicipality(municipalityCode) {
    return HRAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
