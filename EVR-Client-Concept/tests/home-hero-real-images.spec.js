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
  expect(pageErrors).toEqual([]);
});
