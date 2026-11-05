const { test, expect } = require('@playwright/test');
const { mockAdminApi } = require('./admin-api-mock');

test('public pages do not expose demo or illustration disclaimers', async ({ page }) => {
  const routes = [
    'home', 'about', 'weddings', 'work', 'process', 'estimate',
    'corporate', 'services', 'approach', 'brand-work', 'production-quote', 'request'
  ];
  const staleCopy = /ILLUSTRATIONS\s*\/\s*EVR MEDIA TO FOLLOW|ORIGINAL CONCEPT ART|DESIGN DEMONSTRATION|ORIGINAL ILLUSTRATIONS|SAMPLE ESTIMATE|SAMPLE QUOTE|SAMPLE QUOTATION|DEMONSTRATION ONLY|ILLUSTRATIVE RATES|SAMPLE CLIENT|NOT VALID FOR BOOKING|EXAMPLE BRIEF|PLACEHOLDER PROJECT|LAYOUT EXAMPLE|ILLUSTRATIVE MOTION/i;

  for (const route of routes) {
    await page.goto(`/#/${route}`);
    const visibleText = await page.locator('.route:not([hidden])').innerText();
    expect(visibleText, `outdated demo or illustration copy on ${route}`).not.toMatch(staleCopy);
  }

  await page.goto('/sample-quotation.html');
  const quotationText = await page.locator('body').innerText();
  expect(quotationText, 'outdated sample quotation copy').not.toMatch(staleCopy);
});

test('public pages render while shared content is still loading', async ({ page }) => {
  await page.route('**/api/content', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto('/#/home');
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#home h1')).toBeVisible();
});

test('below-the-fold wedding film defers its Cloudflare source until visible', async ({ page }) => {
  const videoUrl = 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Half%20Saree%20Cropped/video_2026-10-31_07-42-11.mp4';
  await page.route('https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/**', route => route.abort());
  await page.goto('/#/weddings');
  const video = page.locator('#celebration-film video');
  const source = video.locator('source');
  await expect(source).toHaveAttribute('data-src', videoUrl);
  expect(await source.getAttribute('src')).toBeNull();
  await video.scrollIntoViewIfNeeded();
  await expect(source).toHaveAttribute('src', videoUrl);
  await expect(source).not.toHaveAttribute('data-src');
});

test('wedding homepage stays focused and the experience switch opens Brand Production', async ({ page }) => {
  await page.goto('/#/home');

  await expect(page.locator('.demo-bar')).toHaveCount(0);
  const weddingSwitch = page.locator('.experience-switch [data-experience="home"]');
  const nbrandsSwitch = page.locator('.experience-switch [data-experience="corporate"]');
  await expect(weddingSwitch).toHaveText('Weddings & Events');
  await expect(nbrandsSwitch).toHaveText('Brand Production');
  await expect(page.locator('#home')).toBeVisible();
  await expect(page).toHaveTitle('Weddings & Events | EVR Productions');
  await expect(page.locator('#main-nav [data-nav-experience="home"]')).toContainText(
    /Wedding ServicesWedding StoriesOur ProcessAbout EVRContact/
  );
  await expect(page.locator('footer [data-nav-experience="home"]')).toContainText(
    /Wedding ServicesWedding StoriesOur ProcessAbout EVR/
  );
  await expect(page.locator('.site-footer .footer-feature[data-footer-experience="home"]')).toBeVisible();
  await expect(page.locator('.site-footer .footer-main[data-footer-experience="home"]')).toBeVisible();
  await expect(page.locator('.site-footer .footer-feature[data-footer-experience="corporate"]')).toBeHidden();
  await expect(page.locator('.site-footer .footer-main[data-footer-experience="corporate"]')).toBeHidden();
  await expect(page.locator('footer [data-nav-experience="home"]')).toBeVisible();
  await expect(page.locator('footer [data-nav-experience="corporate"]')).toBeHidden();
  const weddingFooterTypography = await page.locator('.site-footer .footer-nav-group[data-nav-experience="home"]').evaluate(element => ({
    heading: getComputedStyle(element.querySelector('h2')).fontFamily,
    link: getComputedStyle(element.querySelector('a')).fontFamily
  }));
  expect(weddingFooterTypography.heading).toContain('Georgia');
  expect(weddingFooterTypography.link).toContain('Georgia');
  const weddingFooterFeatureTypography = await page.locator('.site-footer .footer-feature[data-footer-experience="home"]').evaluate(element => {
    const heading = getComputedStyle(element.querySelector('h2'));
    const paragraph = getComputedStyle(element.querySelector('.footer-feature-content > p:not(.eyebrow)'));
    return {
      headingFamily: heading.fontFamily,
      headingSize: heading.fontSize,
      headingLineHeight: heading.lineHeight,
      paragraphFamily: paragraph.fontFamily,
      paragraphSize: paragraph.fontSize,
      paragraphLineHeight: paragraph.lineHeight
    };
  });

  const sharedCreditText = await page.locator('.site-credit').innerText();
  const weddingFooterColor = await page.locator('.site-footer').evaluate(element => getComputedStyle(element).backgroundColor);

  const weddingContent = await page.locator('#home').innerText();
  expect(weddingContent).not.toMatch(/\b(?:brand|corporate|podcast)\b/i);
  expect(weddingContent).not.toMatch(/\bfunctions?\b/i);
  await expect(page.locator('#home .hero-copy .eyebrow')).toContainText('WEDDINGS & EVENTS');
  await expect(page.locator('#home .service-strip, #home .format-ribbon')).toHaveCount(0);
  await expect(page.locator('#home .celebration-choice-section')).toContainText('WEDDINGS, EVENTS & FAMILY');
  await expect(page.locator('#home .celebration-service-links')).toContainText('Events & celebrations');
  await expect(page.locator('#home .corp-client-spotlight')).toHaveCount(0);
  await expect(page.locator('#date-service option')).toHaveCount(4);

  await nbrandsSwitch.click();
  await expect(page).toHaveURL(/#\/corporate$/);
  await expect(page.locator('#corporate')).toBeVisible();
  await expect(page).toHaveTitle('Brand Production | EVR Productions');
  await expect(page.locator('#main-nav [data-nav-experience="corporate"]')).toContainText(
    /ServicesOur ProcessBrand PortfolioAbout EVRContact/
  );
  await expect(page.locator('footer [data-nav-experience="corporate"]')).toContainText(
    /Brand Production homeServicesOur ProcessBrand Portfolio/
  );
  await expect(page.locator('.site-footer .footer-feature[data-footer-experience="home"]')).toBeHidden();
  await expect(page.locator('.site-footer .footer-main[data-footer-experience="home"]')).toBeHidden();
  await expect(page.locator('.site-footer .footer-feature[data-footer-experience="corporate"]')).toBeVisible();
  await expect(page.locator('.site-footer .footer-main[data-footer-experience="corporate"]')).toBeVisible();
  const brandFooterTypography = await page.locator('.site-footer .footer-nav-group[data-nav-experience="corporate"]').evaluate(element => ({
    heading: getComputedStyle(element.querySelector('h2')).fontFamily,
    link: getComputedStyle(element.querySelector('a')).fontFamily
  }));
  expect(brandFooterTypography.heading).toContain('Georgia');
  expect(brandFooterTypography.link).toContain('Georgia');
  await expect(page.locator('.site-footer .corporate-footer-feature')).toContainText('Stories that move people.');
  await expect(page.locator('.site-footer .corporate-footer-feature')).toContainText(
    'we turn your ideas into stories your audience will remember.'
  );
  await expect(page.locator('.site-footer .corporate-footer-feature .footer-feature-content a'))
    .toContainText('Start a brand project');
  const footerHeadingStyle = await page.locator('.corporate-footer-feature h2').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      textTransform: style.textTransform
    };
  });
  expect(footerHeadingStyle.fontFamily).toContain('Georgia');
  expect({
    headingFamily: footerHeadingStyle.fontFamily,
    headingSize: footerHeadingStyle.fontSize,
    headingLineHeight: footerHeadingStyle.lineHeight
  }).toEqual({
    headingFamily: weddingFooterFeatureTypography.headingFamily,
    headingSize: weddingFooterFeatureTypography.headingSize,
    headingLineHeight: weddingFooterFeatureTypography.headingLineHeight
  });
  expect(footerHeadingStyle.textTransform).toBe('none');
  const brandFooterParagraphTypography = await page.locator('.corporate-footer-feature .footer-feature-content > p:not(.eyebrow)').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      paragraphFamily: style.fontFamily,
      paragraphSize: style.fontSize,
      paragraphLineHeight: style.lineHeight
    };
  });
  expect(brandFooterParagraphTypography).toEqual({
    paragraphFamily: weddingFooterFeatureTypography.paragraphFamily,
    paragraphSize: weddingFooterFeatureTypography.paragraphSize,
    paragraphLineHeight: weddingFooterFeatureTypography.paragraphLineHeight
  });
  await expect(page.locator('.site-footer .corporate-footer-feature .footer-film-video'))
    .toHaveAttribute('data-src', 'assets/nbrands-footer-background.mp4');
  await expect(page.locator('.site-footer .corporate-footer-main')).toContainText('Production for brands and businesses');
  expect(await page.locator('.site-footer').evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(weddingFooterColor);
  expect(await page.locator('.site-footer .corporate-footer-feature').evaluate(element => getComputedStyle(element).backgroundImage))
    .toContain('nbrands-footer-poster.jpg');
  await expect(page.locator('.site-credit')).toHaveCount(1);
  await expect(page.locator('.site-credit')).toHaveText(sharedCreditText);
  expect(await page.locator('.site-credit').evaluate(element => getComputedStyle(element).backgroundColor))
    .toBe(await page.locator('.site-footer').evaluate(element => getComputedStyle(element).backgroundColor));
  await expect(page.locator('.site-credit .footer-back-top')).toHaveAttribute('href', '#/corporate');
  await expect(page.locator('footer [data-nav-experience="home"]')).toBeHidden();
  await expect(page.locator('footer [data-nav-experience="corporate"]')).toBeVisible();
  await page.locator('#main-nav [data-nav-experience="corporate"] a[href="#/services"]').click();
  await expect(page).toHaveURL(/#\/services$/);
  await expect(page.locator('#services')).toBeVisible();
  const serviceChapters = page.locator('#services #service-chapters');
  await expect(serviceChapters).toBeVisible();
  await expect(serviceChapters.locator('.chapter-panel')).toHaveCount(4);
  await expect(page.locator('#corporate #service-chapters')).toHaveCount(0);
  await expect(page.locator('#services [data-scroll-to="service-chapters"]')).toBeEnabled();
  await page.locator('#services [data-scroll-to="service-chapters"]').click();
  await expect(serviceChapters).toBeInViewport();
  await expect(serviceChapters.locator('[data-scroll-to="service-scope"]')).toBeEnabled();
  const serviceScope = page.locator('#service-scope');
  await expect(page.locator('#services [data-scroll-to="service-scope"]')).toBeEnabled();
  await page.locator('#services [data-scroll-to="service-scope"]').click();
  await expect(serviceScope).toBeInViewport();
  await page.locator('#main-nav [data-nav-experience="corporate"] a[href="#/approach"]').click();
  await expect(page).toHaveURL(/#\/approach$/);
  await expect(page.locator('#approach')).toBeVisible();
  await page.locator('#main-nav [data-nav-experience="corporate"] a[href="#/brand-work"]').click();
  await expect(page).toHaveURL(/#\/brand-work$/);
  await expect(page.locator('#brand-work')).toBeVisible();
  const caseStudyMedia = page.locator('#brand-work .case-study-video-media');
  const caseStudyVideo = caseStudyMedia.locator('video');
  await expect(caseStudyVideo).toHaveAttribute('data-src', 'assets/nbrands-case-study-cphtij.mp4');
  expect(await caseStudyVideo.getAttribute('src')).toBeNull();
  await caseStudyMedia.scrollIntoViewIfNeeded();
  await expect(caseStudyVideo).toHaveAttribute('src', 'assets/nbrands-case-study-cphtij.mp4');
  await expect(caseStudyVideo).toHaveAttribute('data-viewport-autoplay', '');
  await expect(caseStudyVideo).toHaveAttribute('muted', '');
  await expect(caseStudyVideo).toHaveAttribute('loop', '');
  await expect(caseStudyVideo).toHaveAttribute('playsinline', '');
  await expect.poll(() => caseStudyVideo.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => caseStudyVideo.evaluate(video => video.paused)).toBe(false);
  expect(await caseStudyVideo.evaluate(video => [video.videoWidth, video.videoHeight])).toEqual([1080, 1920]);
  expect(await caseStudyVideo.evaluate(video => getComputedStyle(video).objectFit)).toBe('contain');
  expect(await caseStudyMedia.evaluate(media =>
    Math.abs(media.clientWidth / media.clientHeight - 9 / 16) < 0.01
  )).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => caseStudyVideo.evaluate(video => video.paused)).toBe(true);
  await page.goto('/#/corporate');
  await expect(page.locator('#corporate #corp-work')).toHaveCount(0);
  await expect(page.locator('#corporate')).toContainText(/podcasts/i);
  const clientSpotlight = page.locator('#corporate .corp-client-spotlight');
  await expect(clientSpotlight).toBeVisible();
  expect(await page.locator('#corporate').evaluate(root =>
    root.querySelector('.corp-hero').nextElementSibling === root.querySelector('.corp-client-spotlight')
  )).toBe(true);
  await expect(page.locator('#corporate .corp-format-strip')).toHaveCount(0);
  await expect(page.locator('#corporate .corp-capabilities')).toHaveCount(0);
  const homeServices = page.locator('#corp-services');
  await expect(homeServices).toBeVisible();
  await expect(homeServices.locator('.corp-service-panel')).toHaveCount(4);
  await expect(homeServices.locator('.corp-service-nav button')).toHaveText([
    '01Brand films ↗',
    '02Marketing reels ↗',
    '03YouTube ↗',
    '04Podcasts ↗'
  ]);
  const marquee = page.locator('#corporate .corp-tech-strip');
  await expect(marquee).toBeVisible();
  await expect(marquee).toContainText('ONE CONNECTED PRODUCTION');
  await expect(page.locator('#corporate .corp-funnel-steps article')).toHaveCount(3);
  await expect(page.locator('#corporate .corp-production-band')).toBeVisible();
  await expect(page.locator('#corporate .corp-proof')).toHaveCount(0);
  await expect(page.locator('#corporate .corp-metrics [data-count]')).toHaveCount(4);
  expect(await page.locator('#corporate').evaluate(root => {
    const clients = root.querySelector('.corp-client-spotlight');
    const services = root.querySelector('#corp-services');
    return Boolean(clients.compareDocumentPosition(services) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect(clientSpotlight.locator('ul[aria-label] li')).toHaveCount(17);
  await expect(clientSpotlight.locator('.corp-client-loop-copy')).toHaveCount(2);
  await expect(clientSpotlight.locator('.corp-client-loop-copy').first()).toHaveAttribute('aria-hidden', 'true');
  const clientMarquees = clientSpotlight.locator('.corp-client-marquee');
  await expect(clientMarquees).toHaveCount(2);
  await expect(clientMarquees.first()).toHaveAttribute('tabindex', '0');
  expect(await clientMarquees.first().evaluate(element => {
    const track = element.querySelector('.corp-client-marquee-track');
    return {
      duration: getComputedStyle(track).animationDuration,
      mask: getComputedStyle(element).maskImage,
      highlight: getComputedStyle(element.querySelector('ul[aria-label] li')).textDecorationLine
    };
  })).toMatchObject({ duration: '48s', highlight: 'underline' });
  await clientMarquees.first().focus();
  await expect.poll(() => clientMarquees.first().locator('.corp-client-marquee-track')
    .evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused');
  await expect(clientSpotlight).toContainText('Shine Ad Agency');
  await expect(clientSpotlight).toContainText('Pica Chess Academy');
  await expect(clientSpotlight).toContainText('Abhinava Kavi');
  await expect(page.locator('#corporate .corp-process')).toHaveCount(0);
  const serviceJump = page.locator('#corporate [data-corp-jump="corp-services"]');
  await expect(serviceJump).toBeEnabled();
  await serviceJump.click();
  await expect(homeServices).toBeInViewport();
  await expect(homeServices.locator('[data-corp-jump="corp-approach"]')).toBeEnabled();

  await weddingSwitch.click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.locator('#home')).toBeVisible();
});

test('legacy saved menu labels are replaced across the site routes', async ({ page }) => {
  await mockAdminApi(page, {
    version: 1,
    entries: {
      '#main-nav/div:0/a:0': { type: 'text', value: 'Weddings &amp; Events' },
      '#main-nav/div:0/a:1': { type: 'text', value: 'Our work' }
    }
  }, false);

  const homeRoutes = ['home', 'weddings', 'work', 'process', 'about', 'estimate'];
  for (const route of homeRoutes) {
    await page.goto(`/#/${route}`);
    await expect(page.locator(`#${route}`)).toBeVisible();
    const menu = page.locator('#main-nav [data-nav-experience="home"]');
    await expect(menu).toContainText('Wedding Services');
    await expect(menu).toContainText('Wedding Stories');
    await expect(menu).not.toContainText('Our work');
  }

  const corporateRoutes = ['corporate', 'services', 'approach', 'brand-work', 'production-quote', 'request'];
  for (const route of corporateRoutes) {
    await page.goto(`/#/${route}`);
    await expect(page.locator(`#${route}`)).toBeVisible();
    const menu = page.locator('#main-nav [data-nav-experience="corporate"]');
    await expect(menu).toContainText('Services');
    await expect(menu).toContainText('Our Process');
    await expect(menu).toContainText('Brand Portfolio');
  }
});

test('Corporate scroll effects reveal by section and honor reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/corporate');

  const corporate = page.locator('#corporate');
  await expect(corporate).toHaveClass(/corp-motion-ready/);
  await expect(corporate.locator('.corp-format-list')).toHaveCount(0);
  await expect(corporate.locator('.corp-work-card')).toHaveCount(0);
  await expect(corporate.locator('.corp-video-story.corp-scroll-reveal')).toHaveCount(3);
  const clientChip = corporate.locator('.corp-client-groups ul[aria-label] li').first();
  await corporate.locator('.corp-client-marquee-track').evaluateAll(tracks =>
    tracks.forEach(track => { track.style.animationPlayState = 'paused'; })
  );
  await clientChip.scrollIntoViewIfNeeded();
  await expect(clientChip).toHaveClass(/corp-scroll-reveal/);
  await expect(clientChip).toHaveClass(/is-visible/);

  const finalVideo = corporate.locator('.corp-final-video');
  await expect(finalVideo).toHaveAttribute('data-r2-background-slot', 'corporate-studio-background');
  await expect(finalVideo).toHaveAttribute('data-corp-ambient', '');
  expect(await finalVideo.getAttribute('src')).toBeNull();
  await corporate.locator('.corp-final-content').scrollIntoViewIfNeeded();
  await expect(corporate.locator('.corp-final-content')).toHaveClass(/is-visible/);
  await expect(finalVideo).toHaveAttribute(
    'src',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/evr-videos/89721c74-832d-4fef-804a-4be8761574f7.mp4'
  );
  await expect.poll(() => finalVideo.evaluate(video => video.style.getPropertyValue('--corp-final-parallax')))
    .not.toBe('');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(corporate).not.toHaveClass(/corp-motion-ready/);
  await expect.poll(() => clientChip.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  await expect.poll(() => corporate.locator('.corp-client-marquee-track').first()
    .evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await expect.poll(() => corporate.locator('.corp-funnel-steps article').first()
    .evaluate(element => getComputedStyle(element).transform)).toBe('none');
});

test('Corporate campaign stages remain visible together without scroll pinning', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/#/corporate');

    const funnel = page.locator('#corporate .corp-funnel');
    const steps = funnel.locator('[data-funnel-stage]');
    await expect(funnel).not.toHaveClass(/is-pinned/);
    await expect(steps).toHaveCount(3);
    await funnel.scrollIntoViewIfNeeded();

    const layout = await steps.evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        opacity: style.opacity,
        transform: style.transform,
        columns: getComputedStyle(element.parentElement).gridTemplateColumns.split(' ').length
      };
    }));
    expect(layout.every(card => card.opacity === '1' && card.transform === 'none')).toBe(true);
    if (viewport.width > 700) {
      expect(layout.every(card => card.top >= 0 && card.bottom <= viewport.height)).toBe(true);
      expect(layout.every(card => Math.abs(card.top - layout[0].top) < 2)).toBe(true);
      expect(layout.every(card => card.columns === 3)).toBe(true);
    } else {
      expect(await steps.evaluateAll(elements =>
        elements.every(element => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility === 'visible')
      )).toBe(true);
      expect(layout[1].top).toBeGreaterThan(layout[0].bottom);
      expect(layout[2].top).toBeGreaterThan(layout[1].bottom);
    }
  }
});

test('weddings page uses the supplied portrait photos instead of concept artwork', async ({ page }) => {
  await page.goto('/#/weddings');

  await expect(page.locator('#weddings .inner-hero-media img')).toHaveAttribute(
    'src',
    'assets/wedding-couple-portrait.jpg'
  );
  const chapterImages = page.locator('#weddings .chapter-art img');
  await expect.poll(() => chapterImages.evaluateAll(images => images.map(image => image.getAttribute('src'))))
    .toEqual([
      'assets/wedding-pre-ceremony-couple.jpg',
      'assets/wedding-family-hug.jpg',
      'assets/wedding-traditional-embrace.jpg'
    ]);
  await chapterImages.evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await expect(page.locator('#weddings .detail-note')).toHaveCount(0);
});

test('EVR Brand Studio Services selector advances through its four formats', async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/services');

  const selector = page.locator('#services #service-chapters');
  await expect(selector).toHaveClass(/is-chapter-pinned/);
  const reelsTab = selector.locator('[data-story-step="1"]');
  await expect(reelsTab).toBeEnabled();
  await reelsTab.click();
  await expect.poll(() => selector.getAttribute('data-step')).toBe('1');
  await expect(selector.locator('.chapter-panel.is-current .chapter-copy h3')).toContainText('Start strong.');
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

test('work portfolio autoplays selected R2 films muted with an audio toggle', async ({ page }) => {
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
  await expect.poll(() => previewVideo.evaluate(video => video.dataset.playRequested)).toBe('true');
  await expect(previewVideo).toBeVisible();
  await expect(firstPreview.locator('.preview-play')).toBeHidden();
  await expect(firstPreview.locator('.preview-audio-toggle')).toBeVisible();
  expect(await previewVideo.evaluate(video => video.autoplay)).toBe(true);
  expect(await previewVideo.evaluate(video => video.loop)).toBe(true);
  await expect(previewVideo).toHaveAttribute('src', /pub-aefcf27121ff450faf8570e9de489735\.r2\.dev/);
  expect(await previewVideo.evaluate(video => ({
    muted: video.muted,
    autoplay: video.autoplay,
    loop: video.loop,
    controls: video.controls,
    playRequested: video.dataset.playRequested
  }))).toEqual({ muted: true, autoplay: true, loop: true, controls: false, playRequested: 'true' });
  const audioToggle = firstPreview.locator('.preview-audio-toggle');
  await expect(audioToggle).toHaveAttribute('aria-label', 'Unmute video');
  await audioToggle.click();
  await expect(audioToggle).toHaveAttribute('aria-label', 'Mute video');
  await expect(page.locator('#corporate .corp-reel-card[data-r2-slot="corporate-healthcare-explainer"]')).toHaveAttribute(
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
  await page.setViewportSize({ width: 701, height: 900 });
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

test('failed homepage video playback leaves only its cover image visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/home');
  const preview = page.locator('#home [data-demo-media]').first();
  const video = preview.locator('video');
  await video.evaluate(element => element.dispatchEvent(new Event('error')));

  await expect(preview.locator('img')).toBeVisible();
  await expect(video).toBeHidden();
  await expect(preview.locator('.preview-play')).toBeHidden();
  await expect(preview.locator('.preview-audio-toggle')).toBeHidden();
  await expect(preview.locator('.media-error')).toBeHidden();
});

test('all visible work portfolio videos autoplay muted', async ({ page }) => {
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
    await expect.poll(() => video.evaluate(element => element.dataset.playRequested)).toBe('true');
    await expect(video).toBeVisible();
    await expect(preview.locator('.preview-play')).toBeHidden();
    await expect(preview.locator('.preview-audio-toggle')).toBeVisible();
    expect(await video.evaluate(element => element.autoplay)).toBe(true);
    expect(await video.evaluate(element => element.muted)).toBe(true);
    expect(await video.evaluate(element => element.loop)).toBe(true);
    expect(await video.evaluate(element => element.controls)).toBe(false);
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

  const videoActions = page.locator('.admin-media-actions .admin-media-menu-action[aria-label="Replace video"]');
  await expect(videoActions).toHaveCount(4);
});

test('process stages use real EVR wedding images and the actual project workflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/home');

  const process = page.locator('#home #process-story');
  await expect(process.locator('.phone-top [data-brand-logo]')).toHaveAttribute(
    'src',
    '/assets/evr-productions-logo-light.png'
  );
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
  const weddingStoryPhotos = await process.locator('[data-phone-screen="4"] .phone-gallery img').evaluateAll(images =>
    images.map(image => image.getAttribute('src'))
  );
  expect(weddingStoryPhotos).toEqual([
    'assets/video-posters/r2/wedding-sri-shashi-ravi-teja-reception.jpg',
    'assets/video-posters/r2/wedding-sri-shashi-ravi-teja-dance.jpg',
    'assets/video-posters/r2/wedding-sri-shashi-ravi-teja-outdoor.jpg',
    'assets/video-posters/r2/wedding-sri-shashi-ravi-teja-ceremony.jpg'
  ]);
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
    if (viewport.width <= 700) {
      const phoneBounds = await process.locator('.phone-shell').evaluate(phone => ({
        height: Number.parseFloat(getComputedStyle(phone).height),
        bottom: phone.getBoundingClientRect().bottom
      }));
      expect(phoneBounds.height).toBeGreaterThanOrEqual(380);
      expect(phoneBounds.bottom).toBeLessThanOrEqual(viewport.height);
    }
    const noticeClearance = await process.evaluate(root => {
      const phone = root.querySelector('.phone-shell').getBoundingClientRect();
      const notice = root.querySelector('.phone-notice').getBoundingClientRect();
      return notice.top - phone.bottom;
    });
    expect(noticeClearance).toBeGreaterThanOrEqual(0);
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

test('wedding story cards stay static and visible while scrolling on mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const width of [390, 700]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/home');
    const sequence = page.locator('#home [data-film-sequence="wedding"]');
    await expect(sequence).not.toHaveClass(/is-pinned/);
    await expect(sequence.locator('.section-heading > p')).toBeHidden();
    const panels = sequence.locator('[data-film-panel]');
    await expect(panels).toHaveCount(4);
    const initialLayout = await panels.evaluateAll(elements => elements.map(panel => {
      const style = getComputedStyle(panel);
      return {
        position: style.position,
        opacity: Number(style.opacity),
        visibility: style.visibility,
        transform: style.transform
      };
    }));
    expect(initialLayout.every(panel =>
      panel.position === 'relative' && panel.opacity === 1
      && panel.visibility === 'visible' && panel.transform === 'none'
    )).toBe(true);

    await sequence.scrollIntoViewIfNeeded();
    await page.evaluate(() => scrollBy(0, 400));
    await expect(sequence).not.toHaveAttribute('data-sequence-index', /.+/);
    const visiblePanels = await panels.evaluateAll(elements =>
      elements.filter(panel => getComputedStyle(panel).visibility === 'visible').length
    );
    expect(visiblePanels).toBe(4);
  }
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

test('all playable EVR Brand Studio videos use Cloudflare R2', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const externalVideoRequests = [];
  const backgroundRequests = [];
  page.on('request', request => {
    if (/youtube/i.test(request.url())) externalVideoRequests.push(request.url());
    if (request.url().includes('89721c74-832d-4fef-804a-4be8761574f7.mp4')) {
      backgroundRequests.push(request.url());
    }
  });
  await page.goto('/#/home');
  expect(await page.locator('#corporate .corp-hero-bg video').getAttribute('src')).toBeNull();
  expect(await page.locator('#corporate .corp-final-video').getAttribute('src')).toBeNull();
  expect(backgroundRequests).toHaveLength(0);
  await page.goto('/#/corporate');

  await expect(page.locator('#corporate iframe')).toHaveCount(0);
  await expect(page.locator('#corporate [data-r2-video-url]')).toHaveCount(4);
  const approach = page.locator('#corp-approach');
  await expect(approach.locator('.corp-video-story')).toHaveCount(3);
  await expect(approach.locator('.corp-bento')).toHaveCount(0);
  await expect(page.locator('#corporate .corp-reel-section')).toHaveCount(1);
  await expect(approach.locator('.corp-video-story h3')).toHaveText([
    'A room ready to celebrate.',
    'A healthcare story, made human.',
    'Show the product in trusted hands.'
  ]);
  await expect(approach.locator('.corp-video-copy p')).toHaveCount(3);
  expect(await approach.locator('.corp-reel-card').evaluateAll(cards => cards.map(card => card.dataset.r2Slot))).toEqual([
    'corporate-event-space',
    'corporate-healthcare-explainer',
    'corporate-product-story'
  ]);
  await expect(approach.locator('[data-r2-slot="corporate-event-detail"]')).toHaveCount(0);
  await expect(approach.locator('[data-r2-slot="corporate-event-space"]')).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/evr-videos/866aac4c-064f-4d22-9c71-7901cceecea9.mp4'
  );
  expect(await approach.locator('.corp-reel-card').evaluateAll(media => media.every(item => {
    const { width, height } = getComputedStyle(item);
    return Number.parseFloat(height) > Number.parseFloat(width);
  }))).toBe(true);
  const hero = page.locator('#corporate .corp-hero-media .preview-media');
  await expect(hero).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/video_2026-10-31_07-41-51.mp4'
  );
  const heroVideo = hero.locator('video');
  await expect(heroVideo).toHaveAttribute(
    'src',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/video_2026-10-31_07-41-51.mp4'
  );
  const heroBackground = page.locator('#corporate .corp-hero-bg video');
  await expect(heroBackground).toHaveAttribute(
    'src',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/evr-videos/89721c74-832d-4fef-804a-4be8761574f7.mp4'
  );
  await expect.poll(() => backgroundRequests.length).toBeGreaterThan(0);
  await expect(page.locator('#corporate .corp-hero-bg')).toHaveCSS('opacity', '0.22');
  await expect(heroBackground).toHaveCSS('object-fit', 'cover');
  await expect(heroBackground).toHaveAttribute('poster', 'assets/video-posters/r2/nbrands-empty-studio.jpg');
  await expect(hero.locator('img')).toHaveAttribute('src', 'assets/video-posters/r2/brand-expo-highlights.jpg');
  await expect(page.locator('#corporate .corp-media-caption')).toContainText('BRAND EXHIBITION HIGHLIGHTS');
  await expect(hero.locator('.preview-audio-toggle')).toBeVisible();
  expect(await heroVideo.evaluate(video => video.muted)).toBe(true);
  const heroAudio = hero.locator('.preview-audio-toggle');
  await expect(heroAudio).toHaveAttribute('aria-label', 'Unmute video');
  await heroAudio.click();
  expect(await heroVideo.evaluate(video => video.muted)).toBe(false);
  await expect(heroAudio).toHaveAttribute('aria-label', 'Mute video');
  await heroAudio.click();
  expect(await heroVideo.evaluate(video => video.muted)).toBe(true);
  const videoSources = await page.locator('video').evaluateAll(elements =>
    elements.map(element => element.getAttribute('src')).filter(Boolean)
  );
  expect(videoSources.every(source => new URL(source).hostname === 'pub-aefcf27121ff450faf8570e9de489735.r2.dev')).toBe(true);
  expect(externalVideoRequests).toEqual([]);

  for (const card of await approach.locator('.corp-reel-card').all()) {
    await card.scrollIntoViewIfNeeded();
    const video = card.locator('video.r2-autoplay-preview');
    const audio = card.locator('.preview-audio-toggle');
    await expect(video).toHaveAttribute('src', /pub-aefcf27121ff450faf8570e9de489735\.r2\.dev/);
    await expect(audio).toBeVisible();
    await expect(audio).toHaveAttribute('aria-label', 'Unmute video');
    expect(await video.evaluate(element => element.muted)).toBe(true);
    await audio.click();
    await expect(audio).toHaveAttribute('aria-label', 'Mute video');
    expect(await video.evaluate(element => element.muted)).toBe(false);
    await audio.click();
    expect(await video.evaluate(element => element.muted)).toBe(true);
  }
  expect(await approach.locator('[data-r2-video-url]').evaluateAll(cards =>
    cards.every(card => !card.dataset.r2VideoUrl.includes('07-41-51'))
  )).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const fourthStory = page.locator('#corp-approach .corp-video-story').last();
  expect(await fourthStory.locator('.corp-reel-card').evaluate(media => {
    const { width, height } = getComputedStyle(media);
    return Number.parseFloat(height) > Number.parseFloat(width);
  })).toBe(true);
});

test('EVR Brand Studio cards use matching supplied artwork and production stills', async ({ page }) => {
  await page.goto('/#/corporate');

  const serviceArt = page.locator('#corp-services .corp-service-art');
  await expect(serviceArt).toHaveCount(4);
  await expect(serviceArt.nth(0).locator('img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-cinematic-lens-brand-film.webp'
  );
  await expect(serviceArt.nth(1).locator('img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-product-story-still.jpg'
  );
  await expect(serviceArt.nth(2).locator('img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-more-than-a-moment.webp'
  );
  await expect(serviceArt.nth(3).locator('img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-good-talk-well-told.webp'
  );
  expect(await serviceArt.locator('img').evaluateAll(images =>
    new Set(images.map(image => image.getAttribute('src'))).size
  )).toBe(4);
  await expect.poll(() => serviceArt.locator('img').evaluateAll(images =>
    images.every(image => image.complete && image.naturalWidth > 0)
  )).toBe(true);

  await expect(page.locator('#corporate #corp-work')).toHaveCount(0);

  await page.goto('/#/services');
  const serviceWheel = page.locator('#services .service-wheel');
  const serviceWheelRotor = serviceWheel.locator('[data-scroll-wheel]');
  await expect(serviceWheelRotor.locator('img')).toHaveAttribute(
    'src',
    'assets/four-part-content-creation-wheel.webp'
  );
  await expect(serviceWheel.locator('.service-wheel-brand [data-brand-logo]')).toHaveAttribute(
    'src',
    '/assets/evr-productions-logo-light.png'
  );
  await expect.poll(() => serviceWheelRotor.locator('img').evaluate(image =>
    image.complete && image.naturalWidth > 0
  )).toBe(true);
  const wheelScrollRotation = await page.evaluate(async () => {
    const rotor = document.querySelector('#services [data-scroll-wheel]');
    const rotation = () => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(rotor).transform);
      return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    };
    window.scrollTo(0, 0);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = rotation();
    window.scrollTo(0, window.innerHeight);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = rotation();
    return { before, after };
  });
  expect(Math.abs(wheelScrollRotation.before)).toBeLessThan(0.1);
  expect(Math.abs(wheelScrollRotation.after - wheelScrollRotation.before)).toBeCloseTo(90, 0);
  expect(await serviceWheel.locator('.service-wheel-brand').evaluate(element =>
    getComputedStyle(element).transform
  )).toContain('matrix');
  const servicePosters = page.locator('#services .poster-designed img');
  await expect(servicePosters).toHaveCount(3);
  await expect(servicePosters.nth(0)).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-corporate-brand-films.webp'
  );
  await expect(servicePosters.nth(1)).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-channel-production-room.webp'
  );
  await expect(servicePosters.nth(2)).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-listen-then-look-again.webp'
  );
  await expect.poll(() => servicePosters.evaluateAll(images =>
    images.every(image => image.complete && image.naturalWidth > 0)
  )).toBe(true);
  await page.goto('/#/approach');
  await expect(page.locator('#approach [data-r2-slot="corporate-product-story"] img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-product-story-still.jpg'
  );
  const approachPanels = page.locator('#approach #approach-chapters .chapter-panel');
  await expect(approachPanels).toHaveCount(4);
  await expect(approachPanels.nth(0).locator('.chapter-art img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-approach-discover.webp'
  );
  await expect(approachPanels.nth(1).locator('.chapter-art img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-approach-design-shoot.webp'
  );
  await expect(approachPanels.nth(2).locator('.chapter-art img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-product-story-still.jpg'
  );
  await expect(approachPanels.nth(3).locator('.chapter-art img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-approach-refine-deliver.webp'
  );
  await expect.poll(() => approachPanels.locator('.chapter-art img').evaluateAll(images =>
    images.every(image => image.complete && image.naturalWidth > 0)
  )).toBe(true);
  await page.goto('/#/brand-work');
  await expect(page.locator('#brand-work [data-r2-slot="corporate-product-story"] img')).toHaveAttribute(
    'src',
    'assets/video-posters/r2/nbrands-product-story-still.jpg'
  );
});

test('EVR Brand Studio work page presents the full video library with muted autoplay and speaker controls', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() {
      this.dataset.playRequested = 'true';
      return Promise.resolve();
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/brand-work');

  const gallery = page.locator('#brand-work .story-library');
  await expect(gallery.locator('article')).toHaveCount(3);
  await expect(page.locator('#brand-work [data-r2-video-url]')).toHaveCount(4);
  const sourceUrls = await page.locator('#brand-work [data-r2-video-url]').evaluateAll(elements =>
    [...new Set(elements.map(element => element.dataset.r2VideoUrl))]
  );
  expect(sourceUrls).toHaveLength(4);
  await expect(gallery.locator('[data-category="event"]')).toHaveCount(1);
  await expect(gallery.locator('[data-category="healthcare"]')).toHaveCount(2);

  for (const card of await gallery.locator('.story-cover.preview-media').all()) {
    await card.scrollIntoViewIfNeeded();
    const video = card.locator('video.r2-autoplay-preview');
    const audio = card.locator('.preview-audio-toggle');
    await expect(video).toHaveAttribute('src', /pub-aefcf27121ff450faf8570e9de489735\.r2\.dev/);
    await expect(audio).toBeVisible();
    expect(await video.evaluate(element => element.muted)).toBe(true);
    await audio.click();
    expect(await video.evaluate(element => element.muted)).toBe(false);
    await expect(audio).toHaveAttribute('aria-label', 'Mute video');
    await audio.click();
    expect(await video.evaluate(element => element.muted)).toBe(true);
  }

  await page.locator('#brand-work [data-filter="event"]').click();
  await expect(gallery.locator('article:visible')).toHaveCount(1);
  await page.locator('#brand-work [data-filter="healthcare"]').click();
  await expect(gallery.locator('article:visible')).toHaveCount(2);
});

test('EVR Brand Studio approach page uses a muted doctor-led video in the shoot chapter', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() {
      this.dataset.playRequested = 'true';
      return Promise.resolve();
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/approach');

  const preview = page.locator('#approach [data-r2-slot="corporate-product-story"]');
  await expect(preview).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/reel_6.mp4'
  );
  await preview.scrollIntoViewIfNeeded();
  const video = preview.locator('video.r2-autoplay-preview');
  const audio = preview.locator('.preview-audio-toggle');
  await expect.poll(() => video.evaluate(element => element.dataset.playRequested)).toBe('true');
  expect(await video.evaluate(element => element.muted)).toBe(true);
  await expect(audio).toBeVisible();
  await audio.click();
  expect(await video.evaluate(element => element.muted)).toBe(false);
});

test('EVR Brand Studio Services page uses the animated healthcare reel in the marketing format panel', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() {
      this.dataset.playRequested = 'true';
      return Promise.resolve();
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/services');

  const preview = page.locator('#services #service-chapters .chapter-panel [data-r2-slot="corporate-healthcare-explainer"]');
  await expect(preview).toHaveAttribute(
    'data-r2-video-url',
    'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/EVR%20Videos/Reel%204.mp4'
  );
  await preview.scrollIntoViewIfNeeded();
  const video = preview.locator('video.r2-autoplay-preview');
  const audio = preview.locator('.preview-audio-toggle');
  await expect.poll(() => video.evaluate(element => element.dataset.playRequested)).toBe('true');
  expect(await video.evaluate(element => element.muted)).toBe(true);
  await expect(audio).toBeVisible();
  await audio.click();
  expect(await video.evaluate(element => element.muted)).toBe(false);
});

test('EVR Brand Studio artwork keeps its production palette without duplicating poster copy', async ({ page }) => {
  await page.goto('/#/corporate');
  const palette = await page.locator('#corporate').evaluate(corporate => {
    const styles = selector => getComputedStyle(corporate.querySelector(selector));
    return {
      reelsServiceBackground: styles('.corp-art-reels').backgroundColor,
      reelsServiceText: styles('.corp-art-reels').color,
      productCardBackground: styles('.corp-product-art').backgroundColor,
      productCardText: styles('.corp-product-art > b').color,
      productIllustrationBackground: styles('.corp-product-art > i').backgroundImage,
      designedArtHasNoOverlaidCopy: [...corporate.querySelectorAll('.corp-art-designed')].every(art =>
        art.querySelector('img') &&
        !art.querySelector('.corp-art-meta, .corp-art-bottom, strong, .corp-mic')
      )
    };
  });
  expect(palette.reelsServiceBackground).toBe('rgb(36, 93, 221)');
  expect(palette.reelsServiceText).toBe('rgb(255, 255, 255)');
  expect(palette.productCardBackground).toBe('rgb(233, 239, 255)');
  expect(palette.productCardText).toBe('rgb(25, 42, 73)');
  expect(palette.productIllustrationBackground).toContain('rgb(36, 93, 221)');
  expect(palette.productIllustrationBackground).toContain('rgb(174, 200, 255)');
  expect(palette.designedArtHasNoOverlaidCopy).toBe(true);
});

test('shared About and Contact pages use Brand Studio colors without changing their content', async ({ page }) => {
  await page.goto('/#/about');
  const about = page.locator('#about');
  await expect(about).toBeVisible();
  const sharedAboutContent = await about.innerText();
  const weddingAboutAccent = await about.locator('h1 em').evaluate(element => getComputedStyle(element).color);
  expect(weddingAboutAccent).toBe('rgb(167, 84, 66)');

  await page.locator('.experience-switch [data-experience="corporate"]').click();
  await page.evaluate(() => { location.hash = '#/about'; });
  await expect(about).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/corporate-view/);
  expect(await about.innerText()).toBe(sharedAboutContent);
  expect(await about.locator('h1 em').evaluate(element => getComputedStyle(element).color))
    .toBe('rgb(36, 93, 221)');
  expect(await about.evaluate(element => getComputedStyle(element).backgroundColor))
    .toBe('rgb(248, 250, 252)');

  await page.evaluate(() => { location.hash = '#/request'; });
  const request = page.locator('#request');
  await expect(request).toBeVisible();
  const sharedRequestContent = await request.innerText();
  expect(await request.locator('.page-title h1 em').evaluate(element => getComputedStyle(element).color))
    .toBe('rgb(36, 93, 221)');
  expect(await request.locator('.paper').evaluate(element => getComputedStyle(element).backgroundColor))
    .toBe('rgb(255, 255, 255)');
  expect(await request.locator('.request-aside').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      borderStyle: style.borderStyle,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow
    };
  })).toEqual({
    background: 'rgba(0, 0, 0, 0)',
    borderStyle: 'none',
    borderRadius: '0px',
    boxShadow: 'none'
  });
  expect(await request.locator('.paper input').first().evaluate(element => getComputedStyle(element).borderColor))
    .toBe('rgb(203, 214, 231)');

  await page.locator('.experience-switch [data-experience="home"]').click();
  await page.evaluate(() => { location.hash = '#/request'; });
  await expect(request).toBeVisible();
  expect(await request.innerText()).toBe(sharedRequestContent);
});

test('EVR Brand Studio page hero headings share the editorial serif style', async ({ page }) => {
  await page.goto('/#/corporate');
  const heroHeadings = [
    ['#/corporate', '#corporate .corp-hero h1'],
    ['#/services', '#services .inner-hero h1'],
    ['#/approach', '#approach .inner-title h1'],
    ['#/brand-work', '#brand-work .inner-title h1'],
    ['#/about', '#about .about-text-hero h1'],
    ['#/production-quote', '#production-quote .inner-hero h1'],
    ['#/request', '#request .page-title h1']
  ];

  for (const [hash, selector] of heroHeadings) {
    await page.evaluate(nextHash => { location.hash = nextHash; }, hash);
    const heading = page.locator(selector);
    await expect(heading).toBeVisible();
    const typography = await heading.evaluate(element => ({
      family: getComputedStyle(element).fontFamily,
      emphasisStyle: getComputedStyle(element.querySelector('em')).fontStyle,
      emphasisWeight: getComputedStyle(element.querySelector('em')).fontWeight
    }));
    expect(typography.family).toContain('Georgia');
    expect(typography.emphasisStyle).toBe('italic');
    expect(typography.emphasisWeight).toBe('400');
  }
});

test('EVR Brand Studio naming is consistent across public pages and quote controls', async ({ page }) => {
  await page.goto('/#/corporate');
  await expect(page.locator('.corp-hero .corp-kicker')).toContainText('EVR / BRAND STUDIO');
  await expect(page.locator('.corp-media-caption')).toContainText('EVR / BRAND STUDIO');
  await expect(page.locator('.corporate-footer-feature .eyebrow')).toContainText('EVR BRAND STUDIO');
  await expect(page.locator('.corporate-footer-main .brand-logo-context')).toHaveText('EVR BRAND STUDIO');

  await page.goto('/#/brand-work');
  await expect(page.locator('#brand-work .inner-title .eyebrow')).toHaveText('EVR / BRAND STUDIO WORK');
  await expect(page.locator('#brand-work')).not.toContainText(/NBrands/i);

  await page.goto('/#/production-quote');
  await expect(page.locator('#quote-type option[value="corporate"]')).toHaveText('EVR Brand Studio production');
});

test('EVR Brand Studio footer plays the supplied local background video', async ({ page }) => {
  await page.goto('/#/corporate');
  const feature = page.locator('.corporate-footer-feature');
  const video = feature.locator('.footer-film-video');
  await feature.scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute('poster', 'assets/nbrands-footer-poster.jpg');
  await expect.poll(() => video.evaluate(element => element.currentSrc))
    .toBe('http://127.0.0.1:4173/assets/nbrands-footer-background.mp4');
  await expect.poll(() => video.evaluate(element => element.readyState))
    .toBeGreaterThanOrEqual(2);
  expect(await video.evaluate(element => element.duration)).toBeGreaterThan(7);
});

test('About page pairs its hero copy with the shared scroll-animated logo', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/about');
    const about = page.locator('#about');
    await expect(about).toBeVisible();
    const hero = about.locator('.about-text-hero');
    const logo = hero.locator('.about-hero-mark');
    await expect(hero.locator('video, .inner-hero-media')).toHaveCount(0);
    await expect(logo.locator('[data-brand-logo="light"]'))
      .toHaveAttribute('src', '/assets/evr-productions-logo-light.png');
    await expect(hero.locator('h1')).toContainText('Every frame');
    await expect(hero.locator('.about-hero-signoff')).toHaveText('PEOPLE · MOMENTS · STORIES');
    expect(await logo.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    if (viewport.width > 700) {
      expect(await hero.evaluate(element => getComputedStyle(element).textAlign)).toBe('left');
      const initialProgress = await logo.evaluate(element =>
        Number.parseFloat(getComputedStyle(element).getPropertyValue('--about-logo-opacity'))
      );
      await page.evaluate(() => scrollBy(0, 100));
      await expect.poll(() => logo.evaluate(element =>
        Number.parseFloat(getComputedStyle(element).getPropertyValue('--about-logo-opacity'))
      )).toBeGreaterThan(initialProgress);
    } else {
      expect(await hero.evaluate(element => getComputedStyle(element).textAlign)).toBe('center');
    }
    const photos = await about.locator('.about-founder-portrait img').evaluateAll(images =>
      images.map(image => ({
        source: image.getAttribute('src'),
        loaded: image.complete && image.naturalWidth > 0
      }))
    );
    expect(photos.map(photo => photo.source)).toEqual(['assets/venkat-reddy-photographer.jpg']);
    expect(photos.every(photo => photo.loaded)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => logo.getAttribute('style')).toBeNull();
  }
});
