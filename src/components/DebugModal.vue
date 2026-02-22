<script setup lang="ts">
import { ref } from 'vue'
import Modal from './ui/Modal.vue'
import { resetAllDataAndReload } from '@/utils/resetAll'

const props = defineProps<{ open: boolean }>()

const STORAGE_PREFIX = 'hollywood-animal-planner'
const GITHUB_REPO = 'https://github.com/userbig/hollywood-animal-planner'
const ORIGINAL_APP = 'https://github.com/CallOn84/Hollywood-Animal-Calculator'

const emit = defineEmits<{ close: [] }>()

const loadError = ref<string | null>(null)
const pasteError = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pastedStoreValue = ref('')

function dumpToJson() {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(STORAGE_PREFIX) && key !== `${STORAGE_PREFIX}-tab-heartbeat`) {
      const value = localStorage.getItem(key)
      if (value != null) data[key] = value
    }
  }
  const blob = new Blob([JSON.stringify({ _dump: true, _ts: Date.now(), storage: data }, null, 2)], {
    type: 'application/json'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `hollywood-planner-dump-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerLoadDump() {
  loadError.value = null
  fileInputRef.value?.click()
}

function onDumpFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  loadError.value = null
  const fr = new FileReader()
  fr.onload = () => {
    try {
      const raw = fr.result as string
      const json = JSON.parse(raw) as unknown
      if (!json || typeof json !== 'object' || !('storage' in json) || !(json as { storage?: unknown }).storage) {
        loadError.value = 'Invalid dump: missing "storage" object'
        return
      }
      const storage = (json as { storage: Record<string, string> }).storage
      const allowedPrefix = STORAGE_PREFIX
      for (const [key, value] of Object.entries(storage)) {
        if (typeof key === 'string' && key.startsWith(allowedPrefix) && typeof value === 'string') {
          localStorage.setItem(key, value)
        }
      }
      window.location.reload()
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to parse JSON'
    }
  }
  fr.readAsText(file)
}

function applyPastedStore() {
  pasteError.value = null
  const raw = pastedStoreValue.value.trim()
  if (!raw) {
    pasteError.value = 'Paste the JSON value first'
    return
  }
  try {
    JSON.parse(raw)
    localStorage.setItem(STORAGE_PREFIX, raw)
    window.location.reload()
  } catch {
    pasteError.value = 'Invalid JSON'
  }
}

function requestReset() {
  if (confirm('Reset all data? This will clear theme, save file, tags, plans, history and reload the page.')) {
    emit('close')
    resetAllDataAndReload()
  }
}
</script>

<template>
  <Modal :open="props.open" title="Debug" @close="emit('close')">
    <div class="debug-modal__body">
      <div class="debug-modal__stack">
        <a
          :href="GITHUB_REPO"
          target="_blank"
          rel="noopener noreferrer"
          class="debug-modal__link"
        >
          GitHub — this project
        </a>
        <a
          :href="ORIGINAL_APP"
          target="_blank"
          rel="noopener noreferrer"
          class="debug-modal__link"
        >
          Original — Hollywood Animal Calculator (CallOn84)
        </a>
      </div>

      <div class="debug-modal__section">
        <button
          type="button"
          class="btn-outline-full"
          @click="dumpToJson"
        >
          Download state dump (JSON)
        </button>
        <div class="debug-modal__row">
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onDumpFileSelected"
          >
          <button
            type="button"
            class="btn-outline-full"
            @click="triggerLoadDump"
          >
            Load dump
          </button>
        </div>
        <p v-if="loadError" class="debug-modal__error">{{ loadError }}</p>
      </div>

      <div class="debug-modal__section">
        <label class="debug-modal__label">
          Paste <code class="code-inline">{{ STORAGE_PREFIX }}</code> from localStorage
        </label>
        <textarea
          v-model="pastedStoreValue"
          placeholder='Paste the copied JSON value here…'
          rows="4"
          class="input-mono-area"
        />
        <button
          type="button"
          class="btn-outline-full"
          :disabled="!pastedStoreValue.trim()"
          @click="applyPastedStore"
        >
          Apply &amp; reload
        </button>
        <p v-if="pasteError" class="debug-modal__error">{{ pasteError }}</p>
      </div>

      <div class="debug-modal__divider">
        <button
          type="button"
          class="btn-danger-soft"
          @click="requestReset"
        >
          Reset all &amp; reload
        </button>
      </div>
    </div>
  </Modal>
</template>
