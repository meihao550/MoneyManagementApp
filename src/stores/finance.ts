import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Expense, MonthlyBill, Profile, SavingsGoal } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'

function monthsUntil(targetDate: string): number {
  const now = new Date()
  const target = new Date(targetDate)
  const diffMs = target.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return Math.max(diffDays / 30.4375, 1 / 30.4375)
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { start: formatDate(start), end: formatDate(end) }
}

export const useFinanceStore = defineStore('finance', () => {
  const profile = ref<Profile | null>(null)
  const goal = ref<SavingsGoal | null>(null)
  const bills = ref<MonthlyBill[]>([])
  const expenses = ref<Expense[]>([])
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  const monthlySalary = computed(() => Number(profile.value?.monthly_salary ?? 0))

  const totalMonthlyBills = computed(() =>
    bills.value.reduce((sum, b) => sum + Number(b.amount), 0),
  )

  const goalTargetAmount = computed(() => Number(goal.value?.target_amount ?? 0))

  // 目標達成日までの残り月数（表示用に小数第1位まで丸め）
  const monthsToGoal = computed(() => {
    if (!goal.value) return 0
    return Math.round(monthsUntil(goal.value.target_date) * 10) / 10
  })

  const requiredMonthlySaving = computed(() => {
    if (!goal.value) return 0
    const months = monthsUntil(goal.value.target_date)
    return Math.ceil(goalTargetAmount.value / months)
  })

  // 今月の変動費として使える予算（消費前）
  const monthlyBudget = computed(() =>
    Math.max(
      monthlySalary.value - totalMonthlyBills.value - requiredMonthlySaving.value,
      0,
    ),
  )

  // 今月の消費合計
  const totalSpentThisMonth = computed(() =>
    expenses.value.reduce((sum, e) => sum + Number(e.amount), 0),
  )

  // 今日の消費合計
  const spentToday = computed(() => {
    const today = formatDate(new Date())
    return expenses.value
      .filter((e) => e.spent_on === today)
      .reduce((sum, e) => sum + Number(e.amount), 0)
  })

  // 消費を差し引いた今月の残り予算
  const remainingMonthlyBudget = computed(() =>
    monthlyBudget.value - totalSpentThisMonth.value,
  )

  const daysLeftInMonth = computed(() => {
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return end.getDate() - now.getDate() + 1
  })

  // 今日から月末までの1日あたり使える額（残り予算ベース）
  const dailyRemaining = computed(() =>
    daysLeftInMonth.value > 0
      ? Math.floor(remainingMonthlyBudget.value / daysLeftInMonth.value)
      : 0,
  )

  const weeklyRemaining = computed(() => Math.floor(dailyRemaining.value * 7))

  // 今日のノルマに対する残り（今日の日割り − 今日使った分）
  const todayRemaining = computed(() => dailyRemaining.value - spentToday.value)

  const isOverBudget = computed(() => remainingMonthlyBudget.value < 0)

  // 日付ごとの支出まとめ（新しい順）
  const expensesByDay = computed(() => {
    const map = new Map<string, { total: number; items: Expense[] }>()
    for (const e of expenses.value) {
      const entry = map.get(e.spent_on) ?? { total: 0, items: [] }
      entry.total += Number(e.amount)
      entry.items.push(e)
      map.set(e.spent_on, entry)
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, v]) => ({ date, total: v.total, items: v.items }))
  })

  async function fetchAll() {
    const auth = useAuthStore()
    if (!auth.user) return
    loading.value = true
    errorMessage.value = null

    try {
      const uid = auth.user.id
      const { start, end } = monthRange()

      const [profileRes, goalRes, billsRes, expensesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
        supabase
          .from('savings_goals')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('monthly_bills')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: true }),
        supabase
          .from('expenses')
          .select('*')
          .eq('user_id', uid)
          .gte('spent_on', start)
          .lte('spent_on', end)
          .order('spent_on', { ascending: false })
          .order('created_at', { ascending: false }),
      ])

      if (profileRes.error) throw profileRes.error
      if (goalRes.error) throw goalRes.error
      if (billsRes.error) throw billsRes.error
      if (expensesRes.error) throw expensesRes.error

      profile.value = profileRes.data as Profile | null
      goal.value = goalRes.data as SavingsGoal | null
      bills.value = (billsRes.data ?? []) as MonthlyBill[]
      expenses.value = (expensesRes.data ?? []) as Expense[]
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : '取得に失敗しました'
    } finally {
      loading.value = false
    }
  }

  async function saveSalary(amount: number) {
    const auth = useAuthStore()
    if (!auth.user) return
    const payload = {
      user_id: auth.user.id,
      monthly_salary: amount,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return
    }
    profile.value = data as Profile
  }

  async function saveGoal(input: {
    title: string
    target_amount: number
    target_date: string
  }) {
    const auth = useAuthStore()
    if (!auth.user) return

    if (goal.value) {
      const { data, error } = await supabase
        .from('savings_goals')
        .update({
          title: input.title,
          target_amount: input.target_amount,
          target_date: input.target_date,
        })
        .eq('id', goal.value.id)
        .select()
        .single()
      if (error) {
        errorMessage.value = error.message
        return
      }
      goal.value = data as SavingsGoal
    } else {
      const { data, error } = await supabase
        .from('savings_goals')
        .insert({ user_id: auth.user.id, ...input })
        .select()
        .single()
      if (error) {
        errorMessage.value = error.message
        return
      }
      goal.value = data as SavingsGoal
    }
  }

  async function addBill(input: { name: string; amount: number }) {
    const auth = useAuthStore()
    if (!auth.user) return
    const { data, error } = await supabase
      .from('monthly_bills')
      .insert({ user_id: auth.user.id, ...input })
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return
    }
    bills.value = [...bills.value, data as MonthlyBill]
  }

  async function removeBill(id: string) {
    const { error } = await supabase.from('monthly_bills').delete().eq('id', id)
    if (error) {
      errorMessage.value = error.message
      return
    }
    bills.value = bills.value.filter((b) => b.id !== id)
  }

  async function addExpense(input: { name: string; amount: number; spent_on?: string }) {
    const auth = useAuthStore()
    if (!auth.user) return
    const spent_on = input.spent_on ?? formatDate(new Date())
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: auth.user.id,
        name: input.name,
        amount: input.amount,
        spent_on,
      })
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return
    }
    // 挿入したものが今月分なら先頭に反映
    const { start, end } = monthRange()
    if (spent_on >= start && spent_on <= end) {
      expenses.value = [data as Expense, ...expenses.value]
    }
  }

  async function removeExpense(id: string) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) {
      errorMessage.value = error.message
      return
    }
    expenses.value = expenses.value.filter((e) => e.id !== id)
  }

  function reset() {
    profile.value = null
    goal.value = null
    bills.value = []
    expenses.value = []
    errorMessage.value = null
  }

  return {
    profile,
    goal,
    bills,
    expenses,
    loading,
    errorMessage,
    monthlySalary,
    totalMonthlyBills,
    goalTargetAmount,
    monthsToGoal,
    requiredMonthlySaving,
    monthlyBudget,
    totalSpentThisMonth,
    spentToday,
    remainingMonthlyBudget,
    dailyRemaining,
    weeklyRemaining,
    todayRemaining,
    isOverBudget,
    daysLeftInMonth,
    expensesByDay,
    fetchAll,
    saveSalary,
    saveGoal,
    addBill,
    removeBill,
    addExpense,
    removeExpense,
    reset,
  }
})
