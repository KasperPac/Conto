import { describe, it, expect } from 'vitest';
import { detectTransfers } from '@/lib/domain/transfers';
import type { TxWithAccount } from '@/lib/domain/transfers';
import { toCents } from '@/lib/types/money';

const base = (overrides: Partial<TxWithAccount> & { id: string }): TxWithAccount => ({
  accountId: 'acc-a',
  accountType: 'checking',
  postedDate: '2026-03-01',
  amountCents: toCents(BigInt(-10000)),
  descriptionRaw: 'Transfer',
  ...overrides,
});

describe('detectTransfers', () => {
  it('produces a high-confidence auto-link candidate for same-day same-amount pair', () => {
    const txs: TxWithAccount[] = [
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-10000)), descriptionRaw: 'Transfer out' }),
      base({ id: 'to', accountId: 'acc-b', accountType: 'savings', amountCents: toCents(BigInt(10000)), postedDate: '2026-03-01', descriptionRaw: 'Transfer in' }),
    ];
    const candidates = detectTransfers(txs);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.fromTxId).toBe('from');
    expect(candidates[0]!.toTxId).toBe('to');
    expect(candidates[0]!.linkType).toBe('transfer');
    expect(candidates[0]!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('matches within ±3 days', () => {
    const txs: TxWithAccount[] = [
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-5000)) }),
      base({ id: 'to', accountId: 'acc-b', accountType: 'savings', amountCents: toCents(BigInt(5000)), postedDate: '2026-03-04' }),
    ];
    expect(detectTransfers(txs)).toHaveLength(1);
  });

  it('does not match at ±4 days', () => {
    const txs: TxWithAccount[] = [
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-5000)) }),
      base({ id: 'to', accountId: 'acc-b', accountType: 'savings', amountCents: toCents(BigInt(5000)), postedDate: '2026-03-05' }),
    ];
    expect(detectTransfers(txs)).toHaveLength(0);
  });

  it('boosts confidence when description contains "transfer"', () => {
    const plain = detectTransfers([
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-5000)), descriptionRaw: 'Salary credit' }),
      base({ id: 'to', accountId: 'acc-b', accountType: 'savings', amountCents: toCents(BigInt(5000)), descriptionRaw: 'Salary credit' }),
    ]);
    const boosted = detectTransfers([
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-5000)), descriptionRaw: 'Transfer out' }),
      base({ id: 'to', accountId: 'acc-b', accountType: 'savings', amountCents: toCents(BigInt(5000)), descriptionRaw: 'Transfer in' }),
    ]);
    expect(boosted[0]!.confidence).toBeGreaterThan(plain[0]!.confidence);
  });

  it('does not match same account', () => {
    const txs: TxWithAccount[] = [
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-5000)) }),
      base({ id: 'to', accountId: 'acc-a', accountType: 'checking', amountCents: toCents(BigInt(5000)) }),
    ];
    expect(detectTransfers(txs)).toHaveLength(0);
  });

  it('does not match mismatched amounts', () => {
    const txs: TxWithAccount[] = [
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-5000)) }),
      base({ id: 'to', accountId: 'acc-b', accountType: 'savings', amountCents: toCents(BigInt(4999)) }),
    ];
    expect(detectTransfers(txs)).toHaveLength(0);
  });

  it('produces cc_payment linkType when receiving account is credit_card', () => {
    const txs: TxWithAccount[] = [
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-10000)), descriptionRaw: 'Visa payment' }),
      base({ id: 'to', accountId: 'acc-b', accountType: 'credit_card', amountCents: toCents(BigInt(10000)), descriptionRaw: 'Payment received' }),
    ];
    const candidates = detectTransfers(txs);
    expect(candidates[0]!.linkType).toBe('cc_payment');
  });

  it('caps ambiguous candidates below auto-link threshold', () => {
    const txs: TxWithAccount[] = [
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-5000)), descriptionRaw: 'Transfer' }),
      base({ id: 'to1', accountId: 'acc-b', accountType: 'savings', amountCents: toCents(BigInt(5000)) }),
      base({ id: 'to2', accountId: 'acc-c', accountType: 'savings', amountCents: toCents(BigInt(5000)) }),
    ];
    const candidates = detectTransfers(txs);
    expect(candidates).toHaveLength(2);
    for (const c of candidates) {
      expect(c.confidence).toBeLessThan(0.85);
    }
  });

  it('discards candidates below 0.50 confidence', () => {
    // The minimum confidence achievable under the current scoring formula is 0.60
    // (base score alone), so the < 0.50 guard is a defensive lower bound.
    // This test documents the intent; it cannot exercise the branch directly.
    const txs: TxWithAccount[] = [
      base({ id: 'from', accountId: 'acc-a', amountCents: toCents(BigInt(-5000)) }),
      base({ id: 'to', accountId: 'acc-b', accountType: 'savings', amountCents: toCents(BigInt(4999)) }),
    ];
    // Mismatched amount → 0 candidates regardless of confidence
    expect(detectTransfers(txs)).toHaveLength(0);
  });
});
