# Phase 3 — Classification & Subscription Polish: Design Spec

**Goal:** Automatically classify transactions on ingest so new uploads arrive already categorised (~80% hit rate), surface subscriptions as a distinct audit view, and add a deductible filter to the transaction list.

**Done when:** a new statement upload lands with most transactions classified; the `/subscriptions` page shows known subscription services with costs; the transaction list has a working deductible filter.

---

## 1. Scope

Four deliverables:

1. **Classification pipeline** — pure `classifyTransaction()` function applied at parse time
2. **AU merchant seed** — ~40 merchants with auto-classification rules and subscription flags
3. **Subscription dashboard** — `/subscriptions` page: card grid of flagged recurring charges + unlabelled review flow
4. **Deductible filter** — `?deductible=1` toggle on the existing transaction list

Post-MVP (explicitly out of scope): price-change detection, lapse detection ("did you cancel?"), subscription cancel tracking, materialization into the `subscriptions` table.

---

## 2. Data changes

### 2.1 Migration: `merchants.is_subscription`

```sql
-- lib/db/migrations/0004_merchant_is_subscription.sql
alter table merchants
  add column if not exists is_subscription boolean not null default false;
```

Drizzle schema update: add `isSubscription: boolean('is_subscription').notNull().default(false)` to the `merchants` table definition.

### 2.2 No other schema changes

Rules, categories, recurrence_groups, and transactions tables are unchanged.

---

## 3. Classification pipeline

### 3.1 Pure function: `lib/domain/classification.ts`

```ts
export type ClassificationResult = {
  categoryId: string | null;
  subcategoryId: string | null;
  merchantId: string | null;
  source: 'user_rule' | 'system_rule' | 'unclassified';
  ruleId: string | null;
};

export function classifyTransaction(
  tx: {
    descriptionRaw: string;
    descriptionClean: string | null;
    merchantId: string | null;
  },
  rules: LoadedRule[],       // sorted by priority desc, pre-loaded
  merchants: LoadedMerchant[] // all active merchants for this user + system
): ClassificationResult
```

**Pipeline (applied in order, first match wins):**

1. **User rules** — iterate `rules` (priority desc). For each rule, test `pattern` against `tx[matchField]` using `new RegExp(pattern, 'i').test(value)`. On match: return `{ categoryId, subcategoryId, source: 'user_rule', ruleId }`.
2. **Merchant default** — if `tx.merchantId` is set and the matched merchant has `defaultCategoryId`, return `{ categoryId: merchant.defaultCategoryId, source: 'system_rule', merchantId }`.
3. **Merchant pattern scan** — iterate all merchants, test each pattern in `merchant.patterns` (jsonb array of regex strings) against `tx.descriptionRaw`. On first match: return `{ categoryId: merchant.defaultCategoryId, source: 'system_rule', merchantId: merchant.id }`.
4. **Fall-through** — return `{ categoryId: null, subcategoryId: null, merchantId: null, source: 'unclassified', ruleId: null }`.

**Inputs are pre-loaded once** per parse job, not queried per transaction.

### 3.2 DB query helpers: `lib/db/queries/rules.ts`

- `getUserRules(userId): Promise<LoadedRule[]>` — all active rules for user, sorted by priority desc
- `createRule(userId, rule): Promise<void>` — insert new rule (used by reclassify action)
- `updateRule(ruleId, userId, patch): Promise<void>`
- `deleteRule(ruleId, userId): Promise<void>`

### 3.3 DB query helpers: `lib/db/queries/merchants.ts`

- `getUserMerchants(userId): Promise<LoadedMerchant[]>` — system merchants (userId null) + user's merchants
- `setMerchantIsSubscription(merchantId, userId, value: boolean): Promise<void>`
- `createMerchant(userId, merchant): Promise<string>` — returns new id

### 3.4 Wiring into `parse-statement.ts`

At the start of the parse job, after confirming the statement exists:

```ts
const [rules, merchants] = await Promise.all([
  getUserRules(userId),
  getUserMerchants(userId),
]);
```

Before each transaction insert, call `classifyTransaction(tx, rules, merchants)` and spread the result into the insert payload. The `classificationSource` field maps directly to the `source` value returned.

### 3.5 Reclassify action update

The existing `app/actions/reclassify.ts` already creates rules for "apply to all." No change needed to rule creation. The rule will automatically apply to future uploads via the pipeline. For historical transactions, the "apply to all" path already does a bulk UPDATE — this remains unchanged.

---

## 4. AU merchant seed

### 4.1 File: `lib/db/seeds/au-merchants.ts`

Idempotent seed (upsert on `canonical_name` where `user_id is null`). Covers ~40 system merchants across these buckets:

| Bucket | Examples | `isSubscription` |
|---|---|---|
| Supermarkets | Woolworths, Coles, Aldi, IGA | false |
| Fuel | BP, Shell, Caltex, 7-Eleven | false |
| Fast food | McDonald's, KFC, Hungry Jack's, Domino's, Subway | false |
| Streaming | Netflix, Spotify, Disney+, Stan, Binge, Apple TV+, YouTube Premium | **true** |
| Software / SaaS | Adobe CC, Microsoft 365, Dropbox, Atlassian, Anthropic | **true** |
| Utilities | AGL, Origin Energy, Sydney Water, Ausgrid, Jemena | false |
| Transport | Opal, Myki, Uber, DiDi | false |
| Pharmacy | Chemist Warehouse, Priceline | false |
| Telco | Telstra, Optus, Vodafone, Belong | false |

Each merchant entry: `canonicalName`, `patterns` (array of regex strings matching common description variants), `defaultCategoryId` (looked up from system categories by name), `isSubscription`.

Patterns are case-insensitive substrings or simple regexes, e.g. `["NETFLIX", "NETFLIX\\.COM"]` for Netflix.

### 4.2 Seed ordering

`lib/db/seeds/index.ts` runs `au-subcategories` first (already exists), then `au-merchants` (requires category IDs to exist).

---

## 5. Subscription dashboard

### 5.1 Page: `app/(authenticated)/subscriptions/page.tsx`

Server component. Calls `getSubscriptionGroups(userId)` and renders the card layout.

**URL:** `/subscriptions`

**Data:** `recurrence_groups` joined to `merchants` where `merchant.is_subscription = true`, plus a second query for "unlabelled candidates" — active recurrence groups joined to merchants where `is_subscription = false` and `merchant_id is not null` (i.e., merchant was pattern-matched but not flagged as subscription). Status must be `active` or `suspected`.

### 5.2 Query: `lib/db/queries/subscriptions.ts`

```ts
getSubscriptionGroups(userId): Promise<SubscriptionGroup[]>
// recurrence_groups where merchant.is_subscription = true, status != 'cancelled'

getUnlabelledCandidates(userId): Promise<UnlabelledCandidate[]>
// recurrence_groups with a matched merchant where is_subscription = false
// limited to cadence in (monthly, quarterly, annual) — bills are excluded by cadence heuristic
// ordered by median_amount_cents desc
```

Cadence heuristic for candidates: only `monthly | quarterly | annual` cadences surface as potential subscriptions. Weekly/fortnightly are almost always wages or rent — not subscriptions.

### 5.3 Layout (approved: option B)

```
┌─────────────────────────────────────────────────┐
│ Subscriptions                    [+ Add merchant]│
│                                                  │
│  $187/mo      6 active     2 unlabelled          │
│  ─────────    ─────────    ────────────          │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Netflix  │ │ Spotify  │ │ DAZN*AU · amber  │ │
│  │ $22.99/mo│ │ $12.99/mo│ │ $24.99/mo        │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────┘
```

- Stat row: total monthly cost (quarterly/annual normalised), active count, unlabelled count
- Known subscriptions: white cards — merchant name, median amount, cadence
- Unlabelled candidates: amber cards — description pattern, amount, cadence, "Is this a subscription?" prompt
- "Add merchant" button: opens a dialog to manually flag any merchant as a subscription

### 5.4 Server action: `app/(authenticated)/subscriptions/actions/set-subscription.ts`

`setSubscription(merchantId: string, isSubscription: boolean)` — calls `setMerchantIsSubscription`, then `revalidatePath('/subscriptions')`. Used by both the amber card confirm flow and the "remove" action on known subscription cards.

### 5.5 Nav

Add `<Link href="/subscriptions">Subscriptions</Link>` to `components/nav.tsx` after the Transfers link.

---

## 6. Deductible filter

### 6.1 Transaction list page

In `app/(authenticated)/accounts/[id]/transactions/page.tsx`:

- Read `searchParams.deductible` (string `'1'` or absent)
- Pass a `deductibleOnly: boolean` flag to the existing `getTransactions()` query
- Render a toggle button in the filter bar: "Deductible only" — active state when `?deductible=1`, links to toggle it

### 6.2 Query update: `lib/db/queries/transactions.ts`

Add `deductibleOnly?: boolean` to the `getTransactions` options. When true, add a join to `categories` and filter `where categories.is_deductible_candidate = true`.

No new page — this is entirely additive to the existing transaction list.

---

## 7. Testing

### Unit tests

- `tests/unit/domain/classification.test.ts`
  - User rule wins over merchant default (priority)
  - Higher-priority rule wins over lower-priority
  - Merchant pattern match assigns merchant + category
  - Fall-through returns `source: 'unclassified'`
  - Same-account rule excluded (matchField: description_raw vs description_clean)

### Integration tests

- `tests/integration/db/seed-au-merchants.test.ts` — idempotent double-run, isSubscription correct for Netflix/Spotify, false for Woolworths
- `tests/integration/jobs/classify-on-ingest.test.ts` — insert a statement with a Woolworths transaction, assert it lands with the correct categoryId and `classificationSource: 'system_rule'`
- `tests/integration/db/queries/subscriptions.test.ts` — seed recurrence groups with/without isSubscription merchants, assert only flagged ones returned; cadence filter excludes weekly groups
- `tests/integration/db/queries/transactions.test.ts` (extend existing) — deductible filter returns only deductible-category transactions

---

## 8. Post-MVP notes

- **Price-change detection:** compare `median_amount_cents` on current vs previous recurrence group upsert; flag if delta > 5%
- **Lapse detection:** if `next_expected_date` is > 2× `median_interval_days` past, surface "did you cancel?" alert
- **Subscriptions table:** once users want to add notes, cancel URLs, or manual overrides, materialise confirmed subscriptions from `recurrence_groups` into the `subscriptions` table
- **CBA CSV parser:** needed to make the E2E calendar-snooze test use the 12-month fixture and pass reliably
