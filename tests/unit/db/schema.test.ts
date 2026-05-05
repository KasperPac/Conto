import { describe, it, expect } from 'vitest';
import {
  recurrenceGroups,
  payCadences,
  expectedEvents,
  categories,
  transactions,
  users,
  payslips,
  merchants,
} from '@/lib/db/schema';

describe('cashflow runway schema', () => {
  it('exposes recurrence_groups with required columns', () => {
    const cols = Object.keys(recurrenceGroups);
    expect(cols).toEqual(expect.arrayContaining([
      'id','userId','merchantId','descriptionPattern','cadence',
      'medianAmountCents','amountStddevCents','medianIntervalDays',
      'lastSeenDate','nextExpectedDate','status','confidence','source','createdAt',
    ]));
  });

  it('exposes pay_cadences with required columns', () => {
    const cols = Object.keys(payCadences);
    expect(cols).toEqual(expect.arrayContaining([
      'id','userId','accountId','employer','cadence',
      'expectedNetCents','nextPayDate','source','active','createdAt',
    ]));
  });

  it('exposes expected_events with required columns', () => {
    const cols = Object.keys(expectedEvents);
    expect(cols).toEqual(expect.arrayContaining([
      'id','userId','accountId','source','sourceId','expectedDate',
      'expectedAmountCents','expectedAmountLowCents','expectedAmountHighCents',
      'description','status','matchedTransactionId','snoozedUntil',
      'confidence','generatedAt','userNote',
    ]));
  });

  it('extends categories with deduction columns', () => {
    const cols = Object.keys(categories);
    expect(cols).toEqual(expect.arrayContaining(['isDeductibleCandidate','deductionKind']));
  });

  it('extends transactions with receipt + recurrence back-link', () => {
    const cols = Object.keys(transactions);
    expect(cols).toEqual(expect.arrayContaining(['receiptObjectKey','receiptUploadedAt','recurrenceGroupId']));
  });

  it('extends users with cashflow buffer', () => {
    const cols = Object.keys(users);
    expect(cols).toEqual(expect.arrayContaining(['cashflowBufferCents']));
  });

  it('extends payslips with cadence', () => {
    const cols = Object.keys(payslips);
    expect(cols).toEqual(expect.arrayContaining(['cadence']));
  });

  it('exposes merchants with isSubscription column', () => {
    expect(merchants.isSubscription).toBeDefined();
  });
});
