import {
  pgTable, uuid, text, boolean, bigint, integer, numeric, date, timestamp, jsonb,
  uniqueIndex, index,
} from 'drizzle-orm/pg-core';

// =====================================================
// Identity (Better Auth tables + Conto users extensions)
// =====================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  cashflowBufferCents: bigint('cashflow_buffer_cents', { mode: 'bigint' }).notNull().default(BigInt(50000)),
});

export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountsAuth = pgTable('account', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// =====================================================
// Conto domain tables (PLAN.md §4)
// =====================================================

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  institution: text('institution').notNull(),
  type: text('type').notNull(),
  currency: text('currency').notNull().default('AUD'),
  openingBalanceCents: bigint('opening_balance_cents', { mode: 'bigint' }).notNull(),
  openingBalanceDate: date('opening_balance_date').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const statements = pgTable('statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountId: uuid('account_id').references(() => accounts.id),
  sourceFilename: text('source_filename').notNull(),
  sourceObjectKey: text('source_object_key').notNull(),
  format: text('format').notNull(),
  parserTemplate: text('parser_template'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  status: text('status').notNull(),
  parseError: text('parse_error'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  parsedAt: timestamp('parsed_at', { withTimezone: true }),
});

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  canonicalName: text('canonical_name').notNull(),
  defaultCategoryId: uuid('default_category_id'),
  patterns: jsonb('patterns'),
  isSubscription: boolean('is_subscription').notNull().default(false),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  icon: text('icon'),
  isIncome: boolean('is_income').notNull().default(false),
  isEssential: boolean('is_essential').notNull().default(false),
  isDiscretionary: boolean('is_discretionary').notNull().default(false),
  isDeductibleCandidate: boolean('is_deductible_candidate').notNull().default(false),
  deductionKind: text('deduction_kind'),
});

export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  pattern: text('pattern').notNull(),
  matchField: text('match_field').notNull(),
  categoryId: uuid('category_id').references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => categories.id),
  priority: integer('priority').notNull().default(0),
  source: text('source').notNull(),
  createdFromTransactionId: uuid('created_from_transaction_id'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const recurrenceGroups = pgTable('recurrence_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  merchantId: uuid('merchant_id').references(() => merchants.id),
  descriptionPattern: text('description_pattern').notNull(),
  cadence: text('cadence').notNull(),
  medianAmountCents: bigint('median_amount_cents', { mode: 'bigint' }).notNull(),
  amountStddevCents: bigint('amount_stddev_cents', { mode: 'bigint' }).notNull(),
  medianIntervalDays: integer('median_interval_days').notNull(),
  lastSeenDate: date('last_seen_date').notNull(),
  nextExpectedDate: date('next_expected_date').notNull(),
  status: text('status').notNull(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  statementId: uuid('statement_id').references(() => statements.id),
  postedDate: date('posted_date').notNull(),
  descriptionRaw: text('description_raw').notNull(),
  descriptionClean: text('description_clean'),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  balanceAfterCents: bigint('balance_after_cents', { mode: 'bigint' }),
  categoryId: uuid('category_id').references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => categories.id),
  merchantId: uuid('merchant_id').references(() => merchants.id),
  classificationSource: text('classification_source').notNull(),
  classificationRuleId: uuid('classification_rule_id').references(() => rules.id),
  isExcludedFromSpending: boolean('is_excluded_from_spending').notNull().default(false),
  notes: text('notes'),
  receiptObjectKey: text('receipt_object_key'),
  receiptUploadedAt: timestamp('receipt_uploaded_at', { withTimezone: true }),
  receiptFilename: text('receipt_filename'),
  receiptContentType: text('receipt_content_type'),
  recurrenceGroupId: uuid('recurrence_group_id').references(() => recurrenceGroups.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dedupeIdx: uniqueIndex('transactions_dedupe_idx').on(t.accountId, t.postedDate, t.amountCents, t.descriptionRaw),
}));

export const payslips = pgTable('payslips', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  employer: text('employer').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  payDate: date('pay_date').notNull(),
  grossCents: bigint('gross_cents', { mode: 'bigint' }).notNull(),
  taxWithheldCents: bigint('tax_withheld_cents', { mode: 'bigint' }).notNull(),
  superCents: bigint('super_cents', { mode: 'bigint' }).notNull(),
  salarySacrificeCents: bigint('salary_sacrifice_cents', { mode: 'bigint' }).notNull().default(BigInt(0)),
  preTaxDeductionsCents: bigint('pre_tax_deductions_cents', { mode: 'bigint' }).notNull().default(BigInt(0)),
  postTaxDeductionsCents: bigint('post_tax_deductions_cents', { mode: 'bigint' }).notNull().default(BigInt(0)),
  netCents: bigint('net_cents', { mode: 'bigint' }).notNull(),
  sourceObjectKey: text('source_object_key'),
  source: text('source').notNull(),
  cadence: text('cadence'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactionLinks = pgTable('transaction_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  linkType: text('link_type').notNull(),
  fromTransactionId: uuid('from_transaction_id').notNull().references(() => transactions.id),
  toTransactionId: uuid('to_transaction_id').references(() => transactions.id),
  payslipId: uuid('payslip_id').references(() => payslips.id),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pairUniq: uniqueIndex('transaction_links_pair_unique')
    .on(t.fromTransactionId, t.toTransactionId),
}));

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  merchantId: uuid('merchant_id').references(() => merchants.id),
  displayName: text('display_name').notNull(),
  cadence: text('cadence').notNull(),
  expectedAmountCents: bigint('expected_amount_cents', { mode: 'bigint' }).notNull(),
  lastChargeDate: date('last_charge_date'),
  nextExpectedDate: date('next_expected_date'),
  status: text('status').notNull(),
  notes: text('notes'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
});

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  targetAmountCents: bigint('target_amount_cents', { mode: 'bigint' }).notNull(),
  targetDate: date('target_date'),
  currentAmountCents: bigint('current_amount_cents', { mode: 'bigint' }).notNull().default(BigInt(0)),
  linkedAccountId: uuid('linked_account_id').references(() => accounts.id),
  status: text('status').notNull(),
  goalType: text('goal_type').notNull().default('savings'),
  weeklyCostCents: bigint('weekly_cost_cents', { mode: 'bigint' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  period: text('period').notNull(),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  fromGoalId: uuid('from_goal_id').references(() => goals.id),
});

export const payCadences = pgTable('pay_cadences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  employer: text('employer').notNull(),
  cadence: text('cadence').notNull(),
  expectedNetCents: bigint('expected_net_cents', { mode: 'bigint' }).notNull(),
  nextPayDate: date('next_pay_date').notNull(),
  source: text('source').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const expectedEvents = pgTable('expected_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  source: text('source').notNull(),
  sourceId: uuid('source_id'),
  expectedDate: date('expected_date').notNull(),
  expectedAmountCents: bigint('expected_amount_cents', { mode: 'bigint' }).notNull(),
  expectedAmountLowCents: bigint('expected_amount_low_cents', { mode: 'bigint' }).notNull(),
  expectedAmountHighCents: bigint('expected_amount_high_cents', { mode: 'bigint' }).notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('pending'),
  matchedTransactionId: uuid('matched_transaction_id').references(() => transactions.id),
  snoozedUntil: date('snoozed_until'),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  userNote: text('user_note'),
}, (t) => ({
  // drizzle-kit doesn't support partial indexes — the WHERE clause is added manually in the migration.
  // If you re-run db:generate, re-apply the manual patch in the migration SQL.
  pendingByDateIdx: index('expected_events_pending_idx').on(t.userId, t.expectedDate),
}));

export const wfhEntries = pgTable('wfh_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  date: date('date').notNull(),
  hours: numeric('hours', { precision: 4, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userDateUniq: uniqueIndex('wfh_entries_user_date_idx').on(t.userId, t.date),
}));
