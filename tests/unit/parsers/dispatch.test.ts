import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dispatch } from '@/lib/parsers/pdf/index';
import { UnknownFormatError } from '@/lib/parsers/pdf/types';

const nabBuf = readFileSync(path.resolve(__dirname, '../../fixtures/pdf/nab/nab_pdf_v1_sample.pdf'));
const upBuf  = readFileSync(path.resolve(__dirname, '../../fixtures/pdf/up/up_pdf_v1_sample.pdf'));

describe('dispatch', () => {
  it('routes NAB/Virgin Money', async () => {
    const result = await dispatch(nabBuf);
    expect(result.template_id).toBe('nab_pdf_v1');
  });

  it('routes Up', async () => {
    const result = await dispatch(upBuf);
    expect(result.template_id).toBe('up_pdf_v1');
  });

  it('throws UnknownFormatError for unrecognised PDFs', async () => {
    await expect(dispatch(Buffer.from('%PDF-1.4'))).rejects.toBeInstanceOf(UnknownFormatError);
  });
});
