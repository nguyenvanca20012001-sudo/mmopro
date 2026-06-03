<script setup lang="ts">
const props = defineProps<{ size?: 'lg' }>()
</script>

<template>
  <div
    class="rounded-full overflow-hidden flex-shrink-0 select-none"
    :class="props.size === 'lg' ? 'w-[98px] h-[98px]' : 'w-[57px] h-[57px] lg:w-[74px] lg:h-[74px]'"
  >
    <img
      src="/images/mmo-logo.png"
      alt="MMO PRO"
      class="w-full h-full object-cover scale-[1.15] object-center"
    />
  </div>
</template>
