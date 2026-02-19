'use strict';

const NorconsultBase = require('./norconsultbase');

module.exports = class BIRAdapter extends NorconsultBase {
  static MUNICIPALITIES = new Set([
    '4627', // Askøy
    '4601', // Bergen
    '4624', // Bjørnafjorden
    '4622', // Kvam
    '4630', // Osterøy
    '4623', // Samnanger
    '4628' // Vaksdal
  ]);

  constructor() {
    const domain = 'https://webservice.bir.no';
    const applikasjonsId = '94fa72ad-583d-4aa3-988f-491f694dfb7b';
    const oppdragsgiverId = '100;300;400;800';
    const fractionMap = {
      "general": ["9999"],
      "glass": ["1300"],
      "paper": ["1200"],
      "plastic": ["1200"],
      "food": ["1111"]
    };
    super(domain, applikasjonsId, oppdragsgiverId, fractionMap);
  }

  async _getAllMunicipalities() {
    return BIRAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'BIR';
  }

  async coversMunicipality(municipalityCode) {
    return BIRAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
