'use strict';
(() => {
  const catalogues = {
    wedding: {
      events: ['Engagement', 'Groom haldi', 'Bride haldi', 'Groom rituals', 'Bride rituals', 'Sangeet', 'Wedding', 'Reception', 'Pre-wedding shoot', 'Custom celebration'],
      crew: [
        ['traditional-photo', 'Traditional photographer / day'],
        ['traditional-video', 'Traditional videographer / day'],
        ['candid-photo', 'Candid photographer / day'],
        ['cinematographer', 'Cinematographer / day'],
        ['drone', 'Drone unit / day'],
        ['led-wall', 'LED wall / day'],
        ['live-stream', 'Live-stream setup / day']
      ],
      outputs: [
        ['invitation', 'Digital invitation'],
        ['teaser', 'Teaser edit'],
        ['wedding-film', 'Wedding film edit'],
        ['traditional-film', 'Full traditional video edit'],
        ['album-25', 'Album 25'],
        ['album-30', 'Album 30'],
        ['storage-drive', '1 TB storage drive']
      ]
    },
    corporate: {
      events: ['Brand / corporate film', 'Product / marketing reels', 'YouTube production', 'Podcast recording', 'Corporate event', 'Custom production'],
      crew: [
        ['producer', 'Producer / director / day'],
        ['camera', 'Camera operator / day'],
        ['camera-kit', 'Camera & lighting kit / day'],
        ['sound', 'Sound recordist & kit / day'],
        ['assistant', 'Production assistant / day'],
        ['teleprompter', 'Teleprompter / day']
      ],
      outputs: [
        ['brand-film', 'Brand film edit'],
        ['reel', 'Vertical reel / cutdown'],
        ['youtube-episode', 'YouTube episode edit'],
        ['podcast-episode', 'Podcast episode edit'],
        ['captioned-version', 'Captioned language version'],
        ['thumbnail', 'Thumbnail design']
      ]
    }
  };
  const settingsKey = 'evr.quote-maker.settings.v1';
  const draftKey = 'evr.quote-maker.draft.v1';
  const byId = id => document.getElementById(id);
  const status = byId('quote-studio-status');
  const detailStatus = byId('quote-status-detail');
  const login = byId('quote-studio-login');
  const studio = byId('quote-studio-app');
  const loginStatus = byId('quote-studio-login-status');
  const settings = { rates: {}, terms: 'This quotation is subject to date availability and written confirmation by EVR Productions.\nThe final coverage hours, locations, deliverables and payment schedule must be agreed in writing before booking.\nTravel, accommodation, permissions, taxes and any additional services are included only when listed in this quotation.\nThis quotation is valid for 15 days from its issue date unless EVR confirms otherwise in writing.', reviewed: false };
  let rateInputs = new Map();
  let authenticated = false;
  let settingsSaved = false;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.error = String(isError);
  }

  function formatMoney(value) {
    return `INR ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function rounded(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async function apiRequest(options = {}) {
    const response = await fetch('/api/auth', {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  }

  function showStudio(isSignedIn) {
    authenticated = isSignedIn;
    login.hidden = isSignedIn;
    studio.hidden = !isSignedIn;
  }

  async function checkAuthentication() {
    showStudio(false);
    try {
      const result = await apiRequest();
      if (!result.configured) {
        loginStatus.textContent = result.error || 'Server-side admin access is not configured.';
        return;
      }
      if (result.authenticated) showStudio(true);
      else loginStatus.textContent = 'Enter your authorized admin email address to receive a sign-in code.';
    } catch (error) {
      loginStatus.textContent = `Could not connect to the server: ${error.message}`;
    }
  }

  async function requestQuoteStudioCode() {
    const email = byId('quote-studio-email');
    if (!email.reportValidity()) return;
    loginStatus.textContent = 'Requesting a sign-in code…';
    try {
      const result = await apiRequest({
        method: 'POST',
        body: JSON.stringify({ action: 'request-code', email: email.value.trim() })
      });
      byId('quote-studio-code-entry').hidden = false;
      byId('quote-studio-code').focus();
      loginStatus.textContent = result.message;
    } catch (error) {
      loginStatus.textContent = error.message;
    }
  }

  byId('quote-studio-request-code').addEventListener('click', requestQuoteStudioCode);
  byId('quote-studio-resend-code').addEventListener('click', requestQuoteStudioCode);

  login.addEventListener('submit', async event => {
    event.preventDefault();
    if (byId('quote-studio-code-entry').hidden) {
      await requestQuoteStudioCode();
      return;
    }
    if (!login.reportValidity()) return;
    loginStatus.textContent = 'Verifying your sign-in code…';
    try {
      await apiRequest({
        method: 'POST',
        body: JSON.stringify({
          action: 'verify-code',
          email: byId('quote-studio-email').value.trim(),
          code: byId('quote-studio-code').value.trim()
        })
      });
      byId('quote-studio-code').value = '';
      showStudio(true);
      setStatus('Signed in. Configure reviewed rates and terms before issuing a quotation.');
      updateSummary();
    } catch (error) {
      loginStatus.textContent = error.message;
    }
  });

  byId('quote-studio-signout').addEventListener('click', async () => {
    try {
      await apiRequest({ method: 'POST', body: JSON.stringify({ action: 'logout' }) });
      showStudio(false);
      byId('quote-studio-email').value = '';
      byId('quote-studio-code').value = '';
      byId('quote-studio-code-entry').hidden = true;
      loginStatus.textContent = 'You have signed out.';
    } catch (error) {
      setStatus(`Could not sign out: ${error.message}`, true);
    }
  });

  function field(parent, labelText, type, value = '') {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    label.append(input);
    parent.append(label);
    return input;
  }

  function rateKey(type, kind, id) {
    return `${type}:${kind}:${id}`;
  }

  function rateDefinitions() {
    const definitions = [];
    for (const [type, catalogue] of Object.entries(catalogues)) {
      for (const [id, label] of catalogue.crew) definitions.push({ type, kind: 'crew', id, label });
      for (const [id, label] of catalogue.outputs) definitions.push({ type, kind: 'output', id, label });
    }
    return definitions;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(settingsKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1 || !saved.rates || typeof saved.rates !== 'object' ||
          Array.isArray(saved.rates) || typeof saved.terms !== 'string' || saved.terms.length > 4000 ||
          !saved.terms.trim() || typeof saved.reviewed !== 'boolean') {
        throw new Error('Saved quotation settings have an unsupported format.');
      }
      const validKeys = new Set(rateDefinitions().map(item => rateKey(item.type, item.kind, item.id)));
      for (const [key, value] of Object.entries(saved.rates)) {
        if (!validKeys.has(key) || (value !== '' && (!Number.isFinite(value) || value < 0 || value > 100000000))) {
          throw new Error('Saved quotation rates are invalid.');
        }
      }
      settings.rates = saved.rates;
      settings.terms = saved.terms;
      settings.reviewed = saved.reviewed;
      settingsSaved = true;
    } catch (error) {
      console.error('Could not load EVR quotation settings:', error);
      detailStatus.textContent = 'Saved rates or terms could not be loaded. Review and save your settings again before issuing a quotation.';
      detailStatus.dataset.error = 'true';
    }
  }

  function renderRateSettings() {
    const mount = byId('quote-rate-settings');
    mount.replaceChildren();
    rateInputs = new Map();
    for (const type of Object.keys(catalogues)) {
      const group = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = type === 'wedding' ? 'Weddings & celebrations' : 'NBrands / corporate';
      group.append(legend);
      for (const definition of rateDefinitions().filter(item => item.type === type)) {
        const key = rateKey(type, definition.kind, definition.id);
        const input = field(group, `${definition.label} (INR)`, 'number', settings.rates[key] ?? '');
        input.min = '0';
        input.max = '100000000';
        input.step = '0.01';
        input.dataset.rateKey = key;
        input.addEventListener('input', () => {
          byId('quote-reviewed').checked = false;
          settings.reviewed = false;
          settingsSaved = false;
          updateSummary();
        });
        rateInputs.set(key, input);
      }
      mount.append(group);
    }
    byId('quote-terms').value = settings.terms;
    byId('quote-reviewed').checked = settings.reviewed;
  }

  function getCurrentRates() {
    const rates = {};
    for (const [key, input] of rateInputs) {
      if (input.value.trim() === '') {
        rates[key] = '';
        continue;
      }
      const value = input.valueAsNumber;
      if (!Number.isFinite(value) || value < 0 || value > 100000000) return null;
      rates[key] = rounded(value);
    }
    return rates;
  }

  byId('quote-save-settings').addEventListener('click', () => {
    const rates = getCurrentRates();
    const terms = byId('quote-terms').value.trim();
    if (!rates) {
      detailStatus.textContent = 'Enter valid rates from INR 0 to INR 100,000,000.';
      detailStatus.dataset.error = 'true';
      return;
    }
    if (!terms || terms.length > 4000) {
      detailStatus.textContent = 'Add quotation terms (up to 4,000 characters) before saving.';
      detailStatus.dataset.error = 'true';
      byId('quote-terms').focus();
      return;
    }
    settings.rates = rates;
    settings.terms = terms;
    settings.reviewed = byId('quote-reviewed').checked;
    try {
      localStorage.setItem(settingsKey, JSON.stringify({ version: 1, rates, terms, reviewed: settings.reviewed }));
      settingsSaved = true;
      detailStatus.textContent = settings.reviewed
        ? 'Reviewed rates and terms saved in this browser.'
        : 'Rates and terms saved in this browser. Check the review box after verifying them.';
      detailStatus.dataset.error = 'false';
      updateSummary();
    } catch (error) {
      console.error('Could not save EVR quotation settings:', error);
      detailStatus.textContent = 'Could not save rates and terms. Browser storage may be unavailable.';
      detailStatus.dataset.error = 'true';
    }
  });

  byId('quote-reviewed').addEventListener('change', () => {
    settings.reviewed = byId('quote-reviewed').checked;
    settingsSaved = false;
    updateSummary();
  });

  byId('quote-terms').addEventListener('input', () => {
    byId('quote-reviewed').checked = false;
    settings.reviewed = false;
    settingsSaved = false;
    updateSummary();
  });

  function setProjectDefaults() {
    const type = byId('quote-type').value;
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    byId('quote-date').value = date;
    byId('quote-ref').value = `EVR-${date.replaceAll('-', '')}-${String(Date.now()).slice(-5)}`;
    byId('quote-project').value = type === 'wedding' ? 'Wedding coverage' : 'Brand content production';
    byId('quote-partner-one-label').hidden = type !== 'wedding';
    byId('quote-partner-two-label').hidden = type !== 'wedding';
  }

  function renderEvents() {
    const catalogue = catalogues[byId('quote-type').value];
    const choices = byId('quote-event-choices');
    const panels = byId('quote-event-panels');
    choices.replaceChildren();
    panels.replaceChildren();
    byId('quote-deliverables').replaceChildren();
    byId('quote-custom-list').replaceChildren();
    catalogue.events.forEach((name, index) => {
      const id = `${byId('quote-type').value}-event-${index}`;
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.eventName = name;
      checkbox.dataset.panelId = id;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) createEventPanel(name, id, panels, catalogue);
        else document.getElementById(`${id}-panel`)?.remove();
        updateSummary();
      });
      label.append(checkbox, document.createTextNode(name));
      choices.append(label);
    });
    for (const [itemId, label] of catalogue.outputs) {
      const key = rateKey(byId('quote-type').value, 'output', itemId);
      const row = document.createElement('label');
      row.className = 'quote-deliverable-row';
      row.append(document.createTextNode(label));
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '20';
      input.step = '1';
      input.value = '0';
      input.setAttribute('aria-label', `${label} quantity`);
      input.dataset.outputKey = key;
      input.addEventListener('input', updateSummary);
      row.append(input);
      byId('quote-deliverables').append(row);
    }
    setProjectDefaults();
    updateSummary();
  }

  function createEventPanel(name, panelId, panels, catalogue) {
    const panel = document.createElement('fieldset');
    panel.id = `${panelId}-panel`;
    panel.className = 'quote-event-panel';
    const legend = document.createElement('legend');
    legend.textContent = name;
    panel.append(legend);
    const grid = document.createElement('div');
    grid.className = 'quote-event-details';
    const daysLabel = document.createElement('label');
    daysLabel.textContent = name === 'Pre-wedding shoot' ? 'Requested duration' : 'Number of days';
    const days = document.createElement('select');
    days.dataset.eventDays = '';
    const maxDays = name === 'Pre-wedding shoot' ? 3 : 5;
    for (let day = 1; day <= maxDays; day++) {
      const option = document.createElement('option');
      option.value = String(day);
      option.textContent = `${day} day${day === 1 ? '' : 's'}`;
      days.append(option);
    }
    days.addEventListener('change', () => renderEventDays(panel, name, catalogue, Number(days.value)));
    daysLabel.append(days);
    grid.append(daysLabel);
    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Start date (optional)';
    const date = document.createElement('input');
    date.type = 'date';
    date.dataset.eventDate = '';
    dateLabel.append(date);
    grid.append(dateLabel);
    const sessionLabel = document.createElement('label');
    sessionLabel.textContent = 'Session / time';
    const session = document.createElement('select');
    session.dataset.eventSession = '';
    for (const text of ['To be confirmed', 'Morning', 'Evening', 'Morning & evening', 'Full day']) {
      const option = document.createElement('option');
      option.textContent = text;
      session.append(option);
    }
    sessionLabel.append(session);
    grid.append(sessionLabel);
    panel.append(grid);
    const daysMount = document.createElement('div');
    daysMount.className = 'quote-event-day-crew';
    panel.append(daysMount);
    renderEventDays(panel, name, catalogue, Number(days.value));
    panels.append(panel);
  }

  function renderEventDays(panel, name, catalogue, dayCount) {
    const mount = panel.querySelector('.quote-event-day-crew');
    mount.replaceChildren();
    for (let day = 1; day <= dayCount; day++) {
      const heading = document.createElement('h4');
      heading.textContent = `Day ${day} crew`;
      mount.append(heading);
      const grid = document.createElement('div');
      grid.className = 'quote-crew-grid';
      for (const [id, label] of catalogue.crew) {
        const row = document.createElement('label');
        row.textContent = label;
        const quantity = document.createElement('input');
        quantity.type = 'number';
        quantity.min = '0';
        quantity.max = '20';
        quantity.step = '1';
        quantity.value = '0';
        quantity.dataset.crewId = id;
        quantity.dataset.day = String(day);
        quantity.setAttribute('aria-label', `${name}, day ${day}, ${label} quantity`);
        quantity.addEventListener('input', updateSummary);
        row.append(quantity);
        grid.append(row);
      }
      mount.append(grid);
    }
  }

  function addCustomItem(value = {}) {
    const row = document.createElement('div');
    row.className = 'quote-custom-row';
    const name = field(row, 'Item description', 'text', value.name || '');
    name.maxLength = 120;
    name.dataset.customName = '';
    const quantity = field(row, 'Qty', 'number', value.qty ?? '0');
    quantity.min = '0';
    quantity.max = '20';
    quantity.step = '1';
    quantity.dataset.customQty = '';
    const rate = field(row, 'Rate (INR)', 'number', value.rate ?? '');
    rate.min = '0';
    rate.max = '100000000';
    rate.step = '0.01';
    rate.dataset.customRate = '';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-tool';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      row.remove();
      updateSummary();
    });
    row.append(remove);
    row.querySelectorAll('input').forEach(input => input.addEventListener('input', updateSummary));
    byId('quote-custom-list').append(row);
    return row;
  }

  byId('quote-add-custom').addEventListener('click', () => addCustomItem());

  function checkedNumber(input, minimum, maximum, integer = false) {
    const value = input.valueAsNumber;
    return Number.isFinite(value) && value >= minimum && value <= maximum && (!integer || Number.isInteger(value));
  }

  function collectLines() {
    const lines = [];
    const missingRates = [];
    let invalid = false;
    function addLine(label, key, quantity) {
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100) {
        invalid = true;
        return;
      }
      if (!quantity) return;
      const input = rateInputs.get(key);
      const rawRate = input?.value.trim() || '';
      const rate = Number(rawRate);
      if (!rawRate || !Number.isFinite(rate) || rate < 0 || rate > 100000000) {
        missingRates.push(label);
        return;
      }
      lines.push({ label, quantity, rate: rounded(rate), amount: rounded(quantity * rate) });
    }
    for (const panel of byId('quote-event-panels').querySelectorAll('.quote-event-panel')) {
      const eventName = panel.querySelector('legend').textContent;
      const days = Number(panel.querySelector('[data-event-days]').value);
      const date = panel.querySelector('[data-event-date]').value || 'Date to be confirmed';
      const session = panel.querySelector('[data-event-session]').selectedOptions[0].textContent;
      const scope = `${eventName}: ${days} day${days === 1 ? '' : 's'}, ${date}, ${session}.`;
      panel.dataset.scope = scope;
      for (const worker of panel.querySelectorAll('[data-crew-id]')) {
        if (!checkedNumber(worker, 0, 20, true)) { invalid = true; continue; }
        const workerLabel = catalogues[byId('quote-type').value].crew.find(([id]) => id === worker.dataset.crewId)?.[1];
        const key = rateKey(byId('quote-type').value, 'crew', worker.dataset.crewId);
        addLine(`${eventName} / Day ${worker.dataset.day} / ${workerLabel}`, key, worker.valueAsNumber);
      }
    }
    const type = byId('quote-type').value;
    for (const input of byId('quote-deliverables').querySelectorAll('[data-output-key]')) {
      if (!checkedNumber(input, 0, 20, true)) { invalid = true; continue; }
      const label = catalogues[type].outputs.find(([id]) => rateKey(type, 'output', id) === input.dataset.outputKey)?.[1];
      addLine(label, input.dataset.outputKey, input.valueAsNumber);
    }
    for (const row of byId('quote-custom-list').querySelectorAll('.quote-custom-row')) {
      const name = row.querySelector('[data-custom-name]').value.trim();
      const quantity = row.querySelector('[data-custom-qty]');
      const rate = row.querySelector('[data-custom-rate]');
      if (!checkedNumber(quantity, 0, 20, true) || (quantity.valueAsNumber && !checkedNumber(rate, 0, 100000000))) {
        invalid = true;
        continue;
      }
      if (quantity.valueAsNumber) {
        if (!name) invalid = true;
        else {
          const unit = rate.valueAsNumber;
          lines.push({ label: name, quantity: quantity.valueAsNumber, rate: rounded(unit), amount: rounded(unit * quantity.valueAsNumber) });
        }
      }
    }
    return { lines, missingRates, invalid };
  }

  function updateSummary() {
    const result = collectLines();
    const summary = byId('quote-line-summary');
    summary.replaceChildren();
    let subtotal = 0;
    for (const item of result.lines) {
      subtotal = rounded(subtotal + item.amount);
      const row = document.createElement('div');
      row.className = 'quote-line-summary-row';
      const label = document.createElement('span');
      label.textContent = `${item.label} × ${item.quantity}`;
      const amount = document.createElement('strong');
      amount.textContent = formatMoney(item.amount);
      row.append(label, amount);
      summary.append(row);
    }
    const discountInput = byId('quote-discount');
    const taxInput = byId('quote-tax');
    const discountValid = checkedNumber(discountInput, 0, Math.min(100000000, subtotal));
    const taxValid = checkedNumber(taxInput, 0, 100);
    const discount = discountValid ? rounded(discountInput.valueAsNumber) : 0;
    const taxRate = taxValid ? taxInput.valueAsNumber : 0;
    const tax = rounded((subtotal - discount) * taxRate / 100);
    const total = rounded(subtotal - discount + tax);
    byId('quote-subtotal').textContent = formatMoney(subtotal);
    byId('quote-discount-total').textContent = formatMoney(discount);
    byId('quote-tax-total').textContent = formatMoney(tax);
    byId('quote-total').textContent = formatMoney(total);
    const reviewMissing = !byId('quote-reviewed').checked;
    const noItems = result.lines.length === 0;
    const blocked = result.invalid || !discountValid || !taxValid || result.missingRates.length > 0 || noItems || reviewMissing || !settingsSaved;
    byId('quote-preview').disabled = blocked;
    if (result.invalid || !discountValid || !taxValid) {
      detailStatus.textContent = 'Check quantities, rates, discount, and tax. Quantities must be whole numbers; discount cannot exceed the subtotal.';
    } else if (result.missingRates.length) {
      detailStatus.textContent = `Add approved rates for: ${result.missingRates.join(', ')}.`;
    } else if (noItems) {
      detailStatus.textContent = 'Select an event crew member or a deliverable to begin.';
    } else if (reviewMissing) {
      detailStatus.textContent = 'Review the EVR rates and terms, check the review box, and save settings before previewing.';
    } else if (!settingsSaved) {
      detailStatus.textContent = 'Save your reviewed rates and terms before previewing.';
    } else {
      detailStatus.textContent = 'Rates reviewed. Preview the quotation, then print or save it as a PDF.';
    }
  }

  for (const id of ['quote-discount', 'quote-tax']) byId(id).addEventListener('input', updateSummary);
  byId('quote-type').addEventListener('change', renderEvents);

  function serializeDraft() {
    return {
      version: 1,
      type: byId('quote-type').value,
      client: byId('quote-client').value,
      project: byId('quote-project').value,
      reference: byId('quote-ref').value,
      date: byId('quote-date').value,
      location: byId('quote-location').value,
      email: byId('quote-email').value,
      phone: byId('quote-phone').value,
      partnerOne: byId('quote-partner-one').value,
      partnerTwo: byId('quote-partner-two').value,
      discount: byId('quote-discount').value,
      tax: byId('quote-tax').value,
      notes: byId('quote-notes').value,
      events: Array.from(byId('quote-event-panels').querySelectorAll('.quote-event-panel')).map(panel => ({
        name: panel.querySelector('legend').textContent,
        days: panel.querySelector('[data-event-days]').value,
        date: panel.querySelector('[data-event-date]').value,
        sessionIndex: panel.querySelector('[data-event-session]').selectedIndex,
        crew: Array.from(panel.querySelectorAll('[data-crew-id]')).map(input => ({ id: input.dataset.crewId, day: input.dataset.day, qty: input.value }))
      })),
      outputs: Array.from(byId('quote-deliverables').querySelectorAll('[data-output-key]')).map(input => ({ key: input.dataset.outputKey, qty: input.value })),
      customItems: Array.from(byId('quote-custom-list').querySelectorAll('.quote-custom-row')).map(row => ({
        name: row.querySelector('[data-custom-name]').value,
        qty: row.querySelector('[data-custom-qty]').value,
        rate: row.querySelector('[data-custom-rate]').value
      }))
    };
  }

  function validateDraft(draft) {
    if (!draft || draft.version !== 1 || !Object.hasOwn(catalogues, draft.type) ||
        !['client', 'project', 'reference', 'date', 'location', 'email', 'phone', 'partnerOne', 'partnerTwo', 'discount', 'tax', 'notes'].every(key => typeof draft[key] === 'string' && draft[key].length <= 4000) ||
        !Array.isArray(draft.events) || !Array.isArray(draft.outputs) || !Array.isArray(draft.customItems) ||
        draft.events.length > catalogues[draft.type].events.length || draft.outputs.length !== catalogues[draft.type].outputs.length || draft.customItems.length > 20) return false;
    const events = new Set(catalogues[draft.type].events);
    if (draft.events.some(event => !event || !events.has(event.name) || !/^[1-5]$/.test(event.days) ||
        Number(event.days) > (event.name === 'Pre-wedding shoot' ? 3 : 5) ||
        typeof event.date !== 'string' || event.date.length > 10 ||
        !Number.isInteger(event.sessionIndex) || event.sessionIndex < 0 || event.sessionIndex > 4 || !Array.isArray(event.crew) || event.crew.length > 35 ||
        event.crew.some(item => !item || !catalogues[draft.type].crew.some(([id]) => id === item.id) ||
          !/^[1-5]$/.test(item.day) || Number(item.day) > Number(event.days) ||
          !/^(?:0|[1-9]\d?)$/.test(item.qty) || Number(item.qty) > 20))) return false;
    const outputKeys = new Set(catalogues[draft.type].outputs.map(([id]) => rateKey(draft.type, 'output', id)));
    if (draft.outputs.some(item => !item || !outputKeys.has(item.key) || !/^(?:0|[1-9]\d?)$/.test(item.qty) || Number(item.qty) > 20)) return false;
    if (draft.customItems.some(item => !item || typeof item.name !== 'string' || item.name.length > 120 ||
        !/^(?:0|[1-9]\d?)$/.test(item.qty) || Number(item.qty) > 20 ||
        !(item.rate === '' || (Number.isFinite(Number(item.rate)) && Number(item.rate) >= 0 && Number(item.rate) <= 100000000)))) return false;
    return true;
  }

  function restoreDraft(draft) {
    byId('quote-type').value = draft.type;
    renderEvents();
    for (const [id, key] of [['quote-client', 'client'], ['quote-project', 'project'], ['quote-ref', 'reference'], ['quote-date', 'date'],
      ['quote-location', 'location'], ['quote-email', 'email'], ['quote-phone', 'phone'], ['quote-partner-one', 'partnerOne'], ['quote-partner-two', 'partnerTwo'],
      ['quote-discount', 'discount'], ['quote-tax', 'tax'], ['quote-notes', 'notes']]) byId(id).value = draft[key];
    for (const event of draft.events) {
      const checkbox = Array.from(byId('quote-event-choices').querySelectorAll('[data-event-name]')).find(input => input.dataset.eventName === event.name);
      if (!checkbox) continue;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
      const panel = document.getElementById(`${checkbox.dataset.panelId}-panel`);
      if (!panel) continue;
      const days = panel.querySelector('[data-event-days]');
      days.value = event.days;
      days.dispatchEvent(new Event('change'));
      panel.querySelector('[data-event-date]').value = event.date;
      panel.querySelector('[data-event-session]').selectedIndex = event.sessionIndex;
      for (const item of event.crew) {
        const input = panel.querySelector(`[data-crew-id="${CSS.escape(item.id)}"][data-day="${item.day}"]`);
        if (input) input.value = item.qty;
      }
    }
    for (const item of draft.outputs) {
      const input = Array.from(byId('quote-deliverables').querySelectorAll('[data-output-key]')).find(node => node.dataset.outputKey === item.key);
      if (input) input.value = item.qty;
    }
    byId('quote-custom-list').replaceChildren();
    for (const item of draft.customItems) addCustomItem(item);
    updateSummary();
    setStatus('Saved draft loaded from this device. Review all details before issuing.');
  }

  byId('quote-save-draft').addEventListener('click', () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(serializeDraft()));
      setStatus('Draft saved on this device only. It has not been sent to EVR or the client.');
    } catch (error) {
      console.error('Could not save EVR quotation draft:', error);
      setStatus('Could not save this draft. Browser storage may be unavailable.', true);
    }
  });

  byId('quote-load-draft').addEventListener('click', () => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) {
        setStatus('No saved quotation draft was found on this device.');
        return;
      }
      const draft = JSON.parse(raw);
      if (!validateDraft(draft)) throw new Error('Saved draft is invalid or from an unsupported version.');
      restoreDraft(draft);
    } catch (error) {
      console.error('Could not load EVR quotation draft:', error);
      setStatus('Could not load the saved draft. Its data is invalid or unavailable.', true);
    }
  });

  async function buildPreview() {
    const result = collectLines();
    const client = byId('quote-client').value.trim();
    const project = byId('quote-project').value.trim();
    const reference = byId('quote-ref').value.trim();
    const date = byId('quote-date').value;
    try {
      const auth = await apiRequest();
      if (!auth.authenticated) {
        showStudio(false);
        loginStatus.textContent = 'Your admin session has ended. Sign in again.';
        return;
      }
    } catch (error) {
      setStatus(`Could not verify your admin session: ${error.message}`, true);
      return;
    }
    if (!client || !project || !reference || !date || result.invalid || result.missingRates.length || !settings.reviewed ||
        !settingsSaved || !byId('quote-reviewed').checked || !result.lines.length) {
      updateSummary();
      setStatus('Complete the required details, select a scope, and verify rates and terms before previewing.', true);
      return;
    }
    const discount = byId('quote-discount').valueAsNumber;
    const taxRate = byId('quote-tax').valueAsNumber;
    const subtotal = rounded(result.lines.reduce((sum, item) => sum + item.amount, 0));
    if (!Number.isFinite(discount) || discount < 0 || discount > subtotal || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      updateSummary();
      setStatus('Check the discount and tax values before previewing.', true);
      return;
    }
    const tax = rounded((subtotal - discount) * taxRate / 100);
    byId('print-reference').textContent = reference;
    byId('print-date').textContent = new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    byId('print-client').textContent = client;
    byId('print-project').textContent = project;
    byId('print-location').textContent = byId('quote-location').value.trim() || 'To be confirmed';
    const contact = [byId('quote-email').value.trim(), byId('quote-phone').value.trim()].filter(Boolean);
    byId('print-contact').textContent = contact.length ? `Client contact: ${contact.join(' · ')}` : '';
    const type = byId('quote-type').value;
    const scope = Array.from(byId('quote-event-panels').querySelectorAll('.quote-event-panel')).map(panel => panel.dataset.scope).filter(Boolean);
    if (type === 'wedding') {
      const couple = [byId('quote-partner-one').value.trim(), byId('quote-partner-two').value.trim()].filter(Boolean);
      if (couple.length) scope.unshift(`Couple: ${couple.join(' & ')}`);
    }
    const scopeMount = byId('print-scope');
    scopeMount.replaceChildren();
    for (const entry of scope) {
      const paragraph = document.createElement('p');
      paragraph.textContent = entry;
      scopeMount.append(paragraph);
    }
    const rows = byId('print-rows');
    rows.replaceChildren();
    for (const item of result.lines) {
      const row = document.createElement('tr');
      for (const value of [item.label, String(item.quantity), formatMoney(item.rate), formatMoney(item.amount)]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      rows.append(row);
    }
    const totals = byId('print-totals');
    totals.replaceChildren();
    for (const [label, value] of [
      ['Subtotal', subtotal],
      ['Discount', discount],
      [`Tax (${taxRate}%)`, tax],
      ['Total', rounded(subtotal - discount + tax)]
    ]) {
      const line = document.createElement('div');
      if (label === 'Total') line.className = 'quote-print-grand';
      const name = document.createElement('span');
      name.textContent = label;
      const amount = document.createElement('strong');
      amount.textContent = formatMoney(value);
      line.append(name, amount);
      totals.append(line);
    }
    const notes = byId('quote-notes').value.trim();
    byId('print-notes').hidden = !notes;
    byId('print-notes').textContent = notes ? `Notes / agreed scope: ${notes}` : '';
    byId('print-terms').textContent = byId('quote-terms').value.trim();
    byId('quote-print-dialog').showModal();
  }

  byId('quote-preview').addEventListener('click', buildPreview);
  byId('quote-print-button').addEventListener('click', () => window.print());
  byId('quote-print-close').addEventListener('click', () => byId('quote-print-dialog').close());

  byId('quote-type').addEventListener('change', renderEvents);
  loadSettings();
  renderRateSettings();
  renderEvents();
  checkAuthentication();
})();
