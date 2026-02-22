<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameDataStore } from '@/stores/gameData'
import { useCalculatorStore } from '@/stores/calculator'
import { genreTagSliderColors } from '@/utils/tagCategoryColors'
import type { TagCategory, TagInput } from '@/types/game'

const props = defineProps<{
  context: 'synergy' | 'advertisers' | 'generator' | 'excluded'
  showPercentSlider?: boolean
}>()

const gameData = useGameDataStore()
const calculator = useCalculatorStore()

const emptySlots = ref<Record<TagCategory, number>>({
  Genre: 0,
  Setting: 0,
  Protagonist: 0,
  Antagonist: 0,
  'Supporting Character': 0,
  'Theme & Event': 0,
  Finale: 0
})

const collapsedCategories = ref<Set<TagCategory>>(new Set())

function toggleCategory(category: TagCategory) {
  if (collapsedCategories.value.has(category)) {
    collapsedCategories.value.delete(category)
  } else {
    collapsedCategories.value.add(category)
  }
}

function isCategoryCollapsed(category: TagCategory): boolean {
  return collapsedCategories.value.has(category)
}

const selectedTags = computed(() => {
  switch (props.context) {
    case 'synergy': return calculator.synergyTags
    case 'advertisers': return calculator.advertiserTags
    case 'generator': return calculator.generatorLockedTags
    case 'excluded': return calculator.generatorExcludedTags
  }
})

const tagsByCategory = computed(() => {
  const result: Record<TagCategory, TagInput[]> = {
    Genre: [],
    Setting: [],
    Protagonist: [],
    Antagonist: [],
    'Supporting Character': [],
    'Theme & Event': [],
    Finale: []
  }
  for (const tag of selectedTags.value) {
    if (result[tag.category]) {
      result[tag.category].push(tag)
    }
  }
  return result
})

/** Fallback when genre id is not in game palette (by index). */
const genreColorFallbacks = [
  { bg: 'bg-[#2c3761]/30', border: 'border-[#2c3761]', track: '#2c3761' },
  { bg: 'bg-[#325964]/30', border: 'border-[#325964]', track: '#325964' },
  { bg: 'bg-[#315247]/30', border: 'border-[#315247]', track: '#315247' },
  { bg: 'bg-[#5c2b1e]/30', border: 'border-[#5c2b1e]', track: '#5c2b1e' },
  { bg: 'bg-[#714042]/30', border: 'border-[#714042]', track: '#714042' },
  { bg: 'bg-[#4c6234]/30', border: 'border-[#4c6234]', track: '#4c6234' },
  { bg: 'bg-[#926339]/30', border: 'border-[#926339]', track: '#926339' },
  { bg: 'bg-[#603556]/30', border: 'border-[#603556]', track: '#603556' }
]

function getGenreColor(tagId: string, index: number) {
  return genreTagSliderColors[tagId] ?? genreColorFallbacks[index % genreColorFallbacks.length]
}

function isMultiSelect(category: TagCategory): boolean {
  if (props.context === 'excluded') return true
  return gameData.multiSelectCategories.includes(category)
}

function addEmptySlot(category: TagCategory) {
  emptySlots.value[category]++
}

function removeEmptySlot(category: TagCategory) {
  if (emptySlots.value[category] > 0) {
    emptySlots.value[category]--
  }
}

function addTag(category: TagCategory, tagId: string, fromEmptySlot = false) {
  if (!tagId) return
  const tag = gameData.tags[tagId]
  if (!tag) return

  calculator.addTag(props.context, {
    id: tagId,
    percent: 1.0,
    category
  })
  
  if (fromEmptySlot && emptySlots.value[category] > 0) {
    emptySlots.value[category]--
  }
  
  if (category === 'Genre') {
    redistributeGenrePercents()
  }
}

function removeTag(tagId: string) {
  const tag = selectedTags.value.find(t => t.id === tagId)
  calculator.removeTag(props.context, tagId)
  
  if (tag?.category === 'Genre') {
    redistributeGenrePercents()
  }
}

function redistributeGenrePercents() {
  const genres = tagsByCategory.value.Genre
  if (genres.length === 0) return
  
  const equalPercent = 1.0 / genres.length
  for (const genre of genres) {
    calculator.updateTagPercent(props.context, genre.id, equalPercent)
  }
}

function updatePercent(tagId: string, percent: number) {
  const newPercent = Math.max(0, Math.min(100, percent)) / 100
  const genres = tagsByCategory.value.Genre
  
  if (genres.length <= 1) {
    calculator.updateTagPercent(props.context, tagId, newPercent)
    return
  }
  
  const otherGenres = genres.filter(g => g.id !== tagId)
  const currentOthersSum = otherGenres.reduce((sum, g) => sum + g.percent, 0)
  
  const remaining = 1.0 - newPercent
  
  if (remaining <= 0) {
    calculator.updateTagPercent(props.context, tagId, 1.0)
    for (const g of otherGenres) {
      calculator.updateTagPercent(props.context, g.id, 0)
    }
    return
  }
  
  calculator.updateTagPercent(props.context, tagId, newPercent)
  
  if (currentOthersSum > 0) {
    const scale = remaining / currentOthersSum
    for (const g of otherGenres) {
      calculator.updateTagPercent(props.context, g.id, g.percent * scale)
    }
  } else {
    const equalShare = remaining / otherGenres.length
    for (const g of otherGenres) {
      calculator.updateTagPercent(props.context, g.id, equalShare)
    }
  }
}

function getAvailableTags(category: TagCategory) {
  const categoryTags = gameData.tagsByCategory[category] || []
  const selectedIds = new Set(selectedTags.value.map(t => t.id))
  
  if (calculator.saveFileData && props.context !== 'excluded') {
    const availableSet = new Set(calculator.availableTagsFromSave)
    return categoryTags.filter(t => availableSet.has(t.id) && !selectedIds.has(t.id))
  }
  
  return categoryTags.filter(t => !selectedIds.has(t.id))
}

function isCodexTag(tagId: string): boolean {
  return calculator.codexTagsFromSave.includes(tagId)
}
</script>

<template>
  <div class="tag-selector__grid">
    <div
      v-for="category in gameData.categories"
      :key="category"
      class="tag-selector__category-panel"
      :class="{ 'tag-selector__category-panel--excluded': context === 'excluded' }"
    >
      <div 
        class="tag-selector__category-header"
        @click="toggleCategory(category)"
      >
        <div class="tag-selector__header-left">
          <span 
            class="tag-selector__category-chevron"
            :class="isCategoryCollapsed(category) ? '-rotate-90' : 'rotate-0'"
          >▼</span>
          <span class="tag-selector__category-name">{{ category }}</span>
          <span 
            v-if="tagsByCategory[category].length > 0" 
            class="tag-selector__category-badge"
            :class="context === 'excluded' ? 'bg-danger/20 text-danger' : 'bg-accent/20 text-accent'"
          >
            {{ tagsByCategory[category].length }}
          </span>
        </div>
        <button
          v-if="isMultiSelect(category)"
          @click.stop="addEmptySlot(category)"
          class="tag-selector__add-btn"
          :class="{ 'tag-selector__add-btn--excluded': context === 'excluded' }"
        >
          +
        </button>
      </div>

      <!-- Existing selections -->
      <div 
        v-show="!isCategoryCollapsed(category)"
        class="tag-selector__content"
      >
        <div
          v-for="tag in tagsByCategory[category]"
          :key="tag.id"
          class="space-y-1"
        >
          <div class="tag-selector__row">
            <select
              :value="tag.id"
              @change="(e) => {
                const newId = (e.target as HTMLSelectElement).value
                if (newId !== tag.id) {
                  removeTag(tag.id)
                  if (newId) addTag(category, newId)
                }
              }"
              class="tag-selector__input-inline"
              :class="{ 'focus:border-danger': context === 'excluded' }"
            >
              <option value="">--</option>
              <option
                v-for="opt in [...getAvailableTags(category), gameData.tags[tag.id]].filter(Boolean)"
                :key="opt.id"
                :value="opt.id"
                :class="{ 'text-danger': isCodexTag(opt.id) }"
              >
                {{ opt.name }}{{ isCodexTag(opt.id) ? ' ⚠' : '' }}
              </option>
            </select>

            <button
              v-if="isMultiSelect(category)"
              @click="removeTag(tag.id)"
              class="tag-selector__remove-btn"
            >
              ×
            </button>
          </div>

          <!-- Genre percent slider -->
          <div
            v-if="showPercentSlider && category === 'Genre' && tagsByCategory.Genre.length > 1"
            class="tag-selector__slider-row"
            :class="[getGenreColor(tag.id, tagsByCategory.Genre.indexOf(tag)).bg, getGenreColor(tag.id, tagsByCategory.Genre.indexOf(tag)).border]"
          >
            <input
              type="range"
              :value="tag.percent * 100"
              @input="(e) => updatePercent(tag.id, Number((e.target as HTMLInputElement).value))"
              min="0"
              max="100"
              class="tag-selector__slider-input"
              :style="{ '--track-color': getGenreColor(tag.id, tagsByCategory.Genre.indexOf(tag)).track }"
            >
            <span class="tag-selector__weight-label" :title="'Genre weight ' + Math.round(tag.percent * 100) + '%'">
              {{ Math.round(tag.percent * 100) }}%
            </span>
            <input
              type="number"
              :value="Math.round(tag.percent * 100)"
              @input="(e) => updatePercent(tag.id, Number((e.target as HTMLInputElement).value))"
              min="0"
              max="100"
              class="tag-selector__percent-input"
              aria-label="Genre percent"
            >
          </div>
        </div>

        <!-- Empty state: first dropdown -->
        <select
          v-if="tagsByCategory[category].length === 0 && emptySlots[category] === 0"
          @change="(e) => addTag(category, (e.target as HTMLSelectElement).value)"
          class="tag-selector__input-full"
          :class="{ 'focus:border-danger': context === 'excluded' }"
        >
          <option value="">-- {{ category }} --</option>
          <option
            v-for="opt in getAvailableTags(category)"
            :key="opt.id"
            :value="opt.id"
            :class="{ 'text-danger': isCodexTag(opt.id) }"
          >
            {{ opt.name }}{{ isCodexTag(opt.id) ? ' ⚠' : '' }}
          </option>
        </select>
        
        <!-- Empty slots for multi-select -->
        <div
          v-for="slotIdx in emptySlots[category]"
          :key="'empty-' + slotIdx"
          class="tag-selector__row"
        >
          <select
            @change="(e) => addTag(category, (e.target as HTMLSelectElement).value, true)"
            class="tag-selector__input-inline"
            :class="{ 'focus:border-danger': context === 'excluded' }"
          >
            <option value="">-- {{ category }} --</option>
            <option
              v-for="opt in getAvailableTags(category)"
              :key="opt.id"
              :value="opt.id"
              :class="{ 'text-danger': isCodexTag(opt.id) }"
            >
              {{ opt.name }}{{ isCodexTag(opt.id) ? ' ⚠' : '' }}
            </option>
          </select>
          <button
            @click="removeEmptySlot(category)"
            class="tag-selector__remove-btn"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
