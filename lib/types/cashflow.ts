import type { Cents } from '@/lib/types/money';

declare const __brand: unique symbol;
type Branded<T, B extends string> = T & { readonly [__brand]: B };

export type RecurrenceGroupId = Branded<string, 'RecurrenceGroupId'>;
export type PayCadenceId     = Branded<string, 'PayCadenceId'>;
export type ExpectedEventId  = Branded<string, 'ExpectedEventId'>;

export type Cadence = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annual' | 'irregular';
export type RecurrenceStatus = 'active' | 'suspected' | 'paused' | 'cancelled';
export type ExpectedEventStatus = 'pending' | 'dismissed' | 'snoozed' | 'matched' | 'superseded';
export type ExpectedEventSource = 'recurrence_group' | 'pay_cadence' | 'manual' | 'tax_obligation';
export type DirectDebitKind = 'dd_mandate' | 'bpay' | 'merchant_pull';

export interface DetectedRecurrence {
  descriptionPattern: string;
  merchantId: string | null;
  cadence: Cadence;
  medianAmountCents: Cents;
  amountStddevCents: Cents;
  medianIntervalDays: number;
  lastSeenDate: string;
  nextExpectedDate: string;
  confidence: number;
  memberTransactionIds: string[];
}

export interface PayCadenceCandidate {
  accountId: string;
  employer: string;
  cadence: 'weekly' | 'fortnightly' | 'monthly';
  expectedNetCents: Cents;
  nextPayDate: string;
  confidence: number;
  memberTransactionIds: string[];
}

export interface ExpectedEvent {
  id: ExpectedEventId;
  userId: string;
  accountId: string | null;
  source: ExpectedEventSource;
  sourceId: string | null;
  expectedDate: string;
  expectedAmountCents: Cents;
  expectedAmountLowCents: Cents;
  expectedAmountHighCents: Cents;
  description: string;
  status: ExpectedEventStatus;
  matchedTransactionId: string | null;
  snoozedUntil: string | null;
  confidence: number;
  generatedAt: Date;
  userNote: string | null;
}

export interface RunwayPoint {
  date: string;
  projectedBalanceCents: Cents;
  lowCents: Cents;
  highCents: Cents;
  events: ExpectedEvent[];
}

export interface CalendarDay {
  date: string;
  events: Array<{
    id: ExpectedEventId;
    description: string;
    expectedAmountCents: Cents;
    confidence: number;
    source: ExpectedEventSource;
    effectiveStatus: 'pending' | 'snoozed' | 'matched' | 'dismissed';
  }>;
}

export interface DirectDebit {
  groupId: RecurrenceGroupId;
  merchantName: string;
  kind: DirectDebitKind;
  cadence: Cadence;
  observedAmountLowCents: Cents;
  observedAmountHighCents: Cents;
  lastSeenDate: string;
  nextExpectedDate: string;
  status: RecurrenceStatus;
}

export interface LiquidityPreview {
  asOf: string;
  startBalanceCents: Cents;
  bufferCents: Cents;
  horizonDays: 30 | 60 | 90;
  points: RunwayPoint[];
  dipsBelowBuffer: Array<{ date: string; shortfallCents: Cents }>;
}
