-- Supabase SQL Editor で実行してください。
-- 何度実行しても安全（idempotent）に書いてあります。
-- auth.users は Supabase が管理しているので、user_id を FK として参照します。

-- ================================
-- profiles: 1ユーザ 1行（現在の総資産を保存）
-- ================================
create table if not exists public.profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  monthly_salary  numeric(12, 0) not null default 0,
  month_close_day integer not null default 25,
  updated_at      timestamptz not null default now()
);

-- 旧カラムを削除（存在すれば）
alter table public.profiles drop column if exists bank_balance;
alter table public.profiles drop column if exists total_assets;

alter table public.profiles
  add column if not exists month_close_day integer not null default 25;

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
-- assets: 総資産の内訳（銀行・現金・投資 など）
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
  source          text not null default 'manual' check (source in ('dashboard', 'ledger', 'manual', 'adjustment')),
  note            text not null default '',
  ledger_entry_id uuid references public.expenses(id) on delete cascade,
  created_at      timestamptz not null default now()
);

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
-- expenses: 日々の消費（家計簿）
-- ================================
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  amount     numeric(12, 0) not null,
  spent_on   date not null default current_date,
  kind       text not null default 'expense' check (kind in ('expense', 'income')),
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
-- PostgREST のスキーマキャッシュを即時リロード
-- ================================
notify pgrst, 'reload schema';
