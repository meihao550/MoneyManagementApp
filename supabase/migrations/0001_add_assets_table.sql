-- Supabase SQL Editor でこのファイルの内容を貼り付けて Run してください。
-- 何度実行しても安全です（idempotent）。

CREATE TABLE IF NOT EXISTS public.assets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  amount     numeric(12, 0) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_user_id_idx
  ON public.assets(user_id);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assets_all_own" ON public.assets;
CREATE POLICY "assets_all_own"
  ON public.assets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- PostgREST のスキーマキャッシュを即時リロード
NOTIFY pgrst, 'reload schema';
