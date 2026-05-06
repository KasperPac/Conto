import { extractRows } from '../pdf/extract';
import { UnknownFormatError } from '../pdf/types';
import { detectPayslipFormat } from './detect';
import { parseMyobPayslip } from './myob';

export { UnknownFormatError } from '../pdf/types';
export type { ParsedPayslip } from './myob';

export async function dispatchPayslip(buf: Buffer): Promise<import('./myob').ParsedPayslip> {
  let rows;
  try {
    rows = await extractRows(buf);
  } catch {
    throw new UnknownFormatError();
  }
  const format = detectPayslipFormat(rows);
  if (format === 'myob_pdf_v1') return parseMyobPayslip(buf);
  throw new UnknownFormatError();
}
