'use strict';

const BaseAdapter = require('./baseadapter');

module.exports = class NGIRAdapter extends BaseAdapter {
  static MUNICIPALITIES = new Set([
    '4631', // Alver
    '4632', // Austrheim
    '4633', // Fedje
    '4635', // Gulen
    '4634', // Masfjorden
    '4629', // Modalen
    '4636' // Solund
  ]);

  async _getAllMunicipalities() {
    return NGIRAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Renovasjon i Nordhordland, Gulen og Solund (NGIR)';
  }

  async coversMunicipality(municipalityCode) {
    return NGIRAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }

  async fetchAddressUUID(addressData) {
    let addrString = addressData.adressenavn;
    if (addressData.nummer !== '') {
      addrString += ` ${addressData.nummer}`;
    }
    if (addressData.bokstav) {
      addrString += ` ${addressData.bokstav}`;
    }
    const searchPayload = {
      request: {
        q: addrString,
        layers: "AdaptiveAddresses",
        start: 0,
        limit: 1
      }
    };
    const response = await fetch('https://www.ngirkart.no/WebServices/search/SearchProxy.asmx/Search', {
      "body": JSON.stringify(searchPayload),
      "headers": {
        "Content-Type": "application/json"
      },
      "method": "POST"
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    if (respJson.d.records.length === 0) {
      return null;
    }
    const match = respJson.d.records.find(entry =>
      entry.title.toUpperCase() == addrString.toUpperCase()
    );
    if (!match) {
      return null;
    }
    const [lon, lat] = match.geom
      .replace("POINT (", "")
      .replace(")", "")
      .split(" ")
      .map(Number);
    const [x, y] = this.lonLatToWebMercator(lon, lat);
    return `SRID=3857;POINT(${x} ${y})`;
  }

  lonLatToWebMercator(lon, lat) {
    const maxWebMercator = 20037508.34;
    const x = (lon * maxWebMercator) / 180;
    let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
    y = (y * maxWebMercator) / 180;
    return [x, y];
  }

  createRequestBodyStr(addressUUID) {
    return JSON.stringify({
      request: {
        theme_uuid: "b40744b8-2d70-441e-89c0-0414b4911df6",
        filter: {
          filterColumns: [
            {
              name: "geom",
              comparisonOperator: "ST_INTERSECTS",
              netType: "geometry",
              logicalOperator: "AND",
              value: addressUUID
            }
          ]
        },
        columns: [
          "fraksjon_dynamisk",
          "fraksjon_dynamisk_neste",
          "hentedag",
          "hentedag_nesteveke",
          "aktuelluke",
          "nesteuke"
        ],
        srid: "3857",
        start: 0,
        limit: 100
      }
    });
  }

  dayStrToIsoNum(dayStr) {
    const days = {
      "Mandag": 0,
      "Tirsdag": 1,
      "Onsdag": 2,
      "Torsdag": 3,
      "Fredag": 4,
      "Lørdag": 5,
      "Søndag": 6
    };
    return days[dayStr] || null;
  }

  // Slighty strange. This API is a bit awkward, and we need to make some assumptions.
  // If the date of the pickup this week has passed, we assume the next pickup is in two weeks.
  getDateOfThisWeek(isoWeekDay) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay(); // 0 (Sun) to 6 (Sat)
    const isoDay = (day + 6) % 7; // Convert to ISO (Mon=0, Sun=6)
    const result = new Date(today);
    result.setDate(today.getDate() + (isoWeekDay - isoDay));
    if (result < today) {
      result.setDate(result.getDate() + 14); // Add two weeks
    }
    return result;
  }

  getDateOfNextWeek(isoWeekDay) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay(); // 0 (Sun) to 6 (Sat)
    const isoDay = (day + 6) % 7; // Convert to ISO (Mon=0, Sun=6)
    const result = new Date(today);
    result.setDate(today.getDate() + (isoWeekDay - isoDay) + 7); // Next week
    return result;
  }

  async fetchFractionDates(addressData, addressUUID) {
    const fractionMap = {
      "general": ["Restavfall og bioavfall"],
      "paper": ["Papir, papp, plast og bioavfall"],
      "food": ["Papir, papp, plast og bioavfall", "Restavfall og bioavfall"],
      "plastic": ["Papir, papp, plast og bioavfall"],
    };

    const response = await fetch('https://www.ngirkart.no/WebServices/client/DataView.asmx/ReadAny', {
      "body": this.createRequestBodyStr(addressUUID),
      "headers": {
        "Content-Type": "application/json"
      },
      "method": "POST"
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const respJson = await response.json();
    const pickups = this.createFractions();
    if (respJson.d.records.length === 0) {
      return pickups;
    }
    // Seems like there is only one record per address
    const record = respJson.d.records[0];
    const isoWeekDayThisWeek = this.dayStrToIsoNum(record.hentedag);
    const isoWeekDayNextWeek = this.dayStrToIsoNum(record.hentedag_nesteveke);
    const dateOfThisWeek = this.getDateOfThisWeek(isoWeekDayThisWeek);
    const dateOfNextWeek = this.getDateOfNextWeek(isoWeekDayNextWeek);
    for (const [ourFrac, apiFracs] of Object.entries(fractionMap)) {
      if (apiFracs.includes(record.fraksjon_dynamisk)) {
        if (!pickups[ourFrac] || dateOfThisWeek < pickups[ourFrac]) {
          pickups[ourFrac] = dateOfThisWeek;
        }
      }
      if (apiFracs.includes(record.fraksjon_dynamisk_neste)) {
        if (!pickups[ourFrac] || dateOfNextWeek < pickups[ourFrac]) {
          pickups[ourFrac] = dateOfNextWeek;
        }
      }
    }
    return pickups;
  }
}
