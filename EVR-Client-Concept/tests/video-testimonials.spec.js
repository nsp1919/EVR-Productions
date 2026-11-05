'use strict';

const { test, expect } = require('@playwright/test');
const path = require('path');
const { mockAdminApi } = require('./admin-api-mock');

const fixture = path.resolve(__dirname, '..', 'assets', 'nbrands-case-study-cphtij.mp4');

test('video testimonials stay hidden until enabled and can be added, replaced, and removed in admin', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/#/admin');
  await expect(page.locator('#admin-status')).toContainText('Shared website content is ready');
  await expect(page.locator('#video-testimonials')).toBeHidden();

  await page.locator('.admin-testimonials summary').click();
  await expect(page.locator('#admin-testimonial-list')).toContainText('No video testimonials yet');
  await page.locator('#admin-testimonial-client').fill('Asha & Ravi');
  await page.locator('#admin-testimonial-caption').fill('A celebration to remember');
  await page.locator('#admin-testimonial-video').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Upload testimonial video' }).click();
  await expect(page.locator('#admin-status')).toContainText('Testimonial video uploaded');
  await page.locator('#admin-preview-page').selectOption('corporate');
  await page.locator('#admin-preview-page').selectOption('home');
  await expect(page.locator('#admin-testimonial-list')).toContainText('Asha & Ravi');
  await expect(page.locator('#video-testimonials')).toBeHidden();

  const testimonialValue = () => api.getContent().entries['#video-testimonials-v1']?.value;
  await page.locator('#admin-testimonials-enabled').check();
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(JSON.parse(testimonialValue())).toMatchObject({
    version: 1,
    enabled: true,
    items: [{
      clientName: 'Asha & Ravi',
      caption: 'A celebration to remember',
      videoUrl: 'https://media.example.com/evr-videos/test-video.mp4'
    }]
  });
  await expect(page.locator('#video-testimonials')).toBeVisible();
  await expect(page.locator('#video-testimonials')).toContainText('Asha & Ravi');
  await expect(page.locator('#video-testimonials')).toContainText('A celebration to remember');

  await page.getByRole('button', { name: 'Replace video' }).click();
  await page.locator('.admin-testimonial-item input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('#admin-status')).toContainText('Testimonial video replaced');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete video' }).click();
  await expect(page.locator('#admin-status')).toContainText('Testimonial video removed');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(JSON.parse(testimonialValue()).items).toHaveLength(0);
  await expect(page.locator('#video-testimonials')).toBeHidden();
});

test('published video testimonials fit a mobile viewport', async ({ page }) => {
  const content = {
    version: 1,
    entries: {
      '#video-testimonials-v1': {
        type: 'text',
        value: JSON.stringify({
          version: 1,
          enabled: true,
          items: [{
            id: '12345678-1234-4234-8234-123456789abc',
            clientName: 'Asha & Ravi',
            caption: 'A celebration to remember',
            videoUrl: 'https://media.example.com/evr-videos/testimonial.mp4'
          }]
        })
      }
    }
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/content', route => route.fulfill({ json: content }));
  await page.goto('/#/home');
  await expect(page.locator('#video-testimonials')).toBeVisible();
  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    cardRight: document.querySelector('.video-testimonial-card').getBoundingClientRect().right
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.cardRight).toBeLessThanOrEqual(layout.viewportWidth);
});
