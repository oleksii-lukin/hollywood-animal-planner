<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'
import { calculateMatrixScore, calculateTotalBonuses, getScoringElementCount, formatScore } from '@/utils/calculator'
import Card from '@/components/ui/Card.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import Button from '@/components/ui/Button.vue'
import TagSelector from '@/components/TagSelector.vue'
import QuickSearch from '@/components/QuickSearch.vue'
import type { TabId } from '@/App.vue'

const calculator = useCalculatorStore()
const runCompatibilityOnNextSynergy = inject<{ value: boolean }>('runCompatibilityOnNextSynergy')!
const runAnalyzeOnNextAdvertisers = inject<{ value: boolean }>('runAnalyzeOnNextAdvertisers')!
const switchTab = inject<(tab: TabId, options?: { pushState?: boolean }) => void>('switchTab')!

const showResults = ref(false)
const results = ref<{
  avgComp: number
  totalScore: number
  spoilers: string[]
  comBonus: number
  artBonus: number
  comScore: number
  artScore: number
  tagCap: number
  ngCount: number
} | null>(null)

function calculate() {
  if (calculator.synergyTags.length === 0) {
    alert('Please select at least one tag.')
    return
  }

  const matrix = calculateMatrixScore(calculator.synergyTags)
  const bonuses = calculateTotalBonuses(calculator.synergyTags)
  const ngCount = getScoringElementCount(calculator.synergyTags)

  let tagCap = 6
  if (ngCount >= 9) tagCap = 9
  else if (ngCount >= 7) tagCap = 8
  else if (ngCount >= 5) tagCap = 7

  const MAX_GAME_SCORE = 9.9
  const totalComRaw = matrix.totalScore + bonuses.com
  const totalArtRaw = matrix.totalScore + bonuses.art

  let displayCom = Math.max(0, totalComRaw * MAX_GAME_SCORE)
  let displayArt = Math.max(0, totalArtRaw * MAX_GAME_SCORE)

  displayCom = Math.min(tagCap, displayCom)
  displayArt = Math.min(tagCap, displayArt)

  results.value = {
    avgComp: matrix.rawAverage,
    totalScore: matrix.totalScore,
    spoilers: [...new Set(matrix.spoilers)],
    comBonus: bonuses.com,
    artBonus: bonuses.art,
    comScore: displayCom,
    artScore: displayArt,
    tagCap,
    ngCount
  }

  showResults.value = true
}

function reset() {
  calculator.clearTags('synergy')
  showResults.value = false
  results.value = null
}

function transferToAdvertisers() {
  calculator.advertiserTags = [...calculator.synergyTags]
  runAnalyzeOnNextAdvertisers.value = true
  switchTab('advertisers', { pushState: true })
}

onMounted(() => {
  if (runCompatibilityOnNextSynergy.value && calculator.synergyTags.length > 0) {
    runCompatibilityOnNextSynergy.value = false
    calculate()
  }
})

const avgCompClass = computed(() => {
  if (!results.value) return ''
  if (results.value.avgComp >= 3.5) return 'text-success'
  if (results.value.avgComp < 2.5) return 'text-danger'
  return 'text-text'
})

const totalScoreClass = computed(() => {
  if (!results.value) return ''
  return results.value.totalScore >= 0 ? 'text-success' : 'text-danger'
})
</script>

<template>
  <div class="space-y-6">
    <!-- Quick Search -->
    <Card>
      <CardHeader title="Quick Search" />
      <QuickSearch context="synergy" />
    </Card>

    <!-- Tag Selector -->
    <Card>
      <CardHeader title="Check Compatibility">
        <template #actions>
          <button
            @click="reset"
            class="synergy__btn-ghost"
          >
            Reset
          </button>
        </template>
      </CardHeader>
      <p class="synergy__intro">Select story elements to see how well they fit together.</p>
      
      <TagSelector context="synergy" :show-percent-slider="true" />
      
      <div class="mt-6">
        <Button variant="primary" full-width @click="calculate">
          Check Compatibility
        </Button>
      </div>
    </Card>

    <!-- Results -->
    <div v-if="showResults && results" class="space-y-6">
      <!-- Summary Cards -->
      <div class="synergy__stats-grid">
        <div class="synergy__stat-card">
          <div class="synergy__decor-line"></div>
          <h3 class="stat-title">Average Compatibility</h3>
          <div class="synergy__big-score" :class="avgCompClass">
            {{ results.avgComp.toFixed(1) }}
            <span class="synergy__score-suffix">/ 5.0</span>
          </div>
        </div>
        <div class="synergy__stat-card">
          <div class="synergy__decor-line"></div>
          <h3 class="stat-title">Script Synergy</h3>
          <div class="synergy__big-score" :class="totalScoreClass">
            {{ formatScore(results.totalScore) }}
          </div>
        </div>
      </div>

      <!-- Breakdown -->
      <Card>
        <div class="synergy__grid-cols">
          <!-- Left: Bonuses -->
          <div class="synergy__bonuses-panel">
            <h4 class="synergy__section-head-bordered">Bonuses</h4>
            <div class="space-y-3">
              <div class="synergy__stat-line">
                <span class="text-muted-base">Script Synergy:</span>
                <span class="font-semibold font-mono" :class="totalScoreClass">{{ formatScore(results.totalScore) }}</span>
              </div>
              <div class="synergy__stat-line">
                <span class="text-muted-base">Commercial Bonus:</span>
                <span class="synergy__stat-value" :class="results.comBonus >= 0 ? 'text-success' : 'text-danger'">
                  {{ formatScore(results.comBonus) }}
                </span>
              </div>
              <div class="synergy__stat-row">
                <span class="text-muted-base">Artistic Bonus:</span>
                <span class="synergy__stat-value" :class="results.artBonus >= 0 ? 'text-art' : 'text-danger'">
                  {{ formatScore(results.artBonus) }}
                </span>
              </div>
            </div>
            <p class="synergy__footnote">
              Script synergy is the foundation of your movie score, scaled by your scriptwriter's skill.
            </p>
          </div>

          <!-- Right: Potential Score -->
          <div class="synergy__content-split">
            <h4 class="synergy__section-accent">
              Potential Movie Score
            </h4>
            <div class="space-y-3">
              <div class="synergy__bonus-row--accent">
                <span class="text-muted-base">Commercial Movie Score:</span>
                <span class="synergy__score-value synergy__score-value--accent">{{ results.comScore.toFixed(1) }}</span>
              </div>
              <div class="synergy__bonus-row--art">
                <span class="text-muted-base">Artistic Movie Score:</span>
                <span class="synergy__score-value synergy__score-value--art">{{ results.artScore.toFixed(1) }}</span>
              </div>
            </div>
            <p class="synergy__footnote-right">
              Max Score Capped at <strong class="text-text">{{ results.tagCap }}.0</strong> ({{ results.ngCount }} Scoring Elements)
            </p>
          </div>
        </div>
      </Card>

      <!-- Conflicts -->
      <Card accent="danger">
        <CardHeader title="Conflicts" color="danger" />
        <p class="synergy__conflicts-intro">Severe clashes that ruin the script</p>
        <div v-if="results.spoilers.length > 0" class="space-y-2">
          <div
            v-for="spoiler in results.spoilers"
            :key="spoiler"
            class="danger-row"
          >
            {{ spoiler }}
          </div>
        </div>
        <div v-else class="synergy__empty-conflicts">No severe conflicts found.</div>
      </Card>

      <!-- Transfer Button -->
      <Button variant="secondary" full-width @click="transferToAdvertisers">
        Find Best Advertisers →
      </Button>
    </div>
  </div>
</template>
