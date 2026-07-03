<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useFinanceStore } from '@/stores/finance'
import { formatYen } from '@/lib/format'
import type { AssetTransactionSource } from '@/lib/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const finance = useFinanceStore()

// 展開されている資産（一度に1つの履歴を開く）
const expandedAssetId = ref<string | null>(null)

// 編集中の合計金額（インラインで書き換え可能）
const totalEdits = ref<Record<string, number | null>>({})

// 編集中の履歴（idごとに）
type TxEdit = { amount: number; occurred_on: string }
const txEdits = ref<Record<string, TxEdit>>({})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      expandedAssetId.value = null
      totalEdits.value = {}
      txEdits.value = {}
    }
    lockBodyScroll(isOpen)
  },
)

// 背景スクロールを止める。閉じる/アンマウント時に元に戻す
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

function sourceLabel(source: AssetTransactionSource): string {
  if (source === 'dashboard') return 'ダッシュボード'
  if (source === 'ledger') return '家計簿'
  if (source === 'adjustment') return '調整'
  return '手動'
}

function sourceColor(source: AssetTransactionSource): string {
  if (source === 'dashboard') return 'bg-indigo-100 text-indigo-700'
  if (source === 'ledger') return 'bg-emerald-100 text-emerald-700'
  if (source === 'adjustment') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

const totalOfAll = computed(() => finance.totalAssets)

function toggleExpand(assetId: string) {
  expandedAssetId.value = expandedAssetId.value === assetId ? null : assetId
}

async function commitAssetTotal(id: string) {
  const raw = totalEdits.value[id]
  if (raw === null || raw === undefined || !Number.isFinite(raw) || raw < 0) return
  await finance.setAssetTotal(id, Number(raw))
  delete totalEdits.value[id]
}

async function renameCommit(id: string, event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  if (!value) return
  await finance.renameAsset(id, value)
}

async function deleteAsset(id: string) {
  if (!confirm('この資産項目と履歴を削除しますか？')) return
  await finance.removeAsset(id)
  if (expandedAssetId.value === id) expandedAssetId.value = null
}

function startTxEdit(id: string) {
  const tx = finance.assetTransactions.find((t) => t.id === id)
  if (!tx) return
  txEdits.value[id] = {
    amount: Number(tx.amount),
    occurred_on: tx.occurred_on,
  }
}

function cancelTxEdit(id: string) {
  delete txEdits.value[id]
}

async function commitTxEdit(id: string) {
  const edit = txEdits.value[id]
  if (!edit) return
  await finance.updateAssetTransaction(id, {
    amount: Number(edit.amount),
    occurred_on: edit.occurred_on,
  })
  delete txEdits.value[id]
}

async function deleteTx(id: string) {
  if (!confirm('この履歴を削除しますか？（家計簿と紐付いていれば家計簿からも消えます）')) return
  await finance.removeAssetTransaction(id)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 overscroll-contain"
      @click.self="emit('close')"
    >
      <div class="w-full sm:max-w-2xl h-[92vh] sm:h-auto sm:max-h-[90vh] overflow-hidden bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col">
        <!-- Header -->
        <div class="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-800">資産の内訳</h2>
            <p class="text-xs text-slate-500 mt-1">
              合計 {{ formatYen(totalOfAll) }}
            </p>
          </div>
          <button
            @click="emit('close')"
            class="w-10 h-10 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500 text-xl"
            aria-label="閉じる"
          >✕</button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <p v-if="!finance.assets.length" class="text-sm text-slate-500">
            資産項目がまだありません。ダッシュボードから追加してください。
          </p>

          <div
            v-for="asset in finance.assets"
            :key="asset.id"
            class="rounded-xl border border-slate-200 overflow-hidden"
          >
            <!-- 資産のヘッダー -->
            <div class="p-4 space-y-3">
              <!-- 名前 + 削除 -->
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  :value="asset.name"
                  @change="(e) => renameCommit(asset.id, e)"
                  class="flex-1 min-w-0 rounded-md border border-slate-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 px-3 py-2 font-semibold text-slate-800"
                />
                <button
                  @click="deleteAsset(asset.id)"
                  class="shrink-0 h-11 px-3 rounded-md text-rose-600 hover:bg-rose-50 text-sm font-medium"
                >削除</button>
              </div>

              <!-- 合計金額 -->
              <div>
                <label class="block text-xs text-slate-500 mb-1">合計金額（編集可）</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    :value="totalEdits[asset.id] ?? Number(asset.amount)"
                    @input="(e) => totalEdits[asset.id] = Number((e.target as HTMLInputElement).value)"
                    @change="commitAssetTotal(asset.id)"
                    class="w-full text-right rounded-md border border-slate-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 pl-8 pr-3 py-2 text-slate-800 font-bold text-lg"
                  />
                </div>
                <p class="text-xs text-slate-400 mt-1">
                  値を変えると差分が「調整」履歴として残ります
                </p>
              </div>

              <!-- 履歴トグル -->
              <button
                @click="toggleExpand(asset.id)"
                class="w-full h-11 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium flex items-center justify-center gap-2"
              >
                <span>{{ expandedAssetId === asset.id ? '履歴を閉じる' : '履歴を見る' }}</span>
                <span class="text-xs text-slate-500">
                  ({{ finance.transactionsForAsset(asset.id).length }} 件)
                </span>
              </button>
            </div>

            <!-- 履歴 -->
            <div
              v-if="expandedAssetId === asset.id"
              class="border-t border-slate-200 bg-slate-50 px-4 py-3"
            >
              <ul
                v-if="finance.transactionsForAsset(asset.id).length"
                class="space-y-2"
              >
                <li
                  v-for="tx in finance.transactionsForAsset(asset.id)"
                  :key="tx.id"
                  class="bg-white border border-slate-200 rounded-lg p-3 text-sm"
                >
                  <!-- 表示モード -->
                  <div v-if="!txEdits[tx.id]" class="space-y-2">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span
                        class="px-2 py-0.5 rounded-full text-xs font-medium"
                        :class="sourceColor(tx.source)"
                      >{{ sourceLabel(tx.source) }}</span>
                      <span class="text-slate-500 text-xs">{{ tx.occurred_on }}</span>
                      <span
                        class="ml-auto font-semibold text-base"
                        :class="Number(tx.amount) >= 0 ? 'text-emerald-700' : 'text-rose-700'"
                      >
                        {{ Number(tx.amount) >= 0 ? '+' : '' }}{{ formatYen(Number(tx.amount)) }}
                      </span>
                    </div>
                    <div class="flex gap-2">
                      <button
                        @click="startTxEdit(tx.id)"
                        class="flex-1 h-10 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                      >編集</button>
                      <button
                        @click="deleteTx(tx.id)"
                        class="flex-1 h-10 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-medium"
                      >削除</button>
                    </div>
                  </div>

                  <!-- 編集モード -->
                  <div v-else class="space-y-2">
                    <div>
                      <label class="block text-xs text-slate-500 mb-1">日付</label>
                      <input
                        v-model="txEdits[tx.id]!.occurred_on"
                        type="date"
                        class="w-full h-11 rounded-md border border-slate-300 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    </div>
                    <div>
                      <label class="block text-xs text-slate-500 mb-1">金額（マイナスも可）</label>
                      <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
                        <input
                          v-model.number="txEdits[tx.id]!.amount"
                          type="number"
                          step="1"
                          class="w-full h-11 rounded-md border border-slate-300 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      </div>
                    </div>
                    <div class="flex gap-2">
                      <button
                        @click="commitTxEdit(tx.id)"
                        class="flex-1 h-11 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                      >保存</button>
                      <button
                        @click="cancelTxEdit(tx.id)"
                        class="flex-1 h-11 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                      >取消</button>
                    </div>
                  </div>
                </li>
              </ul>
              <div v-else class="text-xs text-slate-500 py-2">
                履歴がまだありません。<br />
                ダッシュボードで新しく追加した項目、家計簿で「収入」として登録した項目、または合計金額を書き換えた履歴がここに表示されます。
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-slate-200">
          <button
            @click="emit('close')"
            class="w-full h-11 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium"
          >閉じる</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
