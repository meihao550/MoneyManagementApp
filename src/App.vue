<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import HeaderComponent from '@/components/HeaderComponent.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

onMounted(() => {
  if (!auth.initialized) auth.init()
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <HeaderComponent />
    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>
