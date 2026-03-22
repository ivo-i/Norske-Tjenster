(() => {
  const q = document.getElementById('q');
  const statusEl = document.getElementById('status');
  const resultsEl = document.getElementById('results');
  const button = document.getElementById('next');

  const EMIT_TIMEOUT_MS = 90000;
  const BROWSE_SLICE = 70;
  const FILTER_CAP = 120;

  /** @type {{ chainId: string, slug: string, label: string, line: string }[]} */
  let allStores = [];

  /** @type {{ chainId: string, slug: string } | null} */
  let selected = null;

  let filterDebounce = null;

  function emitWithTimeout(event, data) {
    return Promise.race([
      Homey.emit(event, data),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('EMIT_TIMEOUT')), EMIT_TIMEOUT_MS);
      }),
    ]);
  }

  function normalizeForSearch(input) {
    if (input == null || input === '') return '';
    let s = String(input).toLowerCase().trim();
    s = s
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'o')
      .replace(/å/g, 'a')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  function foldHyphens(s) {
    return normalizeForSearch(s).replace(/-/g, '');
  }

  function listErrorMessage(res) {
    if (res && res.reason === 'empty_list') {
      return Homey.__('pair.grocery.errors.empty_store_list');
    }
    return Homey.__('pair.grocery.errors.load_list_failed');
  }

  function extractStoresFromEmitResult(res) {
    if (res && typeof res === 'object' && Array.isArray(res.stores)) {
      const explicitFail = res.ok === false || res.ok === 'false' || res.ok === 0;
      if (!explicitFail && res.stores.length > 0) {
        return { stores: res.stores, meta: res };
      }
      return { stores: null, meta: res };
    }
    return { stores: null, meta: res };
  }

  function filteredList(termFolded) {
    if (!termFolded) {
      return { rows: allStores.slice(0, BROWSE_SLICE), truncated: allStores.length > BROWSE_SLICE };
    }
    const rows = [];
    for (let i = 0; i < allStores.length && rows.length < FILTER_CAP; i += 1) {
      const s = allStores[i];
      const hay = `${foldHyphens(s.line)} ${foldHyphens(s.slug)}`;
      if (hay.indexOf(termFolded) !== -1) {
        rows.push(s);
      }
    }
    return { rows, truncated: false };
  }

  function renderResults() {
    const term = foldHyphens(normalizeForSearch(q.value));
    const { rows, truncated } = filteredList(term);

    resultsEl.innerHTML = '';

    if (allStores.length === 0) {
      statusEl.textContent = '';
      return;
    }

    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'result-row';
      empty.style.cursor = 'default';
      empty.style.color = '#888';
      empty.textContent = Homey.__('pair.grocery.search_no_results');
      resultsEl.appendChild(empty);
      statusEl.textContent = term
        ? ''
        : Homey.__('pair.grocery.browse_more_hint');
      return;
    }

    rows.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'result-row';
      btn.setAttribute('role', 'option');
      btn.dataset.chainId = s.chainId;
      btn.dataset.slug = s.slug;
      btn.textContent = s.line;
      const isSel = selected && selected.chainId === s.chainId && selected.slug === s.slug;
      if (isSel) {
        btn.classList.add('is-selected');
        btn.setAttribute('aria-selected', 'true');
      }
      btn.addEventListener('click', () => {
        selected = { chainId: s.chainId, slug: s.slug };
        button.disabled = false;
        button.removeAttribute('disabled');
        renderResults();
      });
      resultsEl.appendChild(btn);
    });

    if (!term && truncated) {
      statusEl.textContent = Homey.__('pair.grocery.browse_more_hint');
    } else if (term && rows.length >= FILTER_CAP) {
      statusEl.textContent = Homey.__('pair.grocery.refine_search_hint');
    } else {
      statusEl.textContent = '';
    }
  }

  async function loadStores() {
    statusEl.textContent = Homey.__('pair.grocery.loading');
    resultsEl.innerHTML = '';
    button.disabled = true;
    selected = null;
    allStores = [];

    try {
      const res = await emitWithTimeout('get_grocery_stores', null);
      const { stores, meta } = extractStoresFromEmitResult(res);
      if (!stores || stores.length === 0) {
        throw new Error(listErrorMessage(meta));
      }
      allStores = stores;
      q.disabled = false;
      q.removeAttribute('disabled');
      renderResults();
    } catch (err) {
      allStores = [];
      const raw = err && err.message ? String(err.message) : '';
      const useRaw =
        raw.length > 0
        && raw !== 'EMIT_TIMEOUT'
        && !/^error$/i.test(raw);
      statusEl.textContent = useRaw ? raw : Homey.__('pair.grocery.errors.load_list_failed');
      q.disabled = true;
      button.disabled = true;
    }
  }

  q.addEventListener('input', () => {
    if (filterDebounce) clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => {
      renderResults();
    }, 100);
  });

  button.addEventListener('click', async () => {
    if (!selected) {
      Homey.alert(Homey.__('pair.grocery.errors.no_store'), 'error');
      return;
    }
    button.disabled = true;
    try {
      await emitWithTimeout('save_grocery_store', {
        chainId: selected.chainId,
        slug: selected.slug,
      });
      Homey.showView('list_devices');
    } catch (err) {
      Homey.alert(err.message || Homey.__('pair.grocery.errors.no_store'), 'error');
      button.disabled = false;
      button.removeAttribute('disabled');
    }
  });

  function boot() {
    Homey.setTitle(Homey.__('pair.grocery.pair_title'));
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const ref = element.getAttribute('data-i18n');
      element.textContent = Homey.__(ref);
    });
    q.placeholder = Homey.__('pair.grocery.search_placeholder');
    resultsEl.setAttribute('aria-label', Homey.__('pair.grocery.results_aria'));
    q.disabled = true;
    button.disabled = true;
    loadStores();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
