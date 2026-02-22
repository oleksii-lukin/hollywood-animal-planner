<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameDataStore } from '@/stores/gameData'
import { useCalculatorStore } from '@/stores/calculator'
import type { TagCategory } from '@/types/game'

const props = defineProps<{
  context: 'synergy' | 'advertisers' | 'generator' | 'excluded'
}>()

const gameData = useGameDataStore()
const calculator = useCalculatorStore()

const query = ref('')
const showResults = ref(false)

const searchResults = computed(() => {
  if (query.value.length < 2) return []
  
  const q = query.value.toLowerCase()
  return Object.values(gameData.tags)
    .filter(tag => 
      tag.name.toLowerCase().includes(q) ||
      tag.category.toLowerCase().includes(q)
    )
    .slice(0, 15)
})

function selectTag(tagId: string, category: TagCategory) {
  calculator.addTag(props.context, {
    id: tagId,
    percent: 1.0,
    category
  })
  query.value = ''
  showResults.value = false
}

function hideResults() {
  setTimeout(() => { showResults.value = false }, 200)
}
</script>

<template>
  <div class="relative">
    <input
      v-model="query"
      type="text"
      placeholder="Search tags..."
      class="quick-search__input"
      @focus="showResults = true"
      @blur="hideResults"
    >
    
    <div
      v-if="showResults && searchResults.length > 0"
      class="quick-search__dropdown"
    >
      <div
        v-for="tag in searchResults"
        :key="tag.id"
        class="quick-search__item"
        @mousedown.prevent="selectTag(tag.id, tag.category)"
      >
        <strong>{{ tag.name }}</strong>
        <small class="quick-search__item-meta">{{ tag.category }}</small>
      </div>
    </div>
  </div>
</template>
