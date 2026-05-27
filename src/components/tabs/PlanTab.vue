<script setup lang="ts">
import { ref, computed, nextTick, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCalculatorStore } from '@/stores/calculator'
import { useGameDataStore } from '@/stores/gameData'
import { runGenerationAttempts } from '@/utils/scriptGenerator'
import { calculateAudienceAffinity } from '@/utils/calculator'
import type { SavedScript, PlanSlotEntry, DemographicId, ReleasePlanHistoryEntry } from '@/types/game'
import { getTagCategoryClasses } from '@/utils/tagCategoryColors'
import { PencilIcon } from '@heroicons/vue/24/outline'
import Modal from '@/components/ui/Modal.vue'

const { t } = useI18n()
const calculator = useCalculatorStore()
const gameData = useGameDataStore()

const emit = defineEmits<{
  openTab: [tab: 'board' | 'generator' | 'synergy' | 'advertisers', options?: { pushState?: boolean }]
}>()

const runCompatibilityOnNextSynergy = inject<{ value: boolean }>('runCompatibilityOnNextSynergy')!
const runAnalyzeOnNextAdvertisers = inject<{ value: boolean }>('runAnalyzeOnNextAdvertisers')!

const historyModalEntry = ref<ReleasePlanHistoryEntry | null>(null)
const editingNameSlotIndex = ref<number | null>(null)
const editingNameValue = ref('')

function openHistoryModal(entry: ReleasePlanHistoryEntry) {
  historyModalEntry.value = entry
}
function startEditSlotName(slotIndex: number, slot: PlanSlotEntry) {
  editingNameSlotIndex.value = slotIndex
  editingNameValue.value = slot.name?.trim() || t('plan.untitled')
  nextTick(() => document.querySelector<HTMLInputElement>('.plan-slot-name-input')?.focus())
}
function stopEditSlotName(slotIndex: number, save: boolean) {
  if (editingNameSlotIndex.value !== slotIndex) return
  if (save) calculator.updatePlanSlotName(slotIndex, editingNameValue.value.trim() || t('plan.untitled'))
  editingNameSlotIndex.value = null
}

function isSlotAlreadyOnBoard(slot: SavedScript): boolean {
  const sourceId = (slot as PlanSlotEntry).sourcePinnedId
  return !!sourceId && calculator.pinnedScripts.some((s) => s.uniqueId === sourceId)
}

function sendToPreProduction(slotIndex: number, slot: SavedScript) {
  if (isSlotAlreadyOnBoard(slot)) return
  const newUniqueId = slot.uniqueId + '-pinned-' + Date.now()
  calculator.pinScript(
    { ...slot, uniqueId: newUniqueId },
    'import'
  )
  calculator.linkPlanSlotToPinned(slotIndex, newUniqueId)
}

const categoryOrder = ['Genre', 'Setting', 'Protagonist', 'Antagonist', 'Supporting Character', 'Theme & Event', 'Finale'] as const
function splitTagsByStartAndPlot(tags: SavedScript['tags']) {
  const start: SavedScript['tags'] = []
  const plot: SavedScript['tags'] = []
  for (const tag of tags) {
    if (tag.category === 'Setting' || tag.category === 'Genre') start.push(tag)
    else plot.push(tag)
  }
  start.sort((a, b) => (a.category === 'Setting' ? 0 : 1) - (b.category === 'Setting' ? 0 : 1))
  plot.sort((a, b) => categoryOrder.indexOf(a.category as (typeof categoryOrder)[number]) - categoryOrder.indexOf(b.category as (typeof categoryOrder)[number]))
  return { start, plot }
}

function getAdvertiserSummary(tags: SavedScript['tags']) {
  if (tags.length === 0) return null
  const affinity = calculateAudienceAffinity(tags)
  let totalSum = 0
  for (const demo in affinity) totalSum += affinity[demo as DemographicId]
  const RELEASE_MAGIC = 3.0
  const baseline: Record<DemographicId, number> = {} as Record<DemographicId, number>
  for (const id of Object.keys(affinity) as DemographicId[]) {
    const normalized = totalSum === 0 ? 0 : Math.min(1, Math.max(0, (affinity[id] / totalSum) * RELEASE_MAGIC))
    baseline[id] = normalized
  }
  const THRESHOLD = 0.33
  const targetAudiences = Object.entries(gameData.demographics)
    .map(([id, d]) => ({ id: id as DemographicId, name: d.name, score: baseline[id as DemographicId] }))
    .filter((d) => d.score > THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  const primaryIds = targetAudiences.map((t) => t.id)
  const bestHoliday = gameData.holidays
    .map((h) => ({
      name: h.name,
      total: primaryIds.reduce((sum, id) => sum + (h.bonuses[id] || 0), 0)
    }))
    .filter((h) => h.total > 0)
    .sort((a, b) => b.total - a.total)[0]
  return { targetAudiences, bestHoliday }
}

function openInSynergy(script: SavedScript) {
  calculator.clearTags('synergy')
  script.tags.forEach((t) => calculator.addTag('synergy', t))
  runCompatibilityOnNextSynergy.value = true
  emit('openTab', 'synergy', { pushState: true })
}
function openInAdvertisers(script: SavedScript) {
  calculator.clearTags('advertisers')
  script.tags.forEach((t) => calculator.addTag('advertisers', t))
  runAnalyzeOnNextAdvertisers.value = true
  emit('openTab', 'advertisers', { pushState: true })
}

const targetTagCount = computed(() => {
  const score = calculator.targetMovieScore
  if (score <= 6) return 5
  if (score === 7) return 7
  if (score === 8) return 8
  return 9
})

/** Avoid tag IDs when generating for this slot (based on settings and other slots). */
function getAvoidTagIdsForSlot(slotIndex: number): Set<string> {
  if (calculator.releasePlanSettings.allowTagRepetition) return new Set()
  const level = calculator.releasePlanSettings.uniquenessLevel
  if (level === 'low') return new Set()
  const otherTagIds = calculator.getTagsUsedInOtherSlots(slotIndex)
  if (level === 'high') return new Set(otherTagIds)
  const countByTag: Record<string, number> = {}
  calculator.releasePlanSlots.forEach((slot, i) => {
    if (i !== slotIndex && slot?.tags) {
      const seen = new Set<string>()
      slot.tags.forEach(t => {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          countByTag[t.id] = (countByTag[t.id] ?? 0) + 1
        }
      })
    }
  })
  return new Set(Object.keys(countByTag).filter(id => (countByTag[id] ?? 0) >= 2))
}

const generatingSlotIndex = ref<number | null>(null)
const skippedSlotIndex = ref<number | null>(null)
let skippedAnimationTimeout: ReturnType<typeof setTimeout> | null = null

async function generateForSlot(slotIndex: number) {
  generatingSlotIndex.value = slotIndex
  const fixedTags = calculator.generatorLockedTags
  const excludedTags = calculator.generatorExcludedTags
  const baseAvoid = getAvoidTagIdsForSlot(slotIndex)
  const skipLow = calculator.generatorSkipLowQuality ?? true
  const fullyDiverse = calculator.generatorFullyDiverseTags ?? false
  const minScore = calculator.targetMovieScore ?? 6
  // More attempts when we have many tags to avoid (uniqueness), so we don't skip too often
  const baseAttempts = skipLow ? 200 : 50
  const maxAttempts = Math.min(500, baseAttempts + baseAvoid.size * 15)

  const runAttempts = (avoid: Set<string>, attempts: number) =>
    runGenerationAttempts({
      targetCompatibility: calculator.targetCompatibility,
      targetTagCount: targetTagCount.value,
      fixedTags,
      excludedTags,
      gameData,
      calculator,
      baseAvoidTagIds: avoid,
      skipLowQuality: skipLow,
      fullyDiverseTags: fullyDiverse,
      minMovieScore: minScore,
      maxAttempts: attempts,
      getAbort: () => abortPlanGeneration.value
    })

  let result = await runAttempts(baseAvoid, maxAttempts)
  // If we skipped and had uniqueness constraints, retry without them so the slot still gets filled (unless user stopped)
  if (!abortPlanGeneration.value && (!result.best || !result.metTarget) && baseAvoid.size > 0) {
    const fallback = await runAttempts(new Set(), baseAttempts)
    if (fallback.best && fallback.metTarget) result = fallback
  }

  const { best, metTarget } = result
  if (best && metTarget) {
    const saved: SavedScript = {
      ...best,
      name: best.name || t('plan.filmLabel', { n: slotIndex + 1 }),
      pinnedAt: new Date().toISOString(),
      source: 'import'
    }
    calculator.setPlanSlot(slotIndex, saved)
  } else if (skipLow) {
    if (skippedAnimationTimeout) clearTimeout(skippedAnimationTimeout)
    skippedSlotIndex.value = slotIndex
    skippedAnimationTimeout = setTimeout(() => {
      skippedSlotIndex.value = null
      skippedAnimationTimeout = null
    }, 5000)
  }
  generatingSlotIndex.value = null
}

const isGeneratingBatch = ref(false)
const abortPlanGeneration = ref(false)
const confirmStopPlan = ref(false)

async function generateAllSlots() {
  isGeneratingBatch.value = true
  abortPlanGeneration.value = false
  confirmStopPlan.value = false
  for (let i = 0; i < calculator.releasePlanSlots.length; i++) {
    if (abortPlanGeneration.value) break
    const slot = calculator.releasePlanSlots[i]
    if (slot && isSlotAlreadyOnBoard(slot)) continue
    await generateForSlot(i)
    await new Promise(r => setTimeout(r, 20))
  }
  isGeneratingBatch.value = false
  confirmStopPlan.value = false
}

function onStopPlanGenerationClick() {
  if (confirmStopPlan.value) {
    abortPlanGeneration.value = true
  } else {
    confirmStopPlan.value = true
  }
}

const fromBoardSlotIndex = ref<number | null>(null)
const showFromBoardModal = ref(false)
function openFromBoardPicker(slotIndex: number) {
  fromBoardSlotIndex.value = slotIndex
  showFromBoardModal.value = true
}
function pickFromBoard(script: SavedScript) {
  if (fromBoardSlotIndex.value !== null) {
    calculator.setPlanSlotFromBoard(fromBoardSlotIndex.value, script)
    fromBoardSlotIndex.value = null
  }
  showFromBoardModal.value = false
}

// Board picker modal filters (same style as Board tab)
const boardPickerStatusFilter = ref<'all' | 'not_released'>('not_released')
const boardPickerSourceFilter = ref<'all' | 'generator' | 'import'>('all')
const boardPickerSearch = ref('')

/** Pinned scripts for From Board picker: exclude already-in-plan and archived, then apply filters and sort. */
const pinnedScriptsForBoardPicker = computed(() => {
  let list = calculator.pinnedScripts.filter(
    (s) => !calculator.isScriptInPlan(s.uniqueId) && !calculator.isScriptArchived(s.uniqueId)
  )

  if (boardPickerStatusFilter.value === 'not_released') {
    list = list.filter((s) => !calculator.isPinnedScriptReleased(s.uniqueId))
  }

  if (boardPickerSourceFilter.value !== 'all') {
    list = list.filter((s) => s.source === boardPickerSourceFilter.value)
  }

  const q = boardPickerSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        s.tags.some((t) => (gameData.tags[t.id]?.name ?? t.id).toLowerCase().includes(q))
    )
  }

  return list.sort((a, b) => new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime())
})

function formatAddedDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Short tag preview to distinguish scripts with same name (e.g. first genre/setting). */
function scriptTagHint(script: SavedScript): string {
  const start = splitTagsByStartAndPlot(script.tags).start
  if (start.length === 0) return ''
  return start.slice(0, 2).map((t) => gameData.tags[t.id]?.name ?? t.id).join(', ')
}

const slotLabels = computed(() =>
  calculator.releasePlanSlots.map((_, i) => t('plan.filmLabel', { n: i + 1 }))
)
</script>

<template>
  <div class="space-y-4">
    <div class="plan__header">
      <h2 class="plan__page-title">{{ $t('plan.title') }}</h2>
      <div class="plan__toolbar">
        <button
          type="button"
          class="plan__btn-generate"
          :disabled="isGeneratingBatch"
          @click="generateAllSlots"
        >
          {{ isGeneratingBatch ? $t('plan.generating') : $t('plan.generateAll', { n: calculator.releasePlanSlots.length }) }}
        </button>
        <button
          v-if="isGeneratingBatch"
          type="button"
          class="plan__btn-stop"
          :class="confirmStopPlan ? 'border-danger text-danger bg-danger/15 hover:bg-danger/25' : 'border-border text-text-muted hover:border-danger hover:text-danger'"
          :title="confirmStopPlan ? $t('plan.stopTooltipConfirm') : $t('plan.stopTooltip')"
          @click="onStopPlanGenerationClick"
        >
          {{ confirmStopPlan ? $t('plan.stopConfirm') : $t('plan.stop') }}
        </button>
        <button
          type="button"
          class="plan__btn-toolbar"
          :title="$t('plan.addSlotTooltip')"
          @click="calculator.addPlanSlot()"
        >
          {{ $t('plan.addSlot') }}
        </button>
        <button
          type="button"
          class="plan__btn-toolbar-sm"
          @click="emit('openTab', 'board')"
        >
          {{ $t('plan.openBoard') }}
        </button>
      </div>
    </div>

    <!-- Note: adjust locked/excluded on Board -->
    <p class="plan__note">
      {{ $t('plan.note') }}
      <button type="button" class="plan__tab-link" @click="emit('openTab', 'board')">{{ $t('plan.boardLink') }}</button>
      →
    </p>

    <!-- Settings -->
    <div class="plan__settings-panel">
      <h3 class="label-section-muted">{{ $t('plan.uniqueness') }}</h3>
      <div class="plan__settings-row">
        <label class="plan__label">
          <input
            v-model="calculator.releasePlanSettings.allowTagRepetition"
            type="checkbox"
            class="checkbox-style"
          >
          <span class="plan__checkbox-label">{{ $t('plan.allowTagRepetition') }}</span>
        </label>
        <template v-if="!calculator.releasePlanSettings.allowTagRepetition">
          <span class="text-muted-base">{{ $t('plan.level') }}</span>
          <select
            v-model="calculator.releasePlanSettings.uniquenessLevel"
            class="plan__input-sm"
          >
            <option value="low">{{ $t('plan.level.low') }}</option>
            <option value="medium">{{ $t('plan.level.medium') }}</option>
            <option value="high">{{ $t('plan.level.high') }}</option>
          </select>
        </template>
      </div>
    </div>

    <!-- Plan slots (add/remove via header and − on each card) -->
    <div class="plan__grid">
      <div
        v-for="(slot, index) in calculator.releasePlanSlots"
        :key="index"
        class="plan__slot"
        :class="[
          (slot as PlanSlotEntry)?.releasedAt ? 'border-success' : 'border-border',
          generatingSlotIndex === index && 'plan-slot-generating'
        ]"
      >
        <div
          v-if="generatingSlotIndex === index"
          class="overlay-generating"
        >
          <div class="plan__spinner-lg" />
          <span class="plan__generating-text">{{ $t('plan.generatingOverlay') }}</span>
        </div>
        <div
          v-if="skippedSlotIndex === index"
          class="overlay-skipped"
          aria-hidden="true"
        >
          <span class="plan__slot-skipped-text">{{ $t('plan.skipped') }}</span>
        </div>
        <div
          class="slot-body"
          :class="generatingSlotIndex === index && 'blur-sm'"
        >
          <div class="slot-header">
          <span class="label-section-muted label-section-muted--mb0">{{ slotLabels[index] }}</span>
          <div class="plan__slot-buttons">
            <button
              type="button"
              class="plan__slot-icon-btn"
              :title="$t('plan.fromBoardTooltip')"
              :disabled="generatingSlotIndex === index"
              @click="openFromBoardPicker(index)"
            >
              <span class="plan__slot-btn-label">{{ $t('plan.fromBoard') }}</span>
            </button>
            <button
              v-if="index > 0"
              type="button"
              class="plan__slot-icon-btn"
              :title="$t('plan.moveEarlierTooltip')"
              :disabled="generatingSlotIndex === index"
              @click="calculator.movePlanSlot(index, index - 1)"
            >
              ↑
            </button>
            <button
              v-if="index < calculator.releasePlanSlots.length - 1"
              type="button"
              class="plan__slot-icon-btn"
              :title="$t('plan.moveLaterTooltip')"
              :disabled="generatingSlotIndex === index"
              @click="calculator.movePlanSlot(index, index + 1)"
            >
              ↓
            </button>
            <button
              v-if="slot"
              type="button"
              class="plan__slot-icon-btn--danger"
              :title="$t('plan.clearSlotTooltip')"
              :disabled="generatingSlotIndex === index"
              @click="calculator.clearPlanSlot(index)"
            >
              ✕
            </button>
            <button
              v-if="calculator.releasePlanSlots.length > 1"
              type="button"
              class="plan__slot-icon-btn--danger"
              :title="$t('plan.removeSlotTooltip')"
              :disabled="generatingSlotIndex === index"
              @click="calculator.removePlanSlot(index)"
            >
              −
            </button>
          </div>
          </div>
        <div class="plan__slot-inner">
          <template v-if="slot">
            <div class="plan__slot-content">
              <template v-if="editingNameSlotIndex === index">
                <input
                  v-model="editingNameValue"
                  type="text"
                  class="plan__slot-name-input"
                  @blur="stopEditSlotName(index, true)"
                  @keydown.enter="stopEditSlotName(index, true)"
                  @keydown.escape="stopEditSlotName(index, false)"
                  @click.stop
                >
              </template>
              <template v-else>
                <span class="script-card__name">{{ slot.name || $t('plan.untitled') }}</span>
                <button
                  type="button"
                  class="icon-btn-ghost-sm"
                  :title="$t('plan.rename')"
                  @click.stop="startEditSlotName(index, slot as PlanSlotEntry)"
                >
                  <PencilIcon class="icon-size-sm" />
                </button>
              </template>
              <span v-if="(slot as PlanSlotEntry).releasedAt" class="chip-released">{{ $t('plan.released') }}</span>
              <span class="plan__slot-score">{{ slot.stats.movieScore }}</span>
              <span class="plan__slot-meta">{{ $t('plan.comp', { comp: slot.stats.avgComp.toFixed(1) }) }}</span>
              <span class="plan__slot-meta">{{ $t('plan.quality', { qual: slot.stats.maxScriptQuality }) }}</span>
            </div>
<div class="plan__chips-row">
            <span
              v-for="tag in splitTagsByStartAndPlot(slot.tags).start"
                :key="'s-' + tag.id"
                class="chip-sm"
                :class="getTagCategoryClasses(tag.category, tag.id)"
              >
                {{ gameData.tags[tag.id]?.name ?? tag.id }}
              </span>
            </div>
<div class="plan__chips-row">
            <span
              v-for="tag in splitTagsByStartAndPlot(slot.tags).plot.slice(0, 5)"
                :key="'p-' + tag.id"
                class="chip-sm"
                :class="getTagCategoryClasses(tag.category, tag.id)"
              >
                {{ gameData.tags[tag.id]?.name ?? tag.id }}
              </span>
              <span v-if="splitTagsByStartAndPlot(slot.tags).plot.length > 5" class="label-tiny">+{{ splitTagsByStartAndPlot(slot.tags).plot.length - 5 }}</span>
            </div>
            <div v-if="getAdvertiserSummary(slot.tags)" class="plan__advertiser-hint">
              {{ getAdvertiserSummary(slot.tags)!.targetAudiences.map((a) => a.name).join(', ') }}
              <span v-if="getAdvertiserSummary(slot.tags)!.bestHoliday"> · {{ getAdvertiserSummary(slot.tags)!.bestHoliday!.name }}</span>
            </div>
            <div class="plan__slot-actions">
              <button
                type="button"
                class="plan__btn-regen"
                :disabled="generatingSlotIndex === index"
                @click="generateForSlot(index)"
              >
                {{ $t('plan.regenerate') }}
              </button>
              <template v-if="(slot as PlanSlotEntry).releasedAt">
                <button
                  type="button"
                  class="btn-success-outline"
                  @click="calculator.unmarkPlanSlotReleased(index)"
                >
                  {{ $t('plan.unmarkReleased') }}
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="btn-success-outline"
                  @click="calculator.markPlanSlotReleased(index)"
                >
                  {{ $t('plan.markReleased') }}
                </button>
              </template>
              <button
                type="button"
                class="btn-accent-outline-sm"
                @click="openInSynergy(slot)"
              >
                {{ $t('plan.synergy') }}
              </button>
              <button
                type="button"
                class="btn-accent-outline-sm"
                @click="openInAdvertisers(slot)"
              >
                {{ $t('plan.advertisers') }}
              </button>
              <button
                type="button"
                class="plan__btn-success-xs"
                :title="isSlotAlreadyOnBoard(slot) ? $t('plan.boardTooltipAlready') : $t('plan.boardTooltip')"
                :disabled="isSlotAlreadyOnBoard(slot)"
                @click="sendToPreProduction(index, slot)"
              >
                {{ isSlotAlreadyOnBoard(slot) ? $t('plan.onBoard') : $t('plan.preProduction') }}
              </button>
            </div>
          </template>
          <template v-else>
            <div class="empty-center">
              <span class="text-muted-sm">{{ $t('plan.emptySlot') }}</span>
              <div class="plan__empty-actions">
                <button
                  type="button"
                  class="plan__btn-accent-xs"
                  :disabled="generatingSlotIndex === index"
                  @click="openFromBoardPicker(index)"
                >
                  {{ $t('plan.fromBoardEmpty') }}
                </button>
                <button
                  type="button"
                  class="plan__btn-empty"
                  :disabled="generatingSlotIndex === index"
                  @click="generateForSlot(index)"
                >
                  {{ $t('plan.generateEmpty') }}
                </button>
              </div>
            </div>
          </template>
        </div>
        </div>
      </div>
    </div>

    <!-- Complete plan + History -->
    <div class="plan__actions-row">
      <button
        type="button"
        class="btn-success-outline-sm"
        :disabled="!calculator.releasePlanSlots.some(Boolean)"
        @click="calculator.completePlanAndSaveToHistory()"
      >
        {{ $t('plan.completePlan') }}
      </button>
      <span class="text-muted-sm">{{ $t('plan.completePlanDesc') }}</span>
    </div>
    <div v-if="calculator.releasePlanHistory.length > 0" class="space-y-2">
      <h3 class="label-section-muted">{{ $t('plan.history') }}</h3>
      <ul class="space-y-1">
        <li
          v-for="entry in calculator.releasePlanHistory.slice().reverse()"
          :key="entry.id"
          class="plan__history-link"
        >
          <button
            type="button"
            class="plan__history-link-btn"
            @click="openHistoryModal(entry)"
          >
            <span>{{ new Date(entry.completedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) }}</span>
            <span>{{ $t('plan.historyEntry', { n: entry.slots.filter(Boolean).length }) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>

  <!-- From Board picker modal -->
  <Modal :open="showFromBoardModal" :title="$t('plan.picker.title')" @close="showFromBoardModal = false">
    <div class="plan__modal-body">
      <p class="plan__picker-desc">{{ $t('plan.picker.desc') }}</p>

      <!-- Filters (same style as Board tab) -->
      <div class="plan__filters-row">
        <input
          v-model="boardPickerSearch"
          type="text"
          :placeholder="$t('plan.picker.search')"
          class="plan__search-input"
        >
        <select
          v-model="boardPickerStatusFilter"
          class="plan__select"
        >
          <option value="not_released">{{ $t('plan.picker.notReleased') }}</option>
          <option value="all">{{ $t('plan.picker.allStatuses') }}</option>
        </select>
        <select
          v-model="boardPickerSourceFilter"
          class="plan__select"
        >
          <option value="all">{{ $t('plan.picker.allSources') }}</option>
          <option value="generator">{{ $t('plan.picker.generator') }}</option>
          <option value="import">{{ $t('plan.picker.import') }}</option>
        </select>
      </div>

      <div class="plan__picker-scroll">
        <div v-if="calculator.pinnedScripts.length === 0" class="plan__picker-empty">
          {{ $t('plan.picker.empty') }}
        </div>
        <div v-else-if="pinnedScriptsForBoardPicker.length === 0" class="plan__picker-empty">
          {{ $t('plan.picker.emptyFiltered') }}
        </div>
        <ul v-else class="space-y-2">
          <li
            v-for="script in pinnedScriptsForBoardPicker"
            :key="script.uniqueId"
            class="plan__picker-item"
            @click="pickFromBoard(script)"
          >
            <div class="min-w-0-flex-1">
              <span class="script-card__name script-card__name--block">{{ script.name || $t('plan.picker.untitled') }}</span>
              <span class="plan__picker-meta">
                {{ formatAddedDate(script.pinnedAt) }}
                <span class="mx-1">·</span>
                {{ script.source === 'generator' ? $t('plan.picker.generator') : $t('plan.picker.import') }}
                <span class="mx-1">·</span>
                <span class="plan__picker-score">{{ script.stats.movieScore }}</span>
                <span v-if="scriptTagHint(script)" class="text-text-muted/80"> · {{ scriptTagHint(script) }}</span>
              </span>
            </div>
            <span class="plan__slot-score">{{ script.stats.movieScore }}</span>
          </li>
        </ul>
      </div>
    </div>
  </Modal>

  <!-- Plan history detail modal -->
  <Modal
    :open="!!historyModalEntry"
    :title="historyModalEntry ? new Date(historyModalEntry.completedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''"
    @close="historyModalEntry = null"
  >
    <div class="plan__modal-scroll">
      <p class="plan__picker-desc">{{ $t('plan.historyModal.desc') }}</p>
      <ul class="space-y-2">
        <li
          v-for="(slot, i) in (historyModalEntry?.slots ?? []).filter(Boolean)"
          :key="(slot as PlanSlotEntry).uniqueId ?? i"
          class="plan__history-modal-item"
        >
          <span class="script-card__name">{{ (slot as PlanSlotEntry).name || $t('plan.historyModal.untitled') }}</span>
          <span class="plan__history-score">{{ (slot as PlanSlotEntry).stats.movieScore }}</span>
          <span class="text-muted-xs">{{ $t('plan.historyModal.comp', { comp: (slot as PlanSlotEntry).stats.avgComp.toFixed(1) }) }}</span>
          <span v-if="(slot as PlanSlotEntry).releasedAt" class="chip-released-sm">{{ $t('plan.historyModal.released') }}</span>
        </li>
      </ul>
    </div>
  </Modal>
</template>

<style scoped>
@keyframes plan-slot-shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-3px); }
  30% { transform: translateX(3px); }
  45% { transform: translateX(-2px); }
  60% { transform: translateX(2px); }
  75% { transform: translateX(-1px); }
}
.plan-slot-generating {
  animation: plan-slot-shake 0.6s ease-in-out infinite;
}

</style>
