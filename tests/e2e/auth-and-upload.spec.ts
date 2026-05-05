import { test, expect } from '@playwright/test';
import path from 'node:path';

test('sign up, upload a PDF, redirect to statements', async ({ page }) => {
  const email = `test-${Date.now()}@conto.local`;
  const fixture = path.join(process.cwd(), 'tests/fixtures/pdf/nab/nab_pdf_v1_sample.pdf');

  await page.goto('/sign-up');
  await page.waitForLoadState('networkidle');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'correct horse battery staple');
  await page.fill('input[name=confirm]', 'correct horse battery staple');
  await page.click('button[type=submit]');

  await page.waitForURL('**/dashboard', { timeout: 10_000 });
  await page.goto('/upload');

  await page.waitForURL('**/upload', { timeout: 5_000 });
  await page.setInputFiles('input[type=file]', fixture);
  await page.click('button[type=submit]');

  await page.waitForURL('**/statements', { timeout: 15_000 });
  await expect(page.locator('table')).toBeVisible();
});
