<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'
import DateInputModal from '@/components/DateInputModal.vue'
import type { EntryKind, ScheduledPayment, ScheduledPaymentOccurrence } from '@/lib/types'

const finance = useFinanceStore()

// タブ切り替え
const activeTab = ref<'record' | 'payment'>('record')

// ---- 支出・収入入力用 ----
const kind = ref<EntryKind>('expense')
function todayLocalStr(): string {
  const t = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

const entryName = ref('')
const entryAmount = ref<number | null>(null)
const entryDate = ref<string>(todayLocalStr())
const submitting = ref(false)
const assetSelection = ref<string>('')

watch(kind, () => { assetSelection.value = '' })
watch(assetSelection, (val) => {
  if (!val) return
  const asset = finance.assets.find((a) => a.id === val)
  if (asset) entryName.value = asset.name
})

// ---- 支払い登録用 ----
const paymentName = ref('')
const paymentAmount = ref<number | null>(null)
const paymentDate = ref<string>(todayLocalStr())
const paymentRecurring = ref(false)
const paymentEndDate = ref<string>('')
const savingPayment = ref(false)

// ---- 期間ナビ ----
const periodOffset = ref(0)

onMounted(() => {
  finance.fetchAll()
})

function safeDay(y: number, m: number, day: number): Date {
  const last = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(day, last))
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

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const rangeStartStr = computed(() => fmtDate(shiftedRange.value.start))
const rangeEndStr = computed(() => fmtDate(shiftedRange.value.end))

const rangeLabel = computed(() => {
  const fmt = (d: Date) => d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  return `${fmt(shiftedRange.value.start)} 〜 ${fmt(shiftedRange.value.end)}`
})

// 期間内のスケジュール支払いオカレンス
const scheduledInShiftedRange = computed<ScheduledPaymentOccurrence[]>(() => {
  const from = shiftedRange.value.start
  const to = shiftedRange.value.end
  const items: ScheduledPaymentOccurrence[] = []
  for (const p of finance.scheduledPayments) {
    // ストアの occurrencesForPayment は非公開だが、同ロジックをここで再実装
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

// 家計簿エントリー（支出・収入）を期間で絞る
const entriesInPeriod = computed(() =>
  finance.entriesByDay.filter(
    (d) => d.date >= rangeStartStr.value && d.date <= rangeEndStr.value,
  ),
)

// 期間内の集計（支出 = 記録された支出 + 期間内のスケジュール支払い）
const totalExpense = computed(() => {
  const fromEntries = entriesInPeriod.value.reduce((sum, d) => sum + d.expense, 0)
  const fromScheduled = scheduledInShiftedRange.value.reduce(
    (sum, s) => sum + Number(s.payment.amount),
    0,
  )
  return fromEntries + fromScheduled
})
const totalIncome = computed(() => entriesInPeriod.value.reduce((sum, d) => sum + d.income, 0))
const net = computed(() => totalExpense.value - totalIncome.value)

// 日ごとのバーチャル統合ビュー: 家計簿+スケジュール支払い
type DayRow = {
  date: string
  income: number
  expense: number
  entries: {
    kind: 'income' | 'expense' | 'scheduled'
    id: string        // 一意ID（エントリー or "sched:{payment_id}:{date}"）
    name: string
    amount: number
    completed?: boolean
    completionId?: string | null
    paymentId?: string
    dueDate?: string
  }[]
}

const daysInPeriod = computed<DayRow[]>(() => {
  const map = new Map<string, DayRow>()
  const ensure = (date: string): DayRow => {
    let row = map.get(date)
    if (!row) {
      row = { date, income: 0, expense: 0, entries: [] }
      map.set(date, row)
    }
    return row
  }
  // 家計簿エントリー
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
  // スケジュール支払い
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

async function submitEntry() {
  if (!entryName.value.trim() || !entryAmount.value || entryAmount.value < 0) return
  const amount = Number(entryAmount.value)
  submitting.value = true

  if (kind.value === 'income') {
    const entry = await finance.addEntry({
      kind: 'income',
      name: entryName.value.trim(),
      amount,
      spent_on: entryDate.value,
    })
    if (assetSelection.value) {
      await finance.addAssetTransaction({
        asset_id: assetSelection.value,
        amount,
        occurred_on: entryDate.value,
        source: 'ledger',
        ledger_entry_id: entry?.id ?? null,
      })
    } else {
      await finance.addAsset({
        name: entryName.value.trim(),
        amount,
        source: 'ledger',
        occurred_on: entryDate.value,
        ledger_entry_id: entry?.id ?? null,
      })
    }
  } else {
    const entry = await finance.addEntry({
      kind: 'expense',
      name: entryName.value.trim(),
      amount,
      spent_on: entryDate.value,
    })
    if (assetSelection.value) {
      await finance.addAssetTransaction({
        asset_id: assetSelection.value,
        amount: -Math.abs(amount),
        occurred_on: entryDate.value,
        source: 'ledger',
        ledger_entry_id: entry?.id ?? null,
      })
    }
  }

  entryName.value = ''
  entryAmount.value = null
  entryDate.value = todayLocalStr()
  assetSelection.value = ''
  submitting.value = false
}

async function removeEntry(id: string) {
  if (!confirm('この項目を削除しますか？')) return
  await finance.removeEntry(id)
}

// ---- 支払い登録 ----
// 追加確認モーダル
const confirmOpen = ref(false)
const confirmPreview = ref<{
  currentDaily: number
  nextDailyBefore: number
  nextDailyAfter: number
  affectsCurrent: boolean
  affectsNext: boolean
} | null>(null)

async function submitScheduledPayment() {
  if (!paymentName.value.trim() || !paymentAmount.value || paymentAmount.value <= 0) return
  if (!paymentDate.value) return

  // 影響予測を計算
  const tentative = {
    id: 'tentative',
    user_id: '',
    name: paymentName.value.trim(),
    amount: Number(paymentAmount.value),
    due_date: paymentDate.value,
    recurring: paymentRecurring.value,
    recurring_end_date: paymentRecurring.value && paymentEndDate.value ? paymentEndDate.value : null,
    created_at: '',
    updated_at: '',
  }

  const currentDaily = finance.dailySpendable
  const nextBefore = finance.forecastForPeriod(1).daily
  const nextAfter = finance.forecastForPeriod(1, tentative).daily
  const affectsCurrent = currentDaily !== finance.forecastForPeriod(0, tentative).daily
  const affectsNext = nextBefore !== nextAfter

  confirmPreview.value = {
    currentDaily,
    nextDailyBefore: nextBefore,
    nextDailyAfter: nextAfter,
    affectsCurrent,
    affectsNext,
  }
  confirmOpen.value = true
}

async function confirmAddPayment() {
  savingPayment.value = true
  await finance.addScheduledPayment({
    name: paymentName.value.trim(),
    amount: Number(paymentAmount.value),
    due_date: paymentDate.value,
    recurring: paymentRecurring.value,
    recurring_end_date: paymentRecurring.value && paymentEndDate.value ? paymentEndDate.value : null,
  })
  paymentName.value = ''
  paymentAmount.value = null
  paymentDate.value = todayLocalStr()
  paymentRecurring.value = false
  paymentEndDate.value = ''
  savingPayment.value = false
  confirmOpen.value = false
  confirmPreview.value = null
}

function cancelAddPayment() {
  confirmOpen.value = false
  confirmPreview.value = null
}

async function deleteScheduledPayment(id: string) {
  if (!confirm('この支払い登録を削除しますか？（完了記録も一緒に削除されます）')) return
  await finance.removeScheduledPayment(id)
}

async function togglePaymentCompletion(paymentId: string, dueDate: string, completionId: string | null) {
  if (completionId) {
    await finance.uncompleteScheduledPayment(completionId)
  } else {
    await finance.completeScheduledPayment(paymentId, dueDate)
  }
}

function paymentSummary(p: ScheduledPayment): string {
  if (!p.recurring) return `${p.due_date} 単発 ${formatYen(Number(p.amount))}`
  const remain = finance.remainingOccurrencesForPayment(p)
  const day = Number(p.due_date.split('-')[2])
  const endPart = p.recurring_end_date ? `〜 ${p.recurring_end_date}` : '無期限'
  return `毎月 ${day} 日 (${endPart}) ${formatYen(Number(p.amount))} · あと ${remain} 回`
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-slate-800">家計簿</h1>
      <p class="text-slate-500 mt-1">収入・支出とスケジュール支払いをまとめて記録・振り返り</p>
    </div>

    <div
      v-if="finance.errorMessage"
      class="mb-6 rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm"
    >{{ finance.errorMessage }}</div>

    <!-- タブ -->
    <div class="mb-6 flex gap-1 rounded-lg bg-slate-100 p-1">
      <button
        type="button"
        @click="activeTab = 'record'"
        class="flex-1 h-10 rounded-md text-sm font-medium"
        :class="activeTab === 'record'
          ? 'bg-white shadow text-slate-800'
          : 'text-slate-600 hover:text-slate-800'"
      >支出・収入</button>
      <button
        type="button"
        @click="activeTab = 'payment'"
        class="flex-1 h-10 rounded-md text-sm font-medium"
        :class="activeTab === 'payment'
          ? 'bg-white shadow text-slate-800'
          : 'text-slate-600 hover:text-slate-800'"
      >支払い予定</button>
    </div>

    <!-- ===== 支出・収入タブ ===== -->
    <div v-show="activeTab === 'record'">
      <!-- 入力フォーム -->
      <section class="rounded-2xl bg-white border border-slate-200 p-6 mb-8">
        <h2 class="font-semibold text-slate-800 mb-4">記録を追加</h2>

        <div class="flex gap-2 mb-4">
          <button
            type="button"
            @click="kind = 'expense'"
            class="px-4 py-1.5 rounded-full text-sm font-medium border"
            :class="kind === 'expense'
              ? 'bg-rose-500 border-rose-500 text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
          >支出</button>
          <button
            type="button"
            @click="kind = 'income'"
            class="px-4 py-1.5 rounded-full text-sm font-medium border"
            :class="kind === 'income'
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'"
          >収入</button>
        </div>

        <form @submit.prevent="submitEntry" class="space-y-3">
          <div>
            <label class="block text-xs text-slate-500 mb-1">
              {{ kind === 'income' ? '入金先の資産' : '支払い元の資産（任意）' }}
            </label>
            <select
              v-model="assetSelection"
              class="w-full h-11 rounded-md border border-slate-300 px-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option v-if="kind === 'income'" value="">＋ 新しい資産項目を作成</option>
              <option v-else value="">紐付けない（履歴のみ）</option>
              <option v-for="asset in finance.assets" :key="asset.id" :value="asset.id">
                {{ asset.name }}（{{ formatYen(Number(asset.amount)) }}）
              </option>
            </select>
            <p
              v-if="kind === 'income' && !assetSelection"
              class="mt-1 text-xs text-indigo-600"
            >入力した項目名で新しい資産項目が作られます</p>
            <p
              v-else-if="kind === 'expense' && assetSelection"
              class="mt-1 text-xs text-rose-600"
            >この金額を選択した資産からマイナスします</p>
          </div>

          <div class="grid gap-3 md:grid-cols-[1fr_160px_180px_auto]">
            <input
              v-model="entryName"
              type="text"
              :placeholder="kind === 'expense' ? 'ランチ・コンビニ など' : '銀行預金・給料 など'"
              class="w-full h-11 rounded-md border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
              <input
                v-model.number="entryAmount"
                type="number"
                min="0"
                step="1"
                placeholder="1200"
                class="w-full h-11 rounded-md border border-slate-300 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <DateInputModal v-model="entryDate" placeholder="日付を選択" />
            <button
              type="submit"
              :disabled="submitting"
              class="h-11 rounded-md text-white px-4 text-sm font-medium disabled:opacity-60"
              :class="kind === 'expense' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'"
            >{{ submitting ? '登録中…' : '追加' }}</button>
          </div>
        </form>
      </section>
    </div>

    <!-- ===== 支払い予定タブ ===== -->
    <div v-show="activeTab === 'payment'">
      <section class="rounded-2xl bg-white border border-slate-200 p-6 mb-8">
        <h2 class="font-semibold text-slate-800 mb-1">スケジュール支払い</h2>
        <p class="text-xs text-slate-500 mb-4">
          クレジットカードや電気代など、決まった日に払うものを登録します。分割払いなら「毎月繰り返す」にチェックして最後の支払日を入れてください。<br />
          現在期間内の支払いは、日/週/月の予算計算に自動で含まれます。
        </p>

        <ul v-if="finance.scheduledPayments.length" class="divide-y divide-slate-100 text-sm mb-4">
          <li
            v-for="p in finance.scheduledPayments"
            :key="p.id"
            class="py-3 flex items-start justify-between gap-3"
          >
            <div class="flex-1 min-w-0">
              <p class="text-slate-800 font-medium">{{ p.name }}</p>
              <p class="text-xs text-slate-500 mt-0.5">{{ paymentSummary(p) }}</p>
            </div>
            <button
              @click="deleteScheduledPayment(p.id)"
              class="text-xs text-rose-600 hover:underline shrink-0"
            >削除</button>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-500 mb-4">まだ登録がありません</p>

        <form @submit.prevent="submitScheduledPayment" class="space-y-3">
          <div class="grid gap-3 md:grid-cols-[1fr_160px_1fr]">
            <div>
              <label class="block text-xs text-slate-500 mb-1">支払いの内容</label>
              <input
                v-model="paymentName"
                type="text"
                placeholder="クレジットカード・電気代 など"
                class="w-full h-11 rounded-md border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">金額</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
                <input
                  v-model.number="paymentAmount"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="30000"
                  class="w-full h-11 rounded-md border border-slate-300 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">支払日</label>
              <DateInputModal v-model="paymentDate" placeholder="日付を選択" />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input
              id="recurring-checkbox"
              v-model="paymentRecurring"
              type="checkbox"
              class="w-4 h-4 rounded border-slate-300"
            />
            <label for="recurring-checkbox" class="text-sm text-slate-700">
              毎月繰り返す（分割払い・サブスクなど）
            </label>
          </div>

          <div v-if="paymentRecurring" class="pl-6">
            <label class="block text-xs text-slate-500 mb-1">
              繰り返しの終了日（空欄で無期限）
            </label>
            <DateInputModal v-model="paymentEndDate" placeholder="日付を選択（空欄=無期限）" clearable />
            <p class="text-xs text-slate-400 mt-1">
              例: 24回の分割払いなら「最後の支払日」を入れてください
            </p>
          </div>

          <button
            type="submit"
            :disabled="savingPayment"
            class="h-11 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-6 text-sm font-medium"
          >{{ savingPayment ? '登録中…' : '追加' }}</button>
        </form>
      </section>
    </div>

    <!-- ===== 期間ナビ ===== -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <button
            @click="periodOffset--"
            class="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="前の期間"
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
            aria-label="次の期間"
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

    <!-- ===== 日ごとの一覧 ===== -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-4">この期間の記録</h2>

      <div v-if="daysInPeriod.length" class="space-y-5">
        <div
          v-for="day in daysInPeriod"
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
                <span
                  :class="item.kind === 'income' ? 'text-emerald-700 font-medium' : 'text-slate-700'"
                >
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

    <!-- 支払い登録の確認モーダル -->
    <Teleport to="body">
      <div
        v-if="confirmOpen && confirmPreview"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40"
        @click.self="cancelAddPayment"
      >
        <div class="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
          <div class="p-5 border-b border-slate-200">
            <h2 class="text-lg font-bold text-slate-800">追加前の確認</h2>
            <p class="text-xs text-slate-500 mt-1">
              この支払いを登録すると、予算にこう影響します
            </p>
          </div>
          <div class="p-5 space-y-4">
            <div class="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
              <p class="font-semibold text-slate-800">{{ paymentName }}</p>
              <p class="text-slate-500 text-xs">
                {{ formatYen(Number(paymentAmount)) }}
                <template v-if="paymentRecurring">
                  · 毎月 {{ paymentDate ? new Date(paymentDate).getDate() : '' }} 日
                  <template v-if="paymentEndDate">〜 {{ paymentEndDate }}</template>
                </template>
                <template v-else>
                  · {{ paymentDate }}
                </template>
              </p>
            </div>

            <div
              v-if="confirmPreview.affectsCurrent"
              class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
            >
              <p class="text-xs text-amber-800 mb-1">今期の 1日予算</p>
              <p class="text-slate-700">
                {{ formatYen(confirmPreview.currentDaily) }} →
                <span class="font-bold">
                  {{ formatYen(finance.forecastForPeriod(0, {
                    id: 'tentative', user_id: '', name: paymentName.trim(),
                    amount: Number(paymentAmount), due_date: paymentDate,
                    recurring: paymentRecurring,
                    recurring_end_date: paymentRecurring && paymentEndDate ? paymentEndDate : null,
                    created_at: '', updated_at: ''
                  }).daily) }}
                </span>
              </p>
            </div>

            <div
              v-if="confirmPreview.affectsNext"
              class="rounded-lg border p-3 text-sm"
              :class="confirmPreview.nextDailyAfter < confirmPreview.nextDailyBefore * 0.7
                ? 'border-rose-200 bg-rose-50'
                : 'border-amber-200 bg-amber-50'"
            >
              <p class="text-xs mb-1"
                :class="confirmPreview.nextDailyAfter < confirmPreview.nextDailyBefore * 0.7
                  ? 'text-rose-800' : 'text-amber-800'"
              >来月の 1日予算</p>
              <p class="text-slate-700">
                {{ formatYen(confirmPreview.nextDailyBefore) }} →
                <span class="font-bold">{{ formatYen(confirmPreview.nextDailyAfter) }}</span>
              </p>
              <p
                v-if="confirmPreview.nextDailyAfter < confirmPreview.nextDailyBefore * 0.7"
                class="text-xs text-rose-700 mt-1"
              >⚠️ 30%以上ダウン。来月の生活が厳しくなる可能性があります</p>
            </div>

            <div
              v-if="!confirmPreview.affectsCurrent && !confirmPreview.affectsNext"
              class="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800"
            >
              今期・来期の予算には影響しません（もっと先の期間のみ）
            </div>
          </div>
          <div class="p-4 border-t border-slate-200 flex gap-2">
            <button
              @click="cancelAddPayment"
              class="flex-1 h-11 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
            >キャンセル</button>
            <button
              @click="confirmAddPayment"
              :disabled="savingPayment"
              class="flex-1 h-11 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium"
            >{{ savingPayment ? '登録中…' : 'この内容で登録' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
