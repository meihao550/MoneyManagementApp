-- Supabase SQL Editor に貼り付けて Run してください。
-- 何度実行しても安全（idempotent）。このファイル 1 本で最新スキーマが揃います。
-- auth.users は Supabase が管理しているので、user_id を FK として参照します。

-- ================================
-- profiles: 1ユーザ 1行
-- ================================
create table if not exists public.profiles (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  monthly_salary          numeric(12, 0) not null default 0,
  expected_monthly_income numeric(12, 0) not null default 0,
  updated_at              timestamptz not null default now()
);

alter table public.profiles
  add column if not exists expected_monthly_income numeric(12, 0) not null default 0;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id);

-- ================================
-- savings_goals: 貯金目標
-- ================================
create table if not exists public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null default '貯金目標',
  target_amount numeric(12, 0) not null,
  target_date   date not null,
  created_at    timestamptz not null default now()
);

create index if not exists savings_goals_user_id_idx
  on public.savings_goals(user_id);

alter table public.savings_goals enable row level security;

drop policy if exists "savings_goals_all_own" on public.savings_goals;
create policy "savings_goals_all_own"
  on public.savings_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ================================
-- monthly_bills: 毎月の固定支払い
-- ================================
create table if not exists public.monthly_bills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  amount     numeric(12, 0) not null,
  created_at timestamptz not null default now()
);

create index if not exists monthly_bills_user_id_idx
  on public.monthly_bills(user_id);

alter table public.monthly_bills enable row level security;

drop policy if exists "monthly_bills_all_own" on public.monthly_bills;
create policy "monthly_bills_all_own"
  on public.monthly_bills for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ================================
-- expenses: 日々の消費・収入（家計簿）
-- ================================
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  amount     numeric(12, 0) not null,
  spent_on   date not null default current_date,
  kind       text not null default 'expense',
  created_at timestamptz not null default now()
);

alter table public.expenses
  add column if not exists kind text not null default 'expense';

alter table public.expenses
  drop constraint if exists expenses_kind_check;
alter table public.expenses
  add constraint expenses_kind_check check (kind in ('expense', 'income'));

create index if not exists expenses_user_id_spent_on_idx
  on public.expenses(user_id, spent_on desc);

alter table public.expenses enable row level security;

drop policy if exists "expenses_all_own" on public.expenses;
create policy "expenses_all_own"
  on public.expenses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ================================
-- assets: 資産（口座・現金など）
-- ================================
create table if not exists public.assets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  amount     numeric(12, 0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assets_user_id_idx
  on public.assets(user_id);

alter table public.assets enable row level security;

drop policy if exists "assets_all_own" on public.assets;
create policy "assets_all_own"
  on public.assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ================================
-- asset_transactions: 資産の入出金履歴
-- ================================
create table if not exists public.asset_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  asset_id        uuid not null references public.assets(id) on delete cascade,
  amount          numeric(12, 0) not null,
  occurred_on     date not null default current_date,
  source          text not null default 'manual',
  note            text not null default '',
  ledger_entry_id uuid references public.expenses(id) on delete cascade,
  created_at      timestamptz not null default now()
);

alter table public.asset_transactions
  drop constraint if exists asset_transactions_source_check;
alter table public.asset_transactions
  add constraint asset_transactions_source_check
  check (source in ('dashboard', 'ledger', 'manual', 'adjustment'));

create index if not exists asset_transactions_asset_id_idx
  on public.asset_transactions(asset_id, occurred_on desc);
create index if not exists asset_transactions_user_id_idx
  on public.asset_transactions(user_id);

alter table public.asset_transactions enable row level security;

drop policy if exists "asset_transactions_all_own" on public.asset_transactions;
create policy "asset_transactions_all_own"
  on public.asset_transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ================================
-- scheduled_payments: スケジュール支払い（カード・電気代・分割など）
-- ================================
create table if not exists public.scheduled_payments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  amount             numeric(12, 0) not null,
  due_date           date not null,
  recurring          boolean not null default false,
  recurring_end_date date null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists scheduled_payments_user_id_idx
  on public.scheduled_payments(user_id);

alter table public.scheduled_payments enable row level security;

drop policy if exists "scheduled_payments_all_own" on public.scheduled_payments;
create policy "scheduled_payments_all_own"
  on public.scheduled_payments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 各回の支払い完了記録
create table if not exists public.scheduled_payment_completions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  payment_id   uuid not null references public.scheduled_payments(id) on delete cascade,
  due_date     date not null,
  completed_at timestamptz not null default now(),
  unique (payment_id, due_date)
);

create index if not exists scheduled_payment_completions_payment_id_idx
  on public.scheduled_payment_completions(payment_id);
create index if not exists scheduled_payment_completions_user_id_idx
  on public.scheduled_payment_completions(user_id);

alter table public.scheduled_payment_completions enable row level security;

drop policy if exists "scheduled_payment_completions_all_own" on public.scheduled_payment_completions;
create policy "scheduled_payment_completions_all_own"
  on public.scheduled_payment_completions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ================================
-- savings_deposits: 貯金の実績記録
-- ================================
create table if not exists public.savings_deposits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  goal_id      uuid not null references public.savings_goals(id) on delete cascade,
  amount       numeric(12, 0) not null,
  deposited_on date not null default current_date,
  period_start date not null,
  note         text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists savings_deposits_user_id_idx
  on public.savings_deposits(user_id);
create index if not exists savings_deposits_goal_id_idx
  on public.savings_deposits(goal_id, period_start);

alter table public.savings_deposits enable row level security;

drop policy if exists "savings_deposits_all_own" on public.savings_deposits;
create policy "savings_deposits_all_own"
  on public.savings_deposits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- PostgREST のスキーマキャッシュを即時リロード
notify pgrst, 'reload schema';
