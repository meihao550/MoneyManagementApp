<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'
import DateInputModal from '@/components/DateInputModal.vue'
import type { EntryKind, ScheduledPayment } from '@/lib/types'

const finance = useFinanceStore()

// タブ切り替え
const activeTab = ref<'record' | 'payment' | 'assets'>('record')

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
// 収入モードで既存資産を選んだら、項目名を資産名で自動補完
// （支出モードでは項目名の入力欄自体を撤去したので不要）
watch(assetSelection, (val) => {
  if (kind.value !== 'income') return
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

// ---- 資産管理用 ----
const assetName = ref('')
const assetAmount = ref<number | null>(null)
const assetDate = ref<string>(todayLocalStr())
const addingAsset = ref(false)

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
  assetDate.value = todayLocalStr()
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

async function deleteAssetItem(id: string) {
  if (!confirm('この資産を削除しますか？')) return
  await finance.removeAsset(id)
}

onMounted(() => {
  finance.fetchAll()
})

async function submitEntry() {
  if (!entryAmount.value || entryAmount.value < 0) return

  // 支出は必ず既存資産の選択が必要（項目名は選択した資産名を使うので不要）
  if (kind.value === 'expense') {
    if (!assetSelection.value) {
      alert('支出には引き落とし元の資産を選択してください')
      return
    }
  } else {
    // 収入は名前が必要（既存資産名 or 新規資産名として使う）
    if (!entryName.value.trim()) return
  }

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
      // 総資産の項目に無ければ、必ず新しい項目として追加
      await finance.addAsset({
        name: entryName.value.trim(),
        amount,
        source: 'ledger',
        occurred_on: entryDate.value,
        ledger_entry_id: entry?.id ?? null,
      })
    }
  } else {
    // 支出: 項目名は選択した資産の名前を使う
    const selectedAsset = finance.assets.find((a) => a.id === assetSelection.value)
    const expenseName = selectedAsset?.name ?? '支出'
    const entry = await finance.addEntry({
      kind: 'expense',
      name: expenseName,
      amount,
      spent_on: entryDate.value,
    })
    await finance.addAssetTransaction({
      asset_id: assetSelection.value,
      amount: -Math.abs(amount),
      occurred_on: entryDate.value,
      source: 'ledger',
      ledger_entry_id: entry?.id ?? null,
    })
  }

  entryName.value = ''
  entryAmount.value = null
  entryDate.value = todayLocalStr()
  assetSelection.value = ''
  submitting.value = false
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
      <button
        type="button"
        @click="activeTab = 'assets'"
        class="flex-1 h-10 rounded-md text-sm font-medium"
        :class="activeTab === 'assets'
          ? 'bg-white shadow text-slate-800'
          : 'text-slate-600 hover:text-slate-800'"
      >資産管理</button>
    </div>

    <!-- ===== 支出・収入タブ ===== -->
    <div v-show="activeTab === 'record'">
      <!-- 入力フォーム -->
      <section class="rounded-2xl bg-white border border-slate-200 p-6 mb-8">
        <h2 class="font-semibold text-slate-800 mb-4">入力</h2>

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

        <!-- 支出モードで資産が0件のとき警告 -->
        <div
          v-if="kind === 'expense' && finance.assets.length === 0"
          class="rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm mb-3"
        >
          支出は必ず資産（銀行預金や財布など）から引き落とされます。
          先に「資産管理」タブから資産項目を登録してください。
          <button
            type="button"
            @click="activeTab = 'assets'"
            class="ml-2 underline text-amber-900"
          >資産管理へ</button>
        </div>

        <form @submit.prevent="submitEntry" class="space-y-3">
          <!-- 支出モード: 3カラムグリッド + 下段に追加ボタン -->
          <template v-if="kind === 'expense'">
            <div class="grid gap-3 md:grid-cols-3">
              <div>
                <label class="block text-ls text-black-500 mb-1">財産項目選択</label>
                <p class="text-xs text-slate-500 mb-1">全財産を入力した時の項目を選んでください。</p>
                <select
                  v-model="assetSelection"
                  class="w-full h-11 rounded-md border border-slate-300 px-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  :disabled="finance.assets.length === 0"
                >
                  <option v-if="finance.assets.length === 0" value="" disabled>
                    資産を先に登録してください
                  </option>
                  <option v-else value="" disabled>資産を選択してください</option>
                  <option v-for="asset in finance.assets" :key="asset.id" :value="asset.id">
                    {{ asset.name }}（{{ formatYen(Number(asset.amount)) }}）
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-ls text-black-500 mb-1">金額</label>
                <p class="text-xs text-slate-500 mb-1">支出額を入力してください。</p>
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
              </div>
              <div>
                <label class="block text-ls text-black-500 mb-1">日付</label>
                <p class="text-xs text-slate-500 mb-1">消費した日付を入力してください</p>
                <DateInputModal v-model="entryDate" placeholder="日付を選択" />
              </div>
            </div>
            <p
              v-if="assetSelection"
              class="text-xs text-rose-600"
            >この金額を選択した資産からマイナスします</p>
            <button
              type="submit"
              :disabled="submitting || !assetSelection"
              class="w-full h-11 rounded-md text-white text-sm font-medium disabled:opacity-60 bg-rose-600 hover:bg-rose-700"
            >{{ submitting ? '登録中…' : '追加' }}</button>
          </template>

          <!-- 収入モード: 資産項目名の入力が必要 -->
          <template v-else>
            <div>
              <label class="block text-xs text-slate-500 mb-1">入金先の資産</label>
              <select
                v-model="assetSelection"
                class="w-full h-11 rounded-md border border-slate-300 px-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">＋ 新しい資産項目を作成</option>
                <option v-for="asset in finance.assets" :key="asset.id" :value="asset.id">
                  {{ asset.name }}（{{ formatYen(Number(asset.amount)) }}）
                </option>
              </select>
              <p
                v-if="!assetSelection"
                class="mt-1 text-xs text-indigo-600"
              >入力した項目名で新しい資産項目が作られます（総資産にプラスされます）</p>
            </div>
            <div class="grid gap-3 md:grid-cols-[1fr_160px_180px_auto]">
              <input
                v-model="entryName"
                type="text"
                placeholder="銀行預金・給料 など"
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
                class="h-11 rounded-md text-white px-4 text-sm font-medium disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700"
              >{{ submitting ? '登録中…' : '追加' }}</button>
            </div>
          </template>
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

    <!-- ===== 資産管理タブ ===== -->
    <div v-show="activeTab === 'assets'">
      <section class="rounded-2xl bg-white border border-slate-200 p-6 mb-8">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-semibold text-slate-800">現在の総資産</h2>
            <p class="text-xs text-slate-500 mt-1">
              銀行預金・現金・その他の口座を項目ごとに登録します
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-500">合計</p>
            <p class="text-2xl font-bold text-slate-800">
              {{ formatYen(finance.totalAssets) }}
            </p>
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
              @click="deleteAssetItem(asset.id)"
              class="text-xs text-rose-600 hover:underline"
            >削除</button>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-500 mb-4">
          資産項目がまだありません。「銀行預金」「財布の現金」などを追加してください。
        </p>

        <form
          @submit.prevent="submitAsset"
          class="grid grid-cols-1 md:grid-cols-[1fr_160px_180px_auto] gap-3 items-end"
        >
          <div>
            <label class="block text-xs text-slate-500 mb-1">項目名</label>
            <input
              v-model="assetName"
              type="text"
              placeholder="銀行預金・財布 など"
              class="w-full h-11 rounded-md border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                class="w-full h-11 rounded-md border border-slate-300 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">日付</label>
            <DateInputModal v-model="assetDate" placeholder="日付を選択" />
          </div>
          <button
            type="submit"
            :disabled="addingAsset"
            class="h-11 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 text-sm font-medium"
          >{{ addingAsset ? '追加中…' : '追加' }}</button>
        </form>
        <p class="text-xs text-slate-400 mt-3">
          金額を書き換えると「調整」履歴として残ります。詳細な履歴はダッシュボードの「内訳を見る」から確認できます。
        </p>
      </section>
    </div>

    <!-- ===== 家計簿記録ページへの案内（資産タブ以外で表示） ===== -->
    <section
      v-show="activeTab !== 'assets'"
      class="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 flex items-center justify-between gap-3"
    >
      <div>
        <h3 class="font-semibold text-indigo-900">記録の一覧・分析はこちら</h3>
        <p class="text-xs text-indigo-800 mt-1">
          期間の記録・グラフ・使い方の分析を「家計簿記録」ページで確認できます
        </p>
      </div>
      <RouterLink
        to="/records"
        class="shrink-0 h-11 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium flex items-center"
      >記録を見る →</RouterLink>
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
