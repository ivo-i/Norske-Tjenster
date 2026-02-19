'use strict';

const { v4: uuidv4 } = require('uuid');

const BaseAdapter = require('./baseadapter');

module.exports = class SIMAdapter extends BaseAdapter {
  static MUNICIPALITIES = new Set([
    '4625', // Austevoll
    '4613', // Bømlo
    '4615', // Fitjar
    '4617', // Kvinnherad
    '4614', // Stord
    '4612', // Sveio
    '4616' // Tysnes
  ]);

  async _getAllMunicipalities() {
    return SIMAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Sunnhordland Interkommunale Miljøverk IKS (SIM)';
  }

  async coversMunicipality(municipalityCode) {
    return SIMAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    const response = await fetch(`https://sim.as/wp-json/tommekalender/v1/address_search?address=${encodeURIComponent(addrString)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    if (respJson.data.routes.length === 0) {
      return null;
    }
    const match = respJson.data.routes.find(entry =>
      entry.address.toUpperCase() == addrString.toUpperCase() &&
      entry.area.toUpperCase() == addressData.kommunenavn
    );
    if (!match) {
      return null;
    }
    const routeId = match.id;
    // SIM uses internal IDs that we cannot use directly, so we generate a UUID and prepend the internal ID to it
    const uuid = `${routeId}-${uuidv4()}`;
    return uuid;
  }

  modifyWasteKeys(array) {
    for (const entry of array) {
      if (entry.waste_types.toLowerCase().includes("glas/metall")) {
        entry.waste_types = "glas/metall";
      }
      else {
        entry.waste_types = entry.waste_types.toLowerCase();
      }
    }
    return array;
  }

  async fetchFractionDates(addressData, addressUUID) {
    const fractionMap = {
      "glass": ["glas/metall"],
      "food": ["rest/bio"],
      "paper": ["papir/plast"],
      "plastic": ["papir/plast"],
      "general": ["rest/bio"],
    };

    const routeId = addressUUID.split('-')[0];
    const fromDateParam = new Date().toISOString().split('T')[0];
    const toDate = new Date();
    toDate.setMonth(toDate.getMonth() + 2);
    const toDateParam = toDate.toISOString().split('T')[0];
    const response = await fetch(`https://sim.as/wp-json/tommekalender/v1/route_search?route=${routeId}&from=${fromDateParam}&to=${toDateParam}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    // Inconsistent names in the API, so we modify the keys to match our fractionMap
    const disposals = this.modifyWasteKeys(respJson.data.collections);
    const pickups = this.reducedDisposals(disposals, fractionMap, 'waste_types', 'collection_date');
    return pickups;
  }
}
