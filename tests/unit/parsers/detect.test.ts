import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractRows } from '@/lib/parsers/pdf/extract';
import { detectBank } from '@/lib/parsers/pdf/detect';

const nabBuf = readFileSync(path.resolve(__dirname, '../../fixtures/pdf/nab/nab_pdf_v1_sample.pdf'));
const upBuf  = readFileSync(path.resolve(__dirname, '../../fixtures/pdf/up/up_pdf_v1_sample.pdf'));

describe('detectBank', () => {
  it('identifies NAB', async () => {
    const rows = await extractRows(nabBuf);
    expect(detectBank(rows)).toBe('nab_pdf_v1');
  });

  it('identifies Up Bank', async () => {
    const rows = await extractRows(upBuf);
    expect(detectBank(rows)).toBe('up_pdf_v1');
  });

  it('returns null for unknown', () => {
    expect(detectBank([])).toBeNull();
  });
});
