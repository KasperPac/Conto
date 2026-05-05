import { describe, it, expect } from 'vitest';
import type {
  RecurrenceGroupId, PayCadenceId, ExpectedEventId,
  DetectedRecurrence, PayCadenceCandidate, RunwayPoint,
  ExpectedEvent, CalendarDay, DirectDebit, LiquidityPreview,
  Cadence, ExpectedEventStatus, ExpectedEventSource, DirectDebitKind,
} from '@/lib/types/cashflow';

describe('cashflow types', () => {
  it('cadence accepts the documented values', () => {
    const c: Cadence[] = ['weekly','fortnightly','monthly','quarterly','annual','irregular'];
    expect(c).toHaveLength(6);
  });
  it('expected event status accepts documented values', () => {
    const s: ExpectedEventStatus[] = ['pending','dismissed','snoozed','matched','superseded'];
    expect(s).toHaveLength(5);
  });
  it('expected event source accepts documented values', () => {
    const s: ExpectedEventSource[] = ['recurrence_group','pay_cadence','manual','tax_obligation'];
    expect(s).toHaveLength(4);
  });
  it('direct debit kind accepts documented values', () => {
    const k: DirectDebitKind[] = ['dd_mandate','bpay','merchant_pull'];
    expect(k).toHaveLength(3);
  });
});
