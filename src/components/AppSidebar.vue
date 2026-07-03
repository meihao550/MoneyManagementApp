<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFinanceStore } from '@/stores/finance'

const auth = useAuthStore()
const finance = useFinanceStore()
const router = useRouter()
const route = useRoute()

const open = ref(false)

// 画面遷移時にサイドバー閉じる（モバイル）
watch(() => route.fullPath, () => {
  open.value = false
})

async function handleSignOut() {
  await auth.signOut()
  finance.reset()
  open.value = false
  router.push('/login')
}

//サイドバーの文字定義 iconにアイコンを表示させたいけどまだアイコンのアイデアなし
const links = [
  { to: '/', label: 'ダッシュボード', icon: '' },
  { to: '/ledger', label: '家計簿', icon: '' },
  { to: '/settings', label: '設定', icon: '' },
]
</script>

<template>
  <!-- モバイル: ハンバーガー -->
  <button
    @click="open = !open"
    class="md:hidden fixed top-3 left-3 z-40 p-2 rounded-md bg-white border border-slate-200 shadow"
    aria-label="メニューを開閉"
  >
    <svg
      class="w-5 h-5 text-slate-700"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path v-if="!open" stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
      <path v-else stroke-linecap="round" d="M6 6l12 12M6 18L18 6" />
    </svg>
  </button>

  <!-- モバイル: 背景 -->
  <div
    v-if="open"
    @click="open = false"
    class="md:hidden fixed inset-0 bg-black/30 z-30"
  />

  <!-- サイドバー本体 -->
  <aside
    class="fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-40 flex flex-col transform transition-transform duration-200 md:translate-x-0"
    :class="open ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="p-5 border-b border-slate-200 flex items-center gap-2 font-bold text-slate-800">
      <span>Money Planner</span>
    </div>

    <nav class="flex-1 p-4 space-y-1">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-slate-700 hover:bg-slate-100 text-sm"
        active-class="!bg-indigo-50 !text-indigo-700 font-semibold"
      >
        <span>{{ link.icon }}</span>
        <span>{{ link.label }}</span>
      </RouterLink>
    </nav>

    <div class="p-4 border-t border-slate-200 space-y-2">
      <p v-if="auth.user?.email" class="text-xs text-slate-500 truncate">
        {{ auth.user.email }}
      </p>
      <button
        @click="handleSignOut"
        class="w-full text-left px-3 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100"
      >ログアウト</button>
    </div>
  </aside>
</template>
