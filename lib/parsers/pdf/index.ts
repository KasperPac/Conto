import { extractRows } from './extract';
import { detectBank } from './detect';
import { parseNab } from './nab';
import { parseUp } from './up';
import { UnknownFormatError } from './types';
import type { ParsedStatement } from './types';

export { UnknownFormatError } from './types';
export type { ParsedStatement, ParsedRow } from './types';

export async function dispatch(buf: Buffer): Promise<ParsedStatement> {
  let rows;
  try {
    rows = await extractRows(buf);
  } catch {
    throw new UnknownFormatError();
  }
  const template = detectBank(rows);
  if (template === 'nab_pdf_v1') return parseNab(buf);
  if (template === 'up_pdf_v1')  return parseUp(buf);
  throw new UnknownFormatError();
}
