'use strict';

const { Device } = require('homey');
const Homey = require('homey');
const axios = require('axios');
const moment = require('moment-timezone');
require('moment/locale/nb');

class PollenForecast extends Device {
    async onInit() {
        this.homey.app.dDebug('onInit started', 'PollenForecast');
        this.homey.clearInterval(this.interval);
        this.settings = this.getSettings();
        this.device = this.getData();
        this.interval = undefined;
        this.capabilities = {};
        this.initCapabilities = {};
        this.deviceCapabilities = this.getCapabilities();
        this.deviceCapabilities.
            forEach(capability => {
                if (capability.includes('timestamp')) {
                    this.initCapabilities.timestamp = capability;
                } else {
                    const species = capability.split('_')[2];
                    this.initCapabilities[species] = capability;
                }
            });

        const language = this.homey.i18n.getLanguage();
        moment.locale(language === 'no' ? 'nb' : 'en');

        if (!this.hasCapability('sensor_timestamp')) {
            await this.addCapability('sensor_timestamp');
        }

        if (!this.settings.region || this.settings.region === null || this.settings.region === undefined || this.settings.region === "" || this.settings.region === "null") {
            this.homey.app.dDebug('Region is not set, fetching region', 'PollenForecast');
            const region = await this.getRegion(null, { lat: this.device.lat, lng: this.device.lng });
            const county = this.normalizeCountyForSettings(region?.county);
            if (county) {
                await this.setSettings({ region: county });
                this.settings = this.getSettings();
                this.homey.app.dDebug('Region set to ' + county, 'PollenForecast');
            }
        }

        this.homey.app.dInfo('PollenForecast has been initialized', 'PollenForecast');
        await this.onReady();
        this.homey.app.dDebug('onInit completed', 'PollenForecast');
    }

    async onReady() {
        this.homey.app.dDebug('onReady started', 'PollenForecast');
        this.capabilities = this.getPollenCapabilities(this.settings.dataType, this.settings.displayType);
        const initCapabilitiesKeys = Object.keys(this.initCapabilities);
        const capabilitiesKeys = Object.keys(this.capabilities);
        if (initCapabilitiesKeys.length !== capabilitiesKeys.length || initCapabilitiesKeys.some((key, index) => key !== capabilitiesKeys[index] || this.capabilities[key] !== this.initCapabilities[key])) {
            this.homey.app.dDebug('Incorrect capabilities, updating...', 'PollenForecast');
            await this.updateCapabilities('remove', this.initCapabilities);
            await this.updateCapabilities('add', this.capabilities);
            this.homey.app.dDebug('Capabilities updated successfully', 'PollenForecast');
        }
        if (this.settings.dataType === 'simple') {
            this.updateDevice = this.updateSimpleDevice.bind(this);
        } else if (this.settings.dataType === 'extended') {
            this.updateDevice = this.updateExtendedDevice.bind(this);
        }

        const pollInterval = 1000 * 60 * 30;
        this.interval = this.homey.setInterval(async () => {
            await this.updateDevice();
            this.homey.app.dDebug('Device updated', 'PollenForecast');
        }, pollInterval);
        await this.updateDevice();
        this.homey.app.dDebug('Interval set to 30 minutes', 'PollenForecast');
        this.homey.app.dInfo('PollenForecast is ready', 'PollenForecast');
        this.homey.app.dDebug('onReady completed', 'PollenForecast');
    }

    async getPollenData() {
        try {
            const response = await axios.get(`https://apigw.temalogic.com/naaf-prod/pollen-api/pollen/allRegionsForecast`, {
                headers: {
                    AppKey: "kdk2jCugEKD9274jyphm6voeVoNKDk2hao3331ssBiw25r",
                    DeviceKey: "2F6E2311-7C15-4ED1-8E42-5EEE72D959B9"
                },
            });
            return response.data;
        } catch (error) {
            this.homey.app.dError('An error occurred while fetching data:', 'PollenForecast', { status: error?.response?.status, message: error?.response?.data?.message });
            return false;
        }
    }

    async updateExtendedDevice() {
        this.homey.app.dDebug('Updating extended device', 'PollenForecast');
        try {
            const data = await this.getPollenData();
            if (!data || data.length === 0) {
                this.homey.app.dError('No pollen data available', 'PollenForecast');
                return false;
            }

            const todaysData = data.find(d => moment(d.date).isSame(moment(), 'day'));
            if (!todaysData) {
                this.homey.app.dError('No forecast found for today', 'PollenForecast', todaysData);
                return false;
            }

            const region = await this.getRegion(this.settings.region);
            let regionData = todaysData.regions.find(r => r.id?.toLowerCase() === region?.region?.id?.toLowerCase());
            if (!regionData) {
                this.homey.app.dError('Region not found, using default.', 'PollenForecast', regionData);
                regionData = todaysData.regions.find(r => r.displayName === 'Østlandet med Oslo');
            }

            const pollentypes = regionData.pollentypes;
            let pollenValues = {};
            for (const pollen of pollentypes) {
                const value = this.getValueRating(pollen.distribution);
                pollenValues[pollen.displayName.toLowerCase()] = this.settings.displayType === 'text' ? value : this.getAssumedValueRating(pollen.distribution) || pollen.distribution;
            }

            // Set capability values for each pollentype
            await this.setCapabilityValue(this.capabilities.alder, pollenValues['or']);
            await this.setCapabilityValue(this.capabilities.birch, pollenValues['bjørk']);
            await this.setCapabilityValue(this.capabilities.grass, pollenValues['gress']);
            await this.setCapabilityValue(this.capabilities.hazel, pollenValues['hassel']);
            await this.setCapabilityValue(this.capabilities.mugwort, pollenValues['burot']);
            await this.setCapabilityValue(this.capabilities.willow, pollenValues['salix']);
            await this.setCapabilityValue('sensor_timestamp', moment().tz('Europe/Oslo').format('HH:mm:ss - DD.MM.YYYY'));

            this.homey.app.dInfo('PollenForecast has been updated', 'PollenForecast');
            return true;
        } catch (error) {
            this.homey.app.dError('An error occurred while updating device:', 'PollenForecast', { error });
            return false;
        }
    }

    async updateSimpleDevice() {
        this.homey.app.dDebug('Updating simple device', 'PollenForecast');
        try {
            const data = await this.getPollenData();
            if (!data || data.length === 0) {
                this.homey.app.dError('No pollen data available', 'PollenForecast');
                return false;
            }

            const todaysData = data.find(d => moment(d.date).isSame(moment(), 'day'));
            if (!todaysData) {
                this.homey.app.dError('No forecast found for today', 'PollenForecast');
                return false;
            }

            const region = await this.getRegion(this.settings.region);
            let regionData = todaysData.regions.find(r => r.id?.toLowerCase() === region?.region?.id?.toLowerCase());
            if (!regionData) {
                this.homey.app.dError('Region not found, using default.', 'PollenForecast', regionData);
                regionData = todaysData.regions.find(r => r.displayName === 'Østlandet med Oslo');
            }

            const pollentypes = regionData.pollentypes;
            let maxValues = { grass: -1, tree: -1, weed: -1 };

            for (const pollen of pollentypes) {
                const category = this.getPollenCategory(pollen.id);
                let value = pollen.distribution;
                if (category && value > maxValues[category]) {
                    value = this.getValueRating(pollen.distribution);
                    maxValues[category] = this.settings.displayType === 'text' ? value : this.getAssumedValueRating(pollen.distribution) || pollen.distribution;
                }
            }

            // Set capability values for each pollentype
            await this.setCapabilityValue(this.capabilities.grass, maxValues.grass);
            await this.setCapabilityValue(this.capabilities.tree, maxValues.tree);
            await this.setCapabilityValue(this.capabilities.weed, maxValues.weed);

            // Timestamp
            await this.setCapabilityValue('sensor_timestamp', moment().tz('Europe/Oslo').format('HH:mm:ss - DD.MM.YYYY'));

            this.homey.app.dInfo('PollenForecast has been updated', 'PollenForecast');
            return true;
        } catch (error) {
            this.homey.app.dError('An error occurred while updating device:', 'PollenForecast', { error });
            return false;
        }
    }

    getPollenCategory(pollenId) {
        const grassTypes = ['gress'];
        const treeTypes = ['or', 'hassel', 'bjork', 'salix'];
        const weedTypes = ['burot'];

        if (grassTypes.includes(pollenId)) return 'grass';
        if (treeTypes.includes(pollenId)) return 'tree';
        if (weedTypes.includes(pollenId)) return 'weed';

        return null;
    }

    getValueRating(value) {
        if (value <= 0) {
            return 'Ingen spredning';
        } else if (value >= 1 && value < 2) {
            return 'Beskjeden spredning';
        } else if (value >= 2 && value < 3) {
            return 'Moderat spredning';
        } else if (value >= 3 && value < 4) {
            return 'Kraftig spredning';
        } else if (value >= 4) {
            return 'Ekstrem spredning';
        }
    }

    getAssumedValueRating(value) {
        if (value <= 0) {
            return 0;
        } else if (value >= 1 && value < 2) {
            return 5;
        } else if (value >= 2 && value < 3) {
            return 50;
        } else if (value >= 3 && value < 4) {
            return 500;
        } else if (value >= 4) {
            return 2500;
        }
    }

    async updateCapabilities(action, capabilities) {
        for (let key of Object.keys(capabilities)) {
            const capability = capabilities[key];
            if (action === 'remove' && this.hasCapability(capability)) {
                this.homey.app.dDebug(`Removing ${capability}`, 'PollenForecast');
                await this.removeCapability(capability);
            } else if (action === 'add' && !this.hasCapability(capability)) {
                this.homey.app.dDebug(`Adding ${capability}`, 'PollenForecast');
                await this.addCapability(capability);
            }
        }
    }

    getPollenCapabilities(dataType, displayType) {
        if (dataType === 'simple') {
            return this.getSimpleCapabilities(displayType);
        } else if (dataType === 'extended') {
            return this.getExtendedCapabilities(displayType);
        }
    }

    getSimpleCapabilities(displayType) {
        if (displayType === 'text') {
            return {
                grass: "sensor_pollen_grass",
                tree: "sensor_pollen_tree",
                weed: "sensor_pollen_weed",
                timestamp: "sensor_timestamp",
            }
        } else if (displayType === 'number') {
            return {
                grass: "measure_pollen_grass",
                tree: "measure_pollen_tree",
                weed: "measure_pollen_weed",
                timestamp: "sensor_timestamp",
            }
        }
    }

    getExtendedCapabilities(displayType) {
        if (displayType === 'text') {
            return {
                alder: "sensor_pollen_alder",
                birch: "sensor_pollen_birch",
                grass: "sensor_pollen_grass",
                hazel: "sensor_pollen_hazel",
                mugwort: "sensor_pollen_mugwort",
                willow: "sensor_pollen_willow",
                timestamp: "sensor_timestamp",
            }
        } else if (displayType === 'number') {
            return {
                alder: "measure_pollen_alder",
                birch: "measure_pollen_birch",
                grass: "measure_pollen_grass",
                hazel: "measure_pollen_hazel",
                mugwort: "measure_pollen_mugwort",
                willow: "measure_pollen_willow",
                timestamp: "sensor_timestamp",
            }
        }
    }

    async onAdded() {
        this.homey.app.dInfo('PollenForecast has been added', 'PollenForecast');
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.app.dInfo('Settings were changed', 'PollenForecast');

        if (changedKeys.includes('dataType') || changedKeys.includes('displayType')) {
            this.homey.app.dDebug('Starting to update capabilities due to dataType or displayType change', 'PollenForecast');
            await this.updateCapabilities('remove', this.capabilities);

            const dataType = newSettings.dataType ?? this.settings.dataType;
            const displayType = newSettings.displayType ?? this.settings.displayType;

            if (dataType === 'simple') {
                this.updateDevice = this.updateSimpleDevice.bind(this);
                this.homey.app.dDebug('Device update method set to simple', 'PollenForecast');
            } else if (dataType === 'extended') {
                this.updateDevice = this.updateExtendedDevice.bind(this);
                this.homey.app.dDebug('Device update method set to extended', 'PollenForecast');
            }

            this.homey.app.dDebug('Waiting for 1 second before updating capabilities', 'PollenForecast');
            await new Promise(resolve => setTimeout(resolve, 1000));

            this.capabilities = this.getPollenCapabilities(dataType, displayType);
            this.homey.app.dDebug(`Capabilities updated: ${JSON.stringify(this.capabilities)}`, 'PollenForecast');

            await this.updateCapabilities('add', this.capabilities);
            this.homey.app.dDebug('Capabilities added', 'PollenForecast');

            this.settings = newSettings;
            this.homey.app.dInfo('DisplayType was changed to ' + this.settings.displayType, 'PollenForecast');

            this.homey.app.dDebug('Removing update interval', 'PollenForecast');
            this.homey.clearInterval(this.interval);
            this.interval = this.homey.setInterval(async () => {
                await this.updateDevice();
            }, 1000 * 60 * 30);
            this.homey.app.dInfo('PollenForecast interval set to 30 minutes', 'PollenForecast');
            await this.updateDevice();
            this.homey.app.dDebug('Device update completed', 'PollenForecast');
        }

        if (changedKeys.includes('region')) {
            this.homey.app.dDebug('PollenForecast region updated to ' + newSettings.region, 'PollenForecast');

            this.settings = newSettings;

            this.homey.app.dDebug('Removing update interval', 'PollenForecast');
            this.homey.clearInterval(this.interval);
            this.interval = this.homey.setInterval(async () => {
                await this.updateDevice();
            }, 1000 * 60 * 30);
            this.homey.app.dInfo('PollenForecast interval set to 30 minutes', 'PollenForecast');
            await this.updateDevice();
            this.homey.app.dDebug('Device update completed', 'PollenForecast');
        }
    }

    async onRenamed(name) {
        this.homey.app.dInfo('PollenForecast was renamed', 'PollenForecast');
    }

    async onDeleted() {
        this.homey.app.dDebug('PollenForecast is being deleted', 'PollenForecast');
        this.homey.clearInterval(this.interval);
        this.homey.app.dDebug('PollenForecast interval cleared', 'PollenForecast');
        this.homey.app.dInfo('PollenForecast has been deleted', 'PollenForecast');
    }

    normalizeCountyForSettings(county) {
        if (!county) return null;

        const countyLower = county.toLowerCase();
        const validCounties = new Set([
            'akershus', 'agder', 'buskerud', 'finnmark', 'innlandet',
            'møre og romsdal', 'nordland', 'oslo', 'rogaland', 'telemark',
            'troms', 'trøndelag', 'vestfold', 'vestland', 'østfold',
        ]);

        if (validCounties.has(countyLower)) {
            return countyLower;
        }

        const countyAliasMap = {
            'viken': 'akershus',
            'vestfold og telemark': 'vestfold',
            'troms og finnmark': 'troms',
        };

        return countyAliasMap[countyLower] || 'oslo';
    }

    async getRegion(county = null, { lat, lng } = {}) {
        this.homey.app.dDebug(`Getting region for ${county ? county : lat + ',' + lng}`, 'PollenForecast');
        const availableRegions = [
            { id: 'ostlandetmedoslo', name: 'Østlandet med Oslo' },
            { id: 'sorlandet', name: 'Sørlandet' },
            { id: 'rogaland', name: 'Rogaland' },
            { id: 'hordaland', name: 'Hordaland' },
            { id: 'sognogfjordane', name: 'Sogn og Fjordane' },
            { id: 'moreogromsdal', name: 'Møre og Romsdal' },
            { id: 'indreostlandet', name: 'Indre Østlandet' },
            { id: 'sentralefjellstrokisornorge', name: 'Sentrale fjellstrøk i Sør-Norge' },
            { id: 'trondelag', name: 'Trøndelag' },
            { id: 'nordland', name: 'Nordland' },
            { id: 'troms', name: 'Troms' },
            { id: 'finnmark', name: 'Finnmark' },
        ];

        const countyToRegionMap = {
            'akershus': 'ostlandetmedoslo',
            'agder': 'sorlandet',
            'buskerud': 'ostlandetmedoslo',
            'viken': 'ostlandetmedoslo',
            'innlandet': 'ostlandetmedoslo',
            'møre og romsdal': 'moreogromsdal',
            'nordland': 'nordland',
            'oslo': 'ostlandetmedoslo',
            'rogaland': 'rogaland',
            'vestfold og telemark': 'ostlandetmedoslo',
            'troms': 'troms',
            'finnmark': 'finnmark',
            'trøndelag': 'trondelag',
            'vestland': 'hordaland',
            'vestfold': 'ostlandetmedoslo',
            'østfold': 'ostlandetmedoslo',
        };

        if (county) {
            const regionId = countyToRegionMap[county.toLowerCase()] || 'ostlandetmedoslo';
            let region = availableRegions.find(r => r.id === regionId);
            if (!region) {
                region = availableRegions.find(r => r.name === 'Østlandet med Oslo');
                this.homey.app.dError('Region not found, using default.', 'PollenForecast', { regionId, region });
                return {
                    county,
                    region
                };
            }
            this.homey.app.dDebug(`Region found: ${region?.name}`, 'PollenForecast');
            return {
                county,
                region
            };
        }

        try {
            const response = await axios.get(`https://api.kartverket.no/kommuneinfo/v1/punkt?nord=${lat}&ost=${lng}&koordsys=4258`, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const data = response.data;
            const county = data?.fylkesnavn?.toLowerCase();

            const regionId = countyToRegionMap[county.toLowerCase()] || 'ostlandetmedoslo';
            const region = availableRegions.find(r => r.id === regionId);

            this.homey.app.dDebug(`Region found: ${region?.name}`, 'PollenForecast');
            return {
                county,
                region
            };
        } catch (error) {
            this.homey.app.dError(`Error getting region:`, 'PollenForecast', { error: error?.response?.data || error });
            return null;
        }
    }
}

module.exports = PollenForecast;
