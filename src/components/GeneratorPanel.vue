<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'
import { useGameDataStore } from '@/stores/gameData'
import { runGenerationAttempts } from '@/utils/scriptGenerator'
import type { GeneratedScript, TagPreset, TagInput } from '@/types/game'
import { getTagCategoryClasses } from '@/utils/tagCategoryColors'
import Card from '@/components/ui/Card.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import Button from '@/components/ui/Button.vue'
import TagSelector from '@/components/TagSelector.vue'
import ScriptCard from '@/components/ScriptCard.vue'

const calculator = useCalculatorStore()
const gameData = useGameDataStore()

const showResults = ref(false)
const isGenerating = ref(false)
const abortBoardGeneration = ref(false)
const confirmStopBoard = ref(false)
const generationProgress = ref<{ current: number; total: number; iteration: number; skipped?: number }>({ current: 0, total: 0, iteration: 0 })
const settingsCollapsed = ref(false)
const lockedCollapsed = ref(false)
const excludedCollapsed = ref(true)
const historyCollapsed = ref(true)

onMounted(() => {
  if (calculator.generatedScripts.length > 0) showResults.value = true
})

const targetTagCount = computed(() => {
  const score = calculator.targetMovieScore
  if (score <= 6) return 5
  if (score === 7) return 7
  if (score === 8) return 8
  return 9
})

function setProfile(profile: 'custom' | 'starting' | 'save' | 'preset') {
  calculator.generatorProfile = profile
  if (profile === 'preset') return
  calculator.activePresetId = null
  if (profile === 'starting') populateExcludedForStarting()
  else if (profile === 'save') populateExcludedFromSave()
  else calculator.clearTags('excluded')
}

function loadPreset(presetId: string) {
  calculator.applyTagPreset(presetId)
}

const savePresetName = ref('')
const showSavePreset = ref(false)
function openSavePreset() {
  savePresetName.value = ''
  showSavePreset.value = true
}
function submitSavePreset() {
  const name = savePresetName.value.trim() || 'Unnamed preset'
  calculator.saveCurrentAsTagPreset(name)
  showSavePreset.value = false
}

function exportPreset(presetId: string) {
  const preset = calculator.tagPresets.find((p: TagPreset) => p.id === presetId)
  if (!preset) return
  const json = calculator.exportPresetToJson(presetId)
  if (!json) return
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(preset.name || 'preset').replace(/\s+/g, '_')}_tag_preset.json`
  a.click()
  URL.revokeObjectURL(url)
}

const importFileInput = ref<HTMLInputElement | null>(null)
function triggerImport() {
  importFileInput.value?.click()
}
function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : ''
    const added = calculator.importPresetFromJson(text)
    if (added) {
      calculator.applyTagPreset(added.id)
    } else {
      alert('Invalid preset file. Expected JSON with name, lockedTags, excludedTags.')
    }
  }
  reader.readAsText(file)
}

function populateExcludedFromSave() {
  if (!calculator.hasSaveLoaded) return
  calculator.clearTags('excluded')
  const availableSet = new Set(calculator.availableTagsFromSave)
  for (const tag of Object.values(gameData.tags)) {
    if (!availableSet.has(tag.id)) calculator.addTag('excluded', { id: tag.id, percent: 1.0, category: tag.category })
  }
}

function populateExcludedForStarting() {
  calculator.clearTags('excluded')
  for (const tag of Object.values(gameData.tags)) {
    if (!gameData.starterWhitelist.has(tag.id)) calculator.addTag('excluded', { id: tag.id, percent: 1.0, category: tag.category })
  }
}

async function generateScripts() {
  const fixedTags = calculator.generatorLockedTags
  const excludedTags = calculator.generatorExcludedTags
  const scoringFixed = fixedTags.filter((t: TagInput) => t.category !== 'Genre' && t.category !== 'Setting')
  if (scoringFixed.length > targetTagCount.value) {
    alert(`You have locked ${scoringFixed.length} scoring elements, but the target Movie Score only allows for ~${targetTagCount.value}. Increase the target Movie Score or remove locked elements.`)
    return
  }
  isGenerating.value = true
  abortBoardGeneration.value = false
  confirmStopBoard.value = false
  const count = Math.max(1, Math.min(20, calculator.generatorBatchSize || 9))
  const skipLow = calculator.generatorSkipLowQuality ?? true
  const fullyDiverse = calculator.generatorFullyDiverseTags ?? false
  const minScore = calculator.targetMovieScore ?? 6
  const maxAttempts = skipLow ? Math.max(80, Math.round(200 * count / 9)) : 50
  generationProgress.value = { current: 0, total: count, iteration: 0, skipped: 0 }
  await new Promise(r => setTimeout(r, 50))
  const generatedBatch: GeneratedScript[] = []
  for (let i = 0; i < count; i++) {
    if (abortBoardGeneration.value) break
    generationProgress.value = { ...generationProgress.value, current: i + 1 }
    const { best, metTarget } = await runGenerationAttempts({
      targetCompatibility: calculator.targetCompatibility,
      targetTagCount: targetTagCount.value,
      fixedTags,
      excludedTags,
      gameData,
      calculator,
      baseAvoidTagIds: new Set(),
      skipLowQuality: skipLow,
      fullyDiverseTags: fullyDiverse,
      minMovieScore: minScore,
      maxAttempts,
      getAbort: () => abortBoardGeneration.value
    })
    if (best && metTarget) {
      generatedBatch.push(best)
    } else {
      generationProgress.value = { ...generationProgress.value, skipped: (generationProgress.value.skipped ?? 0) + 1 }
    }
  }
  generatedBatch.sort((a, b) => {
    const scoreA = parseFloat(a.stats.movieScore)
    const scoreB = parseFloat(b.stats.movieScore)
    return scoreA !== scoreB ? scoreB - scoreA : b.stats.avgComp - a.stats.avgComp
  })
  calculator.generatedScripts = generatedBatch
  if (generatedBatch.length > 0) calculator.addToGenerationHistory(generatedBatch)
  isGenerating.value = false
  confirmStopBoard.value = false
  showResults.value = true
}

function onStopGenerationClick() {
  if (confirmStopBoard.value) {
    abortBoardGeneration.value = true
  } else {
    confirmStopBoard.value = true
  }
}

function resetLocks() { calculator.clearTags('generator') }
function resetExcluded() { calculator.clearTags('excluded') }
function formatHistoryDate(dateStr: string): string {
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
function loadHistoryEntry(historyId: string) {
  calculator.loadFromGenerationHistory(historyId)
  showResults.value = true
}
</script>

<template>
  <div class="space-y-3">
    <Card>
      <CardHeader title="Generator Settings" collapsible v-model:collapsed="settingsCollapsed" />
      <!-- Collapsible: presets, generation settings, target compat/score -->
      <div v-show="!settingsCollapsed">
      <div class="panel-padded-mb3">
        <label class="label-section">Tag presets</label>
        <div class="generator__profile-row">
          <button
            @click="setProfile('starting')"
            class="profile-btn"
            :class="calculator.generatorProfile === 'starting' ? 'bg-text text-black border-text' : 'bg-transparent text-text-muted border-border hover:border-text hover:text-text'"
          >Starting</button>
          <button
            @click="setProfile('save')"
            :disabled="!calculator.hasSaveLoaded"
            class="profile-btn"
            :class="[
              calculator.generatorProfile === 'save' ? 'bg-success text-black border-success' : calculator.hasSaveLoaded ? 'bg-transparent text-success border-success hover:border-success hover:bg-success/10' : 'bg-transparent text-text-muted/40 border-border cursor-not-allowed'
            ]"
          >From save</button>
          <button
            @click="setProfile('custom')"
            class="profile-btn"
            :class="calculator.generatorProfile === 'custom' ? 'bg-text text-black border-text' : 'bg-transparent text-text-muted border-border hover:border-text hover:text-text'"
          >Custom</button>
        </div>
        <div v-if="calculator.tagPresets.length > 0" class="generator__presets-section">
          <span class="generator__presets-label">Your presets</span>
          <div class="generator__presets-list">
            <button
              v-for="p in calculator.tagPresets"
              :key="p.id"
              @click="loadPreset(p.id)"
              class="preset-chip"
              :class="calculator.activePresetId === p.id ? 'bg-accent/20 text-accent border-accent/50' : 'bg-transparent text-text-muted border-border hover:border-text hover:text-text'"
              :title="`${p.lockedTags.length} locked, ${p.excludedTags.length} excluded`"
            >
              <span class="generator__truncate">{{ p.name }}</span>
              <span
                class="generator__icon-btn-accent"
                title="Export preset"
                @click.stop="exportPreset(p.id)"
              >↓</span>
              <span
                class="generator__icon-btn-danger"
                title="Remove preset"
                @click.stop="calculator.removeTagPreset(p.id)"
              >×</span>
            </button>
            <button
              type="button"
              class="chip-outline-dashed"
              @click="openSavePreset"
            >
              + Save current
            </button>
            <button
              type="button"
              class="chip-outline"
              title="Import preset from JSON file"
              @click="triggerImport"
            >
              Import
            </button>
          </div>
        </div>
        <div v-else class="generator__presets-bar">
          <button
            type="button"
            class="chip-outline-dashed"
            @click="openSavePreset"
          >
            + Save current as preset
          </button>
          <button
            type="button"
            class="chip-outline"
            title="Import preset from JSON file"
            @click="triggerImport"
          >
            Import preset
          </button>
        </div>
        <input
          ref="importFileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          @change="onImportFile"
        >
      </div>
      <!-- Save preset name modal -->
      <div
        v-if="showSavePreset"
        class="modal-overlay"
        @click.self="showSavePreset = false"
      >
        <div class="generator__preset-card">
          <label class="label-section">Preset name</label>
          <input
            v-model="savePresetName"
            type="text"
            placeholder="e.g. Horror only"
            class="generator__input-mb3"
            @keydown.enter="submitSavePreset"
          >
          <div class="generator__form-actions">
            <button type="button" class="btn-ghost" @click="showSavePreset = false">Cancel</button>
            <button type="button" class="btn-primary-sm" @click="submitSavePreset">Save</button>
          </div>
        </div>
      </div>
      <div class="panel-padded-mb3">
        <label class="label-section">Generation settings</label>
        <div class="space-y-3">
          <div class="generator__batch-row">
            <label class="generator__label-section">Scripts per batch:</label>
            <input
              v-model.number="calculator.generatorBatchSize"
              type="number"
              min="1"
              max="20"
              class="generator__input-number"
            >
          </div>
          <label class="generator__label-wrap">
            <input
              v-model="calculator.generatorSkipLowQuality"
              type="checkbox"
              class="checkbox-style"
            >
            <span class="generator__label-text">Only keep scripts at or above target (Compat + Score)</span>
          </label>
          <p class="text-muted-xs">When on, scripts below your Target Compat / Target Score are not added to the batch. You may get fewer than requested.</p>
          <label class="generator__label-wrap">
            <input
              v-model="calculator.generatorFullyDiverseTags"
              type="checkbox"
              class="checkbox-style"
            >
            <span class="generator__label-text">Fully diverse tags</span>
          </label>
          <p class="text-muted-xs">When on, each retry uses different genres and setting (no skip until many different sets are tried).</p>
          <div class="generator__options-row">
            <label class="generator__label-wrap">
              <input
                v-model="calculator.releasePlanSettings.allowTagRepetition"
                type="checkbox"
                class="checkbox-style"
              >
              <span class="generator__label-text">Allow tag repetition</span>
            </label>
            <template v-if="!calculator.releasePlanSettings.allowTagRepetition">
              <span class="text-muted-base">Uniqueness:</span>
              <select
                v-model="calculator.releasePlanSettings.uniquenessLevel"
                class="generator__input-sm"
              >
                <option value="low">Low (no extra exclusion)</option>
                <option value="medium">Medium (avoid tags in 2+ other films)</option>
                <option value="high">High (no tag repeat)</option>
              </select>
            </template>
          </div>
          <p class="text-muted-xs">Uniqueness applies to Release Plan batch generation.</p>
        </div>
      </div>
      <div class="generator__grid-2">
        <div class="panel-padded">
          <div class="generator__target-row">
            <label class="label-section label-section--mb0">Target Compat</label>
            <input v-model.number="calculator.targetCompatibility" type="number" step="0.1" min="1" max="5" class="input-number-sm">
          </div>
          <input v-model.number="calculator.targetCompatibility" type="range" min="1" max="5" step="0.1" class="generator__range">
        </div>
        <div class="panel-padded">
          <div class="generator__target-row">
            <label class="label-section label-section--mb0">Target Score</label>
            <input v-model.number="calculator.targetMovieScore" type="number" step="1" min="6" max="10" class="input-number-sm">
          </div>
          <input v-model.number="calculator.targetMovieScore" type="range" min="6" max="10" step="1" class="generator__range">
          <p class="generator__hint">~{{ targetTagCount }} SE needed</p>
        </div>
      </div>
      </div>
      <div class="divider"></div>
      <CardHeader title="Locked Elements" collapsible v-model:collapsed="lockedCollapsed">
        <template #actions>
          <button @click="resetLocks" class="btn-reset">Reset</button>
        </template>
      </CardHeader>
      <div v-show="!lockedCollapsed">
        <TagSelector context="generator" show-percent-slider />
      </div>
      <div class="divider"></div>
      <CardHeader title="Excluded" color="danger" collapsible v-model:collapsed="excludedCollapsed">
        <template #actions>
          <span v-if="excludedCollapsed && calculator.generatorExcludedTags.length > 0" class="generator__badge-danger">{{ calculator.generatorExcludedTags.length }}</span>
          <button @click="resetExcluded" class="btn-reset">Reset</button>
        </template>
      </CardHeader>
      <div v-show="!excludedCollapsed">
        <TagSelector context="excluded" />
      </div>
      <div class="generator__generate-wrap">
        <Button variant="primary" full-width @click="generateScripts" :disabled="isGenerating">
          <span v-if="isGenerating" class="generator__spinner-wrap">
            <span class="generator__spinner"></span>
            Generating...
          </span>
          <span v-else>Generate</span>
        </Button>
      </div>
    </Card>

    <div v-if="isGenerating" class="modal-overlay">
      <div class="generator__popup">
        <p class="label-semibold-sm">Generating...</p>
        <p class="text-muted-xs-mt1">
          {{ generationProgress.current }}/{{ generationProgress.total }}
          <span v-if="(generationProgress.skipped ?? 0) > 0" class="generator__skipped-badge"> ({{ generationProgress.skipped }} skipped)</span>
        </p>
        <div class="generator__progress-track">
          <div class="generator__progress-fill" :style="{ width: `${(generationProgress.total ? (generationProgress.current / generationProgress.total) * 100 : 0)}%` }"></div>
        </div>
        <button
          type="button"
          class="btn-stop"
          :class="confirmStopBoard ? 'border-danger text-danger bg-danger/15 hover:bg-danger/25' : 'border-border text-text-muted hover:border-danger hover:text-danger'"
          :title="confirmStopBoard ? 'Click again to stop generation' : 'Stop generation'"
          @click="onStopGenerationClick"
        >
          {{ confirmStopBoard ? 'Confirm stop?' : 'Stop' }}
        </button>
      </div>
    </div>

    <div v-if="calculator.generatedScripts.length > 0" class="space-y-2">
      <h3 class="label-section-muted">Generated</h3>
      <div class="generator__grid-2-3">
        <ScriptCard
          v-for="script in calculator.generatedScripts"
          :key="script.uniqueId"
          :script="script"
          :is-pinned-section="false"
          compact
        />
      </div>
    </div>

    <Card v-if="calculator.generationHistory.length > 0">
      <CardHeader title="Generation History" collapsible v-model:collapsed="historyCollapsed">
        <template #actions>
          <span class="generator__sessions-count">{{ calculator.generationHistory.length }} sessions</span>
          <button @click.stop="calculator.clearGenerationHistory()" class="generator__btn-clear">Clear</button>
        </template>
      </CardHeader>
      <div v-show="!historyCollapsed" class="space-y-3">
        <div
          v-for="entry in calculator.generationHistory"
          :key="entry.id"
          class="generator__history-card"
        >
          <div class="generator__history-header">
            <div>
              <div class="generator__history-date">{{ formatHistoryDate(entry.generatedAt) }}</div>
              <div class="text-muted-sm-mt1">
                Target: {{ entry.settings.targetCompatibility.toFixed(1) }} comp, {{ entry.settings.targetMovieScore }} score
                <span class="mx-1">•</span>
                {{ entry.settings.profile === 'save' ? 'From Save' : entry.settings.profile === 'starting' ? 'Starting' : entry.settings.profile === 'preset' ? 'Preset' : 'Custom' }}
              </div>
            </div>
            <div class="generator__flex-gap2">
              <button @click="loadHistoryEntry(entry.id)" class="btn-load">Load</button>
              <button @click="calculator.removeFromGenerationHistory(entry.id)" class="generator__btn-remove">×</button>
            </div>
          </div>
          <div v-if="entry.settings.lockedTags && entry.settings.lockedTags.length > 0" class="mb-3">
            <span class="generator__locked-label">Locked</span>
            <div class="chips-row">
              <span
                v-for="tag in entry.settings.lockedTags"
                :key="tag.id"
                class="chip-sm"
                :class="getTagCategoryClasses(tag.category, tag.id)"
              >
                {{ gameData.tags[tag.id]?.name ?? tag.id }}{{ tag.percent !== 1 && tag.category === 'Genre' ? ` ${Math.round(tag.percent * 100)}%` : '' }}
              </span>
            </div>
          </div>
          <div class="chips-row-2">
            <div v-for="script in entry.scripts.slice(0, 3)" :key="script.uniqueId" class="generator__history-item">
              <span class="generator__history-score-value">{{ script.stats.movieScore }}</span>
              <span class="generator__history-score-sep">•</span>
              <span class="generator__history-score-muted">{{ script.stats.avgComp.toFixed(2) }} comp</span>
            </div>
            <span v-if="entry.scripts.length > 3" class="generator__more-label">+{{ entry.scripts.length - 3 }} more</span>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
