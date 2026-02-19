'use strict';

const BaseAdapter = require('./baseadapter');

module.exports = class FosenRenovasjonAdapter extends BaseAdapter {
  static MUNICIPALITIES = new Set([
    '5054', // Indre Fosen
    '5057', // Ørland
    '5058' // Åfjord
  ]);

  async _getAllMunicipalities() {
    return FosenRenovasjonAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Fosen Renovasjon';
  }

  async coversMunicipality(municipalityCode) {
    return FosenRenovasjonAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    const response = await fetch(`https://fosen.renovasjonsportal.no/api/address/${encodeURIComponent(addrString)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    if (respJson.length === 0) {
      return null;
    }
    const match = respJson.searchResults.find(entry =>
      entry.title.toUpperCase() == addrString.toUpperCase() &&
      entry.subTitle.toUpperCase() == addressData.kommunenavn
    );
    return match?.id;
  }

  async fetchFractionDates(addressData, addressUUID) {
    const fractionMap = {
      "food": ["Matavfall"],
      "paper": ["Papir og plastemballasje"],
      "plastic": ["Papir og plastemballasje"],
      "general": ["Restavfall til forbrenning"],
    };

    const response = await fetch(`https://fosen.renovasjonsportal.no/api/address/${addressUUID}/details`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    const pickups = this.reducedDisposals(respJson.disposals, fractionMap, 'fraction', 'date');
    return pickups;
  }
}
