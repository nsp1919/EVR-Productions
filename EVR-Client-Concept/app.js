'use strict';
const templates = {
  wedding: { project: 'Wedding coverage', items: [
    { name: 'Photography coverage / day', qty: 1, rate: 18000 },
    { name: 'Cinematography / day', qty: 1, rate: 22000 },
    { name: 'Wedding film edit', qty: 1, rate: 12000 },
    { name: 'Teaser edit', qty: 1, rate: 5000 }
  ] },
  corporate: { project: 'Brand content production', items: [
    { name: 'Production crew / shoot day', qty: 1, rate: 20000 },
    { name: 'Camera & audio kit / day', qty: 1, rate: 8000 },
    { name: 'Brand film edit', qty: 1, rate: 10000 },
    { name: 'Short-form cutdowns', qty: 3, rate: 2500 }
  ] }
};
const byId = id => document.getElementById(id);
const money = value => 'INR ' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
let items = structuredClone(templates.wedding.items);
let activeExperience = 'home';
function route() {
  const requested = location.hash.replace(/^#\/?/, '') || 'home';
  const target = document.querySelectorAll('.route');
  const valid = Array.from(target).some(section => section.id === requested);
  const isAdmin = requested === 'admin';
  const activeRoute = isAdmin ? (window.adminPreviewPage || 'home') : valid ? requested : 'home';
  byId('admin-editor').hidden = !isAdmin;
  document.body.classList.toggle('admin-active', isAdmin);
  if (!isAdmin) {
    document.querySelectorAll('[data-admin-text-edited="true"]').forEach(element => {
      element.contentEditable = 'false';
    });
  }
  for (const section of target) section.hidden = section.id !== activeRoute;
  if (typeof window.syncHomeHeroVideo === 'function') window.syncHomeHeroVideo();
  const page = byId(activeRoute);
  const mount = page.querySelector('[data-estimate-mount]');
  if (mount) {
    mount.append(byId('estimate-calculator'));
    if (byId('estimate-type').value !== mount.dataset.estimateMount) {
      byId('estimate-type').value = mount.dataset.estimateMount;
      byId('estimate-type').dispatchEvent(new Event('change'));
    }
  }
  if (typeof window.applyAdminEdits === 'function') window.applyAdminEdits();
  const savedExperience = history.state && history.state.evrExperience;
  if (page.dataset.experienceOwner) activeExperience = page.dataset.experienceOwner;
  else if (activeRoute === 'corporate') activeExperience = 'corporate';
  else if (activeRoute === 'home' || activeRoute === 'weddings') activeExperience = 'home';
  else if (savedExperience === 'home' || savedExperience === 'corporate') activeExperience = savedExperience;
  history.replaceState({ ...history.state, evrExperience: activeExperience }, '');
  document.body.classList.toggle('corporate-view', activeExperience === 'corporate');
  document.querySelector('.experience-switch').dataset.active = activeExperience;
  document.querySelectorAll('[data-experience]').forEach(link => {
    if (link.dataset.experience === activeRoute) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-nav-experience]').forEach(menu => {
    menu.hidden = menu.dataset.navExperience !== activeExperience;
  });
  byId('main-nav').setAttribute('aria-label', activeExperience === 'corporate' ? 'Brand Video Production navigation' : 'Wedding and Event Photography navigation');
  byId('main-nav').querySelectorAll('a').forEach(link => {
    if (link.hash === '#/' + activeRoute) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  byId('main-nav').classList.remove('is-open');
  byId('menu-toggle').setAttribute('aria-expanded', 'false');
  requestAnimationFrame(() => window.scrollTo(0, 0));
}
window.addEventListener('hashchange', route);
window.addEventListener('load', () => requestAnimationFrame(() => window.scrollTo(0, 0)));
byId('menu-toggle').addEventListener('click', () => {
  const open = byId('main-nav').classList.toggle('is-open');
  byId('menu-toggle').setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('[data-estimate-type], [data-corp-estimate]').forEach(link => link.addEventListener('click', () => {
  byId('estimate-type').value = link.dataset.estimateType || 'corporate';
  byId('estimate-type').dispatchEvent(new Event('change'));
}));
document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
  byId('service').value = link.dataset.service;
}));
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  const gallery = button.closest('.route');
  gallery.querySelectorAll('[data-filter]').forEach(item => {
    item.classList.toggle('active', item === button);
    item.setAttribute('aria-pressed', String(item === button));
  });
  gallery.querySelectorAll('[data-category]').forEach(item => {
    item.hidden = button.dataset.filter !== 'all' && item.dataset.category !== button.dataset.filter;
  });
}));
byId('inquiry-form').addEventListener('submit', event => {
  event.preventDefault();
  byId('inquiry-status').textContent = 'Demo confirmation: your requirements would now be sent to EVR for review. Nothing was transmitted or saved.';
});
function renderItems() {
  const rows = byId('quote-rows');
  rows.replaceChildren();
  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = item.name;
    tr.append(name);
    for (const key of ['qty', 'rate']) {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = key === 'qty' ? '100' : '10000000';
      input.step = key === 'qty' ? '1' : '0.01';
      input.value = item[key];
      input.setAttribute('aria-label', `${item.name} ${key}`);
      input.addEventListener('input', () => {
        items[index][key] = input.valueAsNumber;
        updateTotals();
      });
      cell.append(input);
      tr.append(cell);
    }
    const amount = document.createElement('td');
    amount.dataset.amount = index;
    tr.append(amount);
    rows.append(tr);
  });
  updateTotals();
}
function totals() {
  const discount = byId('discount').valueAsNumber;
  const taxRate = byId('tax').valueAsNumber;
  const validItems = items.every(item => Number.isInteger(item.qty) && item.qty >= 0 && item.qty <= 100 && Number.isFinite(item.rate) && item.rate >= 0 && item.rate <= 10000000);
  const subtotal = round(items.reduce((sum, item) => sum + round(item.qty * item.rate), 0));
  if (!validItems || !Number.isFinite(discount) || discount < 0 || discount > subtotal || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return null;
  const tax = round((subtotal - discount) * taxRate / 100);
  return { subtotal, discount, tax, total: round(subtotal - discount + tax) };
}
function updateTotals() {
  const sum = totals();
  document.querySelectorAll('[data-amount]').forEach(cell => {
    const item = items[Number(cell.dataset.amount)];
    cell.textContent = Number.isFinite(item.qty * item.rate) ? money(round(item.qty * item.rate)) : 'Invalid';
  });
  for (const [id, key] of [['subtotal', 'subtotal'], ['discount-value', 'discount'], ['tax-value', 'tax'], ['total', 'total']]) byId(id).textContent = sum ? money(sum[key]) : 'Check inputs';
  byId('quote-status').textContent = sum ? '' : 'Enter valid quantities (0-100), non-negative rates, a discount no greater than the subtotal and tax between 0% and 100%.';
  byId('preview-quote').disabled = !sum;
  byId('save-draft').disabled = !sum;
}
byId('quote-type').addEventListener('change', () => {
  items = structuredClone(templates[byId('quote-type').value].items);
  byId('quote-project').value = templates[byId('quote-type').value].project;
  byId('discount').value = '0';
  byId('tax').value = '0';
  renderItems();
});
byId('discount').addEventListener('input', updateTotals);
byId('tax').addEventListener('input', updateTotals);
byId('save-draft').addEventListener('click', () => {
  if (!totals()) { updateTotals(); return; }
  const draft = { version: 1, type: byId('quote-type').value, client: byId('quote-client').value, project: byId('quote-project').value, reference: byId('quote-ref').value, discount: byId('discount').value, tax: byId('tax').value, items };
  try {
    localStorage.setItem('evr-concept-draft', JSON.stringify(draft));
    byId('quote-status').textContent = 'Demo draft saved in this browser only. It is not a cloud-backed quotation.';
  } catch (error) {
    console.error('EVR demo draft save failed', error);
    byId('quote-status').textContent = 'Could not save the demo draft. Browser storage may be unavailable.';
  }
});
byId('load-draft').addEventListener('click', () => {
  try {
    const raw = localStorage.getItem('evr-concept-draft');
    if (!raw) { byId('quote-status').textContent = 'No saved demo draft in this browser.'; return; }
    const draft = JSON.parse(raw);
    const valid = draft && draft.version === 1 && Object.hasOwn(templates, draft.type) &&
      ['client', 'project', 'reference', 'discount', 'tax'].every(key => typeof draft[key] === 'string') &&
      Array.isArray(draft.items) && draft.items.length === 4 &&
      draft.items.every(item => item && typeof item.name === 'string' && item.name.length <= 160 && Number.isInteger(item.qty) && item.qty >= 0 && item.qty <= 100 && Number.isFinite(item.rate) && item.rate >= 0 && item.rate <= 10000000);
    if (!valid) throw new Error('Invalid draft format');
    const subtotal = round(draft.items.reduce((sum, item) => sum + round(item.qty * item.rate), 0));
    if (draft.discount.trim() === '' || draft.tax.trim() === '' || !Number.isFinite(Number(draft.discount)) || Number(draft.discount) < 0 || Number(draft.discount) > subtotal || !Number.isFinite(Number(draft.tax)) || Number(draft.tax) < 0 || Number(draft.tax) > 100) throw new Error('Invalid draft pricing');
    items = draft.items;
    for (const [id, key] of [['quote-type', 'type'], ['quote-client', 'client'], ['quote-project', 'project'], ['quote-ref', 'reference'], ['discount', 'discount'], ['tax', 'tax']]) byId(id).value = draft[key];
    renderItems();
    byId('quote-status').textContent = 'Demo draft loaded from this browser.';
  } catch (error) {
    console.error('EVR demo draft load failed', error);
    byId('quote-status').textContent = 'Could not load this demo draft. The stored data is invalid or unavailable.';
  }
});
function buildQuote() {
  const sum = totals();
  if (!sum) { updateTotals(); return; }
  const fields = [['pdf-ref', 'quote-ref'], ['pdf-client', 'quote-client'], ['pdf-project', 'quote-project']];
  if (fields.some(([, source]) => !byId(source).value.trim())) {
    byId('quote-status').textContent = 'Enter a client name, project and quotation reference before previewing.';
    return;
  }
  for (const [target, source] of fields) byId(target).textContent = byId(source).value;
  presentQuotation(items.filter(item => item.qty > 0), sum);
}
function presentQuotation(lines, sum, scope = [], notes = '') {
  const scopeOnly = sum === null;
  const headings = document.querySelector('#quote-document .pdf-table thead tr');
  headings.replaceChildren();
  for (const text of scopeOnly ? ['Requested scope & deliverables', 'Quantity'] : ['Scope & deliverables', 'Qty', 'Rate', 'Amount']) {
    const cell = document.createElement('th');
    cell.textContent = text;
    headings.append(cell);
  }
  document.querySelector('#quote-document .sample-stamp').textContent = scopeOnly ? 'QUOTE REQUEST / PRICING WILL BE DISCUSSED ON A CALL' : 'DEMONSTRATION ONLY / NOT VALID FOR BOOKING';
  document.querySelector('#quote-document .quote-top > div:last-child').firstChild.textContent = scopeOnly ? 'QUOTE REQUEST' : 'SAMPLE QUOTATION';
  document.querySelector('#quote-document .quote-bottom span').textContent = scopeOnly ? 'Requirements for discussion. No payment requested.' : 'Sample details and illustrative rates. No payment requested.';
  let detail = byId('pdf-scope');
  if (!detail) {
    detail = document.createElement('div');
    detail.id = 'pdf-scope';
    document.querySelector('#quote-document .pdf-table').before(detail);
  }
  detail.replaceChildren();
  for (const text of [...scope, notes].filter(Boolean)) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    detail.append(paragraph);
  }
  const rows = byId('pdf-rows');
  rows.replaceChildren();
  for (const item of lines) {
    const row = document.createElement('tr');
    for (const value of scopeOnly ? [item.name, item.qty] : [item.name, item.qty, money(item.rate), money(round(item.qty * item.rate))]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    rows.append(row);
  }
  const total = byId('pdf-total');
  total.replaceChildren();
  if (scopeOnly) {
    total.textContent = 'Pricing will be discussed on a call. EVR will confirm the scope and quotation after speaking with you.';
  } else {
    for (const text of [`Subtotal: ${money(sum.subtotal)}`, `Discount: ${money(sum.discount)} | Tax: ${money(sum.tax)}`]) {
      const line = document.createElement('div'); line.textContent = text; total.append(line);
    }
    const grand = document.createElement('strong'); grand.textContent = `Total: ${money(sum.total)}`; total.append(grand);
  }
  byId('quote-dialog').showModal();
}
byId('preview-quote').addEventListener('click', buildQuote);
byId('close-quote').addEventListener('click', () => byId('quote-dialog').close());
byId('print-quote').addEventListener('click', () => window.print());
const projectDetails = {
  wedding: { title: 'A celebration, remembered', image: 'wedding-scene.svg', brief: 'Example: document the people and moments across an agreed wedding celebration.', deliverables: 'Example: selected photographs, a wedding film and a teaser. Final scope supplied by EVR.' },
  prewedding: { title: 'Before the celebrations', image: 'wedding-scene.svg', brief: 'Example: create a relaxed pre-wedding story in a meaningful location, with the couple choosing a direction they feel comfortable with.', deliverables: 'Example: an agreed selection of edited photographs and an optional short film. Locations, permissions and travel confirmed separately.' },
  celebration: { title: 'The room comes alive', image: 'wedding-scene.svg', brief: 'Example: cover a family celebration, its performances and the people around them.', deliverables: 'Example: selected photographs and a highlights edit, with event hours and final formats agreed before booking.' },
  brand: { title: 'A brand, introduced', image: 'studio-scene.svg', brief: 'Example: introduce a business through a clear, focused brand story.', deliverables: 'Example: one brand film and short-form cutdowns in agreed formats.' },
  reels: { title: 'The detail that matters', image: 'studio-scene.svg', brief: 'Example: highlight the details and intended use of a product through a planned short-form shoot.', deliverables: 'Example: a scoped set of vertical edits with approved captions. Quantities, usage and formats agreed before production.' },
  podcast: { title: 'A conversation, captured', image: 'studio-scene.svg', brief: 'Example: record a conversation for an ongoing content series.', deliverables: 'Example: an edited episode and supporting short-form clips.' }
};
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
  const project = projectDetails[button.dataset.project];
  byId('project-title').textContent = project.title;
  byId('project-image').src = project.image;
  byId('project-brief').textContent = project.brief;
  byId('project-deliverables').textContent = project.deliverables;
  byId('project-dialog').showModal();
}));
byId('close-project').addEventListener('click', () => byId('project-dialog').close());
function estimate() {
  const days = byId('estimate-days').valueAsNumber;
  const outputs = byId('estimate-outputs').valueAsNumber;
  const valid = Number.isInteger(days) && days >= 1 && days <= 10 && Number.isInteger(outputs) && outputs >= 0 && outputs <= 20;
  byId('estimate-request').disabled = !valid;
  byId('estimate-status').textContent = valid ? '' : 'Enter 1-10 whole shoot days and 0-20 whole short edits.';
  const breakdown = byId('estimate-breakdown');
  breakdown.replaceChildren();
  if (!valid) return null;
  const lines = [
    ['Shoot days', String(days)],
    ['Main film edit', byId('estimate-film').value === 'yes' ? 'Requested' : 'Not requested'],
    ['Short edits', String(outputs)],
    ['Pricing', 'Discussed on a call']
  ];
  for (const [label, value] of lines) {
    const row = document.createElement('div');
    if (label === 'Pricing') row.className = 'grand';
    const title = document.createElement('dt'); title.textContent = label;
    const detail = document.createElement('dd'); detail.textContent = value;
    row.append(title, detail); breakdown.append(row);
  }
  return { days, outputs, type: byId('estimate-type').value };
}
for (const id of ['estimate-days', 'estimate-outputs', 'estimate-film']) byId(id).addEventListener('input', estimate);
byId('estimate-type').addEventListener('change', () => {
  const corporate = byId('estimate-type').value === 'corporate';
  byId('estimate-output-label').firstChild.textContent = corporate ? 'Short-form cutdowns' : 'Teaser edits';
  byId('estimate-outputs').value = corporate ? '3' : '1';
  estimate();
});
function initialiseMotion() {
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const revealTargetSelector = '.section-heading, .world, .home-projects>article, .service-overview>div, .four-steps>div, .estimate-invite, .service-hero, .faq details, .paper, .quote-summary, .date-enquiry, .agreement-grid>article, .client-voices, .team-section, .corp-reveal, .detail-reveal, .story-library>article';
  const revealTargets = document.querySelectorAll(revealTargetSelector);
  const textRevealTargets = Array.from(document.querySelectorAll('.route h2, .route h3, .route p, .route li'))
    .filter(element => element.textContent.trim() && !element.closest(`${revealTargetSelector}, .hero, .hero-story, .process-story, .chapter-story`));
  let revealObserver;
  function configureMotion() {
    if (revealObserver) revealObserver.disconnect();
    if (motionPreference.matches || !('IntersectionObserver' in window)) {
      revealTargets.forEach(element => element.classList.remove('reveal-ready', 'is-revealed'));
      textRevealTargets.forEach(element => element.classList.remove('text-reveal-ready', 'is-text-revealed'));
      return;
    }
    revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (entry.target.classList.contains('text-reveal-ready')) entry.target.classList.add('is-text-revealed');
          else entry.target.classList.add('is-revealed');
          revealObserver.unobserve(entry.target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    revealTargets.forEach(element => {
      const parent = element.parentElement;
      const staggered = parent.matches('.two-cards, .home-projects, .four-steps');
      const delay = staggered ? Array.from(parent.children).indexOf(element) * 75 : 0;
      element.style.setProperty('--reveal-delay', `${delay}ms`);
      element.classList.add('reveal-ready');
      revealObserver.observe(element);
    });
    const sectionDelays = new Map();
    textRevealTargets.forEach(element => {
      const section = element.closest('.route section') || element.closest('.route');
      const delay = Math.min((sectionDelays.get(section) || 0) * 45, 180);
      sectionDelays.set(section, (sectionDelays.get(section) || 0) + 1);
      element.style.setProperty('--text-reveal-delay', `${delay}ms`);
      element.classList.add('text-reveal-ready');
      revealObserver.observe(element);
    });
  }
  motionPreference.addEventListener('change', configureMotion);
  configureMotion();
  let progressPending = false;
  function updateScrollProgress() {
    const range = document.documentElement.scrollHeight - innerHeight;
    const value = range > 0 ? Math.min(1, Math.max(0, scrollY / range)) : 0;
    document.querySelector('.scroll-progress').style.transform = `scaleX(${value})`;
    progressPending = false;
  }
  window.addEventListener('scroll', () => {
    if (!progressPending) {
      progressPending = true;
      requestAnimationFrame(updateScrollProgress);
    }
  }, { passive: true });
  window.addEventListener('resize', updateScrollProgress);
  motionPreference.addEventListener('change', updateScrollProgress);
  window.addEventListener('hashchange', () => requestAnimationFrame(updateScrollProgress));
  updateScrollProgress();
}
byId('estimate-request').addEventListener('click', () => {
  const result = estimate();
  if (!result) return;
  byId('service').value = result.type === 'wedding' ? 'Wedding' : 'Corporate / content';
  const brief = document.querySelector('[name="brief"]');
  const summary = `Quote request for discussion: ${result.days} shoot day(s), ${result.outputs} short edit(s), main film edit ${byId('estimate-film').value}. Pricing will be discussed on a call. Please confirm the final scope.`;
  if (brief.value && !brief.value.startsWith('Quote request for discussion:')) {
    byId('estimate-status').textContent = 'Your existing brief has been kept. Discuss the requested scope with EVR on your call.';
  } else {
    brief.value = summary;
  }
  location.hash = '/request';
});
route();
renderItems();
estimate();
initialiseMotion();
