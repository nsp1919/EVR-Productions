const { test, expect } = require('@playwright/test');
const path = require('path');
const { mockAdminApi } = require('./admin-api-mock');

const photoFixture = path.resolve(__dirname, '..', 'assets', 'demo-wedding-poster.png');

test('clean admin URL opens the editor and collage photos can be clicked and replaced', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/index\.html#\/admin$/);
  await expect(page.locator('#admin-editor')).toBeVisible();
  await page.locator('[data-admin-mode="image"]').click();

  const replaceByClick = async cardIndex => {
    const image = page.locator(`.scene-card[data-card="${cardIndex}"] img`);
    await image.click();
    await page.locator('#admin-photo-file').setInputFiles(photoFixture);
    await expect(page.locator('#admin-status')).toContainText('Photo uploaded');
    await expect(image).toHaveAttribute('src', /^https:\/\/blob\.test/);
  };

  await replaceByClick(2);
  await page.evaluate(() => {
    const story = document.querySelector('.hero-story');
    const stage = document.querySelector('.hero-stage');
    const start = story.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(stage).top) || 0);
    scrollTo(0, start + (story.offsetHeight - stage.offsetHeight) * 0.4 + 110);
  });
  for (const cardIndex of [0, 1, 3, 4, 5]) await replaceByClick(cardIndex);

  await page.locator('#admin-save').click();
  expect(Object.values(api.getContent().entries).filter(entry => entry.type === 'image')).toHaveLength(6);
});
