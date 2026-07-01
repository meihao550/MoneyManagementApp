<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'

const finance = useFinanceStore()

const salaryInput = ref<number | null>(null)
const goalTitle = ref('貯金目標')
const goalAmount = ref<number | null>(null)
const goalDate = ref<string>('')
const billName = ref('')
const billAmount = ref<number | null>(null)

const savingSalary = ref(false)
const savingGoal = ref(false)
const savingBill = ref(false)

function syncFromStore() {
  salaryInput.value = finance.monthlySalary || null
  if (finance.goal) {
    goalTitle.value = finance.goal.title
    goalAmount.value = Number(finance.goal.target_amount)
    goalDate.value = finance.goal.target_date
  }
}

onMounted(async () => {
  await finance.fetchAll()
  syncFromStore()
})

watch(() => finance.profile, syncFromStore)
watch(() => finance.goal, syncFromStore)

async function submitSalary() {
  if (salaryInput.value === null || salaryInput.value < 0) return
  savingSalary.value = true
  await finance.saveSalary(Number(salaryInput.value))
  savingSalary.value = false
}

async function submitGoal() {
  if (!goalAmount.value || !goalDate.value) return
  savingGoal.value = true
  await finance.saveGoal({
    title: goalTitle.value || '貯金目標',
    target_amount: Number(goalAmount.value),
    target_date: goalDate.value,
  })
  savingGoal.value = false
}

async function submitBill() {
  if (!billName.value.trim() || !billAmount.value || billAmount.value < 0) return
  savingBill.value = true
  await finance.addBill({
    name: billName.value.trim(),
    amount: Number(billAmount.value),
  })
  billName.value = ''
  billAmount.value = null
  savingBill.value = false
}

async function deleteBill(id: string) {
  if (!confirm('この支払いを削除しますか？')) return
  await finance.removeBill(id)
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-8 space-y-8">
    <div>
      <h1 class="text-3xl font-bold text-slate-800">設定</h1>
      <p class="text-slate-500 mt-1">
        月給・貯金目標・毎月の支払いを入力してください
      </p>
    </div>

    <div
      v-if="finance.errorMessage"
      class="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm"
    >{{ finance.errorMessage }}</div>

    <!-- 月給 -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-4">月給（手取り）</h2>
      <form @submit.prevent="submitSalary" class="flex gap-3 items-end">
        <div class="flex-1">
          <label class="block text-xs text-slate-500 mb-1">1ヶ月の収入</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
            <input
              v-model.number="salaryInput"
              type="number"
              min="0"
              step="1000"
              placeholder="250000"
              class="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <button
          type="submit"
          :disabled="savingSalary"
          class="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
        >{{ savingSalary ? '保存中…' : '保存' }}</button>
      </form>
    </section>

    <!-- 貯金目標 -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-4">貯金目標</h2>
      <form @submit.prevent="submitGoal" class="grid gap-4 md:grid-cols-2">
        <div class="md:col-span-2">
          <label class="block text-xs text-slate-500 mb-1">タイトル</label>
          <input
            v-model="goalTitle"
            type="text"
            placeholder="旅行資金"
            class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">目標金額</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
            <input
              v-model.number="goalAmount"
              type="number"
              min="0"
              step="1000"
              placeholder="200000"
              class="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">達成予定日</label>
          <input
            v-model="goalDate"
            type="date"
            class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div class="md:col-span-2 flex items-center justify-between">
          <p class="text-sm text-slate-500">
            月あたり必要な貯金:
            <span class="font-semibold text-emerald-600">
              {{ formatYen(finance.requiredMonthlySaving) }}
            </span>
          </p>
          <button
            type="submit"
            :disabled="savingGoal"
            class="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
          >{{ savingGoal ? '保存中…' : '目標を保存' }}</button>
        </div>
      </form>
    </section>

    <!-- 固定支払い -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-4">毎月の固定支払い</h2>

      <ul v-if="finance.bills.length" class="divide-y divide-slate-100 text-sm mb-4">
        <li
          v-for="bill in finance.bills"
          :key="bill.id"
          class="flex items-center justify-between py-2"
        >
          <span class="text-slate-700">{{ bill.name }}</span>
          <div class="flex items-center gap-3">
            <span class="font-medium">{{ formatYen(Number(bill.amount)) }}</span>
            <button
              @click="deleteBill(bill.id)"
              class="text-xs text-rose-600 hover:underline"
            >削除</button>
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-slate-500 mb-4">
        まだ登録がありません
      </p>

      <form @submit.prevent="submitBill" class="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <input
          v-model="billName"
          type="text"
          placeholder="家賃"
          class="rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
          <input
            v-model.number="billAmount"
            type="number"
            min="0"
            step="100"
            placeholder="80000"
            class="w-full rounded-md border border-slate-300 pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          :disabled="savingBill"
          class="rounded-md bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
        >追加</button>
      </form>
    </section>
  </div>
</template>
