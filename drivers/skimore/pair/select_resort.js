(() => {
  const select = document.getElementById('resort');
  const button = document.getElementById('next');
  const $ = window.jQuery;

  const EMIT_TIMEOUT_MS = 90000;

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

  function norwegianMatcher(params, data) {
    if (!params.term || String(params.term).trim() === '') {
      return data;
    }
    const term = foldHyphens(params.term);
    if (!term) return data;
    const hay = `${foldHyphens(data.text || '')} ${foldHyphens(data.id || '')}`;
    return hay.indexOf(term) !== -1 ? data : null;
  }

  function emitWithTimeout(event, data) {
    return Promise.race([
      Homey.emit(event, data),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('EMIT_TIMEOUT')), EMIT_TIMEOUT_MS);
      }),
    ]);
  }

  function destroySelect2IfAny() {
    if (!$ || !$(select).length) return;
    if ($(select).hasClass('select2-hidden-accessible')) {
      $(select).select2('destroy');
    }
  }

  async function loadResorts() {
    try {
      const resorts = await emitWithTimeout('get_resorts', null);
      if (!Array.isArray(resorts) || resorts.length === 0) {
        throw new Error('EMPTY_RESORT_LIST');
      }

      destroySelect2IfAny();
      select.innerHTML = '';

      const select2Data = resorts.map((r) => ({
        id: r.id,
        text: `${r.name} (${r.id})`,
      }));

      if ($) {
        try {
          $(select).select2({
            data: select2Data,
            placeholder: Homey.__('pair.skimore.search_placeholder'),
            allowClear: false,
            width: '100%',
            matcher: norwegianMatcher,
            language: {
              noResults() {
                return Homey.__('pair.skimore.search_no_results');
              },
            },
          });
          $(select).prop('disabled', false);
        } catch (e2) {
          resorts.forEach((r) => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name;
            select.appendChild(opt);
          });
          select.disabled = false;
        }
      } else {
        resorts.forEach((r) => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = r.name;
          select.appendChild(opt);
        });
        select.disabled = false;
      }
      button.disabled = false;
    } catch (err) {
      destroySelect2IfAny();
      select.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = Homey.__('pair.skimore.errors.load_list_failed');
      select.appendChild(opt);
      select.disabled = false;
      button.disabled = true;
    }
  }

  button.addEventListener('click', async () => {
    const resortId = $ ? ($(select).val() || '') : select.value;
    if (!resortId) {
      Homey.alert(Homey.__('pair.skimore.errors.no_resort'), 'error');
      return;
    }

    try {
      await Homey.emit('save_resort', { resortId });
      Homey.showView('list_devices');
    } catch (err) {
      Homey.alert(err.message || Homey.__('pair.skimore.errors.invalid_resort'), 'error');
    }
  });

  function boot() {
    Homey.setTitle(Homey.__('pair.skimore.title'));
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const ref = element.getAttribute('data-i18n');
      element.textContent = Homey.__(ref);
    });
    select.innerHTML = `<option value="">${Homey.__('pair.skimore.loading')}</option>`;
    select.disabled = true;
    button.disabled = true;
    loadResorts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
