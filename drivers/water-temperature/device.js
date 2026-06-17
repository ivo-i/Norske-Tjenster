"use strict"

const { Device } = require("homey")
const moment = require("moment")
const yrWatertemp = require("../../lib/yr-watertemp")

const POLL_INTERVAL_MS = 60 * 60 * 1000
const RELATIVE_TIME_INTERVAL_MS = 30 * 1000

class Badetemperatur extends Device {
  async onInit() {
    this.homey.app.dDebug("Badetemperatur has been initialized", "Badetemperatur")

    const language = this.homey.i18n.getLanguage()
    moment.locale(language === "no" ? "nb" : "en")

    this._clearTimers()
    this.locationId = await this._resolveAndMigrateLocationId()

    if (!this.locationId) {
      this.homey.app.dError("No bathing spot configured", "Badetemperatur")
      await this.setUnavailable(this.homey.__("waterTemperature.errors.noSpot"))
      return
    }

    await this.getTemps()

    this.interval = this.homey.setInterval(async () => {
      await this.getTemps()
    }, POLL_INTERVAL_MS)

    this.updatedInterval = this.homey.setInterval(async () => {
      await this.updateTimeAgo()
    }, RELATIVE_TIME_INTERVAL_MS)
  }

  async _resolveAndMigrateLocationId() {
    const settings = await this.getSettings()
    const locationId = await yrWatertemp.resolveLocationIdFromSettings(settings)

    if (!locationId) {
      return null
    }

    if (
      settings.locationId !== locationId
      || settings.spotId !== locationId
      || settings.schemaVersion !== yrWatertemp.SCHEMA_VERSION
    ) {
      await this.setSettings({
        schemaVersion: yrWatertemp.SCHEMA_VERSION,
        locationId,
        spotId: locationId,
      })
    }

    return locationId
  }

  async applyBathingSpot(spot) {
    await this.setSettings({
      schemaVersion: yrWatertemp.SCHEMA_VERSION,
      locationId: spot.locationId,
      spotId: spot.locationId,
      spotName: spot.name,
    })

    this.locationId = spot.locationId
    await this.setCapabilityValue("sensor_watertemp_location", spot.name)
    await this.getTemps()
  }

  async getTemps() {
    const settings = await this.getSettings()
    this.homey.app.dDebug(`Getting temperatures for ${this.getName()} (${this.locationId})`, "Badetemperatur")

    try {
      const reading = await yrWatertemp.fetchLocationReading(this.locationId)

      if (!reading || reading.temperature == null || !reading.time) {
        this.homey.app.dError(`No temperature data for ${this.locationId}`, "Badetemperatur")
        await this.setUnavailable(this.homey.__("waterTemperature.errors.noData"))
        return
      }

      this.latestTemps = {
        temperature: reading.temperature,
        time: reading.time,
      }

      await this.setCapabilityValue("sensor_watertemp_location", settings.spotName || this.getName())
      await this.setCapabilityValue("measure_temperature", this.latestTemps.temperature)
      await this.setCapabilityValue(
        "sensor_watertemp_lastUpdate",
        moment(this.latestTemps.time).fromNow(),
      )
      await this.setAvailable()

      this.homey.app.dDebug(`Temperatures updated for ${this.getName()}`, "Badetemperatur")
      return this.latestTemps
    } catch (error) {
      this.homey.app.dError(`Error getting temperatures: ${error.message}`, "Badetemperatur")
      await this.setUnavailable(this.homey.__("waterTemperature.errors.fetchFailed"))
    }
  }

  async updateTimeAgo() {
    if (!this.latestTemps?.time) {
      return
    }

    await this.setCapabilityValue(
      "sensor_watertemp_lastUpdate",
      moment(this.latestTemps.time).fromNow(),
    )
  }

  _clearTimers() {
    if (this.interval) {
      this.homey.clearInterval(this.interval)
      this.interval = undefined
    }
    if (this.updatedInterval) {
      this.homey.clearInterval(this.updatedInterval)
      this.updatedInterval = undefined
    }
  }

  async onAdded() {
    this.homey.app.dDebug(`${this.getName()} has been added`, "Badetemperatur")
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.homey.app.dDebug(`${this.getName()} settings where changed`, "Badetemperatur")

    if (changedKeys.includes("locationId") || changedKeys.includes("spotId")) {
      this.locationId = newSettings.locationId || newSettings.spotId
      await this.getTemps()
    }
  }

  async onRenamed(name) {
    this.homey.app.dDebug(`${this.getName()} was renamed`, "Badetemperatur")
  }

  async onDeleted() {
    this._clearTimers()
    this.homey.app.dDebug(`${this.getName()} has been deleted`, "Badetemperatur")
  }
}

module.exports = Badetemperatur
