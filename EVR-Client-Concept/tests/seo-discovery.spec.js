const { test, expect } = require('@playwright/test');

test('homepage exposes search and social metadata plus business structured data', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('EVR Productions | Wedding Photography & Films in Hyderabad');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-IN');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://www.evrproductions.in/'
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Hyderabad-based wedding photography and film team/
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://www.evrproductions.in/assets/evr-celebration-hero.jpg'
  );

  const structuredData = await page.locator('script[type="application/ld+json"]').textContent();
  const graph = JSON.parse(structuredData)['@graph'];
  expect(graph.find(item => item['@type'] === 'Organization')).toMatchObject({
    name: 'EVR Productions',
    email: 'evrproductionss@gmail.com',
    telephone: '+91-99517-18375'
  });
  expect(graph.find(item => item['@type'] === 'WebSite').inLanguage).toBe('en-IN');

  await page.evaluate(() => { location.hash = '#/corporate'; });
  await expect(page).toHaveTitle('Brand Video Production in Hyderabad | EVR Productions');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /brand films, marketing reels, YouTube/
  );
  await page.evaluate(() => { location.hash = '#/admin'; });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
});

test('crawler instructions and sitemap publish the official canonical site', async ({ request }) => {
  const robotsResponse = await request.get('/robots.txt');
  expect(robotsResponse.ok()).toBe(true);
  const robots = await robotsResponse.text();
  expect(robots).toContain('User-agent: OAI-SearchBot');
  expect(robots).toContain('Sitemap: https://www.evrproductions.in/sitemap.xml');
  expect(robots).toContain('Disallow: /api/');
  expect(robots).toMatch(/User-agent: GPTBot\r?\nDisallow: \//);

  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.ok()).toBe(true);
  expect(await sitemapResponse.text()).toContain('<loc>https://www.evrproductions.in/</loc>');

  const llmsResponse = await request.get('/llms.txt');
  expect(llmsResponse.ok()).toBe(true);
  expect(await llmsResponse.text()).toContain('Hyderabad-based photography and film production team');
});
