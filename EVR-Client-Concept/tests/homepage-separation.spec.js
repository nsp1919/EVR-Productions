const { test, expect } = require('@playwright/test');

test('wedding homepage stays focused and the experience switch opens NBrands', async ({ page }) => {
  await page.goto('/#/home');

  const weddingSwitch = page.locator('.experience-switch [data-experience="home"]');
  const nbrandsSwitch = page.locator('.experience-switch [data-experience="corporate"]');
  await expect(weddingSwitch).toHaveText('Weddings & Functions');
  await expect(nbrandsSwitch).toHaveText('NBrands');
  await expect(page.locator('#home')).toBeVisible();
  await expect(page).toHaveTitle('Weddings & Functions | EVR Productions');
  await expect(page.locator('footer [data-nav-experience="home"]')).toBeVisible();
  await expect(page.locator('footer [data-nav-experience="corporate"]')).toBeHidden();

  const weddingContent = await page.locator('#home').innerText();
  expect(weddingContent).not.toMatch(/\b(?:brand|corporate|podcast)\b/i);
  await expect(page.locator('#date-service option')).toHaveCount(4);

  await nbrandsSwitch.click();
  await expect(page).toHaveURL(/#\/corporate$/);
  await expect(page.locator('#corporate')).toBeVisible();
  await expect(page).toHaveTitle('NBrands | EVR Productions');
  await expect(page.locator('footer [data-nav-experience="home"]')).toBeHidden();
  await expect(page.locator('footer [data-nav-experience="corporate"]')).toBeVisible();
  await expect(page.locator('#corp-work')).toContainText('BRAND FILM');
  await expect(page.locator('#corporate')).toContainText(/podcasts/i);

  await weddingSwitch.click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.locator('#home')).toBeVisible();
});

test('founder statistics reveal and count up to their published values on scroll', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  const facts = page.locator('#home .founder-teaser-facts');
  const cards = facts.locator('article');
  await expect(cards).toHaveCount(3);
  await expect(facts).toHaveClass(/has-stat-reveal/);
  await expect(cards.first()).not.toHaveClass(/is-in-view/);
  await expect(cards.first().locator('b')).toHaveText('6+');

  await facts.scrollIntoViewIfNeeded();
  for (const [index, value] of ['6+', '100+', '150+'].entries()) {
    await expect(cards.nth(index)).toHaveClass(/is-in-view/);
    await expect(cards.nth(index).locator('b')).toHaveText(value, { timeout: 3000 });
  }
});

test('founder statistics remain visible and final when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/home');

  const facts = page.locator('#home .founder-teaser-facts');
  await expect(facts).not.toHaveClass(/has-stat-reveal/);
  await expect(facts.locator('article')).toHaveCount(3);
  await expect(facts.locator('b')).toHaveText(['6+', '100+', '150+']);
  await expect(facts.locator('article').first()).toBeVisible();
});

test('work portfolio shows four selected R2 films with manual, replaying playback', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() {
      this.dataset.playRequested = 'true';
      return Promise.resolve();
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/work');

  const cards = page.locator('#work .story-library article');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('#work .story-library [data-r2-video-url]')).toHaveCount(4);
  await expect(page.locator('#work .story-library img')).toHaveCount(4);
  await expect(cards.nth(0)).toContainText('The quiet before forever');
  await expect(cards.nth(1)).toContainText('A celebration, remembered');
  await expect(cards.nth(2)).toContainText('Sisters in celebration');
  await expect(cards.nth(3)).toContainText('Growing up, together');
  await expect(page.locator('#work .story-library [data-r2-slot="anna (2).mp4"]')).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/anna%20(2).mp4'
  );
  await expect(page.locator('#work .story-library [data-category="wedding"]')).toHaveCount(1);
  await expect(page.locator('#work .story-library [data-category="prewedding"]')).toHaveCount(1);
  await expect(page.locator('#work .story-library [data-category="celebration"]')).toHaveCount(2);
  await expect(page.locator('#home [data-r2-slot="Sri Shashi & Ravi Teja Lrical Video.mp4"]')).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Sri%20Shashi%20%26%20Ravi%20Teja%20Lrical%20Video.mp4'
  );
  const firstPreview = cards.first().locator('.preview-media');
  await firstPreview.scrollIntoViewIfNeeded();
  const previewVideo = firstPreview.locator('video');
  expect(await previewVideo.evaluate(video => video.dataset.playRequested)).toBeUndefined();
  expect(await previewVideo.evaluate(video => video.autoplay)).toBe(false);
  expect(await previewVideo.evaluate(video => video.loop)).toBe(true);
  await firstPreview.locator('.preview-play').click();
  await expect(previewVideo).toBeVisible();
  await expect(previewVideo).toHaveAttribute('src', /pub-aefcf27121ff450faf8570e9de489735\.r2\.dev/);
  expect(await previewVideo.evaluate(video => ({
    muted: video.muted,
    autoplay: video.autoplay,
    loop: video.loop,
    controls: video.controls,
    playRequested: video.dataset.playRequested
  }))).toEqual({ muted: true, autoplay: false, loop: true, controls: true, playRequested: 'true' });
  await firstPreview.locator('.preview-close').click();
  await expect(page.locator('#corporate .corp-reel-card[data-r2-slot="corporate-presenter"]')).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Reel%204.mp4'
  );
});

test('homepage groups the portrait, wedding, lyrical, family, and half-saree R2 films', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  await expect(page.locator('#home [data-r2-video-url]')).toHaveCount(15);
  await expect(page.locator('#home .media-disclaimer:visible')).toHaveCount(0);
  await expect(page.locator('#work .media-disclaimer:visible')).toHaveCount(0);
  await expect(page.locator('#home .portrait-video-grid [data-r2-video-url]')).toHaveCount(4);
  expect(await page.locator('#home .portrait-video-grid [data-r2-slot]').evaluateAll(slots =>
    slots.map(slot => slot.dataset.r2Slot)
  )).toEqual([
    'video_2026-10-31_07-41-12.mp4',
    'video_2026-10-31_07-40-11.mp4',
    'video_2026-10-31_07-41-30.mp4',
    'wed reel.mp4'
  ]);
  await expect(page.locator('#home .lyrical-films [data-r2-slot="video_2026-10-31_07-40-04.mp4"]')).toHaveCount(1);
  await expect(page.locator('#home [data-film-sequence="wedding"] [data-r2-video-url]')).toHaveCount(4);
  await expect(page.locator('#home [data-film-sequence="wedding"] .film-sequence-copy')).toHaveCount(0);
  await expect(page.locator('#home [data-film-sequence="wedding"] .wedding-side-title-left')).toContainText('One celebration.');
  await expect(page.locator('#home [data-film-sequence="wedding"] .wedding-side-title-right')).toContainText('Many moments.');
  await expect(page.locator('#home [data-film-sequence="wedding"] [data-film-panel]').first()).toHaveAttribute(
    'data-film-panel',
    ''
  );
  await expect(page.locator('#home [data-film-sequence="wedding"] [data-r2-slot]').first()).toHaveAttribute(
    'data-r2-slot',
    'video_2026-10-31_07-40-33.mp4'
  );
  await expect(page.locator('#home .lyrical-film-list .lyrical-film-feature [data-r2-video-url]')).toHaveCount(3);
  await expect(page.locator('#home .lyrical-films [data-r2-slot="Sri Shashi & Ravi Teja Lrical Video.mp4"]')).toHaveCount(1);
  await expect(page.locator('#home .lyrical-films [data-r2-slot="V&M Lyrical Video.mp4"]')).toHaveCount(1);
  await expect(page.locator('#home .lyrical-film-feature .media-disclaimer:visible')).toHaveCount(0);
  await expect(page.locator('#home [data-film-sequence="half-saree"] [data-r2-video-url]')).toHaveCount(4);
  expect(await page.locator('#home [data-film-sequence="half-saree"] [data-r2-slot]').evaluateAll(slots =>
    slots.map(slot => slot.dataset.r2Slot)
  )).toEqual([
    'video_2026-10-31_07-42-16.mp4',
    'video_2026-10-31_07-42-05.mp4',
    'video_2026-10-31_07-42-11.mp4',
    'video_2026-10-31_07-41-57.mp4'
  ]);
  expect(await page.locator('#home [data-film-sequence="half-saree"] [data-r2-slot]').evaluateAll(slots =>
    slots.map(slot => ({
      url: slot.dataset.r2VideoUrl,
      poster: slot.querySelector('img').getAttribute('src')
    }))
  )).toEqual([
    {
      url: 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Half%20Saree%20Cropped/video_2026-10-31_07-42-16.mp4',
      poster: 'assets/video-posters/r2/video_2026-10-31_07-42-16-cropped.jpg'
    },
    {
      url: 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Half%20Saree%20Cropped/video_2026-10-31_07-42-05.mp4',
      poster: 'assets/video-posters/r2/video_2026-10-31_07-42-05-cropped.jpg'
    },
    {
      url: 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Half%20Saree%20Cropped/video_2026-10-31_07-42-11.mp4',
      poster: 'assets/video-posters/r2/video_2026-10-31_07-42-11-cropped.jpg'
    },
    {
      url: 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Half%20Saree%20Cropped/video_2026-10-31_07-41-57.mp4',
      poster: 'assets/video-posters/r2/video_2026-10-31_07-41-57-cropped.jpg'
    }
  ]);
  const homepageSectionOrder = await page.locator('#home').evaluate(home => {
    const sectionNames = [
      ['.hero-story', 'intro'],
      ['[data-film-sequence="wedding"]', 'wedding'],
      ['.celebration-choice-section', 'celebration'],
      ['.portrait-stories', 'portrait'],
      ['[data-film-sequence="half-saree"]', 'half-saree'],
      ['.lyrical-films', 'music'],
      ['#process-story', 'process'],
      ['.founder-teaser', 'founder'],
      ['.client-voices', 'reviews'],
      ['.date-enquiry', 'date'],
      ['.home-faq', 'faq'],
      ['.estimate-invite', 'cta']
    ];
    return Array.from(home.children)
      .flatMap(element => sectionNames.filter(([selector]) => element.matches(selector)).map(([, name]) => name));
  });
  expect(homepageSectionOrder).toEqual([
    'intro', 'wedding', 'celebration', 'portrait', 'half-saree',
    'music', 'process', 'founder', 'reviews', 'date', 'faq', 'cta'
  ]);
  await expect(page.locator('#home .working-agreement')).toHaveCount(0);
  await expect(page.locator('#home .service-overview')).toHaveCount(0);
  await expect(page.locator('#home #process-story .process-agreement')).toContainText(
    'agree the coverage, dates, feedback rounds and delivery in writing'
  );
  await expect(page.locator('#home #process-story')).toContainText('key moments');
  await expect(page.locator('#home #process-story')).toContainText('handover expectations');
  await expect(page.locator('#home #process-story')).toContainText('Sri Shashi');
  await expect(page.locator('#home #process-story')).not.toContainText('PROJECT SPACE / DEMO');
  await expect(page.locator('#home #process-story')).not.toContainText('Illustrative project update');
  const processImageStatus = await page.locator('#home #process-story .phone-screen img').evaluateAll(images =>
    images.map(image => ({
      source: image.getAttribute('src'),
      loaded: image.complete && image.naturalWidth > 0
    }))
  );
  expect(processImageStatus.length).toBeGreaterThanOrEqual(7);
  expect(processImageStatus.every(image => image.source.startsWith('assets/video-posters/r2/') && image.loaded)).toBe(true);
  const serviceLinks = page.locator('#home .celebration-service-links a');
  await expect(serviceLinks).toHaveCount(4);
  expect(await serviceLinks.evaluateAll(links => links.map(link => link.dataset.service))).toEqual([
    'Wedding', 'Pre-wedding', 'Maternity / family', 'Birthday / celebration'
  ]);
  await expect(serviceLinks.first()).toHaveCSS('border-top-color', 'rgb(201, 149, 125)');
  await expect(serviceLinks.first()).toHaveCSS('font-weight', '600');
  await expect(page.locator('#home #celebration-choice-title')).toContainText('Your celebration.');
  await expect(page.locator('#home #celebration-choice-title')).toContainText('Your people. Your story.');
  await expect(page.locator('#home .hero-story .story-decisions')).toHaveCount(0);
  await expect(page.locator('#home .hero-story .story-choice')).toHaveCount(0);
  await expect(page.locator('#home #portrait-stories-title')).toContainText('The wedding, up close.');
  const weddingMediaWidth = await page.locator('#home [data-film-sequence="wedding"] .film-sequence-panel .preview-media').first()
    .evaluate(element => element.getBoundingClientRect().width);
  const weddingVisualWidth = await page.locator('#home [data-film-sequence="wedding"] .film-sequence-visual')
    .evaluate(element => element.getBoundingClientRect().width);
  expect(weddingMediaWidth).toBeGreaterThan(weddingVisualWidth * .95);
  await expect(page.locator('#home .portrait-video-grid [data-r2-slot="video_2026-10-31_07-41-30.mp4"]')).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/video_2026-10-31_07-41-30.mp4'
  );
  await expect(page.locator('#home .lyrical-film-feature [data-r2-slot="Sri Shashi & Ravi Teja Lrical Video.mp4"]')).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Sri%20Shashi%20%26%20Ravi%20Teja%20Lrical%20Video.mp4'
  );
  await expect(page.locator('#home [data-film-sequence="half-saree"] [data-r2-slot="video_2026-10-31_07-42-11.mp4"]')).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Half%20Saree%20Cropped/video_2026-10-31_07-42-11.mp4'
  );
  await expect(page.locator('#home [data-demo-media] video.r2-autoplay-preview')).toHaveCount(15);
  await expect(page.locator('#home [data-demo-media] .preview-audio-toggle')).toHaveCount(15);
  expect(await page.locator('#home [data-demo-media] video.r2-autoplay-preview').evaluateAll(videos =>
    videos.every(video => video.muted && video.autoplay)
  )).toBe(true);

  const portraitMedia = page.locator('#home .portrait-video-grid .preview-media').first();
  const portraitCards = page.locator('#home .portrait-video-grid article');
  const staggeredCardOffsets = await portraitCards.evaluateAll(cards =>
    cards.map(card => Number.parseFloat(getComputedStyle(card).transform.split(',')[5]) || 0)
  );
  expect(staggeredCardOffsets[0]).toBe(0);
  expect(staggeredCardOffsets[1]).toBe(28);
  expect(staggeredCardOffsets[2]).toBe(0);
  expect(staggeredCardOffsets[3]).toBe(28);
  await expect(page.locator('#home .portrait-stories')).toHaveClass(/has-stagger-reveal/);
  await page.locator('#home .portrait-stories').scrollIntoViewIfNeeded();
  await expect(page.locator('#home .portrait-stories')).toHaveClass(/is-in-view/);
  const dimensions = await portraitMedia.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(dimensions.height).toBeGreaterThan(dimensions.width);
  await page.setViewportSize({ width: 700, height: 900 });
  const mobileStaggerOffset = await portraitCards.nth(1).evaluate(card =>
    Number.parseFloat(getComputedStyle(card).transform.split(',')[5]) || 0
  );
  expect(mobileStaggerOffset).toBe(0);
  const weddingSequence = page.locator('#home [data-film-sequence="wedding"]');
  await weddingSequence.scrollIntoViewIfNeeded();
  await expect(weddingSequence).toHaveClass(/is-pinned/);
  const laterStep = await page.locator('#home [data-film-sequence="wedding"] .film-sequence-track').evaluate(track => {
    const stage = track.querySelector('.film-sequence-stage');
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    const start = track.getBoundingClientRect().top + scrollY - top;
    const travel = track.offsetHeight - stage.offsetHeight;
    return start + travel * .72;
  });

  await page.evaluate(top => scrollTo(0, top), laterStep);
  await expect(weddingSequence).toHaveAttribute('data-sequence-index', '2');
  await expect.poll(() => page.locator('#home [data-film-sequence="wedding"] [data-film-panel]').nth(2).evaluate(panel =>
    Number(panel.style.opacity)
  )).toBe(1);
  const secondVideoHoldTransform = await page.locator('#home [data-film-sequence="wedding"] [data-film-panel]').nth(1)
    .evaluate(panel => panel.style.transform);
  expect(secondVideoHoldTransform).toContain('translateX(0vw)');
  const weddingSideLayout = await weddingSequence.evaluate(section => {
    const video = section.querySelector('[data-film-panel][data-active="true"] .preview-media').getBoundingClientRect();
    const left = section.querySelector('.wedding-side-title-left');
    const right = section.querySelector('.wedding-side-title-right');
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    return {
      leftOpacity: Number.parseFloat(getComputedStyle(left).opacity),
      rightOpacity: Number.parseFloat(getComputedStyle(right).opacity),
      leftOutsideVideo: leftRect.right < video.left,
      rightOutsideVideo: rightRect.left > video.right,
      leftText: left.innerText.trim(),
      rightText: right.innerText.trim()
    };
  });
  expect(weddingSideLayout.leftOpacity).toBeGreaterThan(0);
  expect(weddingSideLayout.rightOpacity).toBeGreaterThan(0);
  expect(weddingSideLayout.leftOutsideVideo).toBe(true);
  expect(weddingSideLayout.rightOutsideVideo).toBe(true);
  expect(weddingSideLayout.leftText).toBe('One celebration.');
  expect(weddingSideLayout.rightText).toBe('Many moments.');
  const exitStep = await page.locator('#home [data-film-sequence="wedding"] .film-sequence-track').evaluate(track => {
    const stage = track.querySelector('.film-sequence-stage');
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    const start = track.getBoundingClientRect().top + scrollY - top;
    const travel = track.offsetHeight - stage.offsetHeight;
    return start + travel * .95;
  });
  await page.evaluate(top => scrollTo(0, top - innerHeight * .05), exitStep);
  await expect(weddingSequence).toHaveAttribute('data-sequence-index', '2');
  const weddingPanels = page.locator('#home [data-film-sequence="wedding"] [data-film-panel]');
  await expect.poll(() => weddingPanels.nth(2).evaluate(panel => Number(panel.style.opacity))).toBeGreaterThan(0);
  await expect.poll(() => weddingPanels.nth(3).evaluate(panel => Number(panel.style.opacity))).toBeGreaterThan(0);
  await expect(weddingPanels.nth(2)).toHaveAttribute('style', /translateX\(-[\d.]+vw\)/);
  await expect(weddingPanels.nth(3)).toHaveAttribute('style', /scale\(0\.9[7-9]/);
  await expect(weddingPanels.nth(3)).toHaveAttribute('style', /z-index: 2/);
});

test('homepage autoplay previews hide the watch badge and keep accessible audio controls', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() {
      this.dataset.playRequested = 'true';
      return Promise.resolve();
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  const preview = page.locator('#home .portrait-video-grid [data-r2-slot]').first();
  await preview.scrollIntoViewIfNeeded();
  const video = preview.locator('video');
  const watch = preview.locator('.preview-play');
  await expect.poll(() => video.evaluate(element => element.dataset.playRequested)).toBe('true');
  await expect(watch).toBeHidden();
  await expect(watch).toBeEnabled();
  const audio = preview.locator('.preview-audio-toggle');
  await expect(audio).toBeVisible();
  await expect(audio).toHaveAttribute('aria-label', 'Unmute video');
  await expect(audio).toHaveAttribute('aria-pressed', 'false');
  await expect(audio.locator('svg')).toHaveCount(1);
  await audio.click();
  await expect(audio).toHaveAttribute('aria-label', 'Mute video');
  await expect(audio).toHaveAttribute('aria-pressed', 'true');
  await expect(audio.locator('svg')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const cards = page.locator('#home [data-demo-media]');
  await expect(cards).toHaveCount(15);
  for (let index = 0; index < 15; index += 1) {
    const card = cards.nth(index);
    await card.scrollIntoViewIfNeeded();
    const playButton = card.locator('.preview-play');
    await expect(playButton).toBeEnabled();
    await playButton.click();
    await expect(card.locator('video')).toBeVisible();
    await expect(card.locator('.preview-close')).toBeVisible();
    await card.locator('.preview-close').click();
  }
});

test('homepage autoplay failure restores a visible manual play fallback', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() {
      this.dataset.playRejected = 'true';
      return Promise.reject(new Error('Autoplay blocked'));
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  const preview = page.locator('#home .portrait-video-grid [data-r2-slot]').first();
  await preview.scrollIntoViewIfNeeded();
  await expect.poll(() => preview.locator('video').evaluate(video => video.dataset.playRejected)).toBe('true');
  await expect(preview).not.toHaveClass(/is-autoplaying/);
  await expect(preview.locator('.preview-play')).toBeVisible();
  await expect(preview.locator('.preview-audio-toggle')).toBeHidden();
});

test('work page shows four curated portfolio videos that replay only after manual play', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() {
      this.dataset.playRequested = 'true';
      return Promise.resolve();
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/work');

  const cards = page.locator('#work .story-library > article');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toContainText('The quiet before forever');
  await expect(cards.nth(1)).toContainText('A celebration, remembered');
  await expect(cards.nth(2)).toContainText('Sisters in celebration');
  await expect(cards.nth(3)).toContainText('Growing up, together');

  for (let index = 0; index < 4; index += 1) {
    const preview = cards.nth(index).locator('.story-cover');
    const video = preview.locator('video');
    await preview.scrollIntoViewIfNeeded();
    await expect(preview.locator('.preview-play')).toBeVisible();
    expect(await video.evaluate(element => element.dataset.playRequested)).toBeUndefined();
    await preview.locator('.preview-play').click();
    await expect(video).toBeVisible();
    expect(await video.evaluate(element => element.dataset.playRequested)).toBe('true');
    expect(await video.evaluate(element => element.autoplay)).toBe(false);
    expect(await video.evaluate(element => element.loop)).toBe(true);
    expect(await video.evaluate(element => element.controls)).toBe(true);
    await preview.locator('.preview-close').click();
  }
});

test('selected work admin preview exposes four contextual portfolio video controls', async ({ page }) => {
  await page.route('**/api/auth', route => route.fulfill({
    json: { configured: true, authenticated: true }
  }));
  await page.route('**/api/content', route => route.fulfill({
    json: { version: 1, entries: {} }
  }));
  await page.goto('/#/admin');
  await expect(page.locator('.admin-controls')).toBeVisible();
  await page.locator('#admin-preview-page').selectOption('work');

  const videoActions = page.locator('.admin-media-actions .admin-icon-button[aria-label="Replace video"]');
  await expect(videoActions).toHaveCount(4);
});

test('process stages use real EVR wedding images and the actual project workflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/home');

  const process = page.locator('#home #process-story');
  const steps = process.locator('[data-process-step]');
  const updates = [
    'Share your brief',
    'Agree coverage & terms',
    'Plan the day with EVR',
    'Review the first cut',
    'Confirm final formats'
  ];
  await expect(steps).toHaveCount(updates.length);

  for (let index = 0; index < updates.length; index += 1) {
    await steps.nth(index).click();
    await expect(steps.nth(index)).toHaveAttribute('aria-current', 'step');
    await expect(process.locator(`[data-phone-screen="${index}"]`)).toBeVisible();
    await expect(process.locator('#phone-notice-title')).toHaveText(updates[index]);
  }

  const photos = await process.locator('.phone-screen img').evaluateAll(images =>
    images.map(image => ({
      source: image.getAttribute('src'),
      loaded: image.complete && image.naturalWidth > 0
    }))
  );
  expect(photos).toHaveLength(7);
  expect(photos.every(photo => photo.source.startsWith('assets/video-posters/r2/') && photo.loaded)).toBe(true);
  await expect(process.locator('[data-phone-screen="4"]')).toContainText('Sri Shashi');
  await expect(process).not.toContainText('PROJECT SPACE / DEMO');
  await expect(process).not.toContainText('Illustrative project update');

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    if (viewport.width <= 700) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect(process).toHaveClass(/is-pinned/);
      const mobileLayout = await process.evaluate(root => {
        const steps = root.querySelector('.process-steps');
        return {
          stepsDisplay: getComputedStyle(steps).display,
          stepColumns: getComputedStyle(steps).gridTemplateColumns.split(' ').length
        };
      });
      expect(mobileLayout).toEqual({ stepsDisplay: 'grid', stepColumns: 5 });
    }
    await steps.nth(4).click();
    await expect(process.locator('[data-phone-screen="4"]')).toBeVisible();
    const galleryClearance = await process.evaluate(root => {
      const panel = root.querySelector('[data-phone-screen="4"] .phone-panel').getBoundingClientRect();
      const footer = root.querySelector('.phone-bottom').getBoundingClientRect();
      return footer.top - panel.bottom;
    });
    expect(galleryClearance).toBeGreaterThanOrEqual(0);
  }
});

test('process detail page uses the supplied cards and a real wedding image', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/process');
    const processPage = page.locator('#process');
    const journey = processPage.locator('#planning-story');
    await expect(processPage).toBeVisible();
    await expect(journey.locator('.chapter-panel')).toHaveCount(5);

    const expectedArtwork = [
      'assets/process-cards/process-card-01-your-moments.png',
      'assets/process-cards/process-card-02-shared-scope.png',
      'assets/process-cards/process-card-03-tradition.png',
      'assets/process-cards/process-card-04-edit-timeline.png',
      'assets/process-cards/process-card-05-handover.png'
    ];
    for (const [index, source] of expectedArtwork.entries()) {
      const art = journey.locator('.chapter-panel').nth(index).locator('.chapter-art');
      const image = art.locator('img');
      await expect(image).toHaveAttribute('src', source);
      await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
      await expect(art).toHaveClass(/process-card-art/);
    }

    for (let index = 0; index < expectedArtwork.length; index += 1) {
      await journey.locator(`[data-story-step="${index}"]`).click();
      await expect(journey.locator('.chapter-panel').nth(index)).toBeInViewport();
    }
  }
});

test('music films alternate their desktop layout and close with a full-width family feature', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  const music = page.locator('#home .lyrical-films');
  const cards = music.locator('.lyrical-film-feature');
  await expect(cards).toHaveCount(3);
  await expect(music).toHaveClass(/has-film-reveal/);
  await expect(music).not.toHaveClass(/is-pinned/);

  const desktopLayout = await cards.evaluateAll(elements => elements.map(card => {
    const media = card.querySelector('.family-film-media').getBoundingClientRect();
    const copy = card.querySelector(':scope > div:last-child').getBoundingClientRect();
    const bounds = card.getBoundingClientRect();
    return { mediaX: media.x, copyX: copy.x, mediaWidth: media.width, cardWidth: bounds.width };
  }));
  expect(desktopLayout[0].mediaX).toBeLessThan(desktopLayout[0].copyX);
  expect(desktopLayout[1].mediaX).toBeGreaterThan(desktopLayout[1].copyX);
  expect(desktopLayout[2].mediaWidth).toBeGreaterThan(desktopLayout[2].cardWidth * .95);

  await cards.first().scrollIntoViewIfNeeded();
  await expect(cards.first()).toHaveClass(/is-in-view/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotionStyles = await cards.first().evaluate(card => {
    const styles = getComputedStyle(card);
    const transform = new DOMMatrixReadOnly(styles.transform);
    return { opacity: styles.opacity, translateY: transform.m42, scaleY: transform.m22, transitionDuration: styles.transitionDuration };
  });
  expect(reducedMotionStyles.opacity).toBe('1');
  expect(reducedMotionStyles.translateY).toBe(0);
  expect(reducedMotionStyles.scaleY).toBe(1);
  expect(reducedMotionStyles.transitionDuration).toBe('0s');

  await page.setViewportSize({ width: 390, height: 844 });
  const secondCardMobileOrder = await cards.nth(1).evaluate(card => {
    const media = card.querySelector('.family-film-media').getBoundingClientRect();
    const copy = card.querySelector(':scope > div:last-child').getBoundingClientRect();
    return media.y < copy.y;
  });
  expect(secondCardMobileOrder).toBe(true);
});

test('half-saree films stack below one another without pinning on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  const sequence = page.locator('#home [data-film-sequence="half-saree"]');
  await expect(sequence).toHaveClass(/is-pinned/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sequence).not.toHaveClass(/is-pinned/);
  await sequence.scrollIntoViewIfNeeded();

  const panels = sequence.locator('[data-film-panel]');
  await expect(panels).toHaveCount(4);
  const layout = await panels.evaluateAll(cards => cards.map(card => {
    const media = card.querySelector('.preview-media').getBoundingClientRect();
    const caption = card.querySelector('.film-panel-caption').getBoundingClientRect();
    const panel = card.getBoundingClientRect();
    return {
      panelTop: panel.top,
      panelBottom: panel.bottom,
      mediaTop: media.top,
      mediaBottom: media.bottom,
      mediaWidth: media.width,
      captionTop: caption.top,
      captionBottom: caption.bottom
    };
  }));
  for (const card of layout) {
    expect(card.mediaWidth).toBeGreaterThan(300);
    expect(card.captionTop).toBeGreaterThanOrEqual(card.mediaBottom);
  }
  for (let index = 1; index < layout.length; index += 1) {
    expect(layout[index].panelTop).toBeGreaterThanOrEqual(layout[index - 1].panelBottom);
  }
});

test('half-saree cards reveal as they enter the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  const sequence = page.locator('#home [data-film-sequence="half-saree"]');
  await expect(sequence).not.toHaveClass(/is-pinned/);
  await expect(sequence).toHaveClass(/has-scroll-reveal/);
  const panels = sequence.locator('[data-film-panel]');
  await expect(panels).toHaveCount(4);
  await panels.first().scrollIntoViewIfNeeded();
  await expect(panels.last()).toHaveAttribute('data-scroll-revealed', 'false');
  await expect.poll(() => panels.last().evaluate(panel => Number(getComputedStyle(panel).opacity))).toBeLessThan(.05);
  for (let index = 0; index < 4; index += 1) {
    const panel = panels.nth(index);
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toHaveAttribute('data-scroll-revealed', 'true');
    await expect.poll(() => panel.evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.99);
    await expect.poll(() => panel.evaluate(element => getComputedStyle(element).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)');
  }
});

test('half-saree pinned video sits close beneath its section heading', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/home');

  const sequence = page.locator('#home [data-film-sequence="half-saree"]');
  await sequence.evaluate(section => {
    window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY);
  });
  await expect(sequence).toHaveClass(/is-pinned/);

  const videoOffset = await sequence.evaluate(section => {
    const stage = section.querySelector('.film-sequence-stage').getBoundingClientRect();
    const video = section.querySelector('[data-film-panel] .preview-media').getBoundingClientRect();
    return video.top - stage.top;
  });
  expect(videoOffset).toBeLessThan(100);
});

test('half-saree heading stays pinned above the video throughout the sequence', async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 760 });
  await page.goto('/#/home');

  const sequence = page.locator('#home [data-film-sequence="half-saree"]');
  await expect(sequence).toHaveClass(/is-pinned/);
  for (const progress of [.25, .75]) {
    await sequence.evaluate((section, value) => {
      const stage = section.querySelector('.film-sequence-stage');
      const track = section.querySelector('.film-sequence-track');
      const top = parseFloat(getComputedStyle(stage).top) || 0;
      const start = track.getBoundingClientRect().top + window.scrollY - top;
      const travel = track.offsetHeight - stage.offsetHeight;
      window.scrollTo(0, start + travel * value);
    }, progress);
    const layout = await sequence.evaluate(section => {
      const heading = section.querySelector('.section-heading').getBoundingClientRect();
      const stage = section.querySelector('.film-sequence-stage').getBoundingClientRect();
      const video = section.querySelector('[data-film-panel][data-active="true"] .preview-media').getBoundingClientRect();
      return {
        headingTop: heading.top,
        headingBottom: heading.bottom,
        stageTop: stage.top,
        videoTop: video.top,
        videoBottom: video.bottom,
        viewportHeight: window.innerHeight
      };
    });
    expect(layout.headingTop).toBeGreaterThanOrEqual(95);
    expect(layout.headingBottom).toBeLessThan(layout.videoTop);
    expect(layout.videoBottom).toBeLessThanOrEqual(layout.viewportHeight);
    expect(layout.stageTop).toBeGreaterThan(layout.headingBottom);
  }
});

test('sisters celebration film uses a shorter crop to hide its letterbox bars', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/home');

  const media = page.locator(
    '#home [data-film-sequence="half-saree"] [data-r2-slot="video_2026-10-31_07-42-11.mp4"]'
  );
  const size = await media.evaluate(element => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height, ratio: width / height };
  });
  expect(size.ratio).toBeGreaterThan(2);
  expect(size.height).toBeLessThan(size.width / (16 / 9));
  await expect(media.locator('video')).toHaveCSS('object-fit', 'cover');
  await expect(media).toHaveCSS('overflow', 'hidden');
});

test('sisters celebration homepage preview starts at the beginning', async ({ page }) => {
  await page.goto('/#/home');
  const startTime = await page.locator(
    '#home [data-film-sequence="half-saree"] [data-r2-slot="video_2026-10-31_07-42-11.mp4"] video'
  ).evaluate(video => {
    let currentTime = 0;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: value => { currentTime = value; }
    });
    video.dispatchEvent(new Event('loadedmetadata'));
    return currentTime;
  });
  expect(startTime).toBe(0);
});

test('pinned wedding sequence starts each R2 film as it enters the scroll transition', async ({ page }) => {
  await page.addInitScript(() => {
    window.__evrPlayCalls = [];
    HTMLMediaElement.prototype.play = function() {
      window.__evrPlayCalls.push(this.closest('[data-r2-slot]')?.dataset.r2Slot);
      return Promise.resolve();
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  const sequence = page.locator('#home [data-film-sequence="wedding"]');
  const track = sequence.locator('.film-sequence-track');
  const getScrollPosition = async progress => track.evaluate((element, requestedProgress) => {
    const stage = element.querySelector('.film-sequence-stage');
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    const start = element.getBoundingClientRect().top + scrollY - top;
    const travel = element.offsetHeight - stage.offsetHeight;
    return start + travel * requestedProgress;
  }, progress);
  const scrollToSequenceProgress = async progress => {
    await page.evaluate(top => scrollTo(0, top), await getScrollPosition(progress));
  };
  const expectClipToStart = async (slot, progress) => {
    await scrollToSequenceProgress(progress);
    await expect.poll(() => page.evaluate(expectedSlot =>
      window.__evrPlayCalls.includes(expectedSlot), slot
    )).toBe(true);
  };

  await expectClipToStart('video_2026-10-31_07-40-33.mp4', .08);
  await scrollToSequenceProgress(.2);
  const weddingPanels = sequence.locator('[data-film-panel]');
  await expect.poll(() => weddingPanels.nth(0).evaluate(panel => Number(panel.style.opacity))).toBeGreaterThan(.999);
  await expect(weddingPanels.nth(0)).toHaveAttribute('style', /translateX\(0vw\)/);
  await expectClipToStart('anna (2).mp4', .36);
  await expectClipToStart('anna.mp4', .61);
  await expectClipToStart('couple 01.mp4', .95);
});

test('wedding side titles leave room for the video on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  const sequence = page.locator('#home [data-film-sequence="wedding"]');
  await sequence.evaluate(section => {
    const stage = section.querySelector('.film-sequence-stage');
    const track = section.querySelector('.film-sequence-track');
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    const start = track.getBoundingClientRect().top + window.scrollY - top;
    const travel = track.offsetHeight - stage.offsetHeight;
    window.scrollTo(0, start + travel * .4);
  });
  await expect(sequence).toHaveAttribute('data-progress', /0\.4/);

  const layout = await sequence.evaluate(section => {
    const video = section.querySelector('[data-film-panel][data-active="true"] .preview-media').getBoundingClientRect();
    const left = section.querySelector('.wedding-side-title-left').getBoundingClientRect();
    const right = section.querySelector('.wedding-side-title-right').getBoundingClientRect();
    return {
      videoLeft: video.left,
      videoRight: video.right,
      leftTitleRight: left.right,
      rightTitleLeft: right.left,
      viewportWidth: window.innerWidth,
      leftTitleOpacity: Number.parseFloat(getComputedStyle(section.querySelector('.wedding-side-title-left')).opacity),
      rightTitleOpacity: Number.parseFloat(getComputedStyle(section.querySelector('.wedding-side-title-right')).opacity),
      videoCenter: video.top + video.height / 2,
      leftTitleCenter: left.top + left.height / 2,
      rightTitleCenter: right.top + right.height / 2,
      panelCenter: (video.top + section.querySelector('[data-film-panel][data-active="true"] .film-panel-caption').getBoundingClientRect().bottom) / 2,
      headerBottom: document.querySelector('header').getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight
    };
  });
  expect(layout.videoLeft).toBeGreaterThanOrEqual(layout.leftTitleRight);
  expect(layout.videoRight).toBeLessThanOrEqual(layout.rightTitleLeft);
  expect(layout.videoRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(Math.abs(layout.videoCenter - layout.leftTitleCenter)).toBeLessThanOrEqual(10);
  expect(Math.abs(layout.videoCenter - layout.rightTitleCenter)).toBeLessThanOrEqual(10);
  expect(Math.abs(layout.panelCenter - (layout.headerBottom + layout.viewportHeight) / 2)).toBeLessThan(80);
  expect(layout.leftTitleOpacity).toBeGreaterThan(0);
  expect(layout.rightTitleOpacity).toBeGreaterThan(0);
  await expect(sequence.locator('.wedding-side-title-left')).toHaveCSS('font-size', '11px');
  await expect(sequence.locator('.wedding-side-title-right')).toHaveCSS('font-size', '11px');
  const panelOpacities = await sequence.locator('[data-film-panel]').evaluateAll(panels =>
    panels.map(panel => Number(getComputedStyle(panel).opacity))
  );
  expect(panelOpacities.filter(opacity => opacity > .02)).toHaveLength(1);
});

test('wedding side titles are enlarged on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 760 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/home');

  const sequence = page.locator('#home [data-film-sequence="wedding"]');
  await expect(sequence.locator('.wedding-side-title')).toHaveCount(2);
  const fontSize = await sequence.locator('.wedding-side-title-left').evaluate(element =>
    Number.parseFloat(getComputedStyle(element).fontSize)
  );
  expect(fontSize).toBeGreaterThanOrEqual(23);
});

test('all playable NBrands videos use Cloudflare R2', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const externalVideoRequests = [];
  page.on('request', request => {
    if (/youtube/i.test(request.url())) externalVideoRequests.push(request.url());
  });
  await page.goto('/#/corporate');

  await expect(page.locator('#corporate iframe')).toHaveCount(0);
  await expect(page.locator('#corporate [data-r2-video-url]')).toHaveCount(4);
  const hero = page.locator('#corporate .corp-hero-media .preview-media');
  await expect(hero).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Reel%204.mp4'
  );
  const heroVideo = hero.locator('video');
  await expect(heroVideo).toHaveAttribute(
    'src',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Reel%204.mp4'
  );
  expect(await heroVideo.evaluate(video => video.muted)).toBe(true);
  const videoSources = await page.locator('video').evaluateAll(elements =>
    elements.map(element => element.getAttribute('src')).filter(Boolean)
  );
  expect(videoSources.every(source => new URL(source).hostname === 'pub-aefcf27121ff450faf8570e9de489735.r2.dev')).toBe(true);
  expect(externalVideoRequests).toEqual([]);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const reelCard = page.locator('#corporate .corp-reel-card[data-r2-slot="corporate-presenter"]');
  await reelCard.scrollIntoViewIfNeeded();
  const reelVideo = reelCard.locator('video');
  await expect(reelVideo).toHaveAttribute('src', /pub-aefcf27121ff450faf8570e9de489735\.r2\.dev/);
  expect(await reelVideo.evaluate(video => video.muted)).toBe(true);
});
