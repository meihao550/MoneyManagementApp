import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type {
  Asset,
  AssetTransaction,
  AssetTransactionSource,
  EntryKind,
  Expense,
  MonthlyBill,
  Profile,
  SavingsDeposit,
  SavingsGoal,
  ScheduledPayment,
  ScheduledPaymentCompletion,
  ScheduledPaymentOccurrence,
} from '@/lib/types'
import { useAuthStore } from '@/stores/auth'

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 年月と締め日から、その月の実在する日付を返す（31日締めで30日しかない月なら30日）
function safeDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, lastDay))
}

// 今日を含む「月じめ期間」の開始日
function calcPeriodStart(closeDay: number, today: Date): Date {
  const t = dateOnly(today)
  const thisMonthClose = safeDay(t.getFullYear(), t.getMonth(), closeDay)
  if (thisMonthClose <= t) return thisMonthClose
  return safeDay(t.getFullYear(), t.getMonth() - 1, closeDay)
}

// 現在の期間の終了日（次の締め日の前日）
function calcPeriodEnd(closeDay: number, today: Date): Date {
  const start = calcPeriodStart(closeDay, today)
  const next = safeDay(start.getFullYear(), start.getMonth() + 1, closeDay)
  const end = new Date(next)
  end.setDate(end.getDate() - 1)
  return end
}

// Supabaseの PostgrestError などは Error インスタンスではないので、
// message / details / hint を拾えるように寛容に文字列化する
function extractErrorMessage(e: unknown): string | null {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const anyE = e as Record<string, unknown>
    const parts = [anyE.message, anyE.details, anyE.hint, anyE.code]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
    if (parts.length) return parts.join(' — ')
  }
  return null
}

// today以降で最初に来る締め日（today == 締め日なら today を返す）
function firstCloseDayOnOrAfter(closeDay: number, today: Date): Date {
  const t = dateOnly(today)
  const thisMonthClose = safeDay(t.getFullYear(), t.getMonth(), closeDay)
  if (thisMonthClose >= t) return thisMonthClose
  return safeDay(t.getFullYear(), t.getMonth() + 1, closeDay)
}

// today から goal までに来る締め日の回数
function countCloseDaysUntil(closeDay: number, today: Date, goal: Date): number {
  const goalDay = dateOnly(goal)
  let d = firstCloseDayOnOrAfter(closeDay, today)
  let count = 0
  while (d <= goalDay) {
    count++
    d = safeDay(d.getFullYear(), d.getMonth() + 1, closeDay)
  }
  return count
}

export const useFinanceStore = defineStore('finance', () => {
  const profile = ref<Profile | null>(null)
  const goal = ref<SavingsGoal | null>(null)
  const bills = ref<MonthlyBill[]>([])
  const expenses = ref<Expense[]>([])
  const assets = ref<Asset[]>([])
  const assetTransactions = ref<AssetTransaction[]>([])
  const scheduledPayments = ref<ScheduledPayment[]>([])
  const scheduledCompletions = ref<ScheduledPaymentCompletion[]>([])
  const savingsDeposits = ref<SavingsDeposit[]>([])
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  function transactionsForAsset(assetId: string) {
    return assetTransactions.value
      .filter((t) => t.asset_id === assetId)
      .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1))
  }

  const totalAssets = computed(() =>
    assets.value.reduce((sum, a) => sum + Number(a.amount), 0),
  )
  const monthCloseDay = computed(() => Number(profile.value?.month_close_day ?? 25))
  const expectedMonthlyIncome = computed(() =>
    Number(profile.value?.expected_monthly_income ?? 0),
  )

  const totalMonthlyBills = computed(() =>
    bills.value.reduce((sum, b) => sum + Number(b.amount), 0),
  )

  const goalTargetAmount = computed(() => Number(goal.value?.target_amount ?? 0))

  // 現在の期間（月じめ〜月じめ）
  const periodStart = computed(() => calcPeriodStart(monthCloseDay.value, new Date()))
  const periodEnd = computed(() => calcPeriodEnd(monthCloseDay.value, new Date()))

  // 期間の残り日数（今日含む）
  const daysLeftInPeriod = computed(() => {
    const today = dateOnly(new Date())
    const end = dateOnly(periodEnd.value)
    const diff = Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return Math.max(diff, 1)
  })

  // 目標日までに来る締め日の回数（＝月割りする月数）
  const monthsToGoal = computed(() => {
    if (!goal.value) return 0
    return Math.max(
      countCloseDaysUntil(monthCloseDay.value, new Date(), new Date(goal.value.target_date)),
      1,
    )
  })

  // 現在の目標に対して、これまでに貯金した合計額
  const totalSavedForGoal = computed(() => {
    if (!goal.value) return 0
    const gid = goal.value.id
    return savingsDeposits.value
      .filter((d) => d.goal_id === gid)
      .reduce((sum, d) => sum + Number(d.amount), 0)
  })

  // 目標達成までの残り必要額（既に貯金した分を差し引く）
  const remainingToSave = computed(() =>
    Math.max(goalTargetAmount.value - totalSavedForGoal.value, 0),
  )

  // 目標達成度（0〜1）
  const goalProgress = computed(() => {
    if (!goal.value || goalTargetAmount.value <= 0) return 0
    return Math.min(totalSavedForGoal.value / goalTargetAmount.value, 1)
  })

  // 目標達成済みか
  const isGoalAchieved = computed(() =>
    goal.value ? totalSavedForGoal.value >= goalTargetAmount.value : false,
  )

  // 月あたりの貯金額（残額 ÷ 残り月数）
  // 既に貯金できていれば少ない額に、達成済みなら 0 に
  const monthlySavingContribution = computed(() => {
    if (!goal.value || monthsToGoal.value <= 0) return 0
    if (remainingToSave.value <= 0) return 0
    return Math.ceil(remainingToSave.value / monthsToGoal.value)
  })

  // 現在期間の日付範囲
  const periodStartStr = computed(() => formatDate(periodStart.value))
  const periodEndStr = computed(() => formatDate(periodEnd.value))

  // 現在期間で貯金済みか
  const savingsForCurrentPeriod = computed(() =>
    goal.value
      ? savingsDeposits.value.filter(
          (d) =>
            d.goal_id === goal.value!.id &&
            d.period_start === periodStartStr.value,
        )
      : [],
  )
  const hasDepositedThisPeriod = computed(() => savingsForCurrentPeriod.value.length > 0)
  const totalSavedThisPeriod = computed(() =>
    savingsForCurrentPeriod.value.reduce((sum, d) => sum + Number(d.amount), 0),
  )

  // 「そろそろ貯金の月末通知を出すか」判定 (期間終了まで残り 3 日以内 かつ 未貯金)
  const shouldRemindDeposit = computed(() => {
    if (!goal.value) return false
    if (isGoalAchieved.value) return false
    if (hasDepositedThisPeriod.value) return false
    return daysLeftInPeriod.value <= 3
  })

  // 資産に紐付いた家計簿エントリー（IDセット）— 資産減算で反映済みなので重複計上を防ぐ
  const linkedLedgerEntryIds = computed(
    () =>
      new Set(
        assetTransactions.value
          .filter((t) => t.ledger_entry_id)
          .map((t) => t.ledger_entry_id as string),
      ),
  )

  // 現在期間の支出合計（資産に紐付いた支出は除外）
  const totalSpentThisPeriod = computed(() =>
    expenses.value
      .filter(
        (e) =>
          e.kind === 'expense' &&
          !linkedLedgerEntryIds.value.has(e.id) &&
          e.spent_on >= periodStartStr.value &&
          e.spent_on <= periodEndStr.value,
      )
      .reduce((sum, e) => sum + Number(e.amount), 0),
  )

  // 現在期間の収入合計
  const totalIncomeThisPeriod = computed(() =>
    expenses.value
      .filter(
        (e) =>
          e.kind === 'income' &&
          e.spent_on >= periodStartStr.value &&
          e.spent_on <= periodEndStr.value,
      )
      .reduce((sum, e) => sum + Number(e.amount), 0),
  )

  // 今日の支出合計
  const spentToday = computed(() => {
    const today = formatDate(new Date())
    return expenses.value
      .filter((e) => e.kind === 'expense' && e.spent_on === today)
      .reduce((sum, e) => sum + Number(e.amount), 0)
  })

  // 今日より前の支出合計（1日予算を「今日の朝時点」で固定するために使用）
  const totalSpentBeforeToday = computed(() => {
    const today = formatDate(new Date())
    return expenses.value
      .filter(
        (e) =>
          e.kind === 'expense' &&
          !linkedLedgerEntryIds.value.has(e.id) &&
          e.spent_on >= periodStartStr.value &&
          e.spent_on < today,
      )
      .reduce((sum, e) => sum + Number(e.amount), 0)
  })

  // 1つのスケジュール支払いから、指定範囲内のオカレンス（実支払日）を全部返す
  // 日付は全て YYYY-MM-DD 文字列で比較（タイムゾーンの罠を回避）
  function occurrencesForPayment(
    payment: ScheduledPayment,
    from: Date,
    to: Date,
  ): string[] {
    const fromStr = formatDate(from)
    const toStr = formatDate(to)
    const firstStr = payment.due_date
    const endStr = payment.recurring_end_date ?? '9999-12-31'

    // 単発
    if (!payment.recurring) {
      if (firstStr >= fromStr && firstStr <= toStr) {
        return [firstStr]
      }
      return []
    }

    // 繰り返し: due_date の日を毎月拾う
    // due_date を「年・月・日」に分解（Date コンストラクタ経由だと UTC 解釈で 1日ずれる可能性あり）
    const parts = firstStr.split('-').map(Number)
    const firstYear = parts[0]!
    const firstMonth = parts[1]! - 1
    const dayOfMonth = parts[2]!

    const results: string[] = []
    let year = firstYear
    let month = firstMonth

    while (true) {
      const occurrence = safeDay(year, month, dayOfMonth)
      const occStr = formatDate(occurrence)
      if (occStr > toStr) break
      if (occStr >= firstStr && occStr <= endStr && occStr >= fromStr) {
        results.push(occStr)
      }
      month++
      if (month > 11) {
        month = 0
        year++
      }
      // 安全策
      if (year - firstYear > 100) break
    }
    return results
  }

  // 指定した offset ヶ月先の期間 [periodStart, periodEnd] を返す
  function periodAtOffset(offset: number): { start: Date; end: Date } {
    const closeDay = monthCloseDay.value
    const base = periodStart.value
    const start = safeDay(base.getFullYear(), base.getMonth() + offset, closeDay)
    const nextStart = safeDay(start.getFullYear(), start.getMonth() + 1, closeDay)
    const end = new Date(nextStart)
    end.setDate(end.getDate() - 1)
    return { start, end }
  }

  // 指定期間内のスケジュール支払い合計
  function totalScheduledInRange(
    from: Date,
    to: Date,
    ignorePaymentId: string | null = null,
    extraPayment: ScheduledPayment | null = null,
  ): number {
    let sum = 0
    const list = extraPayment
      ? [...scheduledPayments.value, extraPayment]
      : scheduledPayments.value
    for (const p of list) {
      if (ignorePaymentId && p.id === ignorePaymentId) continue
      const dates = occurrencesForPayment(p, from, to)
      sum += dates.length * Number(p.amount)
    }
    return sum
  }

  // 指定期間の 1日あたり予算予測（total_assetsは共通、他は期間ごと）
  // total_assets を各期間の頭で「使いきる」想定の粗い予測。UI に「傾向」を見せるため
  function forecastForPeriod(offset: number, extraPayment: ScheduledPayment | null = null): {
    start: Date
    end: Date
    days: number
    base: number
    baseLabel: string
    carryover: number
    carryoverLabel: string
    income: number
    bills: number
    scheduled: number
    saving: number
    spendable: number
    daily: number
  } {
    const { start, end } = periodAtOffset(offset)
    const days = Math.max(
      Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      1,
    )
    const scheduled = totalScheduledInRange(start, end, null, extraPayment)
    const bills = totalMonthlyBills.value
    // 貯金予測: 目標残額から均等割り
    let saving = 0
    if (goal.value) {
      const closeDay = monthCloseDay.value
      const startStr = formatDate(start)
      const parts = goal.value.target_date.split('-').map(Number)
      const goalYear = parts[0]!
      const goalMonth = parts[1]! - 1
      const goalDay = parts[2]!
      const goalDate = safeDay(goalYear, goalMonth, goalDay)
      const goalStr = formatDate(goalDate)
      let count = 0
      let y = start.getFullYear()
      let m = start.getMonth()
      while (true) {
        const closeDate = safeDay(y, m, closeDay)
        const closeStr = formatDate(closeDate)
        if (closeStr > goalStr) break
        if (closeStr >= startStr) count++
        m++
        if (m > 11) { m = 0; y++ }
        if (y - start.getFullYear() > 100) break
      }
      if (count > 0 && remainingToSave.value > 0) {
        saving = Math.ceil(remainingToSave.value / Math.max(count, 1))
      }
    }

    // ベース額の決定:
    // - 今期 (offset=0): 現在の総資産
    // - 未来期: 前期の使える残り (carryover) + 月々の見込み入金
    //   月々の入金が未設定なら、carryover だけ（総資産で近似）
    let base: number
    let baseLabel: string
    let carryover = 0
    let carryoverLabel = ''
    let income = 0
    if (offset === 0) {
      base = totalAssets.value
      baseLabel = '総資産'
    } else {
      // 前期の予測を計算（再帰、offset≤2なので浅い）
      const previous = forecastForPeriod(offset - 1, extraPayment)
      carryover = previous.spendable
      carryoverLabel = offset === 1 ? '今期の残り' : `${offset - 1}ヶ月後の残り`
      if (expectedMonthlyIncome.value > 0) {
        income = expectedMonthlyIncome.value
        base = carryover + income
        baseLabel = `${carryoverLabel} + 月々の入金`
      } else {
        base = carryover
        baseLabel = `${carryoverLabel}（月々の入金未設定）`
      }
    }

    const spendable = Math.max(base - bills - scheduled - saving, 0)
    const daily = Math.floor(spendable / days)
    return {
      start, end, days,
      base, baseLabel,
      carryover, carryoverLabel, income,
      bills, scheduled, saving, spendable, daily,
    }
  }

  // 次月 (offset=1) の 1日予算 予測
  function nextMonthDailyBudget(extraPayment: ScheduledPayment | null = null): number {
    return forecastForPeriod(1, extraPayment).daily
  }

  // 繰り返し支払いの「今後の残り回数」（今日以降で終了日まで）
  function remainingOccurrencesForPayment(payment: ScheduledPayment): number {
    if (!payment.recurring) return 1
    const today = formatDate(new Date())
    const endStr = payment.recurring_end_date ?? '9999-12-31'
    const parts = payment.due_date.split('-').map(Number)
    const firstYear = parts[0]!
    const firstMonth = parts[1]! - 1
    const dayOfMonth = parts[2]!
    let year = firstYear
    let month = firstMonth
    let count = 0
    while (true) {
      const occurrence = safeDay(year, month, dayOfMonth)
      const occStr = formatDate(occurrence)
      if (occStr > endStr) break
      if (occStr >= today && occStr >= payment.due_date) count++
      month++
      if (month > 11) { month = 0; year++ }
      if (year - firstYear > 100) break
    }
    return count
  }

  // 現在の期間内の全支払い予定
  const scheduledPaymentsInPeriod = computed<ScheduledPaymentOccurrence[]>(() => {
    const items: ScheduledPaymentOccurrence[] = []
    for (const p of scheduledPayments.value) {
      const dates = occurrencesForPayment(p, periodStart.value, periodEnd.value)
      for (const date of dates) {
        const completion = scheduledCompletions.value.find(
          (c) => c.payment_id === p.id && c.due_date === date,
        )
        items.push({
          payment: p,
          date,
          completed: !!completion,
          completionId: completion?.id ?? null,
        })
      }
    }
    return items.sort((a, b) => (a.date < b.date ? -1 : 1))
  })

  // 期間内の支払い合計（未完了/完了問わず、budget から差し引かれる）
  const totalScheduledInPeriod = computed(() =>
    scheduledPaymentsInPeriod.value.reduce(
      (sum, item) => sum + Number(item.payment.amount),
      0,
    ),
  )

  // 今日が支払い日のもの
  const paymentsToday = computed(() => {
    const today = formatDate(new Date())
    return scheduledPaymentsInPeriod.value.filter((item) => item.date === today)
  })

  // 期限切れ（過去日）で未完了のもの
  const overduePayments = computed(() => {
    const today = formatDate(new Date())
    return scheduledPaymentsInPeriod.value.filter(
      (item) => item.date < today && !item.completed,
    )
  })

  // 今後の支払い（未来）
  const upcomingPayments = computed(() => {
    const today = formatDate(new Date())
    return scheduledPaymentsInPeriod.value.filter((item) => item.date > today)
  })

  // 通知が必要な支払い（今日 + 期限切れ で未完了）
  const paymentsNeedingAttention = computed(() =>
    [...paymentsToday.value, ...overduePayments.value].filter((item) => !item.completed),
  )

  // 今の期間で使える予算（表示用: 今日の支出も差し引いた「残り」）
  // 収入は「現在の総資産」に反映されるので二重計上を避ける
  // スケジュール支払いは budget から差し引く（支払い当日はここから引かれた形で日割りされる）
  // = 総資産 − 今月分の貯金 − 今月の固定費 − スケジュール支払い − 期間の支出
  const spendableThisPeriod = computed(() =>
    totalAssets.value
      - monthlySavingContribution.value
      - totalMonthlyBills.value
      - totalScheduledInPeriod.value
      - totalSpentThisPeriod.value,
  )

  // 「今日の朝時点」の残り予算（日割り計算用）
  // 今日使ったぶんはまだ引かない → 今日1日で 日割り予算 を固定する
  const spendableAtStartOfToday = computed(() =>
    totalAssets.value
      - monthlySavingContribution.value
      - totalMonthlyBills.value
      - totalScheduledInPeriod.value
      - totalSpentBeforeToday.value,
  )

  // 今日支払いがある場合の合計額（表示用）
  const paymentsTodayTotal = computed(() =>
    paymentsToday.value.reduce((sum, item) => sum + Number(item.payment.amount), 0),
  )

  const isOverBudget = computed(() => spendableThisPeriod.value < 0)

  // 1日に使える額
  // = (今日の朝時点で残っている予算) ÷ (今日を含む残り日数)
  // 今日いくら使っても、今日中は同じ値を返す
  // 翌日になると「昨日までの支出」が反映されるので、
  //   - 今日使い切ったら翌日は少し下がる
  //   - 今日節約したら翌日は少し上がる
  const dailySpendable = computed(() =>
    daysLeftInPeriod.value > 0
      ? Math.floor(spendableAtStartOfToday.value / daysLeftInPeriod.value)
      : 0,
  )

  const weeklySpendable = computed(() => Math.floor(dailySpendable.value * 7))

  const monthlySpendable = computed(() => spendableThisPeriod.value)

  const todayRemaining = computed(() => dailySpendable.value - spentToday.value)

  // 日付ごとの内訳（新しい順）
  const entriesByDay = computed(() => {
    const map = new Map<
      string,
      { expense: number; income: number; items: Expense[] }
    >()
    for (const e of expenses.value) {
      const entry = map.get(e.spent_on) ?? { expense: 0, income: 0, items: [] }
      const amount = Number(e.amount)
      if (e.kind === 'income') entry.income += amount
      else entry.expense += amount
      entry.items.push(e)
      map.set(e.spent_on, entry)
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, v]) => ({
        date,
        expense: v.expense,
        income: v.income,
        net: v.expense - v.income,
        items: v.items,
      }))
  })

  // 指定日の内訳を取り出す
  function entriesOnDate(date: string) {
    return expenses.value
      .filter((e) => e.spent_on === date)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }

  async function fetchAll() {
    const auth = useAuthStore()
    if (!auth.user) return
    loading.value = true
    errorMessage.value = null

    try {
      const uid = auth.user.id

      // 先にプロフィールを読み込んで締め日を確定
      const profileRes = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle()
      if (profileRes.error) throw profileRes.error
      profile.value = profileRes.data as Profile | null

      const [
        goalRes,
        billsRes,
        expensesRes,
        assetsRes,
        assetTxRes,
        schedRes,
        schedComplRes,
        savingsRes,
      ] = await Promise.all([
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
          .order('spent_on', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('assets')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: true }),
        supabase
          .from('asset_transactions')
          .select('*')
          .eq('user_id', uid)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('scheduled_payments')
          .select('*')
          .eq('user_id', uid)
          .order('due_date', { ascending: true }),
        supabase
          .from('scheduled_payment_completions')
          .select('*')
          .eq('user_id', uid)
          .order('due_date', { ascending: false }),
        supabase
          .from('savings_deposits')
          .select('*')
          .eq('user_id', uid)
          .order('deposited_on', { ascending: false }),
      ])

      if (goalRes.error) throw goalRes.error
      if (billsRes.error) throw billsRes.error
      if (expensesRes.error) throw expensesRes.error
      if (assetsRes.error) throw assetsRes.error
      if (assetTxRes.error) throw assetTxRes.error
      if (schedRes.error) throw schedRes.error
      if (schedComplRes.error) throw schedComplRes.error
      if (savingsRes.error) throw savingsRes.error

      goal.value = goalRes.data as SavingsGoal | null
      bills.value = (billsRes.data ?? []) as MonthlyBill[]
      expenses.value = (expensesRes.data ?? []) as Expense[]
      assets.value = (assetsRes.data ?? []) as Asset[]
      assetTransactions.value = (assetTxRes.data ?? []) as AssetTransaction[]
      scheduledPayments.value = (schedRes.data ?? []) as ScheduledPayment[]
      scheduledCompletions.value = (schedComplRes.data ?? []) as ScheduledPaymentCompletion[]
      savingsDeposits.value = (savingsRes.data ?? []) as SavingsDeposit[]
    } catch (e) {
      console.error('finance.fetchAll failed:', e)
      errorMessage.value = extractErrorMessage(e) ?? '取得に失敗しました'
    } finally {
      loading.value = false
    }
  }

  async function saveMonthCloseDay(day: number) {
    const auth = useAuthStore()
    if (!auth.user) return
    const payload = {
      user_id: auth.user.id,
      month_close_day: day,
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
    // 締め日が変わると期間が変わるので expenses を取り直す
    await fetchAll()
  }

  async function saveExpectedMonthlyIncome(amount: number) {
    const auth = useAuthStore()
    if (!auth.user) return
    const payload = {
      user_id: auth.user.id,
      expected_monthly_income: amount,
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

  // 単純に asset レコードのカラム更新（履歴は残さない）
  async function patchAssetRecord(id: string, patch: { name?: string; amount?: number }) {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.amount !== undefined) payload.amount = patch.amount

    const { data, error } = await supabase
      .from('assets')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return null
    }
    assets.value = assets.value.map((a) => (a.id === id ? (data as Asset) : a))
    return data as Asset
  }

  // 新規資産を追加（初期入力は履歴にも記録）
  async function addAsset(input: {
    name: string
    amount: number
    source?: AssetTransactionSource
    occurred_on?: string
    ledger_entry_id?: string | null
    note?: string
  }) {
    const auth = useAuthStore()
    if (!auth.user) return null
    const source: AssetTransactionSource = input.source ?? 'dashboard'
    const occurred_on = input.occurred_on ?? formatDate(new Date())

    const { data, error } = await supabase
      .from('assets')
      .insert({ user_id: auth.user.id, name: input.name, amount: input.amount })
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return null
    }
    const asset = data as Asset
    assets.value = [...assets.value, asset]

    if (input.amount > 0) {
      await addAssetTransaction({
        asset_id: asset.id,
        amount: input.amount,
        occurred_on,
        source,
        note: input.note ?? '',
        ledger_entry_id: input.ledger_entry_id ?? null,
      })
    }
    return asset
  }

  // 資産の名前を変更（履歴は作らない）
  async function renameAsset(id: string, name: string) {
    await patchAssetRecord(id, { name })
  }

  // 全体の金額を直接指定（差分は adjustment 履歴として残る）
  async function setAssetTotal(id: string, newTotal: number, occurred_on?: string) {
    const current = assets.value.find((a) => a.id === id)
    if (!current) return
    const delta = newTotal - Number(current.amount)
    if (delta === 0) return
    await addAssetTransaction({
      asset_id: id,
      amount: delta,
      occurred_on: occurred_on ?? formatDate(new Date()),
      source: 'adjustment',
      note: '',
      ledger_entry_id: null,
    })
  }

  async function removeAsset(id: string) {
    const { error } = await supabase.from('assets').delete().eq('id', id)
    if (error) {
      errorMessage.value = error.message
      return
    }
    assets.value = assets.value.filter((a) => a.id !== id)
    // FKのcascadeで asset_transactions も消えるが、フロントの状態も同期
    assetTransactions.value = assetTransactions.value.filter((t) => t.asset_id !== id)
  }

  // 資産履歴の追加：履歴を記録し、資産の合計金額に delta を反映
  async function addAssetTransaction(input: {
    asset_id: string
    amount: number
    occurred_on: string
    source: AssetTransactionSource
    note?: string
    ledger_entry_id?: string | null
  }) {
    const auth = useAuthStore()
    if (!auth.user) return null

    const { data, error } = await supabase
      .from('asset_transactions')
      .insert({
        user_id: auth.user.id,
        asset_id: input.asset_id,
        amount: input.amount,
        occurred_on: input.occurred_on,
        source: input.source,
        note: input.note ?? '',
        ledger_entry_id: input.ledger_entry_id ?? null,
      })
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return null
    }
    assetTransactions.value = [data as AssetTransaction, ...assetTransactions.value]

    // 資産の合計金額を再計算
    await recomputeAssetAmount(input.asset_id)
    return data as AssetTransaction
  }

  // 履歴の値/日付を編集
  async function updateAssetTransaction(
    id: string,
    patch: { amount?: number; occurred_on?: string; note?: string },
  ) {
    const current = assetTransactions.value.find((t) => t.id === id)
    if (!current) return
    const payload: Record<string, unknown> = {}
    if (patch.amount !== undefined) payload.amount = patch.amount
    if (patch.occurred_on !== undefined) payload.occurred_on = patch.occurred_on
    if (patch.note !== undefined) payload.note = patch.note

    const { data, error } = await supabase
      .from('asset_transactions')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return
    }
    assetTransactions.value = assetTransactions.value.map((t) =>
      t.id === id ? (data as AssetTransaction) : t,
    )
    await recomputeAssetAmount(current.asset_id)
  }

  async function removeAssetTransaction(id: string) {
    const current = assetTransactions.value.find((t) => t.id === id)
    if (!current) return
    const { error } = await supabase.from('asset_transactions').delete().eq('id', id)
    if (error) {
      errorMessage.value = error.message
      return
    }
    assetTransactions.value = assetTransactions.value.filter((t) => t.id !== id)
    // 家計簿と紐付いていれば家計簿側も削除
    if (current.ledger_entry_id) {
      const linked = expenses.value.find((e) => e.id === current.ledger_entry_id)
      if (linked) {
        await supabase.from('expenses').delete().eq('id', current.ledger_entry_id)
        expenses.value = expenses.value.filter((e) => e.id !== current.ledger_entry_id)
      }
    }
    await recomputeAssetAmount(current.asset_id)
  }

  // 資産の合計金額を「その資産の履歴合計」で再計算して DB に反映
  async function recomputeAssetAmount(assetId: string) {
    const sum = assetTransactions.value
      .filter((t) => t.asset_id === assetId)
      .reduce((s, t) => s + Number(t.amount), 0)
    await patchAssetRecord(assetId, { amount: sum })
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

  async function deleteGoal() {
    if (!goal.value) return
    const { error } = await supabase
      .from('savings_goals')
      .delete()
      .eq('id', goal.value.id)
    if (error) {
      errorMessage.value = error.message
      return
    }
    goal.value = null
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

  // スケジュール支払いの追加
  async function addScheduledPayment(input: {
    name: string
    amount: number
    due_date: string
    recurring: boolean
    recurring_end_date: string | null
  }) {
    const auth = useAuthStore()
    if (!auth.user) return null
    const { data, error } = await supabase
      .from('scheduled_payments')
      .insert({
        user_id: auth.user.id,
        name: input.name,
        amount: input.amount,
        due_date: input.due_date,
        recurring: input.recurring,
        recurring_end_date: input.recurring_end_date,
      })
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return null
    }
    scheduledPayments.value = [...scheduledPayments.value, data as ScheduledPayment]
    return data as ScheduledPayment
  }

  async function updateScheduledPayment(
    id: string,
    patch: Partial<Pick<ScheduledPayment, 'name' | 'amount' | 'due_date' | 'recurring' | 'recurring_end_date'>>,
  ) {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (patch.name !== undefined) payload.name = patch.name
    if (patch.amount !== undefined) payload.amount = patch.amount
    if (patch.due_date !== undefined) payload.due_date = patch.due_date
    if (patch.recurring !== undefined) payload.recurring = patch.recurring
    if (patch.recurring_end_date !== undefined) payload.recurring_end_date = patch.recurring_end_date

    const { data, error } = await supabase
      .from('scheduled_payments')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return
    }
    scheduledPayments.value = scheduledPayments.value.map((p) =>
      p.id === id ? (data as ScheduledPayment) : p,
    )
  }

  async function removeScheduledPayment(id: string) {
    const { error } = await supabase.from('scheduled_payments').delete().eq('id', id)
    if (error) {
      errorMessage.value = error.message
      return
    }
    scheduledPayments.value = scheduledPayments.value.filter((p) => p.id !== id)
    // 関連する完了記録もフロント側でクリア（DB側は CASCADE 済み）
    scheduledCompletions.value = scheduledCompletions.value.filter((c) => c.payment_id !== id)
  }

  // 貯金の記録
  async function addSavingsDeposit(input: {
    goal_id: string
    amount: number
    deposited_on?: string
    period_start?: string
    note?: string
  }) {
    const auth = useAuthStore()
    if (!auth.user) return null
    const deposited_on = input.deposited_on ?? formatDate(new Date())
    const period_start = input.period_start ?? periodStartStr.value

    const { data, error } = await supabase
      .from('savings_deposits')
      .insert({
        user_id: auth.user.id,
        goal_id: input.goal_id,
        amount: input.amount,
        deposited_on,
        period_start,
        note: input.note ?? '',
      })
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return null
    }
    savingsDeposits.value = [data as SavingsDeposit, ...savingsDeposits.value]
    return data as SavingsDeposit
  }

  async function updateSavingsDeposit(
    id: string,
    patch: Partial<Pick<SavingsDeposit, 'amount' | 'deposited_on' | 'note'>>,
  ) {
    const payload: Record<string, unknown> = {}
    if (patch.amount !== undefined) payload.amount = patch.amount
    if (patch.deposited_on !== undefined) payload.deposited_on = patch.deposited_on
    if (patch.note !== undefined) payload.note = patch.note
    const { data, error } = await supabase
      .from('savings_deposits')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return
    }
    savingsDeposits.value = savingsDeposits.value.map((d) =>
      d.id === id ? (data as SavingsDeposit) : d,
    )
  }

  async function removeSavingsDeposit(id: string) {
    const { error } = await supabase.from('savings_deposits').delete().eq('id', id)
    if (error) {
      errorMessage.value = error.message
      return
    }
    savingsDeposits.value = savingsDeposits.value.filter((d) => d.id !== id)
  }

  // 「支払い完了」を記録
  async function completeScheduledPayment(payment_id: string, due_date: string) {
    const auth = useAuthStore()
    if (!auth.user) return
    const { data, error } = await supabase
      .from('scheduled_payment_completions')
      .insert({
        user_id: auth.user.id,
        payment_id,
        due_date,
      })
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return
    }
    scheduledCompletions.value = [
      data as ScheduledPaymentCompletion,
      ...scheduledCompletions.value,
    ]
  }

  // 「完了」を取り消し
  async function uncompleteScheduledPayment(completionId: string) {
    const { error } = await supabase
      .from('scheduled_payment_completions')
      .delete()
      .eq('id', completionId)
    if (error) {
      errorMessage.value = error.message
      return
    }
    scheduledCompletions.value = scheduledCompletions.value.filter(
      (c) => c.id !== completionId,
    )
  }

  async function addEntry(input: {
    name: string
    amount: number
    kind: EntryKind
    spent_on?: string
  }) {
    const auth = useAuthStore()
    if (!auth.user) return null
    const spent_on = input.spent_on ?? formatDate(new Date())
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: auth.user.id,
        name: input.name,
        amount: input.amount,
        kind: input.kind,
        spent_on,
      })
      .select()
      .single()
    if (error) {
      errorMessage.value = error.message
      return null
    }
    const entry = data as Expense
    expenses.value = [entry, ...expenses.value]
    return entry
  }

  // 収入を家計簿に記録し、同時に総資産の項目にも履歴として反映
  async function addIncomeToAsset(input: {
    name: string
    amount: number
    spent_on?: string
  }) {
    const trimmed = input.name.trim()
    if (!trimmed || input.amount <= 0) return
    const occurred_on = input.spent_on ?? formatDate(new Date())

    // まず家計簿へ記録（IDを取り出して履歴に紐付ける）
    const entry = await addEntry({
      kind: 'income',
      name: trimmed,
      amount: Number(input.amount),
      spent_on: occurred_on,
    })

    const existing = assets.value.find((a) => a.name === trimmed)
    if (existing) {
      await addAssetTransaction({
        asset_id: existing.id,
        amount: Number(input.amount),
        occurred_on,
        source: 'ledger',
        note: '',
        ledger_entry_id: entry?.id ?? null,
      })
    } else {
      await addAsset({
        name: trimmed,
        amount: Number(input.amount),
        source: 'ledger',
        occurred_on,
        ledger_entry_id: entry?.id ?? null,
      })
    }
  }

  async function removeEntry(id: string) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) {
      errorMessage.value = error.message
      return
    }
    // 紐付いた資産履歴を洗い出して合計を再計算
    const linkedTx = assetTransactions.value.filter((t) => t.ledger_entry_id === id)
    expenses.value = expenses.value.filter((e) => e.id !== id)
    assetTransactions.value = assetTransactions.value.filter((t) => t.ledger_entry_id !== id)
    const affectedAssetIds = new Set(linkedTx.map((t) => t.asset_id))
    for (const assetId of affectedAssetIds) {
      await recomputeAssetAmount(assetId)
    }
  }

  function reset() {
    profile.value = null
    goal.value = null
    bills.value = []
    expenses.value = []
    assets.value = []
    assetTransactions.value = []
    scheduledPayments.value = []
    scheduledCompletions.value = []
    savingsDeposits.value = []
    errorMessage.value = null
  }

  return {
    profile,
    goal,
    bills,
    expenses,
    assets,
    scheduledPayments,
    scheduledCompletions,
    savingsDeposits,
    loading,
    errorMessage,
    totalAssets,
    monthCloseDay,
    expectedMonthlyIncome,
    totalMonthlyBills,
    goalTargetAmount,
    periodStart,
    periodEnd,
    daysLeftInPeriod,
    monthsToGoal,
    monthlySavingContribution,
    totalSavedForGoal,
    remainingToSave,
    goalProgress,
    isGoalAchieved,
    savingsForCurrentPeriod,
    hasDepositedThisPeriod,
    totalSavedThisPeriod,
    shouldRemindDeposit,
    totalSpentThisPeriod,
    totalSpentBeforeToday,
    totalIncomeThisPeriod,
    spentToday,
    spendableThisPeriod,
    spendableAtStartOfToday,
    isOverBudget,
    dailySpendable,
    weeklySpendable,
    monthlySpendable,
    todayRemaining,
    entriesByDay,
    entriesOnDate,
    assetTransactions,
    transactionsForAsset,
    scheduledPaymentsInPeriod,
    totalScheduledInPeriod,
    paymentsToday,
    paymentsTodayTotal,
    overduePayments,
    upcomingPayments,
    paymentsNeedingAttention,
    remainingOccurrencesForPayment,
    forecastForPeriod,
    nextMonthDailyBudget,
    fetchAll,
    saveMonthCloseDay,
    saveExpectedMonthlyIncome,
    saveGoal,
    deleteGoal,
    addAsset,
    renameAsset,
    setAssetTotal,
    removeAsset,
    addAssetTransaction,
    updateAssetTransaction,
    removeAssetTransaction,
    addBill,
    removeBill,
    addScheduledPayment,
    updateScheduledPayment,
    removeScheduledPayment,
    completeScheduledPayment,
    uncompleteScheduledPayment,
    addSavingsDeposit,
    updateSavingsDeposit,
    removeSavingsDeposit,
    addEntry,
    addIncomeToAsset,
    removeEntry,
    reset,
  }
})
