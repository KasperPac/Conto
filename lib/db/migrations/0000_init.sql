CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"institution" text NOT NULL,
	"type" text NOT NULL,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"opening_balance_cents" bigint NOT NULL,
	"opening_balance_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"parent_id" uuid,
	"name" text NOT NULL,
	"icon" text,
	"is_income" boolean DEFAULT false NOT NULL,
	"is_essential" boolean DEFAULT false NOT NULL,
	"is_discretionary" boolean DEFAULT false NOT NULL,
	"is_deductible_candidate" boolean DEFAULT false NOT NULL,
	"deduction_kind" text
);
--> statement-breakpoint
CREATE TABLE "expected_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_id" uuid,
	"expected_date" date NOT NULL,
	"expected_amount_cents" bigint NOT NULL,
	"expected_amount_low_cents" bigint NOT NULL,
	"expected_amount_high_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"matched_transaction_id" uuid,
	"snoozed_until" date,
	"confidence" numeric(4, 3) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_note" text
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_amount_cents" bigint NOT NULL,
	"target_date" date,
	"current_amount_cents" bigint DEFAULT 0 NOT NULL,
	"linked_account_id" uuid,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"canonical_name" text NOT NULL,
	"default_category_id" uuid,
	"patterns" jsonb
);
--> statement-breakpoint
CREATE TABLE "pay_cadences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"employer" text NOT NULL,
	"cadence" text NOT NULL,
	"expected_net_cents" bigint NOT NULL,
	"next_pay_date" date NOT NULL,
	"source" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"employer" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"pay_date" date NOT NULL,
	"gross_cents" bigint NOT NULL,
	"tax_withheld_cents" bigint NOT NULL,
	"super_cents" bigint NOT NULL,
	"salary_sacrifice_cents" bigint DEFAULT 0 NOT NULL,
	"pre_tax_deductions_cents" bigint DEFAULT 0 NOT NULL,
	"post_tax_deductions_cents" bigint DEFAULT 0 NOT NULL,
	"net_cents" bigint NOT NULL,
	"source_object_key" text,
	"source" text NOT NULL,
	"cadence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurrence_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant_id" uuid,
	"description_pattern" text NOT NULL,
	"cadence" text NOT NULL,
	"median_amount_cents" bigint NOT NULL,
	"amount_stddev_cents" bigint NOT NULL,
	"median_interval_days" integer NOT NULL,
	"last_seen_date" date NOT NULL,
	"next_expected_date" date NOT NULL,
	"status" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"match_field" text NOT NULL,
	"category_id" uuid,
	"subcategory_id" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"created_from_transaction_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source_filename" text NOT NULL,
	"source_object_key" text NOT NULL,
	"format" text NOT NULL,
	"parser_template" text,
	"period_start" date,
	"period_end" date,
	"status" text NOT NULL,
	"parse_error" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parsed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant_id" uuid,
	"display_name" text NOT NULL,
	"cadence" text NOT NULL,
	"expected_amount_cents" bigint NOT NULL,
	"last_charge_date" date,
	"next_expected_date" date,
	"status" text NOT NULL,
	"notes" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"link_type" text NOT NULL,
	"from_transaction_id" uuid NOT NULL,
	"to_transaction_id" uuid,
	"payslip_id" uuid,
	"confidence" numeric(4, 3),
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"statement_id" uuid,
	"posted_date" date NOT NULL,
	"description_raw" text NOT NULL,
	"description_clean" text,
	"amount_cents" bigint NOT NULL,
	"balance_after_cents" bigint,
	"category_id" uuid,
	"subcategory_id" uuid,
	"merchant_id" uuid,
	"classification_source" text NOT NULL,
	"classification_rule_id" uuid,
	"is_excluded_from_spending" boolean DEFAULT false NOT NULL,
	"notes" text,
	"receipt_object_key" text,
	"receipt_uploaded_at" timestamp with time zone,
	"recurrence_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cashflow_buffer_cents" bigint DEFAULT 50000 NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_events" ADD CONSTRAINT "expected_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_events" ADD CONSTRAINT "expected_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_events" ADD CONSTRAINT "expected_events_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_cadences" ADD CONSTRAINT "pay_cadences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_cadences" ADD CONSTRAINT "pay_cadences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_groups" ADD CONSTRAINT "recurrence_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_groups" ADD CONSTRAINT "recurrence_groups_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_subcategory_id_categories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_from_transaction_id_transactions_id_fk" FOREIGN KEY ("from_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_to_transaction_id_transactions_id_fk" FOREIGN KEY ("to_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_payslip_id_payslips_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subcategory_id_categories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_classification_rule_id_rules_id_fk" FOREIGN KEY ("classification_rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurrence_group_id_recurrence_groups_id_fk" FOREIGN KEY ("recurrence_group_id") REFERENCES "public"."recurrence_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expected_events_pending_idx" ON "expected_events" USING btree ("user_id","expected_date");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_dedupe_idx" ON "transactions" USING btree ("account_id","posted_date","amount_cents","description_raw");

-- RLS: every domain table is scoped by app.user_id. Set via withUser() in app code.
-- Bypass: connect as a superuser when running migrations / seeds. App code never uses superuser.

alter table accounts enable row level security;
create policy accounts_per_user on accounts using (user_id = current_setting('app.user_id', true)::uuid);

alter table statements enable row level security;
create policy statements_per_user on statements using (user_id = current_setting('app.user_id', true)::uuid);

alter table transactions enable row level security;
create policy transactions_per_user on transactions using (user_id = current_setting('app.user_id', true)::uuid);

alter table transaction_links enable row level security;
create policy transaction_links_per_user on transaction_links using (user_id = current_setting('app.user_id', true)::uuid);

alter table merchants enable row level security;
create policy merchants_per_user on merchants using (user_id is null or user_id = current_setting('app.user_id', true)::uuid);

alter table categories enable row level security;
create policy categories_per_user on categories using (user_id is null or user_id = current_setting('app.user_id', true)::uuid);

alter table rules enable row level security;
create policy rules_per_user on rules using (user_id = current_setting('app.user_id', true)::uuid);

alter table payslips enable row level security;
create policy payslips_per_user on payslips using (user_id = current_setting('app.user_id', true)::uuid);

alter table subscriptions enable row level security;
create policy subscriptions_per_user on subscriptions using (user_id = current_setting('app.user_id', true)::uuid);

alter table goals enable row level security;
create policy goals_per_user on goals using (user_id = current_setting('app.user_id', true)::uuid);

alter table budgets enable row level security;
create policy budgets_per_user on budgets using (user_id = current_setting('app.user_id', true)::uuid);

alter table recurrence_groups enable row level security;
create policy recurrence_groups_per_user on recurrence_groups using (user_id = current_setting('app.user_id', true)::uuid);

alter table pay_cadences enable row level security;
create policy pay_cadences_per_user on pay_cadences using (user_id = current_setting('app.user_id', true)::uuid);

alter table expected_events enable row level security;
create policy expected_events_per_user on expected_events using (user_id = current_setting('app.user_id', true)::uuid);

-- Partial index for the calendar / liquidity-preview hot path.
drop index if exists expected_events_pending_idx;
create index expected_events_pending_idx on expected_events (user_id, expected_date) where status = 'pending';