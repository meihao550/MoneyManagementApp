<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'

const finance = useFinanceStore()

const expenseName = ref('')
const expenseAmount = ref<number | null>(null)
const expenseDate = ref<string>(new Date().toISOString().slice(0, 10))
const submitting = ref(false)

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
          今日いくら使えるか、残りいくらかを確認しましょう
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
      v-if="!finance.loading && finance.monthlySalary === 0"
      class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"
    >
      <p class="text-slate-500 mb-4">まだ月給が登録されていません。</p>
      <RouterLink
        to="/settings"
        class="inline-block rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium"
      >設定画面で入力する</RouterLink>
    </div>

    <div v-else class="space-y-8">
      <!-- メインの3枚（残り予算ベース） -->
      <div class="grid gap-4 md:grid-cols-3">
        <div
          class="rounded-2xl text-white p-6 shadow"
          :class="finance.isOverBudget
            ? 'bg-gradient-to-br from-rose-500 to-rose-700'
            : 'bg-gradient-to-br from-indigo-500 to-indigo-700'"
        >
          <p class="text-sm opacity-80">今月の残り予算</p>
          <p class="mt-2 text-3xl font-bold">
            {{ formatYen(finance.remainingMonthlyBudget) }}
          </p>
          <p class="mt-1 text-xs opacity-80">
            予算 {{ formatYen(finance.monthlyBudget) }} − 使用 {{ formatYen(finance.totalSpentThisMonth) }}
          </p>
        </div>
        <div class="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <p class="text-sm text-slate-500">今週使える（残り予算基準）</p>
          <p class="mt-2 text-3xl font-bold text-slate-800">
            {{ formatYen(finance.weeklyRemaining) }}
          </p>
          <p class="mt-1 text-xs text-slate-400">日割り × 7日</p>
        </div>
        <div class="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <p class="text-sm text-slate-500">今日から1日に使える</p>
          <p class="mt-2 text-3xl font-bold text-slate-800">
            {{ formatYen(finance.dailyRemaining) }}
          </p>
          <p class="mt-1 text-xs text-slate-400">
            残り {{ finance.daysLeftInMonth }} 日
          </p>
        </div>
      </div>

      <!-- 今日のノルマ -->
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
              {{ formatYen(finance.dailyRemaining) }}
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

      <!-- 支出のクイック入力（家計簿） -->
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
          <h2 class="font-semibold text-slate-800 mb-4">今月の内訳</h2>
          <dl class="text-sm divide-y divide-slate-100">
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">月給</dt>
              <dd class="font-medium">{{ formatYen(finance.monthlySalary) }}</dd>
            </div>
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">固定支払い合計</dt>
              <dd class="font-medium text-rose-600">
                − {{ formatYen(finance.totalMonthlyBills) }}
              </dd>
            </div>
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">
                月あたりの貯金
                <span
                  v-if="finance.goal"
                  class="block text-xs text-slate-400"
                >
                  {{ formatYen(finance.goalTargetAmount) }} ÷ 約{{ finance.monthsToGoal }}ヶ月
                </span>
              </dt>
              <dd class="font-medium text-emerald-600">
                − {{ formatYen(finance.requiredMonthlySaving) }}
              </dd>
            </div>
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">変動費の予算</dt>
              <dd class="font-medium">{{ formatYen(finance.monthlyBudget) }}</dd>
            </div>
            <div class="flex justify-between py-2">
              <dt class="text-slate-500">今月の消費</dt>
              <dd class="font-medium text-rose-600">
                − {{ formatYen(finance.totalSpentThisMonth) }}
              </dd>
            </div>
            <div class="flex justify-between py-3 border-t border-slate-200 mt-1">
              <dt class="font-semibold text-slate-800">残り</dt>
              <dd
                class="font-bold"
                :class="finance.isOverBudget ? 'text-rose-600' : 'text-indigo-700'"
              >
                {{ formatYen(finance.remainingMonthlyBudget) }}
              </dd>
            </div>
          </dl>
        </div>

        <div class="rounded-2xl bg-white border border-slate-200 p-6">
          <h2 class="font-semibold text-slate-800 mb-4">貯金目標</h2>
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
              <span class="text-xs text-slate-400">（残り約{{ finance.monthsToGoal }}ヶ月）</span>
            </p>

            <p class="text-slate-500 mt-3">月あたり必要な貯金</p>
            <p class="font-bold text-emerald-600">
              {{ formatYen(finance.requiredMonthlySaving) }}
              <span class="text-xs font-normal text-slate-400">/ 月</span>
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
