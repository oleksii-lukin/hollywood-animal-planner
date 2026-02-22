/**
 * WASM calculator parity test: same formula as JS, same inputs → same totalScore and rawAverage.
 * Requires build: npm run asbuild:release (or wasm:build).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const wasmPath = path.join(__dirname, '../build/release.wasm')

describe('WASM matrix score parity with JS', () => {
  let wasm: {
    initMatrix: (size: number) => void
    setCompatibility: (a: number, b: number, value: number) => void
    allocateInputArrays: (max: number) => void
    setInputTag: (index: number, tagId: number, percent: number, category: number) => void
    setInputTagCount: (count: number) => void
    calculateMatrixScore: () => void
    getTotalScore: () => number
    getRawAverage: () => number
    hasConflict: () => number
  } | null = null

  beforeAll(async () => {
    if (!existsSync(wasmPath)) {
      console.warn('WASM not built: run npm run asbuild:release')
      return
    }
    const buffer = readFileSync(wasmPath)
    const { instance } = await WebAssembly.instantiate(buffer, {
      env: {
        abort: () => {
          throw new Error('WASM abort')
        }
      }
    })
    const exports = instance.exports as Record<string, unknown>
    wasm = {
      initMatrix: exports.initMatrix as (size: number) => void,
      setCompatibility: exports.setCompatibility as (a: number, b: number, value: number) => void,
      allocateInputArrays: exports.allocateInputArrays as (max: number) => void,
      setInputTag: exports.setInputTag as (index: number, tagId: number, percent: number, category: number) => void,
      setInputTagCount: exports.setInputTagCount as (count: number) => void,
      calculateMatrixScore: exports.calculateMatrixScore as () => void,
      getTotalScore: exports.getTotalScore as () => number,
      getRawAverage: exports.getRawAverage as () => number,
      hasConflict: exports.hasConflict as () => number
    }
  })

  it('two tags compat 4: rawAverage 4, totalScore 0.9 (matches JS)', () => {
    if (!wasm) return // skip when WASM not built (run: npm run asbuild:release)
    wasm.initMatrix(2)
    wasm.setCompatibility(0, 1, 4)
    wasm.allocateInputArrays(2)
    wasm.setInputTag(0, 0, 1.0, 2) // Protagonist
    wasm.setInputTag(1, 1, 1.0, 2)
    wasm.setInputTagCount(2)
    wasm.calculateMatrixScore()
    const rawAverage = wasm.getRawAverage()
    const totalScore = wasm.getTotalScore()
    expect(rawAverage).toBe(4)
    expect(Math.abs(totalScore - 0.9)).toBeLessThan(1e-6)
  })

  it('single tag: rawAverage 3, totalScore 0', () => {
    if (!wasm) return // skip when WASM not built
    wasm.initMatrix(1)
    wasm.allocateInputArrays(1)
    wasm.setInputTag(0, 0, 1.0, 2)
    wasm.setInputTagCount(1)
    wasm.calculateMatrixScore()
    expect(wasm.getRawAverage()).toBe(3)
    expect(wasm.getTotalScore()).toBe(0)
  })
})
