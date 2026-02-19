'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class SandnesKommuneAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '1108' // Sandnes
  ]);

  constructor() {
    const domain = 'https://renovasjonservice.sandnes.kommune.no';
    const applikasjonsId = '36632bdf-4d65-44ac-becd-e8d880a7bd44';
    const oppdragsgiverId = '100';
    const fractionMap = {
      "general": ["9999"],
      "paper": ["2410"],
      "plastic": ["3201"],
      "food": ["2112"],
      "garden": ["2111"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return SandnesKommuneAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Sandnes Kommune';
  }

  async coversMunicipality(municipalityCode) {
    return SandnesKommuneAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
