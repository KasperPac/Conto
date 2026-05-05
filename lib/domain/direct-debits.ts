import type { DirectDebitKind } from '@/lib/types/cashflow';

export function classifyAsDirectDebit(group: { descriptionPattern: string }): DirectDebitKind | null {
  const s = group.descriptionPattern.toUpperCase();
  if (/\bTFR\b|\bINTERNAL TRANSFER\b/.test(s)) return null;
  if (/\bDD\s|\bDIRECT DEBIT\b|\bDEFT\b/.test(s)) return 'dd_mandate';
  if (/\bBPAY\b/.test(s)) return 'bpay';
  return 'merchant_pull';
}
