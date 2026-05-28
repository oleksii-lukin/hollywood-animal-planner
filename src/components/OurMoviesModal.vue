<script setup lang="ts">
import { ref, computed } from 'vue'
import type { GameMovie, SavedScript, TagInput } from '@/types/game'
import { useCalculatorStore } from '@/stores/calculator'
import { useGameDataStore } from '@/stores/gameData'
import { getTagCategoryClasses } from '@/utils/tagCategoryColors'
import { useI18n } from 'vue-i18n'
import Modal from '@/components/ui/Modal.vue'

const { t } = useI18n()

function stageName(stage: number): string {
  const names: Record<number, string> = {
    0: t('ourMovies.stage0'),
    1: t('generator.stagePreProduction'),
    2: t('generator.stageProduction'),
    3: t('generator.stagePostProduction'),
    4: t('generator.stagePlannedRelease'),
  }
  return names[stage] ?? t('ourMovies.stage0')
}

function movieStageLabel(movie: GameMovie): string {
  if (movie.actuallyReleased && movie.currentStage === 4) return t('ourMovies.inTheatres')
  if (movie.currentStage === 5) return t('ourMovies.archived')
  return stageName(movie.currentStage ?? 0)
}

const props = defineProps<{
  open: boolean
  movies: GameMovie[] | null | undefined
}>()

const emit = defineEmits<{
  close: []
}>()

const calculator = useCalculatorStore()
const gameData = useGameDataStore()

const linkingMovieId = ref<number | null>(null)
const importingAll = ref(false)
const activeTab = ref<'default' | 'imported' | 'unprocessed' | 'stage'>('default')

/** Scripts available for linking: not linked to any other movie (or linked to the current one when changing). */
const pinnedScriptsForLink = computed(() => {
  const movieId = linkingMovieId.value
  return [...calculator.pinnedScripts]
    .filter((s) => {
      const otherMovieId = calculator.getGameMovieIdForPinnedScript(s.uniqueId)
      return otherMovieId == null || otherMovieId === movieId
    })
    .sort((a, b) => new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime())
})

/** Movies sorted by release/date, newest first. */
const sortedMovies = computed(() => {
  const list = props.movies ?? []
  return [...list].sort((a, b) => {
    const dateA = a.realReleaseDate ?? a.scheduledRelease ?? a.creationDate ?? ''
    const dateB = b.realReleaseDate ?? b.scheduledRelease ?? b.creationDate ?? ''
    return new Date(dateB).getTime() - new Date(dateA).getTime()
  })
})

const importedMovies = computed(() => sortedMovies.value.filter(m => linkedScript(m)))
const unprocessedMovies = computed(() => sortedMovies.value.filter(m => !linkedScript(m)))

const filteredMovies = computed(() => {
  if (activeTab.value === 'imported') return importedMovies.value
  if (activeTab.value === 'unprocessed') return unprocessedMovies.value
  return sortedMovies.value
})

const collapsedStages = ref<Set<string>>(new Set())

function toggleStage(key: string) {
  if (collapsedStages.value.has(key)) {
    collapsedStages.value.delete(key)
  } else {
    collapsedStages.value.add(key)
  }
}

const moviesByStage = computed(() => {
  type MovieGroup = { type: 'archived' | 'inTheatres' | 'stage'; key: string; stage?: number; movies: GameMovie[] }
  const stageMap = new Map<number, GameMovie[]>()
  for (const m of sortedMovies.value) {
    if (m.currentStage === 5) continue
    if (m.currentStage === 4 && !!m.actuallyReleased) continue
    const s = m.currentStage ?? 0
    if (!stageMap.has(s)) stageMap.set(s, [])
    stageMap.get(s)!.push(m)
  }

  const groups: MovieGroup[] = []
  for (const [stage, movs] of [...stageMap.entries()].sort((a, b) => a[0] - b[0])) {
    groups.push({ type: 'stage', key: String(stage), stage, movies: movs })
  }

  const inTheatres = sortedMovies.value.filter(m => m.currentStage === 4 && !!m.actuallyReleased)
  if (inTheatres.length) {
    groups.push({ type: 'inTheatres', key: '_inTheatres', movies: inTheatres })
  }

  const archived = sortedMovies.value.filter(m => m.currentStage === 5)
  if (archived.length) {
    groups.push({ type: 'archived', key: '_archived', movies: archived })
  }

  return groups
})

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch (_) {
    return iso
  }
}

function tagName(id: string): string {
  return gameData.tags[id]?.name ?? id
}

function tagCategory(id: string): string {
  return gameData.tags[id]?.category ?? ''
}

function linkedScript(movie: GameMovie): SavedScript | null {
  const uid = calculator.getPinnedScriptForGameMovie(movie.id)
  if (!uid) return null
  return calculator.pinnedScripts.find((s) => s.uniqueId === uid) ?? null
}

function setLink(movieId: number, scriptUniqueId: string) {
  calculator.setGameMovieLink(movieId, scriptUniqueId)
  linkingMovieId.value = null
}

function unlink(movieId: number) {
  calculator.setGameMovieLink(movieId, null)
}

function buildTagsFromMovie(movie: GameMovie): TagInput[] {
  const tags: TagInput[] = []
  for (const g of movie.genreIdsAndFractions ?? []) {
    const pct = typeof g.Item2 === 'string' ? parseFloat(g.Item2) : Number(g.Item2)
    tags.push({ id: g.Item1, percent: Number.isFinite(pct) ? pct : 1, category: 'Genre' })
  }
  for (const id of movie.settingIds ?? []) {
    const cat = gameData.tags[id]?.category ?? 'Setting'
    tags.push({ id, percent: 1, category: cat })
  }
  for (const id of movie.contentIds ?? []) {
    const cat = gameData.tags[id]?.category ?? 'Protagonist'
    tags.push({ id, percent: 1, category: cat })
  }
  return tags
}

function createFromSaveAndLink(movie: GameMovie) {
  const tags = buildTagsFromMovie(movie)
  calculator.createScriptFromMovieAndLink(movie, tags)
  linkingMovieId.value = null
}

function importAllMovies() {
  if (importingAll.value) return
  importingAll.value = true
  for (const movie of unprocessedMovies.value) {
    createFromSaveAndLink(movie)
  }
  importingAll.value = false
}
</script>

<template>
  <Modal :open="open" :title="$t('ourMovies.title')" max-width="2xl" @close="emit('close')">
    <div class="modal-content-scroll">
      <p class="text-muted-sm">
        {{ $t('ourMovies.desc') }}
      </p>

      <template v-if="!movies || movies.length === 0">
        <p class="our-movies__empty-msg">{{ $t('ourMovies.empty') }}</p>
      </template>

      <template v-else>
        <div class="flex justify-end mb-2">
          <button
            v-if="unprocessedMovies.length > 0"
            type="button"
            class="btn-accent-outline-xs"
            :disabled="importingAll"
            @click="importAllMovies"
          >
            {{ $t('ourMovies.importAll', { count: unprocessedMovies.length }) }}
          </button>
        </div>
        <div class="save-modal__tabs">
          <button
            @click="activeTab = 'default'"
            class="save-modal__tab"
            :class="activeTab === 'default' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-text-muted hover:text-text'"
          >
            {{ $t('ourMovies.tabDefault') }}
          </button>
          <button
            @click="activeTab = 'imported'"
            class="save-modal__tab"
            :class="activeTab === 'imported' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-text-muted hover:text-text'"
          >
            {{ $t('ourMovies.tabImported') }}
          </button>
          <button
            @click="activeTab = 'unprocessed'"
            class="save-modal__tab"
            :class="activeTab === 'unprocessed' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-text-muted hover:text-text'"
          >
            {{ $t('ourMovies.tabUnprocessed') }}
          </button>
          <button
            @click="activeTab = 'stage'"
            class="save-modal__tab"
            :class="activeTab === 'stage' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-text-muted hover:text-text'"
          >
            {{ $t('ourMovies.tabStage') }}
          </button>
        </div>

        <!-- Stage tab: grouped by stage -->
        <template v-if="activeTab === 'stage'">
          <div class="space-y-2">
            <div v-for="group in moviesByStage" :key="group.key">
              <div
                class="flex items-center gap-2 cursor-pointer select-none hover:opacity-80 py-1"
                @click="toggleStage(group.key)"
              >
                <span
                  class="text-[10px] transition-transform duration-200"
                  :class="collapsedStages.has(group.key) ? '-rotate-90' : 'rotate-0'"
                >▼</span>
                <span class="text-xs font-semibold uppercase text-accent">
                  <template v-if="group.type === 'archived'">{{ $t('ourMovies.archived') }}</template>
                  <template v-else-if="group.type === 'inTheatres'">{{ $t('ourMovies.inTheatres') }}</template>
                  <template v-else>{{ stageName(group.stage!) }}</template>
                </span>
                <span class="text-muted-xs">({{ group.movies.length }})</span>
              </div>
              <div v-show="!collapsedStages.has(group.key)" class="space-y-3">
                <div
                  v-for="movie in group.movies"
                  :key="movie.id"
                  class="our-movies__card"
                >
                  <div class="our-movies__movie-row">
                    <div class="min-w-0-flex-1">
                      <div class="our-movies__movie-name">{{ movie.name }}</div>
                      <div class="text-muted-sm-mt1">
                        {{ $t('ourMovies.release', { date: formatDate(movie.realReleaseDate ?? movie.scheduledRelease) }) }}
                        <span v-if="calculator.isOurMovieReleased(movie)" class="our-movies__released">{{ $t('ourMovies.released') }}</span>
                        <span v-else class="ml-2">{{ movieStageLabel(movie) }}</span>
                      </div>
                      <div v-if="movie.genreIdsAndFractions?.length" class="our-movies__chips">
                        <span
                          v-for="g in movie.genreIdsAndFractions"
                          :key="g.Item1"
                          class="chip-sm-inline"
                          :class="getTagCategoryClasses('Genre', g.Item1)"
                        >
                          {{ tagName(g.Item1) }}{{ g.Item2 ? ' ' + g.Item2 : '' }}
                        </span>
                      </div>
                      <div v-if="movie.settingIds?.length" class="our-movies__chips our-movies__chips--mt1">
                        <span
                          v-for="sid in movie.settingIds"
                          :key="sid"
                          class="chip-sm-inline"
                          :class="getTagCategoryClasses(tagCategory(sid))"
                        >
                          {{ tagName(sid) }}
                        </span>
                      </div>
                      <div v-if="movie.contentIds?.length" class="our-movies__chips">
                        <span
                          v-for="cid in movie.contentIds.slice(0, 6)"
                          :key="cid"
                          class="chip-sm-inline"
                          :class="getTagCategoryClasses(tagCategory(cid))"
                        >
                          {{ tagName(cid) }}
                        </span>
                        <span v-if="movie.contentIds.length > 6" class="our-movies__more-label">+{{ movie.contentIds.length - 6 }}</span>
                      </div>
                      <div v-if="movie.franchiseId >= 0 || movie.prequelId >= 0 || movie.sequelId >= 0" class="our-movies__meta">
                        <span v-if="movie.franchiseId >= 0">{{ $t('ourMovies.franchise', { id: movie.franchiseId }) }}</span>
                        <span v-if="movie.prequelId >= 0"> · {{ $t('ourMovies.prequel', { id: movie.prequelId }) }}</span>
                        <span v-if="movie.sequelId >= 0"> · {{ $t('ourMovies.sequel', { id: movie.sequelId }) }}</span>
                      </div>
                      <div v-if="movie.nominations?.length || movie.polluxes?.length || movie.topBO || movie.topCrit || movie.topAud" class="our-movies__meta-accent">
                        <span v-if="movie.nominations?.length">{{ $t('ourMovies.nominations', { n: movie.nominations.length }) }}</span>
                        <span v-if="movie.polluxes?.length"> · {{ $t('ourMovies.pollux', { n: movie.polluxes.length }) }}</span>
                        <span v-if="movie.topBO || movie.topCrit || movie.topAud"> · {{ $t('ourMovies.achievements', { bo: movie.topBO, crit: movie.topCrit, aud: movie.topAud }) }}</span>
                      </div>
                    </div>

                    <div class="our-movies__actions-col">
                      <template v-if="linkedScript(movie)">
                        <div class="our-movies__script-label">{{ $t('ourMovies.linkedScript', { name: linkedScript(movie)!.name || '' }) }}</div>
                        <div class="flex-gap-1">
                          <button
                            type="button"
                            class="btn-accent-outline-sm"
                            @click="linkingMovieId = linkingMovieId === movie.id ? null : movie.id"
                          >
                            {{ $t('ourMovies.change') }}
                          </button>
                          <button
                            type="button"
                            class="btn-danger-ghost-sm"
                            @click="unlink(movie.id)"
                          >
                            {{ $t('ourMovies.unlink') }}
                          </button>
                        </div>
                      </template>
                      <template v-else>
                        <button
                          type="button"
                          class="btn-accent-outline-xs"
                          @click="linkingMovieId = linkingMovieId === movie.id ? null : movie.id"
                        >
                          {{ $t('ourMovies.linkToScript') }}
                        </button>
                      </template>

                      <div v-if="linkingMovieId === movie.id" class="our-movies__picker">
                        <button
                          type="button"
                          class="btn-accent-outline-full"
                          @click="createFromSaveAndLink(movie)"
                        >
                          {{ $t('ourMovies.createAndLink') }}
                        </button>
                        <div>
                          <div class="our-movies__hint">{{ $t('ourMovies.chooseExisting') }}</div>
                          <div class="space-y-0.5">
                            <button
                              v-for="script in pinnedScriptsForLink"
                              :key="script.uniqueId"
                              type="button"
                              class="our-movies__script-link"
                              @click="setLink(movie.id, script.uniqueId)"
                            >
                              {{ $t('ourMovies.scriptItem', { name: script.name || '', score: script.stats.movieScore }) }}
                            </button>
                            <p v-if="pinnedScriptsForLink.length === 0" class="text-muted-xs">{{ $t('ourMovies.noUnlinked') }}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Other tabs: flat list -->
        <template v-else>
          <template v-if="filteredMovies.length === 0">
            <p class="our-movies__empty-msg">
              {{ activeTab === 'imported' ? $t('ourMovies.emptyImported') : $t('ourMovies.emptyUnprocessed') }}
            </p>
          </template>

          <div v-else class="space-y-3">
            <div
              v-for="movie in filteredMovies"
              :key="movie.id"
              class="our-movies__card"
            >
              <div class="our-movies__movie-row">
                <div class="min-w-0-flex-1">
                  <div class="our-movies__movie-name">{{ movie.name }}</div>
                  <div class="text-muted-sm-mt1">
                    {{ $t('ourMovies.release', { date: formatDate(movie.realReleaseDate ?? movie.scheduledRelease) }) }}
                    <span v-if="calculator.isOurMovieReleased(movie)" class="our-movies__released">{{ $t('ourMovies.released') }}</span>
                    <span v-else class="ml-2">{{ movieStageLabel(movie) }}</span>
                  </div>
                  <div v-if="movie.genreIdsAndFractions?.length" class="our-movies__chips">
                    <span
                      v-for="g in movie.genreIdsAndFractions"
                      :key="g.Item1"
                      class="chip-sm-inline"
                      :class="getTagCategoryClasses('Genre', g.Item1)"
                    >
                      {{ tagName(g.Item1) }}{{ g.Item2 ? ' ' + g.Item2 : '' }}
                    </span>
                  </div>
                  <div v-if="movie.settingIds?.length" class="our-movies__chips our-movies__chips--mt1">
                    <span
                      v-for="sid in movie.settingIds"
                      :key="sid"
                      class="chip-sm-inline"
                      :class="getTagCategoryClasses(tagCategory(sid))"
                    >
                      {{ tagName(sid) }}
                    </span>
                  </div>
                  <div v-if="movie.contentIds?.length" class="our-movies__chips">
                    <span
                      v-for="cid in movie.contentIds.slice(0, 6)"
                      :key="cid"
                      class="chip-sm-inline"
                      :class="getTagCategoryClasses(tagCategory(cid))"
                    >
                      {{ tagName(cid) }}
                    </span>
                    <span v-if="movie.contentIds.length > 6" class="our-movies__more-label">+{{ movie.contentIds.length - 6 }}</span>
                  </div>
                  <div v-if="movie.franchiseId >= 0 || movie.prequelId >= 0 || movie.sequelId >= 0" class="our-movies__meta">
                    <span v-if="movie.franchiseId >= 0">{{ $t('ourMovies.franchise', { id: movie.franchiseId }) }}</span>
                    <span v-if="movie.prequelId >= 0"> · {{ $t('ourMovies.prequel', { id: movie.prequelId }) }}</span>
                    <span v-if="movie.sequelId >= 0"> · {{ $t('ourMovies.sequel', { id: movie.sequelId }) }}</span>
                  </div>
                  <div v-if="movie.nominations?.length || movie.polluxes?.length || movie.topBO || movie.topCrit || movie.topAud" class="our-movies__meta-accent">
                    <span v-if="movie.nominations?.length">{{ $t('ourMovies.nominations', { n: movie.nominations.length }) }}</span>
                    <span v-if="movie.polluxes?.length"> · {{ $t('ourMovies.pollux', { n: movie.polluxes.length }) }}</span>
                    <span v-if="movie.topBO || movie.topCrit || movie.topAud"> · {{ $t('ourMovies.achievements', { bo: movie.topBO, crit: movie.topCrit, aud: movie.topAud }) }}</span>
                  </div>
                </div>

                <div class="our-movies__actions-col">
                  <template v-if="linkedScript(movie)">
                    <div class="our-movies__script-label">{{ $t('ourMovies.linkedScript', { name: linkedScript(movie)!.name || '' }) }}</div>
                    <div class="flex-gap-1">
                      <button
                        type="button"
                        class="btn-accent-outline-sm"
                        @click="linkingMovieId = linkingMovieId === movie.id ? null : movie.id"
                      >
                        {{ $t('ourMovies.change') }}
                      </button>
                      <button
                        type="button"
                        class="btn-danger-ghost-sm"
                        @click="unlink(movie.id)"
                      >
                        {{ $t('ourMovies.unlink') }}
                      </button>
                    </div>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="btn-accent-outline-xs"
                      @click="linkingMovieId = linkingMovieId === movie.id ? null : movie.id"
                    >
                      {{ $t('ourMovies.linkToScript') }}
                    </button>
                  </template>

                  <div v-if="linkingMovieId === movie.id" class="our-movies__picker">
                    <button
                      type="button"
                      class="btn-accent-outline-full"
                      @click="createFromSaveAndLink(movie)"
                    >
                      {{ $t('ourMovies.createAndLink') }}
                    </button>
                    <div>
                      <div class="our-movies__hint">{{ $t('ourMovies.chooseExisting') }}</div>
                      <div class="space-y-0.5">
                        <button
                          v-for="script in pinnedScriptsForLink"
                          :key="script.uniqueId"
                          type="button"
                          class="our-movies__script-link"
                          @click="setLink(movie.id, script.uniqueId)"
                        >
                          {{ $t('ourMovies.scriptItem', { name: script.name || '', score: script.stats.movieScore }) }}
                        </button>
                        <p v-if="pinnedScriptsForLink.length === 0" class="text-muted-xs">{{ $t('ourMovies.noUnlinked') }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </Modal>
</template>
