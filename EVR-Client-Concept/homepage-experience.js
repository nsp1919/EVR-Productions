'use strict';

(() => {
  const home = document.getElementById('home');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const process = document.getElementById('process-story');
  const stage = process.querySelector('.process-stage');
  const steps = Array.from(process.querySelectorAll('[data-process-step]'));
  const screens = Array.from(process.querySelectorAll('[data-phone-screen]'));
  const progressBar = process.querySelector('.process-progress span');
  const notice = document.getElementById('phone-notice-title');
  const phone = process.querySelector('.phone-shell');
  const notification = process.querySelector('.phone-notice');
  const updates = ['Brief prepared', 'Scope for discussion', 'Shoot plan prepared', 'First-cut review', 'Collection handover'];
  let selectedStep = -1;
  let processFrame = 0;
  const ease = value => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };

  function showStep(index) {
    if (selectedStep === index) return;
    selectedStep = index;
    process.dataset.step = String(index);
    steps.forEach((button, position) => {
      const active = position === index;
      button.parentElement.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      screens[position].hidden = !active;
    });
    notice.textContent = updates[index];
    progressBar.style.transform = `scaleX(${(index + 1) / steps.length})`;
  }

  function processBounds() {
    return {
      start: process.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(stage).top),
      travel: process.offsetHeight - stage.offsetHeight,
    };
  }

  function renderProcess() {
    processFrame = 0;
    if (home.hidden || !process.classList.contains('is-pinned')) return;
    const { start, travel } = processBounds();
    const progress = Math.max(0, Math.min(1, (scrollY - start) / travel));
    const position = progress * steps.length;
    const index = Math.min(steps.length - 1, Math.floor(position));
    const withinStep = Math.min(1, position - index);
    const blend = index < steps.length - 1 ? ease((withinStep - .72) / .28) : 0;
    showStep(index);
    process.dataset.progress = progress.toFixed(4);
    progressBar.style.transform = `scaleX(${progress})`;
    screens.forEach((screen, screenIndex) => {
      const outgoing = screenIndex === index;
      const incoming = screenIndex === index + 1;
      const opacity = outgoing ? 1 - blend : incoming ? blend : 0;
      screen.hidden = opacity === 0;
      screen.style.opacity = String(opacity);
      screen.style.transform = `translateY(${outgoing ? -blend * 14 : (1 - blend) * 18}px)`;
    });
    const strength = innerWidth <= 700 ? .55 : 1;
    phone.style.transform = `translateY(${-Math.sin(progress * Math.PI) * 8}px) rotateX(${(4 - progress * 7) * strength}deg) rotateY(${(-12 + progress * 24) * strength}deg) rotateZ(${(-2 + progress * 4) * strength}deg)`;
    phone.style.setProperty('--glint-x', `${-90 + progress * 180}%`);
    notification.style.transform = `translate(${(1 - ease(withinStep / .25)) * 22}px, ${Math.sin(progress * Math.PI * 2) * 12}px)`;
    notification.style.opacity = String(.55 + .45 * ease(withinStep / .25));
  }

  function requestProcessRender() {
    if (!processFrame) processFrame = requestAnimationFrame(renderProcess);
  }

  function configureProcess() {
    const canPin = !preference.matches && !(innerWidth <= 700 && innerHeight < 740);
    process.classList.toggle('is-pinned', canPin);
    if (!canPin) {
      phone.removeAttribute('style');
      notification.removeAttribute('style');
      screens.forEach((screen, index) => {
        screen.removeAttribute('style');
        screen.hidden = index !== selectedStep;
      });
      progressBar.style.transform = `scaleX(${(selectedStep + 1) / steps.length})`;
    }
    requestProcessRender();
  }

  steps.forEach((button, index) => button.addEventListener('click', () => {
    if (!process.classList.contains('is-pinned')) {
      showStep(index);
      return;
    }
    const { start, travel } = processBounds();
    scrollTo({ top: start + travel * ((index + .25) / steps.length), behavior: 'smooth' });
  }));
  process.classList.add('experience-ready');
  showStep(0);
  configureProcess();
  addEventListener('scroll', requestProcessRender, { passive: true });
  addEventListener('resize', configureProcess);
  addEventListener('hashchange', requestProcessRender);
  preference.addEventListener('change', configureProcess);

  const dateForm = document.getElementById('date-enquiry-form');
  const dateInput = document.getElementById('shoot-date');
  const dateService = document.getElementById('date-service');
  const dateStatus = document.getElementById('date-enquiry-status');
  const continueDate = document.getElementById('continue-date-enquiry');
  function setMinimumDate() {
    const today = new Date();
    dateInput.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  setMinimumDate();
  dateInput.addEventListener('focus', setMinimumDate);
  dateForm.addEventListener('input', () => {
    continueDate.hidden = true;
    dateStatus.textContent = '';
  });
  dateForm.addEventListener('submit', event => {
    event.preventDefault();
    setMinimumDate();
    if (!dateForm.reportValidity()) return;
    dateStatus.textContent = `Demo enquiry prepared for ${dateService.value} on ${dateInput.value}. Availability has not been checked. Nothing was sent or reserved.`;
    continueDate.hidden = false;
  });
  continueDate.addEventListener('click', () => {
    setMinimumDate();
    if (!dateForm.reportValidity()) return;
    document.getElementById('service').value = dateService.value;
    document.querySelector('#inquiry-form [name="date"]').value = dateInput.value;
    location.hash = '/request';
  });

  const players = [];
  let activePlayer;
  let mediaRequest = 0;
  function resetPlayer(player, restoreFocus = false) {
    player.video.pause();
    player.video.hidden = true;
    player.image.hidden = false;
    player.play.hidden = false;
    player.close.hidden = true;
    player.error.hidden = true;
    player.container.classList.remove('is-playing');
    if (restoreFocus) player.play.focus({ preventScroll: true });
  }
  function closeMedia() {
    mediaRequest += 1;
    players.forEach(player => resetPlayer(player));
    activePlayer = undefined;
  }
  const visibilityObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting && activePlayer?.container === entry.target) activePlayer.video.pause();
    });
  }, { threshold: .05 });
  document.querySelectorAll('[data-demo-media]').forEach(container => {
    const image = container.querySelector('img');
    const play = container.querySelector('.preview-play');
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'none';
    video.hidden = true;
    video.setAttribute('aria-label', 'Original illustrated motion demonstration, not EVR client footage');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'preview-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close motion sample');
    close.hidden = true;
    const error = document.createElement('p');
    error.className = 'media-error';
    error.setAttribute('role', 'status');
    error.hidden = true;
    container.append(video, close, error);
    const player = { container, image, play, video, close, error };
    players.push(player);
    visibilityObserver.observe(container);
    const reportError = message => {
      error.textContent = message;
      error.hidden = false;
    };
    video.addEventListener('error', () => {
      if (activePlayer === player) reportError('The local sample could not load. Keep the assets folder beside this website, then close and retry.');
    });
    play.disabled = false;
    play.addEventListener('click', async () => {
      closeMedia();
      const request = mediaRequest;
      activePlayer = player;
      if (!video.getAttribute('src')) video.src = `assets/demo-${container.dataset.demoMedia}.mp4`;
      image.hidden = true;
      play.hidden = true;
      video.hidden = false;
      close.hidden = false;
      container.classList.add('is-playing');
      close.focus({ preventScroll: true });
      try {
        await video.play();
      } catch (failure) {
        if (request !== mediaRequest) return;
        reportError(failure.name === 'NotAllowedError'
          ? 'Playback was blocked. Use the video play control to start the sample.'
          : 'This sample could not play. Close it and check that the complete local package is present.');
      }
    });
    close.addEventListener('click', () => {
      mediaRequest += 1;
      resetPlayer(player, true);
      if (activePlayer === player) activePlayer = undefined;
    });
  });
  addEventListener('hashchange', closeMedia);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && activePlayer) activePlayer.video.pause();
  });
})();
