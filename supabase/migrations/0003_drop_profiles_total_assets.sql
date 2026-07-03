-- 使用しなくなった profiles.total_assets を削除。
-- Supabase SQL Editor で貼り付けて Run してください。
-- 何度実行しても安全（idempotent）。

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS total_assets;

NOTIFY pgrst, 'reload schema';
