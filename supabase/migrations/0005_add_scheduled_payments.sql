-- スケジュール支払い（クレジットカード・電気代・分割払い など）
-- Supabase SQL Editor で貼り付けて Run してください。
-- 何度実行しても安全（idempotent）。

CREATE TABLE IF NOT EXISTS public.scheduled_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name               text NOT NULL,
  amount             numeric(12, 0) NOT NULL,
  due_date           date NOT NULL,           -- 最初 or 唯一の支払日
  recurring          boolean NOT NULL DEFAULT false,   -- 毎月繰り返すか
  recurring_end_date date NULL,               -- 繰り返しの終了日（NULL=無期限）
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_payments_user_id_idx
  ON public.scheduled_payments(user_id);

ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_payments_all_own" ON public.scheduled_payments;
CREATE POLICY "scheduled_payments_all_own"
  ON public.scheduled_payments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 各回の支払い完了記録
CREATE TABLE IF NOT EXISTS public.scheduled_payment_completions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id   uuid NOT NULL REFERENCES public.scheduled_payments(id) ON DELETE CASCADE,
  due_date     date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, due_date)
);

CREATE INDEX IF NOT EXISTS scheduled_payment_completions_payment_id_idx
  ON public.scheduled_payment_completions(payment_id);
CREATE INDEX IF NOT EXISTS scheduled_payment_completions_user_id_idx
  ON public.scheduled_payment_completions(user_id);

ALTER TABLE public.scheduled_payment_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_payment_completions_all_own" ON public.scheduled_payment_completions;
CREATE POLICY "scheduled_payment_completions_all_own"
  ON public.scheduled_payment_completions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
