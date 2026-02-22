<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'
import { useGameDataStore } from '@/stores/gameData'
import { calculateAudienceAffinity, calculateDistribution } from '@/utils/calculator'
import type { DemographicId } from '@/types/game'
import Card from '@/components/ui/Card.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import Button from '@/components/ui/Button.vue'
import TagSelector from '@/components/TagSelector.vue'
import QuickSearch from '@/components/QuickSearch.vue'

const calculator = useCalculatorStore()
const gameData = useGameDataStore()
const runAnalyzeOnNextAdvertisers = inject<{ value: boolean }>('runAnalyzeOnNextAdvertisers')!

const showResults = ref(false)

const results = ref<{
  targetAudiences: Array<{ id: DemographicId; name: string; score: number }>
  highInterest: DemographicId[]
  moderateInterest: DemographicId[]
  movieLean: 'Balanced' | 'Artistic' | 'Commercial'
  recommendedAgents: Array<{ name: string; type: string; score: number }>
  holidays: Array<{ name: string; totalScore: number; context: string }>
  campaignDuration: { pre: number; release: number; post: number; total: number }
} | null>(null)

const distributionWeeks = computed(() => {
  return calculateDistribution(calculator.commercialScore, calculator.ownedScreenings)
})

function analyze() {
  if (calculator.advertiserTags.length === 0) {
    alert('Please select at least one tag.')
    return
  }

  const affinity = calculateAudienceAffinity(calculator.advertiserTags)
  
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

  // Movie lean
  let movieLean: 'Balanced' | 'Artistic' | 'Commercial' = 'Balanced'
  let movieLeanType = 0
  if (calculator.artisticScore > calculator.commercialScore + 0.1) {
    movieLean = 'Artistic'
    movieLeanType = 1
  } else if (calculator.commercialScore > calculator.artisticScore + 0.1) {
    movieLean = 'Commercial'
    movieLeanType = 2
  }

  // Recommended agents
  const validTargetIds = targetAudiences.map(t => t.id)
  let recommendedAgents: Array<{ name: string; type: string; score: number }> = []
  
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
      .slice(0, 4)

    recommendedAgents = validAgents.map(a => ({
      name: a.name,
      type: a.typeLabel,
      score: a.score
    }))
  }

  // Holidays
  const primaryTargets = highInterest.length > 0 ? highInterest : moderateInterest
  const rankedHolidays = gameData.holidays
    .map(h => {
      let totalScore = 0
      const parts: string[] = []
      for (const id of primaryTargets) {
        const bonus = h.bonuses[id] || 0
        if (bonus > 0) {
          totalScore += bonus
          parts.push(`${bonus}% Bonus Towards ${gameData.demographics[id].name}`)
        }
      }
      return {
        name: h.name,
        totalScore,
        context: parts.length > 0 ? parts.join(', ') : 'No significant bonus.'
      }
    })
    .filter(h => h.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore)

  // Campaign duration
  let postDuration = 0
  let totalWeeks = 10
  if (calculator.commercialScore >= 9.0) {
    postDuration = 4
    totalWeeks = 14
  }

  results.value = {
    targetAudiences,
    highInterest,
    moderateInterest,
    movieLean,
    recommendedAgents,
    holidays: rankedHolidays,
    campaignDuration: { pre: 6, release: 4, post: postDuration, total: totalWeeks }
  }

  showResults.value = true
}

function reset() {
  calculator.clearTags('advertisers')
  showResults.value = false
  results.value = null
}

onMounted(() => {
  if (runAnalyzeOnNextAdvertisers.value && calculator.advertiserTags.length > 0) {
    runAnalyzeOnNextAdvertisers.value = false
    analyze()
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Quick Search -->
    <Card>
      <CardHeader title="Quick Search" />
      <QuickSearch context="advertisers" />
    </Card>

    <!-- Score Controls -->
    <Card>
      <CardHeader title="Movie Scores">
        <template #actions>
          <span class="advertisers__score-badge">0 - 10</span>
        </template>
      </CardHeader>
      
      <div class="advertisers__scores-grid">
        <!-- Commercial -->
        <div class="advertisers__panel-card advertisers__panel-card--hover">
          <div class="advertisers__score-row">
            <label class="label-bold-sm">Commercial</label>
            <input
              v-model.number="calculator.commercialScore"
              type="number"
              step="0.1"
              min="0"
              max="10"
              class="advertisers__input-commercial"
            >
          </div>
          <input
            v-model.number="calculator.commercialScore"
            type="range"
            min="0"
            max="10"
            step="0.1"
            class="w-full"
          >
        </div>

        <!-- Artistic -->
        <div class="advertisers__panel-card advertisers__panel-card--hover">
          <div class="advertisers__score-row">
            <label class="label-bold-sm">Art</label>
            <input
              v-model.number="calculator.artisticScore"
              type="number"
              step="0.1"
              min="0"
              max="10"
              class="advertisers__input-art"
            >
          </div>
          <input
            v-model.number="calculator.artisticScore"
            type="range"
            min="0"
            max="10"
            step="0.1"
            class="w-full"
          >
        </div>
      </div>
    </Card>

    <!-- Tag Selector -->
    <Card>
      <CardHeader title="Build Your Script">
        <template #actions>
          <button
            @click="reset"
            class="advertisers__btn-reset"
          >
            Reset
          </button>
        </template>
      </CardHeader>
      <p class="advertisers__intro">Select tags manually or use the search bar above. Add multiple genres to adjust their influence.</p>
      
      <TagSelector context="advertisers" :show-percent-slider="true" />
      
      <div class="mt-6">
        <Button variant="primary" full-width @click="analyze">
          Analyse
        </Button>
      </div>
    </Card>

    <!-- Distribution Calculator -->
    <Card accent="gold">
      <CardHeader title="Distribution Calculator" />
      
      <div class="section-row">
        <div class="advertisers__owned-row">
          <label class="label-semibold-sm">Owned Theatres (Screenings)</label>
          <input
            v-model.number="calculator.ownedScreenings"
            type="number"
            min="0"
            class="advertisers__input-owned"
          >
        </div>
        <span class="text-muted-base">
          Based on Target Commercial Score: <strong class="text-accent">{{ calculator.commercialScore.toFixed(1) }}</strong>
        </span>
      </div>

      <p class="advertisers__intro">
        Screenings needed for independent distribution. Adjust the <strong>Commercial Score</strong> above to see changes.
      </p>

      <div class="advertisers__distribution-grid">
        <div
          v-for="(val, idx) in distributionWeeks"
          :key="idx"
          class="advertisers__week-card"
          :class="val > 0 ? 'border-accent/30' : 'border-transparent'"
        >
          <span class="advertisers__week-label">Week {{ idx + 1 }}</span>
          <span
            class="advertisers__week-value"
            :class="val > 0 ? 'text-text' : 'text-text-muted/40'"
          >
            {{ val.toLocaleString() }}
          </span>
        </div>
      </div>
    </Card>

    <!-- Results -->
    <template v-if="showResults && results">
      <!-- Target Audience -->
      <Card>
        <div class="advertisers__results-header">
          <CardHeader title="Target Audience" class="mb-0" />
        </div>
        <div class="advertisers__legend-row">
          <div class="advertisers__legend-item">
            <span class="advertisers__dot advertisers__dot--success"></span>
            High Interest
          </div>
          <div class="advertisers__legend-item">
            <span class="advertisers__dot advertisers__dot--moderate"></span>
            Moderate Interest
          </div>
        </div>
        
        <div v-if="results.targetAudiences.length > 0" class="advertisers__audiences-wrap">
          <span
            v-for="audience in results.targetAudiences"
            :key="audience.id"
            class="advertisers__audience-chip"
            :class="audience.score >= 0.67
              ? 'border-success bg-success/10 text-white shadow-[0_0_10px_rgba(76,217,100,0.2)]'
              : 'border-moderate bg-moderate/10 text-white shadow-[0_0_8px_rgba(255,159,10,0.15)]'"
          >
            {{ audience.name }}
          </span>
        </div>
        <div v-else class="advertisers__empty-msg">
          No audience fits the criteria.
        </div>
      </Card>

      <!-- Holiday Release -->
      <Card>
        <CardHeader title="Holiday Release" />
        
        <div v-if="results.holidays.length === 0" class="advertisers__empty-msg">
          No beneficial holidays found for your primary audience.
        </div>
        <div v-else class="space-y-2">
          <p class="advertisers__subtitle--best">Best Option</p>
          <div class="advertisers__holiday-best">
            <div>
              <span class="advertisers__holiday-name">{{ results.holidays[0].name }}</span>
              <span class="text-muted-sm">{{ results.holidays[0].context }}</span>
            </div>
          </div>

          <template v-if="results.holidays.length > 1">
            <p class="advertisers__subtitle--alt">Alternatives</p>
            <div
              v-for="holiday in results.holidays.slice(1, 4)"
              :key="holiday.name"
              class="advertisers__holiday-alt"
            >
              <div>
                <span class="advertisers__holiday-name-sm">{{ holiday.name }}</span>
                <span class="text-muted-sm">{{ holiday.context }}</span>
              </div>
            </div>
          </template>
        </div>
      </Card>

      <!-- Advertisers & Campaign -->
      <div class="advertisers__results-grid">
        <!-- Recommended Advertisers -->
        <Card class="h-full">
          <CardHeader title="Recommended Advertisers" />
          <p class="advertisers__subtitle--ranked">Ranked from Highest to Lowest</p>
          
          <div class="advertisers__lean-row">
            <span class="text-muted-base">Movie Lean Towards:</span>
            <span
              class="font-bold"
              :class="{
                'text-art': results.movieLean === 'Artistic',
                'text-accent': results.movieLean === 'Commercial',
                'text-text': results.movieLean === 'Balanced'
              }"
            >
              {{ results.movieLean }}
            </span>
          </div>

          <div v-if="results.recommendedAgents.length === 0" class="advertisers__empty-msg">
            Identify a target audience first.
          </div>
          <div v-else class="space-y-0">
            <div
              v-for="agent in results.recommendedAgents"
              :key="agent.name"
              class="row-border"
            >
              <span class="advertisers__agent-name">{{ agent.name }}</span>
              <span class="chip-agent-type-lg">{{ agent.type }}</span>
            </div>
          </div>
        </Card>

        <!-- Campaign Duration -->
        <Card class="h-full">
          <CardHeader title="Recommended Advertisement Duration" />
          
          <div class="advertisers__phase-wrap">
            <div class="plan__phase-block plan__phase-block--art">
              <span class="text-muted-base phase-label">Pre-Release</span>
              <span class="advertisers__phase-value">{{ results.campaignDuration.pre }} wks</span>
            </div>
            <div class="plan__phase-block plan__phase-block--accent">
              <span class="text-muted-base phase-label">Release</span>
              <span class="advertisers__phase-value">{{ results.campaignDuration.release }} wks</span>
            </div>
            <div
              class="plan__phase-block plan__phase-block--danger"
              :class="{ 'opacity-30': results.campaignDuration.post === 0 }"
            >
              <span class="text-muted-base phase-label">Post-Release</span>
              <span class="advertisers__phase-value">{{ results.campaignDuration.post }} wks</span>
            </div>
          </div>

          <div class="advertisers__footer">
            Total Duration: <strong class="text-white">{{ results.campaignDuration.total }} Weeks</strong>
          </div>
        </Card>
      </div>
    </template>
  </div>
</template>
