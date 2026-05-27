<script setup lang="ts">
import { ref } from 'vue'
 
const emit = defineEmits<{
  fileSelected: [file: File]
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file && file.name.endsWith('.json')) {
    emit('fileSelected', file)
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('fileSelected', file)
  }
}

function openFilePicker() {
  fileInput.value?.click()
}
</script>

<template>
  <div
    class="upload-zone"
    :class="{ 'upload-zone--active': isDragging }"
    @dragover.prevent="isDragging = true"
    @dragleave="isDragging = false"
    @drop.prevent="handleDrop"
    @click="openFilePicker"
  >
    <div class="text-4xl mb-3">📁</div>
    <p class="text-muted-base">
      {{ $t('saveUpload.dropText') }}
    </p>
    <p class="upload-zone__hint">
      {{ $t('saveUpload.hint') }}
    </p>
    
    <input
      ref="fileInput"
      type="file"
      accept=".json"
      class="hidden"
      @change="handleFileSelect"
    >
  </div>
</template>
