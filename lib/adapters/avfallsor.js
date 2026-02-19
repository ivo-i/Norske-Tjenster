'use strict';

const BaseAdapter = require('./baseadapter');
const cheerio = require('cheerio');

module.exports = class AvfallSorAdapter extends BaseAdapter {
  static MUNICIPALITIES = new Set([
    '4204', // Kristiansand
    '4223' // Vennesla
  ]);

  async _getAllMunicipalities() {
    return AvfallSorAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Avfall Sør';
  }

  async coversMunicipality(municipalityCode) {
    return AvfallSorAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    const response = await fetch(`https://avfallsor.no/wp-json/addresses/v1/address?lookup_term=${encodeURIComponent(addrString)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    // Empty response is an array, non-empty an object. Normalize to array for easier processing.
    const respArray = Array.isArray(respJson) ? respJson : Object.values(respJson);
    if (respArray.length === 0) {
      return null;
    }
    const match = respArray.find(entry =>
      entry.value.toUpperCase() == addrString.toUpperCase() &&
      entry.label.split(', ').pop().toUpperCase() == `${addressData.kommunenavn}`);
    return match?.href.split('/').pop();
  }

  parseDate(dateStr) {
    // Example format:
    // "Tirsdag 16. september"
    const months = ["januar", "februar", "mars", "april", "mai", "juni",
      "juli", "august", "september", "oktober", "november", "desember"];
    const dateStrArr = dateStr.split(" ");
    const monthStr = dateStrArr.pop();
    const day = parseInt(dateStrArr.pop());
    const month = months.indexOf(monthStr);
    const today = new Date();
    const year = today.getMonth() > month ? today.getFullYear() + 1 : today.getFullYear();
    return new Date(year, month, day);
  }

  async fetchFractionDates(addressData, addressUUID) {
    const fractionMap = {
      "glass": ["1322"],
      "food": ["1111"],
      "paper": ["2499"],
      "plastic": ["2499"],
      "general": ["9011"],
    };

    const pickups = this.createFractions();
    const response = await fetch(`https://avfallsor.no/henting-av-avfall/finn-hentedag/${addressUUID}/`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    $(".pickup-days-large .wp-block-site-pickup-calendar__date").each((i, el) => {
      const dateText = $(el).text().trim();
      const date = this.parseDate(dateText);
      // div-element with pickups for this date immediately follows
      const pickupsDiv = $(el).next("div");

      pickupsDiv.find(".info-boxes-box").each((j, box) => {
        const classes = $(box).attr("class").split(/\s+/);
        const fractionClass = classes.find(c => c.startsWith("info-boxes-box--"));
        const fraction = fractionClass.replace("info-boxes-box--", "");
        for (const ourFrac of Object.keys(fractionMap)) {
          if (fractionMap[ourFrac].includes(fraction)) {
            if (!pickups[ourFrac] || date < pickups[ourFrac]) {
              pickups[ourFrac] = date;
            }
          }
        }
      });
    });
    return pickups;
  }
}
