'use strict';

const { v4: uuidv4 } = require('uuid');

const BaseAdapter = require('./baseadapter');

module.exports = class FredrikstadKommuneAdapter extends BaseAdapter {
  static MUNICIPALITIES = new Set([
    '3107' // Fredrikstad
  ]);

  async _getAllMunicipalities() {
    return FredrikstadKommuneAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Fredrikstad Kommune';
  }

  async coversMunicipality(municipalityCode) {
    return FredrikstadKommuneAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn.toUpperCase();
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    const url = "https://arcgis.fredrikstad.kommune.no/server/rest/services/Renovasjon/MinRenovasjon/MapServer/0/query?" +
      "f=json&outFields=AvtLnr&where=UPPER(Adresse)%20%3D%20" + encodeURIComponent(`'${addrString}'`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    if (respJson.features.length === 0) {
      return null;
    }
    const id = respJson.features[0].attributes.AvtLnr;
    // Fredrikstad Kommune uses internal IDs that we cannot use directly, so we generate a UUID and prepend the internal ID to it
    const uuid = `${id}-${uuidv4()}`;
    return uuid;
  }

  async fetchFractionDates(addressData, addressUUID) {
    const fractionMap = {
      "glass": [4],
      "food": [16],
      "paper": [2],
      "plastic": [2],
      "general": [6],
      "hazardous": [1],
    };

    const id = addressUUID.split('-')[0];
    const dateParam = new Date().toISOString().split('T')[0];
    const url = "https://arcgis.fredrikstad.kommune.no/server/rest/services/Renovasjon/MinRenovasjon/MapServer/1/query?" +
      `f=json&outFields=Dato,AvfallId&where=AvtLnr%20=%20${id}%20AND%20Dato%20>=%20date%20%27${dateParam}%27`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    const disposals = this.reducedDisposals(respJson.features, fractionMap, 'attributes.AvfallId', 'attributes.Dato');
    return disposals;
  }
}
