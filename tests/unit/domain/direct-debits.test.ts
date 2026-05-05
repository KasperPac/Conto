import { describe, it, expect } from 'vitest';
import { classifyAsDirectDebit } from '@/lib/domain/direct-debits';

describe('classifyAsDirectDebit', () => {
  const cases: Array<[string, ReturnType<typeof classifyAsDirectDebit>]> = [
    ['DD ENERGYAUSTRALIA',                'dd_mandate'],
    ['DIRECT DEBIT TELSTRA',              'dd_mandate'],
    ['DEFT 12345 RENTAL',                 'dd_mandate'],
    ['BPAY 12345 BILLER 67890',           'bpay'],
    ['NETFLIX SUBSCRIPTION',              'merchant_pull'],
    ['SPOTIFY AB',                        'merchant_pull'],
    ['TFR FROM SAVINGS',                  null],
    ['INTERNAL TRANSFER',                 null],
  ];
  it.each(cases)('%s -> %s', (input, expected) => {
    expect(classifyAsDirectDebit({ descriptionPattern: input })).toBe(expected);
  });
});
