<script setup lang="ts">
export type TabId = 'board' | 'plan' | 'generator' | 'synergy' | 'advertisers'

defineProps<{
  activeTab: TabId
}>()

const emit = defineEmits<{
  change: [tab: TabId]
}>()

const mainTabs: { id: TabId; label: string }[] = [
  { id: 'board', label: 'Board' },
  { id: 'plan', label: 'Release Plan' }
]

const subTabs: { id: TabId; label: string }[] = [
  { id: 'generator', label: 'Script Generator' },
  { id: 'synergy', label: 'SE Compatibility' },
  { id: 'advertisers', label: 'Best Advertisers' }
]
</script>

<template>
  <nav class="tab-nav">
    <div class="tab-nav__row">
      <button
        v-for="tab in mainTabs"
        :key="tab.id"
        @click="emit('change', tab.id)"
        class="tab-nav__main-btn"
        :class="activeTab === tab.id
          ? 'bg-accent text-black border-accent'
          : 'bg-transparent text-text-muted border-border hover:border-text hover:text-text'"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="tab-nav__tools-row">
      <span class="tab-nav__tools-label">Tools</span>
      <span class="text-border">|</span>
      <button
        v-for="tab in subTabs"
        :key="tab.id"
        @click="emit('change', tab.id)"
        class="tab-nav__sub-btn"
        :class="activeTab === tab.id
          ? 'bg-accent/20 text-accent border-accent/50'
          : 'bg-transparent text-text-muted border-border hover:border-text hover:text-text'"
      >
        {{ tab.label }}
      </button>
    </div>
  </nav>
</template>
