export interface Tag {
  id: string
  name: string
  category: TagCategory
  art: number
  com: number
  weights: Record<DemographicId, number>
}

export type TagCategory =
  | 'Genre'
  | 'Setting'
  | 'Protagonist'
  | 'Antagonist'
  | 'Supporting Character'
  | 'Theme & Event'
  | 'Finale'

export type DemographicId = 'YM' | 'YF' | 'TM' | 'TF' | 'AM' | 'AF'

export interface Demographic {
  id: DemographicId
  name: string
  baseW: number
  artW: number
  comW: number
}

export interface AdAgent {
  name: string
  targets: DemographicId[]
  type: 0 | 1 | 2 // 0 = Universal, 1 = Art, 2 = Commercial
  level: number
}

export interface Holiday {
  name: string
  bonuses: Record<DemographicId, number>
}

export interface TagInput {
  id: string
  percent: number
  category: TagCategory
}

/** Saved preset of locked + excluded tags for the generator. */
export interface TagPreset {
  id: string
  name: string
  lockedTags: TagInput[]
  excludedTags: TagInput[]
}

export interface GeneratedScript {
  uniqueId: string
  name: string
  tags: TagInput[]
  stats: {
    avgComp: number
    synergySum: number
    maxScriptQuality: number
    movieScore: string
  }
}

export type SavedScriptSource = 'generator' | 'import'

/** Release plan: 5 slots, 2 films per year, 2.5 years. No dates yet. */
export type ReleasePlanUniqueness = 'low' | 'medium' | 'high'

export interface ReleasePlanSettings {
  /** If true, other slots do not affect tag choice. If false, uniquenessLevel applies. */
  allowTagRepetition: boolean
  /** When allowTagRepetition is false: high = no tag repeat across plan, medium = prefer different, low = no extra exclusion. */
  uniquenessLevel: ReleasePlanUniqueness
}

export interface SavedScript extends GeneratedScript {
  pinnedAt: string
  source: SavedScriptSource
  generationSessionId?: string
  /** Save file name when script was pinned/generated with a save loaded */
  saveFileName?: string
}

/** Plan slot entry: script + optional plan-only fields */
export interface PlanSlotEntry extends SavedScript {
  /** When picked from Board, the pinned script's uniqueId */
  sourcePinnedId?: string
  /** When user marks this film as released */
  releasedAt?: string
}

export interface ReleasePlanHistoryEntry {
  id: string
  completedAt: string
  slots: (PlanSlotEntry | null)[]
}

export interface SaveFileData {
  tagPool: Array<{ Item1: string; Item2: string }>
  tagBank: string[]
  usedTags: string[]
  currentTagsInCodex: Record<string, unknown>
}

/** Secret/hidden intel extracted from save (police raid, trials, secrets history). */
export interface SaveSecretsInfo {
  /** Next raid date; preparation window; whether player knows about raid. */
  policeRaid: {
    raidsEnabled: boolean
    nextRaidDate: string | null
    preparationFirstDay: string | null
    preparationLastDay: string | null
    knowsAboutRaid: boolean
    lastRaidDate: string | null
    studioUnderRaid: string | null
    prevStudioUnderRaid: string | null
  } | null
  /** Used raid event ids (e.g. "5_raid_CLOSED_SAFE"). */
  usedPoliceRaidEvents: string[]
  /** Surveillance: agent id and start date (if any). */
  policeSurveillance: { agentId: number; startDate: string } | null
  /** Secret IDs and their state (e.g. SECRET_BG_OPERATING: 3). */
  secretsHistory: Record<string, number>
  /** Trials: configId, date, claimant, status. */
  trials: Array<{
    configId: string
    trialDate: string
    beginDate: string
    status: number
    claimantStudio: string | null
    claimantFirstNameId: string | null
    claimantLastNameId: string | null
  }>
}

/** One movie from the save file (our studio). */
export interface GameMovie {
  id: number
  name: string
  scheduledRelease: string | null
  realReleaseDate: string | null
  creationDate: string | null
  actuallyReleased: number
  currentStage: number
  genreIdsAndFractions: Array<{ Item1: string; Item2: string }>
  settingIds: string[]
  contentIds: string[]
  franchiseId: number
  prequelId: number
  sequelId: number
  nominations: unknown[]
  polluxes: unknown[]
  topBO: number
  topCrit: number
  topAud: number
  releaseSlotsHistory?: Array<{ Item1: string; Item2: string }>
  violations?: unknown[]
}

export interface ParsedSaveData {
  availableTags: string[]
  bankTags: string[]
  usedTags: string[]
  codexTags: string[]
  gameDate: string | null
  fileName?: string
  loadedAt?: string
  /** Extracted “secret” intel (police raid, trials, secrets). Present when save was parsed with secrets. */
  secretsInfo?: SaveSecretsInfo
  /** Our studio's movies from the save (state.movies). */
  ourMovies?: GameMovie[]
}

export interface SaveHistoryEntry {
  id: string
  fileName: string
  loadedAt: string
  gameDate: string | null
  availableTagsCount: number
  bankTagsCount: number
  usedTagsCount: number
  codexTagsCount: number
  data: ParsedSaveData
}

export interface GenerationHistoryEntry {
  id: string
  generatedAt: string
  scripts: GeneratedScript[]
  settings: {
    targetCompatibility: number
    targetMovieScore: number
    profile: 'custom' | 'starting' | 'save' | 'preset'
    lockedCount: number
    excludedCount: number
    /** Locked tags at generation time (for display in history) */
    lockedTags?: TagInput[]
  }
}
