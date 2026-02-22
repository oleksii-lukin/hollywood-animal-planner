import type { ParsedSaveData, SaveSecretsInfo, GameMovie } from '@/types/game'

interface RawSaveFile {
  currentMeta?: unknown
  stateJson: string | Record<string, unknown>
  isDemoEndSave?: boolean
  isDemoTransition?: boolean
  isEmptyData?: boolean
  path?: string
}

interface StateJson {
  tagPool?: Array<{ Item1: string; Item2: string }>
  tagBank?: string[]
  usedTags?: string[]
  currentTagsInCodex?: Record<string, unknown>
  saveMeta?: {
    timestamp?: string
  }
}

/** Ensures the parsed object looks like a Hollywood Animal save, not random JSON. */
function validateSaveFileStructure(rawData: unknown): void {
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Not a valid save file. Expected a Hollywood Animal save (JSON with stateJson).')
  }
  const raw = rawData as Record<string, unknown>
  if (raw.stateJson === undefined) {
    throw new Error('Not a Hollywood Animal save file. Missing stateJson. Load a .json save from the game.')
  }
  let state: unknown
  if (typeof raw.stateJson === 'string') {
    try {
      state = JSON.parse(raw.stateJson)
    } catch {
      throw new Error('Not a valid save file. stateJson could not be parsed.')
    }
  } else if (typeof raw.stateJson === 'object' && raw.stateJson !== null) {
    state = raw.stateJson
  } else {
    throw new Error('Not a Hollywood Animal save file. Invalid stateJson.')
  }
  if (!state || typeof state !== 'object') {
    throw new Error('Not a Hollywood Animal save file. stateJson is empty or invalid.')
  }
  const s = state as Record<string, unknown>
  const hasTagPool = Array.isArray(s.tagPool)
  const hasTagBank = Array.isArray(s.tagBank)
  const hasSaveMeta = s.saveMeta && typeof s.saveMeta === 'object'
  const hasMovies = Array.isArray(s.movies)
  if (!hasTagPool && !hasTagBank && !hasSaveMeta && !hasMovies) {
    throw new Error('Not a Hollywood Animal save file. File does not contain game state (tagPool, tagBank, saveMeta or movies).')
  }
}

export function parseSaveFile(fileContent: string): ParsedSaveData {
  let rawData: RawSaveFile

  try {
    let cleanContent = fileContent
    if (fileContent.charCodeAt(0) === 0xfeff) {
      cleanContent = fileContent.slice(1)
    }
    rawData = JSON.parse(cleanContent)
  } catch (e) {
    throw new Error('Invalid JSON format in save file')
  }

  validateSaveFileStructure(rawData)

  let stateJson: StateJson
  if (typeof rawData.stateJson === 'string') {
    try {
      stateJson = JSON.parse(rawData.stateJson)
    } catch (e) {
      throw new Error('Could not parse stateJson field')
    }
  } else if (typeof rawData.stateJson === 'object') {
    stateJson = rawData.stateJson as StateJson
  } else {
    throw new Error('stateJson field not found or invalid')
  }

  const availableTags: string[] = []
  if (stateJson.tagPool && Array.isArray(stateJson.tagPool)) {
    for (const item of stateJson.tagPool) {
      if (item.Item1) {
        availableTags.push(item.Item1)
      }
    }
  }

  const bankTags: string[] = []
  if (stateJson.tagBank && Array.isArray(stateJson.tagBank)) {
    bankTags.push(...stateJson.tagBank)
  }

  const usedTags: string[] = []
  if (stateJson.usedTags && Array.isArray(stateJson.usedTags)) {
    usedTags.push(...stateJson.usedTags)
  }

  const codexTags: string[] = []
  if (stateJson.currentTagsInCodex && typeof stateJson.currentTagsInCodex === 'object') {
    codexTags.push(...Object.keys(stateJson.currentTagsInCodex))
  }

  let gameDate: string | null = null
  if (stateJson.saveMeta?.timestamp) {
    gameDate = stateJson.saveMeta.timestamp
  }

  const secretsInfo = extractSaveSecrets(stateJson as Record<string, unknown>)
  const ourMovies = extractOurMovies(stateJson as Record<string, unknown>)

  return {
    availableTags,
    bankTags,
    usedTags,
    codexTags,
    gameDate,
    ...(secretsInfo && { secretsInfo }),
    ...(ourMovies.length > 0 && { ourMovies })
  }
}

function extractOurMovies(state: Record<string, unknown>): GameMovie[] {
  const arr = state.movies
  if (!Array.isArray(arr)) return []
  const out: GameMovie[] = []
  for (const m of arr) {
    if (!m || typeof m !== 'object') continue
    const r = m as Record<string, unknown>
    const id = typeof r.id === 'number' ? r.id : NaN
    if (Number.isNaN(id)) continue
    const genreIds = r.genreIdsAndFractions
    const settingIds = r.settingIds
    const contentIds = r.contentIds
    out.push({
      id,
      name: typeof r.name === 'string' ? r.name : 'Untitled',
      scheduledRelease: typeof r.scheduledRelease === 'string' && r.scheduledRelease !== '0001-01-01T00:00:00' ? r.scheduledRelease : null,
      realReleaseDate: typeof r.realReleaseDate === 'string' && r.realReleaseDate !== '0001-01-01T00:00:00' ? (r.realReleaseDate as string) : null,
      creationDate: typeof r.creationDate === 'string' && r.creationDate !== '0001-01-01T00:00:00' ? (r.creationDate as string) : null,
      actuallyReleased: typeof r.actuallyReleased === 'number' ? r.actuallyReleased : 0,
      currentStage: typeof r.currentStage === 'number' ? r.currentStage : 0,
      genreIdsAndFractions: Array.isArray(genreIds) ? (genreIds as GameMovie['genreIdsAndFractions']) : [],
      settingIds: Array.isArray(settingIds) ? (settingIds as string[]) : [],
      contentIds: Array.isArray(contentIds) ? (contentIds as string[]) : [],
      franchiseId: typeof r.franchiseId === 'number' ? r.franchiseId : -1,
      prequelId: typeof r.prequelId === 'number' ? r.prequelId : -1,
      sequelId: typeof r.sequelId === 'number' ? r.sequelId : -1,
      nominations: Array.isArray(r.nominations) ? r.nominations : [],
      polluxes: Array.isArray(r.polluxes) ? r.polluxes : [],
      topBO: typeof r.topBO === 'number' ? r.topBO : 0,
      topCrit: typeof r.topCrit === 'number' ? r.topCrit : 0,
      topAud: typeof r.topAud === 'number' ? r.topAud : 0,
      releaseSlotsHistory: Array.isArray(r.releaseSlotsHistory) ? (r.releaseSlotsHistory as GameMovie['releaseSlotsHistory']) : undefined,
      violations: Array.isArray(r.violations) ? r.violations : undefined
    })
  }
  return out
}

function extractSaveSecrets(state: Record<string, unknown>): SaveSecretsInfo | null {
  const raidState = state.policeRaidsState as Record<string, unknown> | undefined
  const policeRaid =
    raidState && typeof raidState === 'object'
      ? {
          raidsEnabled: Boolean(raidState.raidsEnabled),
          nextRaidDate: typeof raidState.nextRaidDate === 'string' && raidState.nextRaidDate !== '0001-01-01T00:00:00' ? raidState.nextRaidDate : null,
          preparationFirstDay: typeof raidState.preparationFirstDayDate === 'string' && raidState.preparationFirstDayDate !== '0001-01-01T00:00:00' ? (raidState.preparationFirstDayDate as string) : null,
          preparationLastDay: typeof raidState.preparationLastDayDate === 'string' && raidState.preparationLastDayDate !== '0001-01-01T00:00:00' ? (raidState.preparationLastDayDate as string) : null,
          knowsAboutRaid: Boolean(raidState.knowsAboutRaid),
          lastRaidDate: typeof raidState.lastRaidDate === 'string' && raidState.lastRaidDate !== '0001-01-01T00:00:00' ? (raidState.lastRaidDate as string) : null,
          studioUnderRaid: typeof state.studioUnderRaid === 'string' && state.studioUnderRaid ? state.studioUnderRaid : null,
          prevStudioUnderRaid: typeof state.prevStudioUnderRaid === 'string' && state.prevStudioUnderRaid ? state.prevStudioUnderRaid : null
        }
      : null

  const usedPoliceRaidEvents: string[] = Array.isArray(state.usedPoliceRaidEvents) ? (state.usedPoliceRaidEvents as string[]) : []

  const agentId = state.policeSurveillanceAgentId
  const startDate = state.policeSurveillanceStartDate
  const policeSurveillance =
    typeof agentId === 'number' && agentId >= 0 && typeof startDate === 'string' && startDate !== '0001-01-01T00:00:00'
      ? { agentId, startDate }
      : null

  const secretsHistory: Record<string, number> = {}
  const sh = state.secretsHistory
  if (sh && typeof sh === 'object' && !Array.isArray(sh)) {
    for (const [k, v] of Object.entries(sh)) {
      if (typeof v === 'number') secretsHistory[k] = v
    }
  }

  const trials: SaveSecretsInfo['trials'] = []
  const trialsArr = state.trials
  if (Array.isArray(trialsArr)) {
    for (const t of trialsArr) {
      if (t && typeof t === 'object' && typeof (t as Record<string, unknown>).configId === 'string') {
        const r = t as Record<string, unknown>
        trials.push({
          configId: r.configId as string,
          trialDate: (r.trialDate as string) || '',
          beginDate: (r.beginDate as string) || '',
          status: typeof r.status === 'number' ? r.status : 0,
          claimantStudio: (r.claimantStudio as string) || null,
          claimantFirstNameId: (r.claimantFirstNameId as string) || null,
          claimantLastNameId: (r.claimantLastNameId as string) || null
        })
      }
    }
  }

  return { policeRaid, usedPoliceRaidEvents, policeSurveillance, secretsHistory, trials }
}

export async function loadSaveFile(file: File): Promise<ParsedSaveData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const parsed = parseSaveFile(content)
        resolve(parsed)
      } catch (err) {
        reject(err)
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.readAsText(file, 'utf-8')
  })
}
