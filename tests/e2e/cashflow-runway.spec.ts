/**
 * E2E: Cashflow Runway happy path
 *
 * Flow:
 *   sign-in → upload NAB PDF → wait for parse → /runway (chart renders)
 *   → /runway/calendar (find event cell if present, snooze it)
 *   → /runway (projection page still renders)
 *   → /runway/direct-debits (table or empty-state renders)
 *
 * Note on fixture:
 *   A synthetic CBA CSV fixture lives at
 *   tests/fixtures/cashflow-runway/e2e/cba-anonymised.csv
 *   for use when a CBA CSV parser is added to lib/parsers/csv/cba.ts.
 *   The current upload pipeline only accepts PDFs (NAB / Up formats), so this
 *   test uses the existing NAB PDF fixture which the parser supports today.
 *
 * Recurrence data:
 *   A single NAB statement covers one month and may not produce recurrence
 *   groups (which require ≥3 occurrences of the same merchant).  The calendar
 *   snooze step is therefore conditional: if an event cell is visible within
 *   the current or next calendar month the test clicks and snoozes it;
 *   otherwise it verifies the calendar page renders without error and moves on.
 *   The direct-debits page assertion accepts either ≥1 table row OR the
 *   "no direct debits" empty-state message.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';

const NAB_FIXTURE = path.resolve(
  __dirname,
  '../fixtures/pdf/nab/nab_pdf_v1_sample.pdf',
);

const E2E_EMAIL = `e2e-runway-${Date.now()}@test.com`;
const E2E_PASS  = 'Password123!';

// ---------------------------------------------------------------------------
// Shared sign-in helper
// ---------------------------------------------------------------------------
async function signIn(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.goto('/sign-in');
  await page.waitForLoadState('networkidle');
  await page.fill('input[name=email]', E2E_EMAIL);
  await page.fill('input[name=password]', E2E_PASS);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Setup: create the E2E user once for the whole suite
// ---------------------------------------------------------------------------
test.beforeAll(async ({ browser }) => {
  const ctx  = await browser.newContext();
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

// ---------------------------------------------------------------------------
// Test 1: upload → wait for parse → wait for job chain
// ---------------------------------------------------------------------------
test('upload NAB statement and wait for parse', async ({ page }) => {
  await signIn(page);

  await page.goto('/upload');
  await page.waitForLoadState('networkidle');
  await page.setInputFiles('input[type=file]', NAB_FIXTURE);
  await page.click('button[type=submit]');

  // After a successful upload the server redirects to /statements
  await page.waitForURL('**/statements', { timeout: 15_000 });
  await expect(page.locator('table')).toBeVisible();

  // Poll until the statement is marked "parsed" (worker must be running)
  await expect(async () => {
    await page.reload();
    await expect(page.getByText('parsed')).toBeVisible();
  }).toPass({ timeout: 30_000, intervals: [3_000] });

  // Wait for the downstream job chain to complete:
  //   parse-statement → refreshRecurrencesForUser → project-expected-events
  // These run synchronously inside the parse-statement worker but the
  // project-expected-events job is enqueued and processed asynchronously.
  // Give the worker enough time to finish all downstream work.
  await page.waitForTimeout(10_000);
});

// ---------------------------------------------------------------------------
// Test 2: /runway — chart and heading render
// ---------------------------------------------------------------------------
test('/runway page renders chart and heading', async ({ page }) => {
  await signIn(page);
  await page.goto('/runway');
  await page.waitForLoadState('networkidle');

  // Heading
  await expect(page.getByRole('heading', { name: /runway/i })).toBeVisible();

  // Horizon tabs
  await expect(page.getByText('30d')).toBeVisible();
  await expect(page.getByText('60d')).toBeVisible();
  await expect(page.getByText('90d')).toBeVisible();

  // Recharts renders an SVG inside the ResponsiveContainer.
  // Use the recharts-specific class to avoid matching Next.js dev-tools SVGs.
  await expect(page.locator('svg.recharts-surface')).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// Test 3: /runway/calendar — renders and snoozes an event cell
// ---------------------------------------------------------------------------
test('/runway/calendar renders; snoozes an event cell when one exists', async ({ page }) => {
  await signIn(page);

  // Navigate forward through up to 3 months to find a month with at least
  // one projected event cell (class "cursor-pointer" on MonthGrid buttons).
  // The job chain parse-statement → refreshRecurrencesForUser →
  // project-expected-events projects events into future months, so the
  // current month may be empty while a later month has events.
  const now = new Date();
  let yearMonth = now.toISOString().slice(0, 7); // e.g. "2026-05"
  let hasCells = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`/runway/calendar?month=${yearMonth}`);
    await page.waitForLoadState('networkidle');

    // Heading must always render
    await expect(page.getByRole('heading', { name: /bills calendar/i })).toBeVisible();

    const eventCell = page.locator('button.cursor-pointer').first();
    hasCells = await eventCell.isVisible().catch(() => false);
    if (hasCells) break;

    // Advance to next month via URL parameter
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y!, m! - 1, 1));
    d.setUTCMonth(d.getUTCMonth() + 1);
    yearMonth = d.toISOString().slice(0, 7);
  }

  // If no events were found after 3 months the recurrence job chain did not
  // produce projected events — this is a test failure, not a soft skip.
  expect(hasCells, 'Expected at least one calendar event cell after 3 months').toBe(true);

  const eventCell = page.locator('button.cursor-pointer').first();
  await eventCell.click();

  // EventDetailPanel should appear with at least one Snooze button
  const snoozeBtn = page.getByRole('button', { name: /snooze/i }).first();
  await expect(snoozeBtn).toBeVisible({ timeout: 5_000 });

  await snoozeBtn.click();

  // After snooze, the panel either closes or refreshes.
  // The page should still be on /runway/calendar (server action may reload).
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: /bills calendar/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 4: return to /runway — projection still renders after any snooze
// ---------------------------------------------------------------------------
test('/runway still renders projection after calendar interaction', async ({ page }) => {
  await signIn(page);
  await page.goto('/runway');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: /runway/i })).toBeVisible();
  await expect(page.locator('svg.recharts-surface')).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// Test 5: /runway/direct-debits — page renders (table or empty state)
// ---------------------------------------------------------------------------
test('/runway/direct-debits renders table or empty state', async ({ page }) => {
  await signIn(page);
  await page.goto('/runway/direct-debits');
  await page.waitForLoadState('networkidle');

  await expect(
    page.getByRole('heading', { name: /direct debits/i }),
  ).toBeVisible();

  // The NAB PDF fixture is a single-month credit card statement whose
  // transactions are diverse one-off purchases (cafes, Uber, restaurants).
  // detectRecurrence requires minOccurrences≥3 with a low interval stddev,
  // so a single month of varied spending legitimately produces no recurrence
  // groups. Asserting ≥1 row would make the test brittle against the fixture.
  // Instead we verify the page renders correctly in whichever state applies.
  //
  // To assert ≥1 row here, replace the NAB PDF fixture with a multi-month
  // statement that contains at least 3 occurrences of the same merchant
  // (e.g. the synthetic CBA CSV at tests/fixtures/cashflow-runway/e2e/
  // cba-anonymised.csv once a CBA CSV parser is added to lib/parsers/csv/).
  const tableRow   = page.locator('tbody tr').first();
  const emptyState = page.getByText(/no direct debits/i);

  const rowVisible   = await tableRow.isVisible().catch(() => false);
  const emptyVisible = await emptyState.isVisible().catch(() => false);

  expect(rowVisible || emptyVisible, 'Direct debits page should render').toBe(true);
});

// ---------------------------------------------------------------------------
// Test 6: nav contains Runway link
// ---------------------------------------------------------------------------
test('nav includes Runway link on authenticated pages', async ({ page }) => {
  await signIn(page);
  await page.goto('/dashboard');
  // Use role-based locator to match the nav link specifically, not any text
  await expect(page.locator('nav').getByRole('link', { name: 'Runway' })).toBeVisible();
});
