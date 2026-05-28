import { computed } from 'vue'
import { useCalculatorStore } from '@/stores/calculator'

export function useTagFreshness() {
  const calculator = useCalculatorStore()

  const staleTagIds = computed(() => new Set(calculator.generatorStaleTags.map(t => t.id)))

  function isStaleTag(id: string): boolean {
    return staleTagIds.value.has(id)
  }

  return { staleTagIds, isStaleTag }
}
