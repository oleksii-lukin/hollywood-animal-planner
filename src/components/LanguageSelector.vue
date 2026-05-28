<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useGameDataStore } from '@/stores/gameData'

defineProps<{
  compact?: boolean
}>()

const gameData = useGameDataStore()
const open = ref(false)

const languages = [
  { code: 'English', flag: 'us', short: 'EN', name: 'English' },
  { code: 'Ukrainian', flag: 'ua', short: 'UA', name: 'Ukrainian' },
  { code: 'Belarusian', flag: 'by', short: 'BY', name: 'Belarusian' },
  { code: 'Chinese', flag: 'cn', short: 'ZH', name: 'Chinese' },
  { code: 'French', flag: 'fr', short: 'FR', name: 'French' },
  { code: 'German', flag: 'de', short: 'DE', name: 'German' },
  { code: 'Japanese', flag: 'jp', short: 'JP', name: 'Japanese' },
  { code: 'Portuguese', flag: 'pt', short: 'PT', name: 'Portuguese' },
  { code: 'Spanish', flag: 'es', short: 'ES', name: 'Spanish' },
  { code: 'Russian', flag: 'ru', short: 'RU', name: 'Russian' }
]

const flagUrl = (code: string) => `https://flagcdn.com/24x18/${code}.png`

function select(lang: (typeof languages)[0]) {
  gameData.loadLocalization(lang.code)
  open.value = false
}

const current = () => languages.find(l => l.code === gameData.currentLanguage) ?? languages[0]

function handleClickOutside(e: MouseEvent) {
  const el = (e.target as Node)
  if (!el || !document.querySelector('.lang-selector-wrap')?.contains(el)) open.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div class="lang-selector-wrap">
    <button
      type="button"
      class="lang-selector__trigger"
      :class="compact ? 'px-2 py-1 rounded text-[10px] font-medium' : 'px-3 py-2 rounded-full text-sm'"
      @click.stop="open = !open"
    >
      <span class="lang-selector__flag-box inline-flex shrink-0">
        <img :src="flagUrl(current().flag)" :alt="current().flag" class="lang-selector__flag-img">
      </span>
      <span v-if="!compact">{{ current().name }}</span>
      <span v-else class="text-[10px]">{{ current().short }}</span>
      <span class="ml-0.5 opacity-70" :class="open ? 'rotate-180' : ''">▼</span>
    </button>
    <div
      v-show="open"
      class="lang-selector__dropdown"
    >
      <button
        v-for="lang in languages"
        :key="lang.code"
        type="button"
        class="lang-selector__option"
        :class="gameData.currentLanguage === lang.code ? 'text-accent' : 'text-text'"
        @click.stop="select(lang)"
      >
        <span class="lang-selector__flag-box shrink-0">
          <img :src="flagUrl(lang.flag)" :alt="lang.flag" class="lang-selector__flag-img">
        </span>
        <span>{{ lang.name }}</span>
      </button>
    </div>
  </div>
</template>
