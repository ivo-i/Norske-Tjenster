"use strict"

const { Driver } = require("homey")
const yrWatertemp = require("../../lib/yr-watertemp")

class Badetemperatur extends Driver {
  async onInit() {
    this.homey.app.dDebug("Badetemperatur has been initialized", "Badetemperatur")
  }

  async onPair(session) {
    this._registerSessionHandlers(session, {
      isRepair: false,
      onSave: async (spot) => {
        session.bathingSpot = spot
      },
    })
  }

  async onRepair(session, device) {
    this.homey.app.dDebug(`Started repair for device: ${device.getName()}`, "Badetemperatur")

    this._registerSessionHandlers(session, {
      isRepair: true,
      onSave: async (spot) => {
        await device.applyBathingSpot(spot)
      },
    })
  }

  _registerSessionHandlers(session, { isRepair, onSave }) {
    session.setHandler("isRepair", async () => isRepair)

    session.setHandler("getLocation", async () => ({
      lat: this.homey.geolocation.getLatitude(),
      lon: this.homey.geolocation.getLongitude(),
    }))

    session.setHandler("saveBathingSpot", async (data) => {
      const spot = yrWatertemp.normalizePairingPayload(data)
      if (!spot) {
        throw new Error("Invalid bathing spot data")
      }

      this.homey.app.dDebug(`Bathing spot selected: ${spot.name} (${spot.locationId})`, "Badetemperatur")
      await onSave(spot)
      return true
    })

    session.setHandler("list_devices", async () => {
      return await this.onPairListDevices(session)
    })

    session.setHandler("getRegions", async () => {
      return await yrWatertemp.fetchRegions()
    })

    session.setHandler("getTemperatures", async (region) => {
      return await yrWatertemp.fetchRegionSpots(region)
    })
  }

  async onPairListDevices(session) {
    if (!session.bathingSpot) {
      return []
    }

    const spot = session.bathingSpot
    const device = {
      name: `${spot.name} badeplass`,
      data: {
        id: spot.locationId,
      },
      settings: {
        schemaVersion: yrWatertemp.SCHEMA_VERSION,
        locationId: spot.locationId,
        spotId: spot.locationId,
        spotName: spot.name,
      },
    }

    this.homey.app.dDebug("Devices ready to be added:", "Badetemperatur", [device])
    return [device]
  }
}

module.exports = Badetemperatur
