<script setup lang="ts">
defineProps<{
  accent?: 'default' | 'danger' | 'success' | 'gold'
}>()
</script>

<template>
  <div
    class="card-root"
    :class="{
      'border-l-3 border-l-danger': accent === 'danger',
      'border-l-3 border-l-success': accent === 'success',
      'border-l-3 border-l-accent': accent === 'gold'
    }"
  >
    <slot />
  </div>
</template>
