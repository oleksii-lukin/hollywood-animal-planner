import { defineStore } from 'pinia'
import { ref, computed, watch, type Ref } from 'vue'
import type { TagInput, TagPreset, GeneratedScript, SavedScript, ParsedSaveData, SaveHistoryEntry, GenerationHistoryEntry, ReleasePlanSettings, PlanSlotEntry, ReleasePlanHistoryEntry, GameMovie, StaleTagStageFilters } from '@/types/game'
import { useGameDataStore } from '@/stores/gameData'

const RELEASED_IDS_KEY = 'hollywood-animal-planner-released-ids'
/** Set in setup so afterRestore can restore into the same ref (ctx.store may not expose it yet). */
let releasedPinnedScriptIdsRef: Ref<string[]> | null = null

export const useCalculatorStore = defineStore('calculator', () => {
  const synergyTags = ref<TagInput[]>([])
  const advertiserTags = ref<TagInput[]>([])
  const generatorLockedTags = ref<TagInput[]>([])
  const generatorExcludedTags = ref<TagInput[]>([])
  const generatorStaleTags = ref<TagInput[]>([])
  const staleTagsEnabled = ref(false)
  const staleTagStageFilters = ref<StaleTagStageFilters>({ stage1: false, stage2: false, stage3: false, stage4: true })
  
  const commercialScore = ref(5.0)
  const artisticScore = ref(5.0)
  
  const targetCompatibility = ref(4.0)
  const targetMovieScore = ref(6)
  const generatorProfile = ref<'custom' | 'starting' | 'save' | 'preset'>('custom')
  const activePresetId = ref<string | null>(null)
  const tagPresets = ref<TagPreset[]>([])
  
  const generatedScripts = ref<GeneratedScript[]>([])
  const pinnedScripts = ref<SavedScript[]>([])
  const generationHistory = ref<GenerationHistoryEntry[]>([])
  
  const saveFileData = ref<ParsedSaveData | null>(null)
  const saveHistory = ref<SaveHistoryEntry[]>([])
  /** Links from game movie id (from save) to pinned script uniqueId. Key = String(gameMovieId). */
  const gameMovieLinks = ref<Record<string, string>>({})
  /** Movie IDs we treat as released (e.g. when auto-linked on save load). Persisted. */
  const releasedOurMovieIds = ref<number[]>([])
  const ownedScreenings = ref(3185)
  const lastPinnedScriptId = ref<string | null>(null)
  let lastPinnedClearTimer: ReturnType<typeof setTimeout> | null = null

  const DEFAULT_PLAN_SLOTS = 9
  const releasePlanSlots = ref<(PlanSlotEntry | null)[]>(Array(DEFAULT_PLAN_SLOTS).fill(null))
  const releasePlanSettings = ref<ReleasePlanSettings>({
    allowTagRepetition: true,
    uniquenessLevel: 'medium'
  })
  /** Number of scripts to generate in one batch (Generator). Default 9. */
  const generatorBatchSize = ref(9)
  /** When true, batch generator only keeps scripts that meet target compat and target movie score. Default on. */
  const generatorSkipLowQuality = ref(true)
  /** When true, on failed attempt we exclude that script's genres/setting and retry with a different set (no skip until we try many sets). */
  const generatorFullyDiverseTags = ref(false)
  const releasePlanHistory = ref<ReleasePlanHistoryEntry[]>([])
  /** Pinned script uniqueIds that were marked released (e.g. when completing a plan). Shown on Board. */
  const releasedPinnedScriptIds = ref<string[]>([])
  releasedPinnedScriptIdsRef = releasedPinnedScriptIds
  /** Script uniqueIds archived from backlog (hidden from default view, can be restored). */
  const archivedBacklogIds = ref<string[]>([])

  watch(
    releasedPinnedScriptIds,
    (val) => {
      try {
        localStorage.setItem(RELEASED_IDS_KEY, JSON.stringify(val))
      } catch (_) { /* ignore */ }
    },
    { deep: true }
  )

  watch(
    [staleTagStageFilters, staleTagsEnabled],
    () => {
      computeStaleTags()
    },
    { deep: true }
  )

  const availableTagsFromSave = computed(() => saveFileData.value?.availableTags ?? [])
  const codexTagsFromSave = computed(() => saveFileData.value?.codexTags ?? [])
  const hasSaveLoaded = computed(() => saveFileData.value !== null)

  function addTag(context: 'synergy' | 'advertisers' | 'generator' | 'excluded' | 'stale', tag: TagInput) {
    const list = getTagList(context)
    if (!list.value.some(t => t.id === tag.id)) {
      list.value.push(tag)
    }
    if (context === 'excluded') {
      removeTag('generator', tag.id)
    } else if (context === 'generator') {
      removeTag('excluded', tag.id)
      if (staleTagsEnabled.value) {
        removeTag('stale', tag.id)
      }
    } else if (context === 'stale') {
      removeTag('generator', tag.id)
    }
  }

  function removeTag(context: 'synergy' | 'advertisers' | 'generator' | 'excluded' | 'stale', tagId: string) {
    const list = getTagList(context)
    const idx = list.value.findIndex(t => t.id === tagId)
    if (idx !== -1) {
      list.value.splice(idx, 1)
    }
  }

  function updateTagPercent(context: 'synergy' | 'advertisers' | 'generator' | 'excluded' | 'stale', tagId: string, percent: number) {
    const list = getTagList(context)
    const tag = list.value.find(t => t.id === tagId)
    if (tag) {
      tag.percent = percent
    }
  }

  function clearTags(context: 'synergy' | 'advertisers' | 'generator' | 'excluded' | 'stale') {
    const list = getTagList(context)
    list.value = []
  }

  function getTagList(context: 'synergy' | 'advertisers' | 'generator' | 'excluded' | 'stale') {
    switch (context) {
      case 'synergy': return synergyTags
      case 'advertisers': return advertiserTags
      case 'generator': return generatorLockedTags
      case 'excluded': return generatorExcludedTags
      case 'stale': return generatorStaleTags
    }
  }

  function parseTimePassedDays(timePassed: string): number {
    const match = timePassed.match(/^(\d+)\.(\d{2}):(\d{2}):(\d{2})$/)
    if (!match) return 0
    const days = parseInt(match[1], 10)
    const hours = parseInt(match[2], 10)
    const minutes = parseInt(match[3], 10)
    const seconds = parseInt(match[4], 10)
    return days + hours / 24 + minutes / 1440 + seconds / 86400
  }

  function computeStaleTags() {
    const gameData = useGameDataStore()
    const saveData = saveFileData.value
    if (!saveData?.timePassed || !saveData?.ourMovies?.length) {
      generatorStaleTags.value = []
      return
    }
    const totalDays = parseTimePassedDays(saveData.timePassed)
    const currentDate = new Date('1929-01-02T00:00:00')
    currentDate.setUTCDate(currentDate.getUTCDate() + Math.floor(totalDays))
    const cutoffDate = new Date(currentDate)
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 500)

    const allowedStages = new Set([5])
    const filters = staleTagStageFilters.value
    if (filters.stage1) allowedStages.add(1)
    if (filters.stage2) allowedStages.add(2)
    if (filters.stage3) allowedStages.add(3)
    if (filters.stage4) allowedStages.add(4)

    const tagCount = new Map<string, number>()
    for (const movie of saveData.ourMovies) {
      if (!allowedStages.has(movie.currentStage)) continue
      if (movie.currentStage === 5) {
        if (!movie.realReleaseDate) continue
        const releaseDate = new Date(movie.realReleaseDate)
        if (releaseDate < cutoffDate || releaseDate > currentDate) continue
      }
      for (const id of movie.contentIds) {
        tagCount.set(id, (tagCount.get(id) ?? 0) + 1)
      }
    }

    const staleTags: TagInput[] = []
    for (const [id, count] of tagCount) {
      if (count >= 3) {
        const tag = gameData.tags[id]
        staleTags.push({ id, percent: 1, category: tag?.category ?? 'Protagonist' })
      }
    }

    generatorStaleTags.value = staleTags

    if (staleTagsEnabled.value) {
      for (const t of staleTags) {
        removeTag('generator', t.id)
      }
    }
  }

  function pinScript(
    script: GeneratedScript,
    source: 'generator' | 'import' = 'generator',
    generationSessionId?: string
  ) {
    if (!pinnedScripts.value.some(s => s.uniqueId === script.uniqueId)) {
      const saved: SavedScript = {
        ...script,
        name: script.name || 'Untitled Script',
        pinnedAt: new Date().toISOString(),
        source,
        ...(generationSessionId && { generationSessionId }),
        ...(saveFileData.value?.fileName && { saveFileName: saveFileData.value.fileName })
      }
      pinnedScripts.value.push(saved)
      if (lastPinnedClearTimer) clearTimeout(lastPinnedClearTimer)
      lastPinnedScriptId.value = saved.uniqueId
      lastPinnedClearTimer = setTimeout(() => {
        lastPinnedScriptId.value = null
        lastPinnedClearTimer = null
      }, 2800)
    }
  }

  function unpinScript(uniqueId: string) {
    const idx = pinnedScripts.value.findIndex(s => s.uniqueId === uniqueId)
    if (idx !== -1) {
      pinnedScripts.value.splice(idx, 1)
    }
    archivedBacklogIds.value = archivedBacklogIds.value.filter(id => id !== uniqueId)
  }

  function archiveFromBacklog(uniqueId: string) {
    if (!archivedBacklogIds.value.includes(uniqueId)) {
      archivedBacklogIds.value = [...archivedBacklogIds.value, uniqueId]
    }
  }

  function unarchiveFromBacklog(uniqueId: string) {
    archivedBacklogIds.value = archivedBacklogIds.value.filter(id => id !== uniqueId)
  }

  function isScriptArchived(uniqueId: string): boolean {
    return archivedBacklogIds.value.includes(uniqueId)
  }

  function addImportedScript(script: GeneratedScript) {
    if (pinnedScripts.value.some(s => s.uniqueId === script.uniqueId)) return
    const saved: SavedScript = {
      ...script,
      name: script.name || 'Untitled Script',
      pinnedAt: new Date().toISOString(),
      source: 'import'
    }
    pinnedScripts.value.push(saved)
    if (lastPinnedClearTimer) clearTimeout(lastPinnedClearTimer)
    lastPinnedScriptId.value = saved.uniqueId
    lastPinnedClearTimer = setTimeout(() => {
      lastPinnedScriptId.value = null
      lastPinnedClearTimer = null
    }, 2800)
  }

  /** Create a script from save movie data (tags built in UI with gameData) and link the movie to it. Returns new script uniqueId. */
  function createScriptFromMovieAndLink(movie: GameMovie, tags: TagInput[]): string {
    const uniqueId = `save-movie-${movie.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const script: GeneratedScript = {
      uniqueId,
      name: movie.name || 'Untitled Script',
      tags,
      stats: { avgComp: 0, synergySum: 0, maxScriptQuality: 0, movieScore: '0' }
    }
    const saved: SavedScript = {
      ...script,
      pinnedAt: new Date().toISOString(),
      source: 'import',
      ...(saveFileData.value?.fileName && { saveFileName: saveFileData.value.fileName })
    }
    pinnedScripts.value.push(saved)
    setGameMovieLink(movie.id, saved.uniqueId)
    if (movie.actuallyReleased) {
      if (!releasedOurMovieIds.value.includes(movie.id)) {
        releasedOurMovieIds.value = [...releasedOurMovieIds.value, movie.id]
      }
      if (!releasedPinnedScriptIds.value.includes(saved.uniqueId)) {
        releasedPinnedScriptIds.value = [...releasedPinnedScriptIds.value, saved.uniqueId]
      }
    }
    return saved.uniqueId
  }

  function updateScriptName(uniqueId: string, name: string) {
    const script = pinnedScripts.value.find(s => s.uniqueId === uniqueId)
    if (script) {
      script.name = name
    }
    for (const slot of releasePlanSlots.value) {
      if (slot && (slot as PlanSlotEntry).sourcePinnedId === uniqueId) {
        slot.name = name
      }
    }
  }

  function setPlanSlot(slotIndex: number, script: PlanSlotEntry | SavedScript | null) {
    if (slotIndex < 0 || slotIndex >= releasePlanSlots.value.length) return
    releasePlanSlots.value[slotIndex] = script as PlanSlotEntry | null
  }

  function clearPlanSlot(slotIndex: number) {
    setPlanSlot(slotIndex, null)
  }

  /** Copy a pinned script into a plan slot (independent copy). Tracks source for "In plan" on Board. */
  function setPlanSlotFromBoard(slotIndex: number, savedScript: SavedScript) {
    if (slotIndex < 0 || slotIndex >= releasePlanSlots.value.length) return
    const copy: PlanSlotEntry = {
      ...savedScript,
      uniqueId: savedScript.uniqueId + '-plan-' + slotIndex,
      pinnedAt: new Date().toISOString(),
      source: 'import',
      sourcePinnedId: savedScript.uniqueId
    }
    releasePlanSlots.value[slotIndex] = copy
  }

  /** After pinning a plan slot (e.g. "Pre-production"), link the slot to the new pinned script so the plan tracks it. */
  function linkPlanSlotToPinned(slotIndex: number, pinnedScriptUniqueId: string) {
    if (slotIndex < 0 || slotIndex >= releasePlanSlots.value.length) return
    const slot = releasePlanSlots.value[slotIndex]
    if (slot) {
      (slot as PlanSlotEntry).sourcePinnedId = pinnedScriptUniqueId
    }
  }

  function isScriptInPlan(pinnedScriptUniqueId: string): boolean {
    return releasePlanSlots.value.some(slot => slot && (slot as PlanSlotEntry).sourcePinnedId === pinnedScriptUniqueId)
  }

  function markPlanSlotReleased(slotIndex: number) {
    const slot = releasePlanSlots.value[slotIndex]
    if (slot) {
      (slot as PlanSlotEntry).releasedAt = new Date().toISOString()
      const sourceId = (slot as PlanSlotEntry).sourcePinnedId
      if (sourceId && !releasedPinnedScriptIds.value.includes(sourceId)) {
        releasedPinnedScriptIds.value.push(sourceId)
      }
    }
  }

  function unmarkPlanSlotReleased(slotIndex: number) {
    const slot = releasePlanSlots.value[slotIndex]
    if (slot && (slot as PlanSlotEntry).releasedAt) {
      delete (slot as PlanSlotEntry).releasedAt
      const sourceId = (slot as PlanSlotEntry).sourcePinnedId
      if (sourceId) {
        releasedPinnedScriptIds.value = releasedPinnedScriptIds.value.filter(id => id !== sourceId)
      }
    }
  }

  function completePlanAndSaveToHistory() {
    const snapshot = releasePlanSlots.value.map(s => s ? { ...s } : null)
    releasePlanHistory.value.push({
      id: `plan-${Date.now()}`,
      completedAt: new Date().toISOString(),
      slots: snapshot
    })
    for (const slot of releasePlanSlots.value) {
      if (slot && (slot as PlanSlotEntry).sourcePinnedId) {
        const id = (slot as PlanSlotEntry).sourcePinnedId!
        if (!releasedPinnedScriptIds.value.includes(id)) releasedPinnedScriptIds.value.push(id)
      }
    }
    releasePlanSlots.value = Array(DEFAULT_PLAN_SLOTS).fill(null)
  }

  function isPinnedScriptReleased(pinnedScriptUniqueId: string): boolean {
    return releasedPinnedScriptIds.value.includes(pinnedScriptUniqueId)
  }

  function movePlanSlot(fromIndex: number, toIndex: number) {
    const len = releasePlanSlots.value.length
    if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len || fromIndex === toIndex) return
    const arr = [...releasePlanSlots.value]
    const [removed] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, removed)
    releasePlanSlots.value = arr
  }

  function addPlanSlot() {
    releasePlanSlots.value = [...releasePlanSlots.value, null]
  }

  function removePlanSlot(slotIndex: number) {
    if (releasePlanSlots.value.length <= 1) return
    if (slotIndex < 0 || slotIndex >= releasePlanSlots.value.length) return
    const arr = [...releasePlanSlots.value]
    arr.splice(slotIndex, 1)
    releasePlanSlots.value = arr
  }

  function updatePlanSlotName(slotIndex: number, name: string) {
    const slot = releasePlanSlots.value[slotIndex]
    if (slot) {
      slot.name = name
      const sourceId = (slot as PlanSlotEntry).sourcePinnedId
      if (sourceId) updateScriptName(sourceId, name)
    }
  }

  /** Tag IDs used in other slots (for uniqueness). */
  function getTagsUsedInOtherSlots(slotIndex: number): string[] {
    const ids: string[] = []
    releasePlanSlots.value.forEach((slot, i) => {
      if (i !== slotIndex && slot?.tags) {
        slot.tags.forEach(t => ids.push(t.id))
      }
    })
    return ids
  }

  function setSaveFileData(data: ParsedSaveData, fileName: string) {
    const now = new Date().toISOString()
    data.fileName = fileName
    data.loadedAt = now
    saveFileData.value = data
    
    const historyEntry: SaveHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName,
      loadedAt: now,
      gameDate: data.gameDate,
      availableTagsCount: data.availableTags.length,
      bankTagsCount: data.bankTags.length,
      usedTagsCount: data.usedTags.length,
      codexTagsCount: data.codexTags.length,
      data: { ...data }
    }
    saveHistory.value.unshift(historyEntry)
    
    if (saveHistory.value.length > 10) {
      saveHistory.value = saveHistory.value.slice(0, 10)
    }
    autoLinkOurMovies()
    computeStaleTags()
  }

  function loadFromHistory(historyId: string) {
    const entry = saveHistory.value.find(h => h.id === historyId)
    if (entry) {
      saveFileData.value = { ...entry.data }
      autoLinkOurMovies()
      computeStaleTags()
    }
  }

  function removeFromHistory(historyId: string) {
    const idx = saveHistory.value.findIndex(h => h.id === historyId)
    if (idx !== -1) {
      saveHistory.value.splice(idx, 1)
    }
  }

  function clearSaveFileData() {
    saveFileData.value = null
  }

  function setGameMovieLink(gameMovieId: number, pinnedScriptUniqueId: string | null) {
    const key = String(gameMovieId)
    if (pinnedScriptUniqueId) {
      gameMovieLinks.value = { ...gameMovieLinks.value, [key]: pinnedScriptUniqueId }
    } else {
      const next = { ...gameMovieLinks.value }
      delete next[key]
      gameMovieLinks.value = next
    }
  }

  function getPinnedScriptForGameMovie(gameMovieId: number): string | null {
    return gameMovieLinks.value[String(gameMovieId)] ?? null
  }

  function getGameMovieIdForPinnedScript(pinnedScriptUniqueId: string): number | null {
    for (const [k, v] of Object.entries(gameMovieLinks.value)) {
      if (v === pinnedScriptUniqueId) return parseInt(k, 10)
    }
    return null
  }

  /** Collect all tag IDs from a game movie (genres, settings, content). */
  function getMovieTagIds(movie: GameMovie): Set<string> {
    const ids = new Set<string>()
    for (const g of movie.genreIdsAndFractions ?? []) ids.add(g.Item1)
    for (const id of movie.settingIds ?? []) ids.add(id)
    for (const id of movie.contentIds ?? []) ids.add(id)
    return ids
  }

  function normalizeName(s: string): string {
    return (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  }

  /** True if movie and script names are considered a match (reduces false links). */
  function namesMatch(movie: GameMovie, script: SavedScript): boolean {
    const a = normalizeName(movie.name)
    const b = normalizeName(script.name)
    if (!a || !b) return false
    if (a === b) return true
    if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true
    const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 1))
    const wordsB = b.split(/\s+/).filter((w) => w.length > 1)
    if (wordsB.length === 0) return false
    let common = 0
    for (const w of wordsB) {
      if (wordsA.has(w)) common++
    }
    return common >= 2 || common / wordsB.length >= 0.6
  }

  /** Score 0..1: tag overlap ratio. Returns -1 if match is rejected (too weak or name mismatch). */
  function matchScore(movie: GameMovie, script: SavedScript): number {
    const movieIds = getMovieTagIds(movie)
    const scriptIds = new Set(script.tags.map((t) => t.id))
    if (movieIds.size === 0) return 0
    let overlap = 0
    for (const id of movieIds) {
      if (scriptIds.has(id)) overlap++
    }
    const tagRatio = overlap / movieIds.size
    const nameOk = namesMatch(movie, script)
    const minTagOverlap = 2
    const minTagRatio = 0.25
    const highTagRatio = 0.6
    if (overlap < minTagOverlap && tagRatio < minTagRatio) return -1
    if (!nameOk && tagRatio < highTagRatio) return -1
    return tagRatio + (nameOk ? 0.3 : 0)
  }

  /** Mark linked script as released only when the movie is released in the save (actuallyReleased). */
  function markLinkedScriptReleasedIfMovieReleased(movie: GameMovie) {
    const scriptId = gameMovieLinks.value[String(movie.id)]
    if (!scriptId) return
    if (!movie.actuallyReleased) return
    if (!releasedPinnedScriptIds.value.includes(scriptId)) {
      releasedPinnedScriptIds.value = [...releasedPinnedScriptIds.value, scriptId]
    }
  }

  /** Auto-link unmatched ourMovies to backlog scripts by tag (and name) similarity. Called after loading a save.
   * Released status comes only from the save: movie.actuallyReleased. We do not mark auto-linked movies as released. */
  function autoLinkOurMovies() {
    const movies = saveFileData.value?.ourMovies
    if (!movies?.length) return
    const toAdd: number[] = []
    for (const movie of movies) {
      if (gameMovieLinks.value[String(movie.id)] && movie.actuallyReleased && !releasedOurMovieIds.value.includes(movie.id)) {
        toAdd.push(movie.id)
      }
    }
    if (toAdd.length) {
      releasedOurMovieIds.value = [...releasedOurMovieIds.value, ...toAdd]
    }
    for (const movie of movies) {
      markLinkedScriptReleasedIfMovieReleased(movie)
    }
    const linkedButNotReleased = new Set<string>()
    for (const movie of movies) {
      if (!movie.actuallyReleased) {
        const sid = gameMovieLinks.value[String(movie.id)]
        if (sid) linkedButNotReleased.add(sid)
      }
    }
    if (linkedButNotReleased.size > 0) {
      releasedPinnedScriptIds.value = releasedPinnedScriptIds.value.filter((id) => !linkedButNotReleased.has(id))
    }
    if (!pinnedScripts.value.length) return
    const linkedScriptIds = new Set<string>(Object.values(gameMovieLinks.value))
    const availableScripts = pinnedScripts.value.filter(
      (s) => !linkedScriptIds.has(s.uniqueId) && !archivedBacklogIds.value.includes(s.uniqueId)
    )
    if (!availableScripts.length) return
    const unmatchedMovies = movies.filter((m) => !gameMovieLinks.value[String(m.id)])
    if (!unmatchedMovies.length) return
    const usedScriptIds = new Set(linkedScriptIds)
    for (const movie of unmatchedMovies) {
      let best: { script: SavedScript; score: number } | null = null
      for (const script of availableScripts) {
        if (usedScriptIds.has(script.uniqueId)) continue
        const score = matchScore(movie, script)
        if (score >= 0 && (!best || score > best.score)) best = { script, score }
      }
      if (best) {
        setGameMovieLink(movie.id, best.script.uniqueId)
        usedScriptIds.add(best.script.uniqueId)
        if (movie.actuallyReleased) {
          if (!releasedOurMovieIds.value.includes(movie.id)) {
            releasedOurMovieIds.value = [...releasedOurMovieIds.value, movie.id]
          }
          markLinkedScriptReleasedIfMovieReleased(movie)
        }
      }
    }
  }

  /** Released status comes only from the current save (actuallyReleased). */
  function isOurMovieReleased(movie: GameMovie): boolean {
    return Boolean(movie.actuallyReleased)
  }

  function clearHistory() {
    saveHistory.value = []
  }

  function addToGenerationHistory(scripts: GeneratedScript[]) {
    const entry: GenerationHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      generatedAt: new Date().toISOString(),
      scripts: scripts.map(s => ({ ...s })),
      settings: {
        targetCompatibility: targetCompatibility.value,
        targetMovieScore: targetMovieScore.value,
        profile: generatorProfile.value,
        lockedCount: generatorLockedTags.value.length,
        excludedCount: generatorExcludedTags.value.length,
        lockedTags: generatorLockedTags.value.map(t => ({ ...t }))
      }
    }
    generationHistory.value.unshift(entry)
    
    if (generationHistory.value.length > 20) {
      generationHistory.value = generationHistory.value.slice(0, 20)
    }
  }

  function loadFromGenerationHistory(historyId: string) {
    const entry = generationHistory.value.find(h => h.id === historyId)
    if (entry) {
      generatedScripts.value = entry.scripts.map(s => ({ ...s }))
    }
  }

  function removeFromGenerationHistory(historyId: string) {
    const idx = generationHistory.value.findIndex(h => h.id === historyId)
    if (idx !== -1) {
      generationHistory.value.splice(idx, 1)
    }
  }

  function clearGenerationHistory() {
    generationHistory.value = []
  }

  function applyTagPreset(presetId: string) {
    const preset = tagPresets.value.find(p => p.id === presetId)
    if (!preset) return
    generatorProfile.value = 'preset'
    activePresetId.value = presetId
    generatorLockedTags.value = preset.lockedTags.map(t => ({ ...t }))
    generatorExcludedTags.value = preset.excludedTags.map(t => ({ ...t }))
    const excludedIds = new Set(generatorExcludedTags.value.map(t => t.id))
    generatorLockedTags.value = generatorLockedTags.value.filter(t => !excludedIds.has(t.id))
  }

  function saveCurrentAsTagPreset(name: string) {
    const trimmed = name.trim() || 'Unnamed preset'
    const preset: TagPreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      lockedTags: generatorLockedTags.value.map(t => ({ ...t })),
      excludedTags: generatorExcludedTags.value.map(t => ({ ...t }))
    }
    tagPresets.value.push(preset)
    generatorProfile.value = 'preset'
    activePresetId.value = preset.id
  }

  function removeTagPreset(presetId: string) {
    tagPresets.value = tagPresets.value.filter(p => p.id !== presetId)
    if (activePresetId.value === presetId) {
      activePresetId.value = null
      generatorProfile.value = 'custom'
    }
  }

  /** Export preset as JSON string (for file download). */
  function exportPresetToJson(presetId: string): string {
    const preset = tagPresets.value.find(p => p.id === presetId)
    if (!preset) return ''
    return JSON.stringify({ name: preset.name, lockedTags: preset.lockedTags, excludedTags: preset.excludedTags }, null, 2)
  }

  const TAG_CATEGORIES = ['Genre', 'Setting', 'Protagonist', 'Antagonist', 'Supporting Character', 'Theme & Event', 'Finale'] as const
  function normalizeTag(t: unknown): TagInput | null {
    if (!t || typeof t !== 'object') return null
    const o = t as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const percent = typeof o.percent === 'number' ? o.percent : 1
    const category = TAG_CATEGORIES.includes(o.category as (typeof TAG_CATEGORIES)[number]) ? o.category as TagInput['category'] : 'Genre'
    return id ? { id, percent, category } : null
  }

  /** Import preset from JSON string (from file or paste). Returns new preset or null on error. */
  function importPresetFromJson(json: string): TagPreset | null {
    try {
      const raw = JSON.parse(json) as unknown
      if (!raw || typeof raw !== 'object') return null
      const o = raw as Record<string, unknown>
      const name = typeof o.name === 'string' ? o.name.trim() || 'Imported preset' : 'Imported preset'
      const lockedRaw = Array.isArray(o.lockedTags) ? o.lockedTags : []
      const excludedRaw = Array.isArray(o.excludedTags) ? o.excludedTags : []
      const lockedTags: TagInput[] = []
      for (const t of lockedRaw) {
        const tag = normalizeTag(t)
        if (tag) lockedTags.push(tag)
      }
      const excludedTags: TagInput[] = []
      for (const t of excludedRaw) {
        const tag = normalizeTag(t)
        if (tag) excludedTags.push(tag)
      }
      const preset: TagPreset = {
        id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        lockedTags,
        excludedTags
      }
      tagPresets.value.push(preset)
      return preset
    } catch {
      return null
    }
  }

  return {
    synergyTags,
    advertiserTags,
    generatorLockedTags,
    generatorExcludedTags,
    generatorStaleTags,
    staleTagsEnabled,
    staleTagStageFilters,
    commercialScore,
    artisticScore,
    targetCompatibility,
    targetMovieScore,
    generatorProfile,
    activePresetId,
    tagPresets,
    applyTagPreset,
    saveCurrentAsTagPreset,
    removeTagPreset,
    exportPresetToJson,
    importPresetFromJson,
    generatedScripts,
    pinnedScripts,
    generationHistory,
    saveFileData,
    saveHistory,
    ownedScreenings,
    lastPinnedScriptId,
    availableTagsFromSave,
    codexTagsFromSave,
    hasSaveLoaded,
    addTag,
    removeTag,
    updateTagPercent,
    clearTags,
    pinScript,
    unpinScript,
    archiveFromBacklog,
    unarchiveFromBacklog,
    isScriptArchived,
    addImportedScript,
    updateScriptName,
    releasePlanSlots,
    releasePlanSettings,
    generatorBatchSize,
    generatorSkipLowQuality,
    generatorFullyDiverseTags,
    setPlanSlot,
    clearPlanSlot,
    addPlanSlot,
    removePlanSlot,
    setPlanSlotFromBoard,
    linkPlanSlotToPinned,
    getTagsUsedInOtherSlots,
    computeStaleTags,
    isScriptInPlan,
    markPlanSlotReleased,
    unmarkPlanSlotReleased,
    releasePlanHistory,
    completePlanAndSaveToHistory,
    isPinnedScriptReleased,
    movePlanSlot,
    updatePlanSlotName,
    setSaveFileData,
    loadFromHistory,
    removeFromHistory,
    clearSaveFileData,
    clearHistory,
    gameMovieLinks,
    setGameMovieLink,
    getPinnedScriptForGameMovie,
    getGameMovieIdForPinnedScript,
    createScriptFromMovieAndLink,
    isOurMovieReleased,
    addToGenerationHistory,
    loadFromGenerationHistory,
    removeFromGenerationHistory,
    clearGenerationHistory
  }
}, {
  persist: {
    key: 'hollywood-animal-planner',
    paths: [
      'synergyTags',
      'advertiserTags',
      'generatorLockedTags',
      'generatorExcludedTags',
      'commercialScore',
      'artisticScore',
      'targetCompatibility',
      'targetMovieScore',
      'generatorProfile',
      'activePresetId',
      'tagPresets',
      'pinnedScripts',
      'generationHistory',
      'saveFileData',
      'saveHistory',
      'ownedScreenings',
      'releasePlanSlots',
      'releasePlanSettings',
      'generatorBatchSize',
      'generatorSkipLowQuality',
      'generatorFullyDiverseTags',
      'releasePlanHistory',
      'gameMovieLinks',
      'releasedOurMovieIds',
      'archivedBacklogIds',
      'staleTagStageFilters',
      'staleTagsEnabled'
    ],
    afterRestore: (ctx) => {
      try {
        const raw = localStorage.getItem(RELEASED_IDS_KEY)
        if (raw && releasedPinnedScriptIdsRef) {
          const ids = JSON.parse(raw) as unknown
          if (Array.isArray(ids)) releasedPinnedScriptIdsRef.value = ids as string[]
        }
      } catch (_) { /* ignore */ }
      const store = ctx.store as unknown as { pinnedScripts: SavedScript[]; releasePlanSlots: (PlanSlotEntry | null)[]; releasedPinnedScriptIds?: { value?: string[] }; computeStaleTags?: () => void }
      const r = store.releasedPinnedScriptIds
      if (r && !Array.isArray(r.value)) r.value = []
      const raw = store.pinnedScripts
      const scripts: unknown[] = Array.isArray(raw) ? raw : []
      const migrated = scripts.map((s): SavedScript => {
        const item = s as Record<string, unknown>
        return {
          uniqueId: String(item.uniqueId ?? ''),
          name: String(item.name || 'Untitled Script'),
          tags: Array.isArray(item.tags) ? item.tags : [],
          stats: typeof item.stats === 'object' && item.stats ? (item.stats as GeneratedScript['stats']) : { avgComp: 0, synergySum: 0, maxScriptQuality: 0, movieScore: '0' },
          pinnedAt: typeof item.pinnedAt === 'string' ? item.pinnedAt : new Date(0).toISOString(),
          source: item.source === 'generator' || item.source === 'import' ? item.source : 'import',
          ...(typeof item.saveFileName === 'string' && item.saveFileName && { saveFileName: item.saveFileName })
        }
      })
      store.pinnedScripts.splice(0, scripts.length, ...migrated)
      if (!Array.isArray(store.releasePlanSlots) || store.releasePlanSlots.length < 1) {
        store.releasePlanSlots = Array(9).fill(null)
      }
      store.computeStaleTags?.()
    }
  }
})
