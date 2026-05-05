import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseUp } from '@/lib/parsers/pdf/up';

const buf = readFileSync(path.resolve(__dirname, '../../fixtures/pdf/up/up_pdf_v1_sample.pdf'));

describe('parseUp', () => {
  it('returns a valid ParsedStatement', async () => {
    const result = await parseUp(buf);
    expect(result.template_id).toBe('up_pdf_v1');
    expect(result.institution).toBe('Up');
    expect(result.period_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.period_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('parses row dates and amounts correctly', async () => {
    const result = await parseUp(buf);
    for (const row of result.rows) {
      expect(row.posted_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.description_raw.length).toBeGreaterThan(0);
      expect(row.amount_cents).not.toBe(0n);
    }
  });
});
