export interface Profile {
  user_id: string
  monthly_salary: number
  month_close_day: number
  expected_monthly_income: number
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

export interface ScheduledPayment {
  id: string
  user_id: string
  name: string
  amount: number
  due_date: string
  recurring: boolean
  recurring_end_date: string | null
  created_at: string
  updated_at: string
}

export interface ScheduledPaymentCompletion {
  id: string
  user_id: string
  payment_id: string
  due_date: string
  completed_at: string
}

export interface SavingsDeposit {
  id: string
  user_id: string
  goal_id: string
  amount: number
  deposited_on: string
  period_start: string
  note: string
  created_at: string
}

// UI表示用: 各回の支払い予定エントリー
export interface ScheduledPaymentOccurrence {
  payment: ScheduledPayment
  date: string
  completed: boolean
  completionId: string | null
}
