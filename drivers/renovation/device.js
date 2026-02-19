'use strict';

const Homey = require('homey');

module.exports = class RenovasjonDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('RenovasjonDevice has been initialized');
    const provider = this.getStoreValue('provider');
    this.adapter = this.driver.getAdapter(provider);
    
    if (!this.adapter) {
      this.error(`No adapter found for provider: ${provider}`);
      return;
    }
    
    // Update data if the device exists. If not it will be updated in onAdded() after setup.
    if (this.getStoreValue("deviceAdded")) {
      await this.updateData();
      await this.updateCapabilities();
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('RenovasjonDevice has been added');
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
   * @returns {Promise} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('RenovasjonDevice settings were changed');
    if (changedKeys.some(str => str.startsWith("show_fraction_"))) {
      await this.showAndHideCapabilities(newSettings);
    }
    await this.updateCapabilities(newSettings);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('RenovasjonDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('RenovasjonDevice has been deleted');
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
    const map = {
      pickup_glass: 'show_fraction_glass',
      pickup_food: 'show_fraction_food',
      pickup_paper: 'show_fraction_paper',
      pickup_plastic: 'show_fraction_plastic',
      pickup_general: 'show_fraction_general',
      pickup_hazardous: 'show_fraction_hazardous',
      pickup_garden: 'show_fraction_garden'
    };

    for (const [cap, settingKey] of Object.entries(map)) {
      const enabled = settings[settingKey];
      if (enabled && !this.hasCapability(cap)) {
        await this.addCapability(cap);
      } else if (!enabled && this.hasCapability(cap)) {
        await this.removeCapability(cap);
      }
    }
    await this.ensurePickupNextIsLast(settings);
  }

  formatDate(date, relative = false) {
    if (!date) return null;
    if (relative) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = parseInt((date - today) / (1000 * 60 * 60 * 24));
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
    // Filter out null values
    const entries = Object.entries(fractions).filter(([, date]) => date);
    if (entries.length === 0) {
      return { date: null, fractions: [] };
    }
    // Earliest date
    const minDate = new Date(Math.min(...entries.map(([, date]) => date)));

    // Fractions with the earliest date
    const nearest = entries.filter(
      ([, date]) => date.getTime() === minDate.getTime()
    );

    return {
      date: minDate,
      fractions: nearest.map(([key]) => key),
    };
  }

  async updateCapability(cap, settings = this.getSettings()) {
    if (cap == "pickup_next_fractions") {
      const translatedNextFractions = this.nextPickup.fractions.map(key => this.homey.__(`fractions.${key}.medium`));
      await this.setCapabilityValue(cap, translatedNextFractions.join(', '));
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
    this.log('Updating capabilities for RenovasjonDevice');
    for (const cap of this.getCapabilities()) {
      await this.updateCapability(cap, settings);
    }
  }

  async updateData() {
    this.log('Updating data for RenovasjonDevice');
    
    if (!this.adapter) {
      this.error('No adapter available for this device');
      return;
    }
    
    const addressData = this.getStoreValue('addressData');
    const addressUUID = this.getStoreValue('addressUUID');

    try {
      this.fractionDates = await this.adapter.fetchFractionDates(addressData, addressUUID);
      this.nextPickup = this.getNextPickup(this.fractionDates);
    }
    catch (error) {
      this.error(`${this.adapter.getName()} could not fetch fraction dates:`, error);
      // Initialize with empty fractions to prevent null reference errors
      if (!this.fractionDates) {
        this.fractionDates = {
          general: null,
          food: null,
          paper: null,
          plastic: null,
          glass: null,
          hazardous: null,
          garden: null
        };
        this.nextPickup = { date: null, fractions: [] };
      }
    }
  }

  async update() {
    await this.updateData();
    await this.updateCapabilities();
  }

};
