const { test, expect } = require('@playwright/test');
const { mockAdminApi } = require('./admin-api-mock');

test('text edits persist while website background styling stays fixed', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('home');
  await expect(page.locator('[data-admin-mode="background"]')).toHaveCount(0);
  await expect(page.locator('#admin-background-color')).toHaveCount(0);
  const defaultBackground = await page.locator('#home').evaluate(element =>
    getComputedStyle(element).backgroundColor
  );
  api.setContent({
    version: 1,
    entries: { '#home': { type: 'background', value: '#123456' } }
  });
  await page.reload();
  await page.locator('#admin-preview-page').selectOption('home');

  await page.locator('[data-admin-mode="text"]').click();
  await page.locator('#home h1 em').click();
  await expect(page.locator('#home h1 em')).toHaveAttribute('contenteditable', 'true');
  await page.locator('#home h1 em').fill('Runtime verified stories');
  await expect(page.locator('#home')).toHaveCSS('background-color', defaultBackground);
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(api.getContent().entries).not.toHaveProperty('#home');

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('home');
  await expect(page.locator('#home h1 em')).toHaveText('Runtime verified stories');
  await expect(page.locator('#home')).toHaveCSS('background-color', defaultBackground);
});

test('website credits cannot be edited in admin mode', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('home');

  const credit = page.locator('.site-credit');
  const brand = credit.locator('.site-credit-brand');
  await page.locator('[data-admin-mode="text"]').click();
  await brand.click();
  await expect(brand).not.toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('#admin-status')).toContainText('Website credits are fixed');

  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(api.getContent().entries).toEqual({});
  await expect(brand).toHaveText('Novantix Innovation Technologies ✳');
});

test('previously saved website-credit edits are ignored', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/#/admin');
  const creditKey = await page.locator('.site-credit-brand').evaluate(element => {
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      if (current.id) {
        path.unshift(`#${current.id}`);
        break;
      }
      const parent = current.parentElement;
      const sameTag = Array.from(parent.children).filter(child => child.tagName === current.tagName);
      path.unshift(`${current.tagName.toLowerCase()}:${sameTag.indexOf(current)}`);
      current = parent;
    }
    return path.join('/');
  });
  api.setContent({
    version: 1,
    entries: { [creditKey]: { type: 'text', value: 'Changed website credit' } }
  });

  await page.reload();
  const brand = page.locator('.site-credit-brand');
  await expect(brand).toHaveText('Novantix Innovation Technologies ✳');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(api.getContent().entries).toEqual({});
});
