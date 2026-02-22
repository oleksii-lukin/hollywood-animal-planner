/**
 * Unit tests for calculator logic (JS path).
 * WASM parity test in wasm.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getScoringElementCount,
  calculateMatrixScore,
  calculateTotalBonuses,
  type MatrixResult,
  type Bonuses
} from '@/utils/calculator'
import type { TagInput } from '@/types/game'

// Force JS path: disable WASM so we test calculateMatrixScoreJS
vi.mock('@/utils/wasmCalculator', () => ({
  isWasmReady: () => false,
  calculateMatrixScoreWasm: () => null
}))

const mockTagsRecord: Record<string, { id: string; name: string; category: string; art: number; com: number; weights: Record<string, number> }> = {
  A: { id: 'A', name: 'Tag A', category: 'Protagonist', art: 10, com: 20, weights: {} },
  B: { id: 'B', name: 'Tag B', category: 'Protagonist', art: 5, com: 15, weights: {} },
  GENRE1: { id: 'GENRE1', name: 'Comedy', category: 'Genre', art: 1, com: 2, weights: {} }
}

function createMockStore(compatValue: number = 4) {
  return {
    getCompatibility: (_a: string, _b: string) => compatValue,
    tags: mockTagsRecord,
    genrePairs: {} as Record<string, Record<string, { Item1: number; Item2: number }>>
  }
}

vi.mock('@/stores/gameData', () => ({
  useGameDataStore: () => createMockStore(4)
}))

describe('getScoringElementCount', () => {
  it('excludes Genre and Setting, counts the rest', () => {
    const tags: TagInput[] = [
      { id: 'GENRE1', percent: 0.5, category: 'Genre' },
      { id: 'SETTING1', percent: 0.5, category: 'Setting' },
      { id: 'A', percent: 1, category: 'Protagonist' },
      { id: 'B', percent: 1, category: 'Antagonist' }
    ]
    expect(getScoringElementCount(tags)).toBe(2)
  })

  it('returns 0 when only Genre and Setting', () => {
    const tags: TagInput[] = [
      { id: 'GENRE1', percent: 0.6, category: 'Genre' },
      { id: 'SETTING1', percent: 0.4, category: 'Setting' }
    ]
    expect(getScoringElementCount(tags)).toBe(0)
  })

  it('counts all non-Genre non-Setting', () => {
    const tags: TagInput[] = [
      { id: 'A', percent: 1, category: 'Protagonist' },
      { id: 'B', percent: 1, category: 'Theme & Event' },
      { id: 'C', percent: 1, category: 'Finale' }
    ]
    expect(getScoringElementCount(tags)).toBe(3)
  })
})

describe('calculateMatrixScore (JS)', () => {
  it('two tags, compat 4: rawAverage 4, totalScore 0.9', () => {
    const tags: TagInput[] = [
      { id: 'A', percent: 1, category: 'Protagonist' },
      { id: 'B', percent: 1, category: 'Protagonist' }
    ]
    const result = calculateMatrixScore(tags) as MatrixResult
    expect(result.rawAverage).toBe(4)
    expect(result.totalScore).toBe(0.9) // (0.5+0.5)*0.9
  })

  it('single tag: rawAverage 3 (default), totalScore 0', () => {
    const tags: TagInput[] = [{ id: 'A', percent: 1, category: 'Protagonist' }]
    const result = calculateMatrixScore(tags) as MatrixResult
    expect(result.rawAverage).toBe(3)
    expect(result.totalScore).toBe(0)
  })

  it('empty tags: rawAverage 3, totalScore 0', () => {
    const result = calculateMatrixScore([]) as MatrixResult
    expect(result.rawAverage).toBe(3)
    expect(result.totalScore).toBe(0)
  })
})

describe('calculateTotalBonuses', () => {
  it('sums art and com from non-Genre tags plus top genre when no genre pair', () => {
    const tags: TagInput[] = [
      { id: 'GENRE1', percent: 0.6, category: 'Genre' },
      { id: 'A', percent: 1, category: 'Protagonist' },
      { id: 'B', percent: 1, category: 'Antagonist' }
    ]
    const result = calculateTotalBonuses(tags) as Bonuses
    // genrePairs empty -> top genre only: GENRE1 art 1, com 2. Plus A: 10,20; B: 5,15
    expect(result.art).toBe(1 + 10 + 5)
    expect(result.com).toBe(2 + 20 + 15)
  })
})
