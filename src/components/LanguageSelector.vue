<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useGameDataStore } from '@/stores/gameData'

defineProps<{
  compact?: boolean
}>()

const gameData = useGameDataStore()
const open = ref(false)

const languages = [
  { code: 'English', flag: '🇺🇸', short: 'EN', name: 'English' },
  { code: 'Ukrainian', flag: '🇺🇦', short: 'UA', name: 'Ukrainian' },
  { code: 'Belarusian', flag: 'by-wrw', short: 'BY', name: 'Belarusian' },
  { code: 'Chinese', flag: '🇨🇳', short: 'ZH', name: 'Chinese' },
  { code: 'French', flag: '🇫🇷', short: 'FR', name: 'French' },
  { code: 'German', flag: '🇩🇪', short: 'DE', name: 'German' },
  { code: 'Japanese', flag: '🇯🇵', short: 'JP', name: 'Japanese' },
  { code: 'Portuguese', flag: '🇧🇷', short: 'PT', name: 'Portuguese' },
  { code: 'Spanish', flag: '🇪🇸', short: 'ES', name: 'Spanish' },
  { code: 'Russian', flag: '💩', short: 'RU', name: 'Russian' }
]

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
      <span v-if="current().flag === 'by-wrw'" class="inline-flex shrink-0" :class="compact ? 'w-3.5 h-2.5' : 'w-4 h-3'">
        <svg viewBox="0 0 24 18" class="lang-selector__flag">
          <rect width="24" height="6" fill="#fff"/>
          <rect y="6" width="24" height="6" fill="#c41e3a"/>
          <rect y="12" width="24" height="6" fill="#fff"/>
        </svg>
      </span>
      <span v-else class="shrink-0">{{ current().flag }}</span>
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
        <span v-if="lang.flag === 'by-wrw'" class="lang-selector__flag-box">
          <svg viewBox="0 0 24 18">
            <rect width="24" height="6" fill="#fff"/>
            <rect y="6" width="24" height="6" fill="#c41e3a"/>
            <rect y="12" width="24" height="6" fill="#fff"/>
          </svg>
        </span>
        <span v-else class="shrink-0">{{ lang.flag }}</span>
        <span>{{ lang.name }}</span>
      </button>
    </div>
  </div>
</template>
