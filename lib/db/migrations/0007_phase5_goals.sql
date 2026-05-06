alter table goals add column goal_type text not null default 'savings';
alter table goals add column weekly_cost_cents bigint;
alter table budgets add column from_goal_id uuid references goals(id);
