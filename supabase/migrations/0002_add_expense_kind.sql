-- Supabase SQL Editor でこのファイル内容を貼り付けて Run してください。
-- 何度実行しても安全（idempotent）。

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'expense';

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_kind_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_kind_check CHECK (kind IN ('expense', 'income'));

NOTIFY pgrst, 'reload schema';
