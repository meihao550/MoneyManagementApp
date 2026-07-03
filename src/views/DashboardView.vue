<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'
import AssetsBreakdownModal from '@/components/AssetsBreakdownModal.vue'

const finance = useFinanceStore()

const assetName = ref('')
const assetAmount = ref<number | null>(null)
const assetDate = ref<string>(new Date().toISOString().slice(0, 10))
const addingAsset = ref(false)

const breakdownOpen = ref(false)

const periodLabel = computed(() => {
  const fmt = (d: Date) => d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
  return `${fmt(finance.periodStart)} 〜 ${fmt(finance.periodEnd)}`
})

// 日付スライダー
const selectedDate = ref(new Date().toISOString().slice(0, 10))

function shiftDate(days: number) {
  const d = new Date(selectedDate.value)
  d.setDate(d.getDate() + days)
  selectedDate.value = d.toISOString().slice(0, 10)
}

const selectedDateLabel = computed(() =>
  new Date(selectedDate.value).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }),
)

const entriesOnSelectedDate = computed(() =>
  finance.entriesOnDate(selectedDate.value),
)

const selectedDateExpense = computed(() =>
  entriesOnSelectedDate.value
    .filter((e) => e.kind === 'expense')
    .reduce((sum, e) => sum + Number(e.amount), 0),
)

const selectedDateIncome = computed(() =>
  entriesOnSelectedDate.value
    .filter((e) => e.kind === 'income')
    .reduce((sum, e) => sum + Number(e.amount), 0),
)

onMounted(() => {
  finance.fetchAll()
})

async function submitAsset() {
  if (!assetName.value.trim() || assetAmount.value === null || assetAmount.value < 0) return
  addingAsset.value = true
  await finance.addAsset({
    name: assetName.value.trim(),
    amount: Number(assetAmount.value),
    source: 'dashboard',
    occurred_on: assetDate.value,
  })
  assetName.value = ''
  assetAmount.value = null
  assetDate.value = new Date().toISOString().slice(0, 10)
  addingAsset.value = false
}

async function handleAssetNameChange(id: string, event: Event) {
  const target = event.target as HTMLInputElement
  const value = target.value.trim()
  if (!value) return
  await finance.renameAsset(id, value)
}

async function handleAssetAmountChange(id: string, event: Event) {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  if (!Number.isFinite(value) || value < 0) return
  await finance.setAssetTotal(id, value)
}

async function deleteAsset(id: string) {
  if (!confirm('この資産を削除しますか？')) return
  await finance.removeAsset(id)
}

async function resetGoal() {
  if (!confirm('貯金目標を削除します。よろしいですか？')) return
  await finance.deleteGoal()
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8">
    <div class="flex items-end justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-slate-800">ダッシュボード</h1>
        <p class="text-slate-500 mt-1">
          今の期間（{{ periodLabel }}）で使える金額を、総資産から計画的に管理しましょう
        </p>
      </div>
      <RouterLink
        to="/settings"
        class="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium"
      >設定を編集</RouterLink>
    </div>

    <div
      v-if="finance.errorMessage"
      class="mb-6 rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm"
    >{{ finance.errorMessage }}</div>

    <div
      v-if="!finance.loading && finance.assets.length === 0"
      class="mb-6 rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm"
    >
      まず「現在の総資産」に項目を追加してください。すべての計算はこの金額を基準に行います。
    </div>

    <div class="space-y-8">
      <!-- 総資産（項目管理） -->
      <div class="rounded-2xl bg-white border border-slate-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-semibold text-slate-800">現在の総資産</h2>
            <p class="text-xs text-slate-500 mt-1">
              銀行預金・現金・その他の口座を項目ごとに登録します
            </p>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right">
              <p class="text-xs text-slate-500">合計</p>
              <p class="text-2xl font-bold text-slate-800">
                {{ formatYen(finance.totalAssets) }}
              </p>
            </div>
            <button
              @click="breakdownOpen = true"
              class="rounded-md bg-slate-800 hover:bg-slate-900 text-white text-xs px-3 py-2"
            >内訳を見る</button>
          </div>
        </div>

        <ul v-if="finance.assets.length" class="divide-y divide-slate-100 text-sm mb-4">
          <li
            v-for="asset in finance.assets"
            :key="asset.id"
            class="grid grid-cols-[1fr_160px_auto] gap-3 items-center py-2"
          >
            <input
              type="text"
              :value="asset.name"
              @change="(e) => handleAssetNameChange(asset.id, e)"
              class="rounded-md border border-slate-200 px-3 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            />
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
              <input
                type="number"
                min="0"
                step="1000"
                :value="Number(asset.amount)"
                @change="(e) => handleAssetAmountChange(asset.id, e)"
                class="w-full rounded-md border border-slate-200 pl-8 pr-3 py-1.5 text-right focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <button
              @click="deleteAsset(asset.id)"
              class="text-xs text-rose-600 hover:underline"
            >削除</button>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-500 mb-4">
          資産項目がまだありません。「銀行預金」「財布の現金」などを追加してください。
        </p>

        <form
          @submit.prevent="submitAsset"
          class="grid grid-cols-1 md:grid-cols-[1fr_160px_160px_auto] gap-3 items-end"
        >
          <div>
            <label class="block text-xs text-slate-500 mb-1">項目名</label>
            <input
              v-model="assetName"
              type="text"
              placeholder="銀行預金・財布 など"
              class="w-full rounded-md border border-slate-300 px-3 py-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">金額</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
              <input
                v-model.number="assetAmount"
                type="number"
                min="0"
                step="1000"
                placeholder="100000"
                class="w-full rounded-md border border-slate-300 pl-8 pr-3 py-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">日付</label>
            <input
              v-model="assetDate"
              type="date"
              class="w-full rounded-md border border-slate-300 px-3 py-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            :disabled="addingAsset"
            class="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-3 md:py-2 text-sm font-medium"
          >{{ addingAsset ? '追加中…' : '追加' }}</button>
        </form>
      </div>

      <!-- メインの3枚（期間ベース） -->
      <div class="grid gap-4 md:grid-cols-3">
        <div
          class="rounded-2xl text-white p-6 shadow"
          :class="finance.isOverBudget
            ? 'bg-gradient-to-br from-rose-500 to-rose-700'
            : 'bg-gradient-to-br from-indigo-500 to-indigo-700'"
        >
          <p class="text-sm opacity-80">今月使える予算</p>
          <p class="mt-2 text-3xl font-bold">
            {{ formatYen(finance.spendableThisPeriod) }}
          </p>
          <p class="mt-1 text-xs opacity-80">
            期間の残り {{ finance.daysLeftInPeriod }} 日
          </p>
        </div>
        <div class="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <p class="text-sm text-slate-500">1週間に使える</p>
          <p class="mt-2 text-3xl font-bold text-slate-800">
            {{ formatYen(finance.weeklySpendable) }}
          </p>
          <p class="mt-1 text-xs text-slate-400">日割り × 7日</p>
        </div>
        <div class="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <p class="text-sm text-slate-500">1日に使える</p>
          <p class="mt-2 text-3xl font-bold text-slate-800">
            {{ formatYen(finance.dailySpendable) }}
          </p>
          <p class="mt-1 text-xs text-slate-400">
            次の月じめ日までの日割り
          </p>
        </div>
      </div>

      <!-- 今日の状況 -->
      <div class="rounded-2xl bg-white border border-slate-200 p-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-slate-800">今日の状況</h2>
          <span class="text-xs text-slate-400">
            {{ new Date().toLocaleDateString('ja-JP') }}
          </span>
        </div>
        <div class="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <p class="text-slate-500">今日使った額</p>
            <p class="mt-1 text-xl font-bold text-rose-600">
              {{ formatYen(finance.spentToday) }}
            </p>
          </div>
          <div>
            <p class="text-slate-500">今日の予算</p>
            <p class="mt-1 text-xl font-bold text-slate-800">
              {{ formatYen(finance.dailySpendable) }}
            </p>
          </div>
          <div>
            <p class="text-slate-500">今日の残り</p>
            <p
              class="mt-1 text-xl font-bold"
              :class="finance.todayRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'"
            >
              {{ formatYen(finance.todayRemaining) }}
            </p>
          </div>
        </div>
      </div>

      <!-- 日付スライダー付き 履歴 -->
      <div class="rounded-2xl bg-white border border-slate-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-slate-800">支出のログ</h2>
          <RouterLink
            to="/ledger"
            class="text-xs text-indigo-600 hover:underline"
          >家計簿を開く</RouterLink>
        </div>

        <div class="flex items-center justify-between mb-4">
          <button
            @click="shiftDate(-1)"
            class="w-10 h-10 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="前の日"
          >←</button>
          <div class="flex-1 text-center">
            <input
              v-model="selectedDate"
              type="date"
              class="text-sm text-center bg-transparent focus:outline-none"
            />
            <p class="text-xs text-slate-400 mt-1">{{ selectedDateLabel }}</p>
          </div>
          <button
            @click="shiftDate(1)"
            class="w-10 h-10 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="次の日"
          >→</button>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm mb-4">
          <div class="rounded-lg bg-emerald-50 p-3">
            <p class="text-xs text-emerald-700">この日の収入</p>
            <p class="mt-1 text-lg font-bold text-emerald-700">
              {{ formatYen(selectedDateIncome) }}
            </p>
          </div>
          <div class="rounded-lg bg-rose-50 p-3">
            <p class="text-xs text-rose-700">この日の支出</p>
            <p class="mt-1 text-lg font-bold text-rose-700">
              {{ formatYen(selectedDateExpense) }}
            </p>
          </div>
        </div>

        <ul
          v-if="entriesOnSelectedDate.length"
          class="divide-y divide-slate-100 text-sm"
        >
          <li
            v-for="item in entriesOnSelectedDate"
            :key="item.id"
            class="flex items-center justify-between py-2"
          >
            <div class="flex items-center gap-2">
              <span
                class="inline-block w-1.5 h-1.5 rounded-full"
                :class="item.kind === 'income' ? 'bg-emerald-500' : 'bg-rose-500'"
              />
              <span class="text-slate-700">{{ item.name }}</span>
            </div>
            <span
              :class="item.kind === 'income' ? 'text-emerald-700 font-medium' : 'text-slate-700'"
            >
              {{ item.kind === 'income' ? '+' : '−' }} {{ formatYen(Number(item.amount)) }}
            </span>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-500 text-center py-4">
          この日の記録はありません。<br />
          <RouterLink to="/ledger" class="text-indigo-600 hover:underline">
            家計簿画面から追加
          </RouterLink>
        </p>
      </div>

      <!-- 内訳と目標 -->
      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-2xl bg-white border border-slate-200 p-6">
          <h2 class="font-semibold text-slate-800 mb-4">今月の内訳</h2>
          <dl class="text-sm divide-y divide-slate-100">
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">現在の総資産</dt>
              <dd class="font-medium">{{ formatYen(finance.totalAssets) }}</dd>
            </div>
            <div v-if="finance.goal" class="flex justify-between py-2">
              <dt class="text-slate-500">
                今月の貯金分
                <span class="block text-xs text-slate-400">
                  {{ formatYen(finance.goalTargetAmount) }} ÷ {{ finance.monthsToGoal }} 回
                </span>
              </dt>
              <dd class="font-medium text-emerald-600">
                − {{ formatYen(finance.monthlySavingContribution) }}
              </dd>
            </div>
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">今月の固定費</dt>
              <dd class="font-medium text-rose-600">
                − {{ formatYen(finance.totalMonthlyBills) }}
              </dd>
            </div>
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">この期間の支出（記録済み）</dt>
              <dd class="font-medium text-rose-600">
                − {{ formatYen(finance.totalSpentThisPeriod) }}
              </dd>
            </div>
            <div class="flex justify-between py-3 border-t border-slate-200 mt-1">
              <dt class="font-semibold text-slate-800">今月使える残り</dt>
              <dd
                class="font-bold"
                :class="finance.isOverBudget ? 'text-rose-600' : 'text-indigo-700'"
              >
                {{ formatYen(finance.spendableThisPeriod) }}
              </dd>
            </div>
          </dl>
        </div>

        <div class="rounded-2xl bg-white border border-slate-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold text-slate-800">貯金目標</h2>
            <button
              v-if="finance.goal"
              @click="resetGoal"
              class="text-xs text-rose-600 hover:underline"
            >リセット</button>
          </div>
          <div v-if="finance.goal" class="space-y-2 text-sm">
            <p class="text-slate-500">タイトル</p>
            <p class="font-medium text-slate-800">{{ finance.goal.title }}</p>

            <p class="text-slate-500 mt-3">目標金額</p>
            <p class="font-medium text-slate-800">
              {{ formatYen(finance.goalTargetAmount) }}
            </p>

            <p class="text-slate-500 mt-3">達成予定日</p>
            <p class="font-medium text-slate-800">
              {{ finance.goal.target_date }}
              <span class="text-xs text-slate-400">（あと {{ finance.monthsToGoal }} 回の月じめ）</span>
            </p>

            <p class="text-slate-500 mt-3">月あたり必要な貯金</p>
            <p class="font-bold text-emerald-600">
              {{ formatYen(finance.monthlySavingContribution) }}
              <span class="text-xs font-normal text-slate-400">/ 月</span>
            </p>
            <p class="text-xs text-slate-400">
              給料が入るタイミングで毎月この金額を積み立てる想定です
            </p>
          </div>
          <div v-else class="text-sm text-slate-500 space-y-2">
            <p>貯金目標は設定されていません。</p>
            <p class="text-xs text-slate-400">
              目標なしのモードでは月あたりの貯金額は差し引かれず、純粋に「今の期間で使える金額」だけが表示されます。
            </p>
            <RouterLink
              to="/settings"
              class="inline-block mt-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-medium"
            >目標を追加</RouterLink>
          </div>
        </div>
      </div>

    </div>

    <AssetsBreakdownModal :open="breakdownOpen" @close="breakdownOpen = false" />
  </div>
</template>
