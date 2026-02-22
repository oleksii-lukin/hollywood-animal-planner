import type { TagInput, TagCategory } from '@/types/game'
import { useGameDataStore } from '@/stores/gameData'

let wasmExports: any = null
let isInitialized = false
let tagIdToIndex: Map<string, number> = new Map()
let indexToTagId: string[] = []

const categoryToInt: Record<TagCategory, number> = {
  'Genre': 0,
  'Setting': 1,
  'Protagonist': 2,
  'Antagonist': 2,
  'Supporting Character': 2,
  'Theme & Event': 2,
  'Finale': 2
}

async function loadWasm(): Promise<any> {
  const wasmUrl = `${import.meta.env.BASE_URL}wasm/release.wasm`
  const response = await fetch(wasmUrl)
  const wasmBuffer = await response.arrayBuffer()
  
  const result = await WebAssembly.instantiate(wasmBuffer, {
    env: {
      abort: () => { throw new Error('WASM abort') }
    }
  })
  
  return result.instance.exports
}

export async function initWasmCalculator(): Promise<boolean> {
  if (isInitialized) return true
  
  try {
    wasmExports = await loadWasm()
    
    const gameData = useGameDataStore()
    const allTags = Object.values(gameData.tags)
    const tagCount = allTags.length
    
    tagIdToIndex.clear()
    indexToTagId = []
    
    allTags.forEach((tag, idx) => {
      tagIdToIndex.set(tag.id, idx)
      indexToTagId[idx] = tag.id
    })
    
    wasmExports.initMatrix(tagCount)
    wasmExports.initTagBonuses(tagCount)
    wasmExports.allocateInputArrays(20)
    if (typeof wasmExports.allocateCandidateArrays === 'function') {
      wasmExports.allocateCandidateArrays()
    }
    
    for (const tag of allTags) {
      const idx = tagIdToIndex.get(tag.id)!
      wasmExports.setTagBonus(idx, tag.art, tag.com)
    }
    
    for (const tagA of allTags) {
      const idxA = tagIdToIndex.get(tagA.id)!
      for (const tagB of allTags) {
        if (tagA.id >= tagB.id) continue
        const idxB = tagIdToIndex.get(tagB.id)!
        const compat = gameData.getCompatibility(tagA.id, tagB.id)
        wasmExports.setCompatibility(idxA, idxB, compat)
      }
    }
    
    isInitialized = true
    console.log(`WASM Calculator initialized with ${tagCount} tags`)
    return true
  } catch (e) {
    console.warn('WASM failed to load. Matrix score will be computed in JS.', e)
    return false
  }
}

export function isWasmReady(): boolean {
  return isInitialized && wasmExports !== null
}

export interface WasmMatrixResult {
  totalScore: number
  rawAverage: number
  hasConflict: boolean
}

export function calculateMatrixScoreWasm(tags: TagInput[]): WasmMatrixResult | null {
  if (!isWasmReady()) return null
  
  wasmExports.setInputTagCount(tags.length)
  
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]
    const idx = tagIdToIndex.get(tag.id)
    if (idx === undefined) {
      console.warn(`Unknown tag ID: ${tag.id}`)
      return null
    }
    const categoryInt = categoryToInt[tag.category]
    const percent = Number.isFinite(tag.percent) ? tag.percent : 1.0
    wasmExports.setInputTag(i, idx, percent, categoryInt)
  }
  
  wasmExports.calculateMatrixScore()
  
  const totalScore = wasmExports.getTotalScore()
  const rawAverage = wasmExports.getRawAverage()
  if (!Number.isFinite(totalScore) || !Number.isFinite(rawAverage)) {
    return null
  }
  return {
    totalScore,
    rawAverage,
    hasConflict: wasmExports.hasConflict() === 1
  }
}

/**
 * Script generator: try multiple candidates at one slot in WASM; returns the best candidate or null.
 * Caller must have filled WASM state with current tags (e.g. via calculateMatrixScoreWasm(currentTags) first).
 */
export function trySwapCandidatesWasm(
  currentTags: TagInput[],
  mutableIndex: number,
  candidates: TagInput[]
): TagInput | null {
  if (!isWasmReady() || candidates.length === 0 || mutableIndex < 0 || mutableIndex >= currentTags.length) return null

  if (currentTags.length > 20) return null

  wasmExports.setInputTagCount(currentTags.length)
  for (let i = 0; i < currentTags.length; i++) {
    const tag = currentTags[i]
    const idx = tagIdToIndex.get(tag.id)
    if (idx === undefined) return null
    const categoryInt = categoryToInt[tag.category]
    const percent = Number.isFinite(tag.percent) ? tag.percent : 1.0
    wasmExports.setInputTag(i, idx, percent, categoryInt)
  }

  if (typeof wasmExports.setCandidate !== 'function' || typeof wasmExports.trySwapCandidates !== 'function') return null

  const maxCandidates = Math.min(candidates.length, 32)
  for (let i = 0; i < maxCandidates; i++) {
    const idx = tagIdToIndex.get(candidates[i].id)
    if (idx === undefined) return null
    wasmExports.setCandidate(
      i,
      idx,
      Number.isFinite(candidates[i].percent) ? candidates[i].percent : 1.0,
      categoryToInt[candidates[i].category]
    )
  }
  wasmExports.setCandidateCount(maxCandidates)

  const bestIdx = wasmExports.trySwapCandidates(mutableIndex)
  if (bestIdx < 0) return null
  return candidates[bestIdx]
}
