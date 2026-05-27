import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Tag, TagCategory, Demographic, AdAgent, Holiday, DemographicId } from '@/types/game'

const LANGUAGE_KEY = 'hollywood-animal-planner-language'

export const useGameDataStore = defineStore('gameData', () => {
  const tags = ref<Record<string, Tag>>({})
  const compatibility = ref<Record<string, Record<string, number>>>({})
  const genrePairs = ref<Record<string, Record<string, { Item1: number; Item2: number }>>>({})
  const isLoaded = ref(false)
  const currentLanguage = ref(localStorage.getItem(LANGUAGE_KEY) || 'English')
  const localizationMap = ref<Record<string, string>>({})

  const categories: TagCategory[] = [
    'Genre',
    'Setting',
    'Protagonist',
    'Antagonist',
    'Supporting Character',
    'Theme & Event',
    'Finale'
  ]

  const multiSelectCategories: TagCategory[] = ['Genre', 'Supporting Character', 'Theme & Event']

  const demographics: Record<DemographicId, Demographic> = {
    YM: { id: 'YM', name: 'Young Men', baseW: 0.3, artW: 0.4, comW: 0.25 },
    YF: { id: 'YF', name: 'Young Women', baseW: 0.3, artW: 0.3, comW: 0.25 },
    TM: { id: 'TM', name: 'Boys', baseW: 0.15, artW: 0.05, comW: 0.2 },
    TF: { id: 'TF', name: 'Girls', baseW: 0.15, artW: 0.05, comW: 0.2 },
    AM: { id: 'AM', name: 'Men', baseW: 0.05, artW: 0.1, comW: 0.1 },
    AF: { id: 'AF', name: 'Women', baseW: 0.05, artW: 0.1, comW: 0.1 }
  }

  const adAgents: AdAgent[] = [
    { name: 'NBG', targets: ['AM', 'AF'], type: 0, level: 3 },
    { name: 'Ross&Ross Bros.', targets: ['AM', 'AF'], type: 0, level: 2 },
    { name: 'Vien Pascal', targets: ['TM', 'TF', 'AM', 'AF'], type: 1, level: 2 },
    { name: 'Spark', targets: ['YM', 'YF', 'AM', 'AF'], type: 2, level: 3 },
    { name: 'Nate Sparrow Press', targets: ['YM', 'YF', 'AM', 'AF'], type: 0, level: 3 },
    { name: 'Velvet Gloss', targets: ['TF', 'YF', 'AF'], type: 2, level: 3 },
    { name: 'Pierre Zola Company', targets: ['TM', 'YM', 'AM'], type: 0, level: 2 },
    { name: 'Spice Mice', targets: ['TM', 'TF', 'YM', 'YF'], type: 2, level: 2 }
  ]

  const holidays: Holiday[] = [
    { name: "Valentine's Day", bonuses: { TM: 7, TF: 15, YM: 12, YF: 30, AM: 15, AF: 0 } },
    { name: 'Halloween', bonuses: { TM: 22, TF: 22, YM: 18, YF: 18, AM: 15, AF: 15 } },
    { name: 'Thanksgiving', bonuses: { TM: 7, TF: 7, YM: 15, YF: 15, AM: 22, AF: 22 } },
    { name: 'Independence Day', bonuses: { TM: 9, TF: 0, YM: 13, YF: 5, AM: 18, AF: 7 } },
    { name: 'Christmas', bonuses: { TM: 15, TF: 15, YM: 15, YF: 15, AM: 10, AF: 10 } },
    { name: 'Memorial Day', bonuses: { TM: 9, TF: 0, YM: 16, YF: 5, AM: 18, AF: 7 } }
  ]

  const starterWhitelist = new Set([
    'ACTION', 'COMEDY', 'DRAMA', 'ROMANCE', 'ADVENTURE', 'DETECTIVE', 'HISTORICAL', 'THRILLER',
    'FANTASY_KINGDOM', 'MODERN_AMERICAN_CITY', 'TROPICAL_ISLAND',
    'PROTAGONIST_CLUMSY_OAF', 'PROTAGONIST_COP', 'PROTAGONIST_COWBOY', 'PROTAGONIST_DARING_ADVENTURER',
    'PROTAGONIST_DETECTIVE', 'PROTAGONIST_HOPELESS_ROMANTIC', 'PROTAGONIST_KNIGHT', 'PROTAGONIST_WORKING_MAN',
    'ANTAGONIST_BANDIT', 'ANTAGONIST_CRIMINAL_MASTERMIND', 'ANTAGONIST_EVIL_MONSTER',
    'ANTAGONIST_EVIL_WITCH', 'ANTAGONIST_MURDERER', 'ANTAGONIST_SERIAL_KILLER', 'ANTAGONIST_TRIBAL_CHIEF',
    'SUPPORTINGCHARACTER_ANGRY_BOSS', 'SUPPORTINGCHARACTER_DAMSEL_IN_DISTRESS', 'SUPPORTINGCHARACTER_FEMME_FATALE',
    'SUPPORTINGCHARACTER_LOVE_INTEREST', 'SUPPORTINGCHARACTER_MENTOR', 'SUPPORTINGCHARACTER_RIVAL',
    'SUPPORTINGCHARACTER_SIDEKICK', 'SUPPORTINGCHARACTER_STRICT_PARENT',
    'EVENTS_ANCIENT_PUZZLE', 'THEME_AVENGING_LOVED_ONES', 'EVENTS_BANK_ROBBERY', 'EVENTS_JOUSTING_TOURNAMENT',
    'THEME_LOVE_TRIANGLE', 'EVENTS_PRISON_BREAK', 'THEME_SEARCH_KILLER', 'EVENTS_SHOOTOUT',
    'THEME_SLAPSTICK_MAYHEM', 'THEME_STRUGGLE_FOR_BETTER_LIFE', 'THEME_TREASURE_HUNT',
    'THEME_UNREQUITED_LOVE', 'THEME_WINNING_THE_BELOVED',
    'FINALE_ANTAGONIST_GETS_KILLED', 'FINALE_ANTAGONIST_GETS_PUNISHED', 'FINALE_ANTAGONIST_REPENTS',
    'FINALE_PROTAGONIST_DIES_HEROICALLY', 'FINALE_PROTAGONIST_FINDS_TREASURE',
    'FINALE_PROTAGONIST_GETS_CHANCE_FOR_BETTER_LIFE', 'FINALE_PROTAGONIST_OVERCAME_SELFDOUBT',
    'FINALE_PROTAGONIST_RESCUES_HOSTAGE', 'FINALE_SWEETHEARTS_STAY_TOGETHER'
  ])

  const tagsByCategory = computed(() => {
    const result: Record<TagCategory, Tag[]> = {
      Genre: [],
      Setting: [],
      Protagonist: [],
      Antagonist: [],
      'Supporting Character': [],
      'Theme & Event': [],
      Finale: []
    }
    for (const tag of Object.values(tags.value)) {
      if (result[tag.category]) {
        result[tag.category].push(tag)
      }
    }
    for (const cat of categories) {
      result[cat].sort((a, b) => a.name.localeCompare(b.name))
    }
    return result
  })

  function beautifyTagName(rawId: string): string {
    if (localizationMap.value[rawId]) {
      return localizationMap.value[rawId]
    }
    let name = rawId
    const prefixes = ['PROTAGONIST_', 'ANTAGONIST_', 'SUPPORTINGCHARACTER_', 'THEME_', 'EVENTS_', 'FINALE_', 'EVENT_']
    for (const p of prefixes) {
      if (name.startsWith(p)) {
        name = name.substring(p.length)
        break
      }
    }
    return name
      .replace(/_/g, ' ')
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  async function loadData() {
    if (isLoaded.value) return

    try {
      const base = import.meta.env.BASE_URL
      const [tagRes, weightRes, compRes, genreRes] = await Promise.all([
        fetch(`${base}data/TagData.json`),
        fetch(`${base}data/TagsAudienceWeights.json`),
        fetch(`${base}data/TagCompatibilityData.json`),
        fetch(`${base}data/GenrePairs.json`)
      ])

      const tagDataRaw = await tagRes.json()
      const weightDataRaw = await weightRes.json()
      
      if (compRes.ok) {
        compatibility.value = await compRes.json()
      }
      if (genreRes.ok) {
        genrePairs.value = await genreRes.json()
      }

      for (const [tagId, data] of Object.entries(tagDataRaw) as [string, any][]) {
        if (!weightDataRaw[tagId]) continue

        let category: TagCategory = 'Protagonist'
        if (data.type === 0) category = 'Genre'
        else if (data.type === 1) category = 'Setting'
        else if (data.CategoryID) {
          switch (data.CategoryID) {
            case 'Protagonist': category = 'Protagonist'; break
            case 'Antagonist': category = 'Antagonist'; break
            case 'SupportingCharacter': category = 'Supporting Character'; break
            case 'Theme': category = 'Theme & Event'; break
            case 'Finale': category = 'Finale'; break
            default: category = 'Protagonist'
          }
        }
        if (tagId.startsWith('EVENTS_')) category = 'Theme & Event'

        const weights: Record<DemographicId, number> = {
          YM: 0, YF: 0, TM: 0, TF: 0, AM: 0, AF: 0
        }
        for (const [key, val] of Object.entries(weightDataRaw[tagId].weights)) {
          weights[key as DemographicId] = parseFloat(val as string)
        }

        tags.value[tagId] = {
          id: tagId,
          name: beautifyTagName(tagId),
          category,
          art: parseFloat(data.artValue || 0),
          com: parseFloat(data.commercialValue || 0),
          weights
        }
      }

      isLoaded.value = true
    } catch (e) {
      console.error('Failed to load game data:', e)
    }
  }

  async function loadLocalization(language: string) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}localization/${language}.json`)
      if (!res.ok) throw new Error(`Could not load ${language}.json`)
      
      const locData = await res.json()
      localizationMap.value = {}
      
      if (locData.IdMap && locData.locStrings) {
        for (const [tagId, index] of Object.entries(locData.IdMap) as [string, number][]) {
          if (locData.locStrings[index]) {
            localizationMap.value[tagId] = locData.locStrings[index]
          }
        }
      }

      for (const tagId in tags.value) {
        tags.value[tagId].name = beautifyTagName(tagId)
      }
      
      currentLanguage.value = language
      localStorage.setItem(LANGUAGE_KEY, language)
    } catch (e) {
      console.error('Localization error:', e)
    }
  }

  function getCompatibility(tagA: string, tagB: string): number {
    let val: number
    if (compatibility.value[tagA]?.[tagB] !== undefined) {
      val = parseFloat(String(compatibility.value[tagA][tagB]))
    } else if (compatibility.value[tagB]?.[tagA] !== undefined) {
      val = parseFloat(String(compatibility.value[tagB][tagA]))
    } else {
      return 3.0
    }
    return Number.isFinite(val) ? val : 3.0
  }

  return {
    tags,
    compatibility,
    genrePairs,
    isLoaded,
    currentLanguage,
    categories,
    multiSelectCategories,
    demographics,
    adAgents,
    holidays,
    starterWhitelist,
    tagsByCategory,
    loadData,
    loadLocalization,
    getCompatibility,
    beautifyTagName
  }
})
