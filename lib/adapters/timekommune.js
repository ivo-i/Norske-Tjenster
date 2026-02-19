'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class TimeKommuneAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '1121' // Time
  ]);

  constructor() {
    const domain = 'https://renovasjon.time.kommune.no:8055';
    const applikasjonsId = '2de50fc8-4ab7-426b-99cd-a5ddd0de71d1';
    const oppdragsgiverId = '100';
    const fractionMap = {
      "general": ["9999"],
      "paper": ["2410"],
      "food": ["2110"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return TimeKommuneAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Time Kommune';
  }

  async coversMunicipality(municipalityCode) {
    return TimeKommuneAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
