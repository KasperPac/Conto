import { test, expect } from '@playwright/test';
import path from 'node:path';

test('sign up, upload a file, see the key', async ({ page }) => {
  const email = `test-${Date.now()}@conto.local`;

  await page.goto('/sign-up');
  await page.waitForLoadState('networkidle');
  console.log('URL after goto /sign-up:', page.url());
  console.log('Page title:', await page.title());
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'correct horse battery staple');
  await page.fill('input[name=confirm]', 'correct horse battery staple');
  await page.click('button[type=submit]');

  await page.waitForURL('**/dashboard', { timeout: 10_000 });
  await page.click('a:has-text("Upload a file")');

  await page.waitForURL('**/upload', { timeout: 5_000 });
  await page.setInputFiles('input[type=file]', path.join(process.cwd(), 'tests/fixtures/hello.txt'));
  await page.click('button[type=submit]');

  await expect(page.getByText(/Uploaded — key:/i)).toBeVisible({ timeout: 15_000 });
  const codeText = await page.locator('code').first().innerText();
  expect(codeText).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/hello\.txt$/);
});
