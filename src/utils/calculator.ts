import type { TagInput, DemographicId } from '@/types/game'
import { useGameDataStore } from '@/stores/gameData'
import { isWasmReady, calculateMatrixScoreWasm } from './wasmCalculator'

export interface MatrixResult {
  totalScore: number
  spoilers: string[]
  rawAverage: number
}

export interface Bonuses {
  art: number
  com: number
}

let cachedGameData: ReturnType<typeof useGameDataStore> | null = null

function getGameData() {
  if (!cachedGameData) {
    cachedGameData = useGameDataStore()
  }
  return cachedGameData
}

export function calculateMatrixScore(tags: TagInput[]): MatrixResult {
  if (isWasmReady()) {
    const wasmResult = calculateMatrixScoreWasm(tags)
    if (wasmResult) {
      const spoilers: string[] = []
      if (wasmResult.hasConflict) {
        spoilers.push('Conflict detected')
      }
      return {
        totalScore: wasmResult.totalScore,
        rawAverage: wasmResult.rawAverage,
        spoilers
      }
    }
  }
  
  return calculateMatrixScoreJS(tags)
}

function calculateMatrixScoreJS(tags: TagInput[]): MatrixResult {
  const gameData = getGameData()
  let totalScore = 0
  const spoilers: string[] = []
  let rawSum = 0
  let pairCount = 0

  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const tA = tags[i]
      const tB = tags[j]
      const rawVal = gameData.getCompatibility(tA.id, tB.id)
      const safeVal = Number.isFinite(rawVal) ? rawVal : 3.0
      rawSum += safeVal
      pairCount++
    }
  }

  const rawAverage = pairCount > 0 ? rawSum / pairCount : 3.0

  for (const tagA of tags) {
    let rowSum = 0
    let rowWeight = 0
    let worstVal = 6.0
    let worstPartner = ''

    for (const tagB of tags) {
      if (tagA.id === tagB.id) continue

      const rawVal = gameData.getCompatibility(tagA.id, tagB.id)
      const safeRawVal = Number.isFinite(rawVal) ? rawVal : 3.0
      const pctB = Number.isFinite(tagB.percent) ? tagB.percent : 1.0
      let score = (safeRawVal - 3.0) / 2.0
      let weight = 1.0

      if (score < 0) {
        if (tagB.category === 'Genre') {
          score *= 20.0 * pctB
          weight = 20.0 * pctB
        } else if (tagB.category === 'Setting') {
          score *= 5.0
          weight = 5.0
        } else {
          score *= 3.0
          weight = 3.0
        }
      } else {
        if (tagB.category === 'Genre') {
          score *= pctB
          weight = pctB
        }
      }

      rowSum += score
      rowWeight += weight

      if (safeRawVal < worstVal) {
        worstVal = safeRawVal
        worstPartner = tagB.id
      }
    }

    let rowAverage = rowWeight > 0 ? rowSum / rowWeight : 0
    const transformedWorst = (worstVal - 3.0) / 2.0
    let finalRowScore = rowAverage

    if (worstVal <= 1.0) {
      const tagAData = gameData.tags[tagA.id]
      const partnerData = gameData.tags[worstPartner]
      const tagAName = tagAData?.name ?? tagA.id
      const partnerName = partnerData?.name ?? worstPartner
      spoilers.push(`${tagAName} conflicts with ${partnerName}`)
      finalRowScore = -1.0
    } else if (transformedWorst < rowAverage) {
      finalRowScore = transformedWorst
    }

    const pctA = Number.isFinite(tagA.percent) ? tagA.percent : 1.0
    totalScore += finalRowScore * pctA
  }

  if (totalScore >= 0) {
    totalScore *= 0.9
  } else {
    totalScore *= 1.25
  }

  const safeTotal = Number.isFinite(totalScore) ? totalScore : 0
  const safeRaw = Number.isFinite(rawAverage) ? rawAverage : 3.0
  return { totalScore: safeTotal, spoilers, rawAverage: safeRaw }
}

export function calculateTotalBonuses(tags: TagInput[]): Bonuses {
  const gameData = getGameData()
  let totalArt = 0
  let totalCom = 0

  const genrePair = calculateGenrePairScore(tags)
  if (genrePair) {
    totalArt += Number.isFinite(genrePair.art) ? genrePair.art : 0
    totalCom += Number.isFinite(genrePair.com) ? genrePair.com : 0
  } else {
    const genres = tags
      .filter(t => t.category === 'Genre')
      .sort((a, b) => (b.percent ?? 1) - (a.percent ?? 1))
    
    if (genres.length > 0) {
      const topGenre = gameData.tags[genres[0].id]
      if (topGenre) {
        totalArt += Number.isFinite(topGenre.art) ? topGenre.art : 0
        totalCom += Number.isFinite(topGenre.com) ? topGenre.com : 0
      }
    }
  }

  for (const tag of tags) {
    if (tag.category !== 'Genre') {
      const data = gameData.tags[tag.id]
      if (data) {
        totalArt += Number.isFinite(data.art) ? data.art : 0
        totalCom += Number.isFinite(data.com) ? data.com : 0
      }
    }
  }

  return { art: totalArt, com: totalCom }
}

function calculateGenrePairScore(tags: TagInput[]): { art: number; com: number; names: string } | null {
  const gameData = getGameData()
  const genres = tags
    .filter(t => t.category === 'Genre')
    .sort((a, b) => b.percent - a.percent)

  if (genres.length < 2) return null

  const g1 = genres[0]
  const g2 = genres[1]

  if (g1.percent + g2.percent < 0.7 || g2.percent < 0.35) {
    return null
  }

  let pairData: { Item1: number; Item2: number } | null = null
  if (gameData.genrePairs[g1.id]?.[g2.id]) {
    pairData = gameData.genrePairs[g1.id][g2.id]
  } else if (gameData.genrePairs[g2.id]?.[g1.id]) {
    pairData = gameData.genrePairs[g2.id][g1.id]
  }

  if (!pairData) return null

  const g1Data = gameData.tags[g1.id]
  const g2Data = gameData.tags[g2.id]
  const com = Number(pairData.Item1)
  const art = Number(pairData.Item2)

  return {
    com: Number.isFinite(com) ? com : 0,
    art: Number.isFinite(art) ? art : 0,
    names: `${g1Data?.name ?? g1.id} + ${g2Data?.name ?? g2.id}`
  }
}

export function getScoringElementCount(tags: TagInput[]): number {
  return tags.filter(t => t.category !== 'Genre' && t.category !== 'Setting').length
}

export function calculateAudienceAffinity(tags: TagInput[]): Record<DemographicId, number> {
  const gameData = getGameData()
  const affinity: Record<DemographicId, number> = { YM: 0, YF: 0, TM: 0, TF: 0, AM: 0, AF: 0 }

  for (const item of tags) {
    const tagData = gameData.tags[item.id]
    if (!tagData) continue

    const multiplier = item.percent
    for (const demo of Object.keys(affinity) as DemographicId[]) {
      if (tagData.weights[demo]) {
        affinity[demo] += tagData.weights[demo] * multiplier
      }
    }
  }

  let minVal = Number.MAX_VALUE
  for (const demo of Object.keys(affinity) as DemographicId[]) {
    if (affinity[demo] < minVal) minVal = affinity[demo]
  }

  if (minVal < 1.0) {
    const liftAmount = 1.0 - minVal
    for (const demo of Object.keys(affinity) as DemographicId[]) {
      affinity[demo] += liftAmount
    }
  }

  return affinity
}

export function calculateDistribution(commercialScore: number, ownedScreenings: number): number[] {
  const BASE = 1000
  const W1_MULT = 2
  const W2_MULT = 1
  const DECAY = 0.8

  const rawW1 = commercialScore * W1_MULT * BASE - ownedScreenings
  const w1 = Math.max(0, rawW1)

  const rawW2 = commercialScore * W2_MULT * BASE - ownedScreenings
  const w2 = Math.max(0, rawW2)

  const calcValues = [w1, w2]
  let currentDecayBase = w2

  for (let i = 2; i < 8; i++) {
    currentDecayBase *= DECAY
    calcValues.push(currentDecayBase)
  }

  return calcValues.map((val, index) => {
    return index < 4 ? Math.ceil(val) : Math.floor(val)
  })
}

export function formatScore(num: number): string {
  if (Math.abs(num) < 0.005) return '0'
  return (num > 0 ? '+' : '') + num.toFixed(2)
}
