import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseNab } from '@/lib/parsers/pdf/nab';

const buf = readFileSync(path.resolve(__dirname, '../../fixtures/pdf/nab/nab_pdf_v1_sample.pdf'));

describe('parseNab', () => {
  it('returns a valid ParsedStatement', async () => {
    const result = await parseNab(buf);
    expect(result.template_id).toBe('nab_pdf_v1');
    expect(result.institution).toBe('Virgin Money');
    expect(result.account_number_fragment).not.toBe('');
    expect(result.period_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.period_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('parses row dates and amounts correctly', async () => {
    const result = await parseNab(buf);
    for (const row of result.rows) {
      expect(row.posted_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.description_raw.length).toBeGreaterThan(0);
      expect(row.amount_cents).not.toBe(0n);
      expect(typeof row.amount_cents).toBe('bigint');
    }
  });
});
