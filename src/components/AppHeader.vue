<script setup lang="ts">
import { ref } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'
import { loadSaveFile } from '@/utils/saveFileParser'
import LanguageSelector from './LanguageSelector.vue'
import SaveFileUpload from './SaveFileUpload.vue'
import SaveDataModal from './SaveDataModal.vue'

const calculator = useCalculatorStore()

const showUploadModal = ref(false)
const showDataModal = ref(false)
const uploadError = ref<string | null>(null)

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
  <header class="mb-6 sm:mb-8">
    <div class="header-row">
      <div>
        <h1 class="app-header__title">
          Hollywood <span class="text-accent">Animal</span>
        </h1>
        <h2 class="app-header__subtitle">Calculator</h2>
      </div>
      
      <div class="app-header__actions-row">
        <!-- Save file status button -->
        <div v-if="calculator.hasSaveLoaded" class="app-header__save-group">
          <button
            @click="showDataModal = true"
            class="app-header__save-btn"
          >
            <span class="nav__status-dot-pulse"></span>
            Save Loaded
          </button>
          <button
            @click="clearSaveData"
            class="app-header__icon-ghost"
            title="Clear save data"
          >
            ×
          </button>
        </div>
        <button
          v-else
          @click="showUploadModal = true"
          class="app-header__btn-round"
        >
          Load Save File
        </button>
        
        <!-- History button -->
        <button
          v-if="calculator.saveHistory.length > 0"
          @click="showDataModal = true"
          class="app-header__btn-round"
          title="View save history"
        >
          📋 History ({{ calculator.saveHistory.length }})
        </button>
        
        <LanguageSelector />
      </div>
    </div>
    
    <!-- Upload Modal -->
    <Teleport to="body">
      <div
        v-if="showUploadModal"
        class="overlay-dark"
        @click.self="showUploadModal = false"
      >
        <div class="app-header__upload-card">
          <h3 class="modal__title-lg">Load Save File</h3>
          
          <p class="text-muted-base mb-4">
            Upload your Hollywood Animal save file to auto-populate available tags. 
            The file is processed locally and not uploaded anywhere.
          </p>
          
          <SaveFileUpload @file-selected="handleFileUpload" />
          
          <p v-if="uploadError" class="app-header__upload-error">{{ uploadError }}</p>

          <div class="app-header__upload-actions">
            <button
              @click="showUploadModal = false"
              class="link-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Save Data Modal -->
    <SaveDataModal 
      :open="showDataModal" 
      @close="showDataModal = false"
      @upload="showUploadModal = true; showDataModal = false"
    />
  </header>
</template>
