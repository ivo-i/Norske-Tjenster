'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class IVARAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '1130', // Strand
    '1133', // Hjelmeland
    '1134' // Suldal
  ]);

  constructor() {
    const domain = 'https://tommeplan.ivar.no:9443';
    const applikasjonsId = '2cb4dffd-2769-4d40-8075-e33a5a76fb28';
    const oppdragsgiverId = '100';
    const fractionMap = {
      "general": ["9999"],
      "glass": ["2610"],
      "paper": ["2400"],
      "food": ["2110"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return IVARAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'IVAR Renovasjon Ryfylke';
  }

  async coversMunicipality(municipalityCode) {
    return IVARAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
