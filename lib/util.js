const path = require('path');
const axios = require('axios');
const { getDistance } = require('geolib');

let _appVersion = 'unknown';
try {
  const appJson = require(path.join(__dirname, '..', 'app.json'));
  if (appJson && appJson.version) {
    _appVersion = String(appJson.version);
  }
} catch {
  /* keep fallback */
}

/** User-Agent for api.met.no / frost.met.no (ToS: identify app + contact). */
const MET_USER_AGENT = `Homey-NorskeTjenester/${_appVersion} +https://github.com/Coderaxx/NorwegianServicesPublic`;

function convertUALFToJSON(ualfCoordinates) {
    return ualfCoordinates.trim().split('\n').map(ualfLinje => {
        const elements = ualfLinje.trim().split(' ');
        return {
            version: parseInt(elements[0], 10),
            timestamp: new Date(`${elements[1]}-${elements[2]}-${elements[3]}T${elements[4]}:${elements[5]}:${elements[6]}`),
            latitude: parseFloat(elements[8]),
            longitude: parseFloat(elements[9]),
            peakCurrent: parseInt(elements[10], 10),
            multiplicity: parseInt(elements[11], 10),
            numberOfSensors: parseInt(elements[12], 10),
            degreesOfFreedom: parseInt(elements[13], 10),
            ellipseAngle: parseFloat(elements[14]),
            semiMajorAxis: parseFloat(elements[15]),
            semiMinorAxis: parseFloat(elements[16]),
            chiSquareValue: parseFloat(elements[17]),
            riseTime: parseFloat(elements[18]),
            peakToZeroTime: parseFloat(elements[19]),
            maxRateOfRise: parseFloat(elements[20]),
            cloudIndicator: parseInt(elements[21], 10),
            angleIndicator: parseInt(elements[22], 10),
            signalIndicator: parseInt(elements[23], 10),
            timingIndicator: parseInt(elements[24], 10),
        };
    });
}

async function reverseGeocode(lat, lon) {
    if (this.previousLat && this.previousLon &&
        getDistance({ latitude: lat, longitude: lon }, { latitude: this.previousLat, longitude: this.previousLon }) <= this.threshold) {

        return this.previousAddress;
    }

    const url = `https://nominatim.openstreetmap.org/reverse.php?lat=${lat}&lon=${lon}&zoom=18&format=jsonv2`;
    const response = await axios.get(url);
    if (response.data && response.data.address) {
        const address = {
            road: response.data.address.road || null,
            house_number: response.data.address.house_number || null,
            postcode: response.data.address.postcode || null,
            city: response.data.address.suburb || null,
            city_district: response.data.address.city_district || null,
            county: response.data.address.county || null,
            country: response.data.address.country || null,
        }

        this.previousLat = lat;
        this.previousLon = lon;
        this.previousAddress = address;

        return address.city || address.city_district || address.county || address.country || null;
    }
    return null;
}

async function riskOfLightning(myCoords, dangerRadius = 10) {
    try {
        const response = await axios.get('https://frost.met.no/lightning/v0.ualf?referencetime=latest&maxage=PT5M', {
            headers: {
                'Authorization': 'Basic YTNjNzYyOWQtZWY3Yi00MTk2LTgzZTYtODc4ZmJhNTY2NmY2Og==',
                'User-Agent': MET_USER_AGENT,
            },
        });
        const lynData = convertUALFToJSON(response.data);
        let fareForLyn = false;

        let lightningData = [];
        lynData.forEach(async lyn => {
            const avstand = getDistance(
                { latitude: lyn.latitude, longitude: lyn.longitude },
                myCoords
            );

            if (avstand / 1000 <= dangerRadius) {
                lyn.city = await reverseGeocode(lyn.latitude, lyn.longitude);
                lyn.distance = avstand;
                fareForLyn = true;
                lightningData.push(lyn);
            }
        });

        if (!fareForLyn) {
            return { riskOfLightning: false, message: 'Ingen fare for lyn.' };
        }

        return { riskOfLightning: true, message: 'Fare for lyn.', data: lightningData };
    } catch (error) {
        return { riskOfLightning: false, message: 'Det oppstod en feil.', error };
    }
}

module.exports = {
    getDistance,
    reverseGeocode,
    riskOfLightning,
    MET_USER_AGENT,
};