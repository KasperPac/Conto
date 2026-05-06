import type { TextRow } from '../pdf/types';
import { rowText } from '../pdf/extract';

export function detectPayslipFormat(rows: TextRow[]): 'myob_pdf_v1' | null {
  const fullText = rows.map(rowText).join('\n');
  if (
    fullText.includes('Pay Period:') &&
    fullText.includes('Paid on:') &&
    fullText.includes('Less PAYG') &&
    fullText.includes('Take home pay')
  ) {
    return 'myob_pdf_v1';
  }
  return null;
}
