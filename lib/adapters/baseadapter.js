'use strict';

module.exports = class BaseAdapter {

  async _getAllMunicipalities() {
    throw new Error('_getAllMunicipalities() must be implemented by adapter subclasses');
  }

  // Override to return the name of the provider
  getName() {
    throw new Error('getName() must be implemented by adapter subclasses');
  }

  // Override to return true if the provider covers the given municipality code
  async coversMunicipality(municipalityCode) {
    throw new Error('coversMunicipality() must be implemented by adapter subclasses');
  }

  // Override to fetch the address UUID for the given address
  // If the adapter does not require an address ID, return a random UUID which will only
  // be used to identify the device
  async fetchAddressUUID(addressData) {
    throw new Error('fetchAddressUUID(address) must be implemented by adapter subclasses');
  }

  // Override to fetch fraction dates for the given address
  async fetchFractionDates(addressData, addressUUID) {
    throw new Error('fetchFractionDates(addressData, addressUUID) must be implemented by adapter subclasses');
  }

  // Most providers have local variations, so it's usually better to base fraction support
  // on a schedule fetch, but this can be overridden in adapter if necessary
  async getSupportedFractions(addressData, addressUUID) {
    const fractions = await this.fetchFractionDates(addressData, addressUUID);
    for (const key in fractions) {
      fractions[key] = !!fractions[key]
    }
    return fractions;
  }

  createFractions() {
    return {
      general: null,
      food: null,
      paper: null,
      plastic: null,
      glass: null,
      hazardous: null,
      garden: null
    };
  }

  reducedDisposals(disposalArray, fractionMap, fractionKey, dateKey) {
    const nearest = this.createFractions();

    if (!Array.isArray(disposalArray)) {
      return nearest;
    }

    // Helper function to get nested values
    const getValue = (obj, path) =>
      path.split('.').reduce((acc, part) => acc?.[part], obj);

    for (const d of disposalArray) {
      for (const [our_frac, api_fracs] of Object.entries(fractionMap)) {
        if (api_fracs.includes(getValue(d, fractionKey))) {
          const date = new Date(getValue(d, dateKey));
          if (!nearest[our_frac] || date < nearest[our_frac]) {
            nearest[our_frac] = date;
          }
        }
      }
    }
    return nearest;
  }
}
