'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class StavangerKommuneAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '1103' // Stavanger
  ]);

  constructor() {
    const domain = 'https://renovasjonservice.stavanger.kommune.no:9001';
    const applikasjonsId = '61637f17-a49f-4f21-8aef-e61e05d4099e';
    const oppdragsgiverId = '100';
    const fractionMap = {
      "general": ["100"],
      "paper": ["200"],
      "plastic": ["600"],
      "food": ["370"],
      "garden": ["350"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return StavangerKommuneAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Stavanger Kommune';
  }

  async coversMunicipality(municipalityCode) {
    return StavangerKommuneAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
