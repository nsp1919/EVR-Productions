'use strict';

(() => {
  const story = document.querySelector('.hero-story');
  const stage = story.querySelector('.hero-stage');
  const intro = story.querySelector('.hero-copy');
  const cards = Array.from(story.querySelectorAll('.scene-card'));
  const gallery = story.querySelector('.hero-art');
  const selectors = Array.from(story.querySelectorAll('.card-select'));
  const featureCard = story.querySelector('.scene-card[data-card="2"]');
  const featureVideo = featureCard.querySelector('video');
  const videoToggle = featureCard.querySelector('.hero-video-toggle');
  const selectionStatus = document.getElementById('card-selection-status');
  const cardSlots = [0, 1, 2];
  const statement = story.querySelector('.story-statement');
  const insights = story.querySelector('.story-insights');
  const insightCards = Array.from(insights.querySelectorAll('.insight-grid article'));
  const notes = story.querySelector('.story-notes');
  const noteCards = Array.from(notes.querySelectorAll('article'));
  const chapters = Array.from(story.querySelectorAll('[data-chapter]'));
  const meter = story.querySelector('.story-meter span');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const home = document.getElementById('home');
  let metrics;
  let frame = 0;
  let needsMeasure = true;
  let swapTimer;

  const clamp = value => Math.max(0, Math.min(1, value));
  const mix = (start, end, amount) => start + (end - start) * amount;
  const phase = (value, start, end) => {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  };
  function wrapWords(root, selector) {
    const words = [];
    root.querySelectorAll(selector).forEach(element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      textNodes.forEach(textNode => {
        const fragment = document.createDocumentFragment();
        for (const token of textNode.textContent.split(/(\s+)/)) {
          if (!token) continue;
          if (/^\s+$/.test(token)) {
            fragment.append(document.createTextNode(token));
            continue;
          }
          const word = document.createElement('span');
          word.className = 'scroll-word';
          word.textContent = token;
          words.push(word);
          fragment.append(word);
        }
        textNode.replaceWith(fragment);
      });
    });
    return words;
  }
  const insightWords = wrapWords(
    insights,
    '.eyebrow, h2, .insight-grid article > span, .insight-grid h3, .insight-grid p'
  );
  function revealWords(words, progress) {
    const position = progress * (words.length + 1);
    words.forEach((word, index) => {
      word.style.opacity = String(.88 + .12 * clamp(position - index));
    });
  }

  function audioIcon(muted) {
    return muted
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m17 9 5 6m0-6-5 6"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/></svg>';
  }
  function syncFeatureVideo() {
    if (!featureVideo) return;
    const isFront = featureCard.dataset.slot === '2';
    const shouldPlay = isFront && Number(story.dataset.progress || 0) < .16 && !home.hidden && document.visibilityState === 'visible';
    if (shouldPlay) {
      featureVideo.play().catch(() => {
        videoToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m8 5 11 7-11 7V5Z"/></svg>';
        videoToggle.setAttribute('aria-label', featureVideo.muted ? 'Play featured video muted' : 'Play featured video with sound');
      });
    } else {
      featureVideo.pause();
      if (!isFront && !featureVideo.muted) featureVideo.muted = true;
    }
    videoToggle.innerHTML = featureVideo.paused
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m8 5 11 7-11 7V5Z"/></svg>'
      : audioIcon(featureVideo.muted);
    videoToggle.setAttribute('aria-label', featureVideo.paused
      ? (featureVideo.muted ? 'Play featured video muted' : 'Play featured video with sound')
      : featureVideo.muted ? 'Unmute featured video' : 'Mute featured video');
    videoToggle.setAttribute('aria-pressed', String(!featureVideo.muted));
  }

  function updateCardControls(enabled) {
    story.classList.toggle('can-select-cards', enabled);
    selectors.forEach((button, index) => {
      button.disabled = !enabled;
      button.setAttribute('aria-pressed', String(cardSlots[index] === 2));
      cards[index].dataset.slot = String(cardSlots[index]);
    });
    gallery.setAttribute('aria-hidden', String(!enabled));
    syncFeatureVideo();
  }

  function finishSwap() {
    clearTimeout(swapTimer);
    story.classList.remove('is-switching-card');
  }

  selectors.forEach((button, index) => button.addEventListener('click', () => {
    if (button.disabled || cardSlots[index] === 2) return;
    const previousFront = cardSlots.indexOf(2);
    const previousSlot = cardSlots[index];
    cardSlots[index] = 2;
    cardSlots[previousFront] = previousSlot;
    finishSwap();
    story.classList.add('is-switching-card');
    updateCardControls(true);
    selectionStatus.textContent = `${cards[index].querySelector('figcaption').textContent} is now in front.`;
    requestRender();
    swapTimer = setTimeout(finishSwap, 650);
  }));
  if (featureVideo && videoToggle) {
    videoToggle.addEventListener('click', async event => {
      event.stopPropagation();
      if (featureVideo.paused) {
        try {
          await featureVideo.play();
        } catch {
          videoToggle.textContent = 'Play video';
          videoToggle.setAttribute('aria-label', 'Play featured video');
          return;
        }
        if (featureVideo.muted) featureVideo.muted = false;
      } else {
        featureVideo.muted = !featureVideo.muted;
      }
      syncFeatureVideo();
    });
    featureVideo.addEventListener('play', syncFeatureVideo);
    featureVideo.addEventListener('pause', syncFeatureVideo);
    featureVideo.addEventListener('volumechange', syncFeatureVideo);
    document.addEventListener('visibilitychange', syncFeatureVideo);
  }
  window.syncHomeHeroVideo = syncFeatureVideo;

  function measure() {
    const rect = stage.getBoundingClientRect();
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    metrics = {
      width: rect.width,
      height: rect.height,
      start: story.getBoundingClientRect().top + scrollY - top,
      travel: Math.max(1, story.offsetHeight - stage.offsetHeight),
      mobile: innerWidth <= 700,
    };
    needsMeasure = false;
  }

  function render() {
    frame = 0;
    if (home.hidden || !story.classList.contains('is-animated')) return;
    if (needsMeasure) measure();
    const { width, height, start, travel, mobile } = metrics;
    const progress = clamp((scrollY - start) / travel);
    const gather = phase(progress, 0.015, 0.21);
    const expand = phase(progress, 0.20, 0.49);
    const depart = phase(progress, 0.50, 0.61);
    const introExit = phase(progress, 0.02, 0.18);
    const statementIn = phase(progress, 0.30, 0.46);
    const statementOut = phase(progress, 0.50, 0.59);
    const insightIn = phase(progress, 0.54, 0.60);
    const insightOut = phase(progress, 0.76, 0.82);
    const notesIn = phase(progress, 0.76, 0.81);
    updateCardControls(progress < .16);
    revealWords(insightWords, phase(progress, .60, .76));

    story.dataset.progress = progress.toFixed(4);
    story.dataset.phase = progress < .24 ? 'intro' : progress < .56 ? 'stories' : progress < .72 ? 'perspective' : 'notes';
    syncFeatureVideo();
    intro.style.opacity = String(1 - introExit);
    intro.style.transform = mobile
      ? `translateY(${-introExit * 42}px)`
      : `translate(-${introExit * 30}px, calc(-50% - ${introExit * 55}px))`;
    intro.inert = introExit > 0.95;
    intro.setAttribute('aria-hidden', String(introExit > 0.95));

    const initialX = mobile ? [.33, .68, .5, .45, .55, .5] : [.68, .84, .76, .73, .77, .75];
    const initialY = mobile ? [.72, .72, .69, .69, .69, .69] : [.47, .49, .44, .45, .45, .45];
    const spreadX = mobile ? [.18, .5, .82, .18, .5, .82] : [.12, .5, .88, .13, .5, .87];
    const spreadY = mobile ? [.18, .13, .18, .73, .79, .73] : [.20, .18, .21, .72, .75, .72];
    const initialAngle = [-12, 11, -1, 7, -6, 3];
    const finalAngle = [-9, 4, 10, 8, -5, -9];
    const stackedX = [.44, .56, .5, .48, .52, .5];
    const stackedY = [.51, .51, .48, .43, .45, .46];
    cards.forEach((card, index) => {
      const slot = index < 3 ? cardSlots[index] : index;
      const stacked = mix(initialX[slot], stackedX[slot], gather);
      const x = mix(stacked, spreadX[index], expand);
      const y = mix(mix(initialY[slot], stackedY[slot], gather), spreadY[index], expand);
      const scale = mix(slot === 2 ? 1 : .88, mobile ? .67 : .68, expand) * mix(1, 1.08, depart);
      const angle = mix(initialAngle[slot], finalAngle[index], expand);
      const outwardX = (spreadX[index] - .5) * width * .28 * depart;
      const outwardY = (spreadY[index] - .48) * height * .32 * depart;
      card.style.left = '0';
      card.style.top = '0';
      card.style.transform = `translate3d(${x * width + outwardX}px, ${y * height + outwardY}px, 0) translate(-50%, -50%) rotate(${angle}deg) scale(${scale})`;
      card.style.opacity = String((index < 3 ? 1 : phase(progress, .12 + index * .012, .28 + index * .012)) * (1 - depart));
    });

    statement.style.opacity = String(statementIn * (1 - statementOut));
    statement.style.transform = `translate(-50%, calc(-50% + ${(1 - statementIn) * 35 - statementOut * 65}px)) scale(${mix(.95, 1, statementIn)})`;
    insights.style.opacity = String(insightIn * (1 - insightOut));
    insights.style.transform = `translateY(${(1 - insightIn) * 45 - insightOut * 60}px)`;
    insights.setAttribute('aria-hidden', String(insightIn < .95 || insightOut > .05));
    insightCards.forEach((card, index) => {
      const arrival = phase(progress, .61 + index * .08, .67 + index * .07);
      const direction = index === 0 ? -1 : 1;
      const offset = Math.min(260, width * .3);
      card.style.opacity = String(arrival);
      card.style.transform = `translate3d(${direction * (1 - arrival) * offset}px, ${(1 - arrival) * 22}px, 0)`;
    });
    notes.style.opacity = String(notesIn);
    notes.setAttribute('aria-hidden', String(notesIn < .95));
    noteCards.forEach((card, index) => {
      const arrival = phase(progress, .81 + index * .04, .84 + index * .04);
      card.style.opacity = String(arrival);
      card.style.transform = `translateY(${(1 - arrival) * (65 + index * 20)}px)`;
    });
    chapters.forEach((chapter, index) => {
      chapter.classList.toggle('current', index === (progress < .24 ? 0 : progress < .86 ? 1 : 2));
    });
    meter.style.transform = `scaleX(${progress})`;
  }

  function requestRender(measureAgain = false) {
    needsMeasure = needsMeasure || measureAgain;
    if (!frame) frame = requestAnimationFrame(render);
  }

  function configure() {
    finishSwap();
    const enabled = !preference.matches && !(innerWidth <= 700 && innerHeight < 700);
    story.classList.toggle('is-animated', enabled);
    if (!enabled) {
      for (const element of [intro, ...cards, statement, insights, ...insightCards, notes, ...noteCards, meter]) element.removeAttribute('style');
      insights.setAttribute('aria-hidden', 'true');
      notes.setAttribute('aria-hidden', 'true');
      intro.inert = false;
      intro.removeAttribute('aria-hidden');
      story.dataset.progress = '0';
      story.dataset.phase = 'static';
      chapters.forEach((chapter, index) => chapter.classList.toggle('current', index === 0));
      updateCardControls(true);
    }
    requestRender(true);
  }

  document.getElementById('skip-hero').addEventListener('click', () => {
    const target = document.getElementById('home-services');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: preference.matches ? 'auto' : 'smooth', block: 'start' });
  });
  addEventListener('scroll', () => {
    finishSwap();
    requestRender();
  }, { passive: true });
  addEventListener('resize', configure);
  addEventListener('hashchange', () => requestRender(true));
  addEventListener('load', () => requestRender(true));
  preference.addEventListener('change', configure);
  new ResizeObserver(() => requestRender(true)).observe(stage);
  configure();
})();
