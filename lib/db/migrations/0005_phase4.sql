-- Phase 4: WFH entries and receipt metadata
create table wfh_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table transactions
  add column if not exists receipt_filename text,
  add column if not exists receipt_content_type text;
