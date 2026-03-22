'use strict';

const { Device } = require('homey');
const grocery = require('../../lib/grocery');
const { computeShopStatus } = require('../../lib/grocery/status');

const MIN_POLL_SEC = 120;
const DEFAULT_POLL_SEC = 600;
const REPAIR_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_STRIKES = 5;

module.exports = class MenyHoursDevice extends Device {

  async _chainId() {
    const fromStore = await this.getStoreValue('groceryChainId');
    if (fromStore && String(fromStore).trim()) {
      return String(fromStore).trim();
    }
    return 'meny';
  }

  async onInit() {
    this._updating = false;
    this._lastOpenState = null;
    this._suppressEdgeTriggers = true;
    this._consecutiveErrors = 0;
    this._repairCooldownUntil = 0;
    this._pollTimer = null;

    this._openedTrigger = this.homey.flow.getDeviceTriggerCard('meny_shop_opened');
    this._closedTrigger = this.homey.flow.getDeviceTriggerCard('meny_shop_closed');

    const sid = await this.getStoreValue('groceryChainId');
    if (!sid) {
      await this.setStoreValue('groceryChainId', 'meny');
      const lab = this.getSetting('grocery_chain_label');
      if (!lab) {
        await this.setSettings({ grocery_chain_label: 'Meny' }).catch(() => {});
      }
    }

    const stagger = Math.floor(Math.random() * 4000);
    this.homey.setTimeout(() => {
      this._applyPollInterval();
      this.update();
    }, stagger);
  }

  _applyPollInterval() {
    if (this._pollTimer) {
      this.homey.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    let sec = Number(this.getSetting('pollInterval'));
    if (!Number.isFinite(sec) || sec < MIN_POLL_SEC) {
      sec = DEFAULT_POLL_SEC;
    }
    this._pollTimer = this.homey.setInterval(() => this.update(), sec * 1000);
  }

  async update() {
    if (this._updating) return;
    this._updating = true;

    const prevOpen = this._lastOpenState;
    const chainId = await this._chainId();
    let chain;
    try {
      chain = grocery.getChain(chainId);
    } catch (e) {
      this.error('Invalid grocery chain id:', chainId, e);
      this._consecutiveErrors += 1;
      if (this._consecutiveErrors >= MAX_STRIKES) {
        await this.setUnavailable(this.homey.__('meny.device.invalid_chain'));
      }
      this._updating = false;
      return;
    }

    try {
      const slug = chain.normalizeSlug(this.getSetting('store_slug'));
      if (!slug) {
        this.error('Grocery: empty store_slug after normalize');
        this._consecutiveErrors += 1;
        if (this._consecutiveErrors >= MAX_STRIKES) {
          await this.setUnavailable(this.homey.__('meny.device.missing_slug'));
        }
        return;
      }
      const numericId = this.getSetting('meny_store_id') || (await this.getStoreValue('menyNumericId')) || '';
      const refTelephone = (await this.getStoreValue('refTelephone')) || '';
      const refPostalCode = (await this.getStoreValue('refPostalCode')) || '';
      const refStoreName =
        this.getSetting('store_display_name')
        || (await this.getStoreValue('refStoreName'))
        || '';

      let page = await grocery.fetchStorePage(chainId, slug);
      let parsed = page.ok && page.html ? chain.parseStoreHtml(page.html) : { jsonLd: null, numericId: null };
      let jsonLd = parsed.jsonLd;

      if (page.ok && page.html && !jsonLd) {
        await new Promise((r) => setTimeout(r, 600));
        page = await grocery.fetchStorePage(chainId, slug);
        parsed = page.ok && page.html ? chain.parseStoreHtml(page.html) : { jsonLd: null, numericId: null };
        jsonLd = parsed.jsonLd;
      }

      const needsRepair = page.status === 404 || (page.ok && Boolean(page.html) && !jsonLd);

      if (needsRepair) {
        if (Date.now() < this._repairCooldownUntil) {
          throw new Error('STORE_REPAIR_COOLDOWN');
        }
        this.log('Grocery: attempting slug repair (404 or missing JSON-LD)', chainId);
        const newSlug = await grocery.resolveSlugByIdentity(
          chainId,
          numericId || null,
          { telephone: refTelephone || null, postalCode: refPostalCode || null },
          slug,
          refStoreName || null,
        );
        this._repairCooldownUntil = Date.now() + REPAIR_COOLDOWN_MS;
        if (newSlug && newSlug !== slug) {
          await this.setSettings({ store_slug: newSlug });
          page = await grocery.fetchStorePage(chainId, newSlug);
          parsed = page.ok && page.html ? chain.parseStoreHtml(page.html) : { jsonLd: null, numericId: null };
          jsonLd = parsed.jsonLd;
        }
        if (!page.ok || page.status === 404 || !jsonLd) {
          throw new Error('STORE_REPAIR_FAILED');
        }
        this._repairCooldownUntil = 0;
      }

      if (!page.ok || !page.html) {
        throw new Error(`HTTP_${page.status}`);
      }

      if (!jsonLd) {
        throw new Error('PARSE_LD');
      }

      const newNumeric = parsed.numericId;
      const name = jsonLd.name || this.getSetting('store_display_name') || slug;
      const addr = jsonLd.address || {};
      const tel = jsonLd.telephone || '';
      const pc = addr.postalCode || '';

      const settingsPatch = {};
      if (newNumeric && String(newNumeric) !== String(this.getSetting('meny_store_id'))) {
        settingsPatch.meny_store_id = String(newNumeric);
      }
      if (name && name !== this.getSetting('store_display_name')) {
        settingsPatch.store_display_name = name;
      }
      if (Object.keys(settingsPatch).length) {
        await this.setSettings(settingsPatch);
      }
      await this.setStoreValue('refTelephone', tel);
      await this.setStoreValue('refPostalCode', pc);
      if (newNumeric) {
        await this.setStoreValue('menyNumericId', String(newNumeric));
      }
      await this.setStoreValue('refStoreName', name);

      const lang = this.homey.i18n.getLanguage() === 'no' ? 'no' : 'en';
      const st = computeShopStatus(jsonLd, lang);

      await this.setCapabilityValue('meny_shop_open', st.open);
      await this.setCapabilityValue('meny_shop_status', st.statusText);
      await this.setCapabilityValue('meny_shop_next_event', st.nextEventText);

      await this.setAvailable();
      this._consecutiveErrors = 0;

      if (this._suppressEdgeTriggers) {
        this._lastOpenState = st.open;
        this._suppressEdgeTriggers = false;
      } else if (prevOpen !== null && prevOpen !== st.open) {
        if (st.open) {
          await this._openedTrigger.trigger(this, {
            store_name: name,
            detail: st.nextEventText,
          }, {}).catch((err) => this.error('meny_shop_opened trigger:', err));
        } else {
          await this._closedTrigger.trigger(this, {
            store_name: name,
            detail: st.nextEventText,
          }, {}).catch((err) => this.error('meny_shop_closed trigger:', err));
        }
        this._lastOpenState = st.open;
      } else {
        this._lastOpenState = st.open;
      }
    } catch (e) {
      this.error('Grocery update failed:', e);
      this._consecutiveErrors += 1;
      if (this._consecutiveErrors >= MAX_STRIKES) {
        await this.setUnavailable(this.homey.__('meny.device.unavailable'));
      }
    } finally {
      this._updating = false;
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('pollInterval')) {
      this._applyPollInterval();
    }

    if (changedKeys.includes('store_slug')) {
      const chainId = await this._chainId();
      let chain;
      try {
        chain = grocery.getChain(chainId);
      } catch (e) {
        return this.homey.__('meny.device.invalid_chain');
      }
      const normalized = chain.normalizeSlug(newSettings.store_slug);
      if (!normalized) {
        await this.setSettings({ store_slug: oldSettings.store_slug });
        return this.homey.__('meny.settings.invalid_slug');
      }
      try {
        const loaded = await grocery.loadStoreBySlug(chainId, normalized);
        await this.setSettings({
          store_slug: loaded.slug,
          meny_store_id: String(loaded.numericId || ''),
          store_display_name: loaded.name,
        });
        await this.setStoreValue('refTelephone', loaded.telephone || '');
        await this.setStoreValue('refPostalCode', loaded.postalCode || '');
        await this.setStoreValue('menyNumericId', String(loaded.numericId || ''));
        await this.setStoreValue('refStoreName', loaded.name);
        this._suppressEdgeTriggers = true;
        this._lastOpenState = null;
        this._consecutiveErrors = 0;
        await this.setAvailable();
        await this.update();
      } catch (e) {
        await this.setSettings({ store_slug: oldSettings.store_slug });
        return this.homey.__('meny.settings.invalid_slug');
      }
    }
    return undefined;
  }

  async onDeleted() {
    if (this._pollTimer) {
      this.homey.clearInterval(this._pollTimer);
    }
  }

};
