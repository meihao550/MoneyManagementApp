<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'
import DateInputModal from '@/components/DateInputModal.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const finance = useFinanceStore()

const amount = ref<number | null>(null)
const depositDate = ref<string>('')
const note = ref('')
const submitting = ref(false)

function todayLocalStr(): string {
  const t = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

watch(
  () => props.open,
  (isOpen) => {
    lockBodyScroll(isOpen)
    if (isOpen) {
      // デフォルト: 今月必要な貯金額を「小数点なし整数」で
      amount.value = finance.monthlySavingContribution || null
      depositDate.value = todayLocalStr()
      note.value = ''
    }
  },
)

let previousBodyOverflow = ''
function lockBodyScroll(lock: boolean) {
  if (typeof document === 'undefined') return
  if (lock) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = previousBodyOverflow
  }
}
onBeforeUnmount(() => lockBodyScroll(false))

const canSubmit = computed(
  () => !!amount.value && amount.value > 0 && Number.isInteger(amount.value),
)

async function submit() {
  if (!finance.goal) return
  if (!canSubmit.value) return
  submitting.value = true
  await finance.addSavingsDeposit({
    goal_id: finance.goal.id,
    amount: Math.floor(Number(amount.value)),
    deposited_on: depositDate.value,
    note: note.value.trim(),
  })
  submitting.value = false
  emit('close')
}

function fillMonthly() {
  amount.value = finance.monthlySavingContribution
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 overscroll-contain"
      @click.self="emit('close')"
    >
      <div class="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col">
        <div class="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-800">貯金を記録</h2>
            <p class="text-xs text-slate-500 mt-1">
              目標「{{ finance.goal?.title ?? '' }}」
            </p>
          </div>
          <button
            @click="emit('close')"
            class="w-10 h-10 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500 text-xl"
          >✕</button>
        </div>

        <div class="p-5 space-y-4 overflow-y-auto">
          <div class="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
            <div class="flex justify-between">
              <span class="text-slate-500">これまでの貯金累計</span>
              <span class="font-semibold text-slate-800">
                {{ formatYen(finance.totalSavedForGoal) }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">目標金額</span>
              <span class="font-semibold text-slate-800">
                {{ formatYen(finance.goalTargetAmount) }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">目標までの不足</span>
              <span class="font-semibold text-emerald-700">
                {{ formatYen(finance.remainingToSave) }}
              </span>
            </div>
          </div>

          <div>
            <label class="block text-xs text-slate-500 mb-1">貯金額</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
              <input
                v-model.number="amount"
                type="number"
                min="1"
                step="1"
                placeholder="70000"
                class="w-full h-12 rounded-md border border-slate-300 pl-8 pr-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div class="flex gap-2 mt-2">
              <button
                type="button"
                @click="fillMonthly"
                class="text-xs text-indigo-600 hover:underline"
              >目安 {{ formatYen(finance.monthlySavingContribution) }} を入力</button>
            </div>
          </div>

          <div>
            <label class="block text-xs text-slate-500 mb-1">日付</label>
            <DateInputModal v-model="depositDate" placeholder="日付を選択" />
          </div>

          <div>
            <label class="block text-xs text-slate-500 mb-1">メモ（任意）</label>
            <input
              v-model="note"
              type="text"
              placeholder="7月分の貯金 など"
              class="w-full h-11 rounded-md border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <p class="text-xs text-slate-400">
            記録した貯金は資産合計には含まれず、別枠で管理されます。
            目標達成すると月あたりの貯金は 0 になります。
          </p>
        </div>

        <div class="p-4 border-t border-slate-200 flex gap-2">
          <button
            @click="emit('close')"
            class="flex-1 h-11 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
          >キャンセル</button>
          <button
            @click="submit"
            :disabled="!canSubmit || submitting"
            class="flex-1 h-11 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium"
          >{{ submitting ? '登録中…' : '記録する' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
