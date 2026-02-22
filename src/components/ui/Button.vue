<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}>()
</script>

<template>
  <button
    class="font-bold uppercase rounded transition-all active:translate-y-0"
    :class="[
      fullWidth ? 'w-full' : '',
      {
        'bg-accent text-black hover:bg-accent-hover': variant === 'primary' || !variant,
        'bg-transparent border border-accent text-accent hover:bg-accent hover:text-black': variant === 'secondary',
        'bg-transparent text-text-muted hover:text-text': variant === 'ghost',
        'bg-danger text-white hover:bg-danger/80': variant === 'danger'
      },
      {
        'px-2 py-1 text-[10px]': size === 'sm',
        'px-3 py-2 text-xs': size === 'md' || !size,
        'px-4 py-2.5 text-sm': size === 'lg'
      }
    ]"
  >
    <slot />
  </button>
</template>
