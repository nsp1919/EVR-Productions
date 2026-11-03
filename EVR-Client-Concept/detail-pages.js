'use strict';

(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.max(0, Math.min(1, value));
  const scenes = Array.from(document.querySelectorAll('[data-chapter-story]'), root => ({
    root,
    page: root.closest('.route'),
    stage: root.querySelector('.chapter-stage'),
    panels: Array.from(root.querySelectorAll('.chapter-panel')),
    buttons: Array.from(root.querySelectorAll('[data-story-step]')),
    meter: root.querySelector('.chapter-meter i'),
    position: root.querySelector('.chapter-position'),
    current: -1,
  }));
  const pages = Array.from(document.querySelectorAll('.detail-page'), page => {
    return {
      page,
      media: Array.from(page.querySelectorAll('[data-drift]')),
      headings: Array.from(page.querySelectorAll('[data-scroll-underline]')),
    };
  });
  const scrollWheels = Array.from(document.querySelectorAll('[data-scroll-wheel]'));
  let frame = 0;

  function bounds(scene) {
    return {
      start: scene.root.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(scene.stage).top),
      travel: scene.root.offsetHeight - scene.stage.offsetHeight,
    };
  }
  function select(scene, index) {
    if (index === scene.current) return;
    scene.current = index;
    scene.root.dataset.step = String(index);
    scene.position.textContent = `${String(index + 1).padStart(2, '0')} / ${String(scene.panels.length).padStart(2, '0')}`;
    scene.panels.forEach((panel, position) => {
      const active = position === index;
      if (!active && panel.contains(document.activeElement)) scene.buttons[index].focus({ preventScroll: true });
      panel.classList.toggle('is-current', active);
      panel.inert = !active;
      panel.setAttribute('aria-hidden', String(!active));
      if (active) scene.buttons[position].setAttribute('aria-current', 'step');
      else scene.buttons[position].removeAttribute('aria-current');
    });
  }
  function render() {
    frame = 0;
    if (preference.matches) return;
    scenes.forEach(scene => {
      if (scene.page.hidden || !scene.root.classList.contains('is-chapter-pinned')) return;
      const { start, travel } = bounds(scene);
      const progress = clamp((scrollY - start) / travel);
      const position = progress * (scene.panels.length - 1);
      select(scene, Math.round(position));
      scene.root.dataset.progress = progress.toFixed(4);
      scene.meter.style.transform = `scaleX(${progress})`;
      scene.panels.forEach((panel, index) => {
        const distance = index - position;
        const art = panel.querySelector('.chapter-art');
        const mobile = innerWidth <= 700;
        art.style.transform = `translate${mobile ? 'X' : 'Y'}(${distance * 115}%) rotate(${distance * (mobile ? 2 : 5)}deg) scale(${1 - Math.min(1, Math.abs(distance)) * .06})`;
        art.style.opacity = String(clamp(1.15 - Math.abs(distance)));
        panel.style.zIndex = String(10 - Math.abs(index - scene.current));
        panel.querySelector('.chapter-copy').style.transform = `translateY(${Math.abs(distance) * 9}px)`;
      });
    });
    pages.forEach(({ page, media, headings }) => {
      if (page.hidden) return;
      media.forEach(element => {
        const rect = element.getBoundingClientRect();
        const progress = clamp((innerHeight - rect.top) / (innerHeight + rect.height));
        element.style.transform = `translateY(${(progress - .5) * -22}px) rotate(${(progress - .5) * 2}deg)`;
      });
      headings.forEach(element => {
        const progress = clamp((innerHeight * .9 - element.getBoundingClientRect().top) / (innerHeight * .55));
        element.style.setProperty('--reading-progress', String(progress));
      });
    });
    scrollWheels.forEach(wheel => {
      if (wheel.closest('.route')?.hidden) return;
      const quarterTurns = scrollY / Math.max(1, innerHeight);
      wheel.style.transform = `rotate(${(quarterTurns * 90).toFixed(2)}deg)`;
    });
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  function configure() {
    const canPin = !preference.matches && innerHeight >= (innerWidth <= 700 ? 820 : 760);
    scenes.forEach(scene => {
      scene.root.classList.toggle('is-chapter-pinned', canPin);
      scene.root.style.setProperty('--chapter-travel', `${scene.panels.length * (innerWidth <= 700 ? 40 : 60)}svh`);
      scene.current = -1;
      if (!canPin) {
        delete scene.root.dataset.progress;
        delete scene.root.dataset.step;
        scene.position.textContent = `ALL ${scene.panels.length} CHAPTERS`;
        scene.meter.style.transform = 'scaleX(1)';
        scene.buttons.forEach(button => button.removeAttribute('aria-current'));
        scene.panels.forEach(panel => {
          panel.inert = false;
          panel.removeAttribute('aria-hidden');
          panel.classList.remove('is-current');
          panel.removeAttribute('style');
          panel.querySelector('.chapter-art').removeAttribute('style');
          panel.querySelector('.chapter-copy').removeAttribute('style');
        });
      }
    });
    if (preference.matches) {
      pages.forEach(({ media, headings }) => {
        media.forEach(element => element.removeAttribute('style'));
        headings.forEach(element => element.style.removeProperty('--reading-progress'));
      });
      scrollWheels.forEach(wheel => wheel.removeAttribute('style'));
    }
    schedule();
  }
  scenes.forEach(scene => {
    scene.buttons.forEach((button, index) => {
      button.disabled = false;
      button.addEventListener('click', () => {
        if (scene.root.classList.contains('is-chapter-pinned')) {
          const { start, travel } = bounds(scene);
          scrollTo({ top: start + travel * index / (scene.panels.length - 1), behavior: 'smooth' });
        } else {
          const panel = scene.panels[index];
          panel.tabIndex = -1;
          panel.focus({ preventScroll: true });
          panel.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      });
    });
  });
  document.querySelectorAll('[data-scroll-to]').forEach(button => {
    button.disabled = false;
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.scrollTo);
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: preference.matches ? 'instant' : 'smooth', block: 'start' });
    });
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', configure);
  addEventListener('hashchange', schedule);
  preference.addEventListener('change', configure);
  configure();
})();
