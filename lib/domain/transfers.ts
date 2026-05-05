import type { Cents } from '@/lib/types/money';

export interface TxWithAccount {
  id: string;
  accountId: string;
  accountType: 'checking' | 'savings' | 'credit_card';
  postedDate: string;    // ISO date YYYY-MM-DD
  amountCents: Cents;    // signed; negative = debit
  descriptionRaw: string;
}

export interface TransferCandidate {
  fromTxId: string;
  toTxId: string;
  linkType: 'transfer' | 'cc_payment';
  confidence: number;
}

const TRANSFER_WORDS = /\b(transfer|tfr|xfer|payment)\b/i;
const ACCOUNT_FRAGMENT = /\d{4,}/;

function daysDiff(a: string, b: string): number {
  const diff = Date.parse(a) - Date.parse(b);
  if (Number.isNaN(diff)) throw new Error(`Invalid date in daysDiff: "${a}", "${b}"`);
  return Math.abs(diff / 86_400_000);
}

function scoreMatch(from: TxWithAccount, to: TxWithAccount): number {
  let s = 0.60;
  if (daysDiff(from.postedDate, to.postedDate) === 0) s += 0.15;
  if (TRANSFER_WORDS.test(from.descriptionRaw) || TRANSFER_WORDS.test(to.descriptionRaw)) s += 0.15;
  const fromFrag = from.descriptionRaw.match(ACCOUNT_FRAGMENT)?.[0];
  const toFrag = to.descriptionRaw.match(ACCOUNT_FRAGMENT)?.[0];
  if (fromFrag && toFrag && fromFrag === toFrag) s += 0.10;
  return s;
}

export function detectTransfers(txs: TxWithAccount[]): TransferCandidate[] {
  const debits  = txs.filter(t => t.amountCents < BigInt(0));
  const credits = txs.filter(t => t.amountCents > BigInt(0));

  const candidates: TransferCandidate[] = [];

  for (const from of debits) {
    for (const to of credits) {
      if (from.accountId === to.accountId) continue;
      if (-from.amountCents !== to.amountCents) continue;
      if (daysDiff(from.postedDate, to.postedDate) > 3) continue;
      const confidence = scoreMatch(from, to);
      if (confidence < 0.50) continue;
      const linkType: 'transfer' | 'cc_payment' =
        to.accountType === 'credit_card' ? 'cc_payment' : 'transfer';
      candidates.push({ fromTxId: from.id, toTxId: to.id, linkType, confidence });
    }
  }

  // Downgrade all candidates that share a transaction with another candidate (ambiguous)
  const fromCount = new Map<string, number>();
  const toCount   = new Map<string, number>();
  for (const c of candidates) {
    fromCount.set(c.fromTxId, (fromCount.get(c.fromTxId) ?? 0) + 1);
    toCount.set(c.toTxId,   (toCount.get(c.toTxId)   ?? 0) + 1);
  }

  return candidates.map(c =>
    (fromCount.get(c.fromTxId)! > 1 || toCount.get(c.toTxId)! > 1)
      ? { ...c, confidence: Math.min(c.confidence, 0.84) }
      : c,
  );
}
