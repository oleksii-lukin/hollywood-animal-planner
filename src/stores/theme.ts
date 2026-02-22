import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeId = 'default' | 'warm' | 'valve'

const THEME_KEY = 'hollywood-animal-planner-theme'

export const useThemeStore = defineStore('theme', () => {
  const stored = localStorage.getItem(THEME_KEY)
  const themeId = ref<ThemeId>(
    stored === 'valve' || stored === 'warm' || stored === 'default'
      ? (stored as ThemeId)
      : stored === 'clear'
        ? 'valve'
        : 'default'
  )

  function setTheme(id: ThemeId) {
    themeId.value = id
  }

  function applyTheme() {
    const root = document.documentElement
    if (themeId.value === 'warm') {
      root.setAttribute('data-theme', 'warm')
    } else if (themeId.value === 'valve') {
      root.setAttribute('data-theme', 'valve')
    } else {
      root.removeAttribute('data-theme')
    }
  }

  watch(themeId, (id) => {
    localStorage.setItem(THEME_KEY, id)
    applyTheme()
  }, { immediate: false })

  return { themeId, setTheme, applyTheme }
})
