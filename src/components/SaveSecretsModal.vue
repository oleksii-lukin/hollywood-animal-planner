<script setup lang="ts">
import type { SaveSecretsInfo } from '@/types/game'
import Modal from '@/components/ui/Modal.vue'

defineProps<{
  open: boolean
  secrets: SaveSecretsInfo | null | undefined
}>()

const emit = defineEmits<{
  close: []
}>()

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch (_) {
    return iso
  }
}

function humanizeSecretId(id: string): string {
  return id
    .replace(/^SECRET_/, '')
    .replace(/_/g, ' ')
}

function trialStatusLabel(status: number): string {
  if (status === 0) return 'Pending'
  if (status === 1) return 'Preparation'
  if (status === 2) return 'Active'
  if (status === 3) return 'Completed'
  return `Status ${status}`
}
</script>

<template>
  <Modal :open="open" title="Secret intel (from save)" max-width="lg" @close="emit('close')">
    <div class="save-secrets__scroll">
      <p class="text-muted-sm">
        Hidden information extracted from the loaded save. Use for planning only.
      </p>

      <template v-if="!secrets">
        <p class="save-secrets__empty-msg">No intel in this save or save was loaded before this feature.</p>
      </template>

      <template v-else>
        <!-- Police raid -->
        <section v-if="secrets.policeRaid" class="save-secrets__section">
          <h3 class="save-secrets__section-title">Police raid</h3>
          <dl class="save-secrets__dl">
            <div class="save-secrets__row">
              <span class="text-text-muted">Raids enabled</span>
              <span :class="secrets.policeRaid.raidsEnabled ? 'text-danger' : 'text-text-muted'">
                {{ secrets.policeRaid.raidsEnabled ? 'Yes' : 'No' }}
              </span>
            </div>
            <div v-if="secrets.policeRaid.nextRaidDate" class="save-secrets__row">
              <span class="text-text-muted">Next raid date</span>
              <span class="save-secrets__label">{{ formatDate(secrets.policeRaid.nextRaidDate) }}</span>
            </div>
            <template v-if="secrets.policeRaid.preparationFirstDay && secrets.policeRaid.preparationLastDay">
              <div class="save-secrets__row">
                <span class="text-text-muted">Preparation window</span>
                <span class="text-text">
                  {{ formatDate(secrets.policeRaid.preparationFirstDay) }} – {{ formatDate(secrets.policeRaid.preparationLastDay) }}
                </span>
              </div>
            </template>
            <div class="save-secrets__row">
              <span class="text-text-muted">Player knows about raid</span>
              <span :class="secrets.policeRaid.knowsAboutRaid ? 'text-success' : 'text-danger'">
                {{ secrets.policeRaid.knowsAboutRaid ? 'Yes' : 'No' }}
              </span>
            </div>
            <div v-if="secrets.policeRaid.lastRaidDate" class="save-secrets__row">
              <span class="text-text-muted">Last raid</span>
              <span class="text-text">{{ formatDate(secrets.policeRaid.lastRaidDate) }}</span>
            </div>
            <div v-if="secrets.policeRaid.studioUnderRaid" class="save-secrets__row">
              <span class="text-text-muted">Studio under raid</span>
              <span class="save-secrets__value-danger">{{ secrets.policeRaid.studioUnderRaid }}</span>
            </div>
            <div v-if="secrets.policeRaid.prevStudioUnderRaid" class="save-secrets__row">
              <span class="text-text-muted">Previously under raid</span>
              <span class="text-text-muted">{{ secrets.policeRaid.prevStudioUnderRaid }}</span>
            </div>
          </dl>
        </section>

        <!-- Surveillance -->
        <section v-if="secrets.policeSurveillance" class="save-secrets__section">
          <h3 class="save-secrets__section-title">Police surveillance</h3>
          <p class="save-secrets__para">
            Agent ID {{ secrets.policeSurveillance.agentId }}, started {{ formatDate(secrets.policeSurveillance.startDate) }}
          </p>
        </section>

        <!-- Used raid events -->
        <section v-if="secrets.usedPoliceRaidEvents?.length" class="save-secrets__section">
          <h3 class="save-secrets__section-title">Used raid events</h3>
          <div class="chips-row">
            <span
              v-for="id in secrets.usedPoliceRaidEvents"
              :key="id"
              class="save-secrets__chip"
            >
              {{ id }}
            </span>
          </div>
        </section>

        <!-- Secrets history -->
        <section v-if="Object.keys(secrets.secretsHistory || {}).length" class="save-secrets__section">
          <h3 class="save-secrets__section-title">Secrets history</h3>
          <ul class="save-secrets__dl">
            <li
              v-for="(value, id) in secrets.secretsHistory"
              :key="id"
              class="save-secrets__row"
            >
              <span class="text-text">{{ humanizeSecretId(id) }}</span>
              <span class="text-text-muted font-mono">{{ value }}</span>
            </li>
          </ul>
        </section>

        <!-- Trials -->
        <section v-if="secrets.trials?.length" class="save-secrets__section">
          <h3 class="save-secrets__section-title">Trials</h3>
          <ul class="space-y-2">
            <li
              v-for="(t, i) in secrets.trials"
              :key="i"
              class="save-secrets__trial-item"
            >
              <div class="save-secrets__label">{{ t.configId.replace(/_/g, ' ') }}</div>
              <div class="save-secrets__meta">
                {{ formatDate(t.trialDate) }}
                <span v-if="t.claimantStudio" class="ml-1">· Claimant: {{ t.claimantStudio }}</span>
                <span class="ml-1">· {{ trialStatusLabel(t.status) }}</span>
              </div>
            </li>
          </ul>
        </section>

        <p v-if="!secrets.policeRaid && !secrets.policeSurveillance && !secrets.usedPoliceRaidEvents?.length && !Object.keys(secrets.secretsHistory || {}).length && !secrets.trials?.length" class="save-secrets__empty-msg">
          No secret data in this save.
        </p>
      </template>
    </div>
  </Modal>
</template>
