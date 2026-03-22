'use strict';

const Homey = require('homey');

const ADAPTER_FACTORIES = {
  remidt: () => new (require('../../lib/adapters/remidt'))(),
  trv: () => new (require('../../lib/adapters/trv'))(),
  glor: () => new (require('../../lib/adapters/glor'))(),
  ir: () => new (require('../../lib/adapters/ir'))(),
  minrenovasjon: () => new (require('../../lib/adapters/minrenovasjon'))(),
  fosenrenovasjon: () => new (require('../../lib/adapters/fosenrenovasjon'))(),
  hra: () => new (require('../../lib/adapters/hra'))(),
  oslokommune: () => new (require('../../lib/adapters/oslokommune'))(),
  fredrikstadkommune: () => new (require('../../lib/adapters/fredrikstadkommune'))(),
  vkr: () => new (require('../../lib/adapters/vkr'))(),
  sim: () => new (require('../../lib/adapters/sim'))(),
  ngir: () => new (require('../../lib/adapters/ngir'))(),
  bir: () => new (require('../../lib/adapters/bir'))(),
  him: () => new (require('../../lib/adapters/him'))(),
  hr: () => new (require('../../lib/adapters/hr'))(),
  iris: () => new (require('../../lib/adapters/iris'))(),
  ivar: () => new (require('../../lib/adapters/ivar'))(),
  nomil: () => new (require('../../lib/adapters/nomil'))(),
  shmil: () => new (require('../../lib/adapters/shmil'))(),
  utsira: () => new (require('../../lib/adapters/utsira'))(),
  avfallsor: () => new (require('../../lib/adapters/avfallsor'))(),
  sandneskommune: () => new (require('../../lib/adapters/sandneskommune'))(),
  stavangerkommune: () => new (require('../../lib/adapters/stavangerkommune'))(),
  timekommune: () => new (require('../../lib/adapters/timekommune'))(),
  sum: () => new (require('../../lib/adapters/sum'))(),
};

module.exports = class RenovasjonDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.adapterFactories = ADAPTER_FACTORIES;
    this.adapters = {};

    this.scheduleMidnightUpdate();

    // Flow card registrations
    const cardConditionGarbageIsCollected = this.homey.flow.getConditionCard('garbage-is-collected');
    cardConditionGarbageIsCollected.registerRunListener(async (args, state) => {
      const fractions = args.device.fractionDates;
      if (!fractions) {
        return false;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (const [, fractionDate] of Object.entries(fractions)) {
        if (!fractionDate) {
          continue;
        }
        const diffDays = Math.floor((fractionDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays === args.days) {
          return true;
        }
      }
      return false;
    });

    const cardConditionGarbageTypeIsCollected = this.homey.flow.getConditionCard('fraction-is-collected');
    cardConditionGarbageTypeIsCollected.registerRunListener(async (args, state) => {
      const fractions = args.device.fractionDates;
      if (!fractions) {
        return false;
      }
      const fractionDate = fractions[args.fraction];
      if (!fractionDate) {
        return false;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((fractionDate - today) / (1000 * 60 * 60 * 24));
      return diffDays === args.days;
    });
  }

  async onPair(session) {
    let addressData = null;
    session.setHandler('save_details', async (data) => {
      addressData = data;
    });

    session.setHandler('list_devices', async () => {
      const provider = await this.getProviderForMunicipality(addressData.kommunenummer);
      // If no provider found, notify user
      if (!provider) {
        throw new Error(this.homey.__('pair.errors.unsupported_municipality'));
      }
      const adapter = this.getAdapter(provider);
      if (!adapter) {
        throw new Error(this.homey.__('pair.errors.unsupported_municipality'));
      }

      let addrString = addressData.adressenavn;
      if (addressData.nummer !== '') {
        addrString += ` ${addressData.nummer}`;
      }
      if (addressData.bokstav) {
        addrString += ` ${addressData.bokstav}`;
      }

      let addressUUID;
      try {
        addressUUID = await adapter.fetchAddressUUID(addressData);
        // If the address lookup failed, notify user
        if (!addressUUID) {
          throw new Error(this.homey.__('pair.errors.unsupported_address'));
        }
      }
      catch (error) {
        // Network errors both logged to console and notified to user
        // NOTE: This assumes all errors are network errors, which is assuming a little too much.
        // Consider adding error type distinctions.
        this.error(`${adapter.getName()} could not fetch address UUID:`, error.message);
        throw new Error(this.homey.__('pair.errors.network_error'));
      }
      const baseName = this.manifest.name[this.homey.i18n.getLanguage()] || this.manifest.name.en;

      return [
        {
          name: `${baseName} ${addrString}`,
          data: {
            id: addressUUID,
          },
          settings: {
            streetAddress: addrString,
            municipality: addressData.kommunenavn,
            provider: adapter.getName()
          },
          store: {
            provider,
            addressData,
            addressUUID,
          },
        },
      ];
    });
  }

  async onUninit() {
    if (this._midnightTimer) {
      clearTimeout(this._midnightTimer);
    }
  }

  scheduleMidnightUpdate() {
    const now = new Date();
    // Set to five minutes past midnight
    const millisTillMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0, 0) - now;
    this._midnightTimer = setTimeout(async () => {
      const devices = this.getDevices();
      for (const device of devices) {
        try {
          await device.update();
        } catch (error) {
          this.error(`Failed to update device ${device.getName()}:`, error.message);
        }
      }
      this.scheduleMidnightUpdate();
    }, millisTillMidnight);
  }

  // Return a list of available adapters with id and label for pairing UI
  getAdaptersList() {
    return Object.keys(this.adapterFactories).map((id) => {
      const adapter = this.getAdapter(id);
      return {
        id,
        label: adapter.getName() || id,
      };
    });
  }

  getAdapter(provider) {
    if (!provider) {
      return null;
    }

    if (!this.adapters[provider]) {
      const factory = this.adapterFactories[provider];
      if (!factory) {
        return null;
      }
      this.adapters[provider] = factory();
    }

    return this.adapters[provider];
  }

  async getProviderForMunicipality(municipalityCode) {
    for (const id of Object.keys(this.adapterFactories)) {
      const adapter = this.getAdapter(id);
      try {
        if (await adapter.coversMunicipality(municipalityCode)) {
          return id;
        }
      }
      catch (error) {
        this.error(`Could not check coverage of ${adapter.getName()}:`, error.message);
      }
    }
    return null;
  }

};
