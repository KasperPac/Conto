import { extractRows, rowText } from './extract';
import type { ParsedStatement, ParsedRow } from './types';

const MONTHS_LONG: Record<string, string> = {
  January:'01', February:'02', March:'03', April:'04', May:'05', June:'06',
  July:'07', August:'08', September:'09', October:'10', November:'11', December:'12',
};
const MONTHS_SHORT: Record<string, string> = {
  Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
  Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
};

const STMT_HEADER_RE = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i;
const DATE_HEADER_RE = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i;
const TIME_RE = /^\d{1,2}:\d{2}(am|pm)$/i;
const AMOUNT_RE = /^\+?\$[\d,]+\.\d{2}$/;

function parseCents(s: string): bigint {
  const isCredit = s.startsWith('+');
  const clean = s.replace(/[+$,]/g, '');
  const [intPart = '0', decPart = '00'] = clean.split('.');
  const abs = BigInt(intPart) * 100n + BigInt(decPart.padEnd(2, '0').slice(0, 2));
  return isCredit ? abs : -abs;
}

export async function parseUp(buf: Buffer): Promise<ParsedStatement> {
  const rows = await extractRows(buf);
  const fullText = rows.map(rowText).join('\n');

  const headerMatch = fullText.match(STMT_HEADER_RE);
  const stmtYear  = headerMatch ? (headerMatch[2] ?? new Date().getFullYear().toString()) : new Date().getFullYear().toString();
  const stmtMonth = headerMatch ? (MONTHS_LONG[headerMatch[1] ?? ''] ?? '01') : '01';

  const lastDay = new Date(parseInt(stmtYear), parseInt(stmtMonth), 0).getDate();
  const periodStart = `${stmtYear}-${stmtMonth}-01`;
  const periodEnd   = `${stmtYear}-${stmtMonth}-${lastDay.toString().padStart(2, '0')}`;

  const acctMatch = fullText.match(/Account\s+([\d]+)/i);
  const accountFragment = acctMatch ? (acctMatch[1] ?? '').slice(-4) : 'up';

  const parsedRows: ParsedRow[] = [];
  let currentDate: string | null = null;
  let currentMerchant: string | null = null;

  for (const row of rows) {
    const first = row.items[0];
    if (!first) continue;

    const firstX = Math.round(first.x);

    // Date header (x ≈ 39)
    if (firstX >= 37 && firstX <= 42) {
      const m = first.text.match(DATE_HEADER_RE);
      if (m) {
        const day = (m[1] ?? '01').padStart(2, '0');
        const mon = MONTHS_SHORT[m[2] ?? ''] ?? '01';
        currentDate = `${stmtYear}-${mon}-${day}`;
        currentMerchant = null;
      }
      continue;
    }

    // Merchant / label rows (x ≈ 88)
    if (firstX >= 85 && firstX <= 92) {
      const amtItem = row.items.find(i => i.x > 450 && i.x < 515 && AMOUNT_RE.test(i.text));
      if (amtItem && currentDate) {
        const desc = row.items
          .filter(i => i.x < 450 && !TIME_RE.test(i.text))
          .map(i => i.text)
          .join(' ')
          .trim();
        parsedRows.push({
          posted_date: currentDate,
          description_raw: desc || rowText(row),
          amount_cents: parseCents(amtItem.text),
        });
      } else {
        currentMerchant = row.items.map(i => i.text).join(' ').trim();
      }
      continue;
    }

    // Time rows (x ≈ 35)
    if (firstX >= 33 && firstX <= 38 && TIME_RE.test(first.text) && currentDate) {
      const amtItem = row.items.find(i => i.x > 450 && i.x < 515 && AMOUNT_RE.test(i.text));
      if (!amtItem) continue;

      const inlineDesc = row.items
        .filter(i => i.x > 38 && i.x < 450)
        .map(i => i.text)
        .join(' ')
        .trim();

      const description = inlineDesc || currentMerchant || 'Unknown';
      currentMerchant = null;

      parsedRows.push({
        posted_date: currentDate,
        description_raw: description,
        amount_cents: parseCents(amtItem.text),
      });
    }
  }

  return {
    template_id: 'up_pdf_v1',
    institution: 'Up',
    account_number_fragment: accountFragment,
    account_type: 'checking',
    period_start: periodStart,
    period_end: periodEnd,
    rows: parsedRows,
  };
}
