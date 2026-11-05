'use strict';
(() => {
  const catalogues = {
    wedding: {
      title: 'Build your wedding quotation.',
      intro: 'Plan each event, its shoot days and the keepsakes. See one overall estimate based on current EVR wedding rates.',
      events: ['Engagement', 'Groom haldi', 'Bride haldi', 'Groom rituals', 'Bride rituals', 'Wedding', 'Sangeet', 'Vratam', 'Reception', 'Pre-wedding shoot', 'Custom celebration'],
      crew: [
        ['photographer', 'Traditional photographer / day'],
        ['videographer', 'Traditional videographer / day'],
        ['candid', 'Candid photographer / day'],
        ['cinema', 'Cinematographer / day'],
        ['drone', 'Drone unit / day (permissions required)'],
        ['screen', 'LED wall / day (size to confirm)'],
        ['stream', 'Live-stream setup / day']
      ],
      outputs: [
        ['invite', 'Digital invitation'], ['teaser', 'Teaser edit'],
        ['film', 'Wedding film edit'], ['fullvideo', 'Full traditional video edit'],
        ['album25', 'Album 25 (specification to confirm)'], ['album30', 'Album 30 (specification to confirm)'],
        ['album45', 'Album 45 (specification to confirm)'],
        ['drive', '1 TB storage drive']
      ]
    },
    corporate: {
      title: 'Build your production quotation.',
      intro: 'Choose production formats, crew by shoot day and finished outputs. No wedding packages mixed into your brand brief.',
      events: ['Brand / corporate film', 'Product / marketing reels', 'YouTube production', 'Podcast recording', 'Corporate event', 'Custom production'],
      crew: [
        ['producer', 'Producer / director / day'], ['camera', 'Camera operator / day'],
        ['kit', 'Camera & lighting kit / day'], ['sound', 'Sound recordist & kit / day'],
        ['assistant', 'Production assistant / day'], ['teleprompter', 'Teleprompter / day']
      ],
      outputs: [
        ['brandfilm', 'Brand film edit'], ['reel', 'Vertical reel / cutdown'],
        ['youtube', 'YouTube episode edit'], ['podcast', 'Podcast episode edit'],
        ['captions', 'Captioned language version'], ['thumbnail', 'Thumbnail design']
      ]
    }
  };
  const weddingRates = {
    prewedding: [60000, 80000, 100000],
    crew: {
      photographer: 8000,
      videographer: 8000,
      candid: 12000,
      cinema: 16000,
      drone: 10000,
      screen: 20000,
      stream: 10000
    },
    outputs: {
      invite: 1000,
      teaser: 5000,
      film: 20000,
      fullvideo: 10000,
      album25: 12500,
      album30: 15000,
      album45: 22500,
      drive: 10000
    }
  };
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function field(parent, label, type = 'text', value = '') {
    const wrapper = node('label', label);
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.value = value;
    if (type === 'text') input.maxLength = 100;
    if (type === 'textarea') { input.maxLength = 800; input.rows = 3; }
    wrapper.append(input);
    parent.append(wrapper);
    return input;
  }
  function options(parent, label, values) {
    const wrapper = node('label', label);
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    for (const [value, text] of values) {
      const option = node('option', text);
      option.value = value;
      select.append(option);
    }
    wrapper.append(select);
    parent.append(wrapper);
    return select;
  }
  function formatMoney(value) {
    return `INR ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function quantity(parent, label, key) {
    const input = field(parent, label, 'number', '0');
    input.min = '0'; input.max = '20'; input.step = '1';
    input.dataset.item = key;
    return input;
  }
  function build(type, mount) {
    const config = catalogues[type];
    const section = node('section', '', 'quotation-builder');
    section.id = `${type}-quotation-builder`;
    section.dataset.context = type;
    section.tabIndex = -1;
    section.setAttribute('aria-label', config.title);
    const heading = node('div', '', 'builder-heading');
    heading.append(node('p', 'DETAILED QUOTE / EVENT & DELIVERABLE PLANNER', 'eyebrow'), node('h2', config.title), node('p', config.intro));
    const form = node('form', '', 'builder-layout');
    const content = node('div');
    const info = node('div', '', 'builder-card');
    info.append(node('h3', '01 / Your details'));
    const fields = node('div', '', 'builder-grid');
    const client = field(fields, 'Client name');
    client.required = true;
    const project = field(fields, type === 'wedding' ? 'Couple / celebration name' : 'Brand / project name');
    const quoteDate = field(fields, 'Quotation date', 'date');
    const today = new Date();
    quoteDate.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const location = field(fields, 'City / venue (optional)');
    if (type === 'wedding') {
      field(fields, "Partner one's name").dataset.detail = 'Partner one';
      field(fields, "Partner two's name").dataset.detail = 'Partner two';
    } else {
      options(fields, 'Delivery formats', [['mixed', 'Mixed formats - agree per output'], ['vertical', 'Vertical 9:16'], ['landscape', 'Landscape 16:9'], ['square', 'Square 1:1']]).dataset.detail = 'Delivery formats';
      field(fields, 'Usage / channels (rights to confirm)').dataset.detail = 'Intended usage';
    }
    info.append(fields);
    const eventsCard = node('div', '', 'builder-card');
    eventsCard.append(node('h3', type === 'wedding' ? '02 / Events & coverage' : '02 / Shoots & production'));
    eventsCard.append(node('p', type === 'wedding'
      ? 'Choose events, days and crew to see one overall estimate. Sessions describe timing only. Select zero to exclude an item.'
      : 'Choose the crew needed for each shoot day. Sessions describe timing only. Select zero to exclude an item. Deselecting an event keeps its settings until this page is reloaded.'));
    const choices = node('div', '', 'builder-choices');
    const panels = node('div');
    const eventStates = [];
    config.events.forEach((name, index) => {
      const toggle = field(choices, name, 'checkbox');
      toggle.dataset.event = index;
      const panel = node('fieldset', '', 'builder-event');
      panel.hidden = true;
      panel.append(node('legend', name));
      const prewedding = type === 'wedding' && name === 'Pre-wedding shoot';
      const days = options(panel, prewedding ? 'Package duration' : 'Shoot days', (prewedding ? [1, 2, 3] : [1, 2, 3, 4, 5]).map(n => [String(n), `${n} day${n > 1 ? 's' : ''}`]));
      days.dataset.days = index;
      if (prewedding) {
        panel.append(node('p', 'Includes a cinematographer, candid photographer and drone. The selected package is included in your overall estimate; confirm the final scope, travel and permissions with EVR.'));
      }
      const dayStates = [];
      for (let day = 1; day <= (prewedding ? 3 : 5); day++) {
        const box = node('div', '', 'builder-day');
        box.hidden = day > 1;
        box.append(node('h4', `Day ${day}`));
        const grid = node('div', '', 'builder-grid');
        const date = field(grid, 'Shoot date (optional)', 'date');
        const session = options(grid, 'Session / time window', [['tbc', 'To be confirmed'], ['morning', 'Morning'], ['evening', 'Evening'], ['both', 'Morning & evening']]);
        box.append(grid);
        const quantities = node('div', '', 'builder-quantities');
        const crew = prewedding ? [] : config.crew.map(([id, label]) => ({
          id,
          label,
          input: quantity(quantities, label, id)
        }));
        box.append(quantities);
        panel.append(box);
        dayStates.push({ box, date, session, crew });
      }
      const sync = () => {
        panel.hidden = !toggle.checked;
        dayStates.forEach(({ box }, day) => { box.hidden = day >= Number(days.value); });
        // Disabled inactive fields cannot block native form validation.
        panel.querySelectorAll('input, select').forEach(input => { input.disabled = !toggle.checked || Boolean(input.closest('.builder-day[hidden]')); });
      };
      toggle.addEventListener('change', sync);
      days.addEventListener('change', sync);
      sync();
      panels.append(panel);
      eventStates.push({ name, toggle, days, dayStates, prewedding });
    });
    eventsCard.append(choices, panels);
    const outputsCard = node('div', '', 'builder-card');
    outputsCard.append(node('h3', '03 / Finished deliverables'));
    const outputGrid = node('div', '', 'builder-quantities');
    const outputs = config.outputs.map(([id, label]) => ({
      id,
      label,
      input: quantity(outputGrid, label, id)
    }));
    outputsCard.append(outputGrid);
    const notes = field(outputsCard, 'Additional requirements / raw files / specifications (not priced)', 'textarea');
    outputsCard.append(node('p', type === 'wedding'
      ? 'Rates are estimates. Raw footage, travel, permissions, taxes and custom requirements must be confirmed with EVR.'
      : 'Raw footage is not assumed included. EVR will discuss all requirements, travel, permissions, usage and pricing with you on a call.'));
    content.append(info, eventsCard, outputsCard);
    const summary = node('aside', '', 'builder-summary');
    summary.append(node('p', type === 'wedding' ? 'PRICE ESTIMATE / NOT A BOOKING' : 'QUOTE REQUEST / NOT A BOOKING', 'eyebrow'), node('h3', 'Your requirements.'));
    const breakdown = node('dl');
    const total = node('output', '', 'builder-total');
    total.setAttribute('aria-label', 'Pricing information');
    const priceNote = node('p', '', 'builder-price-note');
    priceNote.textContent = type === 'wedding'
      ? 'Estimate only. Final dates, coverage, travel, permissions, taxes and availability must be confirmed by EVR.'
      : 'Corporate production pricing is discussed with EVR after reviewing the brief.';
    const status = node('p');
    status.setAttribute('role', 'status');
    const preview = node('button', type === 'wedding' ? 'Preview / print estimate' : 'Preview / print quote request', 'button');
    preview.type = 'submit';
    const request = node('button', type === 'wedding' ? 'Discuss this estimate' : 'Discuss this scope', 'button secondary');
    request.type = 'button';
    summary.append(breakdown, total, priceNote, preview, request, status, node('p', 'Nothing is sent automatically. Review your estimate or request before choosing how to contact EVR.'));
    form.append(content, summary);
    section.append(heading, form);
    mount.after(section);
    const jump = node('button', type === 'wedding' ? 'Plan events & build a detailed quote' : 'Plan shoots & build a detailed quote', 'button gold');
    jump.type = 'button';
    jump.addEventListener('click', () => {
      section.focus({ preventScroll: true });
      section.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    mount.closest('.route').querySelector('.quote-intro .detail-note').before(jump);
    function calculate() {
      const lines = [], scope = [], groups = [];
      let valid = true;
      function add(item, prefix = '', unitRate) {
        const qty = item.input.valueAsNumber;
        if (!Number.isInteger(qty) || qty < 0 || qty > 20) { valid = false; return; }
        if (qty) {
          const amount = unitRate === undefined ? null : unitRate * qty;
          lines.push({ name: prefix + item.label, qty, rate: unitRate ?? null, amount });
        }
      }
      for (const event of eventStates.filter(event => event.toggle.checked)) {
        const before = lines.length;
        if (event.prewedding) {
          const rate = weddingRates.prewedding[Number(event.days.value) - 1];
          lines.push({ name: `${event.name} / ${event.days.value}-day package`, qty: 1, rate, amount: rate });
        }
        event.dayStates.slice(0, Number(event.days.value)).forEach((day, index) => {
          scope.push(`${event.name} / Day ${index + 1}: ${day.date.value || 'date TBC'}; ${day.session.selectedOptions[0].textContent}.`);
          day.crew.forEach(item => add(item, `${event.name} / Day ${index + 1} / `,
            type === 'wedding' ? weddingRates.crew[item.id] : undefined));
        });
        const eventLines = lines.slice(before);
        const amount = type === 'wedding' ? eventLines.reduce((sum, item) => sum + item.amount, 0) : null;
        groups.push([event.name, `${event.days.value} day(s), ${eventLines.length} selected item(s)`, amount]);
      }
      const before = lines.length;
      outputs.forEach(item => add(item, '', type === 'wedding' ? weddingRates.outputs[item.id] : undefined));
      const outputLines = lines.slice(before);
      const outputAmount = type === 'wedding' ? outputLines.reduce((sum, item) => sum + item.amount, 0) : null;
      groups.push(['Deliverables', `${outputLines.reduce((sum, item) => sum + item.qty, 0)} requested`, outputAmount]);
      const subtotal = type === 'wedding' ? lines.reduce((sum, item) => sum + item.amount, 0) : null;
      return { valid, lines, scope, groups, subtotal };
    }
    function update() {
      const result = calculate();
      breakdown.replaceChildren();
      for (const [label, value] of result.groups) {
        const row = node('div');
        row.append(node('dt', label), node('dd', result.valid ? value : 'Check inputs'));
        breakdown.append(row);
      }
      total.value = type === 'wedding'
        ? result.lines.length ? `Estimated total: ${formatMoney(result.subtotal)}` : 'Select options to see an estimate.'
        : 'Pricing will be discussed on a call.';
      preview.disabled = request.disabled = !result.valid || !result.lines.length;
      status.textContent = result.valid ? (result.lines.length ? '' : 'Select coverage or deliverables to start your quotation.') : 'Use whole quantities between 0 and 20. Blank or fractional quantities cannot be quoted.';
    }
    function prepared() {
      const result = calculate();
      if (!result.valid || !result.lines.length) { update(); return null; }
      if (!form.reportValidity()) return null;
      if (!client.value.trim()) { status.textContent = 'Enter a client name before continuing.'; client.focus(); return null; }
      return result;
    }
    function presentPreview(result) {
      const dialog = byId('quote-print-dialog');
      const money = value => formatMoney(value);
      byId('print-reference').textContent = `EVR-${type === 'wedding' ? 'WEDDING-ESTIMATE' : 'PRODUCTION-REQUEST'}`;
      byId('print-date').textContent = quoteDate.value || 'Date to be confirmed';
      byId('quote-print-title').textContent = type === 'wedding' ? 'Wedding estimate' : 'Production scope request';
      byId('print-client').textContent = client.value.trim();
      byId('print-project').textContent = project.value.trim() || (type === 'wedding' ? 'Wedding coverage' : 'Brand production');
      byId('print-location').textContent = location.value.trim() || 'To be confirmed';
      byId('print-contact').textContent = '';
      const scopeMount = byId('print-scope');
      scopeMount.replaceChildren();
      const scopeDetails = [
        `Quotation date: ${quoteDate.value || 'To be confirmed'}.`,
        ...Array.from(fields.querySelectorAll('[data-detail]'), input => {
          const value = input.tagName === 'SELECT' ? input.selectedOptions[0].textContent : input.value.trim();
          return value ? `${input.dataset.detail}: ${value}.` : '';
        }).filter(Boolean),
        ...result.scope,
        `Additional requirements: ${notes.value.trim() || 'None specified'}.`
      ];
      for (const detail of scopeDetails) {
        const paragraph = node('p', detail);
        scopeMount.append(paragraph);
      }
      const rows = byId('print-rows');
      rows.replaceChildren();
      const priceColumns = dialog.querySelectorAll('[data-quote-price-column]');
      priceColumns.forEach(column => { column.hidden = type === 'wedding'; });
      for (const item of result.lines) {
        const row = document.createElement('tr');
        const values = type === 'wedding'
          ? [item.name, String(item.qty)]
          : [item.name, String(item.qty), 'Discuss with EVR', 'Discuss with EVR'];
        for (const value of values) row.append(node('td', value));
        rows.append(row);
      }
      const totals = byId('print-totals');
      totals.replaceChildren();
      const totalLine = node('div', '', type === 'wedding' ? 'quote-print-grand' : '');
      totalLine.append(
        node('span', type === 'wedding' ? 'Estimated total' : 'Pricing'),
        node('strong', type === 'wedding' ? money(result.subtotal) : 'Discuss with EVR')
      );
      totals.append(totalLine);
      const estimateNote = type === 'wedding'
        ? 'This is an estimate based on EVR wedding rates, not a confirmed booking. Dates, availability, travel, permissions, taxes and any changes to scope must be confirmed with EVR.'
        : 'This is a production scope request, not a priced quotation or confirmed booking. EVR will discuss pricing after reviewing the brief.';
      byId('print-notes').hidden = false;
      byId('print-notes').textContent = estimateNote;
      byId('print-terms').textContent = estimateNote;
      dialog.showModal();
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const result = prepared();
      if (!result) return;
      presentPreview(result);
    });
    request.addEventListener('click', () => {
      const result = prepared();
      if (!result) return;
      const brief = document.querySelector('[name="brief"]');
      if (brief.value.trim()) {
        status.textContent = 'Your existing enquiry brief was kept. Save this quote as PDF for your discussion; clear the enquiry brief first if you want to replace it.';
        return;
      }
      const text = type === 'wedding'
        ? [`Wedding estimate request: ${project.value.trim() || config.title}`, ...result.lines.map(item => `${item.name} x ${item.qty}`), `Estimated total: ${formatMoney(result.subtotal)}. Final scope and pricing require EVR confirmation.`, ...result.scope, notes.value.trim()]
        : [`Detailed production quote request: ${project.value.trim() || config.title}`, 'Pricing will be discussed on a call.', ...result.lines.map(item => `${item.name} x ${item.qty}`), ...result.scope, notes.value.trim()];
      const briefText = text.filter(Boolean).join('\n');
      if (briefText.length > brief.maxLength) {
        status.textContent = 'This scope is longer than the enquiry field allows. Please save the full quotation as PDF and use a short enquiry brief.';
        return;
      }
      brief.value = briefText;
      const name = document.querySelector('[name="name"]');
      if (!name.value) name.value = client.value.trim();
      const venue = document.querySelector('[name="location"]');
      if (!venue.value) venue.value = location.value.trim();
      byId('service').value = type === 'wedding' ? 'Wedding' : 'Corporate / content';
      window.location.hash = '/request';
    });
    update();
  }
  build('wedding', document.querySelector('[data-estimate-mount="wedding"]'));
  build('corporate', document.querySelector('[data-estimate-mount="corporate"]'));

  const floating = node('a', '', 'quote-float');
  floating.id = 'floating-quote';
  const footer = document.querySelector('.site-footer');
  let footerVisible = false;
  const icon = node('span', '+');
  icon.setAttribute('aria-hidden', 'true');
  const label = node('span');
  floating.append(icon, label);
  document.querySelector('.site-footer').after(floating);
  function syncFloating(event) {
    const corporate = event?.detail?.experience
      ? event.detail.experience === 'corporate'
      : document.body.classList.contains('corporate-view');
    floating.href = corporate ? '#/production-quote' : '#/estimate';
    label.textContent = corporate ? 'Brand quote' : 'Wedding quote';
    floating.setAttribute('aria-label', corporate ? 'Build a brand production quotation' : 'Build a wedding quotation');
    const activeRoute = event?.detail?.route || document.querySelector('.route:not([hidden])')?.id;
    floating.hidden = !activeRoute || footerVisible ||
      ['estimate', 'production-quote', 'request', 'studio'].includes(activeRoute);
    document.body.classList.toggle('has-quote-float', !floating.hidden);
  }
  if ('IntersectionObserver' in window) {
    const footerObserver = new IntersectionObserver(entries => {
      footerVisible = entries.some(entry => entry.isIntersecting);
      syncFloating();
    });
    footerObserver.observe(footer);
  }
  floating.addEventListener('click', () => {
    const type = document.body.classList.contains('corporate-view') ? 'corporate' : 'wedding';
    const target = byId(`${type}-quotation-builder`);
    // The router resets scroll first; focus the detailed planner after that reset.
    window.addEventListener('hashchange', () => requestAnimationFrame(() => requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    })), { once: true });
  });
  window.addEventListener('evr:routechange', syncFloating);
  syncFloating();
})();
