-- Add is_subscription column to merchants table
alter table merchants
  add column if not exists is_subscription boolean not null default false;
