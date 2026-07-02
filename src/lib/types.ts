export interface Profile {
  user_id: string
  monthly_salary: number
  bank_balance: number
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

export interface MonthlyBill {
  id: string
  user_id: string
  name: string
  amount: number
  created_at: string
}

export interface Expense {
  id: string
  user_id: string
  name: string
  amount: number
  spent_on: string
  created_at: string
}
