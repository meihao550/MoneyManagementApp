<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string   // YYYY-MM-DD or ''
  placeholder?: string
  min?: string
  max?: string
  clearable?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)

// 表示中のカレンダー年月
const cursorYear = ref<number>(new Date().getFullYear())
const cursorMonth = ref<number>(new Date().getMonth())

watch(open, (isOpen) => {
  lockBodyScroll(isOpen)
  if (isOpen) {
    // 選択済みなら、その月にジャンプ
    if (props.modelValue) {
      const parts = props.modelValue.split('-').map(Number)
      cursorYear.value = parts[0]!
      cursorMonth.value = parts[1]! - 1
    } else {
      const now = new Date()
      cursorYear.value = now.getFullYear()
      cursorMonth.value = now.getMonth()
    }
  }
})

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

// 表示用フォーマット
const displayValue = computed(() => {
  if (!props.modelValue) return ''
  const parts = props.modelValue.split('-').map(Number)
  const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
})

const monthLabel = computed(() =>
  new Date(cursorYear.value, cursorMonth.value, 1).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
  }),
)

// 表示するカレンダーマス（6行 x 7列 = 42マス）
type Cell = { date: number; monthOffset: -1 | 0 | 1; iso: string; disabled: boolean; isToday: boolean; isSelected: boolean }

function pad(n: number) {
  return String(n).padStart(2, '0')
}

const cells = computed<Cell[]>(() => {
  const y = cursorYear.value
  const m = cursorMonth.value
  const firstOfMonth = new Date(y, m, 1)
  const firstWeekday = firstOfMonth.getDay() // 0=日曜
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const daysInPrevMonth = new Date(y, m, 0).getDate()

  const todayStr = (() => {
    const t = new Date()
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  })()

  const result: Cell[] = []
  // 前月のはみ出し
  for (let i = 0; i < firstWeekday; i++) {
    const date = daysInPrevMonth - firstWeekday + 1 + i
    const dm = m === 0 ? 11 : m - 1
    const dy = m === 0 ? y - 1 : y
    const iso = `${dy}-${pad(dm + 1)}-${pad(date)}`
    result.push({
      date,
      monthOffset: -1,
      iso,
      disabled: isOutOfRange(iso),
      isToday: iso === todayStr,
      isSelected: iso === props.modelValue,
    })
  }
  // 今月
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`
    result.push({
      date: d,
      monthOffset: 0,
      iso,
      disabled: isOutOfRange(iso),
      isToday: iso === todayStr,
      isSelected: iso === props.modelValue,
    })
  }
  // 翌月のはみ出し（42セルまで埋める）
  const remaining = 42 - result.length
  for (let d = 1; d <= remaining; d++) {
    const dm = m === 11 ? 0 : m + 1
    const dy = m === 11 ? y + 1 : y
    const iso = `${dy}-${pad(dm + 1)}-${pad(d)}`
    result.push({
      date: d,
      monthOffset: 1,
      iso,
      disabled: isOutOfRange(iso),
      isToday: iso === todayStr,
      isSelected: iso === props.modelValue,
    })
  }
  return result
})

function isOutOfRange(iso: string): boolean {
  if (props.min && iso < props.min) return true
  if (props.max && iso > props.max) return true
  return false
}

function prevMonth() {
  if (cursorMonth.value === 0) {
    cursorMonth.value = 11
    cursorYear.value--
  } else {
    cursorMonth.value--
  }
}

function nextMonth() {
  if (cursorMonth.value === 11) {
    cursorMonth.value = 0
    cursorYear.value++
  } else {
    cursorMonth.value++
  }
}

function pickToday() {
  const t = new Date()
  const iso = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  if (isOutOfRange(iso)) return
  emit('update:modelValue', iso)
  open.value = false
}

function selectCell(cell: Cell) {
  if (cell.disabled) return
  emit('update:modelValue', cell.iso)
  open.value = false
}

function clearValue() {
  emit('update:modelValue', '')
  open.value = false
}

const weekdayHeaders = ['日', '月', '火', '水', '木', '金', '土']
</script>

<template>
  <div>
    <button
      type="button"
      @click="open = true"
      class="w-full h-11 rounded-md border border-slate-300 px-3 text-left bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2"
    >
      <span :class="modelValue ? 'text-slate-800' : 'text-slate-400'">
        {{ modelValue ? displayValue : (placeholder ?? '日付を選択') }}
      </span>
      <svg class="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 overscroll-contain"
        @click.self="open = false"
      >
        <div class="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col">
          <!-- ヘッダー -->
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <button
              @click="prevMonth"
              class="w-10 h-10 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
              aria-label="前の月"
              type="button"
            >←</button>
            <span class="font-semibold text-slate-800">{{ monthLabel }}</span>
            <button
              @click="nextMonth"
              class="w-10 h-10 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
              aria-label="次の月"
              type="button"
            >→</button>
          </div>

          <!-- 曜日ヘッダ -->
          <div class="grid grid-cols-7 px-3 pt-3 text-center text-xs text-slate-500">
            <span v-for="(w, i) in weekdayHeaders" :key="w"
              :class="i === 0 ? 'text-rose-600' : i === 6 ? 'text-indigo-600' : ''">
              {{ w }}
            </span>
          </div>

          <!-- 日付マス -->
          <div class="grid grid-cols-7 gap-1 p-3">
            <button
              v-for="(cell, i) in cells"
              :key="cell.iso + i"
              type="button"
              @click="selectCell(cell)"
              :disabled="cell.disabled"
              class="aspect-square rounded-md text-sm font-medium flex items-center justify-center relative"
              :class="[
                cell.monthOffset === 0 ? 'text-slate-800' : 'text-slate-300',
                cell.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100',
                cell.isSelected ? '!bg-indigo-600 !text-white hover:!bg-indigo-700' : '',
                cell.isToday && !cell.isSelected ? 'ring-2 ring-indigo-300' : '',
              ]"
            >
              {{ cell.date }}
            </button>
          </div>

          <!-- フッター -->
          <div class="p-4 border-t border-slate-200 flex items-center gap-2">
            <button
              v-if="clearable"
              type="button"
              @click="clearValue"
              class="flex-1 h-11 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
            >クリア</button>
            <button
              type="button"
              @click="pickToday"
              class="flex-1 h-11 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
            >今日</button>
            <button
              type="button"
              @click="open = false"
              class="flex-1 h-11 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium"
            >閉じる</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
