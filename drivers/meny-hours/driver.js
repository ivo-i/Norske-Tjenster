'use strict';

const Homey = require('homey');
const { v4: uuidv4 } = require('uuid');
const grocery = require('../../lib/grocery');

module.exports = class MenyHoursDriver extends Homey.Driver {

  async onInit() {
    this.log('MenyHoursDriver initialized');
  }

  async onPair(session) {
    session.setHandler('get_grocery_stores', async () => {
      const lang = this.homey.i18n.getLanguage() === 'no' ? 'no' : 'en';
      try {
        const list = await grocery.fetchMergedStoreEntriesForPairing(lang);
        if (!Array.isArray(list) || list.length === 0) {
          return { ok: false, reason: 'empty_list' };
        }
        return { ok: true, stores: list };
      } catch (err) {
        this.error('get_grocery_stores failed:', err);
        return { ok: false, reason: 'fetch_error' };
      }
    });

    session.setHandler('save_grocery_store', async (data) => {
      const slug = data && data.slug;
      const chainId = data && data.chainId;
      if (!slug || !chainId) {
        throw new Error(this.homey.__('pair.grocery.errors.no_store'));
      }
      try {
        grocery.getChain(chainId);
      } catch {
        throw new Error(this.homey.__('pair.grocery.errors.unknown_chain'));
      }
      session.groceryChainId = chainId;
      session.grocerySlug = slug;
      return true;
    });

    session.setHandler('list_devices', async () => {
      const chainId = session.groceryChainId;
      if (!chainId) {
        throw new Error(this.homey.__('pair.grocery.errors.no_store'));
      }
      if (!session.grocerySlug) {
        throw new Error(this.homey.__('pair.grocery.errors.no_store'));
      }
      try {
        grocery.getChain(chainId);
      } catch {
        throw new Error(this.homey.__('pair.grocery.errors.unknown_chain'));
      }
      let loaded;
      try {
        loaded = await grocery.loadStoreBySlug(chainId, session.grocerySlug);
      } catch (err) {
        this.error('Grocery pair fetch failed:', err);
        throw new Error(this.homey.__('pair.grocery.errors.fetch_failed'));
      }
      const id = uuidv4();
      const numeric = loaded.numericId ? String(loaded.numericId) : '';
      const lang = this.homey.i18n.getLanguage() === 'no' ? 'no' : 'en';
      const chain = grocery.getChain(chainId);
      const chainLabel = lang === 'no' ? chain.labelNo : chain.labelEn;
      return [
        {
          name: `${chainLabel} ${loaded.name}`,
          data: { id },
          settings: {
            grocery_chain_label: chainLabel,
            store_slug: loaded.slug,
            meny_store_id: numeric,
            store_display_name: loaded.name,
            pollInterval: 600,
          },
          store: {
            groceryChainId: chainId,
            refTelephone: loaded.telephone || '',
            refPostalCode: loaded.postalCode || '',
            menyNumericId: numeric,
            refStoreName: loaded.name,
          },
        },
      ];
    });
  }

};
