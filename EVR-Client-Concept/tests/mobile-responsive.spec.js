const { test, expect } = require('@playwright/test');

const routes = [
  'home',
  'about',
  'weddings',
  'work',
  'process',
  'estimate',
  'corporate',
  'services',
  'approach',
  'brand-work',
  'production-quote',
  'request',
  'studio',
  'admin'
];

test('all application routes fit phone and tablet widths', async ({ page }) => {
  const failures = [];

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await page.goto(`/#/${route}`);
      await page.waitForTimeout(80);
      const layout = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        content: document.body.scrollWidth,
        route: document.querySelector('.route:not([hidden])')?.id,
        admin: !document.querySelector('#admin-editor').hidden
      }));
      if (layout.document > width) {
        failures.push(`${route} at ${width}px: document=${layout.document}px`);
      }
      if (layout.content > width + 2) {
        failures.push(`${route} at ${width}px: content=${layout.content}px`);
      }
      if (route === 'admin') {
        expect(layout.admin, `admin editor should be active at ${width}px`).toBe(true);
      } else {
        expect(layout.route, `${route} should be the active route at ${width}px`).toBe(route);
      }
    }
  }

  expect(failures, 'Routes should not overflow the viewport horizontally').toEqual([]);
});

test('mobile navigation opens and exposes each experience menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [route, destination] of [['home', '#/weddings'], ['corporate', '#/services']]) {
    await page.goto(`/#/${route}`);
    const menuButton = page.locator('#menu-toggle');
    const experienceSwitch = page.locator('.experience-switch');
    const logoBounds = await page.locator('header > .brand-logo-link').boundingBox();
    const switchBounds = await experienceSwitch.boundingBox();
    const corporateLabel = experienceSwitch.locator('[data-experience="corporate"] > span');
    const corporateButtonBounds = await experienceSwitch.locator('[data-experience="corporate"]').boundingBox();
    const corporateLabelBounds = await corporateLabel.boundingBox();
    const menuBounds = await menuButton.boundingBox();
    expect(Math.abs((corporateLabelBounds.x + corporateLabelBounds.width / 2) - (corporateButtonBounds.x + corporateButtonBounds.width / 2))).toBeLessThan(1);
    expect(Math.abs((corporateLabelBounds.y + corporateLabelBounds.height / 2) - (corporateButtonBounds.y + corporateButtonBounds.height / 2))).toBeLessThan(1);
    await expect(corporateLabel).toHaveCSS('font-family', /Georgia/);
    if (route === 'corporate') {
      const indicator = await experienceSwitch.evaluate(element => {
        const style = getComputedStyle(element, '::before');
        return { left: style.left, transform: style.transform };
      });
      expect(parseFloat(indicator.left)).toBeGreaterThan(switchBounds.width * .45);
      expect(parseFloat(indicator.left)).toBeLessThan(switchBounds.width * .55);
      expect(indicator.transform).toBe('none');
    }
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveCSS('min-height', '44px');
    expect(Math.abs((menuBounds.y + menuBounds.height / 2) - (logoBounds.y + logoBounds.height / 2))).toBeLessThan(8);
    expect(switchBounds.y).toBeGreaterThan(logoBounds.y + logoBounds.height - 2);
    expect(switchBounds.width).toBeGreaterThanOrEqual(320);
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const destinationLink = page.locator(`#main-nav a[href="${destination}"]`);
    await expect(destinationLink).toBeVisible();
    await expect(destinationLink).toHaveCSS('min-height', '44px');
    const navBounds = await page.locator('#main-nav').evaluate(element => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right };
    });
    expect(navBounds.left).toBeGreaterThanOrEqual(0);
    expect(navBounds.right).toBeLessThanOrEqual(390);
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 390);
  }

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/#/home');
  const narrowMenuBounds = await page.locator('#menu-toggle').boundingBox();
  const narrowLogoBounds = await page.locator('header > .brand-logo-link').boundingBox();
  expect(Math.abs((narrowMenuBounds.y + narrowMenuBounds.height / 2) - (narrowLogoBounds.y + narrowLogoBounds.height / 2))).toBeLessThan(8);
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 320);
});

test('wedding and brand navigation bars keep the same height and vertical position', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const headerMeasurements = [];
    for (const route of ['home', 'corporate']) {
      await page.goto(`/#/${route}`);
      const bounds = await page.locator('body > header').boundingBox();
      headerMeasurements.push(bounds);
    }
    expect(Math.abs(headerMeasurements[0].height - headerMeasurements[1].height)).toBeLessThan(1);
    expect(Math.abs(headerMeasurements[0].y - headerMeasurements[1].y)).toBeLessThan(1);
  }
});

test('switching experiences animates the page and honors reduced motion', async ({ page }) => {
  await page.goto('/#/home');
  await page.evaluate(() => {
    window.experienceTransitionCalls = 0;
    document.startViewTransition = callback => {
      window.experienceTransitionCalls += 1;
      callback();
      return { finished: Promise.resolve() };
    };
  });
  const switchToCorporate = page.locator('.experience-switch [data-experience="corporate"]');
  await switchToCorporate.click();
  await expect(page.locator('#corporate')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.experienceTransitionCalls)).toBe(1);

  await page.locator('.experience-switch [data-experience="home"]').click();
  await expect(page.locator('#home')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.experienceTransitionCalls)).toBe(2);
  const pillTransition = await page.locator('.experience-switch').evaluate(element =>
    getComputedStyle(element, '::before').transitionProperty
  );
  expect(pillTransition).toContain('left');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.experience-switch [data-experience="corporate"]').click();
  await expect(page.locator('#corporate')).toBeVisible();
  expect(await page.evaluate(() => window.experienceTransitionCalls)).toBe(2);
});

test('mobile brand quote button fully covers the WhatsApp button beneath it', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/corporate');
    const quote = page.locator('#floating-quote');
    const whatsapp = page.locator('.whatsapp-float');
    await expect(quote).toBeVisible();
    await expect(whatsapp).toBeVisible();
    const quoteBounds = await quote.boundingBox();
    const whatsappBounds = await whatsapp.boundingBox();
    expect(quoteBounds.x).toBeLessThanOrEqual(whatsappBounds.x);
    expect(quoteBounds.x + quoteBounds.width).toBeGreaterThanOrEqual(whatsappBounds.x + whatsappBounds.width);
    expect(quoteBounds.y).toBeLessThanOrEqual(whatsappBounds.y);
    expect(quoteBounds.y + quoteBounds.height).toBeGreaterThanOrEqual(whatsappBounds.y + whatsappBounds.height);
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', width);
  }
});

test('mobile pinned sections animate below the sticky header', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const pinnedSections = [
    { route: 'home', selector: '#process-story', stage: '.process-stage', minHeight: 740 },
    { route: 'weddings', selector: '#weddings [data-chapter-story]', stage: '.chapter-stage', minHeight: 680 },
    { route: 'process', selector: '#process [data-chapter-story]', stage: '.chapter-stage', minHeight: 680 },
    { route: 'services', selector: '#services [data-chapter-story]', stage: '.chapter-stage', minHeight: 680 },
    { route: 'approach', selector: '#approach [data-chapter-story]', stage: '.chapter-stage', minHeight: 680 },
    { route: 'corporate', selector: '#corporate #corp-services', stage: '.corp-service-stage', minHeight: 740 }
  ];

  for (const height of [700, 844]) {
    await page.setViewportSize({ width: 390, height });
    for (const { route, selector, stage, minHeight } of pinnedSections) {
      if (height < minHeight) continue;
      await page.goto(`/#/${route}`);
      const section = page.locator(selector);
      await expect(section).toHaveClass(/is-(?:pinned|chapter-pinned)/);
      await section.evaluate((root, stageSelector) => {
        const stickyStage = root.querySelector(stageSelector);
        const top = parseFloat(getComputedStyle(stickyStage).top) || 0;
        const start = root.getBoundingClientRect().top + window.scrollY - top;
        const travel = root.offsetHeight - stickyStage.offsetHeight;
        window.scrollTo(0, start + travel * .5);
      }, stage);
      await expect.poll(() => section.getAttribute('data-progress').then(Number)).toBeGreaterThan(.45);
      const clearance = await section.evaluate((root, stageSelector) => {
        const stageBounds = root.querySelector(stageSelector).getBoundingClientRect();
        const headerBounds = document.querySelector('header').getBoundingClientRect();
        return stageBounds.top - headerBounds.bottom;
      }, stage);
      expect(clearance).toBeGreaterThanOrEqual(0);
    }
  }
});

test('mobile pinned sections tolerate viewport changes and fall back to normal scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/#/weddings');
  const weddingStory = page.locator('#weddings [data-chapter-story]');
  await expect(weddingStory).toHaveClass(/is-chapter-pinned/);
  await page.setViewportSize({ width: 390, height: 740 });
  await expect(weddingStory).toHaveClass(/is-chapter-pinned/);
  await page.setViewportSize({ width: 390, height: 560 });
  await expect(weddingStory).not.toHaveClass(/is-chapter-pinned/);
  expect(await weddingStory.locator('.chapter-panel').evaluateAll(panels =>
    panels.every(panel => !panel.inert && !panel.hasAttribute('aria-hidden'))
  )).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/corporate');
  const corporateServices = page.locator('#corporate #corp-services');
  await expect(corporateServices).toHaveClass(/is-pinned/);
  await page.setViewportSize({ width: 390, height: 680 });
  await expect(corporateServices).toHaveClass(/is-pinned/);
  await page.setViewportSize({ width: 390, height: 600 });
  await expect(corporateServices).not.toHaveClass(/is-pinned/);
  expect(await corporateServices.locator('.corp-service-panel').evaluateAll(panels =>
    panels.every(panel => !panel.inert && !panel.hasAttribute('aria-hidden'))
  )).toBe(true);

  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/#/home');
  const filmSequence = page.locator('#home .film-sequence[data-film-sequence="wedding"]');
  await expect(filmSequence).not.toHaveClass(/is-pinned/);
  await page.setViewportSize({ width: 390, height: 560 });
  await expect(filmSequence).not.toHaveClass(/is-pinned/);
  await page.setViewportSize({ width: 390, height: 500 });
  await expect(filmSequence).not.toHaveClass(/is-pinned/);
  expect(await filmSequence.locator('.film-sequence-panel').evaluateAll(panels =>
    panels.every(panel => !panel.inert && panel.dataset.visible === 'true')
  )).toBe(true);
});

test('mobile wedding and production chapter artwork stays portrait', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });

  const portraitGroups = [
    { route: 'weddings', selector: '#weddings #wedding-chapters .chapter-art:not(.process-card-art)' },
    { route: 'services', selector: '#services #service-chapters .chapter-art:not(.process-card-art)' }
  ];
  for (const { route, selector } of portraitGroups) {
    await page.goto(`/#/${route}`);
    const dimensions = await page.locator(selector).evaluateAll(artworks =>
      artworks.map(artwork => ({
        width: artwork.offsetWidth,
        height: artwork.offsetHeight
      }))
    );
    expect(dimensions.length).toBeGreaterThan(0);
    expect(dimensions.every(({ width, height }) => height > width)).toBe(true);
  }

  await page.goto('/#/approach');
  const videoArt = page.locator('#approach #approach-chapters [data-r2-slot="corporate-product-story"]');
  const videoDimensions = await videoArt.evaluate(artwork => ({
    width: artwork.offsetWidth,
    height: artwork.offsetHeight,
    ratio: getComputedStyle(artwork).aspectRatio
  }));
  expect(videoDimensions.height).toBeGreaterThan(videoDimensions.width);
  expect(videoDimensions.ratio).toBe('9 / 16');
});

test('mobile pinned chapter transitions keep incoming artwork out of the text column', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  const stories = [
    { route: 'weddings', selector: '#weddings #wedding-chapters', progress: .325, expectedHeading: 'The rituals.\nThe reactions.\nThe real feeling.' },
    { route: 'process', selector: '#process #planning-story', progress: .18, expectedHeading: 'Put the important\nthings in writing.' },
    { route: 'services', selector: '#services #service-chapters', progress: .325, expectedHeading: 'Start strong.\nSay something.' },
    { route: 'approach', selector: '#approach #approach-chapters', progress: .325, expectedHeading: 'A direction\neveryone can use.' }
  ];

  for (const { route, selector, progress, expectedHeading } of stories) {
    await page.goto(`/#/${route}`);
    const story = page.locator(selector);
    await expect(story).toHaveClass(/is-chapter-pinned/);
    await story.evaluate((root, progress) => {
      document.documentElement.style.scrollBehavior = 'auto';
      const stage = root.querySelector('.chapter-stage');
      const start = root.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(stage).top) || 0);
      const travel = root.offsetHeight - stage.offsetHeight;
      scrollTo({ top: start + travel * progress, behavior: 'instant' });
    }, progress);
    await expect.poll(() => story.getAttribute('data-step')).toBe('1');
    await expect.poll(() => story.evaluate(root => Array.from(root.querySelectorAll('.chapter-copy')).find(copy => {
      const style = getComputedStyle(copy);
      return style.visibility === 'visible' && Number(style.opacity) > .95;
    })?.querySelector('h3')?.innerText)).toBe(expectedHeading);
    const layout = await story.evaluate(root => {
      const visibleCopy = Array.from(root.querySelectorAll('.chapter-copy')).filter(copy => {
        const style = getComputedStyle(copy);
        return style.visibility === 'visible' && Number(style.opacity) > .95;
      });
      const artworks = Array.from(root.querySelectorAll('.chapter-art'));
      const copyBounds = visibleCopy[0]?.getBoundingClientRect();
      return {
        visibleCopyText: visibleCopy[0]?.querySelector('h3').innerText,
        visibleCopyCount: visibleCopy.length,
        visibleArtCount: artworks.filter(art => Number(getComputedStyle(art).opacity) > .95).length,
        hiddenArtCount: artworks.filter(art => Number(getComputedStyle(art).opacity) === 0).length,
        artsOverlapCopy: artworks.some(art => {
          if (Number(getComputedStyle(art).opacity) === 0) return false;
          const bounds = art.getBoundingClientRect();
          return bounds.right > copyBounds.left && bounds.left < copyBounds.right
            && bounds.bottom > copyBounds.top && bounds.top < copyBounds.bottom;
        }),
        artTransforms: artworks.map(art => getComputedStyle(art).transform)
      };
    });
    expect(layout.visibleCopyCount).toBe(1);
    expect(layout.visibleCopyText).toBe(expectedHeading);
    expect(layout.visibleArtCount).toBe(1);
    expect(layout.hiddenArtCount).toBeGreaterThan(0);
    expect(layout.artsOverlapCopy, `${route} artwork should stay within its own column: ${JSON.stringify(layout)}`).toBe(false);
    expect(layout.artTransforms.every(transform => transform.startsWith('matrix('))).toBe(true);
  }
});

test('site footer has its video-ready feature and Novantix credit without mobile overflow', async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/home');
    const footer = page.locator('.site-footer');
    const credit = page.locator('.site-credit');
    await footer.scrollIntoViewIfNeeded();
    const feature = footer.locator('.footer-feature[data-footer-experience="home"]');
    const featureBounds = await feature.boundingBox();
    expect(featureBounds.x).toBe(0);
    expect(featureBounds.width).toBe(width);
    expect(featureBounds.height).toBeLessThanOrEqual(width <= 700 ? 400 : 460);
    expect(await feature.evaluate(element => getComputedStyle(element).borderRadius)).toBe('0px');
    expect(await credit.evaluate(element => getComputedStyle(element).backgroundColor))
      .toBe(await footer.evaluate(element => getComputedStyle(element).backgroundColor));
    await expect(footer.locator('#wedding-footer-heading')).toHaveAccessibleName('Some days deserve to live forever.');
    await expect(footer).not.toContainText('Thoughtfully made in Hyderabad, for celebrations everywhere.');
    await expect(page.locator('#floating-quote')).toBeHidden();
    expect(await footer.evaluate(element => getComputedStyle(element).paddingBottom)).toBe('0px');
    const footerVideo = feature.locator('.footer-film-video');
    await expect(footerVideo).toHaveAttribute('poster', 'assets/hero-bride-garden.jpg');
    await expect(footerVideo).toHaveAttribute('data-src', 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/evr-videos/d58260e7-d13d-4a99-b049-2fff341109af.mp4');
    await expect(footerVideo).toHaveAttribute('autoplay', '');
    await expect.poll(() => footerVideo.getAttribute('src')).toBe('https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/evr-videos/d58260e7-d13d-4a99-b049-2fff341109af.mp4');
    await expect(footer.locator('.footer-main[data-footer-experience="home"] a[href="mailto:evrproductionss@gmail.com"]')).toBeVisible();
    await expect(credit.locator('> *')).toHaveCount(4);
    await expect(credit.locator('.site-credit-label')).toHaveText('DESIGNED & DEVELOPED BY');
    await expect(credit.locator('.site-credit-brand')).toHaveAttribute('href', 'https://novantixtech.com');
    await expect(credit).toContainText('Novantix Innovation Technologies');
    await expect(credit.locator('.site-credit-cta')).toHaveText('Visit novantixtech.com to get your website/app ↗');
    await expect(credit.locator('.site-credit-cta')).toHaveAttribute('href', 'https://novantixtech.com');
    await expect(credit.locator('.footer-back-top')).toHaveText('Back to the beginning ↑');
    await expect(credit.locator('.footer-back-top')).toHaveAttribute('href', '#/home');
    const backTopBounds = await credit.locator('.footer-back-top').boundingBox();
    const creditBounds = await credit.boundingBox();
    expect(backTopBounds.x + backTopBounds.width).toBeGreaterThan(creditBounds.x + creditBounds.width / 2);
    expect(backTopBounds.y + backTopBounds.height).toBeGreaterThan(creditBounds.y + creditBounds.height - 42);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('quotation tools fit phone and tablet widths', async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/EVR-Productions-Quotation-Studio.html', '/sample-quotation.html']) {
      await page.goto(path);
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth, `${path} should fit ${width}px`).toBeLessThanOrEqual(width);
    }
  }
});

test('weddings page shows the celebration film beside its related copy', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/weddings');
    const section = page.locator('#celebration-film');
    const video = section.locator('video');
    await video.scrollIntoViewIfNeeded();
    await expect(section.locator('h2')).toHaveText(/A celebration needs\s*room to unfold\./);
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('data-viewport-autoplay', '');
    expect(await video.evaluate(element => element.autoplay)).toBe(false);
    await expect(video).toHaveAttribute('muted', '');
    await expect(video).toHaveAttribute('poster', 'assets/video-posters/r2/video_2026-10-31_07-42-11-cropped.jpg');
    await expect(video.locator('source')).toHaveAttribute('src', 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Half%20Saree%20Cropped/video_2026-10-31_07-42-11.mp4');
    const videoBox = await video.boundingBox();
    const copyBox = await section.locator('h2').boundingBox();
    expect(videoBox.width / videoBox.height).toBeCloseTo(2.105, 2);
    if (width > 700) expect(copyBox.x).toBeGreaterThan(videoBox.x + videoBox.width);
    else expect(copyBox.y).toBeGreaterThan(videoBox.y);
    await expect(section).toContainText('sisters, family and the shared moments');
  }
});

test('wedding celebration film autoplays muted from 00:29.0', async ({ page }) => {
  await page.route('https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/**', route => route.abort());
  await page.goto('/#/weddings');
  const playback = await page.locator('#celebration-film video').evaluate(video => {
    let currentTime = 0;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: value => { currentTime = value; }
    });
    Object.defineProperty(video, 'duration', { configurable: true, value: 39.6 });
    video.play = () => Promise.resolve();
    video.dispatchEvent(new Event('loadedmetadata'));
    const initialStartTime = currentTime;
    const startsMuted = video.muted;
    video.dispatchEvent(new Event('play'));
    return {
      initialStartTime,
      replayStartTime: currentTime,
      startsMuted,
      viewportAutoplay: video.hasAttribute('data-viewport-autoplay'),
      autoplay: video.autoplay
    };
  });
  expect(playback).toEqual({
    initialStartTime: 0,
    replayStartTime: 29,
    startsMuted: true,
    viewportAutoplay: true,
    autoplay: false
  });
});

test('all existing and dynamically added site videos replay when they end', async ({ page }) => {
  await page.goto('/#/home');
  await expect.poll(() => page.locator('video').evaluateAll(videos =>
    videos.length > 0 && videos.every(video => video.loop)
  )).toBe(true);

  const dynamicVideo = await page.evaluate(() => {
    const video = document.createElement('video');
    video.id = 'dynamic-replay-check';
    document.body.append(video);
    return video.id;
  });
  await expect.poll(() => page.locator(`#${dynamicVideo}`).evaluate(video => video.loop)).toBe(true);
});
