<script setup lang="ts">
import { ref, computed, nextTick, inject } from 'vue'
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

const hasOurMovies = computed(() => (calculator.saveFileData?.ourMovies?.length ?? 0) > 0)

function startEditName(script: SavedScript) {
  editingNameId.value = script.uniqueId
  editingNameValue.value = script.name?.trim() || 'Untitled Script'
  nextTick(() => editingNameInputRef.value?.focus())
}

function stopEditName(script: SavedScript, save: boolean) {
  if (editingNameId.value !== script.uniqueId) return
  if (save) {
    const name = editingNameValue.value.trim() || 'Untitled Script'
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
          <CardHeader title="Backlog" />
          <button
            v-if="hasOurMovies"
            type="button"
            class="board__btn-accent-xs"
            @click="showOurMoviesModal = true"
          >
            Our movies ({{ calculator.saveFileData?.ourMovies?.length ?? 0 }}) from save
          </button>
        </div>
        <p class="board__intro">
          Filter, sort, and open in Synergy or Advertisers.
        </p>

        <!-- Filters -->
        <div class="board__toolbar-row">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by name or tag..."
            class="board__input-search"
          >
          <select
            v-model="statusFilter"
            class="board__filter-select"
          >
            <option value="all">All statuses</option>
            <option value="released">Released</option>
            <option value="pre_production">Pre-production</option>
            <option value="backlog">Backlog</option>
            <option value="archived">Archived</option>
          </select>
          <select
            v-model="sourceFilter"
            class="board__filter-select"
          >
            <option value="all">All sources</option>
            <option value="generator">Generator</option>
            <option value="import">Import</option>
          </select>
          <select
            v-model="sortBy"
            class="board__filter-select"
          >
            <option value="date">Date</option>
            <option value="score">Score</option>
            <option value="comp">Compatibility</option>
          </select>
          <button
            type="button"
            class="board__filter-btn"
            @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
          >
            {{ sortOrder === 'desc' ? '↓ Desc' : '↑ Asc' }}
          </button>
        </div>
      </Card>

      <!-- List -->
    <div v-if="filteredAndSortedScripts.length === 0" class="board__empty">
      <template v-if="calculator.pinnedScripts.length === 0">
        No scripts in backlog yet. Generate on the left and add the ones you like to the backlog.
      </template>
      <template v-else-if="statusFilter === 'archived'">
        No archived scripts. Archive scripts from the main list to see them here.
      </template>
      <template v-else>
        No scripts match the current filters.
      </template>
    </div>

    <div v-else class="space-y-3">
      <div class="label-section-muted">
        {{ filteredAndSortedScripts.length }} script{{ filteredAndSortedScripts.length === 1 ? '' : 's' }}
      </div>
      <transition-group name="board-list" tag="div" class="board__grid">
        <div
          v-for="script in filteredAndSortedScripts"
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
                <span class="script-card__name">{{ script.name || 'Untitled Script' }}</span>
                <span
                  v-if="calculator.getGameMovieIdForPinnedScript(script.uniqueId) !== null"
                  class="board__chip-generator"
                  :title="'Linked to game movie #' + calculator.getGameMovieIdForPinnedScript(script.uniqueId)"
                >
                  Game
                </span>
                <button
                  type="button"
                  class="icon-btn-ghost-sm"
                  title="Rename"
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
                {{ script.source === 'generator' ? 'Generator' : 'Import' }}
              </span>
              <span
                v-if="calculator.isScriptInPlan(script.uniqueId)"
                class="board__chip-in-plan"
                title="In release plan"
              >
                In plan
              </span>
              <span
                v-if="calculator.isPinnedScriptReleased(script.uniqueId)"
                class="board__chip-released"
                title="Was released (completed plan)"
              >
                Released
              </span>
            </div>
            <div class="board__actions">
              <button
                v-if="!calculator.isScriptInPlan(script.uniqueId) && !calculator.isPinnedScriptReleased(script.uniqueId) && firstAvailablePlanSlotIndex >= 0"
                type="button"
                class="board__btn-add"
                :title="'Add to Release Plan (slot ' + (firstAvailablePlanSlotIndex + 1) + ')'"
                @click.stop="addToFirstPlanSlot(script)"
              >
                To Plan
              </button>
              <button
                v-if="calculator.isScriptArchived(script.uniqueId)"
                type="button"
                class="board__btn-add"
                title="Restore to backlog"
                @click.stop="calculator.unarchiveFromBacklog(script.uniqueId)"
              >
                Restore
              </button>
              <button
                v-else
                type="button"
                class="board__archive-btn"
                :class="archiveConfirmId === script.uniqueId ? 'border-danger text-danger bg-danger/15 hover:bg-danger/25' : 'border-border text-text-muted hover:border-accent hover:text-accent'"
                :title="archiveConfirmId === script.uniqueId ? 'Click again to archive' : 'Archive (hide from default view)'"
                @click.stop="onArchiveClick(script)"
              >
                {{ archiveConfirmId === script.uniqueId ? 'Confirm?' : 'Archive' }}
              </button>
              <span class="board__score">{{ script.stats.movieScore }}</span>
              <span class="board__comp">{{ script.stats.avgComp.toFixed(2) }} comp</span>
            </div>
          </div>
          <!-- When collapsed only: date/save + tag preview + audience (hidden when expanded to avoid duplicate) -->
          <div v-show="expandedId !== script.uniqueId" class="space-y-1">
            <div class="info-row">
              <span>Added: {{ formatPinnedDateFull(script.pinnedAt) }}</span>
              <span v-if="script.saveFileName" class="text-success/90">Save: {{ script.saveFileName }}</span>
            </div>
            <template v-if="splitTagsByStartAndPlot(script.tags).start.length || splitTagsByStartAndPlot(script.tags).plot.length">
              <div class="board__meta-block">
                <span class="board__meta-label">Setting & Genres</span>
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
                <span class="board__meta-label">Plot</span>
                <template v-for="tag in splitTagsByStartAndPlot(script.tags).plot.slice(0, 6)" :key="tag.id">
                  <span class="board__tag-chip" :class="getTagCategoryClasses(tag.category, tag.id)">
                    {{ gameData.tags[tag.id]?.name ?? tag.id }}
                  </span>
                </template>
                <span v-if="splitTagsByStartAndPlot(script.tags).plot.length > 6" class="board__tag-more">+{{ splitTagsByStartAndPlot(script.tags).plot.length - 6 }}</span>
              </div>
            </template>
            <div v-if="getAdvertiserSummary(script.tags)" class="info-row-bottom">
              <span>Audience: {{ getAdvertiserSummary(script.tags)!.targetAudiences.map((a) => a.name).join(', ') }}</span>
              <span v-if="getAdvertiserSummary(script.tags)!.bestHoliday">Best: {{ getAdvertiserSummary(script.tags)!.bestHoliday!.name }}</span>
            </div>
          </div>

          <!-- Expanded: only here show full tags (Start vs Plot) + advertiser + actions -->
          <div v-show="expandedId === script.uniqueId" class="board__expanded">
            <div class="board__expanded-grid">
              <div class="space-y-3">
                <div v-if="splitTagsByStartAndPlot(script.tags).start.length > 0">
                  <h4 class="section-title-sm">Setting & Genres</h4>
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
                  <h4 class="section-title-sm">Plot elements</h4>
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
                <h4 class="section-title-sm">Advertiser</h4>
                <p class="board__advertiser-hint">
                  Audience: {{ getAdvertiserSummary(script.tags)!.targetAudiences.map((a) => a.name).join(', ') }}
                  <span v-if="getAdvertiserSummary(script.tags)!.bestHoliday"> · Best: {{ getAdvertiserSummary(script.tags)!.bestHoliday!.name }}</span>
                </p>
                <button
                  type="button"
                  class="board__advertiser-btn"
                  @click="analysisModalScript = script"
                >
                  Full Analysis →
                </button>
              </div>
            </div>
            <div class="board__actions-bar">
              <button
                v-if="!calculator.isScriptInPlan(script.uniqueId) && !calculator.isPinnedScriptReleased(script.uniqueId) && firstAvailablePlanSlotIndex >= 0"
                type="button"
                class="btn-success-outline-xs"
                :title="'Add to Release Plan (slot ' + (firstAvailablePlanSlotIndex + 1) + ')'"
                @click="addToFirstPlanSlot(script)"
              >
                To Plan
              </button>
              <button
                type="button"
                class="btn-accent-outline-xs"
                @click="openInSynergy(script)"
              >
                Open in Synergy →
              </button>
              <button
                type="button"
                class="btn-accent-outline-xs"
                @click="openInAdvertisers(script)"
              >
                Open in Advertisers →
              </button>
              <button
                type="button"
                class="board__btn-ghost-sm"
                @click="exportOne(script)"
              >
                Export JSON
              </button>
              <button
                type="button"
                class="board__remove-btn"
                :class="removeConfirmId === script.uniqueId ? 'border-danger text-danger bg-danger/15 hover:bg-danger/25' : 'border-danger text-danger hover:bg-danger/10'"
                :title="removeConfirmId === script.uniqueId ? (removeConfirmStep === 1 ? 'Click again' : 'Click once more to remove permanently') : 'Remove from backlog (3 clicks to confirm)'"
                @click="onRemoveFromBacklogClick(script)"
              >
                {{
                  removeConfirmId !== script.uniqueId
                    ? 'Remove from backlog'
                    : removeConfirmStep === 1
                      ? 'Sure?'
                      : 'Really remove?'
                }}
              </button>
            </div>
          </div>
        </div>
      </transition-group>
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
.board-list-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.board-list-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
</style>
