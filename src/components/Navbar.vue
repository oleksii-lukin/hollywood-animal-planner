<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'
import { useThemeStore } from '@/stores/theme'
import { loadSaveFile } from '@/utils/saveFileParser'
import LanguageSelector from './LanguageSelector.vue'
import SaveFileUpload from './SaveFileUpload.vue'
import SaveDataModal from './SaveDataModal.vue'
import DebugModal from './DebugModal.vue'
import Modal from './ui/Modal.vue'

const calculator = useCalculatorStore()
const themeStore = useThemeStore()

const showUploadModal = ref(false)
const showDataModal = ref(false)
const showDebugModal = ref(false)
const uploadError = ref<string | null>(null)
const mobileMenuOpen = ref(false)

const isHidden = ref(false)
let lastScrollY = 0

function handleScroll() {
  const currentScrollY = window.scrollY
  if (currentScrollY > lastScrollY && currentScrollY > 50) {
    isHidden.value = true
    mobileMenuOpen.value = false
  } else {
    isHidden.value = false
  }
  lastScrollY = currentScrollY
}

// Multi-tab warning: detect if app is open in another tab/window
const MULTI_TAB_KEY = 'hollywood-animal-planner-tab-heartbeat'
const HEARTBEAT_INTERVAL_MS = 2000
const STALE_MS = 5000
const multipleTabsWarning = ref(false)
let tabId = ''
let heartbeatInterval: ReturnType<typeof setInterval> | null = null

function checkOtherTabs() {
  try {
    const raw = localStorage.getItem(MULTI_TAB_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as { tabId?: string; ts?: number }
    if (data.tabId && data.tabId !== tabId && typeof data.ts === 'number' && data.ts > Date.now() - STALE_MS) {
      multipleTabsWarning.value = true
    }
  } catch (_) { /* ignore */ }
}

function writeHeartbeat() {
  try {
    localStorage.setItem(MULTI_TAB_KEY, JSON.stringify({ tabId, ts: Date.now() }))
  } catch (_) { /* ignore */ }
}

function onStorageHeartbeat(e: StorageEvent) {
  if (e.key !== MULTI_TAB_KEY || e.newValue == null) return
  try {
    const data = JSON.parse(e.newValue) as { tabId?: string; ts?: number }
    if (data.tabId && data.tabId !== tabId && typeof data.ts === 'number' && data.ts > Date.now() - STALE_MS) {
      multipleTabsWarning.value = true
    }
  } catch (_) { /* ignore */ }
}

onMounted(() => {
  themeStore.applyTheme()
  window.addEventListener('scroll', handleScroll, { passive: true })
  tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  writeHeartbeat()
  checkOtherTabs()
  heartbeatInterval = setInterval(() => {
    writeHeartbeat()
    checkOtherTabs()
  }, HEARTBEAT_INTERVAL_MS)
  window.addEventListener('storage', onStorageHeartbeat)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  if (heartbeatInterval) clearInterval(heartbeatInterval)
  window.removeEventListener('storage', onStorageHeartbeat)
})

async function handleFileUpload(file: File) {
  uploadError.value = null
  try {
    const parsed = await loadSaveFile(file)
    calculator.setSaveFileData(parsed, file.name)
    showUploadModal.value = false
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : 'Failed to parse save file'
  }
}

function clearSaveData() {
  calculator.clearSaveFileData()
}
</script>

<template>
  <nav 
    class="app-nav nav-bar"
    :class="{ '-translate-y-full': isHidden }"
  >
    <div class="navbar-inner">
      <div class="nav__inner">
        <!-- Logo: click opens debug modal -->
        <button
          type="button"
          class="nav__logo"
          @click="showDebugModal = true"
        >
          <span class="nav__logo-text">
            HA <span class="text-accent">Calc</span>
          </span>
        </button>

        <!-- Multi-tab warning (to the right of logo) -->
        <div
          v-if="multipleTabsWarning"
          class="nav__warning"
        >
          <span class="nav__badge-warning">
            {{ $t('navbar.multitabWarning') }}
          </span>
        </div>

        <!-- Desktop Actions -->
        <div class="nav__desktop-actions">
          <!-- Save file status -->
          <div v-if="calculator.hasSaveLoaded" class="nav__save-group">
            <button
              @click="showDataModal = true"
              class="nav__save-btn"
            >
              <span class="nav__status-dot"></span>
              {{ $t('navbar.save') }}
            </button>
            <button
              @click="clearSaveData"
              class="nav__icon-ghost"
              :title="$t('navbar.clear')"
            >
              <svg class="icon-size-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <button
            v-else
            @click="showUploadModal = true"
            class="nav__btn-outline"
          >
            {{ $t('navbar.loadSave') }}
          </button>
          
          <!-- History -->
          <button
            v-if="calculator.saveHistory.length > 0"
            @click="showDataModal = true"
            class="nav__btn-outline"
          >
            {{ calculator.saveHistory.length }}
          </button>
          
          <div class="nav__divider"></div>
          
          <!-- Theme -->
          <div class="theme-toggle-group">
            <button
              type="button"
              class="nav__theme-btn"
              :class="themeStore.themeId === 'default' ? 'bg-accent text-black border-accent' : 'text-text-muted hover:text-text border-transparent'"
              :title="$t('navbar.theme.defaultTooltip')"
              @click="themeStore.setTheme('default')"
            >
              {{ $t('navbar.theme.default') }}
            </button>
            <button
              type="button"
              class="theme-btn"
              :class="themeStore.themeId === 'warm' ? 'bg-accent text-black border-accent' : 'text-text-muted hover:text-text border-transparent'"
              :title="$t('navbar.theme.warmTooltip')"
              @click="themeStore.setTheme('warm')"
            >
              {{ $t('navbar.theme.warm') }}
            </button>
            <button
              type="button"
              class="theme-btn"
              :class="themeStore.themeId === 'valve' ? 'bg-accent text-black border-accent' : 'text-text-muted hover:text-text border-transparent'"
              :title="$t('navbar.theme.valveTooltip')"
              @click="themeStore.setTheme('valve')"
            >
              {{ $t('navbar.theme.valve') }}
            </button>
          </div>
          
          <LanguageSelector compact />
        </div>

        <!-- Mobile menu button -->
        <button
          @click="mobileMenuOpen = !mobileMenuOpen"
          class="nav__mobile-trigger"
        >
          <svg v-if="!mobileMenuOpen" class="icon-size-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <svg v-else class="icon-size-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Mobile menu -->
      <div 
        v-if="mobileMenuOpen" 
        class="nav__mobile-panel"
      >
        <div class="nav__mobile-content">
          <!-- Save file -->
          <div v-if="calculator.hasSaveLoaded" class="nav__mobile-save-row">
            <button
              @click="showDataModal = true; mobileMenuOpen = false"
              class="nav__status-mobile"
            >
              <span class="nav__status-dot-pulse"></span>
              {{ $t('navbar.mobile.saveLoaded') }}
            </button>
            <button
              @click="clearSaveData"
              class="nav__icon-ghost--lg"
            >
              {{ $t('navbar.mobile.clear') }}
            </button>
          </div>
          <button
            v-else
            @click="showUploadModal = true; mobileMenuOpen = false"
            class="nav__mobile-btn"
          >
            {{ $t('navbar.mobile.loadSaveFile') }}
          </button>
          
          <!-- History -->
          <button
            v-if="calculator.saveHistory.length > 0"
            @click="showDataModal = true; mobileMenuOpen = false"
            class="nav__mobile-btn"
          >
            {{ $t('navbar.mobile.history', { count: calculator.saveHistory.length }) }}
          </button>
          
          <!-- Theme -->
          <div class="nav__theme-group-mobile">
            <button
              type="button"
              class="nav__theme-btn-mobile-first"
              :class="themeStore.themeId === 'default' ? 'bg-accent text-black' : 'text-text-muted hover:text-text'"
              @click="themeStore.setTheme('default')"
            >
              {{ $t('navbar.theme.default') }}
            </button>
            <button
              type="button"
              class="nav__theme-btn-mobile"
              :class="themeStore.themeId === 'warm' ? 'bg-accent text-black' : 'text-text-muted hover:text-text'"
              @click="themeStore.setTheme('warm')"
            >
              {{ $t('navbar.theme.warm') }}
            </button>
            <button
              type="button"
              class="nav__theme-btn-mobile"
              :class="themeStore.themeId === 'valve' ? 'bg-accent text-black' : 'text-text-muted hover:text-text'"
              @click="themeStore.setTheme('valve')"
            >
              {{ $t('navbar.theme.valve') }}
            </button>
          </div>
          
          <div class="pt-2">
            <LanguageSelector />
          </div>
        </div>
      </div>
    </div>
  </nav>

  <!-- Upload Modal -->
  <Modal :open="showUploadModal" :title="$t('navbar.uploadModal.title')" @close="showUploadModal = false">
    <div class="p-5">
      <p class="nav__mobile-desc">
        {{ $t('navbar.uploadModal.desc') }}
      </p>
      
      <SaveFileUpload @file-selected="handleFileUpload" />
      
      <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
    </div>
  </Modal>

  <!-- Save Data Modal -->
  <SaveDataModal 
    :open="showDataModal" 
    @close="showDataModal = false"
    @upload="showUploadModal = true; showDataModal = false"
  />

  <!-- Debug modal (opens from logo click) -->
  <DebugModal :open="showDebugModal" @close="showDebugModal = false" />
</template>
