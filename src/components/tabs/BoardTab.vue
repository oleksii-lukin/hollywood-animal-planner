<script setup lang="ts">
import { ref, computed, nextTick, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCalculatorStore } from '@/stores/calculator'
import { useGameDataStore } from '@/stores/gameData'
import { calculateAudienceAffinity } from '@/utils/calculator'
import type { SavedScript, DemographicId } from '@/types/game'
import { getTagCategoryClasses } from '@/utils/tagCategoryColors'
import { PencilIcon } from '@heroicons/vue/24/outline'
import Card from '@/components/ui/Card.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import AdvertiserAnalysisModal from '@/components/AdvertiserAnalysisModal.vue'
import GeneratorPanel from '@/components/GeneratorPanel.vue'
import OurMoviesModal from '@/components/OurMoviesModal.vue'

const categoryOrder = ['Genre', 'Setting', 'Protagonist', 'Antagonist', 'Supporting Character', 'Theme & Event', 'Finale'] as const

function splitTagsByStartAndPlot(tags: SavedScript['tags']) {
  const start: SavedScript['tags'] = []
  const plot: SavedScript['tags'] = []
  for (const tag of tags) {
    if (tag.category === 'Setting' || tag.category === 'Genre') start.push(tag)
    else plot.push(tag)
  }
  start.sort((a, b) => (a.category === 'Setting' ? 0 : 1) - (b.category === 'Setting' ? 0 : 1))
  plot.sort((a, b) => categoryOrder.indexOf(a.category as typeof categoryOrder[number]) - categoryOrder.indexOf(b.category as typeof categoryOrder[number]))
  return { start, plot }
}

const { t } = useI18n()
const calculator = useCalculatorStore()
const gameData = useGameDataStore()

const emit = defineEmits<{
  openTab: [tab: 'generator' | 'synergy' | 'advertisers' | 'plan', options?: { pushState?: boolean }]
}>()

const runCompatibilityOnNextSynergy = inject<{ value: boolean }>('runCompatibilityOnNextSynergy')!
const runAnalyzeOnNextAdvertisers = inject<{ value: boolean }>('runAnalyzeOnNextAdvertisers')!

const searchQuery = ref('')
const sourceFilter = ref<'all' | 'generator' | 'import'>('all')
const statusFilter = ref<'all' | 'released' | 'pre_production' | 'backlog' | 'archived'>('all')
const sortBy = ref<'date' | 'score' | 'comp'>('date')
const sortOrder = ref<'asc' | 'desc'>('desc')
const expandedId = ref<string | null>(null)
const archiveConfirmId = ref<string | null>(null)
let archiveConfirmTimeout: ReturnType<typeof setTimeout> | null = null
const removeConfirmId = ref<string | null>(null)
const removeConfirmStep = ref(0)
const editingNameId = ref<string | null>(null)
const editingNameValue = ref('')
const editingNameInputRef = ref<HTMLInputElement | null>(null)
const showOurMoviesModal = ref(false)
const collapsedStages = ref<Set<string>>(new Set())

function toggleStage(key: string) {
  if (collapsedStages.value.has(key)) {
    collapsedStages.value.delete(key)
  } else {
    collapsedStages.value.add(key)
  }
}

function stageName(stage: number): string {
  const names: Record<number, string> = {
    0: t('ourMovies.stage0'),
    1: t('generator.stagePreProduction'),
    2: t('generator.stageProduction'),
    3: t('generator.stagePostProduction'),
    4: t('generator.stagePlannedRelease'),
  }
  return names[stage] ?? t('ourMovies.stage0')
}

const hasOurMovies = computed(() => (calculator.saveFileData?.ourMovies?.length ?? 0) > 0)

function startEditName(script: SavedScript) {
  editingNameId.value = script.uniqueId
  editingNameValue.value = script.name?.trim() || t('board.untitledScript')
  nextTick(() => editingNameInputRef.value?.focus())
}

function stopEditName(script: SavedScript, save: boolean) {
  if (editingNameId.value !== script.uniqueId) return
  if (save) {
    const name = editingNameValue.value.trim() || t('board.untitledScript')
    calculator.updateScriptName(script.uniqueId, name)
  }
  editingNameId.value = null
}

const filteredAndSortedScripts = computed(() => {
  let list = [...calculator.pinnedScripts]

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        s.tags.some((t) => (gameData.tags[t.id]?.name ?? t.id).toLowerCase().includes(q))
    )
  }

  if (sourceFilter.value !== 'all') {
    list = list.filter((s) => s.source === sourceFilter.value)
  }

  if (statusFilter.value === 'archived') {
    list = list.filter((s) => calculator.isScriptArchived(s.uniqueId))
  } else {
    list = list.filter((s) => !calculator.isScriptArchived(s.uniqueId))
    if (statusFilter.value !== 'all') {
      if (statusFilter.value === 'released') {
        list = list.filter((s) => calculator.isPinnedScriptReleased(s.uniqueId))
      } else if (statusFilter.value === 'pre_production') {
        list = list.filter((s) => calculator.isScriptInPlan(s.uniqueId) && !calculator.isPinnedScriptReleased(s.uniqueId))
      } else {
        list = list.filter((s) => !calculator.isScriptInPlan(s.uniqueId) && !calculator.isPinnedScriptReleased(s.uniqueId))
      }
    }
  }

  const order = sortOrder.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    if (sortBy.value === 'date') {
      return order * (new Date(a.pinnedAt).getTime() - new Date(b.pinnedAt).getTime())
    }
    if (sortBy.value === 'score') {
      return order * (parseFloat(a.stats.movieScore) - parseFloat(b.stats.movieScore))
    }
    return order * (a.stats.avgComp - b.stats.avgComp)
  })

  return list
})

const scriptsByStage = computed(() => {
  type ScriptGroup = { key: string; stage: number | null; scripts: SavedScript[] }
  const stageMap = new Map<number, SavedScript[]>()
  const inTheatres: SavedScript[] = []
  const other: SavedScript[] = []
  const movies = calculator.saveFileData?.ourMovies ?? []

  for (const script of filteredAndSortedScripts.value) {
    const movieId = calculator.getGameMovieIdForPinnedScript(script.uniqueId)
    if (movieId !== null) {
      const movie = movies.find(m => m.id === movieId)
      if (movie) {
        if (movie.currentStage === 4 && !!movie.actuallyReleased) {
          inTheatres.push(script)
          continue
        }
        const stage = movie.currentStage ?? 0
        if (!stageMap.has(stage)) stageMap.set(stage, [])
        stageMap.get(stage)!.push(script)
        continue
      }
    }
    other.push(script)
  }

  const groups: ScriptGroup[] = []
  const stageOrder = [0, 1, 2, 3, 4]
  for (const s of stageOrder) {
    if (stageMap.has(s) && stageMap.get(s)!.length > 0) {
      groups.push({ key: `stage-${s}`, stage: s, scripts: stageMap.get(s)! })
    }
  }
  if (inTheatres.length > 0) {
    groups.push({ key: 'inTheatres', stage: null, scripts: inTheatres })
  }
  if (stageMap.has(5) && stageMap.get(5)!.length > 0) {
    groups.push({ key: 'archived', stage: 5, scripts: stageMap.get(5)! })
  }
  if (other.length > 0) {
    groups.push({ key: 'other', stage: null, scripts: other })
  }

  return groups
})

function formatPinnedDate(iso: string): string {
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
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function formatPinnedDateFull(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
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

const analysisModalScript = ref<SavedScript | null>(null)

function openInSynergy(script: SavedScript) {
  calculator.clearTags('synergy')
  script.tags.forEach((t) => calculator.addTag('synergy', t))
  runCompatibilityOnNextSynergy.value = true
  nextTick(() => emit('openTab', 'synergy', { pushState: true }))
}

function openInAdvertisers(script: SavedScript) {
  calculator.clearTags('advertisers')
  script.tags.forEach((t) => calculator.addTag('advertisers', t))
  runAnalyzeOnNextAdvertisers.value = true
  nextTick(() => emit('openTab', 'advertisers', { pushState: true }))
}

function exportOne(script: SavedScript) {
  const blob = new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `script_${(script.name || 'untitled').replace(/\s+/g, '_')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const firstAvailablePlanSlotIndex = computed(() =>
  calculator.releasePlanSlots.findIndex((s) => s === null)
)

function addToFirstPlanSlot(script: SavedScript) {
  const idx = firstAvailablePlanSlotIndex.value
  if (idx >= 0 && !calculator.isScriptInPlan(script.uniqueId) && !calculator.isPinnedScriptReleased(script.uniqueId)) {
    calculator.setPlanSlotFromBoard(idx, script)
    expandedId.value = null
  }
}

function onArchiveClick(script: SavedScript) {
  if (archiveConfirmId.value === script.uniqueId) {
    if (archiveConfirmTimeout) clearTimeout(archiveConfirmTimeout)
    archiveConfirmTimeout = null
    archiveConfirmId.value = null
    calculator.archiveFromBacklog(script.uniqueId)
    expandedId.value = null
  } else {
    if (archiveConfirmTimeout) clearTimeout(archiveConfirmTimeout)
    archiveConfirmId.value = script.uniqueId
    archiveConfirmTimeout = setTimeout(() => {
      archiveConfirmId.value = null
      archiveConfirmTimeout = null
    }, 3000)
  }
}

function onRemoveFromBacklogClick(script: SavedScript) {
  if (removeConfirmId.value !== script.uniqueId) {
    removeConfirmId.value = script.uniqueId
    removeConfirmStep.value = 1
    return
  }
  if (removeConfirmStep.value < 2) {
    removeConfirmStep.value += 1
    return
  }
  calculator.unpinScript(script.uniqueId)
  expandedId.value = null
  removeConfirmId.value = null
  removeConfirmStep.value = 0
}
</script>

<template>
  <div class="board__layout">
    <!-- Left: Generator -->
    <div class="board__scroll">
      <GeneratorPanel />
    </div>

    <!-- Right: Saved scripts -->
    <div class="board__list-wrap">
      <Card>
        <div class="board__toolbar">
          <CardHeader :title="$t('board.backlog')" />
          <button
            v-if="hasOurMovies"
            type="button"
            class="board__btn-accent-xs"
            @click="showOurMoviesModal = true"
          >
            {{ $t('board.ourMovies', { count: calculator.saveFileData?.ourMovies?.length ?? 0 }) }}
          </button>
        </div>
        <p class="board__intro">
          {{ $t('board.intro') }}
        </p>

        <!-- Filters -->
        <div class="board__toolbar-row">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="$t('board.searchPlaceholder')"
            class="board__input-search"
          >
          <select
            v-model="statusFilter"
            class="board__filter-select"
          >
            <option value="all">{{ $t('board.filter.allStatuses') }}</option>
            <option value="released">{{ $t('board.filter.released') }}</option>
            <option value="pre_production">{{ $t('board.filter.preProduction') }}</option>
            <option value="backlog">{{ $t('board.filter.backlog') }}</option>
            <option value="archived">{{ $t('board.filter.archived') }}</option>
          </select>
          <select
            v-model="sourceFilter"
            class="board__filter-select"
          >
            <option value="all">{{ $t('board.filter.allSources') }}</option>
            <option value="generator">{{ $t('board.filter.generator') }}</option>
            <option value="import">{{ $t('board.filter.import') }}</option>
          </select>
          <select
            v-model="sortBy"
            class="board__filter-select"
          >
            <option value="date">{{ $t('board.sort.date') }}</option>
            <option value="score">{{ $t('board.sort.score') }}</option>
            <option value="comp">{{ $t('board.sort.compatibility') }}</option>
          </select>
          <button
            type="button"
            class="board__filter-btn"
            @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
          >
            {{ sortOrder === 'desc' ? $t('board.sort.desc') : $t('board.sort.asc') }}
          </button>
        </div>
      </Card>

      <!-- List -->
      <div v-if="filteredAndSortedScripts.length === 0" class="board__empty">
        <template v-if="calculator.pinnedScripts.length === 0">
          {{ $t('board.empty.noScripts') }}
        </template>
        <template v-else-if="statusFilter === 'archived'">
          {{ $t('board.empty.noArchived') }}
        </template>
        <template v-else>
          {{ $t('board.empty.noMatch') }}
        </template>
      </div>

      <div v-else class="space-y-3">
        <div class="label-section-muted">
          {{ t('board.scriptCount', filteredAndSortedScripts.length) }}
        </div>
      <div class="board__grid">
        <template v-for="group in scriptsByStage" :key="group.key">
          <div class="board__stage-header" @click="toggleStage(group.key)">
            <span class="board__stage-arrow" :class="collapsedStages.has(group.key) ? '-rotate-90' : 'rotate-0'">▶</span>
            <span class="board__stage-label">
              <template v-if="group.key === 'archived'">{{ $t('ourMovies.archived') }}</template>
              <template v-else-if="group.key === 'inTheatres'">{{ $t('ourMovies.inTheatres') }}</template>
              <template v-else-if="group.stage !== null">{{ stageName(group.stage) }}</template>
              <template v-else>{{ $t('board.otherScripts') }}</template>
            </span>
            <span class="board__stage-count">({{ group.scripts.length }})</span>
          </div>
          <template v-if="!collapsedStages.has(group.key)">
            <div
              v-for="script in group.scripts"
              :key="script.uniqueId"
              class="board__card"
              :class="{ 'card-just-pinned': calculator.lastPinnedScriptId === script.uniqueId }"
            >
          <!-- Compact row: name, date, source, stats, tags preview, advertiser summary -->
          <div
            class="script-row"
            @click="expandedId = expandedId === script.uniqueId ? null : script.uniqueId; archiveConfirmId = null; removeConfirmId = null"
          >
            <div class="script-card__name-row">
              <template v-if="editingNameId === script.uniqueId">
                <input
                  v-model="editingNameValue"
                  type="text"
                  class="board__name-edit"
                  @blur="stopEditName(script, true)"
                  @keydown.enter="stopEditName(script, true)"
                  @keydown.escape="stopEditName(script, false)"
                  @click.stop
                >
              </template>
              <template v-else>
                <span class="script-card__name">{{ script.name || $t('board.untitledScript') }}</span>
                <span
                  v-if="calculator.getGameMovieIdForPinnedScript(script.uniqueId) !== null"
                  class="board__chip-generator"
                  :title="$t('board.gameChipTooltip', { id: calculator.getGameMovieIdForPinnedScript(script.uniqueId) })"
                >
                  {{ $t('board.gameChip') }}
                </span>
                <button
                  type="button"
                  class="icon-btn-ghost-sm"
                  :title="$t('board.rename')"
                  @click.stop="startEditName(script)"
                >
                  <PencilIcon class="icon-size-sm" />
                </button>
              </template>
              <span class="board__meta-date" :title="formatPinnedDateFull(script.pinnedAt)">{{ formatPinnedDate(script.pinnedAt) }}</span>
              <span
                class="board__source-chip"
                :class="script.source === 'generator' ? 'bg-accent/20 text-accent' : 'bg-text-muted/20 text-text-muted'"
              >
                {{ script.source === 'generator' ? $t('board.source.generator') : $t('board.source.import') }}
              </span>
              <span
                v-if="calculator.isScriptInPlan(script.uniqueId)"
                class="board__chip-in-plan"
                :title="$t('board.inPlanTooltip')"
              >
                {{ $t('board.inPlan') }}
              </span>
              <span
                v-if="calculator.isPinnedScriptReleased(script.uniqueId)"
                class="board__chip-released"
                :title="$t('board.releasedTooltip')"
              >
                {{ $t('board.released') }}
              </span>
            </div>
            <div class="board__actions">
              <button
                v-if="!calculator.isScriptInPlan(script.uniqueId) && !calculator.isPinnedScriptReleased(script.uniqueId) && firstAvailablePlanSlotIndex >= 0"
                type="button"
                class="board__btn-add"
                :title="$t('board.toPlanTooltip', { idx: firstAvailablePlanSlotIndex + 1 })"
                @click.stop="addToFirstPlanSlot(script)"
              >
                {{ $t('board.toPlan') }}
              </button>
              <button
                v-if="calculator.isScriptArchived(script.uniqueId)"
                type="button"
                class="board__btn-add"
                :title="$t('board.restoreTooltip')"
                @click.stop="calculator.unarchiveFromBacklog(script.uniqueId)"
              >
                {{ $t('board.restore') }}
              </button>
              <button
                v-else
                type="button"
                class="board__archive-btn"
                :class="archiveConfirmId === script.uniqueId ? 'border-danger text-danger bg-danger/15 hover:bg-danger/25' : 'border-border text-text-muted hover:border-accent hover:text-accent'"
                :title="archiveConfirmId === script.uniqueId ? $t('board.archiveTooltipConfirm') : $t('board.archiveTooltip')"
                @click.stop="onArchiveClick(script)"
              >
                {{ archiveConfirmId === script.uniqueId ? $t('board.archiveConfirm') : $t('board.archive') }}
              </button>
              <span class="board__score">{{ script.stats.movieScore }}</span>
              <span class="board__comp">{{ $t('board.comp', { comp: script.stats.avgComp.toFixed(2) }) }}</span>
            </div>
          </div>
          <!-- When collapsed only: date/save + tag preview + audience (hidden when expanded to avoid duplicate) -->
          <div v-show="expandedId !== script.uniqueId" class="space-y-1">
            <div class="info-row">
              <span>{{ $t('board.added', { date: formatPinnedDateFull(script.pinnedAt) }) }}</span>
              <span v-if="script.saveFileName" class="text-success/90">{{ $t('board.save', { fileName: script.saveFileName }) }}</span>
            </div>
            <template v-if="splitTagsByStartAndPlot(script.tags).start.length || splitTagsByStartAndPlot(script.tags).plot.length">
              <div class="board__meta-block">
                <span class="board__meta-label">{{ $t('board.settingGenres') }}</span>
                <span
                  v-for="tag in splitTagsByStartAndPlot(script.tags).start"
                  :key="tag.id"
                  class="board__tag-chip"
                  :class="getTagCategoryClasses(tag.category, tag.id)"
                >
                  {{ gameData.tags[tag.id]?.name ?? tag.id }}
                </span>
              </div>
              <div class="board__meta-block board__meta-block--pb2">
                <span class="board__meta-label">{{ $t('board.plot') }}</span>
                <template v-for="tag in splitTagsByStartAndPlot(script.tags).plot.slice(0, 6)" :key="tag.id">
                  <span class="board__tag-chip" :class="getTagCategoryClasses(tag.category, tag.id)">
                    {{ gameData.tags[tag.id]?.name ?? tag.id }}
                  </span>
                </template>
                <span v-if="splitTagsByStartAndPlot(script.tags).plot.length > 6" class="board__tag-more">+{{ splitTagsByStartAndPlot(script.tags).plot.length - 6 }}</span>
              </div>
            </template>
            <div v-if="getAdvertiserSummary(script.tags)" class="info-row-bottom">
              <span>{{ $t('board.audience', { names: getAdvertiserSummary(script.tags)!.targetAudiences.map((a) => a.name).join(', ') }) }}</span>
              <span v-if="getAdvertiserSummary(script.tags)!.bestHoliday">{{ $t('board.best', { name: getAdvertiserSummary(script.tags)!.bestHoliday!.name }) }}</span>
            </div>
          </div>

          <!-- Expanded: only here show full tags (Start vs Plot) + advertiser + actions -->
          <div v-show="expandedId === script.uniqueId" class="board__expanded">
            <div class="board__expanded-grid">
              <div class="space-y-3">
                <div v-if="splitTagsByStartAndPlot(script.tags).start.length > 0">
                  <h4 class="section-title-sm">{{ $t('board.settingGenres') }}</h4>
                  <div class="chips-row">
                    <span
                      v-for="tag in splitTagsByStartAndPlot(script.tags).start"
                      :key="tag.id"
                      class="board__tag-chip"
                      :class="getTagCategoryClasses(tag.category, tag.id)"
                    >
                      {{ gameData.tags[tag.id]?.name ?? tag.id }}
                    </span>
                  </div>
                </div>
                <div v-if="splitTagsByStartAndPlot(script.tags).plot.length > 0">
                  <h4 class="section-title-sm">{{ $t('board.plotElements') }}</h4>
                  <div class="chips-row">
                    <span
                      v-for="tag in splitTagsByStartAndPlot(script.tags).plot"
                      :key="tag.id"
                      class="board__tag-chip"
                      :class="getTagCategoryClasses(tag.category, tag.id)"
                    >
                      {{ gameData.tags[tag.id]?.name ?? tag.id }}
                    </span>
                  </div>
                </div>
              </div>
              <div v-if="getAdvertiserSummary(script.tags)" class="board__advertiser-sidebar">
                <h4 class="section-title-sm">{{ $t('board.advertiser') }}</h4>
                <p class="board__advertiser-hint">
                  {{ $t('board.audience', { names: getAdvertiserSummary(script.tags)!.targetAudiences.map((a) => a.name).join(', ') }) }}
                  <span v-if="getAdvertiserSummary(script.tags)!.bestHoliday"> · {{ $t('board.best', { name: getAdvertiserSummary(script.tags)!.bestHoliday!.name }) }}</span>
                </p>
                <button
                  type="button"
                  class="board__advertiser-btn"
                  @click="analysisModalScript = script"
                >
                  {{ $t('board.fullAnalysis') }}
                </button>
              </div>
            </div>
            <div class="board__actions-bar">
              <button
                v-if="!calculator.isScriptInPlan(script.uniqueId) && !calculator.isPinnedScriptReleased(script.uniqueId) && firstAvailablePlanSlotIndex >= 0"
                type="button"
                class="btn-success-outline-xs"
                :title="$t('board.toPlanTooltip', { idx: firstAvailablePlanSlotIndex + 1 })"
                @click="addToFirstPlanSlot(script)"
              >
                {{ $t('board.toPlan') }}
              </button>
              <button
                type="button"
                class="btn-accent-outline-xs"
                @click="openInSynergy(script)"
              >
                {{ $t('board.openInSynergy') }}
              </button>
              <button
                type="button"
                class="btn-accent-outline-xs"
                @click="openInAdvertisers(script)"
              >
                {{ $t('board.openInAdvertisers') }}
              </button>
              <button
                type="button"
                class="board__btn-ghost-sm"
                @click="exportOne(script)"
              >
                {{ $t('board.exportJson') }}
              </button>
              <button
                type="button"
                class="board__remove-btn"
                :class="removeConfirmId === script.uniqueId ? 'border-danger text-danger bg-danger/15 hover:bg-danger/25' : 'border-danger text-danger hover:bg-danger/10'"
                :title="removeConfirmId === script.uniqueId ? (removeConfirmStep === 1 ? $t('board.removeTooltipClickAgain') : $t('board.removeTooltipFinal')) : $t('board.removeTooltip')"
                @click="onRemoveFromBacklogClick(script)"
              >
                {{
                  removeConfirmId !== script.uniqueId
                    ? $t('board.removeFromBacklog')
                    : removeConfirmStep === 1
                      ? $t('board.sure')
                      : $t('board.reallyRemove')
                }}
              </button>
            </div>
          </div>
            </div>
          </template>
        </template>
      </div>
      </div>
      <AdvertiserAnalysisModal
        :open="!!analysisModalScript"
        :tags="analysisModalScript?.tags ?? []"
        @close="analysisModalScript = null"
      />
      <OurMoviesModal
        :open="showOurMoviesModal"
        :movies="calculator.saveFileData?.ourMovies"
        @close="showOurMoviesModal = false"
      />
    </div>
  </div>
</template>

<style scoped>
.board__stage-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 6px 0;
  border-bottom: 1px solid var(--color-border);
  margin-top: 8px;
}
.board__stage-header:hover {
  opacity: 0.8;
}
.board__stage-arrow {
  font-size: 10px;
  transition: transform 0.2s ease;
}
.board__stage-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-accent, #b8860b);
}
.board__stage-count {
  font-size: 11px;
  color: var(--color-text-muted);
}
.board-list-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.board-list-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
</style>
