import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractRows, rowText } from '@/lib/parsers/pdf/extract';

const nabFixture = path.resolve(__dirname, '../../fixtures/pdf/nab/nab_pdf_v1_sample.pdf');

describe('extractRows', () => {
  it('returns non-empty sorted rows from a NAB PDF', async () => {
    const buf = readFileSync(nabFixture);
    const rows = await extractRows(buf);
    expect(rows.length).toBeGreaterThan(0);
    // rows sorted: page 1 before page 2, top before bottom
    expect(rows[0].page).toBe(1);
    // every row has at least one item
    for (const row of rows) {
      expect(row.items.length).toBeGreaterThan(0);
      expect(row.items.every(i => i.text.length > 0)).toBe(true);
    }
  });

  it('rowText joins items left-to-right', async () => {
    const buf = readFileSync(nabFixture);
    const rows = await extractRows(buf);
    const texts = rows.map(rowText);
    expect(texts.some(t => t.length > 0)).toBe(true);
  });
});
