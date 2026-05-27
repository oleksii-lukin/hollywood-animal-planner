<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'
import { useGameDataStore } from '@/stores/gameData'
import { calculateAudienceAffinity } from '@/utils/calculator'
import type { GeneratedScript, SavedScript, DemographicId } from '@/types/game'
import { getTagCategoryClasses } from '@/utils/tagCategoryColors'
import AdvertiserAnalysisModal from '@/components/AdvertiserAnalysisModal.vue'

const props = withDefaults(defineProps<{
  script: GeneratedScript
  isPinnedSection: boolean
  compact?: boolean
  coloredTags?: boolean
}>(), {
  coloredTags: true
})

function getTagClasses(tag: { id: string; category: string }): string {
  if (isLockedTag(tag.id)) {
    return 'border-accent text-accent bg-accent/10'
  }
  if (props.coloredTags) {
    const classes = getTagCategoryClasses(tag.category, tag.id)
    if (classes) return classes
  }
  return 'border-transparent bg-border text-text'
}

const calculator = useCalculatorStore()
const gameData = useGameDataStore()

const isExpanded = ref(true)
const showAnalysisModal = ref(false)

const isPinned = computed(() => 
  calculator.pinnedScripts.some(s => s.uniqueId === props.script.uniqueId)
)

const compClass = computed(() => {
  if (props.script.stats.avgComp >= 4.0) return 'text-success'
  if (props.script.stats.avgComp >= 3.0) return 'text-accent'
  return 'text-danger'
})

const sortedTags = computed(() => {
  const categoryOrder = ['Genre', 'Setting', 'Protagonist', 'Antagonist', 'Supporting Character', 'Theme & Event', 'Finale']
  return [...props.script.tags].sort((a, b) => {
    const idxA = categoryOrder.indexOf(a.category)
    const idxB = categoryOrder.indexOf(b.category)
    return idxA - idxB
  })
})

const advertiserInfo = computed(() => {
  if (props.script.tags.length === 0) return null

  const affinity = calculateAudienceAffinity(props.script.tags)
  
  let totalSum = 0
  for (const demo in affinity) {
    totalSum += affinity[demo as DemographicId]
  }

  const RELEASE_MAGIC = 3.0
  const baselineScores: Record<DemographicId, number> = {} as Record<DemographicId, number>
  for (const demo in affinity) {
    if (totalSum === 0) {
      baselineScores[demo as DemographicId] = 0
    } else {
      const normalized = (affinity[demo as DemographicId] / totalSum) * RELEASE_MAGIC
      baselineScores[demo as DemographicId] = Math.min(1.0, Math.max(0, normalized))
    }
  }

  const THRESHOLD_GOOD = 0.67
  const THRESHOLD_BAD = 0.33

  const demoGrades: Array<{ id: DemographicId; name: string; score: number }> = []
  for (const [id, demo] of Object.entries(gameData.demographics)) {
    demoGrades.push({
      id: id as DemographicId,
      name: demo.name,
      score: baselineScores[id as DemographicId]
    })
  }

  const targetAudiences = demoGrades.filter(d => d.score > THRESHOLD_BAD).sort((a, b) => b.score - a.score)
  const highInterest = demoGrades.filter(d => d.score >= THRESHOLD_GOOD).map(d => d.id)
  const moderateInterest = demoGrades.filter(d => d.score > THRESHOLD_BAD && d.score < THRESHOLD_GOOD).map(d => d.id)

  let movieLean: 'Balanced' | 'Artistic' | 'Commercial' = 'Balanced'
  let movieLeanType = 0
  if (calculator.artisticScore > calculator.commercialScore + 0.1) {
    movieLean = 'Artistic'
    movieLeanType = 1
  } else if (calculator.commercialScore > calculator.artisticScore + 0.1) {
    movieLean = 'Commercial'
    movieLeanType = 2
  }

  const validTargetIds = targetAudiences.map(t => t.id)
  let recommendedAgents: Array<{ name: string; type: string }> = []
  
  if (validTargetIds.length > 0) {
    const validAgents = gameData.adAgents
      .filter(agent => agent.targets.some(t => validTargetIds.includes(t)))
      .map(agent => {
        let score = 0
        for (const targetId of validTargetIds) {
          if (agent.targets.includes(targetId)) {
            score += 5
          }
        }
        if (agent.type !== 0 && agent.type !== movieLeanType) {
          score -= 10
        }
        score += agent.level
        return {
          ...agent,
          score,
          typeLabel: agent.type === 0 ? 'Univ.' : agent.type === 1 ? 'Art' : 'Com'
        }
      })
      .filter(a => a.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (b.level !== a.level) return b.level - a.level
        return a.name.localeCompare(b.name)
      })
      .slice(0, 3)

    recommendedAgents = validAgents.map(a => ({
      name: a.name,
      type: a.typeLabel
    }))
  }

  const primaryTargets = highInterest.length > 0 ? highInterest : moderateInterest
  const bestHoliday = gameData.holidays
    .map(h => {
      let totalScore = 0
      for (const id of primaryTargets) {
        const bonus = h.bonuses[id] || 0
        if (bonus > 0) totalScore += bonus
      }
      return { name: h.name, totalScore }
    })
    .filter(h => h.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore)[0] || null

  return {
    targetAudiences,
    movieLean,
    recommendedAgents,
    bestHoliday
  }
})

function togglePin() {
  if (isPinned.value) {
    calculator.unpinScript(props.script.uniqueId)
  } else {
    calculator.pinScript(props.script)
  }
}

function updateName(e: Event) {
  const value = (e.target as HTMLInputElement).value
  calculator.updateScriptName(props.script.uniqueId, value)
}

function openAnalysis() {
  showAnalysisModal.value = true
}

function isLockedTag(tagId: string): boolean {
  return calculator.generatorLockedTags.some(t => t.id === tagId)
}

const savedMeta = computed(() => {
  const s = props.script as SavedScript
  if (!('pinnedAt' in s) || typeof s.pinnedAt !== 'string') return null
  const date = new Date(s.pinnedAt)
  const added = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return { added, saveFileName: s.saveFileName }
})
</script>

<template>
  <!-- Compact version for generated options -->
  <div 
    v-if="compact"
    class="script-card__wrap script-card__wrap--accent"
  >
    <div class="p-2">
      <!-- Stats row -->
      <div class="script-card__toolbar">
        <div class="script-card__toolbar-left">
          <span class="script-card__score">{{ script.stats.movieScore }}</span>
          <span class="script-card__comp-compact" :class="compClass">{{ script.stats.avgComp.toFixed(2) }}</span>
        </div>
        <button
          type="button"
          @click.stop="togglePin"
          class="script-card__pin-chip"
          :class="isPinned ? 'border-success text-success bg-success/10' : 'border-border text-text-muted hover:border-accent hover:text-accent'"
          :title="isPinned ? $t('scriptCard.inBacklogTooltip') : $t('scriptCard.addBacklogTooltip')"
        >
          {{ isPinned ? $t('scriptCard.inBacklog') : $t('scriptCard.addBacklog') }}
        </button>
      </div>
      
      <!-- Tags -->
      <div class="script-card__tags-wrap">
        <span
          v-for="tag in sortedTags"
          :key="tag.id"
          class="script-card__tag-chip"
          :class="getTagClasses(tag)"
        >
          {{ gameData.tags[tag.id]?.name || tag.id }}
        </span>
      </div>
    </div>

    <!-- Actions -->
    <div class="script-card__footer">
      <button
        @click.stop="openAnalysis"
        class="script-card__action-accent"
      >
        {{ $t('scriptCard.advertisers') }}
      </button>
    </div>

    <AdvertiserAnalysisModal 
      :open="showAnalysisModal" 
      :tags="script.tags"
      @close="showAnalysisModal = false"
    />
  </div>

  <!-- Full version for backlog scripts -->
  <div 
    v-else
    class="script-card__wrap script-card__wrap--muted"
  >
    <!-- Header -->
    <div
      class="card-header-row"
      @click="isExpanded = !isExpanded"
    >
      <div class="script-card__title-wrap">
        <!-- Editable name for backlog -->
          <input
          v-if="isPinnedSection"
          type="text"
          :value="script.name || $t('scriptCard.untitledScript')"
          @input="updateName"
          @click.stop
          class="input-inline-edit"
          :placeholder="$t('scriptCard.scriptName')"
        >
        
        <!-- Stats badges (same order as compact: Score, Comp, Qual) -->
        <div class="script-card__stats-row">
          <div class="script-card__stat-item">
            <span class="script-card__stat-label">{{ $t('scriptCard.score') }}</span>
            <span class="script-card__score-value">
              {{ script.stats.movieScore }}
            </span>
          </div>
          <div class="script-card__stat-item">
            <span class="script-card__stat-label">{{ $t('scriptCard.comp') }}</span>
            <span class="script-card__comp-value" :class="compClass">
              {{ script.stats.avgComp.toFixed(1) }}
            </span>
          </div>
          <div class="script-card__stat-item">
            <span class="script-card__stat-label">{{ $t('scriptCard.qual') }}</span>
            <span class="script-card__score-value">
              {{ script.stats.maxScriptQuality }}
            </span>
          </div>
        </div>
        <div v-if="savedMeta" class="meta-row">
          <span>{{ $t('scriptCard.added', { date: savedMeta.added }) }}</span>
          <span v-if="savedMeta.saveFileName" class="text-success/90">{{ $t('scriptCard.save', { fileName: savedMeta.saveFileName }) }}</span>
        </div>
      </div>

      <!-- Backlog button -->
      <button
        type="button"
        @click.stop="togglePin"
        class="chip-source"
        :class="isPinned ? 'border-success text-success bg-success/10 hover:bg-success/20' : 'border-border text-text-muted hover:border-accent hover:text-accent'"
        :title="isPinned ? $t('scriptCard.inBacklogTooltip') : $t('scriptCard.addBacklogTooltip')"
      >
        {{ isPinned ? $t('scriptCard.inBacklog') : $t('scriptCard.addBacklog') }}
      </button>
    </div>

    <!-- Expanded details -->
    <div v-if="isExpanded" class="script-card__expand-body">
      <!-- Two-column layout -->
      <div class="script-card__expand-grid">
        <!-- Left: Tags -->
        <div>
          <h4 class="section-title-sm">{{ $t('scriptCard.tags') }}</h4>
          <div class="chips-row">
            <span
              v-for="tag in sortedTags"
              :key="tag.id"
              class="chip-sm"
              :class="getTagClasses(tag)"
            >
              {{ gameData.tags[tag.id]?.name || tag.id }}
            </span>
          </div>
        </div>

        <!-- Right: Advertiser Info -->
        <div v-if="advertiserInfo" class="script-card__sidebar">
          <h4 class="section-title-sm">{{ $t('scriptCard.advertiserInfo') }}</h4>
          
          <div class="space-y-2">
            <!-- Target Audiences -->
            <div>
              <span class="script-card__sidebar-label">{{ $t('scriptCard.audience') }}</span>
              <div v-if="advertiserInfo.targetAudiences.length > 0" class="chips-row-05">
                <span
                  v-for="audience in advertiserInfo.targetAudiences"
                  :key="audience.id"
                  class="script-card__audience-chip"
                  :class="audience.score >= 0.67
                    ? 'border-success bg-success/10 text-success'
                    : 'border-moderate/50 bg-moderate/10 text-moderate'"
                >
                  {{ audience.name }}
                </span>
              </div>
              <span v-else class="script-card__none">{{ $t('scriptCard.none') }}</span>
            </div>

            <!-- Best Holiday & Movie Lean & Advertisers inline -->
            <div class="script-card__meta-row">
              <div>
                <span class="text-text-muted">{{ $t('scriptCard.holiday') }}</span>
                <span v-if="advertiserInfo.bestHoliday" class="text-accent ml-1">{{ advertiserInfo.bestHoliday.name }}</span>
                <span v-else class="text-text-muted/50 ml-1">-</span>
              </div>
              <div>
                <span class="text-text-muted">{{ $t('scriptCard.lean') }}</span>
                <span 
                  class="script-card__value-inline"
                  :class="{
                    'text-art': advertiserInfo.movieLean === 'Artistic',
                    'text-accent': advertiserInfo.movieLean === 'Commercial',
                    'text-text': advertiserInfo.movieLean === 'Balanced'
                  }"
                >{{ advertiserInfo.movieLean }}</span>
              </div>
            </div>

            <!-- Recommended Advertisers -->
            <div v-if="advertiserInfo.recommendedAgents.length > 0">
              <span class="script-card__sidebar-label-sm">{{ $t('scriptCard.advertisersLabel') }}</span>
              <div class="chips-row">
                <span
                  v-for="agent in advertiserInfo.recommendedAgents"
                  :key="agent.name"
                  class="script-card__mini-value"
                >
                  {{ agent.name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="bar-footer-tight">
        <span class="script-card__id">{{ script.uniqueId.slice(-6) }}</span>
        <button
          @click="openAnalysis"
          class="script-card__btn-advertisers"
        >
          {{ $t('scriptCard.fullAnalysis') }}
        </button>
      </div>
    </div>

    <AdvertiserAnalysisModal 
      :open="showAnalysisModal" 
      :tags="script.tags"
      @close="showAnalysisModal = false"
    />
  </div>
</template>

