'use strict';

const BaseAdapter = require('./baseadapter');

module.exports = class SUMAdapter extends BaseAdapter {
  static MUNICIPALITIES = new Set([
    '4647', // Sunnfjord
    '4646', // Fjaler
    '4637', // Hyllestad
    '4645' // Askvoll
  ]);

  async _getAllMunicipalities() {
    return SUMAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Sunnfjord Miljøverk (SUM)';
  }

  async coversMunicipality(municipalityCode) {
    return SUMAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }

  async fetchAPI(requestBody) {
    const response = await fetch('https://www.sumavfall.no/api', {
      "body": requestBody,
      "headers": {
        "Content-Type": "application/json",
        'Authorization': "Bearer XNs1u1XTbt93kudNvzCK4C4HlZ39A3vq"
      },
      "method": "POST"
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    return respJson;
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += `${addressData.bokstav}`;
    }
    const addrSlug = addrString.replace(/\s+/g, '-').toLowerCase();
    const requestBody = JSON.stringify({
      "query": "query CollectionAddress($slug: String!) {entry(section: \"collectionAddresses\", slug: [$slug]){id ...on collectionAddress_Entry {route {title slug id}}}}",
      "variables": {
        "slug": addrSlug
      },
      "operationName": "CollectionAddress"
    });

    const respJson = await this.fetchAPI(requestBody);
    if (respJson.data.entry === null) {
      return null;
    }
    const routeId = respJson.data.entry.route[0].id;
    const addrId = respJson.data.entry.id;
    // Route ID is needed for date lookups. We combine route ID and address ID to form a unique UUID for the address.
    const uuid = `${routeId}-${addrId}`;
    return uuid;
  }

  reducedDisposals(disposalArray) {
    const nearest = this.createFractions();
    if (!Array.isArray(disposalArray)) {
      return nearest;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fractionMap = {
      "food": ["matavfall"],
      "paper": ["papp-og-papir"],
      "plastic": ["plastemballasje"],
      "general": ["restavfall-til-forbrenning"],
      "glass": ["glassembalasje", "metallemballasje"]
    };

    for (const d of disposalArray) {
      const date = new Date(d.date);
      // Ignore non-dates and dates in the past
      if (Number.isNaN(date.getTime()) || date < today) {
        continue;
      }

      for (const [our_frac, api_fracs] of Object.entries(fractionMap)) {
        for (const t of d.selectedCollectionTypes) {
          if (api_fracs.includes(t.slug)) {
            if (!nearest[our_frac] || date < nearest[our_frac]) {
              nearest[our_frac] = date;
            }
          }
        }
      }
    }
    return nearest;
  }

  async fetchFractionDates(addressData, addressUUID) {
    const routeId = addressUUID.split('-')[0];
    const requestBody = JSON.stringify({
      "query": "query CollectionDates($id: QueryArgument!) {entries(section: \"collectionDays\", relatedTo: [$id]){id title ...on collectionDay_Entry {date selectedCollectionTypes {slug title}}}}",
      "variables": {
        "id": routeId
      },
      "operationName": "CollectionDates"
    });
    const respJson = await this.fetchAPI(requestBody);
    const pickups = this.reducedDisposals(respJson.data.entries);
    return pickups;
  }
}
