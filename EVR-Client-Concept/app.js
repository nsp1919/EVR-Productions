'use strict';
const byId = id => document.getElementById(id);
let activeExperience = 'home';
function enableVideoReplay(node) {
  if (node instanceof HTMLVideoElement) node.loop = true;
  if (node instanceof Element) node.querySelectorAll('video').forEach(video => { video.loop = true; });
}
document.querySelectorAll('video').forEach(enableVideoReplay);
new MutationObserver(records => {
  records.forEach(record => record.addedNodes.forEach(enableVideoReplay));
}).observe(document.documentElement, { childList: true, subtree: true });

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
  syncCelebrationFilm(activeRoute);
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
  document.title = activeRoute === 'studio'
    ? 'Private Quotation Studio | EVR Productions'
    : activeExperience === 'corporate' ? 'NBrands | EVR Productions' : 'Weddings & Functions | EVR Productions';
  document.querySelector('.experience-switch').dataset.active = activeExperience;
  document.querySelectorAll('[data-experience]').forEach(link => {
    if (link.dataset.experience === activeRoute) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-nav-experience]').forEach(menu => {
    menu.hidden = menu.dataset.navExperience !== activeExperience;
  });
  byId('main-nav').setAttribute('aria-label', activeExperience === 'corporate' ? 'NBrands navigation' : 'Weddings and Functions navigation');
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
const celebrationVideo = document.querySelector('#celebration-film video');
function syncCelebrationFilm(activeRoute) {
  if (!celebrationVideo) return;
  if (activeRoute !== 'weddings') {
    celebrationVideo.pause();
    return;
  }
  celebrationVideo.muted = true;
  const startPlayback = () => {
    if (byId('weddings').hidden) return;
    if (celebrationVideo.duration > 29 && celebrationVideo.currentTime < 29) {
      celebrationVideo.currentTime = 29;
    }
    celebrationVideo.play().catch(error => {
      console.warn('Wedding celebration film autoplay was blocked.', error);
    });
  };
  if (celebrationVideo.readyState >= HTMLMediaElement.HAVE_METADATA) startPlayback();
  else celebrationVideo.addEventListener('loadedmetadata', startPlayback, { once: true });
}
if (celebrationVideo) celebrationVideo.addEventListener('play', () => {
  if (celebrationVideo.currentTime < 29 && celebrationVideo.duration > 29) {
    celebrationVideo.currentTime = 29;
  }
});
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
const inquiryForm = byId('inquiry-form');
const inquiryStatus = byId('inquiry-status');
const enquirySendOptions = byId('enquiry-send-options');
const whatsappEnquiryLink = byId('send-enquiry-whatsapp');
const emailEnquiryLink = byId('send-enquiry-email');
inquiryForm.addEventListener('input', () => {
  enquirySendOptions.hidden = true;
  whatsappEnquiryLink.href = 'https://wa.me/919951718375';
  emailEnquiryLink.href = 'mailto:evrproductionss@gmail.com';
  inquiryStatus.textContent = '';
});
inquiryForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!inquiryForm.reportValidity()) return;
  const fields = new FormData(inquiryForm);
  const value = name => String(fields.get(name) || '').trim();
  const message = [
    'New EVR Productions website enquiry',
    '',
    `Service: ${inquiryForm.elements.service.selectedOptions[0].textContent.trim()}`,
    `Preferred date: ${value('date') || 'Not specified'}`,
    `Name: ${value('name')}`,
    `Phone: ${value('phone')}`,
    `Email: ${value('email')}`,
    `Brand / project: ${value('brand') || 'Not specified'}`,
    `Budget: ${inquiryForm.elements.budget.selectedOptions[0].textContent.trim()}`,
    `Location: ${value('location')}`,
    '',
    'What they would like to create:',
    value('brief')
  ].join('\n');
  const subject = `EVR project enquiry: ${value('name')}`;
  whatsappEnquiryLink.href = `https://wa.me/919951718375?text=${encodeURIComponent(message)}`;
  emailEnquiryLink.href = `mailto:evrproductionss@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  enquirySendOptions.hidden = false;
  inquiryStatus.textContent = 'Your enquiry is ready. Choose WhatsApp or email, review the message, then press Send to contact EVR.';
});
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
estimate();
initialiseMotion();
