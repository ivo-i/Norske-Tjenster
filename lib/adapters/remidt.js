'use strict';

const BaseAdapter = require('./baseadapter');

module.exports = class RemidtAdapter extends BaseAdapter {
  static MUNICIPALITIES = new Set([
    '1576', // Aure
    '1554', // Averøy
    '5014', // Frøya
    '5055', // Heim
    '5056', // Hitra
    '1505', // Kristiansund
    '5028', // Melhus
    '5027', // Midtre Gauldal
    '5021', // Oppdal
    '5059', // Orkland
    '5022', // Rennebu
    '5061', // Rindal
    '5029', // Skaun
    '1573', // Smøla
    '1563', // Sunndal
    '1566', // Surnadal
    '1560' // Tingvoll
  ]);

  async _getAllMunicipalities() {
    return RemidtAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'ReMidt';
  }

  async coversMunicipality(municipalityCode) {
    return RemidtAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    const response = await fetch(`https://kalender.renovasjonsportal.no/api/address/${encodeURIComponent(addrString)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    if (respJson.searchResults.length === 0) {
      return null;
    }
    const match = respJson.searchResults.find(entry =>
      entry.title.toUpperCase() == addrString.toUpperCase() &&
      entry.subTitle.toUpperCase() == `${addressData.kommunenavn} KOMMUNE`
    );
    return match?.id;
  }

  async fetchFractionDates(addressData, addressUUID) {
    const fractionMap = {
      "glass": ["Glass og metallemballasje"],
      "food": ["Matavfall"],
      "paper": ["Papir"],
      "plastic": ["Plastemballasje"],
      "general": ["Restavfall"],
    };

    const response = await fetch(`https://kalender.renovasjonsportal.no/api/address/${addressUUID}/details`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    return this.reducedDisposals(respJson.disposals, fractionMap, 'fraction', 'date');
  }
}
