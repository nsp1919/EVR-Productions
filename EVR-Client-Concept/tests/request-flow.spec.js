const { test, expect } = require('@playwright/test');

test('date enquiry carries the selected service and date into the real contact form', async ({ page }) => {
  await page.goto('/#/home');
  await page.locator('#date-service').selectOption('Pre-wedding');
  await page.locator('#shoot-date').fill('2030-10-12');
  await page.locator('#date-enquiry-form button[type="submit"]').click();

  await expect(page).toHaveURL(/#\/request$/);
  await expect(page.locator('#service')).toHaveValue('Pre-wedding');
  await expect(page.locator('#inquiry-form [name="date"]')).toHaveValue('2030-10-12');
  await expect(page.locator('#inquiry-form')).toContainText('Choose how to send your enquiry');
});

test('valid enquiry offers real WhatsApp and email handoffs with the complete brief', async ({ page }) => {
  await page.goto('/#/request');
  const form = page.locator('#inquiry-form');
  await form.locator('[name="name"]').fill('Asha Rao');
  await form.locator('[name="phone"]').fill('+91 90000 12345');
  await form.locator('[name="email"]').fill('asha@example.com');
  await form.locator('[name="brand"]').fill('Asha and Ravi wedding');
  await form.locator('[name="location"]').fill('Hyderabad');
  await form.locator('[name="brief"]').fill('Wedding photography and a short film.');
  await form.locator('button[type="submit"]').click();

  const whatsapp = page.locator('#send-enquiry-whatsapp');
  const email = page.locator('#send-enquiry-email');
  await expect(whatsapp).toBeVisible();
  await expect(email).toBeVisible();

  const whatsappUrl = new URL(await whatsapp.getAttribute('href'));
  expect(whatsappUrl.origin + whatsappUrl.pathname).toBe('https://wa.me/919951718375');
  const whatsappMessage = whatsappUrl.searchParams.get('text');
  expect(whatsappMessage).toContain('Service: Wedding / event photography');
  expect(whatsappMessage).toContain('Name: Asha Rao');
  expect(whatsappMessage).toContain('Phone: +91 90000 12345');
  expect(whatsappMessage).toContain('Email: asha@example.com');
  expect(whatsappMessage).toContain('Brand / project: Asha and Ravi wedding');
  expect(whatsappMessage).toContain('Location: Hyderabad');
  expect(whatsappMessage).toContain('Wedding photography and a short film.');

  const emailUrl = new URL(await email.getAttribute('href'));
  expect(emailUrl.protocol).toBe('mailto:');
  expect(emailUrl.pathname).toBe('evrproductionss@gmail.com');
  expect(emailUrl.searchParams.get('subject')).toBe('EVR project enquiry: Asha Rao');
  expect(emailUrl.searchParams.get('body')).toContain('Wedding photography and a short film.');
  await expect(page.locator('#inquiry-status')).toContainText('press Send to contact EVR');

  await form.locator('[name="brief"]').fill('Updated wedding plans.');
  await expect(whatsapp).toBeHidden();
  await expect(email).toBeHidden();
  await expect(page.locator('#inquiry-status')).toHaveText('');
});
