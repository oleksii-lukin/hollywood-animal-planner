// AssemblyScript module for heavy calculations

// Compatibility matrix stored as flat array
// Access: matrix[tagA * matrixSize + tagB]
let compatibilityMatrix: Float32Array = new Float32Array(0);
let matrixSize: i32 = 0;

// Tag data arrays (art, com values)
let tagArtValues: Float32Array = new Float32Array(0);
let tagComValues: Float32Array = new Float32Array(0);

// Initialize the compatibility matrix
export function initMatrix(size: i32): void {
  matrixSize = size;
  compatibilityMatrix = new Float32Array(size * size);
}

// Set a single compatibility value
export function setCompatibility(tagA: i32, tagB: i32, value: f32): void {
  if (tagA < matrixSize && tagB < matrixSize) {
    compatibilityMatrix[tagA * matrixSize + tagB] = value;
    compatibilityMatrix[tagB * matrixSize + tagA] = value;
  }
}

// Initialize tag bonuses arrays
export function initTagBonuses(size: i32): void {
  tagArtValues = new Float32Array(size);
  tagComValues = new Float32Array(size);
}

// Set tag bonus values
export function setTagBonus(tagIndex: i32, art: f32, com: f32): void {
  tagArtValues[tagIndex] = art;
  tagComValues[tagIndex] = com;
}

// Get compatibility between two tags
@inline
function getCompatibility(tagA: i32, tagB: i32): f32 {
  if (tagA < matrixSize && tagB < matrixSize) {
    return compatibilityMatrix[tagA * matrixSize + tagB];
  }
  return 3.0; // default neutral
}

// Result storage (to avoid allocations)
let resultTotalScore: f64 = 0;
let resultRawAverage: f64 = 0;
let resultHasConflict: i32 = 0;

// Tag input arrays (reused)
let inputTagIds: Int32Array = new Int32Array(0);
let inputTagPercents: Float32Array = new Float32Array(0);
let inputTagCategories: Int32Array = new Int32Array(0); // 0=Genre, 1=Setting, 2=Other
let inputTagCount: i32 = 0;

// Allocate input arrays
export function allocateInputArrays(maxTags: i32): void {
  inputTagIds = new Int32Array(maxTags);
  inputTagPercents = new Float32Array(maxTags);
  inputTagCategories = new Int32Array(maxTags);
}

// Set input tag
export function setInputTag(index: i32, tagId: i32, percent: f32, category: i32): void {
  inputTagIds[index] = tagId;
  inputTagPercents[index] = percent;
  inputTagCategories[index] = category;
}

// Set total count of input tags
export function setInputTagCount(count: i32): void {
  inputTagCount = count;
}

// Main calculation function
export function calculateMatrixScore(): void {
  let totalScore: f64 = 0;
  let rawSum: f64 = 0;
  let pairCount: i32 = 0;
  resultHasConflict = 0;

  // Calculate raw average (all pairs)
  for (let i: i32 = 0; i < inputTagCount; i++) {
    for (let j: i32 = i + 1; j < inputTagCount; j++) {
      const rawVal = getCompatibility(inputTagIds[i], inputTagIds[j]);
      rawSum += rawVal;
      pairCount++;
    }
  }

  resultRawAverage = pairCount > 0 ? rawSum / <f64>pairCount : 3.0;

  // Calculate weighted scores per tag
  for (let a: i32 = 0; a < inputTagCount; a++) {
    let rowSum: f64 = 0;
    let rowWeight: f64 = 0;
    let worstVal: f32 = 6.0;

    const tagAId = inputTagIds[a];
    const tagAPercent = inputTagPercents[a];

    for (let b: i32 = 0; b < inputTagCount; b++) {
      if (a == b) continue;

      const tagBId = inputTagIds[b];
      const tagBPercent = inputTagPercents[b];
      const tagBCategory = inputTagCategories[b];

      const rawVal = getCompatibility(tagAId, tagBId);
      let score: f64 = (<f64>rawVal - 3.0) / 2.0;
      let weight: f64 = 1.0;

      if (score < 0) {
        if (tagBCategory == 0) { // Genre
          score *= 20.0 * <f64>tagBPercent;
          weight = 20.0 * <f64>tagBPercent;
        } else if (tagBCategory == 1) { // Setting
          score *= 5.0;
          weight = 5.0;
        } else {
          score *= 3.0;
          weight = 3.0;
        }
      } else {
        if (tagBCategory == 0) { // Genre
          score *= <f64>tagBPercent;
          weight = <f64>tagBPercent;
        }
      }

      rowSum += score;
      rowWeight += weight;

      if (rawVal < worstVal) {
        worstVal = rawVal;
      }
    }

    let rowAverage: f64 = rowWeight > 0 ? rowSum / rowWeight : 0;
    const transformedWorst: f64 = (<f64>worstVal - 3.0) / 2.0;
    let finalRowScore: f64 = rowAverage;

    if (worstVal <= 1.0) {
      resultHasConflict = 1;
      finalRowScore = -1.0;
    } else if (transformedWorst < rowAverage) {
      finalRowScore = transformedWorst;
    }

    totalScore += finalRowScore * <f64>tagAPercent;
  }

  if (totalScore >= 0) {
    totalScore *= 0.9;
  } else {
    totalScore *= 1.25;
  }

  resultTotalScore = totalScore;
}

// Getters for results
export function getTotalScore(): f64 {
  return resultTotalScore;
}

export function getRawAverage(): f64 {
  return resultRawAverage;
}

export function hasConflict(): i32 {
  return resultHasConflict;
}

// Bulk set compatibility values (more efficient than one by one)
export function setCompatibilityBulk(data: Float32Array, count: i32): void {
  for (let i: i32 = 0; i < count; i++) {
    const idx = i * 3;
    const tagA = <i32>data[idx];
    const tagB = <i32>data[idx + 1];
    const value = data[idx + 2];
    if (tagA < matrixSize && tagB < matrixSize) {
      compatibilityMatrix[tagA * matrixSize + tagB] = value;
      compatibilityMatrix[tagB * matrixSize + tagA] = value;
    }
  }
}

// Script generator: candidate arrays (filled from JS via setCandidate, then trySwapCandidates runs)
const MAX_CANDIDATES: i32 = 32;
let candidateTagIds: Int32Array = new Int32Array(0);
let candidatePercents: Float32Array = new Float32Array(0);
let candidateCategories: Int32Array = new Int32Array(0);
let candidateCount: i32 = 0;

export function allocateCandidateArrays(): void {
  candidateTagIds = new Int32Array(MAX_CANDIDATES);
  candidatePercents = new Float32Array(MAX_CANDIDATES);
  candidateCategories = new Int32Array(MAX_CANDIDATES);
}

export function setCandidate(index: i32, tagId: i32, percent: f32, category: i32): void {
  if (index >= 0 && index < MAX_CANDIDATES) {
    candidateTagIds[index] = tagId;
    candidatePercents[index] = percent;
    candidateCategories[index] = category;
  }
}

export function setCandidateCount(count: i32): void {
  candidateCount = count <= MAX_CANDIDATES ? count : MAX_CANDIDATES;
}

// Try multiple candidates at one mutable slot; return index of best (or -1 if none better).
export function trySwapCandidates(mutableIndex: i32): i32 {
  if (mutableIndex < 0 || mutableIndex >= inputTagCount || candidateCount <= 0) return -1;
  const cap: i32 = candidateCount < MAX_CANDIDATES ? candidateCount : MAX_CANDIDATES;

  const savedId = inputTagIds[mutableIndex];
  const savedPercent = inputTagPercents[mutableIndex];
  const savedCategory = inputTagCategories[mutableIndex];

  calculateMatrixScore();
  let bestRawAvg: f64 = resultRawAverage;
  let bestIdx: i32 = -1;

  for (let i: i32 = 0; i < cap; i++) {
    setInputTag(mutableIndex, candidateTagIds[i], candidatePercents[i], candidateCategories[i]);
    calculateMatrixScore();
    if (resultRawAverage > bestRawAvg) {
      bestRawAvg = resultRawAverage;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0) {
    setInputTag(mutableIndex, candidateTagIds[bestIdx], candidatePercents[bestIdx], candidateCategories[bestIdx]);
  } else {
    setInputTag(mutableIndex, savedId, savedPercent, savedCategory);
  }
  return bestIdx;
}
