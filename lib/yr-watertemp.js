'use strict';

const axios = require('axios');
const { MET_USER_AGENT } = require('./util');

const YR_BASE = 'https://www.yr.no/api/v0';
const DEFAULT_HEADERS = {
  'User-Agent': MET_USER_AGENT,
  Accept: 'application/json',
};

const SCHEMA_VERSION = 2;

/**
 * @param {object} spot - Raw yr.no region watertemperature entry
 * @param {string} regionId
 * @returns {object|null}
 */
function normalizeRegionSpot(spot, regionId) {
  const location = spot?.location;
  if (!location?.id || !location?.name) {
    return null;
  }

  return {
    locationId: String(location.id),
    name: location.name,
    temperature: spot.temperature ?? null,
    time: spot.time ?? null,
    position: location.position ?? null,
    regionId: String(regionId),
    regionName: location.region?.name ?? '',
    municipalityName: location.subregion?.name ?? '',
    sourceDisplayName: 'yr.no',
  };
}

/**
 * @param {object} data - Payload from pairing UI
 * @returns {object|null}
 */
function normalizePairingPayload(data) {
  if (!data?.id || !data?.name || !data?.position) {
    return null;
  }

  return {
    locationId: String(data.id),
    name: data.name,
    temperature: data.temperature ?? null,
    time: data.time ?? null,
    position: data.position,
    regionId: data.regionId ? String(data.regionId) : '',
    regionName: data.county ?? '',
    municipalityName: data.municipality ?? '',
    sourceDisplayName: data.sourceDisplayName || 'yr.no',
  };
}

/**
 * @param {object|null} reading
 * @returns {{ temperature: number|null, time: string|null }|null}
 */
function normalizeLocationReading(reading) {
  if (!reading) {
    return null;
  }

  return {
    temperature: reading.temperature ?? null,
    time: reading.time ?? null,
  };
}

async function fetchRegions() {
  const response = await axios.get(`${YR_BASE}/regions/NO`, { headers: DEFAULT_HEADERS });
  return Array.isArray(response.data?.regions) ? response.data.regions : [];
}

async function fetchRegionSpots(regionId) {
  const response = await axios.get(
    `${YR_BASE}/regions/${regionId}/watertemperatures?language=nb`,
    { headers: DEFAULT_HEADERS },
  );
  const items = Array.isArray(response.data) ? response.data : [];

  return items
    .map((spot) => normalizeRegionSpot(spot, regionId))
    .filter(Boolean);
}

async function fetchLocationReading(locationId) {
  const response = await axios.get(
    `${YR_BASE}/locations/${locationId}/watertemperatures?language=nb`,
    { headers: DEFAULT_HEADERS },
  );
  const items = Array.isArray(response.data) ? response.data : [];
  return normalizeLocationReading(items[0]);
}

/**
 * Resolve legacy numeric spot IDs to yr.no location IDs.
 * @param {string|number} spotId
 * @param {string} regionId
 * @returns {Promise<string|null>}
 */
async function resolveLegacyLocationId(spotId, regionId) {
  if (!spotId || !regionId) {
    return null;
  }

  const response = await axios.get(
    `${YR_BASE}/regions/${regionId}/watertemperatures?language=nb`,
    { headers: DEFAULT_HEADERS },
  );
  const items = Array.isArray(response.data) ? response.data : [];
  const match = items.find((spot) => spot.id === parseInt(spotId, 10));
  return match?.location?.id ? String(match.location.id) : null;
}

/**
 * @param {object} settings - Device settings
 * @returns {Promise<string|null>}
 */
async function resolveLocationIdFromSettings(settings) {
  const candidates = [
    settings?.locationId,
    settings?.spotId,
    settings?.bathingspot,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate);
    if (value.includes('-')) {
      return value;
    }
  }

  const legacyId = candidates[0];
  if (legacyId && settings?.regionId) {
    return resolveLegacyLocationId(legacyId, settings.regionId);
  }

  return null;
}

module.exports = {
  SCHEMA_VERSION,
  fetchRegions,
  fetchRegionSpots,
  fetchLocationReading,
  resolveLegacyLocationId,
  resolveLocationIdFromSettings,
  normalizeRegionSpot,
  normalizePairingPayload,
  normalizeLocationReading,
};
