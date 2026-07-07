<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'
import DateInputModal from '@/components/DateInputModal.vue'

const finance = useFinanceStore()

const monthCloseDayInput = ref<number>(25)
const incomeInput = ref<number | null>(null)
const goalTitle = ref('貯金目標')
const goalAmount = ref<number | null>(null)
const goalDate = ref<string>('')
const billName = ref('')
const billAmount = ref<number | null>(null)

const savingMonthCloseDay = ref(false)
const savingIncome = ref(false)
const savingGoal = ref(false)
const savingBill = ref(false)
const deletingGoal = ref(false)

const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1)

function formatDate(d: Date): string {
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
}

function syncFromStore() {
  monthCloseDayInput.value = finance.monthCloseDay || 25
  incomeInput.value = finance.expectedMonthlyIncome || null
  if (finance.goal) {
    goalTitle.value = finance.goal.title
    goalAmount.value = Number(finance.goal.target_amount)
    goalDate.value = finance.goal.target_date
  } else {
    goalTitle.value = '貯金目標'
    goalAmount.value = null
    goalDate.value = ''
  }
}

onMounted(async () => {
  await finance.fetchAll()
  syncFromStore()
})

watch(() => finance.profile, syncFromStore)
watch(() => finance.goal, syncFromStore)

async function submitMonthCloseDay() {
  if (!monthCloseDayInput.value || monthCloseDayInput.value < 1 || monthCloseDayInput.value > 31) return
  savingMonthCloseDay.value = true
  await finance.saveMonthCloseDay(Number(monthCloseDayInput.value))
  savingMonthCloseDay.value = false
}

async function submitIncome() {
  if (incomeInput.value === null || incomeInput.value < 0) return
  if (!Number.isInteger(incomeInput.value)) return
  savingIncome.value = true
  await finance.saveExpectedMonthlyIncome(Math.floor(Number(incomeInput.value)))
  savingIncome.value = false
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

async function resetGoal() {
  if (!confirm('貯金目標を削除します。よろしいですか？')) return
  deletingGoal.value = true
  await finance.deleteGoal()
  deletingGoal.value = false
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-8 space-y-8">
    <div>
      <h1 class="text-3xl font-bold text-slate-800">設定</h1>
      <p class="text-slate-500 mt-1">
        月じめ日・貯金目標・毎月の支払いを入力してください。総資産はダッシュボードで管理します。
      </p>
    </div>

    <div
      v-if="finance.errorMessage"
      class="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm"
    >{{ finance.errorMessage }}</div>

    <!-- 月じめ日 -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-1">月じめ日（給料日／締め日）</h2>
      <p class="text-xs text-slate-500 mb-4">
        毎月お金の区切りとして使う日付です。例: 25日締めなら、毎月25日〜翌月24日を「1ヶ月」として計算します。
      </p>
      <form @submit.prevent="submitMonthCloseDay" class="flex gap-3 items-end">
        <div class="flex-1 max-w-[200px]">
          <label class="block text-xs text-slate-500 mb-1">締め日</label>
          <select
            v-model.number="monthCloseDayInput"
            class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option v-for="d in dayOptions" :key="d" :value="d">
              毎月 {{ d }} 日
            </option>
          </select>
        </div>
        <button
          type="submit"
          :disabled="savingMonthCloseDay"
          class="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
        >{{ savingMonthCloseDay ? '保存中…' : '保存' }}</button>
      </form>
      <p class="text-xs text-slate-400 mt-3">
        現在の期間: {{ formatDate(finance.periodStart) }} 〜 {{ formatDate(finance.periodEnd) }}
      </p>
    </section>

    <!-- 月々の入金見込み -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <h2 class="font-semibold text-slate-800 mb-1">月々の入金見込み</h2>
      <p class="text-xs text-slate-500 mb-4">
        給料などで毎月だいたい入ってくるお金の見込み額です。<br />
        設定すると、ダッシュボードの「今後3ヶ月の予算予測」で、来月以降の予算を月々の入金を基準に計算します。<br />
        設定しなくてもアプリは動きますが、その場合は総資産をベースにした粗い予測になります。
      </p>
      <form @submit.prevent="submitIncome" class="flex gap-3 items-end">
        <div class="flex-1 max-w-[240px]">
          <label class="block text-xs text-slate-500 mb-1">月間の見込み金額</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
            <input
              v-model.number="incomeInput"
              type="number"
              min="0"
              step="1"
              placeholder="例: 250000"
              class="w-full h-11 rounded-md border border-slate-300 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <button
          type="submit"
          :disabled="savingIncome"
          class="h-11 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 text-sm font-medium"
        >{{ savingIncome ? '保存中…' : '保存' }}</button>
      </form>
      <p v-if="finance.expectedMonthlyIncome > 0" class="text-xs text-slate-400 mt-3">
        現在の設定: {{ formatYen(finance.expectedMonthlyIncome) }} / 月
      </p>
      <p v-else class="text-xs text-amber-600 mt-3">
        未設定です。予算予測が「総資産ベース」で近似されます。
      </p>
    </section>

    <!-- 貯金目標 -->
    <section class="rounded-2xl bg-white border border-slate-200 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-semibold text-slate-800">貯金目標</h2>
        <button
          v-if="finance.goal"
          @click="resetGoal"
          :disabled="deletingGoal"
          class="text-sm text-rose-600 hover:underline disabled:opacity-60"
        >{{ deletingGoal ? '削除中…' : '目標をリセット' }}</button>
      </div>
      <p class="text-xs text-slate-500 mb-4">
        貯金目標を設定しなくてもアプリは使えます。目標をリセットすると、月あたりの貯金額は計算に含まれなくなります。
      </p>
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
          <DateInputModal v-model="goalDate" placeholder="日付を選択" />
        </div>
        <div class="md:col-span-2 flex items-center justify-between">
          <p class="text-sm text-slate-500">
            月あたり必要な貯金:
            <span class="font-semibold text-emerald-600">
              {{ formatYen(finance.monthlySavingContribution) }}
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
