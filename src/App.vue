<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { useGameDataStore } from '@/stores/gameData'
import { initWasmCalculator } from '@/utils/wasmCalculator'
import Navbar from '@/components/Navbar.vue'
import TabNavigation from '@/components/TabNavigation.vue'
import BoardTab from '@/components/tabs/BoardTab.vue'
import PlanTab from '@/components/tabs/PlanTab.vue'
import SynergyTab from '@/components/tabs/SynergyTab.vue'
import GeneratorTab from '@/components/tabs/GeneratorTab.vue'
import AdvertisersTab from '@/components/tabs/AdvertisersTab.vue'

export type TabId = 'board' | 'plan' | 'generator' | 'synergy' | 'advertisers'
const VALID_TABS: TabId[] = ['board', 'plan', 'generator', 'synergy', 'advertisers']

function tabFromHash(): TabId {
  const hash = window.location.hash.slice(1) || 'board'
  return VALID_TABS.includes(hash as TabId) ? (hash as TabId) : 'board'
}

const gameData = useGameDataStore()
const activeTab = ref<TabId>(tabFromHash())
const isLoading = ref(true)
const wasmReady = ref(false)

const runCompatibilityOnNextSynergy = ref(false)
const runAnalyzeOnNextAdvertisers = ref(false)

function handleTabChange(tab: TabId, options?: { pushState?: boolean }) {
  if (options?.pushState) {
    history.pushState({ tab }, '', '#' + tab)
  } else {
    history.replaceState({ tab }, '', '#' + tab)
  }
  activeTab.value = tab
}

function onPopState() {
  const tab = history.state?.tab
  activeTab.value = VALID_TABS.includes(tab) ? tab : 'board'
}

onMounted(async () => {
  history.replaceState({ tab: activeTab.value }, '', '#' + activeTab.value)
  window.addEventListener('popstate', onPopState)

  await gameData.loadData()
  await gameData.loadLocalization(gameData.currentLanguage)

  wasmReady.value = await initWasmCalculator()

  isLoading.value = false
})

onUnmounted(() => {
  window.removeEventListener('popstate', onPopState)
})

provide('switchTab', handleTabChange)
provide('runCompatibilityOnNextSynergy', runCompatibilityOnNextSynergy)
provide('runAnalyzeOnNextAdvertisers', runAnalyzeOnNextAdvertisers)
</script>

<template>
  <div class="min-h-screen bg-bg">
    <Navbar />
    
    <div class="pt-content">
      <div class="container-main">
        <TabNavigation :active-tab="activeTab" @change="handleTabChange" />
        
        <main v-if="!isLoading">
          <BoardTab v-if="activeTab === 'board'" @open-tab="(tab, opts) => handleTabChange(tab, opts)" />
          <PlanTab v-else-if="activeTab === 'plan'" @open-tab="(tab, opts) => handleTabChange(tab, opts)" />
          <SynergyTab v-else-if="activeTab === 'synergy'" />
          <GeneratorTab v-else-if="activeTab === 'generator'" />
          <AdvertisersTab v-else-if="activeTab === 'advertisers'" />
        </main>
        
        <div v-else class="loading-wrap">
          <div class="text-muted-base">Loading...</div>
        </div>
      </div>
    </div>
  </div>
</template>
