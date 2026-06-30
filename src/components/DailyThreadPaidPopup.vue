<script setup lang="ts">
import type { DailyThreadNotifReport } from '@/composables/useDailyThreadNotifications'
import { useThreadModalLock } from '@/composables/useThreadModalLock'

useThreadModalLock()

defineProps<{ report: DailyThreadNotifReport }>()
const emit = defineEmits<{
  (e: 'dismiss', id: string): void
  (e: 'view-history'): void
}>()
</script>

<template>
  <!-- z-[99990]: trên cosmic-nav (z-4000) -->
  <div class="fixed inset-0 z-[99990] flex items-center justify-center px-5">
    <div class="absolute inset-0 bg-black/90 backdrop-blur-md"></div>
    <div class="relative bg-[#111726] border-2 border-purple-500/60 w-full max-w-md p-7 rounded-[32px] shadow-[0_0_60px_rgba(168,85,247,0.3)] text-center space-y-5">

      <div class="w-20 h-20 bg-gradient-to-tr from-purple-600 to-fuchsia-500 rounded-full mx-auto flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(168,85,247,0.4)] animate-bounce">
        🎉
      </div>

      <div class="space-y-1">
        <h2 class="text-xl text-white font-black italic uppercase tracking-tight leading-tight">
          BÀI THREAD ĐÃ ĐƯỢC<br/><span class="text-purple-400">CỘNG XU!</span>
        </h2>
        <p class="text-slate-400 text-xs not-italic normal-case font-medium leading-relaxed">
          Cảm ơn bạn đã hoàn thành nhiệm vụ Thread hằng ngày.
        </p>
      </div>

      <div class="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4 text-left space-y-2.5">
        <div class="flex justify-between items-center gap-3">
          <span class="text-slate-400 text-[10px] uppercase tracking-widest font-semibold shrink-0">Nick Thread</span>
          <span class="text-purple-300 text-sm font-black not-italic normal-case text-right">{{ report.threadNick }}</span>
        </div>
        <div class="flex justify-between items-center gap-3">
          <span class="text-slate-400 text-[10px] uppercase tracking-widest font-semibold shrink-0">View QR</span>
          <span class="text-white text-sm font-black not-italic">{{ report.qrViewCount.toLocaleString('vi-VN') }}</span>
        </div>
        <div class="border-t border-slate-700/60 pt-2.5 flex justify-between items-center gap-3">
          <span class="text-slate-400 text-[10px] uppercase tracking-widest font-semibold shrink-0">Xu nhận được</span>
          <span class="text-yellow-400 text-xl font-black not-italic">+{{ report.reward.toLocaleString('vi-VN') }} xu</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-1">
        <button
          @click="emit('view-history')"
          class="py-3.5 rounded-2xl text-xs font-black italic uppercase border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-all active:scale-95">
          Xem lịch sử 🧵
        </button>
        <button
          @click="emit('dismiss', report.id)"
          class="py-3.5 rounded-2xl text-xs font-black italic uppercase bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.35)] active:scale-95 transition-all">
          Đã hiểu 👍
        </button>
      </div>

    </div>
  </div>
</template>
