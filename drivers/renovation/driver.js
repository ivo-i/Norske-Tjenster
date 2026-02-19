'use strict';

const Homey = require('homey');

const RemidtAdapter = require('../../lib/adapters/remidt');
const TRVAdapter = require('../../lib/adapters/trv');
const GLORAdapter = require('../../lib/adapters/glor');
const IRAdapter = require('../../lib/adapters/ir');
const MinRenovasjonAdapter = require('../../lib/adapters/minrenovasjon');
const FosenRenovasjonAdapter = require('../../lib/adapters/fosenrenovasjon');
const HRAAdapter = require('../../lib/adapters/hra');
const OsloKommuneAdapter = require('../../lib/adapters/oslokommune');
const FredrikstadKommuneAdapter = require('../../lib/adapters/fredrikstadkommune');
const VKRAdapter = require('../../lib/adapters/vkr');
const SIMAdapter = require('../../lib/adapters/sim');
const NGIRAdapter = require('../../lib/adapters/ngir');
const BIRAdapter = require('../../lib/adapters/bir');
const HIMAdapter = require('../../lib/adapters/him');
const HRAdapter = require('../../lib/adapters/hr');
const IRISAdapter = require('../../lib/adapters/iris');
const IVARAdapter = require('../../lib/adapters/ivar');
const NOMILAdapter = require('../../lib/adapters/nomil');
const SHMILAdapter = require('../../lib/adapters/shmil');
const UtsiraAdapter = require('../../lib/adapters/utsira');
const AvfallSorAdapter = require('../../lib/adapters/avfallsor');
const SandnesKommuneAdapter = require('../../lib/adapters/sandneskommune');
const StavangerKommuneAdapter = require('../../lib/adapters/stavangerkommune');
const TimeKommuneAdapter = require('../../lib/adapters/timekommune');
const SUMAdapter = require('../../lib/adapters/sum');

module.exports = class RenovasjonDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('RenovasjonDriver has been initialized');

    this.adapters = {
      "remidt": new RemidtAdapter(),
      "trv": new TRVAdapter(),
      "glor": new GLORAdapter(),
      "ir": new IRAdapter(),
      "minrenovasjon": new MinRenovasjonAdapter(),
      "fosenrenovasjon": new FosenRenovasjonAdapter(),
      "hra": new HRAAdapter(),
      "oslokommune": new OsloKommuneAdapter(),
      "fredrikstadkommune": new FredrikstadKommuneAdapter(),
      "vkr": new VKRAdapter(),
      "sim": new SIMAdapter(),
      "ngir": new NGIRAdapter(),
      "bir": new BIRAdapter(),
      "him": new HIMAdapter(),
      "hr": new HRAdapter(),
      "iris": new IRISAdapter(),
      "ivar": new IVARAdapter(),
      "nomil": new NOMILAdapter(),
      "shmil": new SHMILAdapter(),
      "utsira": new UtsiraAdapter(),
      "avfallsor": new AvfallSorAdapter(),
      "sandneskommune": new SandnesKommuneAdapter(),
      "stavangerkommune": new StavangerKommuneAdapter(),
      "timekommune": new TimeKommuneAdapter(),
      "sum": new SUMAdapter(),
    };

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
        this.error(`${adapter.getName()} could not fetch address UUID:`, error);
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
    this.log('RenovasjonDriver has been uninitialized');
  }

  scheduleMidnightUpdate() {
    const now = new Date();
    // Set to five minutes past midnight
    const millisTillMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0, 0) - now;
    this._midnightTimer = setTimeout(async () => {
      this.log('Midnight update triggered');
      const devices = this.getDevices();
      for (const device of devices) {
        try {
          await device.update();
        } catch (error) {
          this.error(`Failed to update device ${device.getName()}:`, error);
        }
      }
      this.scheduleMidnightUpdate();
    }, millisTillMidnight);
  }

  // Return a list of available adapters with id and label for pairing UI
  getAdaptersList() {
    this.log('Fetching adapters list');
    return Object.entries(this.adapters).map(([id, adapter]) => ({
      id,
      label: adapter.getName() || id,
    }));
  }

  getAdapter(provider) {
    return this.adapters[provider];
  }

  async getProviderForMunicipality(municipalityCode) {
    for (const [id, adapter] of Object.entries(this.adapters)) {
      try {
        if (await adapter.coversMunicipality(municipalityCode)) {
          return id;
        }
      }
      catch (error) {
        this.error(`Could not check coverage of ${adapter.getName()}:`, error);
      }
    }
    return null;
  }

};
