<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{
  open: boolean
  title?: string
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}>()

const emit = defineEmits<{
  close: []
}>()

const contentRef = ref<HTMLElement | null>(null)

function getScrollbarWidth(): number {
  return window.innerWidth - document.documentElement.clientWidth
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) {
    emit('close')
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    const isDesktop = window.innerWidth >= 1024
    const scrollbarWidth = isDesktop ? getScrollbarWidth() : 0
    document.body.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`)
    document.body.classList.add('modal-open')
    document.addEventListener('keydown', handleKeydown)
  } else {
    document.body.classList.remove('modal-open')
    document.body.style.removeProperty('--scrollbar-width')
    document.removeEventListener('keydown', handleKeydown)
  }
}, { immediate: true })

onUnmounted(() => {
  document.body.classList.remove('modal-open')
  document.body.style.removeProperty('--scrollbar-width')
  document.removeEventListener('keydown', handleKeydown)
})

function handleBackdropClick(e: MouseEvent) {
  const target = e.target as Node
  if (contentRef.value && !contentRef.value.contains(target)) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="modal__overlay"
        style="left: 0; right: 0; top: 0; bottom: 0;"
        @click="handleBackdropClick"
      >
        <div class="modal__backdrop" />
        
        <div
          ref="contentRef"
          class="modal-box"
          :class="{
            'max-w-[min(24rem,calc(100vw-2rem))]': maxWidth === 'sm',
            'max-w-[min(28rem,calc(100vw-2rem))]': maxWidth === 'md',
            'max-w-[min(32rem,calc(100vw-2rem))]': maxWidth === 'lg' || !maxWidth,
            'max-w-[min(36rem,calc(100vw-2rem))]': maxWidth === 'xl',
            'max-w-[min(42rem,calc(100vw-2rem))]': maxWidth === '2xl'
          }"
        >
          <div v-if="title" class="modal-header">
            <h2 class="modal__title">{{ title }}</h2>
            <button
              @click="emit('close')"
              class="modal__close-btn"
            >
              <svg class="icon-size-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="max-h-[80vh] overflow-y-auto">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active > div:last-child,
.modal-leave-active > div:last-child {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from > div:last-child,
.modal-leave-to > div:last-child {
  transform: scale(0.95);
  opacity: 0;
}
</style>
