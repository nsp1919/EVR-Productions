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
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveCSS('min-height', '44px');
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
