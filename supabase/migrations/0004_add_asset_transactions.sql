-- 資産の入出金履歴。Supabase SQL Editor で貼り付けて Run してください。
-- 何度実行しても安全（idempotent）。

CREATE TABLE IF NOT EXISTS public.asset_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id        uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  amount          numeric(12, 0) NOT NULL,
  occurred_on     date NOT NULL DEFAULT current_date,
  source          text NOT NULL DEFAULT 'manual',
  note            text NOT NULL DEFAULT '',
  ledger_entry_id uuid REFERENCES public.expenses(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_transactions
  DROP CONSTRAINT IF EXISTS asset_transactions_source_check;

ALTER TABLE public.asset_transactions
  ADD CONSTRAINT asset_transactions_source_check
  CHECK (source IN ('dashboard', 'ledger', 'manual', 'adjustment'));

CREATE INDEX IF NOT EXISTS asset_transactions_asset_id_idx
  ON public.asset_transactions(asset_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS asset_transactions_user_id_idx
  ON public.asset_transactions(user_id);

ALTER TABLE public.asset_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_transactions_all_own" ON public.asset_transactions;
CREATE POLICY "asset_transactions_all_own"
  ON public.asset_transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
