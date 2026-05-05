import { extractRows, rowText } from './extract';
import type { ParsedStatement, ParsedRow, TextItem } from './types';

const MONTHS: Record<string, string> = {
  Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
  Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
};

// DD/MM/YY as used in Virgin Money statements
const TX_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{2})$/;
const PERIOD_DATE_RE = /(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2})/i;

function virDate(s: string): string | null {
  const m = s.match(TX_DATE_RE);
  if (!m) return null;
  return `20${m[3]}-${m[2]}-${m[1]}`;
}

function virPeriodDate(s: string): string | null {
  const m = s.match(PERIOD_DATE_RE);
  if (!m) return null;
  return `20${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')}`;
}

function parseCents(s: string): bigint {
  const clean = s.replace(/[$,]/g, '');
  const [intPart, decPart = '00'] = clean.split('.');
  return BigInt(intPart) * 100n + BigInt(decPart.padEnd(2, '0').slice(0, 2));
}

function parseAmountCents(items: TextItem[]): bigint | null {
  // Amount items are to the right of descriptions (x > 450)
  const amtItems = items.filter(i => i.x > 450);
  if (amtItems.length === 0) return null;

  const last = amtItems[amtItems.length - 1].text;

  // Combined: "$X.XX Dr" or "$X.XX Cr"
  const combined = last.match(/^\$([\d,]+\.\d{2})\s+(Dr|Cr)$/);
  if (combined) {
    const cents = parseCents(combined[1]);
    return combined[2] === 'Dr' ? -cents : cents;
  }

  // Split: last item is "Dr"/"Cr", previous is the dollar amount
  if (last === 'Dr' || last === 'Cr') {
    const prev = amtItems[amtItems.length - 2]?.text ?? '';
    const prevMatch = prev.match(/^\$([\d,]+\.\d{2})$/);
    if (prevMatch) {
      const cents = parseCents(prevMatch[1]);
      return last === 'Dr' ? -cents : cents;
    }
  }

  return null;
}

export async function parseNab(buf: Buffer): Promise<ParsedStatement> {
  const rows = await extractRows(buf);
  const fullText = rows.map(rowText).join('\n');

  // Account number: "Account Number  3104 0010 0025 1311"
  const acctMatch = fullText.match(/Account\s+Number\s+([\d\s]+)/i);
  const accountFragment = acctMatch
    ? acctMatch[1].replace(/\s/g, '').slice(-4)
    : 'unknown';

  // Statement period: "Statement Period  13 Feb 26 to 12 Mar 26"
  const periodMatch = fullText.match(
    /Statement Period\s+(\d{1,2} \w+ \d{2}) to (\d{1,2} \w+ \d{2})/i,
  );
  const periodStart = periodMatch ? (virPeriodDate(periodMatch[1]) ?? '') : '';
  const periodEnd   = periodMatch ? (virPeriodDate(periodMatch[2]) ?? '') : '';

  const parsedRows: ParsedRow[] = [];

  for (const row of rows) {
    const first = row.items[0];
    if (!first) continue;

    // Skip FX continuation rows (only item at x≈231, no date)
    if (first.x > 200) continue;

    const postedDate = virDate(first.text);
    if (!postedDate) continue;

    // Description: item in the 200–450 x range
    const descItem = row.items.find(i => i.x > 200 && i.x < 450);
    if (!descItem) continue;

    const amountCents = parseAmountCents(row.items);
    if (amountCents === null) continue;

    parsedRows.push({
      posted_date: postedDate,
      description_raw: descItem.text,
      amount_cents: amountCents,
    });
  }

  return {
    template_id: 'nab_pdf_v1',
    institution: 'Virgin Money',
    account_number_fragment: accountFragment,
    account_type: 'credit_card',
    period_start: periodStart,
    period_end: periodEnd,
    rows: parsedRows,
  };
}
