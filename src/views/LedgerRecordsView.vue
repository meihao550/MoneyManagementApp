<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'
import type { ScheduledPaymentOccurrence } from '@/lib/types'

const finance = useFinanceStore()

// ---- 期間ナビ ----
const periodOffset = ref(0)

// ---- グラフタイプ切り替え ----
const dailyChartType = ref<'bar' | 'line'>('bar')
const assetChartType = ref<'donut' | 'bar'>('donut')

onMounted(() => {
  finance.fetchAll()
})

function safeDay(y: number, m: number, day: number): Date {
  const last = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(day, last))
}

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const shiftedRange = computed(() => {
  const closeDay = finance.monthCloseDay
  const start = new Date(finance.periodStart)
  const shiftedStart = safeDay(
    start.getFullYear(),
    start.getMonth() + periodOffset.value,
    closeDay,
  )
  const nextStart = safeDay(
    shiftedStart.getFullYear(),
    shiftedStart.getMonth() + 1,
    closeDay,
  )
  const shiftedEnd = new Date(nextStart)
  shiftedEnd.setDate(shiftedEnd.getDate() - 1)
  return { start: shiftedStart, end: shiftedEnd }
})

const rangeStartStr = computed(() => fmtDate(shiftedRange.value.start))
const rangeEndStr = computed(() => fmtDate(shiftedRange.value.end))

const rangeLabel = computed(() => {
  const fmt = (d: Date) =>
    d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  return `${fmt(shiftedRange.value.start)} 〜 ${fmt(shiftedRange.value.end)}`
})

// ---- 期間内のスケジュール支払い ----
const scheduledInShiftedRange = computed<ScheduledPaymentOccurrence[]>(() => {
  const from = shiftedRange.value.start
  const to = shiftedRange.value.end
  const items: ScheduledPaymentOccurrence[] = []
  for (const p of finance.scheduledPayments) {
    const fromStr = fmtDate(from)
    const toStr = fmtDate(to)
    const firstStr = p.due_date
    const endStr = p.recurring_end_date ?? '9999-12-31'
    const collect = (dateStr: string) => {
      const completion = finance.scheduledCompletions.find(
        (c) => c.payment_id === p.id && c.due_date === dateStr,
      )
      items.push({
        payment: p,
        date: dateStr,
        completed: !!completion,
        completionId: completion?.id ?? null,
      })
    }
    if (!p.recurring) {
      if (firstStr >= fromStr && firstStr <= toStr) collect(firstStr)
      continue
    }
    const parts = firstStr.split('-').map(Number)
    let year = parts[0]!
    let month = parts[1]! - 1
    const dayOfMonth = parts[2]!
    while (true) {
      const occ = safeDay(year, month, dayOfMonth)
      const occStr = fmtDate(occ)
      if (occStr > toStr) break
      if (occStr >= firstStr && occStr <= endStr && occStr >= fromStr) collect(occStr)
      month++
      if (month > 11) { month = 0; year++ }
      if (year - parts[0]! > 100) break
    }
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : 1))
})

// ---- 期間内の家計簿エントリ ----
const entriesInPeriod = computed(() =>
  finance.entriesByDay.filter(
    (d) => d.date >= rangeStartStr.value && d.date <= rangeEndStr.value,
  ),
)

// ---- 集計 ----
const totalExpenseFromEntries = computed(() =>
  entriesInPeriod.value.reduce((sum, d) => sum + d.expense, 0),
)
const totalScheduledExpense = computed(() =>
  scheduledInShiftedRange.value.reduce((sum, s) => sum + Number(s.payment.amount), 0),
)
const totalExpense = computed(() => totalExpenseFromEntries.value + totalScheduledExpense.value)
const totalIncome = computed(() => entriesInPeriod.value.reduce((sum, d) => sum + d.income, 0))
const net = computed(() => totalExpense.value - totalIncome.value)

// ---- 日別集計 ----
type DayBar = { date: string; label: string; weekday: number; expense: number; income: number }
const daysList = computed<DayBar[]>(() => {
  const start = shiftedRange.value.start
  const end = shiftedRange.value.end
  const list: DayBar[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const dateStr = fmtDate(cursor)
    const entryDay = entriesInPeriod.value.find((d) => d.date === dateStr)
    const sched = scheduledInShiftedRange.value
      .filter((s) => s.date === dateStr)
      .reduce((sum, s) => sum + Number(s.payment.amount), 0)
    list.push({
      date: dateStr,
      label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      weekday: cursor.getDay(),
      expense: (entryDay?.expense ?? 0) + sched,
      income: entryDay?.income ?? 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return list
})

const periodDays = computed(() => daysList.value.length)
const spendingDays = computed(() => daysList.value.filter((d) => d.expense > 0).length)
const noSpendDays = computed(() => periodDays.value - spendingDays.value)

const avgPerDay = computed(() =>
  periodDays.value > 0 ? Math.round(totalExpense.value / periodDays.value) : 0,
)
const avgOnSpendingDays = computed(() =>
  spendingDays.value > 0 ? Math.round(totalExpense.value / spendingDays.value) : 0,
)

const peakDay = computed(() => {
  let max = 0
  let peakStr = ''
  for (const d of daysList.value) {
    if (d.expense > max) {
      max = d.expense
      peakStr = d.date
    }
  }
  return { date: peakStr, amount: max }
})

// ---- 予算 ----
const currentBudget = computed(() => {
  if (periodOffset.value !== 0) return null
  return (
    finance.totalAssets -
    finance.monthlySavingContribution -
    finance.totalMonthlyBills -
    finance.totalScheduledUnpaidInPeriod
  )
})

const budgetUsageRate = computed(() => {
  const budget = currentBudget.value
  if (budget === null || budget <= 0) return null
  return Math.min(Math.round((totalExpense.value / budget) * 100), 999)
})

// ---- 前期との比較 ----
function totalsForRange(fromStr: string, toStr: string) {
  const prevEntries = finance.entriesByDay.filter(
    (d) => d.date >= fromStr && d.date <= toStr,
  )
  const prevExpFromEntries = prevEntries.reduce((sum, d) => sum + d.expense, 0)
  const income = prevEntries.reduce((sum, d) => sum + d.income, 0)

  let prevScheduled = 0
  for (const p of finance.scheduledPayments) {
    const firstStr = p.due_date
    const endStr = p.recurring_end_date ?? '9999-12-31'
    if (!p.recurring) {
      if (firstStr >= fromStr && firstStr <= toStr) prevScheduled += Number(p.amount)
      continue
    }
    const parts = firstStr.split('-').map(Number)
    let y = parts[0]!
    let m = parts[1]! - 1
    const dayOfMonth = parts[2]!
    while (true) {
      const occ = safeDay(y, m, dayOfMonth)
      const occStr = fmtDate(occ)
      if (occStr > toStr) break
      if (occStr >= firstStr && occStr <= endStr && occStr >= fromStr) {
        prevScheduled += Number(p.amount)
      }
      m++
      if (m > 11) { m = 0; y++ }
      if (y - parts[0]! > 100) break
    }
  }
  return { expense: prevExpFromEntries + prevScheduled, income }
}

const previousPeriodTotals = computed(() => {
  const current = shiftedRange.value.start
  const prevStart = safeDay(current.getFullYear(), current.getMonth() - 1, finance.monthCloseDay)
  const prevEnd = new Date(current)
  prevEnd.setDate(prevEnd.getDate() - 1)
  return totalsForRange(fmtDate(prevStart), fmtDate(prevEnd))
})

const expenseDelta = computed(() => totalExpense.value - previousPeriodTotals.value.expense)
const expenseDeltaPct = computed(() => {
  const prev = previousPeriodTotals.value.expense
  if (prev <= 0) return null
  return Math.round((expenseDelta.value / prev) * 100)
})

// ---- 今週 vs 先週 ----
const weeklyComparison = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const last7Start = new Date(today)
  last7Start.setDate(last7Start.getDate() - 6)
  const prev7End = new Date(last7Start)
  prev7End.setDate(prev7End.getDate() - 1)
  const prev7Start = new Date(prev7End)
  prev7Start.setDate(prev7Start.getDate() - 6)

  const thisWeek = totalsForRange(fmtDate(last7Start), fmtDate(today))
  const lastWeek = totalsForRange(fmtDate(prev7Start), fmtDate(prev7End))

  const delta = thisWeek.expense - lastWeek.expense
  const pct = lastWeek.expense > 0 ? Math.round((delta / lastWeek.expense) * 100) : null

  return {
    thisWeekExpense: thisWeek.expense,
    lastWeekExpense: lastWeek.expense,
    delta,
    pct,
    label: `${fmtDate(last7Start)} 〜 ${fmtDate(today)}`,
  }
})

// ---- 曜日別分析 ----
const weekdayNames = ['日', '月', '火', '水', '木', '金', '土']
type WeekdayStat = { weekday: number; label: string; total: number; count: number; avg: number }
const weekdayStats = computed<WeekdayStat[]>(() => {
  const stats: WeekdayStat[] = weekdayNames.map((label, i) => ({
    weekday: i, label, total: 0, count: 0, avg: 0,
  }))
  for (const d of daysList.value) {
    if (d.expense > 0) {
      stats[d.weekday]!.total += d.expense
      stats[d.weekday]!.count++
    }
  }
  for (const s of stats) {
    s.avg = s.count > 0 ? Math.round(s.total / s.count) : 0
  }
  return stats
})

const peakWeekday = computed(() => {
  let max = 0
  let peak: WeekdayStat | null = null
  for (const s of weekdayStats.value) {
    if (s.avg > max) { max = s.avg; peak = s }
  }
  return peak
})

// ---- ペース予測 ----
const paceProjection = computed(() => {
  if (periodOffset.value !== 0) return null
  const budget = currentBudget.value
  if (budget === null) return null

  const today = fmtDate(new Date())
  const daysPassed = daysList.value.filter((d) => d.date <= today).length
  if (daysPassed === 0) return null

  const spentSoFar = daysList.value
    .filter((d) => d.date <= today)
    .reduce((sum, d) => sum + d.expense, 0)

  const paceDaily = spentSoFar / daysPassed
  const projected = Math.round(paceDaily * periodDays.value)
  const diff = projected - budget

  return {
    daysPassed,
    paceDaily: Math.round(paceDaily),
    projected,
    diff,
    over: diff > 0,
    safeDaily: (() => {
      const remaining = periodDays.value - daysPassed
      if (remaining <= 0) return null
      const remainingBudget = budget - spentSoFar
      return remainingBudget > 0 ? Math.floor(remainingBudget / remaining) : 0
    })(),
  }
})

// ---- 少額 vs 大額の分布 ----
const expenseDistribution = computed(() => {
  const buckets = [
    { label: '¥0-1,000', min: 0, max: 1000, count: 0, total: 0 },
    { label: '¥1,000-3,000', min: 1000, max: 3000, count: 0, total: 0 },
    { label: '¥3,000-10,000', min: 3000, max: 10000, count: 0, total: 0 },
    { label: '¥10,000+', min: 10000, max: Infinity, count: 0, total: 0 },
  ]
  for (const d of entriesInPeriod.value) {
    for (const item of d.items) {
      if (item.kind !== 'expense') continue
      const amount = Number(item.amount)
      const bucket = buckets.find((b) => amount >= b.min && amount < b.max)
      if (bucket) {
        bucket.count++
        bucket.total += amount
      }
    }
  }
  const totalCount = buckets.reduce((s, b) => s + b.count, 0)
  return buckets.map((b) => ({
    ...b,
    pct: totalCount > 0 ? Math.round((b.count / totalCount) * 100) : 0,
  }))
})

// ---- 診断コメント（人間らしい提案） ----
type Advice = {
  level: 'good' | 'warn' | 'alert'
  title: string
  detail: string
}
const advice = computed<Advice[]>(() => {
  const list: Advice[] = []

  // ペース警告
  if (paceProjection.value) {
    const p = paceProjection.value
    if (p.over) {
      list.push({
        level: 'alert',
        title: `このペースだと期末に ${formatYen(p.diff)} オーバーします`,
        detail: `残りの日は 1日 ${formatYen(p.safeDaily ?? 0)} 以内に抑えると予算内に収まります。`,
      })
    } else {
      const surplus = Math.abs(p.diff)
      list.push({
        level: 'good',
        title: `このペースなら予算内、約 ${formatYen(surplus)} 余ります`,
        detail: `今のリズムを保てば OK です。余った分は貯金や次月への繰り越しに使えます。`,
      })
    }
  }

  // 前期比較
  if (expenseDeltaPct.value !== null) {
    const pct = expenseDeltaPct.value
    if (pct >= 20) {
      list.push({
        level: 'warn',
        title: `前期より支出が ${pct}% 増えています`,
        detail: `${formatYen(previousPeriodTotals.value.expense)} → ${formatYen(totalExpense.value)}。何が増えたか一覧を振り返ってみましょう。`,
      })
    } else if (pct <= -10) {
      list.push({
        level: 'good',
        title: `前期より支出が ${Math.abs(pct)}% 減りました`,
        detail: `節約成功。この調子で貯金目標にも近づけます。`,
      })
    }
  }

  // 今週 vs 先週
  const wc = weeklyComparison.value
  if (wc.pct !== null) {
    if (wc.pct >= 30) {
      list.push({
        level: 'warn',
        title: `今週は先週より ${wc.pct}% 多く使っています`,
        detail: `${formatYen(wc.lastWeekExpense)} → ${formatYen(wc.thisWeekExpense)}。特別な出費があった週かも。`,
      })
    } else if (wc.pct <= -30) {
      list.push({
        level: 'good',
        title: `今週は先週より ${Math.abs(wc.pct)}% 節約できています`,
        detail: `いいペースです。この週の使い方を続けられるか考えてみましょう。`,
      })
    }
  }

  // 曜日パターン
  const pw = peakWeekday.value
  if (pw && pw.count >= 2 && pw.avg > avgOnSpendingDays.value * 1.3) {
    list.push({
      level: 'warn',
      title: `${pw.label}曜日はよく使う日です（平均 ${formatYen(pw.avg)}）`,
      detail: `他の曜日と比べて明らかに多め。${pw.label}曜日に予定を組む時は予算を意識してみてください。`,
    })
  }

  // 節約日が多い
  if (spendingDays.value > 0 && noSpendDays.value >= spendingDays.value) {
    list.push({
      level: 'good',
      title: `節約した日が ${noSpendDays.value} 日あります`,
      detail: `期間の半分以上「¥0の日」を作れています。よく我慢できています。`,
    })
  }

  // 小額支出の割合
  const dist = expenseDistribution.value
  const smallBucket = dist[0]!
  const totalCount = dist.reduce((s, b) => s + b.count, 0)
  if (totalCount >= 5 && smallBucket.pct >= 50) {
    list.push({
      level: 'warn',
      title: `少額支出が全体の ${smallBucket.pct}% を占めています`,
      detail: `¥1,000未満の細かい出費が積み重なっています。「なんとなく買い」を減らすと効きます。`,
    })
  }

  // アドバイス0件の時
  if (list.length === 0) {
    list.push({
      level: 'good',
      title: 'いい感じで進んでいます',
      detail: 'このまま続けましょう。分析するのに十分なデータがまだ少ないかもしれません。',
    })
  }

  return list
})

// ---- 健全性スコア（0-100） ----
const healthScore = computed(() => {
  let score = 100
  // 予算超過
  const usage = budgetUsageRate.value
  if (usage !== null) {
    if (usage >= 100) score -= 30
    else if (usage >= 80) score -= 15
  }
  // ペース超過予測
  if (paceProjection.value?.over) score -= 20
  // 前期比較
  const pct = expenseDeltaPct.value
  if (pct !== null && pct >= 20) score -= 15
  // 節約日ボーナス
  if (noSpendDays.value >= spendingDays.value) score += 5
  return Math.max(0, Math.min(100, score))
})

const healthLabel = computed(() => {
  const s = healthScore.value
  if (s >= 85) return { text: '好調', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' }
  if (s >= 65) return { text: '順調', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' }
  if (s >= 40) return { text: '注意', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' }
  return { text: '警戒', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' }
})

// ---- 資産別支出 ----
type AssetSpend = { name: string; amount: number; color: string }
const colors = [
  '#4f46e5', '#059669', '#dc2626', '#d97706',
  '#7c3aed', '#0891b2', '#65a30d', '#db2777',
  '#0284c7', '#ea580c', '#6d28d9', '#0d9488',
]

const spendByAsset = computed<AssetSpend[]>(() => {
  const start = rangeStartStr.value
  const end = rangeEndStr.value
  const map = new Map<string, number>()
  for (const tx of finance.assetTransactions) {
    if (tx.occurred_on < start || tx.occurred_on > end) continue
    if (Number(tx.amount) >= 0) continue
    const asset = finance.assets.find((a) => a.id === tx.asset_id)
    const name = asset?.name ?? '削除された資産'
    map.set(name, (map.get(name) ?? 0) + Math.abs(Number(tx.amount)))
  }
  return Array.from(map.entries())
    .map(([name, amount], idx) => ({
      name, amount, color: colors[idx % colors.length]!,
    }))
    .sort((a, b) => b.amount - a.amount)
})

const spendByAssetTotal = computed(() =>
  spendByAsset.value.reduce((sum, a) => sum + a.amount, 0),
)

const maxAssetAmount = computed(() =>
  Math.max(...spendByAsset.value.map((a) => a.amount), 1),
)

// SVG 円グラフのセグメント計算
type DonutSeg = { color: string; name: string; amount: number; pct: number; pathD: string }
const donutSegments = computed<DonutSeg[]>(() => {
  const total = spendByAssetTotal.value
  if (total <= 0) return []
  const segs: DonutSeg[] = []
  let cumAngle = -Math.PI / 2
  const cx = 60, cy = 60, r = 50, ir = 30
  for (const a of spendByAsset.value) {
    const pct = a.amount / total
    const angle = pct * Math.PI * 2
    const endAngle = cumAngle + angle
    const largeArc = angle > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(cumAngle)
    const y1 = cy + r * Math.sin(cumAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const x3 = cx + ir * Math.cos(endAngle)
    const y3 = cy + ir * Math.sin(endAngle)
    const x4 = cx + ir * Math.cos(cumAngle)
    const y4 = cy + ir * Math.sin(cumAngle)
    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${ir} ${ir} 0 ${largeArc} 0 ${x4} ${y4}`,
      'Z',
    ].join(' ')
    segs.push({ color: a.color, name: a.name, amount: a.amount, pct, pathD: d })
    cumAngle = endAngle
  }
  return segs
})

// ---- 棒グラフ ----
const maxDayExpense = computed(() =>
  Math.max(...daysList.value.map((d) => d.expense), 1),
)

// ---- 折れ線グラフ（累積） ----
type LinePoint = { x: number; y: number; label: string; cumulative: number }
const cumulativeLine = computed<LinePoint[]>(() => {
  const total = totalExpense.value
  let cum = 0
  const width = 300
  const height = 120
  const n = daysList.value.length
  if (n === 0 || total === 0) return []
  const points: LinePoint[] = daysList.value.map((d, i) => {
    cum += d.expense
    return {
      x: (i / Math.max(n - 1, 1)) * width,
      y: height - (cum / total) * height,
      label: d.label,
      cumulative: cum,
    }
  })
  return points
})

const linePathD = computed(() => {
  const pts = cumulativeLine.value
  if (pts.length === 0) return ''
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
})

// ---- 記録一覧 ----
type DayEntry = {
  kind: 'income' | 'expense' | 'scheduled'
  id: string
  name: string
  amount: number
  completed?: boolean
  completionId?: string | null
  paymentId?: string
  dueDate?: string
}
type DayRow = { date: string; income: number; expense: number; entries: DayEntry[] }

const daysWithEntries = computed<DayRow[]>(() => {
  const map = new Map<string, DayRow>()
  const ensure = (date: string): DayRow => {
    let row = map.get(date)
    if (!row) {
      row = { date, income: 0, expense: 0, entries: [] }
      map.set(date, row)
    }
    return row
  }
  for (const d of entriesInPeriod.value) {
    const row = ensure(d.date)
    row.income += d.income
    row.expense += d.expense
    for (const item of d.items) {
      row.entries.push({
        kind: item.kind === 'income' ? 'income' : 'expense',
        id: item.id,
        name: item.name,
        amount: Number(item.amount),
      })
    }
  }
  for (const s of scheduledInShiftedRange.value) {
    const row = ensure(s.date)
    row.expense += Number(s.payment.amount)
    row.entries.push({
      kind: 'scheduled',
      id: `sched:${s.payment.id}:${s.date}`,
      name: s.payment.name,
      amount: Number(s.payment.amount),
      completed: s.completed,
      completionId: s.completionId,
      paymentId: s.payment.id,
      dueDate: s.date,
    })
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1))
})

async function removeEntry(id: string) {
  if (!confirm('この項目を削除しますか？')) return
  await finance.removeEntry(id)
}

async function togglePaymentCompletion(paymentId: string, dueDate: string, completionId: string | null) {
  if (completionId) {
    await finance.uncompleteScheduledPayment(completionId)
  } else {
    await finance.completeScheduledPayment(paymentId, dueDate)
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-slate-800">家計簿記録</h1>
      <p class="text-slate-500 mt-1">
        期間ごとの記録・グラフ・使い方の分析を確認できます
      </p>
    </div>

    <div
      v-if="finance.errorMessage"
      class="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm"
    >{{ finance.errorMessage }}</div>

    <!-- ===== 期間ナビ + サマリー ===== -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <button
            @click="periodOffset--"
            class="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
          >←</button>
          <div class="text-center min-w-[220px]">
            <p class="text-xs text-slate-400">
              {{ periodOffset === 0 ? '現在の期間' : periodOffset < 0 ? `${Math.abs(periodOffset)}か月前` : `${periodOffset}か月後` }}
            </p>
            <p class="text-sm font-semibold text-slate-800">{{ rangeLabel }}</p>
          </div>
          <button
            @click="periodOffset++"
            class="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
          >→</button>
        </div>
        <button
          v-if="periodOffset !== 0"
          @click="periodOffset = 0"
          class="text-xs text-indigo-600 hover:underline"
        >今の期間に戻る</button>
      </div>

      <div class="grid grid-cols-3 gap-3 text-sm">
        <div class="rounded-lg bg-emerald-50 p-3">
          <p class="text-xs text-emerald-700">収入</p>
          <p class="mt-1 text-lg font-bold text-emerald-700">{{ formatYen(totalIncome) }}</p>
        </div>
        <div class="rounded-lg bg-rose-50 p-3">
          <p class="text-xs text-rose-700">支出（支払い含む）</p>
          <p class="mt-1 text-lg font-bold text-rose-700">{{ formatYen(totalExpense) }}</p>
        </div>
        <div class="rounded-lg bg-slate-100 p-3">
          <p class="text-xs text-slate-600">差引</p>
          <p class="mt-1 text-lg font-bold" :class="net >= 0 ? 'text-rose-700' : 'text-emerald-700'">
            {{ formatYen(net) }}
          </p>
        </div>
      </div>
    </section>

    <!-- ===== 健全性スコア + アドバイス ===== -->
    <section
      class="rounded-2xl border-2 p-6"
      :class="healthLabel.bg"
    >
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-bold" :class="healthLabel.color">お金の健康診断</h2>
          <p class="text-xs text-slate-600 mt-1">現状のデータから状態を判定しています</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">スコア</p>
          <p class="text-3xl font-bold" :class="healthLabel.color">
            {{ healthScore }}<span class="text-base">/100</span>
          </p>
          <p class="text-xs font-semibold" :class="healthLabel.color">{{ healthLabel.text }}</p>
        </div>
      </div>

      <div class="space-y-2">
        <div
          v-for="(a, i) in advice"
          :key="i"
          class="rounded-lg p-3 bg-white/70 border"
          :class="a.level === 'alert' ? 'border-rose-200' : a.level === 'warn' ? 'border-amber-200' : 'border-emerald-200'"
        >
          <div class="flex items-start gap-2">
            <span
              class="text-lg leading-none mt-0.5"
              :class="a.level === 'alert' ? 'text-rose-600' : a.level === 'warn' ? 'text-amber-600' : 'text-emerald-600'"
            >{{ a.level === 'alert' ? '⚠️' : a.level === 'warn' ? '💡' : '✅' }}</span>
            <div class="flex-1">
              <p class="text-sm font-semibold text-slate-800">{{ a.title }}</p>
              <p class="text-xs text-slate-600 mt-1">{{ a.detail }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 統計指標 ===== -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-3">使い方の分析</h2>
      <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p class="text-xs text-slate-500">1日あたりの平均</p>
          <p class="mt-1 text-lg font-bold text-slate-800">{{ formatYen(avgPerDay) }}</p>
          <p class="text-xs text-slate-400 mt-1">期間の全日数で平均化</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p class="text-xs text-slate-500">使った日の平均</p>
          <p class="mt-1 text-lg font-bold text-slate-800">{{ formatYen(avgOnSpendingDays) }}</p>
          <p class="text-xs text-slate-400 mt-1">
            {{ spendingDays }} 日 / {{ periodDays }} 日
          </p>
        </div>
        <div class="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <p class="text-xs text-emerald-700">節約した日</p>
          <p class="mt-1 text-lg font-bold text-emerald-700">{{ noSpendDays }} 日</p>
          <p class="text-xs text-emerald-600 mt-1">支出¥0の日</p>
        </div>
        <div class="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p class="text-xs text-amber-700">最も使った日</p>
          <p v-if="peakDay.amount > 0" class="mt-1 text-lg font-bold text-amber-700">
            {{ formatYen(peakDay.amount) }}
          </p>
          <p v-else class="mt-1 text-lg font-bold text-slate-400">ー</p>
          <p v-if="peakDay.date" class="text-xs text-amber-600 mt-1">{{ peakDay.date }}</p>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-2 mt-3">
        <div
          v-if="budgetUsageRate !== null"
          class="rounded-lg bg-indigo-50 border border-indigo-200 p-4"
        >
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs text-indigo-700">予算消化率（今期）</p>
            <p
              class="text-lg font-bold"
              :class="budgetUsageRate >= 100 ? 'text-rose-700' : budgetUsageRate >= 80 ? 'text-amber-700' : 'text-indigo-700'"
            >{{ budgetUsageRate }}%</p>
          </div>
          <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              class="h-full transition-all"
              :class="budgetUsageRate >= 100 ? 'bg-rose-500' : budgetUsageRate >= 80 ? 'bg-amber-500' : 'bg-indigo-500'"
              :style="{ width: Math.min(budgetUsageRate, 100) + '%' }"
            />
          </div>
        </div>

        <div class="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <p class="text-xs text-slate-500 mb-2">前期との比較</p>
          <div class="flex items-baseline gap-2">
            <p
              class="text-lg font-bold"
              :class="expenseDelta > 0 ? 'text-rose-700' : expenseDelta < 0 ? 'text-emerald-700' : 'text-slate-600'"
            >
              {{ expenseDelta > 0 ? '+' : '' }}{{ formatYen(expenseDelta) }}
            </p>
            <span
              v-if="expenseDeltaPct !== null"
              class="text-xs font-semibold"
              :class="expenseDelta > 0 ? 'text-rose-600' : 'text-emerald-600'"
            >
              ({{ expenseDeltaPct > 0 ? '+' : '' }}{{ expenseDeltaPct }}%)
            </span>
          </div>
          <p class="text-xs text-slate-400 mt-1">
            前期支出: {{ formatYen(previousPeriodTotals.expense) }}
          </p>
        </div>
      </div>
    </section>

    <!-- ===== ペース予測 ===== -->
    <section
      v-if="paceProjection"
      class="rounded-2xl bg-white border border-slate-200 p-6"
    >
      <h2 class="font-semibold text-slate-800 mb-3">現在ペースからの期末予測</h2>
      <div class="grid gap-3 md:grid-cols-3">
        <div class="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <p class="text-xs text-slate-500">現在ペース</p>
          <p class="mt-1 text-xl font-bold text-slate-800">
            {{ formatYen(paceProjection.paceDaily) }}
            <span class="text-xs font-normal text-slate-500">/ 日</span>
          </p>
          <p class="text-xs text-slate-400 mt-1">{{ paceProjection.daysPassed }} 日間の平均</p>
        </div>
        <div
          class="rounded-lg border p-4"
          :class="paceProjection.over ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'"
        >
          <p class="text-xs" :class="paceProjection.over ? 'text-rose-700' : 'text-emerald-700'">
            期末の予測支出
          </p>
          <p
            class="mt-1 text-xl font-bold"
            :class="paceProjection.over ? 'text-rose-700' : 'text-emerald-700'"
          >{{ formatYen(paceProjection.projected) }}</p>
          <p
            class="text-xs mt-1"
            :class="paceProjection.over ? 'text-rose-600' : 'text-emerald-600'"
          >
            予算との差: {{ paceProjection.diff > 0 ? '+' : '' }}{{ formatYen(paceProjection.diff) }}
          </p>
        </div>
        <div
          v-if="paceProjection.safeDaily !== null"
          class="rounded-lg bg-indigo-50 border border-indigo-200 p-4"
        >
          <p class="text-xs text-indigo-700">残り期間の目安</p>
          <p class="mt-1 text-xl font-bold text-indigo-700">
            {{ formatYen(paceProjection.safeDaily) }}
            <span class="text-xs font-normal text-indigo-600">/ 日</span>
          </p>
          <p class="text-xs text-indigo-600 mt-1">この額以内なら予算内</p>
        </div>
      </div>
    </section>

    <!-- ===== 今週 vs 先週 ===== -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-3">今週 vs 先週</h2>
      <div class="grid gap-3 md:grid-cols-2">
        <div class="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <p class="text-xs text-slate-500">先週の支出</p>
          <p class="mt-1 text-xl font-bold text-slate-800">
            {{ formatYen(weeklyComparison.lastWeekExpense) }}
          </p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <p class="text-xs text-slate-500">今週の支出（直近7日）</p>
          <p class="mt-1 text-xl font-bold text-slate-800">
            {{ formatYen(weeklyComparison.thisWeekExpense) }}
          </p>
          <p
            v-if="weeklyComparison.pct !== null"
            class="text-xs font-semibold mt-1"
            :class="weeklyComparison.delta > 0 ? 'text-rose-600' : weeklyComparison.delta < 0 ? 'text-emerald-600' : 'text-slate-500'"
          >
            {{ weeklyComparison.delta > 0 ? '+' : '' }}{{ formatYen(weeklyComparison.delta) }}
            ({{ weeklyComparison.pct > 0 ? '+' : '' }}{{ weeklyComparison.pct }}%)
          </p>
        </div>
      </div>
    </section>

    <!-- ===== 曜日別分析 ===== -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-3">曜日別の使い方</h2>
      <p class="text-xs text-slate-500 mb-4">
        期間中の「使った日」の平均支出額を曜日ごとに比較（¥0 の日は除外）
      </p>
      <div class="grid grid-cols-7 gap-2">
        <div
          v-for="s in weekdayStats"
          :key="s.weekday"
          class="text-center"
        >
          <p class="text-xs text-slate-500 mb-2">{{ s.label }}</p>
          <div class="h-24 flex items-end justify-center mb-2">
            <div
              class="w-full rounded-t transition-all"
              :class="[
                s.weekday === 0 ? 'bg-rose-200' : s.weekday === 6 ? 'bg-indigo-200' : 'bg-slate-200',
                peakWeekday && s.weekday === peakWeekday.weekday ? '!bg-amber-400' : ''
              ]"
              :style="{ height: (s.avg / Math.max(...weekdayStats.map(w => w.avg), 1) * 100) + '%' }"
            />
          </div>
          <p class="text-xs font-semibold text-slate-700">
            {{ s.avg > 0 ? formatYen(s.avg) : 'ー' }}
          </p>
          <p class="text-[10px] text-slate-400">{{ s.count }}日</p>
        </div>
      </div>
    </section>

    <!-- ===== 支出の大きさ分布 ===== -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-3">支出の大きさの内訳</h2>
      <p class="text-xs text-slate-500 mb-4">
        1回あたりの支出額でグループ化。少額が多いか、大額が多いかで使い方の癖が見えます
      </p>
      <ul class="space-y-2">
        <li v-for="b in expenseDistribution" :key="b.label">
          <div class="flex items-center justify-between text-sm mb-1">
            <span class="text-slate-700">{{ b.label }}</span>
            <span class="text-slate-500">{{ b.count }}回 · {{ formatYen(b.total) }} ({{ b.pct }}%)</span>
          </div>
          <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              class="h-full bg-indigo-500 transition-all"
              :style="{ width: b.pct + '%' }"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- ===== 日別グラフ ===== -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-slate-800">日別の支出</h2>
        <div class="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            @click="dailyChartType = 'bar'"
            class="px-3 h-8 rounded-md text-xs font-medium"
            :class="dailyChartType === 'bar' ? 'bg-white shadow text-slate-800' : 'text-slate-600'"
          >棒グラフ</button>
          <button
            @click="dailyChartType = 'line'"
            class="px-3 h-8 rounded-md text-xs font-medium"
            :class="dailyChartType === 'line' ? 'bg-white shadow text-slate-800' : 'text-slate-600'"
          >累積折れ線</button>
        </div>
      </div>

      <!-- 棒グラフ -->
      <div v-if="dailyChartType === 'bar'" class="overflow-x-auto">
        <div class="flex items-end gap-1 h-40" :style="{ minWidth: (daysList.length * 20) + 'px' }">
          <div
            v-for="d in daysList"
            :key="d.date"
            class="flex-1 flex flex-col items-center justify-end gap-1 min-w-[16px] group relative"
          >
            <div
              class="w-full rounded-t transition-all"
              :class="d.expense === 0 ? 'bg-slate-100' : 'bg-rose-500'"
              :style="{ height: (d.expense / maxDayExpense * 100) + '%' }"
            />
            <div class="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
              {{ d.label }}: {{ formatYen(d.expense) }}
            </div>
          </div>
        </div>
        <div class="flex gap-1 mt-1" :style="{ minWidth: (daysList.length * 20) + 'px' }">
          <div
            v-for="(d, i) in daysList"
            :key="d.date"
            class="flex-1 text-center text-[10px] text-slate-400 min-w-[16px]"
          >
            <span v-if="i % Math.ceil(daysList.length / 10) === 0">{{ d.label }}</span>
          </div>
        </div>
      </div>

      <!-- 折れ線グラフ（累積） -->
      <div v-else>
        <p class="text-xs text-slate-500 mb-2">
          その日までに使った合計金額の推移。理想は右上がりが緩やか（一定ペースで使う）
        </p>
        <svg viewBox="0 0 300 130" class="w-full">
          <!-- 予算ライン（100%） -->
          <line
            v-if="currentBudget && currentBudget > 0"
            x1="0"
            y1="0"
            x2="300"
            y2="120"
            stroke="#94a3b8"
            stroke-width="0.5"
            stroke-dasharray="2,2"
          />
          <path
            v-if="linePathD"
            :d="linePathD"
            fill="none"
            stroke="#4f46e5"
            stroke-width="2"
          />
          <circle
            v-for="(pt, i) in cumulativeLine"
            :key="i"
            :cx="pt.x"
            :cy="pt.y"
            r="2"
            fill="#4f46e5"
          />
          <text x="0" y="128" class="fill-slate-400 text-[8px]">
            {{ daysList[0]?.label ?? '' }}
          </text>
          <text x="270" y="128" class="fill-slate-400 text-[8px]">
            {{ daysList[daysList.length - 1]?.label ?? '' }}
          </text>
        </svg>
        <p v-if="cumulativeLine.length === 0" class="text-sm text-slate-500 text-center py-4">
          支出データが不足しています
        </p>
      </div>
    </section>

    <!-- ===== 資産別グラフ ===== -->
    <section
      v-if="spendByAsset.length > 0"
      class="rounded-2xl bg-white border border-slate-200 p-6"
    >
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-slate-800">どこから使った？</h2>
        <div class="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            @click="assetChartType = 'donut'"
            class="px-3 h-8 rounded-md text-xs font-medium"
            :class="assetChartType === 'donut' ? 'bg-white shadow text-slate-800' : 'text-slate-600'"
          >円グラフ</button>
          <button
            @click="assetChartType = 'bar'"
            class="px-3 h-8 rounded-md text-xs font-medium"
            :class="assetChartType === 'bar' ? 'bg-white shadow text-slate-800' : 'text-slate-600'"
          >横棒グラフ</button>
        </div>
      </div>

      <!-- 円グラフ -->
      <div v-if="assetChartType === 'donut'" class="grid gap-6 md:grid-cols-[120px_1fr] items-center">
        <svg viewBox="0 0 120 120" class="w-full max-w-[120px] mx-auto">
          <path
            v-for="seg in donutSegments"
            :key="seg.name"
            :d="seg.pathD"
            :fill="seg.color"
            stroke="#fff"
            stroke-width="0.5"
          />
          <text x="60" y="58" text-anchor="middle" class="text-[8px] fill-slate-500">合計</text>
          <text x="60" y="70" text-anchor="middle" class="text-[9px] fill-slate-800 font-bold">
            {{ formatYen(spendByAssetTotal) }}
          </text>
        </svg>
        <ul class="space-y-2 text-sm">
          <li
            v-for="seg in donutSegments"
            :key="seg.name"
            class="flex items-center justify-between gap-2"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="inline-block w-3 h-3 rounded-sm shrink-0"
                :style="{ backgroundColor: seg.color }"
              />
              <span class="text-slate-700 truncate">{{ seg.name }}</span>
            </div>
            <div class="text-right shrink-0">
              <span class="font-medium text-slate-800">{{ formatYen(seg.amount) }}</span>
              <span class="text-xs text-slate-500 ml-1">({{ Math.round(seg.pct * 100) }}%)</span>
            </div>
          </li>
        </ul>
      </div>

      <!-- 横棒グラフ -->
      <div v-else class="space-y-3">
        <div v-for="a in spendByAsset" :key="a.name">
          <div class="flex items-center justify-between text-sm mb-1">
            <span class="text-slate-700">{{ a.name }}</span>
            <span class="text-slate-500">
              {{ formatYen(a.amount) }}
              ({{ Math.round(a.amount / spendByAssetTotal * 100) }}%)
            </span>
          </div>
          <div class="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              class="h-full transition-all"
              :style="{ width: (a.amount / maxAssetAmount * 100) + '%', backgroundColor: a.color }"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 記録一覧 ===== -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-4">この期間の記録</h2>

      <div v-if="daysWithEntries.length" class="space-y-5">
        <div
          v-for="day in daysWithEntries"
          :key="day.date"
          class="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-slate-700">{{ day.date }}</span>
            <div class="flex gap-3 text-xs">
              <span v-if="day.income > 0" class="text-emerald-600">+{{ formatYen(day.income) }}</span>
              <span v-if="day.expense > 0" class="text-rose-600">−{{ formatYen(day.expense) }}</span>
            </div>
          </div>
          <ul class="divide-y divide-slate-50 text-sm">
            <li
              v-for="item in day.entries"
              :key="item.id"
              class="flex items-center justify-between py-1.5"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="inline-block w-1.5 h-1.5 rounded-full"
                  :class="item.kind === 'income' ? 'bg-emerald-500' : item.kind === 'scheduled' ? 'bg-amber-500' : 'bg-rose-500'"
                />
                <span
                  class="text-slate-700"
                  :class="item.kind === 'scheduled' && item.completed ? 'line-through text-slate-400' : ''"
                >{{ item.name }}</span>
                <span
                  v-if="item.kind === 'scheduled'"
                  class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"
                >支払い予定</span>
              </div>
              <div class="flex items-center gap-3">
                <span :class="item.kind === 'income' ? 'text-emerald-700 font-medium' : 'text-slate-700'">
                  {{ item.kind === 'income' ? '+' : '−' }} {{ formatYen(item.amount) }}
                </span>
                <button
                  v-if="item.kind === 'scheduled'"
                  @click="togglePaymentCompletion(item.paymentId!, item.dueDate!, item.completionId ?? null)"
                  class="text-xs font-medium"
                  :class="item.completed ? 'text-slate-500 hover:underline' : 'text-emerald-600 hover:underline'"
                >{{ item.completed ? '取消' : '完了' }}</button>
                <button
                  v-else
                  @click="removeEntry(item.id)"
                  class="text-xs text-slate-400 hover:text-rose-600"
                >削除</button>
              </div>
            </li>
          </ul>
        </div>
      </div>
      <p v-else class="text-sm text-slate-500">この期間には記録がありません。</p>
    </section>
  </div>
</template>
