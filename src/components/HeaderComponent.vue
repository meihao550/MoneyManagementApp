<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFinanceStore } from '@/stores/finance'

const auth = useAuthStore()
const finance = useFinanceStore()
const router = useRouter()

async function handleSignOut() {
  await auth.signOut()
  finance.reset()
  router.push('/login')
}
</script>

<template>
  <header class="bg-white border-b border-slate-200">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
      <RouterLink to="/" class="flex items-center gap-2 font-bold text-slate-800">
        <span class="text-lg">Money Planner</span>
      </RouterLink>

      <nav class="flex items-center gap-4 text-sm">
        <template v-if="auth.isLoggedIn">
          <RouterLink
            to="/"
            class="text-slate-600 hover:text-slate-900"
            active-class="text-indigo-600 font-semibold"
          >ダッシュボード</RouterLink>
          <RouterLink
            to="/settings"
            class="text-slate-600 hover:text-slate-900"
            active-class="text-indigo-600 font-semibold"
          >設定</RouterLink>
          <button
            @click="handleSignOut"
            class="rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5"
          >ログアウト</button>
        </template>
        <template v-else>
          <RouterLink
            to="/login"
            class="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5"
          >ログイン</RouterLink>
        </template>
      </nav>
    </div>
  </header>
</template>
