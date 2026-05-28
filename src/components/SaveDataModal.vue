<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'
import { useGameDataStore } from '@/stores/gameData'
import Modal from '@/components/ui/Modal.vue'
import SaveSecretsModal from '@/components/SaveSecretsModal.vue'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  upload: []
}>()

const calculator = useCalculatorStore()
const gameData = useGameDataStore()

const activeTab = ref<'current' | 'history'>('current')
const showSecretsModal = ref(false)

const currentData = computed(() => calculator.saveFileData)
const hasSecrets = computed(() => !!currentData.value?.secretsInfo)

const tagsByCategory = computed(() => {
  if (!currentData.value) return {}
  
  const result: Record<string, string[]> = {}
  for (const tagId of currentData.value.availableTags) {
    const tag = gameData.tags[tagId]
    const category = tag?.category || 'Unknown'
    if (!result[category]) result[category] = []
    result[category].push(tag?.name || tagId)
  }
  
  for (const cat in result) {
    result[cat].sort()
  }
  return result
})

const codexTagNames = computed(() => {
  if (!currentData.value) return []
  return currentData.value.codexTags.map(id => gameData.tags[id]?.name || id)
})

function formatGameDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown'
  try {
    const date = new Date(dateStr)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  } catch (_) {
    return dateStr
  }
}

function loadFromHistory(historyId: string) {
  calculator.loadFromHistory(historyId)
  activeTab.value = 'current'
}

function removeFromHistory(historyId: string) {
  calculator.removeFromHistory(historyId)
}
</script>

<template>
  <Modal :open="open" title="Save File Data" max-width="2xl" @close="emit('close')">
    <!-- Tabs -->
    <div class="save-modal__tabs">
      <button
        @click="activeTab = 'current'"
        class="save-modal__tab"
        :class="activeTab === 'current' 
          ? 'text-accent border-b-2 border-accent -mb-px' 
          : 'text-text-muted hover:text-text'"
      >
        Current
      </button>
      <button
        @click="activeTab = 'history'"
        class="save-modal__tab"
        :class="activeTab === 'history' 
          ? 'text-accent border-b-2 border-accent -mb-px' 
          : 'text-text-muted hover:text-text'"
      >
        History ({{ calculator.saveHistory.length }})
      </button>
    </div>

    <!-- Content -->
    <div class="p-3">
      <!-- Current Tab -->
      <template v-if="activeTab === 'current'">
        <div v-if="!currentData" class="empty-state">
          <p class="save-modal__empty-msg">No save file loaded</p>
          <button
            @click="emit('upload')"
            class="btn-load"
          >
            Load Save File
          </button>
        </div>

        <template v-else>
          <!-- File info -->
          <div class="panel-padded-mb3">
            <div class="save-modal__stats-grid">
              <div>
                <span class="text-text-muted">File:</span>
                <span class="save-modal__row-value">{{ currentData.fileName || 'Unknown' }}</span>
              </div>
              <div>
                <span class="text-text-muted">Game:</span>
                <span class="save-modal__row-value--accent">{{ formatGameDate(currentData.gameDate) }}</span>
              </div>
              <div v-if="currentData.currentGameDate">
                <span class="text-text-muted">Calc:</span>
                <span class="save-modal__row-value">{{ currentData.currentGameDate }}</span>
              </div>
            </div>
            <button
              v-if="hasSecrets"
              type="button"
              class="save-modal__btn-secrets"
              @click="showSecretsModal = true"
            >
              Secret intel (raid, trials, secrets)
            </button>
          </div>

          <!-- Stats -->
          <div class="save-modal__stats-row">
            <div class="save-modal__stat-cell">
              <div class="save-modal__stat-value save-modal__stat-value--success">{{ currentData.availableTags.length }}</div>
              <div class="label-tiny">Available</div>
            </div>
            <div class="save-modal__stat-cell">
              <div class="save-modal__stat-value save-modal__stat-value--accent">{{ currentData.bankTags.length }}</div>
              <div class="label-tiny">Bank</div>
            </div>
            <div class="save-modal__stat-cell">
              <div class="save-modal__stat-value save-modal__stat-value--muted">{{ currentData.usedTags.length }}</div>
              <div class="label-tiny">Used</div>
            </div>
            <div class="save-modal__stat-cell">
              <div class="save-modal__stat-value save-modal__stat-value--danger">{{ currentData.codexTags.length }}</div>
              <div class="label-tiny">Codex</div>
            </div>
          </div>

          <!-- Codex Tags (if any) -->
          <div v-if="codexTagNames.length > 0" class="mb-3">
            <h4 class="save-modal__section-title--danger">Codex (Censored)</h4>
            <div class="chips-row">
              <span
                v-for="name in codexTagNames"
                :key="name"
                class="save-modal__chip-danger"
              >
                {{ name }}
              </span>
            </div>
          </div>

          <!-- Available Tags by Category -->
          <div>
            <h4 class="save-modal__section-title">Tags by Category</h4>
            <div class="space-y-2">
              <div
                v-for="(tags, category) in tagsByCategory"
                :key="category"
                class="save-modal__category-row"
              >
                <div class="save-modal__row">
                  <span class="save-modal__category-title">{{ category }}</span>
                  <span class="text-muted-xs">{{ tags.length }}</span>
                </div>
                <div class="chips-row">
                  <span
                    v-for="tag in tags"
                    :key="tag"
                    class="save-modal__tag-inline"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- History Tab -->
      <template v-else>
        <div v-if="calculator.saveHistory.length === 0" class="empty-state">
          <p class="text-muted-base">No save history yet</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="entry in calculator.saveHistory"
            :key="entry.id"
            class="save-modal__panel-hover"
          >
            <div class="save-modal__row-start">
              <div>
                <div class="save-modal__history-filename">{{ entry.fileName }}</div>
                <div class="save-modal__history-date">{{ formatGameDate(entry.gameDate) }}</div>
              </div>
              <div class="flex-gap-1">
                <button
                  @click="loadFromHistory(entry.id)"
                  class="save-modal__btn-load-sm"
                >
                  Load
                </button>
                <button
                  @click="removeFromHistory(entry.id)"
                  class="btn-danger-ghost-sm"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div class="save-modal__history-stats">
              <div class="save-modal__history-stat-cell">
                <div class="save-modal__history-stat-value save-modal__history-stat-value--success">{{ entry.availableTagsCount }}</div>
              </div>
              <div class="save-modal__history-stat-cell">
                <div class="save-modal__history-stat-value save-modal__history-stat-value--accent">{{ entry.bankTagsCount }}</div>
              </div>
              <div class="save-modal__history-stat-cell">
                <div class="save-modal__history-stat-value save-modal__history-stat-value--muted">{{ entry.usedTagsCount }}</div>
              </div>
              <div class="save-modal__history-stat-cell">
                <div class="save-modal__history-stat-value save-modal__history-stat-value--danger">{{ entry.codexTagsCount }}</div>
              </div>
            </div>
          </div>

          <!-- Clear history button -->
          <div class="save-modal__footer-divider">
            <button
              @click="calculator.clearHistory()"
              class="save-modal__link-muted"
            >
              Clear all
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Footer -->
    <div class="bar-footer">
      <button
        @click="emit('upload')"
        class="save-modal__btn-accent"
      >
        Upload New
      </button>
      <button
        @click="emit('close')"
        class="save-modal__btn-ghost"
      >
        Close
      </button>
    </div>
  </Modal>

  <SaveSecretsModal
    :open="showSecretsModal"
    :secrets="currentData?.secretsInfo"
    @close="showSecretsModal = false"
  />
</template>
