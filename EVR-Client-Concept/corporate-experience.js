'use strict';

(() => {
  const corporate = document.getElementById('corporate');
  const services = corporate.querySelector('#corp-services');
  const stage = services.querySelector('.corp-service-stage');
  const panels = Array.from(services.querySelectorAll('.corp-service-panel'));
  const buttons = Array.from(services.querySelectorAll('[data-corp-service]'));
  const meter = services.querySelector('.corp-service-meter i');
  const hero = corporate.querySelector('.corp-hero');
  const heroMedia = corporate.querySelector('.corp-hero-media');
  const heroBackground = corporate.querySelector('.corp-hero-bg video');
  const finalVideo = corporate.querySelector('.corp-final-video');
  const header = document.querySelector('header');
  const ambientVideos = Array.from(corporate.querySelectorAll('[data-corp-ambient]'));
  const scrollRevealTargets = Array.from(corporate.querySelectorAll(
    '.corp-client-groups article, .corp-client-groups li, .corp-format-list li, .corp-work-card, .corp-video-story, .corp-production-band > div, .corp-delivery-map > *, .corp-proof > div, .corp-metric-grid article, .corp-final-content'
  ));
  const metrics = corporate.querySelector('.corp-metrics');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.max(0, Math.min(1, value));
  let frame = 0;
  let current = -1;
  let scrollRevealObserver;
  const revealIndexes = new Map();
  scrollRevealTargets.forEach(target => {
    const siblings = target.parentElement;
    const index = revealIndexes.get(siblings) || 0;
    target.classList.add('corp-scroll-reveal');
    target.style.setProperty('--corp-reveal-index', String(index));
    revealIndexes.set(siblings, index + 1);
  });
  corporate.querySelectorAll('.corp-reel-card img').forEach(image => {
    image.loading = 'lazy';
    image.decoding = 'async';
  });

  corporate.querySelectorAll('.corp-faq details').forEach(details => {
    const answer = details.querySelector('p');
    if (!answer) return;
    const wrapper = document.createElement('div');
    const content = document.createElement('div');
    wrapper.className = 'corp-faq-answer';
    content.append(answer);
    wrapper.append(content);
    details.append(wrapper);
  });

  function configureScrollReveals() {
    if (scrollRevealObserver) scrollRevealObserver.disconnect();
    if (preference.matches || !('IntersectionObserver' in window)) {
      corporate.classList.remove('corp-motion-ready');
      scrollRevealTargets.forEach(target => target.classList.add('is-visible'));
      return;
    }
    corporate.classList.add('corp-motion-ready');
    scrollRevealTargets.forEach(target => target.classList.remove('is-visible'));
    scrollRevealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        scrollRevealObserver.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -5% 0px' });
    scrollRevealTargets.forEach(target => scrollRevealObserver.observe(target));
  }

  function syncHeader() {
    header.classList.toggle('is-scrolled', document.body.classList.contains('corporate-view') && scrollY > 50);
  }

  function bounds() {
    return {
      start: services.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(stage).top),
      travel: services.offsetHeight - stage.offsetHeight,
    };
  }

  function select(index) {
    if (current === index) return;
    current = index;
    services.dataset.service = String(index);
    panels.forEach((panel, position) => {
      const active = position === index;
      if (!active && panel.contains(document.activeElement)) buttons[index].focus({ preventScroll: true });
      panel.classList.toggle('is-current', active);
      panel.inert = !active;
      panel.setAttribute('aria-hidden', String(!active));
      if (active) buttons[position].setAttribute('aria-current', 'true');
      else buttons[position].removeAttribute('aria-current');
    });
  }

  function render() {
    frame = 0;
    if (corporate.hidden || preference.matches) return;
    syncHeader();
    if (services.classList.contains('is-pinned')) {
      const { start, travel } = bounds();
      const progress = clamp((scrollY - start) / travel);
      const position = progress * (panels.length - 1);
      select(Math.round(position));
      services.dataset.progress = progress.toFixed(4);
      meter.style.transform = `scaleX(${progress})`;
      panels.forEach((panel, index) => {
        const distance = index - position;
        const artwork = panel.querySelector('.corp-service-art');
        artwork.style.transform = `translateY(${distance * 115}%) rotate(${distance * -7}deg) scale(${1 - Math.min(Math.abs(distance), 1) * .06})`;
        artwork.style.opacity = String(clamp(1.3 - Math.abs(distance)));
        panel.style.zIndex = String(5 - Math.abs(index - current));
        panel.querySelector('.corp-service-copy').style.transform = `translateY(${Math.abs(distance) * 12}px)`;
      });
    }
    const heroProgress = clamp(-hero.getBoundingClientRect().top / hero.offsetHeight);
    heroMedia.style.transform = `translateY(${heroProgress * -30}px) rotate(${3 - heroProgress * 6}deg)`;
    heroBackground.style.transform = `translateY(${heroProgress * 18}px) scale(${1 + heroProgress * .15})`;
    if (finalVideo) {
      const finalBounds = finalVideo.parentElement.getBoundingClientRect();
      const progress = clamp((innerHeight - finalBounds.top) / (innerHeight + finalBounds.height));
      finalVideo.style.setProperty('--corp-final-parallax', `${((.5 - progress) * 18).toFixed(1)}px`);
    }
  }

  function requestRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function configure() {
    const canPin = !preference.matches && innerHeight >= (innerWidth <= 700 ? 740 : 700);
    services.classList.toggle('is-pinned', canPin);
    current = -1;
    if (!canPin) {
      delete services.dataset.progress;
      delete services.dataset.service;
      meter.style.transform = 'scaleX(0)';
      panels.forEach(panel => {
        panel.inert = false;
        panel.removeAttribute('aria-hidden');
        panel.classList.remove('is-current');
        panel.removeAttribute('style');
        panel.querySelector('.corp-service-art').removeAttribute('style');
        panel.querySelector('.corp-service-copy').removeAttribute('style');
      });
      buttons.forEach(button => button.removeAttribute('aria-current'));
    }
    if (preference.matches) {
      heroMedia.removeAttribute('style');
      heroBackground.removeAttribute('style');
      if (finalVideo) finalVideo.style.removeProperty('--corp-final-parallax');
    }
    requestRender();
  }

  buttons.forEach((button, index) => {
    button.disabled = false;
    button.addEventListener('click', () => {
      if (services.classList.contains('is-pinned')) {
        const { start, travel } = bounds();
        scrollTo({ top: start + travel * index / (panels.length - 1), behavior: 'smooth' });
      } else {
        panels[index].scrollIntoView({ behavior: 'instant', block: 'start' });
        panels[index].tabIndex = -1;
        panels[index].focus({ preventScroll: true });
      }
    });
  });

  corporate.querySelectorAll('[data-corp-jump]').forEach(button => {
    button.disabled = false;
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.corpJump);
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: preference.matches ? 'instant' : 'smooth', block: 'start' });
    });
  });
  addEventListener('scroll', requestRender, { passive: true });
  addEventListener('scroll', syncHeader, { passive: true });
  addEventListener('resize', configure);
  addEventListener('hashchange', requestRender);
  addEventListener('hashchange', syncHeader);
  preference.addEventListener('change', configure);
  preference.addEventListener('change', configureScrollReveals);
  configureScrollReveals();
  configure();
  requestRender();

  const ambientObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const video = entry.target;
      if (!corporate.hidden && !preference.matches && entry.isIntersecting) {
        video.play().catch(() => { video.dataset.playback = 'unavailable'; });
      } else {
        video.pause();
      }
    });
  }, { threshold: .05 });
  ambientVideos.forEach(video => ambientObserver.observe(video));
  addEventListener('hashchange', () => {
    if (corporate.hidden) ambientVideos.forEach(video => video.pause());
  });
  preference.addEventListener('change', () => {
    if (preference.matches) ambientVideos.forEach(video => video.pause());
    else ambientVideos.forEach(video => {
      ambientObserver.unobserve(video);
      ambientObserver.observe(video);
    });
  });

  let metricsAnimated = false;
  const metricsObserver = new IntersectionObserver(entries => {
    if (metricsAnimated || !entries.some(entry => entry.isIntersecting)) return;
    metricsAnimated = true;
    metricsObserver.disconnect();
    const counters = Array.from(metrics.querySelectorAll('[data-count]'));
    const targets = counters.map(counter => Number(counter.dataset.count));
    if (preference.matches) {
      counters.forEach((counter, index) => { counter.textContent = String(targets[index]); });
      return;
    }
    const started = performance.now();
    function animateMetrics(now) {
      const progress = Math.min(1, (now - started) / 850);
      counters.forEach((counter, index) => {
        counter.textContent = String(Math.round(targets[index] * progress));
      });
      if (progress < 1) requestAnimationFrame(animateMetrics);
    }
    requestAnimationFrame(animateMetrics);
  }, { threshold: .35 });
  metricsObserver.observe(metrics);

})();
