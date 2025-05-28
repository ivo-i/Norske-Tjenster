"use strict"

const { Driver } = require("homey")
const Homey = require("homey")
const axios = require("axios")
const qs = require("qs")

class Renovation extends Driver {
  async onInit() {
    this.homey.app.dDebug("Renovation v2 has been initialized", "Renovation")
  }

  async onPair(session) {
    this.addressData = {
      streetName: "",
      houseNumber: "",
      postCode: "",
      countyId: "",
      addressCode: "",
      provider: "",
      addressID: "",
    }
    // Show a specific view by ID
    await session.showView("start")

    session.setHandler("settingsChanged", async (data) => {
      return await this.onSettingsChanged(data)
    })

    session.setHandler("checkAddress", async (data) => {
      //this.homey.app.dDebug(data);
      return await this.getApiResult(data)
    })

    session.setHandler("getCalendar", async (data) => {
      //this.homey.app.dDebug(data);
      return await this.getCalendar(data)
    })

    session.setHandler("getSettings", async () => {
      //this.homey.app.dDebug("getSettings: ");
      ///this.homey.app.dDebug(this.addressData);
      return this.addressData
    })

    session.setHandler("getProviders", async () => {
      return await this.getProviders()
    })

    session.setHandler("list_devices", async () => {
      return await this.onPairListDevices(session)
    })

    session.setHandler("useHomeyLocation", async () => {
      return await this.useHomeyLocation()
    })
  }

  async useHomeyLocation() {
    let addressData = {
      accuracy: this.homey.geolocation.getAccuracy(),
      latitude: this.homey.geolocation.getLatitude(),
      longitude: this.homey.geolocation.getLongitude(),
    }
    return addressData
  }

  async onSettingsChanged(data) {
    //this.homey.app.dDebug(data);
    this.addressData = data
    return this.addressData
  }

  async getProviders() {
    let providers = []
    await axios
      .get("https://pp08kp3lfg.execute-api.eu-north-1.amazonaws.com/v1/waste/providers", {
        headers: {
          "x-api-key": Homey.env.API_KEY,
        },
      })
      .then(function (response) {
        //this.homey.app.dDebug(response.data)
        //this.homey.app.dDebug(response.status)
        if (response.status == 200) {
          let providerData = response.data
          for (let i = 0; i < providerData.length; i++) {
            let provider = {
              provider: providerData[i].name,
            }
            providers.push(provider)
          }
        }
      })
      .catch(function (error) {
        this.homey.app.dError(JSON.stringify(error.response.data, null, 2), "Renovation")
      })
    return providers
  }

  async getApiResult(data) {
    data = qs.stringify({
      streetName: data.streetName,
      houseNumber: data.houseNumber,
      postCode: data.postCode,
      providerName: data.providerName,
    })

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://pp08kp3lfg.execute-api.eu-north-1.amazonaws.com/v1/waste/address",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-api-key": Homey.env.API_KEY,
      },
      data: data,
    }

    try {
      const response = await axios(config)
      //this.homey.app.dDebug(response.data);
      //this.homey.app.dDebug(response.status);
      if (response.status == 200) {
        let addressData = {
          provider: "",
          addressID: "",
          countyId: "",
          addressCode: "",
          kommune: "",
          addressName: "",
        }

        //addressData.streetName = response.data.adressenavn;
        //addressData.houseNumber = response.data.nummer;
        //addressData.postCode = response.data.postnummer;
        addressData.countyId = response.data.countyId
        addressData.addressCode = response.data.streetCode
        addressData.provider = response.data.provider
        addressData.addressID = response.data.addressID
        addressData.kommune = response.data.kommune
        addressData.addressName = `${response.data.street} ${response.data.houseNumber}`

        this.addressData.countyId = response.data.countyId
        this.addressData.addressCode = response.data.streetCode
        this.addressData.provider = response.data.provider
        this.addressData.addressID = response.data.addressID
        this.addressData.kommune = response.data.kommune
        this.addressData.addressName = `${response.data.street} ${response.data.houseNumber}`

        //return { streetName: this.addressData.streetName, houseNumber: this.addressData.houseNumber, postCode: this.addressData.postCode, countyId: this.addressData.countyId, addressCode: this.addressData.addressCode, provider: this.addressData.provider, addressID: this.addressData.addressID };
        return addressData
      } else {
        return false
      }
    } catch (error) {
      this.homey.app.dError(JSON.stringify(error.response.data, null, 2), "Renovation")
      return false
    }
  }

  async getCalendar(data) {
    let config = {
      method: "get",
      maxBodyLength: Infinity,
      url: "https://api.avfallskalender.no/v1/calendar/" + data.provider + "/" + data.addressID,
      headers: {
        "x-api-key": Homey.env.API_KEY,
      },
    }

    if (data.provider == "Min Renovasjon") {
      config.url = "https://api.avfallskalender.no/v1/calendar/" + data.provider + "/" + data.addressID + "/" + data.addressCode + "/" + data.countyId
    } else if (data.provider == "IRIS") {
      config.url = "https://api.avfallskalender.no/v1/calendar/" + data.provider + "/" + data.addressID + "/:streetCode/:countyID/" + data.kommune + "/" + data.addressName
    }

    try {
      const response = await axios(config)
      this.homey.app.dDebug(response.data)
      this.homey.app.dDebug(response.status)
      if (response.status == 200) {
        return response.data
      } else {
        return false
      }
    } catch (error) {
      this.homey.app.dError(JSON.stringify(error.response.data, null, 2), "Renovation")
      return false
    }
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    let devices = []

    let deviceName = `Renovasjon ${this.addressData["streetName"]} ${this.addressData["houseNumber"]}`
    let deviceId = this.addressData["streetName"] + this.addressData["houseNumber"] + "-v2"

    let settings = {}

    if (this.addressData["provider"] == "Min Renovasjon") {
      settings = {
        address: `${this.addressData["streetName"]} ${this.addressData["houseNumber"]}`,
        provider: `${this.addressData["provider"]}`,
        addressID: `${this.addressData["addressID"]}`,
        addressCode: `${this.addressData["addressCode"]}`,
        countyId: `${this.addressData["countyId"]}`,
      }
    } else if (this.addressData["provider"] == "IRIS") {
      settings = {
        address: `${this.addressData["streetName"]} ${this.addressData["houseNumber"]}`,
        provider: `${this.addressData["provider"]}`,
        addressID: `${this.addressData["addressID"]}`,
        countyId: `${this.addressData["kommune"]}`,
      }
    } else {
      settings = {
        address: `${this.addressData["streetName"]} ${this.addressData["houseNumber"]}`,
        provider: `${this.addressData["provider"]}`,
        addressID: `${this.addressData["addressID"]}`,
      }
    }

    let device = {
      name: deviceName,
      data: {
        id: deviceId,
      },
      settings: settings,
    }

    devices.push(device)
    this.homey.app.dDebug("Renovation v2 device added", "Renovation", device)
    this.onSettingsChanged(settings)
    return devices
  }
}

module.exports = Renovation
