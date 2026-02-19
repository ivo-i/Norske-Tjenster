'use strict';

const BaseAdapter = require('./baseadapter');

module.exports = class IRAdapter extends BaseAdapter {

  async _getAllMunicipalities() {
    try {
      const response = await fetch(`https://innherredrenovasjon.no/wp-json/ir/v1/municipalities`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const respJson = await response.json();
      return new Set(respJson.map(m => m.municipality_number));
    }
    catch (error) {
      console.error('Error fetching municipalities from Innherred Renovasjon:', error);
      throw error;
    };
  }

  getName() {
    return 'Innherred Renovasjon';
  }

  async coversMunicipality(municipalityCode) {
    const municipalities = await this._getAllMunicipalities();
    return municipalities.has(String(municipalityCode));
  }

  createAddrString(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    return addrString;
  }

  async fetchAddressUUID(addressData) {
    let addrString = this.createAddrString(addressData);
    const response = await fetch(`https://innherredrenovasjon.no/wp-json/ir/v1/addresses/${encodeURIComponent(addrString)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    if (respJson.data.results.length === 0) {
      return null;
    }
    const match = respJson.data.results.find(entry =>
      entry.address.toUpperCase() == addrString.toUpperCase() &&
      entry.municipality.toUpperCase() == addressData.kommunenavn
    );
    return match?.id;
  }

  reducedDisposals(disposals) {
    // NOTE: Reversed fractionMap for convenience
    const fractionMap = {
      "5": "glass",
      "1111": "food",
      "1222": "paper",
      "4": "plastic",
      "9991": "general",
    };
    const nearest = this.createFractions();
    for (const id in disposals) {
      const date = new Date(disposals[id].dates[0]);
      const key = fractionMap[id];
      if (!key) continue;
      nearest[key] = date;
    }
    return nearest;
  }

  async fetchFractionDates(addressData, addressUUID) {
    let addrString = this.createAddrString(addressData);
    const response = await fetch(`https://innherredrenovasjon.no/wp-json/ir/v1/garbage-disposal-dates-by-address?address=${addrString}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    return this.reducedDisposals(respJson);
  }
}
