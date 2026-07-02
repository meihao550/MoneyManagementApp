import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Expense, MonthlyBill, Profile, SavingsGoal } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'

const AVG_DAYS_PER_MONTH = 30.4375

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.max(Math.ceil(ms / (1000 * 60 * 60 * 24)), 1)
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

  const bankBalance = computed(() => Number(profile.value?.bank_balance ?? 0))

  const totalMonthlyBills = computed(() =>
    bills.value.reduce((sum, b) => sum + Number(b.amount), 0),
  )

  const goalTargetAmount = computed(() => Number(goal.value?.target_amount ?? 0))

  // 予算計算の期限: 目標があればその日付、なければ今月末
  const horizonDate = computed(() => {
    if (goal.value) return new Date(goal.value.target_date)
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 0)
  })

  const daysUntilHorizon = computed(() => daysBetween(new Date(), horizonDate.value))

  const monthsUntilHorizon = computed(() => daysUntilHorizon.value / AVG_DAYS_PER_MONTH)

  // 目標達成日までの残り月数（表示用）
  const monthsToGoal = computed(() => {
    if (!goal.value) return 0
    return Math.round(monthsUntilHorizon.value * 10) / 10
  })

  // 目標日までに支払う予定の固定費合計（見込み）
  const projectedBills = computed(() =>
    Math.ceil(totalMonthlyBills.value * monthsUntilHorizon.value),
  )

  // 目標達成のために口座に残しておくべき金額
  const reservedForGoal = computed(() => goalTargetAmount.value)

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

  // 目標日までに使える総額（変動費）
  // = 預金 − 目標分 − 今後の固定費 − すでに今月使った額
  const spendableUntilHorizon = computed(() =>
    bankBalance.value - reservedForGoal.value - projectedBills.value - totalSpentThisMonth.value,
  )

  const isOverBudget = computed(() => spendableUntilHorizon.value < 0)

  // 1日あたり使える額
  const dailySpendable = computed(() =>
    daysUntilHorizon.value > 0
      ? Math.floor(spendableUntilHorizon.value / daysUntilHorizon.value)
      : 0,
  )

  const weeklySpendable = computed(() => Math.floor(dailySpendable.value * 7))

  // 月換算した使える額
  const monthlySpendable = computed(() =>
    Math.floor(dailySpendable.value * AVG_DAYS_PER_MONTH),
  )

  // 今月末までに使える見込み（1日あたり × 今月残日数）
  const daysLeftInMonth = computed(() => {
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return end.getDate() - now.getDate() + 1
  })

  // 今日の残り（1日の予算 − 今日使った額）
  const todayRemaining = computed(() => dailySpendable.value - spentToday.value)

  // 目標達成度（0〜1）
  const goalProgress = computed(() => {
    if (!goal.value || goalTargetAmount.value <= 0) return 0
    return Math.min(bankBalance.value / goalTargetAmount.value, 1)
  })

  // 目標達成に不足している額
  const goalRemainingToSave = computed(() =>
    Math.max(goalTargetAmount.value - bankBalance.value, 0),
  )

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

  async function saveBankBalance(amount: number) {
    const auth = useAuthStore()
    if (!auth.user) return
    const payload = {
      user_id: auth.user.id,
      bank_balance: amount,
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
    bankBalance,
    totalMonthlyBills,
    goalTargetAmount,
    horizonDate,
    daysUntilHorizon,
    monthsUntilHorizon,
    monthsToGoal,
    projectedBills,
    reservedForGoal,
    totalSpentThisMonth,
    spentToday,
    spendableUntilHorizon,
    isOverBudget,
    dailySpendable,
    weeklySpendable,
    monthlySpendable,
    daysLeftInMonth,
    todayRemaining,
    goalProgress,
    goalRemainingToSave,
    expensesByDay,
    fetchAll,
    saveBankBalance,
    saveGoal,
    addBill,
    removeBill,
    addExpense,
    removeExpense,
    reset,
  }
})
