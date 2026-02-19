(() => {
  const select = document.getElementById('resort');
  const button = document.getElementById('next');

  async function loadResorts() {
    try {
      const resorts = await Homey.emit('get_resorts', null);
      select.innerHTML = '';
      resorts.forEach((resort) => {
        const opt = document.createElement('option');
        opt.value = resort.id;
        opt.textContent = resort.name;
        select.appendChild(opt);
      });
      select.disabled = false;
      button.disabled = false;
    } catch (err) {
      select.innerHTML = '<option value="">Failed to load resorts</option>';
    }
  }

  button.addEventListener('click', async () => {
    const resortId = select.value;
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

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-i18n]').forEach(function (element) {
      const ref = element.getAttribute('data-i18n');
      element.textContent = Homey.__(ref);
    });
    loadResorts();
  });
})();
