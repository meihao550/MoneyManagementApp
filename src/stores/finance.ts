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
  SavingsGoal,
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

  // 月あたりの貯金額（目標金額 ÷ 締め日回数）
  const monthlySavingContribution = computed(() => {
    if (!goal.value || monthsToGoal.value <= 0) return 0
    return Math.ceil(goalTargetAmount.value / monthsToGoal.value)
  })

  // 現在期間の日付範囲
  const periodStartStr = computed(() => formatDate(periodStart.value))
  const periodEndStr = computed(() => formatDate(periodEnd.value))

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

  // 今の期間で使える予算
  // 収入は「現在の総資産」に反映されるので二重計上を避ける
  // = 総資産 − 今月分の貯金 − 今月の固定費 − 期間の支出
  const spendableThisPeriod = computed(() =>
    totalAssets.value
      - monthlySavingContribution.value
      - totalMonthlyBills.value
      - totalSpentThisPeriod.value,
  )

  const isOverBudget = computed(() => spendableThisPeriod.value < 0)

  const dailySpendable = computed(() =>
    daysLeftInPeriod.value > 0
      ? Math.floor(spendableThisPeriod.value / daysLeftInPeriod.value)
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

      const [goalRes, billsRes, expensesRes, assetsRes, assetTxRes] = await Promise.all([
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
      ])

      if (goalRes.error) throw goalRes.error
      if (billsRes.error) throw billsRes.error
      if (expensesRes.error) throw expensesRes.error
      if (assetsRes.error) throw assetsRes.error
      if (assetTxRes.error) throw assetTxRes.error

      goal.value = goalRes.data as SavingsGoal | null
      bills.value = (billsRes.data ?? []) as MonthlyBill[]
      expenses.value = (expensesRes.data ?? []) as Expense[]
      assets.value = (assetsRes.data ?? []) as Asset[]
      assetTransactions.value = (assetTxRes.data ?? []) as AssetTransaction[]
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
    const occurred_on = input.occurred_on ?? new Date().toISOString().slice(0, 10)

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
      occurred_on: occurred_on ?? new Date().toISOString().slice(0, 10),
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
    const occurred_on = input.spent_on ?? new Date().toISOString().slice(0, 10)

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
    errorMessage.value = null
  }

  return {
    profile,
    goal,
    bills,
    expenses,
    assets,
    loading,
    errorMessage,
    totalAssets,
    monthCloseDay,
    totalMonthlyBills,
    goalTargetAmount,
    periodStart,
    periodEnd,
    daysLeftInPeriod,
    monthsToGoal,
    monthlySavingContribution,
    totalSpentThisPeriod,
    totalIncomeThisPeriod,
    spentToday,
    spendableThisPeriod,
    isOverBudget,
    dailySpendable,
    weeklySpendable,
    monthlySpendable,
    todayRemaining,
    entriesByDay,
    entriesOnDate,
    assetTransactions,
    transactionsForAsset,
    fetchAll,
    saveMonthCloseDay,
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
    addEntry,
    addIncomeToAsset,
    removeEntry,
    reset,
  }
})
