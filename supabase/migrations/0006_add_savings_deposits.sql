-- 貯金の実績記録テーブル。目標に対して各期間で「いくら貯金したか」を追跡する。
-- Supabase SQL Editor に貼り付けて Run してください。冪等（何度実行してもOK）。

CREATE TABLE IF NOT EXISTS public.savings_deposits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id       uuid NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  amount        numeric(12, 0) NOT NULL,
  deposited_on  date NOT NULL DEFAULT current_date,
  period_start  date NOT NULL,       -- どの期間の貯金か（月じめ日ベース）
  note          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS savings_deposits_user_id_idx
  ON public.savings_deposits(user_id);
CREATE INDEX IF NOT EXISTS savings_deposits_goal_id_idx
  ON public.savings_deposits(goal_id, period_start);

ALTER TABLE public.savings_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "savings_deposits_all_own" ON public.savings_deposits;
CREATE POLICY "savings_deposits_all_own"
  ON public.savings_deposits FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
