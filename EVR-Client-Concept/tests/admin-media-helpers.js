async function clickContextualMediaAction(page, targetSelector, actionName) {
  const target = page.locator(targetSelector);
  await target.scrollIntoViewIfNeeded();
  await page.waitForFunction(({ selector, label }) => {
    const element = document.querySelector(selector);
    return element && Array.from(document.querySelectorAll('.admin-media-actions')).some(panel => {
      const root = panel._mediaRoot;
      return root && (root.contains(element) || element.contains(root)) &&
        Array.from(panel.querySelectorAll('button')).some(button => button.getAttribute('aria-label') === label);
    });
  }, { selector: targetSelector, label: actionName });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const panelIndex = await target.evaluate((element, label) =>
      Array.from(document.querySelectorAll('.admin-media-actions')).findIndex(panel => {
        const root = panel._mediaRoot;
        return root && (root.contains(element) || element.contains(root)) &&
          Array.from(panel.querySelectorAll('button')).some(button => button.getAttribute('aria-label') === label);
      }), actionName);
    if (panelIndex < 0) throw new Error(`Could not find contextual ${actionName} control for ${targetSelector}.`);
    try {
      const panel = page.locator('.admin-media-actions').nth(panelIndex);
      const menu = panel.locator('.admin-media-menu');
      if (!await menu.evaluate(element => element.open)) {
        await menu.locator('summary').click({ timeout: 1500 });
      }
      await panel.getByRole('button', { name: actionName }).click({ timeout: 1500 });
      return;
    } catch (error) {
      if (error.name !== 'TimeoutError' || attempt === 2) throw error;
    }
  }
}

async function clickFirstContextualMediaAction(page, actionName) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const panelIndex = await page.evaluate(label => {
      const panels = Array.from(document.querySelectorAll('.admin-media-actions'));
      const panel = panels.find(item => Array.from(item.querySelectorAll('button'))
        .some(button => button.getAttribute('aria-label') === label));
      panel?._mediaRoot?.scrollIntoView({ block: 'center' });
      return panels.indexOf(panel);
    }, actionName);
    if (panelIndex < 0) throw new Error(`Could not find a contextual ${actionName} control.`);
    try {
      const panel = page.locator('.admin-media-actions').nth(panelIndex);
      const menu = panel.locator('.admin-media-menu');
      if (!await menu.evaluate(element => element.open)) {
        await menu.locator('summary').click({ timeout: 1500 });
      }
      await panel.getByRole('button', { name: actionName }).click({ timeout: 1500 });
      return;
    } catch (error) {
      if (error.name !== 'TimeoutError' || attempt === 2) throw error;
    }
  }
}

module.exports = { clickContextualMediaAction, clickFirstContextualMediaAction };
