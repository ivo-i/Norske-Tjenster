'use strict';

const BaseAdapter = require('./baseadapter');

module.exports = class NorconsultBaseAdapter extends BaseAdapter {
  constructor(domain, applikasjonsId, oppdragsgiverId, fractionMap) {
    super();
    this.config = {
      domain: domain,
      applikasjonsId: applikasjonsId,
      oppdragsgiverId: oppdragsgiverId,
      fractionMap: fractionMap
    }
  }

  async getAndStoreToken() {
    const response = await fetch(`${this.config.domain}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        applikasjonsId: this.config.applikasjonsId,
        oppdragsgiverId: this.config.oppdragsgiverId
      })
    });
    this.token = response.headers.get('Token');
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    if (!this.token) {
      await this.getAndStoreToken();
    }

    let response = await fetch(`${this.config.domain}/api/eiendommer?adresse=${encodeURIComponent(addrString)}`, {
      "headers": {
        "Content-Type": "application/json",
        "Token": this.token
      }
    });
    if (response.status === 500) { // Token may have expired, get a new one and try again
      await this.getAndStoreToken();
      response = await fetch(`${this.config.domain}/api/eiendommer?adresse=${encodeURIComponent(addrString)}`, {
        "headers": {
          "Content-Type": "application/json",
          "Token": this.token
        }
      });
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    if (respJson.length === 0) {
      return null;
    }
    const match = respJson.find(entry =>
      entry.adresse.toUpperCase() == addrString.toUpperCase() &&
      String(entry.kommuneNr) == String(addressData.kommunenummer));
    return match?.id;
  }

  async fetchFractionDates(addressData, addressUUID) {
    const today = new Date()
    const future = new Date(today);
    future.setMonth(today.getMonth() + 3);

    const fromDateStr = today.toISOString().split('T')[0];
    const toDateStr = future.toISOString().split('T')[0];

    let response = await fetch(`${this.config.domain}/api/tomminger?eiendomId=${addressUUID}&datoFra=${fromDateStr}&datoTil=${toDateStr}`, {
      "headers": {
        "Token": this.token
      }
    });
    if (response.status === 500) { // Token may have expired, get a new one and try again
      await this.getAndStoreToken();
      response = await fetch(`${this.config.domain}/api/tomminger?eiendomId=${addressUUID}&datoFra=${fromDateStr}&datoTil=${toDateStr}`, {
        "headers": {
          "Token": this.token
        }
      });
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    const pickups = this.reducedDisposals(respJson, this.config.fractionMap, 'fraksjonId', 'dato');
    return pickups;
  }
}
