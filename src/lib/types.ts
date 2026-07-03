export interface Profile {
  user_id: string
  monthly_salary: number
  month_close_day: number
  updated_at: string
}

export interface SavingsGoal {
  id: string
  user_id: string
  title: string
  target_amount: number
  target_date: string
  created_at: string
}

export interface Asset {
  id: string
  user_id: string
  name: string
  amount: number
  created_at: string
  updated_at: string
}

export type AssetTransactionSource = 'dashboard' | 'ledger' | 'manual' | 'adjustment'

export interface AssetTransaction {
  id: string
  user_id: string
  asset_id: string
  amount: number
  occurred_on: string
  source: AssetTransactionSource
  note: string
  ledger_entry_id: string | null
  created_at: string
}

export interface MonthlyBill {
  id: string
  user_id: string
  name: string
  amount: number
  created_at: string
}

export type EntryKind = 'expense' | 'income'

export interface Expense {
  id: string
  user_id: string
  name: string
  amount: number
  spent_on: string
  kind: EntryKind
  created_at: string
}
