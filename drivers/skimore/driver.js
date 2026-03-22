'use strict';

const Homey = require('homey');
const skimore = require('../../lib/skimore');

const THIRTY_MINUTES = 30 * 60 * 1000;

module.exports = class SkimoreDriver extends Homey.Driver {

  async onInit() {
    this.log('SkimoreDriver has been initialized');

    this.schedulePeriodicUpdate();

    const liftsCondition = this.homey.flow.getConditionCard('ski-lifts-open-count');
    liftsCondition.registerRunListener(async (args) => {
      const openLifts = args.device.getStoreValue('openLifts') || 0;
      return openLifts >= args.count;
    });

    const slopesCondition = this.homey.flow.getConditionCard('ski-slopes-open-count');
    slopesCondition.registerRunListener(async (args) => {
      const openSlopes = args.device.getStoreValue('openSlopes') || 0;
      return openSlopes >= args.count;
    });
  }

  async onPair(session) {
    let resortId = null;

    session.setHandler('get_resorts', async () => {
      try {
        const list = skimore.getResorts();
        if (!Array.isArray(list) || list.length === 0) {
          throw new Error('EMPTY_RESORT_LIST');
        }
        return list;
      } catch (err) {
        this.error('Skimore get_resorts failed:', err);
        throw err;
      }
    });

    session.setHandler('save_resort', async (data) => {
      const id = data && data.resortId;
      if (!id || !skimore.RESORTS[id]) {
        throw new Error(this.homey.__('pair.skimore.errors.invalid_resort'));
      }
      resortId = id;
    });

    session.setHandler('list_devices', async () => {
      if (!resortId) {
        throw new Error(this.homey.__('pair.skimore.errors.no_resort'));
      }

      const resort = skimore.RESORTS[resortId];
      return [
        {
          name: resort.name,
          data: {
            id: resortId,
          },
          settings: {
            resort_name: resort.name,
          },
          store: {
            resortId,
          },
        },
      ];
    });
  }

  async onUninit() {
    if (this._updateTimer) {
      this.homey.clearInterval(this._updateTimer);
      this._updateTimer = null;
    }
    this.log('SkimoreDriver has been uninitialized');
  }

  schedulePeriodicUpdate() {
    if (this._updateTimer) {
      this.homey.clearInterval(this._updateTimer);
    }
    this._updateTimer = this.homey.setInterval(async () => {
      this.log('Periodic update triggered');
      const devices = this.getDevices();
      for (const device of devices) {
        try {
          await device.update();
        } catch (error) {
          this.error(`Failed to update device ${device.getName()}:`, error);
        }
      }
    }, THIRTY_MINUTES);
  }

};
