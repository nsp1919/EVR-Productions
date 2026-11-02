'use strict';
(() => {
  const catalogues = {
    wedding: {
      title: 'Build your wedding quotation.',
      intro: 'Plan each event, its shoot days and the keepsakes. Pricing will be discussed on a call with EVR.',
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
    eventsCard.append(node('p', 'Choose the crew needed for each shoot day. Sessions describe timing only. Select zero to exclude an item. Deselecting an event keeps its settings until this page is reloaded.'));
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
      const days = options(panel, prewedding ? 'Package duration' : 'Shoot days', (prewedding ? [1, 2] : [1, 2, 3, 4, 5]).map(n => [String(n), `${n} day${n > 1 ? 's' : ''}`]));
      days.dataset.days = index;
      if (prewedding) panel.append(node('p', 'Choose the requested duration. Crew, hours, inclusions, travel and pricing will be discussed with EVR on a call.'));
      const dayStates = [];
      for (let day = 1; day <= (prewedding ? 2 : 5); day++) {
        const box = node('div', '', 'builder-day');
        box.hidden = day > 1;
        box.append(node('h4', `Day ${day}`));
        const grid = node('div', '', 'builder-grid');
        const date = field(grid, 'Shoot date (optional)', 'date');
        const session = options(grid, 'Session / time window', [['tbc', 'To be confirmed'], ['morning', 'Morning'], ['evening', 'Evening'], ['both', 'Morning & evening']]);
        box.append(grid);
        const quantities = node('div', '', 'builder-quantities');
        const crew = prewedding ? [] : config.crew.map(([id, label]) => ({ id, label, input: quantity(quantities, label, id) }));
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
    const outputs = config.outputs.map(([id, label]) => ({ id, label, input: quantity(outputGrid, label, id) }));
    outputsCard.append(outputGrid);
    const notes = field(outputsCard, 'Additional requirements / raw files / specifications (not priced)', 'textarea');
    outputsCard.append(node('p', 'Raw footage is not assumed included. EVR will discuss all requirements, travel, permissions, usage and pricing with you on a call.'));
    content.append(info, eventsCard, outputsCard);
    const summary = node('aside', '', 'builder-summary');
    summary.append(node('p', 'QUOTE REQUEST / NOT A BOOKING', 'eyebrow'), node('h3', 'Your requirements.'));
    const breakdown = node('dl');
    const total = node('output', '', 'builder-total');
    total.setAttribute('aria-label', 'Pricing information');
    const status = node('p');
    status.setAttribute('role', 'status');
    const preview = node('button', 'Preview / print quote request', 'button');
    preview.type = 'submit';
    const request = node('button', 'Discuss this scope', 'button secondary');
    request.type = 'button';
    summary.append(breakdown, total, preview, request, status, node('p', 'No prices are shown online. EVR will confirm scope and pricing after a call. Preview your requirements or save them as PDF. Nothing is sent automatically.'));
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
      function add(item, prefix = '') {
        const qty = item.input.valueAsNumber;
        if (!Number.isInteger(qty) || qty < 0 || qty > 20) { valid = false; return; }
        if (qty) lines.push({ name: prefix + item.label, qty });
      }
      for (const event of eventStates.filter(event => event.toggle.checked)) {
        const before = lines.length;
        if (event.prewedding) {
          lines.push({ name: `${event.name} / ${event.days.value}-day request`, qty: 1 });
        }
        event.dayStates.slice(0, Number(event.days.value)).forEach((day, index) => {
          scope.push(`${event.name} / Day ${index + 1}: ${day.date.value || 'date TBC'}; ${day.session.selectedOptions[0].textContent}.`);
          day.crew.forEach(item => add(item, `${event.name} / Day ${index + 1} / `));
        });
        groups.push([event.name, `${event.days.value} day(s), ${lines.length - before} selected item(s)`]);
      }
      const before = lines.length;
      outputs.forEach(item => add(item));
      groups.push(['Deliverables', `${lines.slice(before).reduce((sum, item) => sum + item.qty, 0)} requested`]);
      return { valid, lines, scope, groups };
    }
    function update() {
      const result = calculate();
      breakdown.replaceChildren();
      for (const [label, value] of result.groups) {
        const row = node('div');
        row.append(node('dt', label), node('dd', result.valid ? value : 'Check inputs'));
        breakdown.append(row);
      }
      total.value = 'Pricing will be discussed on a call.';
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
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const result = prepared();
      if (!result) return;
      byId('pdf-ref').textContent = `EVR-${type === 'wedding' ? 'WEDDING' : 'BRAND'}-SAMPLE`;
      byId('pdf-client').textContent = client.value.trim();
      byId('pdf-project').textContent = project.value.trim() || (type === 'wedding' ? 'Wedding coverage' : 'Brand production');
      const details = [`Quotation date: ${quoteDate.value || 'TBC'}. Location: ${location.value.trim() || 'TBC'}.`];
      fields.querySelectorAll('[data-detail]').forEach(input => {
        const value = input.tagName === 'SELECT' ? input.selectedOptions[0].textContent : input.value.trim();
        if (value) details.push(`${input.dataset.detail}: ${value}`);
      });
      presentQuotation(result.lines, null, [...details, ...result.scope], `Additional requirements: ${notes.value.trim() || 'None specified'}. Scope, inclusions and pricing will be discussed on a call. This is a quote request, not a confirmed booking.`);
    });
    request.addEventListener('click', () => {
      const result = prepared();
      if (!result) return;
      const brief = document.querySelector('[name="brief"]');
      if (brief.value.trim()) {
        status.textContent = 'Your existing enquiry brief was kept. Save this quote as PDF for your discussion; clear the enquiry brief first if you want to replace it.';
        return;
      }
      const text = [`Detailed ${type} quote request: ${project.value.trim() || config.title}`, 'Pricing will be discussed on a call.', ...result.lines.map(item => `${item.name} x ${item.qty}`), ...result.scope, notes.value.trim()].filter(Boolean).join('\n');
      if (text.length > brief.maxLength) {
        status.textContent = 'This scope is longer than the enquiry field allows. Please save the full quotation as PDF and use a short enquiry brief.';
        return;
      }
      brief.value = text;
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
  function syncFloating() {
    const corporate = document.body.classList.contains('corporate-view');
    floating.href = corporate ? '#/production-quote' : '#/estimate';
    label.textContent = corporate ? 'Brand quote' : 'Wedding quote';
    floating.setAttribute('aria-label', corporate ? 'Build a brand production quotation' : 'Build a wedding quotation');
    const activeRoute = document.querySelector('.route:not([hidden])');
    floating.hidden = !activeRoute || footerVisible ||
      ['estimate', 'production-quote', 'request', 'studio'].includes(activeRoute.id);
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
  window.addEventListener('hashchange', syncFloating);
  syncFloating();
})();
