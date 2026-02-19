'use strict';

const HIMAdapter = require('./him');

module.exports = class UtsiraAdapter extends HIMAdapter {
  static MUNICIPALITIES = new Set([
    '1151' // Utsira
  ]);

  async _getAllMunicipalities() {
    return UtsiraAdapter.MUNICIPALITIES;
  }

  getName() {
    return 'Utsira Kommune via HIM';
  }

  async fetchAddressUUID(addressData) {
    // Utsira uses a fixed UUID for the whole municipality
    return '9fb94a24-dccd-4c4a-adb8-a6a10e816091';
  }

  async coversMunicipality(municipalityCode) {
    return UtsiraAdapter.MUNICIPALITIES.has(String(municipalityCode));
  }
}
