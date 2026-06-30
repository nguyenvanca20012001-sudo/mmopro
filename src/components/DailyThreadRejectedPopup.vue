<script setup lang="ts">
import { computed } from 'vue'
import { type DailyThreadNotifReport, REJECT_REASON } from '@/composables/useDailyThreadNotifications'
import { useThreadModalLock } from '@/composables/useThreadModalLock'

useThreadModalLock()

const props = defineProps<{ report: DailyThreadNotifReport }>()
const emit = defineEmits<{
  (e: 'dismiss', id: string): void
  (e: 'resubmit'): void
}>()

const reasonLabel = computed(() =>
  props.report.rejectReason
    ? (REJECT_REASON[props.report.rejectReason] || props.report.rejectReason)
    : ''
)
</script>

<template>
  <!-- z-[99990]: trên cosmic-nav (z-4000) -->
  <div class="fixed inset-0 z-[99990] flex items-center justify-center px-5">
    <div class="absolute inset-0 bg-black/90 backdrop-blur-md"></div>
    <div class="relative bg-[#111726] border-2 border-red-500/50 w-full max-w-md p-7 rounded-[32px] shadow-[0_0_60px_rgba(239,68,68,0.25)] text-center space-y-5">

      <div class="w-20 h-20 bg-gradient-to-tr from-red-600 to-rose-500 rounded-full mx-auto flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(239,68,68,0.4)] animate-bounce">
        ❌
      </div>

      <div class="space-y-1">
        <h2 class="text-xl text-white font-black italic uppercase tracking-tight leading-tight">
          BÀI THREAD<br/><span class="text-red-400">CHƯA ĐẠT YÊU CẦU</span>
        </h2>
        <p class="text-slate-400 text-xs not-italic normal-case font-medium leading-relaxed">
          Bạn có thể nộp lại bài khác nếu hôm nay chưa đủ số lượng hợp lệ.
        </p>
      </div>

      <div class="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4 text-left space-y-3">
        <div class="flex justify-between items-start gap-3">
          <span class="text-slate-400 text-[10px] uppercase tracking-widest font-semibold shrink-0">Nick Thread</span>
          <span class="text-purple-300 text-sm font-black not-italic normal-case text-right">{{ report.threadNick }}</span>
        </div>
        <div class="flex justify-between items-start gap-3">
          <span class="text-slate-400 text-[10px] uppercase tracking-widest font-semibold shrink-0">Link bài viết</span>
          <a :href="report.postUrl" target="_blank" rel="noopener"
            class="text-blue-400 text-[11px] underline not-italic normal-case text-right break-all line-clamp-2">
            {{ report.postUrl }}
          </a>
        </div>
        <div class="border-t border-slate-700/60 pt-2.5 space-y-2">
          <div v-if="reasonLabel">
            <p class="text-red-400 text-[10px] uppercase tracking-widest font-semibold mb-0.5">Lý do từ chối</p>
            <p class="text-white text-sm not-italic normal-case font-semibold">{{ reasonLabel }}</p>
          </div>
          <div v-if="report.rejectNote">
            <p class="text-slate-500 text-[10px] uppercase tracking-widest font-semibold mb-0.5">Ghi chú admin</p>
            <p class="text-slate-300 text-sm not-italic normal-case font-medium">{{ report.rejectNote }}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-1">
        <button
          @click="emit('dismiss', report.id)"
          class="py-3.5 rounded-2xl text-xs font-black italic uppercase border border-slate-700 text-slate-400 hover:bg-slate-800 transition-all active:scale-95">
          Đã hiểu
        </button>
        <button
          @click="emit('resubmit')"
          class="py-3.5 rounded-2xl text-xs font-black italic uppercase bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.35)] active:scale-95 transition-all">
          Nộp lại 🧵
        </button>
      </div>

    </div>
  </div>
</template>
