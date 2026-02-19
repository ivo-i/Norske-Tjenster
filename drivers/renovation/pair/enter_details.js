// Debounced fetch of address suggestions from Geonorge on input.
(() => {
  const input = document.getElementById('address');
  const list = document.getElementById('address-list');
  const button = document.getElementById('next');
  // Hidden fields to extract from selected address
  const adressenavn = document.getElementById('adressenavn');
  const nummer = document.getElementById('nummer');
  const bokstav = document.getElementById('bokstav');
  const adressekode = document.getElementById('adressekode');
  const kommunenavn = document.getElementById('kommunenavn');
  const kommunenummer = document.getElementById('kommunenummer');

  let timer = null;
  const delay = 300;

  function clearOptions() {
    list.innerHTML = '';
  }

  async function fetchSuggestions(query) {
    if (!query) {
      clearOptions();
      return;
    }
    const url = `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url);
      clearOptions();
      if (!res.ok) {
        return;
      }
      const json = await res.json();
      const addresses = json.adresser;
      addresses.forEach((addr) => {
        if (addr && addr.adressetekst) {
          const opt = document.createElement('option');
          // display value shown to the user
          opt.value = `${addr.adressetekst}, ${addr.kommunenavn}`;
          // hidden data attributes for later extraction
          if (addr.adressenavn) opt.setAttribute('data-adressenavn', addr.adressenavn);
          if (addr.nummer !== undefined) opt.setAttribute('data-nummer', String(addr.nummer));
          if (addr.bokstav) opt.setAttribute('data-bokstav', addr.bokstav);
          if (addr.adressekode) opt.setAttribute('data-adressekode', addr.adressekode);
          if (addr.kommunenavn) opt.setAttribute('data-kommunenavn', addr.kommunenavn);
          if (addr.kommunenummer !== undefined) opt.setAttribute('data-kommunenummer', String(addr.kommunenummer));
          list.appendChild(opt);
        }
      });
    } catch (err) {
      console.error('Address lookup failed', err);
      clearOptions();
    }
  }

  function populateHiddenFromValue(val) {
    if (!val) return false;
    const opts = Array.from(list.querySelectorAll('option'));
    const matched = opts.find(o => o.value === val);
    if (!matched) return false;

    adressenavn.value = matched.getAttribute('data-adressenavn') || '';
    nummer.value = matched.getAttribute('data-nummer') || '';
    bokstav.value = matched.getAttribute('data-bokstav') || '';
    adressekode.value = matched.getAttribute('data-adressekode') || '';
    kommunenavn.value = matched.getAttribute('data-kommunenavn') || '';
    kommunenummer.value = matched.getAttribute('data-kommunenummer') || '';
    return true;
  }

  function clearHiddenFields() {
    adressenavn.value = '';
    nummer.value = '';
    bokstav.value = '';
    adressekode.value = '';
    kommunenavn.value = '';
    kommunenummer.value = '';
  }

  input.addEventListener('input', () => {
    // Debounce to avoid excessive requests; read value after key event settles
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const q = input.value && input.value.trim();
      // If the current value exactly matches an option, populate hidden fields immediately
      if (!populateHiddenFromValue(q)) {
        // Clear any previously populated hidden fields when there's no exact match
        clearHiddenFields();
        fetchSuggestions(q);
      }
    }, delay);
  });

  // When the user selects an option from the datalist, populate the hidden fields
  input.addEventListener('change', () => {
    if (!populateHiddenFromValue(input.value)) {
      clearHiddenFields();
    }
  });

  button.addEventListener('click', async () => {
    if (!kommunenummer.value) {
      Homey.alert(Homey.__('pair.errors.address_required'), 'error');
      return;
    }

    await Homey.emit('save_details', {
      adressenavn: adressenavn.value,
      nummer: nummer.value,
      bokstav: bokstav.value,
      adressekode: adressekode.value,
      kommunenavn: kommunenavn.value,
      kommunenummer: kommunenummer.value
    });
    Homey.showView('list_devices');
  });

  document.addEventListener('DOMContentLoaded', () => {
    // Set title to localized string
    document.title = Homey.__('pair.title');
    // Localize all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(function(element) {
      const ref = element.getAttribute('data-i18n');
      element.textContent = Homey.__(ref);
    });
  });
})();
