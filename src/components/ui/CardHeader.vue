<script setup lang="ts">
const props = defineProps<{
  title: string
  color?: 'accent' | 'danger' | 'default'
  collapsible?: boolean
  collapsed?: boolean
}>()

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
}>()

function toggle() {
  if (props.collapsible) {
    emit('update:collapsed', !props.collapsed)
  }
}
</script>

<template>
  <div class="card-header__row">
    <h3
      class="card-header__title"
      :class="[
        {
          'text-accent': color === 'accent' || !color,
          'text-danger': color === 'danger'
        },
        collapsible ? 'cursor-pointer select-none hover:opacity-80' : ''
      ]"
      @click="toggle"
    >
      <span
        v-if="collapsible"
        class="card-header__chevron"
        :class="collapsed ? '-rotate-90' : 'rotate-0'"
      >
        ▼
      </span>
      {{ title }}
    </h3>
    <slot name="actions" />
  </div>
</template>
