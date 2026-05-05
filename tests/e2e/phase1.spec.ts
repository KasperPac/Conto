import { test, expect } from '@playwright/test';
import path from 'node:path';

const NAB_FIXTURE = path.resolve(__dirname, '../fixtures/pdf/nab/nab_pdf_v1_sample.pdf');
const E2E_EMAIL = `e2e-phase1-${Date.now()}@test.com`;
const E2E_PASS = 'Password123!';

test.describe('Phase 1 — ingest & view', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/sign-up');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name=email]', E2E_EMAIL);
    await page.fill('input[name=password]', E2E_PASS);
    await page.fill('input[name=confirm]', E2E_PASS);
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
    await ctx.close();
  });

  test('upload → statements → transactions → reclassify modal', async ({ page }) => {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name=email]', E2E_EMAIL);
    await page.fill('input[name=password]', E2E_PASS);
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });

    // Upload NAB fixture
    await page.goto('/upload');
    await page.setInputFiles('input[type=file]', NAB_FIXTURE);
    await page.click('button[type=submit]');

    // Should redirect to /statements after upload
    await page.waitForURL('**/statements', { timeout: 15_000 });

    // Wait for Parsed status — worker must be running
    await expect(async () => {
      await page.reload();
      await expect(page.getByText('parsed')).toBeVisible();
    }).toPass({ timeout: 15_000, intervals: [2000] });

    // Navigate to transactions via "View transactions" link
    await page.getByText('View transactions').first().click();
    await expect(page).toHaveURL(/\/accounts\/.+\/transactions/);

    // At least one transaction row
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();

    // Click the category button on the first row to open reclassify modal
    await rows.first().locator('button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Categorise transaction')).toBeVisible();

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('accounts page shows at least one account with balance', async ({ page }) => {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name=email]', E2E_EMAIL);
    await page.fill('input[name=password]', E2E_PASS);
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });

    await page.goto('/accounts');
    await expect(page.locator('.divide-y > div').first()).toBeVisible({ timeout: 5_000 });
  });

  test('nav has all expected links', async ({ page }) => {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name=email]', E2E_EMAIL);
    await page.fill('input[name=password]', E2E_PASS);
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });

    const nav = page.locator('nav');
    await expect(nav.getByText('Statements')).toBeVisible();
    await expect(nav.getByText('Accounts')).toBeVisible();
    await expect(nav.getByText('Categories')).toBeVisible();
    await expect(nav.getByText('Upload')).toBeVisible();
  });
});
