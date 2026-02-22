const STORAGE_PREFIX = 'hollywood-animal-planner'
const LEGACY_PREFIX = 'hollywood-calculator'

/**
 * Clears all app data from localStorage (persisted store, theme, released ids)
 * and reloads the page. Also clears legacy keys from before rename to hollywood-animal-planner.
 */
export function resetAllDataAndReload(): void {
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.startsWith(STORAGE_PREFIX) || key.startsWith(LEGACY_PREFIX))) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key))
  window.location.reload()
}
