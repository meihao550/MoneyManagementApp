<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'
import AssetsBreakdownModal from '@/components/AssetsBreakdownModal.vue'
import DateInputModal from '@/components/DateInputModal.vue'
import SavingsDepositModal from '@/components/SavingsDepositModal.vue'

const finance = useFinanceStore()

function todayLocalStr(): string {
  const t = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

const breakdownOpen = ref(false)
const depositOpen = ref(false)

// 3ヶ月予算予測
const forecast3Months = computed(() => {
  return [0, 1, 2].map((offset) => ({
    offset,
    label: offset === 0 ? '今期' : `${offset}ヶ月後`,
    data: finance.forecastForPeriod(offset),
  }))
})

function fmtRange(d: Date): string {
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

const periodLabel = computed(() => {
  const fmt = (d: Date) => d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
  return `${fmt(finance.periodStart)} 〜 ${fmt(finance.periodEnd)}`
})

// 日付スライダー
const selectedDate = ref(todayLocalStr())

function shiftDate(days: number) {
  const parts = selectedDate.value.split('-').map(Number)
  const d = new Date(parts[0]!, parts[1]! - 1, parts[2]! + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  selectedDate.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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

async function resetGoal() {
  if (!confirm('貯金目標を削除します。よろしいですか？')) return
  await finance.deleteGoal()
}

async function markPaymentComplete(paymentId: string, dueDate: string) {
  await finance.completeScheduledPayment(paymentId, dueDate)
}

async function undoPaymentComplete(completionId: string | null) {
  if (!completionId) return
  await finance.uncompleteScheduledPayment(completionId)
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
      <!-- 支払い通知 -->
      <div
        v-if="finance.paymentsNeedingAttention.length"
        class="rounded-2xl bg-amber-50 border-2 border-amber-300 p-5"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <h2 class="font-bold text-amber-900 text-lg">支払いの確認</h2>
            <p class="text-xs text-amber-800 mt-1">
              下記の支払いは完了していますか？ 完了したら「完了」を押してください
            </p>
          </div>
        </div>
        <ul class="space-y-2">
          <li
            v-for="item in finance.paymentsNeedingAttention"
            :key="item.payment.id + item.date"
            class="bg-white rounded-lg p-3 flex items-center justify-between gap-3"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-slate-800">{{ item.payment.name }}</span>
                <span
                  v-if="item.date < todayLocalStr()"
                  class="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700"
                >期限切れ</span>
                <span
                  v-else
                  class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                >今日</span>
              </div>
              <p class="text-sm text-slate-600 mt-0.5">
                {{ item.date }}: {{ formatYen(Number(item.payment.amount)) }}
              </p>
            </div>
            <button
              @click="markPaymentComplete(item.payment.id, item.date)"
              class="h-10 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium shrink-0"
            >完了</button>
          </li>
        </ul>
      </div>

      <!-- 今後の支払い予定（今日以外） -->
      <div
        v-if="finance.upcomingPayments.length || finance.scheduledPaymentsInPeriod.some(i => i.completed)"
        class="rounded-2xl bg-white border border-slate-200 p-6"
      >
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-slate-800">この期間の支払い予定</h2>
          <RouterLink to="/ledger" class="text-xs text-indigo-600 hover:underline">
            登録・編集
          </RouterLink>
        </div>
        <p class="text-xs text-slate-500 mb-3">
          未完了 {{ formatYen(finance.totalScheduledUnpaidInPeriod) }} が「使える予算」から差し引かれます
          <span v-if="finance.totalScheduledPaidInPeriod > 0" class="text-emerald-600">
            · 完了済み {{ formatYen(finance.totalScheduledPaidInPeriod) }} は総資産から支払われるため計算外
          </span>
        </p>
        <ul class="divide-y divide-slate-100 text-sm">
          <li
            v-for="item in finance.scheduledPaymentsInPeriod"
            :key="item.payment.id + item.date"
            class="py-2 flex items-center justify-between gap-3"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="inline-block w-1.5 h-1.5 rounded-full"
                  :class="item.completed ? 'bg-emerald-500' : 'bg-slate-300'"
                />
                <span
                  class="text-slate-700"
                  :class="item.completed ? 'line-through text-slate-400' : ''"
                >{{ item.payment.name }}</span>
                <span class="text-xs text-slate-400">{{ item.date }}</span>
              </div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span
                class="font-medium"
                :class="item.completed ? 'text-slate-400 line-through' : 'text-slate-700'"
              >{{ formatYen(Number(item.payment.amount)) }}</span>
              <button
                v-if="item.completed"
                @click="undoPaymentComplete(item.completionId)"
                class="text-xs text-slate-500 hover:underline"
              >取消</button>
            </div>
          </li>
        </ul>
      </div>

      <!-- 総資産サマリ -->
      <div class="rounded-2xl bg-white border border-slate-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-slate-800">現在の総資産</h2>
            <p class="text-xs text-slate-500 mt-1">
              追加・編集は
              <RouterLink to="/ledger" class="text-indigo-600 hover:underline">家計簿の「資産管理」タブ</RouterLink>
              から
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

        <ul v-if="finance.assets.length" class="mt-4 divide-y divide-slate-100 text-sm">
          <li
            v-for="asset in finance.assets"
            :key="asset.id"
            class="flex items-center justify-between py-2"
          >
            <span class="text-slate-700">{{ asset.name }}</span>
            <span class="text-slate-800 font-medium">{{ formatYen(Number(asset.amount)) }}</span>
          </li>
        </ul>
        <p v-else class="mt-4 text-sm text-slate-500">
          資産項目がまだありません。
          <RouterLink to="/ledger" class="text-indigo-600 hover:underline">家計簿の「資産管理」タブ</RouterLink>
          から追加してください。
        </p>
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
        <div
          v-if="finance.paymentsToday.length"
          class="mt-4 pt-3 border-t border-slate-100"
        >
          <p class="text-xs text-slate-500 mb-1">
            今日は別途スケジュール支払いがあります（今日の残りとは別枠）
          </p>
          <ul class="text-sm space-y-1">
            <li
              v-for="item in finance.paymentsToday"
              :key="item.payment.id + item.date"
              class="flex items-center justify-between"
            >
              <span
                :class="item.completed ? 'text-slate-400 line-through' : 'text-slate-700'"
              >{{ item.payment.name }}</span>
              <span
                class="font-medium"
                :class="item.completed ? 'text-slate-400 line-through' : 'text-amber-700'"
              >{{ formatYen(Number(item.payment.amount)) }}</span>
            </li>
          </ul>
          <p class="text-xs text-slate-500 mt-1">
            今日の支払い合計:
            <span class="font-semibold">{{ formatYen(finance.paymentsTodayTotal) }}</span>
          </p>
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
            <DateInputModal v-model="selectedDate" placeholder="日付を選択" />
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
            <div
              v-if="finance.totalScheduledUnpaidInPeriod > 0"
              class="flex justify-between py-2"
            >
              <dt class="text-slate-500">
                未完了の支払い予定
                <span class="block text-xs text-slate-400">
                  {{ finance.scheduledPaymentsInPeriod.filter(i => !i.completed).length }}件
                </span>
              </dt>
              <dd class="font-medium text-rose-600">
                − {{ formatYen(finance.totalScheduledUnpaidInPeriod) }}
              </dd>
            </div>
            <div
              v-if="finance.totalScheduledPaidInPeriod > 0"
              class="flex justify-between py-2"
            >
              <dt class="text-slate-500">
                完了済みの支払い
                <span class="block text-xs text-slate-400">
                  総資産から支払われるため計算に含みません
                </span>
              </dt>
              <dd class="font-medium text-emerald-600">
                済 {{ formatYen(finance.totalScheduledPaidInPeriod) }}
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

            <!-- 達成バー -->
            <div class="mt-3">
              <div class="flex items-center justify-between mb-1">
                <span class="text-slate-500">達成状況</span>
                <span class="text-xs font-semibold text-slate-700">
                  {{ Math.floor(finance.goalProgress * 100) }}%
                </span>
              </div>
              <div class="h-3 rounded-full bg-slate-100 overflow-hidden">
                <div
                  class="h-full transition-all"
                  :class="finance.isGoalAchieved ? 'bg-emerald-500' : 'bg-indigo-500'"
                  :style="{ width: Math.min(finance.goalProgress * 100, 100) + '%' }"
                />
              </div>
              <p class="text-xs text-slate-500 mt-1">
                {{ formatYen(finance.totalSavedForGoal) }} / {{ formatYen(finance.goalTargetAmount) }}
              </p>
            </div>

            <p class="text-slate-500 mt-3">達成予定日</p>
            <p class="font-medium text-slate-800">
              {{ finance.goal.target_date }}
              <span class="text-xs text-slate-400">（あと {{ finance.monthsToGoal }} 回の月じめ）</span>
            </p>

            <template v-if="finance.isGoalAchieved">
              <p class="mt-3 text-sm font-bold text-emerald-600">
                🎉 目標達成しました！
              </p>
              <p class="text-xs text-slate-400">
                これ以上の月あたりの貯金は不要です
              </p>
            </template>
            <template v-else>
              <p class="text-slate-500 mt-3">残り</p>
              <p class="font-medium text-slate-800">
                {{ formatYen(finance.remainingToSave) }}
              </p>

              <p class="text-slate-500 mt-3">今期の月あたり必要な貯金</p>
              <p class="font-bold text-emerald-600">
                {{ formatYen(finance.monthlySavingContribution) }}
                <span class="text-xs font-normal text-slate-400">/ 月</span>
              </p>
              <p class="text-xs text-slate-400">
                残額 ÷ 残り月数 で毎月自動再計算されます
              </p>

              <!-- 今期の状態と貯金ボタン -->
              <div
                class="mt-4 rounded-lg p-3"
                :class="finance.hasDepositedThisPeriod
                  ? 'bg-emerald-50 border border-emerald-200'
                  : finance.shouldRemindDeposit
                    ? 'bg-amber-50 border-2 border-amber-300'
                    : 'bg-slate-50 border border-slate-200'"
              >
                <template v-if="finance.hasDepositedThisPeriod">
                  <p class="text-xs text-emerald-700 mb-1">今期は貯金済み ✓</p>
                  <p class="text-sm font-semibold text-emerald-800">
                    +{{ formatYen(finance.totalSavedThisPeriod) }}
                  </p>
                </template>
                <template v-else-if="finance.shouldRemindDeposit">
                  <p class="text-sm font-bold text-amber-900 mb-2">
                    今期の貯金 {{ formatYen(finance.monthlySavingContribution) }} はまだですか？
                  </p>
                  <p class="text-xs text-amber-700 mb-2">
                    月じめまであと {{ finance.daysLeftInPeriod }} 日
                  </p>
                  <button
                    @click="depositOpen = true"
                    class="w-full h-10 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
                  >貯金を記録する</button>
                </template>
                <template v-else>
                  <p class="text-xs text-slate-500 mb-2">今期の貯金はまだ記録されていません</p>
                  <button
                    @click="depositOpen = true"
                    class="w-full h-10 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
                  >貯金を記録する</button>
                </template>
              </div>
            </template>
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

      <!-- 3ヶ月の予算予測 -->
      <div class="rounded-2xl bg-white border border-slate-200 p-6">
        <div class="flex items-center justify-between mb-1">
          <h2 class="font-semibold text-slate-800">今後3ヶ月の予算予測</h2>
          <RouterLink
            v-if="finance.expectedMonthlyIncome === 0"
            to="/settings"
            class="text-xs text-indigo-600 hover:underline"
          >月々の入金を設定</RouterLink>
        </div>
        <p class="text-xs text-slate-500 mb-1">
          今期は現在の総資産、未来の期間は「前期の使える残り」＋「月々の入金見込み」をベースに、時間で繋がった予測をします。急な支払いで来月がきついと事前に気づけます。
        </p>
        <p
          v-if="finance.expectedMonthlyIncome === 0"
          class="text-xs text-amber-600 mb-4"
        >
          ⚠️ 月々の入金見込みが未設定です。未来期の予測は総資産で近似されるため、正確ではありません。
        </p>
        <div v-else class="mb-4"></div>
        <div class="grid gap-3 md:grid-cols-3">
          <div
            v-for="row in forecast3Months"
            :key="row.offset"
            class="rounded-xl border p-4"
            :class="row.offset === 0 ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'"
          >
            <div class="flex items-center justify-between mb-2">
              <span
                class="text-xs font-semibold"
                :class="row.offset === 0 ? 'text-indigo-700' : 'text-slate-700'"
              >{{ row.label }}</span>
              <span class="text-xs text-slate-500">
                {{ fmtRange(row.data.start) }} 〜 {{ fmtRange(row.data.end) }}
              </span>
            </div>
            <div class="text-2xl font-bold text-slate-800">
              {{ formatYen(row.data.daily) }}
              <span class="text-xs font-normal text-slate-500">/ 日</span>
            </div>
            <ul class="mt-3 text-xs text-slate-500 space-y-1">
              <!-- 今期: 総資産のみ -->
              <li v-if="row.offset === 0" class="flex justify-between">
                <span class="truncate">総資産</span>
                <span>+ {{ formatYen(row.data.base) }}</span>
              </li>
              <!-- 未来期: 前期の残り (+ 月々の入金) -->
              <template v-else>
                <li class="flex justify-between">
                  <span class="truncate">{{ row.data.carryoverLabel }}</span>
                  <span>+ {{ formatYen(row.data.carryover) }}</span>
                </li>
                <li v-if="row.data.income > 0" class="flex justify-between">
                  <span>月々の入金</span>
                  <span>+ {{ formatYen(row.data.income) }}</span>
                </li>
              </template>
              <li class="flex justify-between">
                <span>固定費</span>
                <span>− {{ formatYen(row.data.bills) }}</span>
              </li>
              <li class="flex justify-between">
                <span>支払い予定 ({{ row.data.days }}日)</span>
                <span>− {{ formatYen(row.data.scheduled) }}</span>
              </li>
              <li class="flex justify-between">
                <span>貯金分</span>
                <span>− {{ formatYen(row.data.saving) }}</span>
              </li>
              <li class="flex justify-between font-semibold text-slate-700 pt-1 border-t border-slate-100">
                <span>使える予算</span>
                <span>{{ formatYen(row.data.spendable) }}</span>
              </li>
            </ul>
          </div>
        </div>
        <p class="text-xs text-slate-400 mt-3">
          ※ 予測はあくまで目安です。実際の支出や貯金の記録で自動的に更新されます。
        </p>
      </div>

    </div>

    <AssetsBreakdownModal :open="breakdownOpen" @close="breakdownOpen = false" />
    <SavingsDepositModal :open="depositOpen" @close="depositOpen = false" />
  </div>
</template>
