'use strict';

const Homey = require('homey');
const skimore = require('../../lib/skimore');

const DAY_NAMES_TODAY = ['i dag', 'today'];
const DAY_NAMES_TOMORROW = ['i morgen', 'tomorrow'];

function matchesDay(dayText, candidates) {
  const lower = (dayText || '').toLowerCase();
  return candidates.some((c) => lower.includes(c));
}

module.exports = class SkimoreDevice extends Homey.Device {

  async onInit() {
    this.log('SkimoreDevice has been initialized');
    this.resortId = this.getStoreValue('resortId');
    this._updating = false;
    this._consecutiveErrors = 0;

    if (!this.resortId) {
      this.error('No resortId stored for this device');
      await this.setUnavailable('Missing resort configuration');
      return;
    }

    const stagger = Math.floor(Math.random() * 5000);
    this.homey.setTimeout(() => this.update(), stagger);
  }

  async onAdded() {
    this.log('SkimoreDevice has been added');
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('SkimoreDevice settings were changed');
  }

  async onDeleted() {
    this.log('SkimoreDevice has been deleted');
  }

  async update() {
    if (this._updating) {
      this.log('Update already in progress, skipping');
      return;
    }
    this._updating = true;

    this.log('Updating data for SkimoreDevice');

    if (!this.resortId) {
      this.error('No resortId available');
      this._updating = false;
      return;
    }

    try {
      const data = await skimore.fetchStatus(this.resortId);

      if (!data._parseSuccess) {
        this.error('Page structure changed — parsing returned no ski data');
        this._consecutiveErrors++;
        if (this._consecutiveErrors >= 3) {
          await this.setUnavailable('Unable to parse resort data');
        }
        this._updating = false;
        return;
      }

      this._consecutiveErrors = 0;
      await this.setAvailable();
      await this.updateCapabilities(data);
      await this.setStoreValue('openLifts', data.lifts.open);
      await this.setStoreValue('openSlopes', data.slopes.open);
    } catch (error) {
      this.error('Failed to fetch Skimore data:', error);
      this._consecutiveErrors++;
      if (this._consecutiveErrors >= 3) {
        await this.setUnavailable('Unable to reach Skimore');
      }
    } finally {
      this._updating = false;
    }
  }

  async updateCapabilities(data) {
    if (data.temperature !== null) {
      await this.safeSetCapability('measure_temperature', data.temperature);
    }
    if (data.humidity !== null) {
      await this.safeSetCapability('measure_humidity', data.humidity);
    }
    if (data.precipitation !== null) {
      await this.safeSetCapability('ski_precipitation', data.precipitation);
    }

    await this.safeSetCapability('ski_open_lifts', `${data.lifts.open} / ${data.lifts.total}`);
    await this.safeSetCapability('ski_open_slopes', `${data.slopes.open} / ${data.slopes.total}`);

    const todayEntry = data.openingHours.find((e) => matchesDay(e.day, DAY_NAMES_TODAY));
    const tomorrowEntry = data.openingHours.find((e) => matchesDay(e.day, DAY_NAMES_TOMORROW));
    await this.safeSetCapability('ski_opening_today', todayEntry ? todayEntry.hours : '-');
    await this.safeSetCapability('ski_opening_tomorrow', tomorrowEntry ? tomorrowEntry.hours : '-');

    await this.safeSetCapability('ski_snow_production', data.snowProductionStatus || '-');

    if (data.messages.length > 0) {
      const msg = data.messages[0];
      await this.safeSetCapability('ski_latest_message', `${msg.date}: ${msg.title}`);
    } else {
      await this.safeSetCapability('ski_latest_message', '-');
    }
  }

  async safeSetCapability(cap, value) {
    try {
      if (this.hasCapability(cap)) {
        await this.setCapabilityValue(cap, value);
      }
    } catch (error) {
      this.error(`Failed to set capability ${cap}:`, error);
    }
  }

};
