'use strict';

const { Device } = require('homey');
const axios = require('axios');
const { MET_USER_AGENT } = require('../../lib/util');

class AirQualityIndex extends Device {
    async onInit() {
        this.settings = this.getSettings();
        this.name = this.getName();
        this.interval = null;

        await this.updateDevice();
        this.interval = this.homey.setInterval(async () => await this.updateDevice(), 30 * 60 * 1000); // 30 minutter

        this.homey.app.dDebug(`${this.name} has been initialized`, 'Air Quality Index');
    }

    async updateDevice() {
        const data = await this.fetchAQI();
        if (!data) return;

        try {
            const currentTime = new Date();
            const currentHour = currentTime.toISOString().slice(0, 13); // YYYY-MM-DDTHH

            const currentTempData = data.met.time.find(time => time.from.startsWith(currentHour));
            const currentAQIData = data.aqi.time.find(time => time.from.startsWith(currentHour));

            if (currentTempData && currentAQIData) {
                await this.setCapabilityValue('measure_temperature', parseFloat(parseFloat(currentTempData.variables.air_temperature_0m.value).toFixed(2)));
                await this.setCapabilityValue('measure_humidity', parseFloat(parseFloat(currentTempData.variables.relative_humidity_2m.value).toFixed(2)));
                await this.setCapabilityValue('measure_wind_strength', parseFloat(parseFloat(currentTempData.variables.wind_speed.value).toFixed(2)));
                await this.setCapabilityValue('measure_wind_angle', parseFloat(parseFloat(currentTempData.variables.wind_direction.value).toFixed(2)));
                await this.setCapabilityValue('measure_pressure', parseFloat(parseFloat(currentTempData.variables.surface_air_pressure.value).toFixed(2)));
                await this.setCapabilityValue('measure_rain', parseFloat(parseFloat(currentTempData.variables.rainfall_amount.value).toFixed(2)));
                await this.setCapabilityValue('measure_no2', parseFloat(parseFloat(currentAQIData.variables.no2_concentration.value).toFixed(2)));
                await this.setCapabilityValue('measure_pm10', parseFloat(parseFloat(currentAQIData.variables.pm10_concentration.value).toFixed(2)));
                await this.setCapabilityValue('measure_pm25', parseFloat(parseFloat(currentAQIData.variables.pm25_concentration.value).toFixed(2)));
                await this.setCapabilityValue('measure_o3', parseFloat(parseFloat(currentAQIData.variables.o3_concentration.value).toFixed(2)));
            }

            this.homey.app.dDebug(`${this.name} was updated successfully`, 'Air Quality Index');
            return true;
        } catch (error) {
            this.homey.app.dError('An error occurred while fetching AQI data', 'Air Quality Index', error);
            return false;
        }
    }

    async fetchAQI() {
        const metHeaders = {
            'User-Agent': MET_USER_AGENT,
            Accept: 'application/json',
        };
        const metOpts = { headers: metHeaders, timeout: 15000 };
        try {
            const aqiResponse = await axios.get(
                `https://api.met.no/weatherapi/airqualityforecast/0.1/?station=${this.settings.stationId}`,
                metOpts,
            );
            const tempResponse = await axios.get(
                `https://api.met.no/weatherapi/airqualityforecast/0.1/met?station=${this.settings.stationId}`,
                metOpts,
            );
            const responseModel = {
                aqi: {
                    ...aqiResponse.data.data,
                },
                met: {
                    ...tempResponse.data.data,
                },
            }

            return responseModel;
        } catch (error) {
            if (error && error.response && error.response.status === 403) {
                this.homey.app.dError(
                    'met.no returned 403 (forbidden). Usually missing/invalid User-Agent — check app update.',
                    'Air Quality Index',
                    { status: 403, stationId: this.settings.stationId },
                );
            }
            this.homey.app.dError('An error occurred while fetching AQI data', 'Air Quality Index', error);
            return false;
        }
    }

    async onAdded() {
        this.homey.app.dDebug(`${this.name} has been added`, 'Air Quality Index');
        await this.setCapabilityOptions('measure_wind_strength', {
            units: 'm/s',
        });
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.app.dDebug(`${this.name} settings were changed`, 'Air Quality Index');
    }

    async onRenamed(name) {
        this.homey.app.dDebug(`${this.name} was renamed to ${name}`, 'Air Quality Index');
    }

    async onDeleted() {
        if (this.interval) this.homey.clearInterval(this.interval);
        this.homey.app.dDebug(`${this.name} has been deleted`, 'Air Quality Index');
    }

}

module.exports = AirQualityIndex;
