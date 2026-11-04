'use strict';
const byId = id => document.getElementById(id);
let activeExperience = 'home';
const viewportAutoplayPreference = matchMedia('(prefers-reduced-motion: reduce)');
let viewportAutoplayObserver;
const siteHeader = document.querySelector('header');

function syncPinnedHeaderOffset() {
  if (innerWidth > 700) {
    document.documentElement.style.removeProperty('--mobile-pinned-top');
    return;
  }
  const headerTop = Number.parseFloat(getComputedStyle(siteHeader).top) || 0;
  document.documentElement.style.setProperty(
    '--mobile-pinned-top',
    `${Math.ceil(siteHeader.offsetHeight + headerTop + 8)}px`
  );
}

new ResizeObserver(syncPinnedHeaderOffset).observe(siteHeader);
window.addEventListener('resize', syncPinnedHeaderOffset);
window.visualViewport?.addEventListener('resize', syncPinnedHeaderOffset);
syncPinnedHeaderOffset();

function syncViewportAutoplay(video) {
  const route = video.closest('.route');
  const rect = video.getBoundingClientRect();
  const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
  const isVisible = rect.width > 0 && rect.height > 0 &&
    (visibleWidth * visibleHeight) / (rect.width * rect.height) >= 0.15;
  if (isVisible && !route?.hidden && !document.hidden) {
    let sourceAssigned = false;
    if (video.dataset.src && !video.getAttribute('src')) {
      video.src = video.dataset.src;
      video.removeAttribute('data-src');
      sourceAssigned = true;
    }
    video.querySelectorAll('source[data-src]').forEach(source => {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
      sourceAssigned = true;
    });
    if (sourceAssigned) video.load();
  }
  if (isVisible && !route?.hidden && !document.hidden && !viewportAutoplayPreference.matches) {
    video.muted = true;
    video.play().catch(error => {
      if (isVisible && !route?.hidden) console.warn('Visible section video autoplay was blocked.', error);
    });
  } else {
    video.pause();
  }
}

function syncViewportAutoplayVideos() {
  document.querySelectorAll('video[data-viewport-autoplay]').forEach(syncViewportAutoplay);
}

window.syncViewportAutoplayVideos = syncViewportAutoplayVideos;
if ('IntersectionObserver' in window) {
  viewportAutoplayObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target instanceof HTMLVideoElement) syncViewportAutoplay(entry.target);
    });
  }, { threshold: [0, 0.15] });
  document.querySelectorAll('video[data-viewport-autoplay]').forEach(video => viewportAutoplayObserver.observe(video));
}
window.addEventListener('scroll', () => requestAnimationFrame(syncViewportAutoplayVideos), { passive: true });
document.addEventListener('visibilitychange', syncViewportAutoplayVideos);
viewportAutoplayPreference.addEventListener('change', syncViewportAutoplayVideos);

function enableVideoReplay(node) {
  if (node instanceof HTMLVideoElement) node.loop = true;
  if (node instanceof Element) node.querySelectorAll('video').forEach(video => { video.loop = true; });
  if (node instanceof HTMLVideoElement && node.matches('[data-viewport-autoplay]')) {
    viewportAutoplayObserver?.observe(node);
    syncViewportAutoplay(node);
  }
  if (node instanceof Element) node.querySelectorAll('video[data-viewport-autoplay]').forEach(video => {
    viewportAutoplayObserver?.observe(video);
    syncViewportAutoplay(video);
  });
}
document.querySelectorAll('video').forEach(enableVideoReplay);
new MutationObserver(records => {
  records.forEach(record => record.addedNodes.forEach(enableVideoReplay));
}).observe(document.documentElement, { childList: true, subtree: true });

function route() {
  const requested = location.hash.replace(/^#\/?/, '') || 'home';
  const target = document.querySelectorAll('.route');
  const pathIsAdmin = /^\/admin\/?$/.test(location.pathname);
  const valid = Array.from(target).some(section => section.id === requested);
  const isAdmin = requested === 'admin' || pathIsAdmin;
  const canPreviewAdminPage = window.adminAuthenticated === true;
  const activeRoute = isAdmin ? (window.adminPreviewPage || 'home') : valid ? requested : 'home';
  byId('admin-editor').hidden = !isAdmin;
  document.body.classList.toggle('admin-active', isAdmin);
  document.body.classList.toggle('admin-locked', isAdmin && !canPreviewAdminPage);
  if (!isAdmin) document.documentElement.classList.remove('admin-route-pending');
  if (!isAdmin) {
    document.querySelectorAll('[data-admin-text-edited="true"]').forEach(element => {
      element.contentEditable = 'false';
    });
  }
  for (const section of target) {
    section.hidden = section.id !== activeRoute || (isAdmin && !canPreviewAdminPage);
  }
  if (typeof window.syncCorporateBackgroundVideos === 'function') {
    window.syncCorporateBackgroundVideos(activeRoute);
  }
  syncViewportAutoplayVideos();
  syncCelebrationFilm(activeRoute);
  syncBrandWorkCaseStudyVideo(activeRoute);
  if (typeof window.syncHomeHeroVideo === 'function') window.syncHomeHeroVideo();
  const page = byId(activeRoute);
  if (typeof window.applyAdminEdits === 'function') window.applyAdminEdits();
  const savedExperience = history.state && history.state.evrExperience;
  if (page.dataset.experienceOwner) activeExperience = page.dataset.experienceOwner;
  else if (activeRoute === 'corporate') activeExperience = 'corporate';
  else if (activeRoute === 'home' || activeRoute === 'weddings') activeExperience = 'home';
  else if (savedExperience === 'home' || savedExperience === 'corporate') activeExperience = savedExperience;
  history.replaceState({ ...history.state, evrExperience: activeExperience }, '');
  document.body.classList.toggle('corporate-view', activeExperience === 'corporate');
  document.querySelectorAll('[data-footer-experience]').forEach(footerSection => {
    footerSection.hidden = footerSection.dataset.footerExperience !== activeExperience;
  });
  document.querySelector('.site-credit .footer-back-top').href = activeExperience === 'corporate' ? '#/corporate' : '#/home';
  if (typeof window.syncFooterVideos === 'function') window.syncFooterVideos();
  document.title = activeRoute === 'admin'
    ? 'EVR Studio | EVR Productions'
    : activeRoute === 'studio'
      ? 'Private Quotation Studio | EVR Productions'
    : activeExperience === 'corporate' ? 'Brand Production | EVR Productions' : 'Weddings & Events | EVR Productions';
  document.querySelector('.experience-switch').dataset.active = activeExperience;
  document.querySelectorAll('[data-experience]').forEach(link => {
    if (link.dataset.experience === activeRoute) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-nav-experience]').forEach(menu => {
    menu.hidden = menu.dataset.navExperience !== activeExperience;
  });
  byId('main-nav').setAttribute('aria-label', activeExperience === 'corporate' ? 'Brand Production navigation' : 'Weddings and Events navigation');
  byId('main-nav').querySelectorAll('a').forEach(link => {
    if (link.hash === '#/' + activeRoute) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  byId('main-nav').classList.remove('is-open');
  byId('menu-toggle').setAttribute('aria-expanded', 'false');
  requestAnimationFrame(() => {
    syncPinnedHeaderOffset();
    window.scrollTo(0, 0);
  });
}
window.addEventListener('hashchange', route);
window.addEventListener('load', () => requestAnimationFrame(() => window.scrollTo(0, 0)));
const celebrationVideo = document.querySelector('#celebration-film video');
const caseStudyVideo = document.querySelector('#brand-work .detail-split video');
function syncCelebrationFilm(activeRoute) {
  if (!celebrationVideo) return;
  if (activeRoute !== 'weddings') {
    celebrationVideo.pause();
    return;
  }
  celebrationVideo.muted = true;
  syncViewportAutoplay(celebrationVideo);
}
function syncBrandWorkCaseStudyVideo(activeRoute) {
  if (!caseStudyVideo) return;
  if (activeRoute !== 'brand-work') {
  caseStudyVideo.pause();
  return;
  }
  caseStudyVideo.muted = true;
  syncViewportAutoplay(caseStudyVideo);
}
if (celebrationVideo) celebrationVideo.addEventListener('play', () => {
  if (celebrationVideo.currentTime < 29 && celebrationVideo.duration > 29) {
    celebrationVideo.currentTime = 29;
  }
});
byId('menu-toggle').addEventListener('click', () => {
  const open = byId('main-nav').classList.toggle('is-open');
  byId('menu-toggle').setAttribute('aria-expanded', String(open));
  requestAnimationFrame(syncPinnedHeaderOffset);
});
document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
  byId('service').value = link.dataset.service;
}));
document.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('[data-filter]') : null;
  if (!button) return;
  const gallery = button.closest('.route');
  if (!gallery) return;
  gallery.querySelectorAll('[data-filter]').forEach(item => {
    item.classList.toggle('active', item === button);
    item.setAttribute('aria-pressed', String(item === button));
  });
  gallery.querySelectorAll('[data-category]').forEach(item => {
    item.hidden = button.dataset.filter !== 'all' && item.dataset.category !== button.dataset.filter;
  });
});
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
  const emailSubject = `Project enquiry | ${value('name')}`;
  const emailBody = [
    'Hello EVR Productions,',
    '',
    'I would like to discuss a project with your team. Here are the details:',
    '',
    'PROJECT OVERVIEW',
    `Service: ${inquiryForm.elements.service.selectedOptions[0].textContent.trim()}`,
    `Preferred date: ${value('date') || 'Flexible / not specified'}`,
    `Brand or project: ${value('brand') || 'Not specified'}`,
    `Location: ${value('location')}`,
    `Budget: ${inquiryForm.elements.budget.selectedOptions[0].textContent.trim()}`,
    '',
    'ABOUT ME',
    `Name: ${value('name')}`,
    `Phone: ${value('phone')}`,
    `Email: ${value('email')}`,
    '',
    'PROJECT DETAILS',
    value('brief'),
    '',
    'Please let me know a convenient time to discuss the scope, availability, and next steps. I understand that final pricing and availability will be confirmed with your team.',
    '',
    'Thank you,',
    value('name')
  ].join('\n');
  whatsappEnquiryLink.href = `https://wa.me/919951718375?text=${encodeURIComponent(message)}`;
  emailEnquiryLink.href = `mailto:evrproductionss@gmail.com?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  enquirySendOptions.hidden = false;
  inquiryStatus.textContent = 'Your enquiry is ready. Choose WhatsApp or email, review the message, then press Send to contact EVR.';
});
const projectDetails = {
  wedding: { title: 'A celebration, remembered', image: 'assets/wedding-couple-portrait.jpg', imageAlt: 'Bride and groom in traditional wedding attire, standing together', brief: 'Plan coverage around the people, rituals and moments that matter to you.', deliverables: 'Discuss photography, a wedding film and any requested edits with EVR. Final scope is confirmed before booking.' },
  prewedding: { title: 'Before the celebrations', image: 'assets/wedding-pre-ceremony-couple.jpg', imageAlt: 'Bride and groom sharing a quiet moment together before the celebration', brief: 'Share a setting and direction that feel personal to you for a relaxed pre-wedding story.', deliverables: 'Discuss edited photographs and any requested film. Locations, permissions and travel are confirmed separately.' },
  celebration: { title: 'The room comes alive', image: 'assets/wedding-family-hug.jpg', imageAlt: 'A bride embraces a family member during an emotional wedding moment', brief: 'Plan coverage around the celebration, its performances and the people around you.', deliverables: 'Discuss selected photographs and a highlights edit with EVR. Event hours and final formats are agreed before booking.' },
  brand: { title: 'A brand, introduced', image: 'studio-scene.svg', brief: 'Introduce your business through a clear, focused brand story.', deliverables: 'Discuss a brand film and any short-form cutdowns in the agreed formats.' },
  reels: { title: 'The detail that matters', image: 'studio-scene.svg', brief: 'Highlight the details and intended use of your product through a planned short-form shoot.', deliverables: 'Discuss vertical edits and approved captions. Quantities, usage and formats are agreed before production.' },
  podcast: { title: 'A conversation, captured', image: 'studio-scene.svg', brief: 'Plan a conversation for a one-off recording or an ongoing content series.', deliverables: 'Discuss an edited episode and any supporting short-form clips.' }
};
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
  const project = projectDetails[button.dataset.project];
  byId('project-title').textContent = project.title;
  byId('project-image').src = project.image;
  byId('project-image').alt = project.imageAlt || 'EVR wedding coverage';
  byId('project-brief').textContent = project.brief;
  byId('project-deliverables').textContent = project.deliverables;
  byId('project-dialog').showModal();
}));
byId('close-project').addEventListener('click', () => byId('project-dialog').close());
function initialiseMotion() {
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const revealTargetSelector = '.section-heading, .world, .home-projects>article, .service-overview>div, .four-steps>div, .estimate-invite, .service-hero, .faq details, .paper, .date-enquiry, .agreement-grid>article, .client-voices, .team-section, .corp-reveal, .detail-reveal, .story-library>article';
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
route();
initialiseMotion();
