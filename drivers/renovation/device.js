"use strict"

const { Device } = require("homey")
const Homey = require("homey")
const axios = require("axios")
const { CronJob } = require("cron")
const cron = require("cron-validator")

class Renovation extends Device {
  async onInit() {
    this.homey.app.dDebug(`${this.getName()} has been initialized`, "Renovation")

    // Stop previous interval if it exists
    if (this.interval) {
      clearInterval(this.interval)
      this.homey.app.dDebug("Cleared interval", "Renovation")
    } else {
      this.interval = null
    }

    // Ensure the device has the required capabilities
    if (!this.hasCapability("measure_next_waste_days_left")) {
      await this.addCapability("measure_next_waste_days_left")
    }

    this.deviceID = this.getData().id

    this.settings = await this.getSettings()
    this.provider = this.settings.provider

    this.checkboxSettings = {}
    //this.homey.app.dDebug(this.settings);
    //Loop gjennom alle checkboxer og legg til i checkboxSettings
    const checkboxKeys = Object.keys(this.settings).filter((key) => key.includes("waste_"))
    checkboxKeys.forEach((key) => {
      this.checkboxSettings[key] = this.settings[key]
    })

    this.addressData = {
      addressID: this.settings.addressID,
      provider: this.provider,
      fullAddress: this.settings.address,
      addressCode: this.settings.addressCode,
      countyId: this.settings.countyId,
    }

    const nextWasteTypes = await this.homey.flow.createToken(`nextWasteTypes-${this.deviceID}_v2`, {
      type: "string",
      title: this.homey.__("renovation.device.tokens.nextWasteTypes.title", { fullAddress: this.addressData.fullAddress }),
      value: this.homey.__("renovation.device.tokens.nextWasteTypes.value"),
    })

    this.nextWasteTypes = nextWasteTypes
    this.nextWasteTypes.setValue = this.nextWasteTypes.setValue.bind(this.nextWasteTypes)

    /*await this.checkAPIForUpdates();*/
    await this.setCronJob()
    await this.ready()
  }

  async setCronJob() {
    if (this.cronJob) {
      this.cronJob.stop()
      this.homey.app.dDebug("Stopped flow cron job", "Renovation")
    }

    this.timeToTrigger = {
      hour: "20",
      minute: "00",
    }
    this.settings.flowTime = this.settings.flowTime.toString()
    if (this.settings.flowTime.length > 0 && this.settings.flowTime.includes(":")) {
      this.timeToTrigger = this.settings.flowTime.split(":")
      this.timeToTrigger = {
        hour: this.timeToTrigger[0],
        minute: this.timeToTrigger[1],
      }
      this.homey.app.dDebug(`Time to trigger settings found: ${this.timeToTrigger.hour}:${this.timeToTrigger.minute}`, "Renovation")
    } else if (!this.settings.flowTime.includes(":")) {
      this.timeToTrigger = {
        hour: this.settings.flowTime,
        minute: 0,
      }
      this.homey.app.dDebug(`Time to trigger settings found: ${this.timeToTrigger.hour}:${this.timeToTrigger.minute}`, "Renovation")
    }

    let cronString = `${this.timeToTrigger.minute} ${this.timeToTrigger.hour} * * *`
    if (cron.isValidCron(cronString)) {
      this.homey.app.dDebug(`Cron string is valid.`, "Renovation")

      //Kjør cron hver dag på det klokkeslettet som er satt i settings.
      this.cronJob = CronJob.from({
        //cronTime: '00 10 * * *',
        cronTime: cronString,
        onTick: async () => {
          this.homey.app.dDebug("Cron job triggered flow card", "Renovation")
          await this.triggerFlowCard()
        },
        start: false,
        timeZone: "Europe/Oslo",
      })
      this.cronJob.start()
      this.homey.app.dDebug("Started flow cron job at " + this.timeToTrigger.hour + ":" + this.timeToTrigger.minute, "Renovation")
    }
  }

  async checkAPIForUpdates() {
    const url = "https://api.avfallskalender.no/v1/version"
    const headers = {
      "x-api-key": Homey.env.API_KEY,
    }
    await axios
      .get(url, { headers })
      .then(async (response) => {
        const version = this.getSetting("apiVersion")
        const apiVersion = response.data.version
        let changelog = response.data.changelog[0]
        //Hent alt fra "\n\n* " og frem til slutten av teksten
        changelog = changelog.substring(changelog.indexOf("\n\n* ") + 1)

        this.homey.app.dDebug(`Current API version: v${version}. Latest API version: v${apiVersion}.`, "Renovation")
        if (apiVersion !== version) {
          this.homey.app.dDebug(`API version v${version} is outdated. Updating to v${apiVersion}...`, "Renovation")
          await this.setSettings({ apiVersion: apiVersion })
          this.homey.app.dDebug(`Updated API version from v${version} to v${apiVersion}`, "Renovation")
          /*await this.homey.notifications.createNotification({
                    excerpt: `**Avfallskalender API** ble oppdatert til **v${apiVersion}**! 🎉\nNytt i denne versjonen:\n${changelog}`
                });*/
        }
      })
      .catch((error) => {
        this.homey.app.dError(JSON.stringify(error, null, 2), "Renovation")
      })
  }

  async ready() {
    this.homey.app.dDebug(`${this.getName()} is ready`, "Renovation")

    const pollInterval = 1 * 60 * 60 * 1000
    const pollIntervalReadable = pollInterval / 1000 / 60 / 60

    this.homey.app.dDebug("Polling interval set to " + pollIntervalReadable + " hour(s)", "Renovation")

    await this.runCalendarUpdate()
    this.homey.setInterval(async () => {
      await this.runCalendarUpdate()
      this.homey.app.dDebug(`Updated calendar for ${this.addressData.fullAddress}`, "Renovation")
    }, pollInterval)
  }

  async runCalendarUpdate() {
    try {
      this.homey.app.dDebug("Starting calendar update", "Renovation")
      const calendar = await this.getCalendar()

      if (!calendar || !calendar.days) {
        this.homey.app.dError("Invalid calendar data received", "Renovation")
        if (this.hasCapability("measure_next_waste_days_left")) {
          await this.setCapabilityValue("measure_next_waste_days_left", 0)
        }
        return
      }

      await this.updateMeasureNextWasteDaysLeft(calendar.days)
      this.homey.app.dDebug("Calendar update completed", "Renovation")
    } catch (error) {
      this.homey.app.dError("An error occurred during calendar update! " + error.message, "Renovation")
      if (this.hasCapability("measure_next_waste_days_left")) {
        await this.setCapabilityValue("measure_next_waste_days_left", 0)
      }
    }
  }

  async settingsUpdateDevice() {
    this.homey.app.dDebug("Updating device settings. Please wait...", "Renovation")
    //Vent 500 ms før vi oppdaterer device
    await new Promise((resolve) => setTimeout(resolve, 500))
    this.homey.app.dDebug("Updated device settings.", "Renovation")

    //Loop gjennom alle checkboxer og legg til i checkboxSettings
    const checkboxKeys = Object.keys(this.settings).filter((key) => key.includes("waste_"))
    checkboxKeys.forEach((key) => {
      this.checkboxSettings[key] = this.settings[key]
    })

    await this.runCalendarUpdate()
    await this.setCronJob()
  }

  async getCalendar(addressData) {
    this.homey.app.dDebug(`Fetching calendar for ${addressData.addressID} from ${addressData.provider}...`, "Renovation")

    let url = `https://pp08kp3lfg.execute-api.eu-north-1.amazonaws.com/v1/waste/calendar/${addressData.provider}/${addressData.addressID}`
    if (addressData.provider == "Min Renovasjon") {
      url += `/${addressData.addressCode}/${addressData.countyId}`
    } else if (addressData.provider == "Oslo kommune") {
      url += `/${addressData.addressCode}`
    } else if (addressData.provider == "IRIS") {
      url += `/:streetCode/:countyId/${addressData.kommune}/${addressData.addressName}`
    }

    let config = {
      method: "get",
      maxBodyLength: Infinity,
      url: url,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Homey.env.API_KEY,
      },
    }

    try {
      const response = await axios(config)
      return response.status == 200 ? response.data : false
    } catch (error) {
      this.homey.app.dError(JSON.stringify(error, null, 2), "Renovation")
      this.homey.app.dError(`An error occured while fetching calendar for ${addressData.addressID} from ${addressData.provider}!`, "Renovation", error)
      return false
    }
  }

  async onAdded() {
    this.homey.app.dDebug(`${this.getName()} has been added`, "Renovation")
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.homey.app.dDebug(`${this.getName()} settings where changed`, "Renovation")
    //Changed keys inneholder alle keys som er endret. Sjekk om noen av de er waste_ og oppdater device. det blir returnert et array med alle keys som er endret.
    const wasteKeys = changedKeys.filter((key) => key.includes("waste_"))
    if (wasteKeys.length > 0) {
      this.homey.app.dDebug("Waste type settings where changed", "Renovation")
      for (const key of wasteKeys) {
        this.settings[key] = newSettings[key]
      }
      await this.settingsUpdateDevice()
    }
    const flowTimeKeys = changedKeys.filter((key) => key.includes("flowTime"))
    if (flowTimeKeys.length > 0) {
      if (newSettings.flowTime.length > 0 && newSettings.flowTime.includes(":")) {
        const timeToTrigger = newSettings.flowTime.split(":")
        const hour = timeToTrigger[0]
        const minute = timeToTrigger[1]
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          this.homey.app.dDebug("Flow time settings where changed", "Renovation")
          this.settings.flowTime = newSettings.flowTime
          await this.settingsUpdateDevice()
        } else {
          this.homey.app.dDebug("Flow time settings where changed, but the time is invalid", "Renovation")
          return this.homey.__("renovation.device.settings.flowTime.invalid")
        }
      } else if (!newSettings.flowTime.includes(":")) {
        const hour = newSettings.flowTime
        if (hour >= 0 && hour <= 23) {
          this.homey.app.dDebug("Flow time settings where changed", "Renovation")
          this.settings.flowTime = newSettings.flowTime + ":00"
          await this.settingsUpdateDevice()
        } else {
          this.homey.app.dDebug("Flow time settings where changed, but the time is invalid", "Renovation")
          return this.homey.__("renovation.device.settings.flowTime.invalid")
        }
      }
    }
  }

  async onRenamed(name) {
    this.homey.app.dDebug(`${this.getName()} has been renamed to ${name}`, "Renovation")
  }

  async onDeleted() {
    // Stopp tidligere intervall om det finnes
    if (this.interval) {
      clearInterval(this.interval)
      this.homey.app.dDebug("Cleared interval", "Renovation")
    } else {
      this.interval = null
    }

    if (this.cronJob) {
      this.cronJob.stop()
      this.homey.app.dDebug("Stopped flow cron job", "Renovation")
    }

    await this.unregisterToken(this.nextWasteTypes)

    this.homey.app.dDebug(`${this.getName()} has been deleted`, "Renovation")
  }

  async unregisterToken(tokenId) {
    if (!tokenId) return
    this.homey.app.dDebug(`Unregistering token ${tokenId.id}`, "Renovation")
    await this.homey.flow.unregisterToken(tokenId)
    this.homey.app.dDebug(`Token ${tokenId.id} has been deleted`, "Renovation")
    return true
  }

  async triggerFlowCard() {
    const triggerCard = this.homey.flow.getDeviceTriggerCard("wastePickupTomorrow")
    const data = await this.runCalendarUpdate()

    if (!data) {
      this.homey.app.dDebug("No waste pickup tomorrow. Not triggering flow card.", "Renovation")
      return
    }

    //Vi henter ut alle avfallstyper som skal hentes i morgen og lager en string av de
    const wasteTypes = data.wasteTypesByDays.wasteTypeString

    //Fjern alt frem til ( og alt etter ).
    const wasteTypesString = wasteTypes.replace(/.*\(/, "").replace(/\).*/, "")

    //Vi henter ut dager igjen for neste avfallshenting
    const wasteDate = data.wasteTypesByDays.days

    //Vi må finne ut hvilken dato det er fra wasteDate
    const today = new Date()
    const day = today.getDate() + wasteDate
    const month = today.getMonth()
    const year = today.getFullYear()
    const nextWasteDate = new Date(year, month, day)

    //Formatere datoen til norsk
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" }
    const wasteDateFormatted = nextWasteDate.toLocaleDateString("nb-NO", options)

    const tokens = {
      wasteType: `${wasteTypesString}avfall`,
      wasteDate: `${wasteDateFormatted}`,
    }

    if (wasteDate == 1) {
      triggerCard
        .trigger(this, tokens)
        .then(() => this.homey.app.dDebug("Triggered flow card", "Renovation"))
        .catch((err) => this.homey.app.dError(JSON.stringify(err, null, 2), "Renovation"))
    } else {
      this.homey.app.dError("No waste pickup tomorrow. Not triggering flow card.", "Renovation")
      return
    }
  }

  async updateMeasureNextWasteDaysLeft(days) {
    try {
      if (!days || !Array.isArray(days) || days.length === 0) {
        this.homey.app.dDebug("No days data available", "Renovation")
        if (this.hasCapability("measure_next_waste_days_left")) {
          await this.setCapabilityValue("measure_next_waste_days_left", 0)
        }
        return
      }

      const today = new Date().setHours(0, 0, 0, 0)
      const nextCollection = days.find((day) => new Date(day.date).setHours(0, 0, 0, 0) >= today)

      if (!nextCollection) {
        this.homey.app.dDebug("No upcoming collection found", "Renovation")
        if (this.hasCapability("measure_next_waste_days_left")) {
          await this.setCapabilityValue("measure_next_waste_days_left", 0)
        }
        return
      }

      const nextDate = new Date(nextCollection.date).setHours(0, 0, 0, 0)
      const diffTime = Math.abs(nextDate - today)
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      if (this.hasCapability("measure_next_waste_days_left")) {
        await this.setCapabilityValue("measure_next_waste_days_left", diffDays)
        if (diffDays === 1) {
          await this.setCapabilityOptions("measure_next_waste_days_left", { units: { no: "dag", en: "day" } })
        } else {
          await this.setCapabilityOptions("measure_next_waste_days_left", { units: { no: "dager", en: "days" } })
        }
      }
    } catch (error) {
      this.homey.app.dError("Error updating waste days: " + error.message, "Renovation")
      if (this.hasCapability("measure_next_waste_days_left")) {
        await this.setCapabilityValue("measure_next_waste_days_left", 0)
      }
    }
  }

  async updateWasteTypes(nextDateByWasteType) {
    // This method is no longer needed as we only use measure_next_waste_days_left
    return
  }

  async setDeviceStore(nextDateByWasteType) {
    if (!nextDateByWasteType) return false
    const wasteTypeShorts = nextDateByWasteType.wasteTypes.map(({ wasteTypeShort }) => this._capitalize(wasteTypeShort))

    if (wasteTypeShorts.length === 1) {
      const [firstShort] = wasteTypeShorts
      const longWasteType = this._capitalize(firstShort.toLowerCase() + "avfall")
      await this.nextWasteTypes.setValue(longWasteType)
    } else if (wasteTypeShorts.length === 2) {
      const [firstShort, secondShort] = wasteTypeShorts
      const longWasteType = this._capitalize(`${firstShort.toLowerCase()} og ${secondShort.toLowerCase()}avfall`)
      await this.nextWasteTypes.setValue(longWasteType)
    } else {
      const [firstShort, ...remainingShorts] = wasteTypeShorts
      const remainingString = remainingShorts.slice(0, -1).join(", ")
      const lastShort = remainingShorts.slice(-1)[0]
      const longWasteType = this._capitalize(`${firstShort.toLowerCase()}, ${remainingString.toLowerCase()} og ${lastShort.toLowerCase()}avfall`)
      await this.nextWasteTypes.setValue(longWasteType)
    }
  }

  async setPickupDatesInStore(nextDateByWasteType) {
    if (!nextDateByWasteType) return false

    let nextWastePickups = []
    // Convert object values to array and iterate
    Object.values(nextDateByWasteType).forEach(({ wasteType, diffDays }) => {
      nextWastePickups.push({
        wasteType,
        diffDays,
      })
    })

    await this.setStoreValue(`nextWastePickups`, nextWastePickups)
    this.homey.app.dDebug(`Updated device store for ${this.addressData.fullAddress}`, "Renovation")
  }

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }
}

module.exports = Renovation
