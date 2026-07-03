<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'
import type { EntryKind } from '@/lib/types'

const finance = useFinanceStore()

const kind = ref<EntryKind>('expense')
const entryName = ref('')
const entryAmount = ref<number | null>(null)
const entryDate = ref<string>(new Date().toISOString().slice(0, 10))
const submitting = ref(false)

// 資産の紐付け
// 収入: 空文字 = 新しい項目を作成、それ以外 = 既存資産ID
// 支出: 空文字 = 紐付けない、それ以外 = 既存資産ID
const assetSelection = ref<string>('')

// kind が切り替わったら選択をリセット
watch(kind, () => {
  assetSelection.value = ''
})

// 資産が選ばれたら項目名を資産名で自動補完（収入・支出とも）
watch(assetSelection, (val) => {
  if (!val) return
  const asset = finance.assets.find((a) => a.id === val)
  if (asset) entryName.value = asset.name
})

// 期間オフセット（0: 現在期間、-1: 1つ前、+1: 次）
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
  const fmt = (d: Date) =>
    d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  return `${fmt(shiftedRange.value.start)} 〜 ${fmt(shiftedRange.value.end)}`
})

// 期間内エントリー、日付ごとにまとめる
const daysInPeriod = computed(() =>
  finance.entriesByDay.filter(
    (d) => d.date >= rangeStartStr.value && d.date <= rangeEndStr.value,
  ),
)

const totalExpense = computed(() =>
  daysInPeriod.value.reduce((sum, d) => sum + d.expense, 0),
)
const totalIncome = computed(() =>
  daysInPeriod.value.reduce((sum, d) => sum + d.income, 0),
)
const net = computed(() => totalExpense.value - totalIncome.value)

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
      // 既存資産に加算
      await finance.addAssetTransaction({
        asset_id: assetSelection.value,
        amount,
        occurred_on: entryDate.value,
        source: 'ledger',
        ledger_entry_id: entry?.id ?? null,
      })
    } else {
      // 新しい資産として作成
      await finance.addAsset({
        name: entryName.value.trim(),
        amount,
        source: 'ledger',
        occurred_on: entryDate.value,
        ledger_entry_id: entry?.id ?? null,
      })
    }
  } else {
    // 支出
    const entry = await finance.addEntry({
      kind: 'expense',
      name: entryName.value.trim(),
      amount,
      spent_on: entryDate.value,
    })
    if (assetSelection.value) {
      // 選ばれた資産からマイナス
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
  entryDate.value = new Date().toISOString().slice(0, 10)
  assetSelection.value = ''
  submitting.value = false
}

async function removeEntry(id: string) {
  if (!confirm('この項目を削除しますか？')) return
  await finance.removeEntry(id)
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-slate-800">家計簿</h1>
      <p class="text-slate-500 mt-1">
        収入と支出を日付ごとに記録して、期間ごとに振り返れます
      </p>
    </div>

    <div
      v-if="finance.errorMessage"
      class="mb-6 rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm"
    >{{ finance.errorMessage }}</div>

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
        <!-- 資産の紐付け -->
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
            <option
              v-for="asset in finance.assets"
              :key="asset.id"
              :value="asset.id"
            >
              {{ asset.name }}（{{ formatYen(Number(asset.amount)) }}）
            </option>
          </select>
          <p
            v-if="kind === 'income' && !assetSelection"
            class="mt-1 text-xs text-indigo-600"
          >
            入力した項目名で新しい資産項目が作られます
          </p>
          <p
            v-else-if="kind === 'expense' && assetSelection"
            class="mt-1 text-xs text-rose-600"
          >
            この金額を選択した資産からマイナスします
          </p>
        </div>

        <div class="grid gap-3 md:grid-cols-[1fr_160px_160px_auto]">
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
          <input
            v-model="entryDate"
            type="date"
            class="h-11 rounded-md border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            :disabled="submitting"
            class="h-11 rounded-md text-white px-4 text-sm font-medium disabled:opacity-60"
            :class="kind === 'expense' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'"
          >{{ submitting ? '登録中…' : '追加' }}</button>
        </div>
      </form>
    </section>

    <!-- 期間切り替え -->
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
          <p class="mt-1 text-lg font-bold text-emerald-700">
            {{ formatYen(totalIncome) }}
          </p>
        </div>
        <div class="rounded-lg bg-rose-50 p-3">
          <p class="text-xs text-rose-700">支出</p>
          <p class="mt-1 text-lg font-bold text-rose-700">
            {{ formatYen(totalExpense) }}
          </p>
        </div>
        <div class="rounded-lg bg-slate-100 p-3">
          <p class="text-xs text-slate-600">差引</p>
          <p
            class="mt-1 text-lg font-bold"
            :class="net >= 0 ? 'text-rose-700' : 'text-emerald-700'"
          >
            {{ formatYen(net) }}
          </p>
        </div>
      </div>
    </section>

    <!-- 日ごとの一覧 -->
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
              <span v-if="day.income > 0" class="text-emerald-600">
                +{{ formatYen(day.income) }}
              </span>
              <span v-if="day.expense > 0" class="text-rose-600">
                −{{ formatYen(day.expense) }}
              </span>
            </div>
          </div>
          <ul class="divide-y divide-slate-50 text-sm">
            <li
              v-for="item in day.items"
              :key="item.id"
              class="flex items-center justify-between py-1.5"
            >
              <div class="flex items-center gap-2">
                <span
                  class="inline-block w-1.5 h-1.5 rounded-full"
                  :class="item.kind === 'income' ? 'bg-emerald-500' : 'bg-rose-500'"
                />
                <span class="text-slate-700">{{ item.name }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span
                  :class="item.kind === 'income' ? 'text-emerald-700 font-medium' : 'text-slate-700'"
                >
                  {{ item.kind === 'income' ? '+' : '−' }} {{ formatYen(Number(item.amount)) }}
                </span>
                <button
                  @click="removeEntry(item.id)"
                  class="text-xs text-slate-400 hover:text-rose-600"
                >削除</button>
              </div>
            </li>
          </ul>
        </div>
      </div>
      <p v-else class="text-sm text-slate-500">
        この期間には記録がありません。
      </p>
    </section>
  </div>
</template>
