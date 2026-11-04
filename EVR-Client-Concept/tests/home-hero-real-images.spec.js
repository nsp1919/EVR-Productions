const { test, expect } = require('@playwright/test');

test('home hero shows real photos in the six-card collage and mobile stack', async ({ page }) => {
  await page.goto('/#/home');
  await expect(page.locator('.hero-art .scene-card')).toHaveCount(6);

  const photoStatus = await page.locator('.hero-art .scene-card img').evaluateAll(images =>
    images.map(image => ({
      source: image.getAttribute('src'),
      loaded: image.complete && image.naturalWidth > 0
    }))
  );
  expect(photoStatus.every(photo => photo.source.endsWith('.jpg') && photo.loaded)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileStack = await page.locator('.scene-card[data-slot] img').evaluateAll(images =>
    images.map(image => image.complete && image.naturalWidth > 0)
  );
  expect(mobileStack).toHaveLength(3);
  expect(mobileStack.every(Boolean)).toBe(true);
});

test('home hero animation initializes and responds to scrolling without a hero video', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/#/home');
  await expect(page.locator('.hero-story')).toHaveClass(/is-animated/);
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 0.6));
  await expect.poll(() => page.locator('.hero-story').getAttribute('data-progress').then(Number)).toBeGreaterThan(0);
  const story = page.locator('.hero-story');
  await story.evaluate(element => {
    const stage = element.querySelector('.hero-stage');
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    const start = element.getBoundingClientRect().top + window.scrollY - top;
    const travel = element.offsetHeight - stage.offsetHeight;
    window.scrollTo(0, start + travel * .99);
  });
  await expect.poll(() => story.getAttribute('data-progress').then(Number)).toBeGreaterThan(.98);
  await expect(story.locator('.story-decisions')).toHaveCount(0);
  await expect(story.locator('.story-notes')).toHaveAttribute('aria-hidden', 'false');
  await expect(story.locator('.story-notes')).toHaveCSS('opacity', '1');
  expect(pageErrors).toEqual([]);
});

test('home hero perspective text appears between the six cards without overlap', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/home');
    const story = page.locator('.hero-story');
    await expect(story).toHaveClass(/is-animated/);
    await story.evaluate(element => {
      const stage = element.querySelector('.hero-stage');
      const top = parseFloat(getComputedStyle(stage).top) || 0;
      const start = element.getBoundingClientRect().top + window.scrollY - top;
      const travel = element.offsetHeight - stage.offsetHeight;
      window.scrollTo(0, start + travel * .53);
    });

    await expect(story).toHaveAttribute('data-phase', 'stories');
    await expect(story.locator('.story-statement')).toContainText('We make room for the moments that matter.');
    const layout = await story.evaluate(element => {
      const statement = element.querySelector('.story-statement').getBoundingClientRect();
      const cards = Array.from(element.querySelectorAll('.scene-card'), card => {
        const rect = card.getBoundingClientRect();
        return {
          opacity: Number(getComputedStyle(card).opacity),
          overlaps: rect.left < statement.right && rect.right > statement.left
            && rect.top < statement.bottom && rect.bottom > statement.top
        };
      });
      return {
        statementOpacity: Number(getComputedStyle(element.querySelector('.story-statement')).opacity),
        cards
      };
    });
    expect(layout.statementOpacity).toBeGreaterThan(.95);
    expect(layout.cards.every(card => card.opacity > .95 && !card.overlaps)).toBe(true);
  }
});
