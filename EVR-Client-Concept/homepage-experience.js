'use strict';

(() => {
  const home = document.getElementById('home');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const footerVideoObservers = new Map();
  window.syncFooterVideos = () => {
    document.querySelectorAll('.footer-film-video[data-src]').forEach(footerVideo => {
      const isInactive = footerVideo.closest('[data-footer-experience][hidden]');
      const existingObserver = footerVideoObservers.get(footerVideo);
      if (isInactive || preference.matches) {
        existingObserver?.disconnect();
        footerVideoObservers.delete(footerVideo);
        footerVideo.pause();
        return;
      }
      if (existingObserver) return;
      const startPlayback = () => {
        if (!footerVideo.src) {
          footerVideo.src = footerVideo.dataset.src;
          footerVideo.load();
          return;
        }
        footerVideo.play().catch(error => {
          console.warn('Footer background video playback was blocked.', error);
        });
      };
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
          if (!entries.some(entry => entry.isIntersecting)) return;
          observer.disconnect();
          footerVideoObservers.delete(footerVideo);
          startPlayback();
        }, { rootMargin: '200px' });
        footerVideoObservers.set(footerVideo, observer);
        observer.observe(footerVideo);
      } else {
        startPlayback();
      }
    });
  };
  window.syncFooterVideos();
  const process = document.getElementById('process-story');
  const stage = process.querySelector('.process-stage');
  const steps = Array.from(process.querySelectorAll('[data-process-step]'));
  const screens = Array.from(process.querySelectorAll('[data-phone-screen]'));
  const progressBar = process.querySelector('.process-progress span');
  const notice = document.getElementById('phone-notice-title');
  const phone = process.querySelector('.phone-shell');
  const notification = process.querySelector('.phone-notice');
  const updates = ['Share your brief', 'Agree coverage & terms', 'Plan the day with EVR', 'Review the first cut', 'Confirm final formats'];
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
    notification.style.transform = 'none';
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
  function setMinimumDate() {
    const today = new Date();
    dateInput.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  setMinimumDate();
  dateInput.addEventListener('focus', setMinimumDate);
  dateForm.addEventListener('submit', event => {
    event.preventDefault();
    setMinimumDate();
    if (!dateForm.reportValidity()) return;
    document.getElementById('service').value = dateService.value;
    document.querySelector('#inquiry-form [name="date"]').value = dateInput.value;
    dateStatus.textContent = 'Your occasion and preferred date have been added. Complete the form to contact EVR.';
    location.hash = '/request';
  });

  const filmSequences = Array.from(home.querySelectorAll('[data-film-sequence]'), root => ({
    root,
    track: root.querySelector('.film-sequence-track'),
    stage: root.querySelector('.film-sequence-stage'),
    panels: Array.from(root.querySelectorAll('[data-film-panel]')),
    position: root.querySelector('[data-sequence-position]'),
    progress: root.querySelector('.film-sequence-progress span'),
    frame: 0,
    activePanels: ''
  }));
  const halfSareeSequence = filmSequences.find(sequence => sequence.root.dataset.filmSequence === 'half-saree');
  let halfSareeRevealObserver;
  function configureHalfSareeMobileReveal() {
    const shouldReveal = Boolean(halfSareeSequence && innerWidth <= 560 && !preference.matches);
    if (!shouldReveal) {
      halfSareeRevealObserver?.disconnect();
      halfSareeRevealObserver = undefined;
      if (halfSareeSequence) {
        halfSareeSequence.root.classList.remove('has-scroll-reveal');
        halfSareeSequence.panels.forEach(panel => panel.removeAttribute('data-scroll-revealed'));
      }
      return;
    }
    if (halfSareeSequence.root.classList.contains('has-scroll-reveal')) return;
    halfSareeSequence.root.classList.add('has-scroll-reveal');
    halfSareeRevealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.scrollRevealed = 'true';
        halfSareeRevealObserver.unobserve(entry.target);
      });
    }, { threshold: .18, rootMargin: '0px 0px -8% 0px' });
    halfSareeSequence.panels.forEach(panel => {
      panel.dataset.scrollRevealed = 'false';
      halfSareeRevealObserver.observe(panel);
    });
  }
  const founderFacts = document.querySelectorAll('.founder-teaser-facts');
  if ('IntersectionObserver' in window) {
    founderFacts.forEach(facts => {
      const cards = Array.from(facts.querySelectorAll('article'));
      if (preference.matches) return;
      facts.classList.add('has-stat-reveal');
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const card = entry.target;
          card.classList.add('is-in-view');
          const number = card.querySelector('b');
          const match = number?.textContent.trim().match(/^(\d+)(.*)$/);
          observer.unobserve(card);
          if (!match) return;
          const target = Number(match[1]);
          const suffix = match[2];
          const duration = 1100;
          const startedAt = performance.now();
          number.textContent = `0${suffix}`;
          function countUp(now) {
            const progress = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - (1 - progress) ** 3;
            number.textContent = `${Math.round(target * eased)}${suffix}`;
            if (progress < 1) requestAnimationFrame(countUp);
          }
          requestAnimationFrame(countUp);
        });
      }, { threshold: .2 });
      cards.forEach(card => observer.observe(card));
    });
  }
  const portraitStories = home.querySelector('.portrait-stories');
  if (portraitStories && 'IntersectionObserver' in window) {
    portraitStories.classList.add('has-stagger-reveal');
    const portraitObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        portraitStories.classList.add('is-in-view');
        portraitObserver.unobserve(portraitStories);
      });
    }, { threshold: .12 });
    portraitObserver.observe(portraitStories);
  }
  const lyricalFilms = home.querySelector('.lyrical-films');
  const lyricalFilmCards = lyricalFilms?.querySelectorAll('.lyrical-film-feature');
  if (lyricalFilms && lyricalFilmCards?.length && 'IntersectionObserver' in window) {
    lyricalFilms.classList.add('has-film-reveal');
    const lyricalFilmObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in-view');
        lyricalFilmObserver.unobserve(entry.target);
      });
    }, { threshold: .12 });
    lyricalFilmCards.forEach(card => lyricalFilmObserver.observe(card));
  }
  let syncSequenceAutoplay = () => {};
  function renderFilmSequence(sequence) {
    sequence.frame = 0;
    if (home.hidden || !sequence.root.classList.contains('is-pinned')) return;
    const top = parseFloat(getComputedStyle(sequence.stage).top) || 0;
    const start = sequence.track.getBoundingClientRect().top + scrollY - top;
    const travel = Math.max(1, sequence.track.offsetHeight - sequence.stage.offsetHeight);
    const progress = Math.max(0, Math.min(1, (scrollY - start) / travel));
    const opposed = sequence.root.dataset.filmMotion === 'opposed';
    const sequencePosition = progress * Math.max(0, sequence.panels.length - 1);
    const active = opposed ? 0 : Math.min(sequence.panels.length - 1, Math.floor(sequencePosition));
    const transitionStart = .72;
    const transitionProgress = active === sequence.panels.length - 1
      ? 0
      : ease(Math.max(0, Math.min(1, (sequencePosition - active - transitionStart) / (1 - transitionStart))));
    const reveal = Math.max(0, Math.min(1, (progress - .04) / .76));
    const activeVideoIndexes = [];

    if (sequence.root.dataset.filmSequence === 'wedding') {
      const leftReveal = ease((progress - .02) / .2);
      const rightReveal = ease((progress - .18) / .2);
      sequence.root.style.setProperty('--wedding-title-left-opacity', String(leftReveal));
      sequence.root.style.setProperty('--wedding-title-left-offset', `${(1 - leftReveal) * -22}px`);
      sequence.root.style.setProperty('--wedding-title-right-opacity', String(rightReveal));
      sequence.root.style.setProperty('--wedding-title-right-offset', `${(1 - rightReveal) * 22}px`);
    }
    sequence.root.dataset.sequenceIndex = String(active);
    sequence.root.dataset.progress = progress.toFixed(4);
    if (sequence.position) {
      sequence.position.textContent = opposed
        ? `${String(Math.round(reveal * 100)).padStart(2, '0')}%`
        : `${String(active + 1).padStart(2, '0')} / ${String(sequence.panels.length).padStart(2, '0')}`;
    }
    if (sequence.progress) sequence.progress.style.transform = `scaleX(${opposed ? reveal : progress})`;
    sequence.panels.forEach((panel, index) => {
      if (opposed) {
        const direction = index === 0 ? -1 : 1;
        const opacity = reveal;
        panel.style.opacity = String(opacity);
        panel.style.transform = `translate(-50%, -50%) translateX(${direction * (1 - reveal) * 112}%)`;
        panel.dataset.active = String(reveal >= .65);
        panel.dataset.visible = String(opacity > .02);
        panel.inert = opacity <= .02;
        panel.setAttribute('aria-hidden', String(opacity <= .02));
      } else {
        const isOutgoing = index === active && active < sequence.panels.length - 1;
        const isIncoming = index === active + 1;
        const transitioning = transitionProgress > 0;
        const opacity = isOutgoing && transitioning
          ? 1 - transitionProgress
          : isIncoming && transitioning ? transitionProgress : Number(index === active);
        const horizontalTravel = isOutgoing ? -transitionProgress * 9 : 0;
        const scale = isIncoming && transitioning
          ? .97 + transitionProgress * .03
          : isOutgoing && transitioning ? 1 - transitionProgress * .01 : 1;
        if (opacity > .02) activeVideoIndexes.push(index);
        panel.style.opacity = String(opacity);
        panel.style.transform = `translate(-50%, -50%) translateX(${horizontalTravel}vw) scale(${scale})`;
        panel.style.zIndex = String(isIncoming && transitioning ? 2 : 1);
        panel.dataset.active = String(opacity > .02);
        panel.dataset.visible = String(opacity > .02);
        panel.inert = opacity <= .02;
        panel.setAttribute('aria-hidden', String(opacity <= .02));
      }
    });
    const activePanelKey = activeVideoIndexes.join(',');
    if (sequence.activePanels !== activePanelKey) {
      sequence.activePanels = activePanelKey;
      syncSequenceAutoplay(sequence);
    }
  }
  function scheduleFilmSequence(sequence) {
    if (sequence.frame) return;
    sequence.frame = requestAnimationFrame(() => renderFilmSequence(sequence));
  }
  function configureFilmSequences() {
    const canPin = !preference.matches && innerHeight >= 620;
    configureHalfSareeMobileReveal();
    filmSequences.forEach(sequence => {
      const shouldPin = canPin
        && !(sequence.root.dataset.filmSequence === 'half-saree' && innerWidth <= 560);
      sequence.root.classList.toggle('is-pinned', shouldPin);
      sequence.root.style.setProperty('--film-count', String(sequence.panels.length));
      if (!shouldPin) {
        sequence.root.style.removeProperty('--wedding-title-left-opacity');
        sequence.root.style.removeProperty('--wedding-title-left-offset');
        sequence.root.style.removeProperty('--wedding-title-right-opacity');
        sequence.root.style.removeProperty('--wedding-title-right-offset');
        delete sequence.root.dataset.sequenceIndex;
        delete sequence.root.dataset.progress;
        if (sequence.position) sequence.position.textContent = `ALL ${String(sequence.panels.length).padStart(2, '0')} STORIES`;
        if (sequence.progress) sequence.progress.style.transform = 'scaleX(1)';
        sequence.panels.forEach(panel => {
          panel.inert = false;
          panel.removeAttribute('aria-hidden');
          panel.dataset.active = 'true';
          panel.dataset.visible = 'true';
          panel.removeAttribute('style');
        });
      } else {
        scheduleFilmSequence(sequence);
      }
    });
  }
  filmSequences.forEach(sequence => {
    sequence.panels.forEach((panel, index) => {
      panel.dataset.active = String(index === 0);
      panel.dataset.visible = String(index === 0 || sequence.root.dataset.filmMotion === 'opposed');
    });
  });
  configureFilmSequences();
  addEventListener('scroll', () => filmSequences.forEach(scheduleFilmSequence), { passive: true });
  addEventListener('resize', configureFilmSequences);
  addEventListener('hashchange', () => filmSequences.forEach(scheduleFilmSequence));
  preference.addEventListener('change', configureFilmSequences);

  const players = [];
  let activePlayer;
  let mediaRequest = 0;
  function audioIcon(muted) {
    return muted
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m17 9 5 6m0-6-5 6"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/></svg>';
  }
  function setPlayerMuted(player, muted) {
    if (!muted) {
      players.forEach(other => {
        if (other !== player) setPlayerMuted(other, true);
      });
    }
    player.video.muted = muted;
    player.container.classList.toggle('is-unmuted', !muted);
    player.audio.innerHTML = audioIcon(muted);
    player.audio.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
    player.audio.setAttribute('aria-pressed', String(!muted));
  }
  function togglePlayerMuted(player) {
    setPlayerMuted(player, !player.video.muted);
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function isSequencePanelVisible(player) {
    if (!player.sequencePanel || player.sequencePanel.dataset.active !== 'true') return false;
    const rect = player.container.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    return rect.width > 0 && rect.height > 0
      && (visibleWidth * visibleHeight) / (rect.width * rect.height) >= .15;
  }
  function canAutoplay(player) {
    const sequenceVisible = isSequencePanelVisible(player);
    return player.visible
      || (sequenceVisible && !document.hidden && !reducedMotion.matches
        && (!player.route || !player.route.hidden)
        && activePlayer !== player);
  }
  function canPlay(player) {
    return canAutoplay(player)
      && !document.hidden
      && !reducedMotion.matches
      && (!player.route || !player.route.hidden)
      && (!player.sequencePanel || player.sequencePanel.dataset.active === 'true')
      && activePlayer !== player;
  }
  function syncAutoplay(player) {
    if (canPlay(player)) {
      if (!player.video.getAttribute('src')) player.video.src = player.container.dataset.r2VideoUrl;
      if (player.video.paused) setPlayerMuted(player, true);
      player.image.hidden = true;
      player.video.hidden = false;
      player.video.controls = false;
      player.container.classList.add('is-autoplaying');
      player.audio.hidden = false;
      player.video.play().catch(() => {
        player.container.classList.remove('is-autoplaying');
        player.image.hidden = false;
        player.video.controls = false;
        player.play.hidden = false;
        player.audio.hidden = true;
      });
    } else {
      player.video.pause();
      player.container.classList.remove('is-autoplaying');
      player.video.controls = false;
      if (activePlayer !== player) {
        player.video.hidden = true;
        player.image.hidden = false;
        player.play.hidden = false;
        player.audio.hidden = true;
      }
    }
  }
  function syncAutoplayPlayers() {
    players.forEach(syncAutoplay);
  }
  syncSequenceAutoplay = sequence => {
    players.forEach(player => {
      if (sequence.panels.includes(player.sequencePanel)) syncAutoplay(player);
    });
  };
  function resetPlayer(player, restoreFocus = false) {
    player.video.pause();
    player.video.controls = false;
    setPlayerMuted(player, true);
    player.play.hidden = false;
    player.audio.hidden = true;
    player.close.hidden = true;
    player.error.hidden = true;
    player.container.classList.remove('is-playing');
    activePlayer = undefined;
    syncAutoplay(player);
    if (restoreFocus) player.play.focus({ preventScroll: true });
  }
  function closeMedia() {
    mediaRequest += 1;
    players.forEach(player => {
      player.video.pause();
      player.video.controls = false;
      setPlayerMuted(player, true);
      player.play.hidden = false;
      player.close.hidden = true;
      player.error.hidden = true;
      player.container.classList.remove('is-playing');
    });
    activePlayer = undefined;
    syncAutoplayPlayers();
  }
  const visibilityObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const player = players.find(candidate => candidate.container === entry.target);
      if (!player) return;
      player.visible = entry.isIntersecting && entry.intersectionRatio >= .15;
      syncAutoplay(player);
    });
  }, { threshold: [.15] });
  document.querySelectorAll('[data-demo-media]').forEach(container => {
    const image = container.querySelector('img');
    const play = container.querySelector('.preview-play');
    const video = document.createElement('video');
    video.controls = false;
    video.playsInline = true;
    video.preload = 'none';
    video.hidden = true;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.className = 'r2-autoplay-preview';
    if (image) video.poster = image.currentSrc || image.src;
    video.setAttribute('aria-label', container.dataset.r2VideoTitle
      ? `EVR video preview: ${container.dataset.r2VideoTitle}`
      : 'EVR video');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'preview-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close video');
    close.hidden = true;
    const audio = document.createElement('button');
    audio.type = 'button';
    audio.className = 'preview-audio-toggle';
    audio.innerHTML = audioIcon(true);
    audio.setAttribute('aria-label', 'Unmute video');
    audio.hidden = true;
    const error = document.createElement('p');
    error.className = 'media-error';
    error.setAttribute('role', 'status');
    error.hidden = true;
    container.append(video, close, audio, error);
    if (!container.dataset.r2VideoUrl) {
      play.disabled = true;
      play.setAttribute('aria-label', 'Video unavailable until an R2 video is assigned');
      video.remove();
      close.remove();
      audio.remove();
      error.remove();
      return;
    }
    const player = {
      container,
      image,
      play,
      video,
      close,
      audio,
      error,
      sequencePanel: container.closest('[data-film-panel]'),
      route: container.closest('.route'),
      visible: false
    };
    players.push(player);
    setPlayerMuted(player, true);
    visibilityObserver.observe(container);
    const reportError = message => {
      error.textContent = message;
      error.hidden = false;
    };
    video.addEventListener('error', () => {
      if (activePlayer === player) reportError('The Cloudflare R2 video could not load. Check the connection and public bucket access, then close and retry.');
    });
    play.disabled = false;
    play.addEventListener('click', async () => {
      closeMedia();
      const request = mediaRequest;
      activePlayer = player;
      if (!video.getAttribute('src')) video.src = container.dataset.r2VideoUrl;
      video.muted = true;
      video.controls = true;
      image.hidden = true;
      play.hidden = true;
      video.hidden = false;
      audio.hidden = false;
      container.classList.remove('is-autoplaying');
      close.hidden = false;
      play.hidden = true;
      container.classList.add('is-playing');
      close.focus({ preventScroll: true });
      try {
        setPlayerMuted(player, true);
        await video.play();
      } catch (failure) {
        if (request !== mediaRequest) return;
        setPlayerMuted(player, true);
        reportError(failure.name === 'NotAllowedError'
          ? 'Playback was blocked. Use the video play control to start the video.'
          : 'This video could not play. Check that the selected media is publicly accessible.');
      }
    });
    audio.addEventListener('click', () => togglePlayerMuted(player));
    close.addEventListener('click', () => {
      mediaRequest += 1;
      resetPlayer(player, true);
    });
  });
  addEventListener('hashchange', closeMedia);
  reducedMotion.addEventListener('change', syncAutoplayPlayers);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && activePlayer) activePlayer.video.pause();
    syncAutoplayPlayers();
  });
})();
