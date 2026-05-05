import type { TextRow } from './types';
import { rowText } from './extract';

export function detectBank(rows: TextRow[]): 'nab_pdf_v1' | 'up_pdf_v1' | null {
  const fullText = rows.map(rowText).join('\n');
  if (
    fullText.includes('National Australia Bank') ||
    fullText.includes('nab.com.au') ||
    fullText.includes('virginmoney.com.au')
  ) {
    return 'nab_pdf_v1';
  }
  if (fullText.includes('Up is a brand of Bendigo') || fullText.includes('up.com.au')) {
    return 'up_pdf_v1';
  }
  return null;
}
