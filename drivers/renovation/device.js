'use strict';

const Homey = require('homey');

const CAPABILITIES_TO_MIGRATE = [
  'pickup_next_date',
  'pickup_next_days',
];

const FRACTION_CAPABILITY_SETTING_MAP = {
  pickup_glass: 'show_fraction_glass',
  pickup_food: 'show_fraction_food',
  pickup_paper: 'show_fraction_paper',
  pickup_plastic: 'show_fraction_plastic',
  pickup_general: 'show_fraction_general',
  pickup_hazardous: 'show_fraction_hazardous',
  pickup_garden: 'show_fraction_garden'
};

module.exports = class RenovasjonDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    const provider = this.getStoreValue('provider');
    this.adapter = this.driver.getAdapter(provider);

    if (!this.adapter) {
      this.error(`No adapter found for provider: ${provider}`);
      return;
    }

    // Update data if the device exists. If not it will be updated in onAdded() after setup.
    if (this.getStoreValue("deviceAdded")) {
      await this.ensureCapabilities();
      await this.updateData();
      await this.updateCapabilities();
    }
  }

  // Ensures that capabilities that may have been added after the device was first created are
  // added to the device.
  async ensureCapabilities() {
    for (const capability of CAPABILITIES_TO_MIGRATE) {
      if (!this.hasCapability(capability)) {
        await this.addCapability(capability);
      }
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    await this.updateData();

    // Set default settings based on supported fractions
    const supportedFractions = {};
    for (const key in this.fractionDates) {
      supportedFractions[key] = !!this.fractionDates[key];
    }
    await this.setSettings({
      show_fraction_glass: supportedFractions.glass || false,
      show_fraction_food: supportedFractions.food || false,
      show_fraction_paper: supportedFractions.paper || false,
      show_fraction_plastic: supportedFractions.plastic || false,
      show_fraction_general: supportedFractions.general || false,
      show_fraction_hazardous: supportedFractions.hazardous || false,
      show_fraction_garden: supportedFractions.garden || false,
    });
    await this.showAndHideCapabilities();
    await this.updateCapabilities();
    // Mark as added so we know it's safe to rerun capability update in onInit()
    await this.setStoreValue("deviceAdded", true);
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.some(str => str.startsWith("show_fraction_"))) {
      await this.showAndHideCapabilities(newSettings);
    }
    await this.updateCapabilities(newSettings);
  }

  async ensurePickupNextIsLast(settings) {
    const pStr = "pickup_next";
    const caps = this.getCapabilities();
    if (caps[caps.length - 1] !== pStr) {
      await this.removeCapability(pStr);
      await this.addCapability(pStr);
    }
  }

  async showAndHideCapabilities(settings = this.getSettings()) {
    for (const [cap, settingKey] of Object.entries(FRACTION_CAPABILITY_SETTING_MAP)) {
      const enabled = settings[settingKey];
      if (enabled && !this.hasCapability(cap)) {
        await this.addCapability(cap);
      } else if (!enabled && this.hasCapability(cap)) {
        await this.removeCapability(cap);
      }
    }
    await this.ensurePickupNextIsLast(settings);
  }

  diffInCalendarDays(dateFuture, datePast) {
    if (!dateFuture || !datePast) return null;
    const utcFuture = Date.UTC(
      dateFuture.getFullYear(),
      dateFuture.getMonth(),
      dateFuture.getDate()
    );

    const utcPast = Date.UTC(
      datePast.getFullYear(),
      datePast.getMonth(),
      datePast.getDate()
    );

    return Math.floor((utcFuture - utcPast) / 86400000);
  }

  formatDate(date, relative = false) {
    if (!date) return null;
    if (relative) {
      const diffDays = this.diffInCalendarDays(date, new Date());
      const dayOrDays = (diffDays == 1) ? this.homey.__('grammar.day') : this.homey.__('grammar.days');
      return `${diffDays} ${dayOrDays}`;
    }
    else {
      const language = this.homey.i18n.getLanguage();
      return date.toLocaleDateString(language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    }
  }

  getNextPickup(fractions) {
    let minDate = null;
    let nearestFractions = [];

    for (const [fraction, date] of Object.entries(fractions)) {
      if (!date) {
        continue;
      }

      if (!minDate || date < minDate) {
        minDate = date;
        nearestFractions = [fraction];
      }
      else if (date.getTime() === minDate.getTime()) {
        nearestFractions.push(fraction);
      }
    }

    if (!minDate) {
      return { date: null, fractions: [] };
    }

    return {
      date: minDate,
      fractions: nearestFractions,
    };
  }

  async updateCapability(cap, settings = this.getSettings()) {
    if (cap == "pickup_next_fractions") {
      const translatedNextFractions = this.nextPickup.fractions.map(key => this.homey.__(`fractions.${key}.medium`));
      await this.setCapabilityValue(cap, translatedNextFractions.join(', '));
    }
    else if (cap == "pickup_next_date") {
      await this.setCapabilityValue(cap, this.formatDate(this.nextPickup.date, false));
    }
    else if (cap == "pickup_next_days") {
      await this.setCapabilityValue(cap, this.diffInCalendarDays(this.nextPickup.date, new Date()));
    }
    else if (cap == "pickup_next") {
      const relativeTime = settings.relative_time == "true" || settings.relative_time == "only_next";
      let str = this.formatDate(this.nextPickup.date, relativeTime);
      if (relativeTime && settings.show_next_fractions) {
        str += ` ${this.homey.__('grammar.until')}`;
      }
      if (settings.show_next_fractions) {
        const translatedNextFractions = this.nextPickup.fractions.map(key => this.homey.__(`fractions.${key}.medium`));
        str += ` ${translatedNextFractions.join(', ')}`;
      }
      await this.setCapabilityValue(cap, str);
    }
    else {
      const relativeTime = settings.relative_time == "true";
      const fractionName = cap.split("_")[1];
      await this.setCapabilityValue(cap, this.formatDate(this.fractionDates[fractionName], relativeTime));
    }
  }

  async updateCapabilities(settings = this.getSettings()) {
    for (const cap of this.getCapabilities()) {
      await this.updateCapability(cap, settings);
    }
  }

  async updateData() {
    const addressData = this.getStoreValue('addressData');
    const addressUUID = this.getStoreValue('addressUUID');

    this.fractionDates = await this.adapter.fetchFractionDates(addressData, addressUUID);
    this.nextPickup = this.getNextPickup(this.fractionDates);
    if (this.homey.api?.realtime) {
      this.homey.api.realtime('dataUpdated', { deviceId: this.getId() });
    }
  }

  async update(isRetry = false) {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }

    if (!this.adapter) {
      return;
    }

    try {
      await this.updateData();
    }
    catch (error) {
      if (!isRetry) {
        this.error('Error updating data, retrying immediately:', error.message);
        await this.update(true);
        return;
      }
      else {
        this.error('Error updating data on retry, scheduling retry in 5 minutes:', error.message);
        this._retryTimer = setTimeout(() => {
          this._retryTimer = null;
          this.update(true).catch((updateError) => {
            this.error('Retry update failed:', updateError.message);
          });
        }, 5 * 60 * 1000);
        return;
      }
    }
    await this.updateCapabilities();
  }

  async onUninit() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

};
