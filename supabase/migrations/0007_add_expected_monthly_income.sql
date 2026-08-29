-- 月々の入金見込み（給料などの月次インフロー想定額）を profiles に追加。
-- 3ヶ月予算予測を現実的にするために使用。
-- Supabase SQL Editor に貼り付けて Run してください。冪等。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expected_monthly_income numeric(12, 0) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
