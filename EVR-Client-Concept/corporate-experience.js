'use strict';

(() => {
  const corporate = document.getElementById('corporate');
  const services = document.getElementById('corp-services');
  const stage = services.querySelector('.corp-service-stage');
  const panels = Array.from(services.querySelectorAll('.corp-service-panel'));
  const buttons = Array.from(services.querySelectorAll('[data-corp-service]'));
  const meter = services.querySelector('.corp-service-meter i');
  const hero = corporate.querySelector('.corp-hero');
  const heroMedia = corporate.querySelector('.corp-hero-media');
  const heroBackground = corporate.querySelector('.corp-hero-bg video');
  const reels = corporate.querySelector('.corp-reel-section');
  const reelCards = Array.from(reels.querySelectorAll('[data-corp-reel]'));
  const funnelSteps = Array.from(corporate.querySelectorAll('[data-funnel-stage]'));
  const funnelPosition = corporate.querySelector('.corp-funnel-position');
  const header = document.querySelector('header');
  const ambientVideos = Array.from(corporate.querySelectorAll('.corp-hero-bg video'));
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.max(0, Math.min(1, value));
  let frame = 0;
  let current = -1;
  let currentFunnel = -1;

  corporate.querySelectorAll('.corp-reel-card img, .corp-work-card img').forEach(image => {
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
    const reelProgress = clamp((innerHeight - reels.getBoundingClientRect().top) / (innerHeight + reels.offsetHeight));
    reelCards.forEach(card => {
      const side = Number(card.dataset.corpReel);
      const rotation = innerWidth <= 700 ? 0 : side * (3 - reelProgress * 6);
      card.style.transform = `translateY(${(1 - reelProgress) * 16}px) rotate(${rotation}deg)`;
    });
    if (funnelSteps.length) {
      const viewportMiddle = innerHeight / 2;
      const active = funnelSteps.reduce((nearest, step, index) => {
        const distance = Math.abs(step.getBoundingClientRect().top + step.offsetHeight / 2 - viewportMiddle);
        return distance < nearest.distance ? { index, distance } : nearest;
      }, { index: 0, distance: Infinity }).index;
      if (active !== currentFunnel) {
        currentFunnel = active;
        funnelSteps.forEach((step, index) => {
          if (index === active) step.setAttribute('aria-current', 'step');
          else step.removeAttribute('aria-current');
          step.classList.toggle('is-current', index === active);
        });
        funnelPosition.textContent = `${String(active + 1).padStart(2, '0')} / ${['HOOK', 'NURTURE', 'CONVERT'][active]}`;
      }
    }
  }

  function requestRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function configure() {
    const canPin = !preference.matches && innerHeight >= (innerWidth <= 700 ? 740 : 700);
    services.classList.toggle('is-pinned', canPin);
    current = -1;
    if (preference.matches) {
      funnelSteps.forEach(step => step.classList.remove('is-current'));
      funnelPosition.textContent = '01 / HOOK · 02 / NURTURE · 03 / CONVERT';
      currentFunnel = -1;
    }
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
      reelCards.forEach(card => card.removeAttribute('style'));
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

  const reelDialog = document.getElementById('corp-reel-dialog');
  const reelDialogVideo = reelDialog.querySelector('video');
  const reelDialogStatus = reelDialog.querySelector('p');
  reelDialogVideo.muted = true;
  function stopReelPreview(card) {
    const video = card.querySelector('video');
    if (!video.hasAttribute('src')) return;
    video.pause();
    video.currentTime = 0;
    card.classList.remove('is-playing');
  }
  function startReelPreview(card) {
    if (preference.matches || !card.dataset.r2VideoUrl) return;
    const video = card.querySelector('video');
    video.muted = true;
    if (!video.hasAttribute('src')) {
      video.src = card.dataset.r2VideoUrl;
      video.load();
    }
    card.classList.add('is-playing');
    video.play().catch(() => {
      card.classList.remove('is-playing');
      card.title = 'Inline preview unavailable. Select to open the video player.';
    });
  }
  function openReel(card) {
    if (!card.dataset.r2VideoUrl) return;
    stopReelPreview(card);
    reelDialogVideo.pause();
    reelDialogVideo.removeAttribute('src');
    reelDialogVideo.replaceChildren();
    reelDialogVideo.src = card.dataset.r2VideoUrl;
    reelDialogVideo.poster = card.querySelector('img')?.currentSrc || '';
    reelDialogStatus.textContent = 'EVR-produced video served from Cloudflare R2.';
    reelDialog.showModal();
    reelDialogVideo.play().catch(() => {
      reelDialogStatus.textContent = 'Use the video controls to start the motion sample.';
    });
  }
  const reelVisibilityObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !corporate.hidden && !preference.matches && !document.hidden) {
        startReelPreview(entry.target);
      } else {
        stopReelPreview(entry.target);
      }
    });
  }, { threshold: .15, rootMargin: '100px' });
  reels.querySelectorAll('[data-reel-card]').forEach(card => {
    const video = card.querySelector('video');
    video.muted = true;
    video.playsInline = true;
    card.addEventListener('click', () => openReel(card));
    video.addEventListener('error', () => {
      card.classList.remove('is-playing');
      card.title = 'Motion preview unavailable. Select to check the video player.';
    });
  });
  reelCards.filter(card => card.dataset.r2VideoUrl).forEach(card => reelVisibilityObserver.observe(card));
  addEventListener('hashchange', () => {
    if (corporate.hidden) {
      reelCards.forEach(stopReelPreview);
    } else {
      reelCards.filter(card => card.dataset.r2VideoUrl).forEach(card => {
        reelVisibilityObserver.unobserve(card);
        reelVisibilityObserver.observe(card);
      });
    }
  });
  preference.addEventListener('change', () => {
    if (preference.matches) reelCards.forEach(stopReelPreview);
    else reelCards.filter(card => card.dataset.r2VideoUrl).forEach(card => {
      reelVisibilityObserver.unobserve(card);
      reelVisibilityObserver.observe(card);
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reelCards.forEach(stopReelPreview);
    else if (!corporate.hidden && !preference.matches) {
      reelCards.filter(card => card.dataset.r2VideoUrl).forEach(card => {
        reelVisibilityObserver.unobserve(card);
        reelVisibilityObserver.observe(card);
      });
    }
  });
  reelDialog.querySelector('[data-close-reel]').addEventListener('click', () => reelDialog.close());
  reelDialog.addEventListener('close', () => {
    reelDialogVideo.pause();
    reelDialogVideo.currentTime = 0;
  });
  reelDialogVideo.addEventListener('error', () => {
    reelDialogStatus.textContent = 'The selected video could not load. Check the media URL and storage access.';
  });

  const metrics = corporate.querySelector('.corp-metrics');
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

  const capabilities = corporate.querySelector('.corp-capabilities');
  const capabilityCount = capabilities.querySelector('[data-capability-count]');
  const capabilityCards = Array.from(capabilities.querySelectorAll('.corp-capability-grid article'));
  capabilityCards.forEach((card, index) => card.style.setProperty('--capability-index', String(index)));
  const revealCapabilities = () => {
    capabilities.classList.add('is-visible');
    capabilityCount.textContent = String(capabilityCards.length).padStart(2, '0');
  };
  if (!('IntersectionObserver' in window) || preference.matches) {
    revealCapabilities();
  } else {
    capabilities.classList.add('has-reveal');
    const capabilitiesObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      capabilitiesObserver.disconnect();
      capabilities.classList.add('is-visible');
      const target = Number(capabilityCount.dataset.countTarget);
      const started = performance.now();
      function animateCapabilityCount(now) {
        const progress = Math.min(1, (now - started) / 650);
        capabilityCount.textContent = String(Math.round(target * progress)).padStart(2, '0');
        if (progress < 1) requestAnimationFrame(animateCapabilityCount);
      }
      requestAnimationFrame(animateCapabilityCount);
    }, { threshold: .2 });
    capabilitiesObserver.observe(capabilities);
    preference.addEventListener('change', event => {
      if (event.matches) {
        capabilitiesObserver.disconnect();
        revealCapabilities();
      }
    });
  }
})();
