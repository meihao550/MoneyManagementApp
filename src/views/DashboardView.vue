<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'

const finance = useFinanceStore()

const expenseName = ref('')
const expenseAmount = ref<number | null>(null)
const expenseDate = ref<string>(new Date().toISOString().slice(0, 10))
const submitting = ref(false)

const horizonLabel = computed(() => {
  const d = finance.horizonDate
  return d.toLocaleDateString('ja-JP')
})

const horizonKind = computed(() => (finance.goal ? '目標日' : '今月末'))

onMounted(() => {
  finance.fetchAll()
})

async function submitExpense() {
  if (!expenseName.value.trim() || !expenseAmount.value || expenseAmount.value < 0) return
  submitting.value = true
  await finance.addExpense({
    name: expenseName.value.trim(),
    amount: Number(expenseAmount.value),
    spent_on: expenseDate.value,
  })
  expenseName.value = ''
  expenseAmount.value = null
  expenseDate.value = new Date().toISOString().slice(0, 10)
  submitting.value = false
}

async function removeExpense(id: string) {
  if (!confirm('この支出を削除しますか？')) return
  await finance.removeExpense(id)
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8">
    <div class="flex items-end justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-slate-800">ダッシュボード</h1>
        <p class="text-slate-500 mt-1">
          {{ horizonKind }}（{{ horizonLabel }}）まで、預金から計画的に使いましょう
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
      v-if="!finance.loading && finance.bankBalance === 0"
      class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"
    >
      <p class="text-slate-500 mb-4">
        まだ銀行の預金残高が登録されていません。<br />
        すべての計算は預金額を元に行います。
      </p>
      <RouterLink
        to="/settings"
        class="inline-block rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium"
      >設定画面で入力する</RouterLink>
    </div>

    <div v-else class="space-y-8">
      <!-- 預金サマリ -->
      <div class="rounded-2xl bg-white border border-slate-200 p-5 flex items-center justify-between">
        <div>
          <p class="text-xs text-slate-500">銀行の預金残高</p>
          <p class="mt-1 text-2xl font-bold text-slate-800">
            {{ formatYen(finance.bankBalance) }}
          </p>
        </div>
        <RouterLink
          to="/settings"
          class="text-sm text-indigo-600 hover:underline"
        >更新</RouterLink>
      </div>

      <!-- メインの3枚（預金ベース） -->
      <div class="grid gap-4 md:grid-cols-3">
        <div
          class="rounded-2xl text-white p-6 shadow"
          :class="finance.isOverBudget
            ? 'bg-gradient-to-br from-rose-500 to-rose-700'
            : 'bg-gradient-to-br from-indigo-500 to-indigo-700'"
        >
          <p class="text-sm opacity-80">{{ horizonKind }}まで使える予算</p>
          <p class="mt-2 text-3xl font-bold">
            {{ formatYen(finance.spendableUntilHorizon) }}
          </p>
          <p class="mt-1 text-xs opacity-80">
            残り {{ finance.daysUntilHorizon }} 日
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
            {{ horizonKind }}までの日割り
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

      <!-- 支出のクイック入力 -->
      <div class="rounded-2xl bg-white border border-slate-200 p-6">
        <h2 class="font-semibold text-slate-800 mb-4">支出を記録</h2>
        <form
          @submit.prevent="submitExpense"
          class="grid gap-3 md:grid-cols-[1fr_160px_160px_auto]"
        >
          <input
            v-model="expenseName"
            type="text"
            placeholder="ランチ・コンビニ など"
            class="rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
            <input
              v-model.number="expenseAmount"
              type="number"
              min="0"
              step="1"
              placeholder="1200"
              class="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <input
            v-model="expenseDate"
            type="date"
            class="rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            :disabled="submitting"
            class="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
          >{{ submitting ? '登録中…' : '追加' }}</button>
        </form>
      </div>

      <!-- 内訳と目標 -->
      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-2xl bg-white border border-slate-200 p-6">
          <h2 class="font-semibold text-slate-800 mb-4">{{ horizonKind }}までの内訳</h2>
          <dl class="text-sm divide-y divide-slate-100">
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">銀行の預金</dt>
              <dd class="font-medium">{{ formatYen(finance.bankBalance) }}</dd>
            </div>
            <div v-if="finance.goal" class="flex justify-between py-2">
              <dt class="text-slate-500">目標分（残す金額）</dt>
              <dd class="font-medium text-emerald-600">
                − {{ formatYen(finance.reservedForGoal) }}
              </dd>
            </div>
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">
                {{ horizonKind }}までの固定費（見込み）
                <span class="block text-xs text-slate-400">
                  {{ formatYen(finance.totalMonthlyBills) }} × 約{{ finance.monthsToGoal || Math.round(finance.monthsUntilHorizon * 10) / 10 }}ヶ月
                </span>
              </dt>
              <dd class="font-medium text-rose-600">
                − {{ formatYen(finance.projectedBills) }}
              </dd>
            </div>
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">今月の消費（記録済み）</dt>
              <dd class="font-medium text-rose-600">
                − {{ formatYen(finance.totalSpentThisMonth) }}
              </dd>
            </div>
            <div class="flex justify-between py-3 border-t border-slate-200 mt-1">
              <dt class="font-semibold text-slate-800">使える残り</dt>
              <dd
                class="font-bold"
                :class="finance.isOverBudget ? 'text-rose-600' : 'text-indigo-700'"
              >
                {{ formatYen(finance.spendableUntilHorizon) }}
              </dd>
            </div>
          </dl>
        </div>

        <div class="rounded-2xl bg-white border border-slate-200 p-6">
          <h2 class="font-semibold text-slate-800 mb-4">貯金目標</h2>
          <div v-if="finance.goal" class="space-y-2 text-sm">
            <p class="text-slate-500">タイトル</p>
            <p class="font-medium text-slate-800">{{ finance.goal.title }}</p>

            <p class="text-slate-500 mt-3">達成状況</p>
            <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-emerald-500 transition-all"
                :style="{ width: `${Math.round(finance.goalProgress * 100)}%` }"
              />
            </div>
            <p class="text-xs text-slate-500 mt-1">
              {{ formatYen(finance.bankBalance) }} / {{ formatYen(finance.goalTargetAmount) }}
              （{{ Math.round(finance.goalProgress * 100) }}%）
            </p>

            <p class="text-slate-500 mt-3">達成予定日</p>
            <p class="font-medium text-slate-800">
              {{ finance.goal.target_date }}
              <span class="text-xs text-slate-400">（残り約{{ finance.monthsToGoal }}ヶ月）</span>
            </p>

            <p class="text-slate-500 mt-3">達成まで不足</p>
            <p class="font-medium text-slate-800">
              {{ formatYen(finance.goalRemainingToSave) }}
            </p>
          </div>
          <p v-else class="text-sm text-slate-500">
            まだ貯金目標がありません。設定画面から追加してください。
          </p>
        </div>
      </div>

      <!-- 家計簿 -->
      <div class="rounded-2xl bg-white border border-slate-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-slate-800">今月の家計簿</h2>
          <span class="text-xs text-slate-400">日付ごとにまとめて表示</span>
        </div>

        <div v-if="finance.expensesByDay.length" class="space-y-5">
          <div
            v-for="day in finance.expensesByDay"
            :key="day.date"
            class="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-semibold text-slate-700">{{ day.date }}</span>
              <span class="text-sm font-semibold text-rose-600">
                {{ formatYen(day.total) }}
              </span>
            </div>
            <ul class="divide-y divide-slate-50 text-sm">
              <li
                v-for="item in day.items"
                :key="item.id"
                class="flex items-center justify-between py-1.5"
              >
                <span class="text-slate-600">{{ item.name }}</span>
                <div class="flex items-center gap-3">
                  <span>{{ formatYen(Number(item.amount)) }}</span>
                  <button
                    @click="removeExpense(item.id)"
                    class="text-xs text-rose-600 hover:underline"
                  >削除</button>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <p v-else class="text-sm text-slate-500">
          今月の支出はまだ記録されていません。上のフォームから追加してください。
        </p>
      </div>
    </div>
  </div>
</template>
