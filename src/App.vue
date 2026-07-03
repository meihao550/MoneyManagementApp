<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

onMounted(() => {
  if (!auth.initialized) auth.init()
})
</script>

<template>
  <div class="min-h-screen">
    <template v-if="auth.isLoggedIn">
      <AppSidebar />
      <main class="md:pl-64 min-h-screen pt-14 md:pt-0">
        <RouterView />
      </main>
    </template>
    <template v-else>
      <main class="min-h-screen">
        <RouterView />
      </main>
    </template>
  </div>
</template>
