/**
 * Shared script generation logic for Generator and Release Plan.
 * Accepts optional avoidTagIds (e.g. tags from other plan slots for uniqueness).
 */
import { unref } from 'vue'
import type { TagInput, GeneratedScript, TagCategory } from '@/types/game'
import type { useGameDataStore } from '@/stores/gameData'
import type { useCalculatorStore } from '@/stores/calculator'
import { calculateMatrixScore, getScoringElementCount, calculateTotalBonuses } from '@/utils/calculator'
import { isWasmReady, trySwapCandidatesWasm } from '@/utils/wasmCalculator'

/** Shared attempt-loop options for both Board batch and Plan slot generation. */
export interface RunGenerationAttemptsOptions {
  targetCompatibility: number
  targetTagCount: number
  fixedTags: TagInput[]
  excludedTags: TagInput[]
  gameData: ReturnType<typeof useGameDataStore>
  calculator: ReturnType<typeof useCalculatorStore>
  /** Base tag IDs to avoid (e.g. from other plan slots). Optional. */
  baseAvoidTagIds?: Set<string>
  skipLowQuality: boolean
  fullyDiverseTags: boolean
  minMovieScore: number
  maxAttempts: number
  /** If provided, checked each attempt; when true, loop exits immediately. */
  getAbort?: () => boolean
}

export interface RunGenerationAttemptsResult {
  best: GeneratedScript | null
  metTarget: boolean
}

const DIVERSITY_RESET_THRESHOLD = 25

/**
 * Runs the generation attempt loop once (one script). Used by Board batch and Plan slot.
 * Returns the best candidate and whether it met the quality target.
 */
export async function runGenerationAttempts(
  options: RunGenerationAttemptsOptions
): Promise<RunGenerationAttemptsResult> {
  const {
    targetCompatibility,
    targetTagCount,
    fixedTags,
    excludedTags,
    gameData,
    calculator,
    baseAvoidTagIds = new Set(),
    skipLowQuality,
    fullyDiverseTags,
    minMovieScore,
    maxAttempts,
    getAbort
  } = options

  let best: GeneratedScript | null = null
  let triedGenreSettingIds = new Set<string>()

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (getAbort?.()) break
    if (fullyDiverseTags && triedGenreSettingIds.size >= DIVERSITY_RESET_THRESHOLD) triedGenreSettingIds = new Set()
    const combinedAvoid = new Set(baseAvoidTagIds)
    if (fullyDiverseTags && triedGenreSettingIds.size > 0) triedGenreSettingIds.forEach(id => combinedAvoid.add(id))
    const candidate = runGenerationAlgorithm(
      targetCompatibility,
      targetTagCount,
      fixedTags,
      excludedTags,
      gameData,
      calculator,
      combinedAvoid.size > 0 ? { avoidTagIds: combinedAvoid } : undefined
    )
    if (!best || candidate.stats.avgComp > best.stats.avgComp) best = candidate
    const meetsTarget = best.stats.avgComp >= targetCompatibility && parseFloat(best.stats.movieScore) >= minMovieScore
    const acceptAny = !skipLowQuality && best.stats.avgComp >= targetCompatibility && parseFloat(best.stats.movieScore) > 0
    if (skipLowQuality ? meetsTarget : acceptAny) break
    if (fullyDiverseTags && candidate.tags) {
      for (const t of candidate.tags) {
        if (t.category === 'Genre' || t.category === 'Setting') triedGenreSettingIds.add(t.id)
      }
    }
    await new Promise(r => setTimeout(r, 0))
    if (getAbort?.()) break
  }

  const metTarget =
    best !== null &&
    best.stats.avgComp >= targetCompatibility &&
    (skipLowQuality ? parseFloat(best.stats.movieScore) >= minMovieScore : parseFloat(best.stats.movieScore) > 0)
  return { best, metTarget }
}

export function runGenerationAlgorithm(
  _targetComp: number,
  targetCount: number,
  fixedTags: TagInput[],
  excludedTags: TagInput[],
  gameData: ReturnType<typeof useGameDataStore>,
  calculator: ReturnType<typeof useCalculatorStore>,
  options?: { avoidTagIds?: Set<string> }
): GeneratedScript {
  const fixed = unref(fixedTags)
  const excluded = unref(excludedTags)
  const excludedOnlyIds = new Set(excluded.map(t => t.id))
  const excludedIds = new Set(excludedOnlyIds)
  if (options?.avoidTagIds) {
    options.avoidTagIds.forEach(id => excludedIds.add(id))
  }
  let currentTags = [...fixed]
  const categoriesPresent = new Set(currentTags.map(t => t.category))
  const fixedGenres = currentTags.filter(t => t.category === 'Genre')
  if (fixedGenres.length === 0) {
    let genre1 = getRandomTagByCategory('Genre', currentTags, excludedIds, gameData, calculator)
    if (!genre1 && excludedIds.size > excludedOnlyIds.size) {
      genre1 = getRandomTagByCategory('Genre', currentTags, excludedOnlyIds, gameData, calculator)
    }
    if (genre1) {
      let partnerId: string | null = null
      if (Math.random() < 0.3) {
        let partners = getCompatibleGenres(genre1.id, excludedIds, gameData)
        if (partners.length === 0 && excludedIds.size > excludedOnlyIds.size) {
          partners = getCompatibleGenres(genre1.id, excludedOnlyIds, gameData)
        }
        if (partners.length > 0) partnerId = partners[Math.floor(Math.random() * partners.length)]
      }
      if (partnerId) {
        genre1.percent = 0.5
        currentTags.push(genre1, { id: partnerId, percent: 0.5, category: 'Genre' })
      } else {
        genre1.percent = 1.0
        currentTags.push(genre1)
      }
      categoriesPresent.add('Genre')
    }
  }
  if (!categoriesPresent.has('Setting')) {
    let randomSetting = getRandomTagByCategory('Setting', currentTags, excludedIds, gameData, calculator)
    if (!randomSetting && excludedIds.size > excludedOnlyIds.size) {
      randomSetting = getRandomTagByCategory('Setting', currentTags, excludedOnlyIds, gameData, calculator)
    }
    if (randomSetting) {
      currentTags.push(randomSetting)
      categoriesPresent.add('Setting')
    }
  }
  const scoringMandatory: TagCategory[] = ['Protagonist', 'Antagonist', 'Finale']
  for (const cat of scoringMandatory) {
    if (!categoriesPresent.has(cat) && getScoringElementCount(currentTags) < targetCount) {
      const randomTag = getRandomTagByCategory(cat, currentTags, excludedIds, gameData, calculator)
      if (randomTag) {
        currentTags.push(randomTag)
        categoriesPresent.add(cat)
      }
    }
  }
  const fillerCats: TagCategory[] = ['Supporting Character', 'Theme & Event']
  while (getScoringElementCount(currentTags) < targetCount) {
    const randCat = fillerCats[Math.floor(Math.random() * fillerCats.length)]
    const randomTag = getRandomTagByCategory(randCat, currentTags, excludedIds, gameData, calculator)
    if (randomTag) currentTags.push(randomTag)
    else break
  }
  let bestSet = [...currentTags]
  let bestStats = calculateMatrixScore(bestSet)
  const fixedIds = new Set(fixed.map(t => t.id))
  const mutableIndices = bestSet
    .map((t, idx) => ({ t, idx }))
    .filter(item => !fixedIds.has(item.t.id) && item.t.category !== 'Genre')
    .map(item => item.idx)
  if (mutableIndices.length > 0) {
    let noImprovementCount = 0
    const useWasm = isWasmReady()
    const maxCandidates = 20
    for (let i = 0; i < 200 && noImprovementCount < 30; i++) {
      const swapIdx = mutableIndices[Math.floor(Math.random() * mutableIndices.length)]
      const tagToSwap = bestSet[swapIdx]
      let improved = false
      if (useWasm) {
        const candidates = getRandomTagCandidatesByCategory(tagToSwap.category, bestSet, excludedIds, gameData, calculator, maxCandidates)
        const winner = trySwapCandidatesWasm(bestSet, swapIdx, candidates)
        if (winner) {
          bestSet = [...bestSet]
          bestSet[swapIdx] = winner
          bestStats = calculateMatrixScore(bestSet)
          noImprovementCount = 0
          improved = true
        }
      }
      if (!improved) {
        const newTag = getRandomTagByCategory(tagToSwap.category, bestSet, excludedIds, gameData, calculator)
        if (newTag) {
          const candidate = [...bestSet]
          candidate[swapIdx] = newTag
          const newStats = calculateMatrixScore(candidate)
          if (newStats.rawAverage > bestStats.rawAverage) {
            bestSet = candidate
            bestStats = newStats
            noImprovementCount = 0
          } else noImprovementCount++
        } else noImprovementCount++
      }
    }
  }
  const ngCount = getScoringElementCount(bestSet)
  let tagCap = 6
  let maxScriptQual = 5
  if (ngCount >= 9) {
    tagCap = 9
    maxScriptQual = 8
  } else if (ngCount >= 7) {
    tagCap = 8
    maxScriptQual = 7
  } else if (ngCount >= 5) {
    tagCap = 7
    maxScriptQual = 6
  }
  const bonuses = calculateTotalBonuses(bestSet)
  const MAX_GAME_SCORE = 9.9
  const totalScore = Number.isFinite(bestStats.totalScore) ? bestStats.totalScore : 0
  const rawCom = (totalScore + bonuses.com) * MAX_GAME_SCORE
  const rawArt = (totalScore + bonuses.art) * MAX_GAME_SCORE
  let finalMovieScore = Math.min(tagCap, Math.max(0, Math.max(rawCom, rawArt)))
  if (!Number.isFinite(finalMovieScore)) finalMovieScore = 0
  const avgComp = Number.isFinite(bestStats.rawAverage) ? bestStats.rawAverage : 3.0
  return {
    tags: bestSet,
    stats: {
      avgComp,
      synergySum: totalScore,
      maxScriptQuality: maxScriptQual,
      movieScore: finalMovieScore.toFixed(1)
    },
    uniqueId: Date.now() + Math.random().toString(),
    name: ''
  }
}

function getRandomTagByCategory(
  category: TagCategory,
  currentTags: TagInput[],
  excludedIds: Set<string>,
  gameData: ReturnType<typeof useGameDataStore>,
  calculator: ReturnType<typeof useCalculatorStore>
): TagInput | null {
  const candidates = getRandomTagCandidatesByCategory(category, currentTags, excludedIds, gameData, calculator, 1)
  return candidates.length > 0 ? candidates[0] : null
}

/** Returns up to `maxCount` random tags of the given category (for WASM trySwapCandidates batch). */
function getRandomTagCandidatesByCategory(
  category: TagCategory,
  currentTags: TagInput[],
  excludedIds: Set<string>,
  gameData: ReturnType<typeof useGameDataStore>,
  calculator: ReturnType<typeof useCalculatorStore>,
  maxCount: number
): TagInput[] {
  const existingIds = new Set(currentTags.map(t => t.id))
  let available = Object.values(gameData.tags).filter(
    t => t.category === category && !existingIds.has(t.id) && !excludedIds.has(t.id)
  )
  if (calculator.saveFileData) {
    available = available.filter(t => calculator.availableTagsFromSave.includes(t.id))
  }
  if (available.length === 0) return []
  const result: TagInput[] = []
  const shuffled = [...available].sort(() => Math.random() - 0.5)
  for (let i = 0; i < Math.min(maxCount, shuffled.length); i++) {
    result.push({ id: shuffled[i].id, percent: 1.0, category })
  }
  return result
}

function getCompatibleGenres(
  sourceId: string,
  excludedIds: Set<string>,
  gameData: ReturnType<typeof useGameDataStore>
): string[] {
  const valid: string[] = []
  if (gameData.genrePairs[sourceId]) valid.push(...Object.keys(gameData.genrePairs[sourceId]))
  for (const gKey in gameData.genrePairs) {
    if (gameData.genrePairs[gKey]?.[sourceId]) valid.push(gKey)
  }
  return [...new Set(valid)].filter(id => !excludedIds.has(id))
}
