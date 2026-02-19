'use strict';

const BaseAdapter = require('./baseadapter');

module.exports = class GLORAdapter extends BaseAdapter {
  static MUNICIPALITIES = new Set([
    '3441', // Gausdal
    '3405', // Lillehammer
    '3440' // Øyer
  ]);

  async _getAllMunicipalities() {
    return GLORAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'GLØR';
  }

  async coversMunicipality(municipalityCode) {
    return GLORAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    const response = await fetch(`https://proaktiv.glor.offcenit.no/search?q=${encodeURIComponent(addrString)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    if (respJson.length === 0) {
      return null;
    }
    const match = respJson.find(entry =>
      entry.adresse.toUpperCase() == addrString.toUpperCase() &&
      entry.kommune.toUpperCase() == addressData.kommunenavn
    );
    return match?.id;
  }

  async fetchFractionDates(addressData, addressUUID) {
    const fractionMap = {
      "glass": ["1322"],
      "food": ["1111"],
      "paper": ["1299"],
      "plastic": ["1799"],
      "general": ["9999"],
    };

    const response = await fetch(`https://proaktiv.glor.offcenit.no/details?id=${addressUUID}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    return this.reducedDisposals(respJson, fractionMap, 'fraksjonId', 'dato');
  }
}
