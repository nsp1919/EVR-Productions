const { test, expect } = require('@playwright/test');
const { mockAdminApi } = require('./admin-api-mock');

test('public visitors receive saved shared website content without signing in', async ({ page }) => {
  const api = await mockAdminApi(page, { version: 1, entries: {} }, false);
  await page.goto('/#/home');
  const headingKey = await page.locator('#home h1 em').evaluate(element => {
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
    entries: { [headingKey]: { type: 'text', value: 'Shared public website edit' } }
  });

  await page.reload();
  await expect(page.locator('#home h1 em')).toHaveText('Shared public website edit');
  await expect(page.locator('#admin-login')).toBeHidden();
});
