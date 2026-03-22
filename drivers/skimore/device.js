'use strict';

const Homey = require('homey');
const skimore = require('../../lib/skimore');
const { computeVenueOpenStatus, findTodayEntry } = require('../../lib/skimore-venue-hours');

const DAY_NAMES_TODAY = ['i dag', 'today'];
const DAY_NAMES_TOMORROW = ['i morgen', 'tomorrow'];

const VENUE_CAPS = [
  'ski_venue_open',
  'ski_venue_status',
  'ski_venue_opens_in',
  'ski_venue_closes_in',
];
const MESSAGE_CAPS = ['ski_activity_today'];

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
    this._lastVenueOpen = null;
    this._suppressVenueTriggers = true;

    this._venueOpenedTrigger = this.homey.flow.getDeviceTriggerCard('ski_venue_opened');
    this._venueClosedTrigger = this.homey.flow.getDeviceTriggerCard('ski_venue_closed');

    if (!this.resortId) {
      this.error('No resortId stored for this device');
      await this.setUnavailable('Missing resort configuration');
      return;
    }

    await this.ensureVenueCapabilities();
    await this.ensureMessageCapabilities();

    const stagger = Math.floor(Math.random() * 5000);
    this.homey.setTimeout(() => this.update(), stagger);
  }

  async ensureVenueCapabilities() {
    if (this.hasCapability('ski_venue_hours_detail')) {
      await this.removeCapability('ski_venue_hours_detail');
    }
    for (const cap of VENUE_CAPS) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap);
      }
    }
  }

  async ensureMessageCapabilities() {
    if (this.hasCapability('ski_latest_message_title')) {
      await this.removeCapability('ski_latest_message_title');
    }
    for (const cap of MESSAGE_CAPS) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap);
      }
    }
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

    const prevVenueOpen = this._lastVenueOpen;

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

      const lang = this.homey.i18n.getLanguage() === 'no' ? 'no' : 'en';
      const venue = computeVenueOpenStatus(data.openingHours || [], lang);
      const resortName =
        this.getSetting('resort_name')
        || (skimore.RESORTS[this.resortId] && skimore.RESORTS[this.resortId].name)
        || this.resortId;

      const todayHoursEntry = findTodayEntry(data.openingHours || []);
      const venueFlowDetail = todayHoursEntry
        ? todayHoursEntry.hours
        : venue.detailText || venue.statusText;

      await this.safeSetCapability('ski_venue_open', venue.open);
      await this.safeSetCapability('ski_venue_status', venue.statusText);
      await this.safeSetCapability('ski_venue_opens_in', venue.opensInText);
      await this.safeSetCapability('ski_venue_closes_in', venue.closesInText);

      if (this._suppressVenueTriggers) {
        this._lastVenueOpen = venue.open;
        this._suppressVenueTriggers = false;
      } else if (prevVenueOpen !== null && prevVenueOpen !== venue.open) {
        if (venue.open) {
          await this._venueOpenedTrigger
            .trigger(this, {
              resort_name: resortName,
              detail: venueFlowDetail,
            }, {})
            .catch((err) => this.error('ski_venue_opened trigger:', err));
        } else {
          await this._venueClosedTrigger
            .trigger(this, {
              resort_name: resortName,
              detail: venueFlowDetail,
            }, {})
            .catch((err) => this.error('ski_venue_closed trigger:', err));
        }
        this._lastVenueOpen = venue.open;
      } else {
        this._lastVenueOpen = venue.open;
      }

      await this.setStoreValue('openLifts', data.lifts.open);
      await this.setStoreValue('openSlopes', data.slopes.open);
    } catch (error) {
      this.error('Failed to fetch SkiMore data:', error);
      this._consecutiveErrors++;
      if (this._consecutiveErrors >= 3) {
        await this.setUnavailable('Unable to reach SkiMore');
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

    if (data.snowProductionPercent != null) {
      await this.safeSetSnowProductionPercent(data.snowProductionPercent);
    }

    const lang = this.homey.i18n.getLanguage() === 'no' ? 'no' : 'en';

    await this.safeSetCapability(
      'ski_latest_message',
      data.messages.length > 0 ? skimore.formatLatestDriftsmelding(data.messages[0]) : '-',
    );

    await this.safeSetCapability(
      'ski_activity_today',
      skimore.formatActivityToday(data.calendarActivities, lang),
    );
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

  /**
   * ski_snow_production was previously a string; migrate to number % if setCapabilityValue fails.
   */
  async safeSetSnowProductionPercent(value) {
    const cap = 'ski_snow_production';
    try {
      if (this.hasCapability(cap)) {
        await this.setCapabilityValue(cap, value);
      }
    } catch (error) {
      try {
        if (this.hasCapability(cap)) {
          await this.removeCapability(cap);
        }
        await this.addCapability(cap);
        await this.setCapabilityValue(cap, value);
      } catch (e2) {
        this.error(`Failed to set ${cap}:`, e2);
      }
    }
  }

};
