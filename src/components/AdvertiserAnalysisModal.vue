<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'
import { useGameDataStore } from '@/stores/gameData'
import { calculateAudienceAffinity, calculateDistribution } from '@/utils/calculator'
import type { TagInput, DemographicId } from '@/types/game'
import Modal from '@/components/ui/Modal.vue'

const props = defineProps<{
  open: boolean
  tags: TagInput[]
}>()

const emit = defineEmits<{
  close: []
}>()

const calculator = useCalculatorStore()
const gameData = useGameDataStore()
const editingOwned = ref(false)
const ownedInputRef = ref<HTMLInputElement | null>(null)

watch(editingOwned, (is) => {
  if (is) setTimeout(() => ownedInputRef.value?.focus(), 0)
})

const results = computed(() => {
  if (!props.open || props.tags.length === 0) return null

  const affinity = calculateAudienceAffinity(props.tags)
  
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

  let postDuration = 0
  let totalWeeks = 10
  if (calculator.commercialScore >= 9.0) {
    postDuration = 4
    totalWeeks = 14
  }

  const distributionWeeks = calculateDistribution(calculator.commercialScore, calculator.ownedScreenings)

  return {
    targetAudiences,
    highInterest,
    moderateInterest,
    movieLean,
    recommendedAgents,
    holidays: rankedHolidays,
    campaignDuration: { pre: 6, release: 4, post: postDuration, total: totalWeeks },
    distributionWeeks
  }
})
</script>

<template>
  <Modal :open="open" title="Advertiser Analysis" max-width="2xl" @close="emit('close')">
    <div v-if="results" class="analysis__body">
      <!-- Target Audience -->
      <div>
        <h3 class="analysis__section-title">Target Audience</h3>
        <div class="advertisers__legend-row advertisers__legend-row--tight">
          <div class="advertisers__legend-item">
            <span class="advertisers__dot advertisers__dot--success"></span>
            High Interest
          </div>
          <div class="advertisers__legend-item">
            <span class="advertisers__dot advertisers__dot--moderate"></span>
            Moderate Interest
          </div>
        </div>

        <div v-if="results.targetAudiences.length > 0" class="chips-row-2">
          <span
            v-for="audience in results.targetAudiences"
            :key="audience.id"
            class="analysis__audience-chip"
            :class="audience.score >= 0.67
              ? 'border-success bg-success/10 text-white shadow-[0_0_10px_rgba(76,217,100,0.2)]'
              : 'border-moderate bg-moderate/10 text-white shadow-[0_0_8px_rgba(255,159,10,0.15)]'"
          >
            {{ audience.name }}
          </span>
        </div>
        <div v-else class="analysis__empty-msg">
          No audience fits the criteria.
        </div>
      </div>

      <!-- Holiday Release -->
      <div>
        <h3 class="analysis__section-title">Holiday Release</h3>

        <div v-if="results.holidays.length === 0" class="analysis__empty-msg">
          No beneficial holidays found for your primary audience.
        </div>
        <div v-else class="space-y-2">
          <div class="highlight-box--accent">
            <div>
              <span class="analysis__holiday-name">{{ results.holidays[0].name }}</span>
              <span class="text-muted-sm">{{ results.holidays[0].context }}</span>
            </div>
          </div>

          <template v-if="results.holidays.length > 1">
            <div
              v-for="holiday in results.holidays.slice(1, 3)"
              :key="holiday.name"
              class="advertisers__holiday-alt"
            >
              <div>
                <span class="analysis__holiday-name-sm">{{ holiday.name }}</span>
                <span class="text-muted-sm">{{ holiday.context }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Advertisers & Campaign in grid -->
      <div class="analysis__grid-1-2">
        <!-- Recommended Advertisers -->
        <div class="analysis__card">
          <h3 class="analysis__section-title-sm">Recommended Advertisers</h3>
          <p class="analysis__caption">Ranked from Highest to Lowest</p>

          <div class="analysis__lean-row">
            <span class="text-text-muted">Movie Lean:</span>
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

          <div v-if="results.recommendedAgents.length === 0" class="analysis__empty-msg">
            Identify a target audience first.
          </div>
          <div v-else class="space-y-0">
            <div
              v-for="agent in results.recommendedAgents"
              :key="agent.name"
              class="row-border-sm"
            >
              <span class="analysis__agent-name">{{ agent.name }}</span>
              <span class="chip-agent-type">{{ agent.type }}</span>
            </div>
          </div>
        </div>

        <!-- Campaign Duration -->
        <div class="analysis__card">
          <h3 class="analysis__section-title">Campaign Duration</h3>

          <div class="analysis__phase-stack">
            <div class="analysis__phase-block analysis__phase-block--art">
              <span class="text-muted-sm phase-label">Pre-Release</span>
              <span class="analysis__phase-value-sm">{{ results.campaignDuration.pre }} wks</span>
            </div>
            <div class="analysis__phase-block analysis__phase-block--accent">
              <span class="text-muted-sm phase-label">Release</span>
              <span class="analysis__phase-value-sm">{{ results.campaignDuration.release }} wks</span>
            </div>
            <div
              class="analysis__phase-block analysis__phase-block--danger"
              :class="{ 'opacity-30': results.campaignDuration.post === 0 }"
            >
              <span class="text-muted-sm phase-label">Post-Release</span>
              <span class="analysis__phase-value-sm">{{ results.campaignDuration.post }} wks</span>
            </div>
          </div>

          <div class="advertisers__footer advertisers__footer--tight">
            Total: <strong class="text-white">{{ results.campaignDuration.total }} Weeks</strong>
          </div>

          <h4 class="analysis__section-heading">Screenings per week</h4>
          <p class="analysis__screenings-desc">
            Based on Commercial {{ calculator.commercialScore.toFixed(1) }},
            <template v-if="editingOwned">
              <input
                ref="ownedInputRef"
                type="number"
                min="0"
                step="1"
                :value="calculator.ownedScreenings"
                @input="(e) => { const n = Number((e.target as HTMLInputElement).value); if (!Number.isNaN(n) && n >= 0) calculator.ownedScreenings = Math.round(n) }"
                @blur="editingOwned = false"
                @keydown.enter="editingOwned = false"
                class="analysis__input-inline"
              >
            </template>
            <button
              v-else
              type="button"
              class="analysis__edit-trigger"
              @click="editingOwned = true"
            >
              {{ calculator.ownedScreenings.toLocaleString() }} owned
            </button>
          </p>
          <div class="analysis__grid-4">
            <div
              v-for="(val, idx) in results.distributionWeeks"
              :key="idx"
              class="analysis__week-cell"
              :class="val > 0 ? 'border-accent/30' : 'border-transparent'"
            >
              <span class="analysis__week-label">W{{ idx + 1 }}</span>
              <span class="analysis__value-text" :class="val > 0 ? 'text-text' : 'text-text-muted/40'">{{ val.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Modal>
</template>
