import type { TagInput } from '@/types/game'
import { useGameDataStore } from '@/stores/gameData'
import { isWasmReady, calculateMatrixScoreWasm } from './wasmCalculator'

interface BenchmarkResult {
  name: string
  iterations: number
  totalMs: number
  avgMs: number
  opsPerSecond: number
}

function calculateMatrixScoreJS(tags: TagInput[]): { totalScore: number; rawAverage: number } {
  const gameData = useGameDataStore()
  let totalScore = 0
  let rawSum = 0
  let pairCount = 0

  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const tA = tags[i]
      const tB = tags[j]
      const rawVal = gameData.getCompatibility(tA.id, tB.id)
      rawSum += rawVal
      pairCount++
    }
  }

  const rawAverage = pairCount > 0 ? rawSum / pairCount : 3.0

  for (const tagA of tags) {
    let rowSum = 0
    let rowWeight = 0
    let worstVal = 6.0

    for (const tagB of tags) {
      if (tagA.id === tagB.id) continue

      const rawVal = gameData.getCompatibility(tagA.id, tagB.id)
      let score = (rawVal - 3.0) / 2.0
      let weight = 1.0

      if (score < 0) {
        if (tagB.category === 'Genre') {
          score *= 20.0 * tagB.percent
          weight = 20.0 * tagB.percent
        } else if (tagB.category === 'Setting') {
          score *= 5.0
          weight = 5.0
        } else {
          score *= 3.0
          weight = 3.0
        }
      } else {
        if (tagB.category === 'Genre') {
          score *= tagB.percent
          weight = tagB.percent
        }
      }

      rowSum += score
      rowWeight += weight

      if (rawVal < worstVal) {
        worstVal = rawVal
      }
    }

    let rowAverage = rowWeight > 0 ? rowSum / rowWeight : 0
    const transformedWorst = (worstVal - 3.0) / 2.0
    let finalRowScore = rowAverage

    if (worstVal <= 1.0) {
      finalRowScore = -1.0
    } else if (transformedWorst < rowAverage) {
      finalRowScore = transformedWorst
    }

    totalScore += finalRowScore * tagA.percent
  }

  if (totalScore >= 0) {
    totalScore *= 0.9
  } else {
    totalScore *= 1.25
  }

  return { totalScore, rawAverage }
}

function runBenchmark(
  name: string, 
  fn: () => void, 
  iterations: number
): BenchmarkResult {
  const start = performance.now()
  
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  
  const totalMs = performance.now() - start
  const avgMs = totalMs / iterations
  const opsPerSecond = 1000 / avgMs
  
  return {
    name,
    iterations,
    totalMs,
    avgMs,
    opsPerSecond
  }
}

function generateTestTags(count: number): TagInput[] {
  const gameData = useGameDataStore()
  const allTags = Object.values(gameData.tags)
  const tags: TagInput[] = []
  
  const genres = allTags.filter(t => t.category === 'Genre').slice(0, 2)
  genres.forEach((g, i) => {
    tags.push({ id: g.id, percent: i === 0 ? 0.6 : 0.4, category: 'Genre' })
  })
  
  const settings = allTags.filter(t => t.category === 'Setting').slice(0, 1)
  settings.forEach(s => {
    tags.push({ id: s.id, percent: 1, category: 'Setting' })
  })
  
  const others = allTags.filter(t => 
    t.category !== 'Genre' && t.category !== 'Setting'
  ).slice(0, count - tags.length)
  
  others.forEach(t => {
    tags.push({ id: t.id, percent: 1, category: t.category })
  })
  
  return tags
}

export interface FullBenchmarkResult {
  wasmAvailable: boolean
  tagCounts: number[]
  results: {
    tagCount: number
    js: BenchmarkResult
    wasm: BenchmarkResult | null
    speedup: number | null
  }[]
  summary: {
    avgJsMs: number
    avgWasmMs: number | null
    avgSpeedup: number | null
  }
}

export function runFullBenchmark(iterations: number = 1000): FullBenchmarkResult {
  const wasmAvailable = isWasmReady()
  const tagCounts = [5, 7, 9, 11]
  const results: FullBenchmarkResult['results'] = []
  
  console.log('=== Calculator Benchmark ===')
  console.log(`WASM available: ${wasmAvailable}`)
  console.log(`Iterations per test: ${iterations}`)
  console.log('')
  
  for (const tagCount of tagCounts) {
    const tags = generateTestTags(tagCount)
    console.log(`Testing with ${tags.length} tags...`)
    
    const jsResult = runBenchmark(
      `JS (${tagCount} tags)`,
      () => calculateMatrixScoreJS(tags),
      iterations
    )
    
    let wasmResult: BenchmarkResult | null = null
    let speedup: number | null = null
    
    if (wasmAvailable) {
      wasmResult = runBenchmark(
        `WASM (${tagCount} tags)`,
        () => calculateMatrixScoreWasm(tags),
        iterations
      )
      speedup = jsResult.avgMs / wasmResult.avgMs
    }
    
    results.push({ tagCount: tags.length, js: jsResult, wasm: wasmResult, speedup })
    
    console.log(`  JS:   ${jsResult.avgMs.toFixed(4)}ms avg (${jsResult.opsPerSecond.toFixed(0)} ops/sec)`)
    if (wasmResult) {
      console.log(`  WASM: ${wasmResult.avgMs.toFixed(4)}ms avg (${wasmResult.opsPerSecond.toFixed(0)} ops/sec)`)
      console.log(`  Speedup: ${speedup!.toFixed(2)}x`)
    }
    console.log('')
  }
  
  const avgJsMs = results.reduce((sum, r) => sum + r.js.avgMs, 0) / results.length
  const avgWasmMs = wasmAvailable 
    ? results.reduce((sum, r) => sum + (r.wasm?.avgMs || 0), 0) / results.length 
    : null
  const avgSpeedup = wasmAvailable && avgWasmMs
    ? avgJsMs / avgWasmMs
    : null
  
  console.log('=== Summary ===')
  console.log(`Average JS:   ${avgJsMs.toFixed(4)}ms`)
  if (avgWasmMs !== null) {
    console.log(`Average WASM: ${avgWasmMs.toFixed(4)}ms`)
    console.log(`Average Speedup: ${avgSpeedup!.toFixed(2)}x`)
  }
  
  return {
    wasmAvailable,
    tagCounts,
    results,
    summary: { avgJsMs, avgWasmMs, avgSpeedup }
  }
}

export function runQuickBenchmark(): string {
  const wasmAvailable = isWasmReady()
  const tags = generateTestTags(9)
  const iterations = 500
  
  const jsResult = runBenchmark('JS', () => calculateMatrixScoreJS(tags), iterations)
  
  if (!wasmAvailable) {
    return `JS only: ${jsResult.avgMs.toFixed(3)}ms (${jsResult.opsPerSecond.toFixed(0)} ops/sec)`
  }
  
  const wasmResult = runBenchmark('WASM', () => calculateMatrixScoreWasm(tags), iterations)
  const speedup = jsResult.avgMs / wasmResult.avgMs
  
  return `JS: ${jsResult.avgMs.toFixed(3)}ms | WASM: ${wasmResult.avgMs.toFixed(3)}ms | Speedup: ${speedup.toFixed(1)}x`
}

// Benchmarks available via direct import only, not exposed to window
