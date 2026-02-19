'use strict';

const BaseAdapter = require('./baseadapter');

module.exports = class HRAAdapter extends BaseAdapter {
  static MUNICIPALITIES = new Set([
    '3305', // Ringerike
    '3446', // Gran
    '3234', // Lunner
    '3236', // Jevnaker
    '3310' // Hole
  ]);

  async _getAllMunicipalities() {
    return HRAAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Hadeland og Ringerike Avfallsselskap (HRA)';
  }

  async coversMunicipality(municipalityCode) {
    return HRAAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    const response = await fetch(`https://api.hra.no//search/address?query=${encodeURIComponent(addrString)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    if (respJson.length === 0) {
      return null;
    }
    const match = respJson.find(entry =>
      entry.propertyName.toUpperCase() == addrString.toUpperCase() &&
      entry.municipality.toUpperCase() == addressData.kommunenavn
    );
    return match?.agreementGuid;
  }

  async fetchFractionDates(addressData, addressUUID) {
    const fractionMap = {
      "food": [2110],
      "paper": [2400],
      "plastic": [3200],
      "general": [9999],
    };

    const response = await fetch(`https://api.hra.no/Renovation/UpcomingGarbageDisposals/${addressUUID}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    return this.reducedDisposals(respJson, fractionMap, 'fractionId', 'date');
  }
}
