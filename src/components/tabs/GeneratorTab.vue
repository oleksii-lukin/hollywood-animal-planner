<script setup lang="ts">
import { ref, inject, computed } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'
import GeneratorPanel from '@/components/GeneratorPanel.vue'
import ScriptCard from '@/components/ScriptCard.vue'

const calculator = useCalculatorStore()
const switchTab = inject<((tab: 'board' | 'generator' | 'synergy' | 'advertisers') => void) | undefined>('switchTab')

const pinnedScriptsNewestFirst = computed(() =>
  [...calculator.pinnedScripts]
    .filter((s) => !calculator.isScriptArchived(s.uniqueId))
    .sort((a, b) => new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime())
)

function savePinnedScripts() {
  if (calculator.pinnedScripts.length === 0) {
    alert('No scripts in backlog to save.')
    return
  }

  const dataStr = JSON.stringify(calculator.pinnedScripts, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `hollywood_animal_scripts_${date}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function loadScripts(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const loaded = JSON.parse(e.target?.result as string)
      if (Array.isArray(loaded)) {
        const currentIds = new Set(calculator.pinnedScripts.map(s => s.uniqueId))
        let added = 0
        for (const script of loaded) {
          if (script.tags && script.uniqueId && !currentIds.has(script.uniqueId)) {
            calculator.addImportedScript(script)
            currentIds.add(script.uniqueId)
            added++
          }
        }
        alert(added > 0 ? `Loaded ${added} scripts.` : 'No new unique scripts found.')
      }
    } catch {
      alert('Error parsing JSON file.')
    }
  }
  reader.readAsText(file)
  input.value = ''
}

const fileInput = ref<HTMLInputElement | null>(null)
</script>

<template>
  <div class="space-y-3">
    <GeneratorPanel />

    <!-- Backlog -->
    <div class="space-y-2">
      <div class="generator-tab__header">
        <h3 class="label-accent-xs">Backlog</h3>
        <div class="flex-gap-1">
          <button
            v-if="switchTab && calculator.pinnedScripts.length > 0"
            type="button"
            @click="switchTab('board')"
            class="generator-tab__btn-accent"
          >
            View in Board →
          </button>
          <button
            @click="savePinnedScripts"
            class="generator-tab__btn-muted"
          >
            Save
          </button>
          <button
            @click="fileInput?.click()"
            class="generator-tab__btn-muted"
          >
            Load
          </button>
          <input ref="fileInput" type="file" accept=".json" class="hidden" @change="loadScripts">
        </div>
      </div>
      
      <div v-if="calculator.pinnedScripts.length === 0" class="generator-tab__empty">
        No scripts in backlog
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="script in pinnedScriptsNewestFirst"
          :key="script.uniqueId"
          class="generator-tab__card-wrap"
          :class="{ 'card-just-pinned': calculator.lastPinnedScriptId === script.uniqueId }"
        >
          <ScriptCard
            :script="script"
            :is-pinned-section="true"
          />
        </div>
      </div>
    </div>
  </div>
</template>
