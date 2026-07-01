<script setup lang="ts">
// @ts-ignore
import ReferralProofForm from '@/components/ReferralProofForm.vue'
// @ts-ignore
import ReferralProofFormLpbank from '@/components/ReferralProofFormLpbank.vue'
import { useThreadModalLock } from '@/composables/useThreadModalLock'

useThreadModalLock()

const props = defineProps<{ bankType: 'abbank' | 'lpbank' }>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submitted'): void
  (e: 'open-history'): void
}>()

function handleSubmitted() {
  emit('submitted')
}
</script>

<template>
  <!-- z-[99990]: trên cosmic-nav (z-4000) và tất cả UI thường -->
  <div class="fixed inset-0 z-[99990] flex items-end md:items-center justify-center">

    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="emit('close')"></div>

    <!-- Modal sheet -->
    <div
      class="relative w-full md:max-w-lg md:rounded-[28px] rounded-t-[28px]
             bg-[#0f172a] border border-amber-500/30
             shadow-[0_0_50px_rgba(245,158,11,0.2)]
             flex flex-col overflow-hidden"
      style="max-height: calc(100dvh - 24px);">

      <!-- Header — fixed, không scroll -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 shrink-0">
        <p class="text-sm font-black italic uppercase tracking-widest text-white">
          📤 Gửi bằng chứng {{ props.bankType === 'abbank' ? 'ABBANK' : 'LPBANK' }}
        </p>
        <button
          @click="emit('close')"
          class="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700/60
                 flex items-center justify-center text-slate-400
                 hover:text-white hover:bg-slate-700 transition-all active:scale-90">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Scrollable form — flex-1 scroll riêng -->
      <div
        class="overflow-y-auto flex-1 p-4"
        style="padding-bottom: max(2rem, env(safe-area-inset-bottom, 0px));">

        <ReferralProofForm
          v-if="props.bankType === 'abbank'"
          :bank-type="props.bankType"
          @submitted="handleSubmitted"
          @close="emit('close')"
          @open-history="emit('open-history')"
        />
        <ReferralProofFormLpbank
          v-else
          @submitted="handleSubmitted"
          @close="emit('close')"
          @open-history="emit('open-history')"
        />
      </div>

    </div>
  </div>
</template>
