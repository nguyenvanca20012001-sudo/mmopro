<script setup lang="ts">
// @ts-ignore
import DailyThreadProofForm from '@/components/DailyThreadProofForm.vue'
import { useThreadModalLock } from '@/composables/useThreadModalLock'

useThreadModalLock()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submitted'): void
  (e: 'open-history'): void
}>()

function handleSubmitted() {
  // Chỉ notify parent để refresh history count — KHÔNG đóng modal
  // Modal sẽ chuyển sang màn hình thành công, user tự chọn đóng
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
             bg-[#0f172a] border border-purple-500/30
             shadow-[0_0_50px_rgba(168,85,247,0.2)]
             flex flex-col overflow-hidden"
      style="max-height: calc(100dvh - 24px);">

      <!-- Header — fixed, không scroll -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 shrink-0">
        <p class="text-sm font-black italic uppercase tracking-widest text-white">📤 Gửi bằng chứng</p>
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

        <!-- Lưu ý trước khi gửi -->
        <div class="bg-indigo-950/60 border border-indigo-500/20 rounded-2xl px-4 py-3 mb-3 space-y-2">
          <p class="text-[10px] text-indigo-300 font-black italic uppercase tracking-widest flex items-center gap-1.5">
            💡 Lưu ý trước khi gửi
          </p>
          <ul class="space-y-1.5">
            <li class="flex items-start gap-2 text-xs text-slate-300 not-italic normal-case font-medium leading-relaxed">
              <span class="text-indigo-400 shrink-0">•</span>
              Bài đăng + mã QR ghim phải đạt đủ view/lượt xem mới được gửi bằng chứng.
            </li>
            <li class="flex items-start gap-2 text-xs text-slate-300 not-italic normal-case font-medium leading-relaxed">
              <span class="text-indigo-400 shrink-0">•</span>
              Từ <span class="text-white font-black">22h – 23h</span> hằng ngày, bên mình mới duyệt đơn và cộng xu.
            </li>
            <li class="flex items-start gap-2 text-xs text-slate-300 not-italic normal-case font-medium leading-relaxed">
              <span class="text-indigo-400 shrink-0">•</span>
              Có thể tạo nhiều nick Threads để đăng bài.
            </li>
            <li class="flex items-start gap-2 text-xs text-slate-300 not-italic normal-case font-medium leading-relaxed">
              <span class="text-indigo-400 shrink-0">•</span>
              Có thể xoá bài đăng lại, hoặc đăng nhiều lần để đạt đủ số view/lượt xem.
            </li>
          </ul>
        </div>

        <DailyThreadProofForm
          @submitted="handleSubmitted"
          @close="emit('close')"
          @open-history="emit('open-history')"
        />
      </div>

    </div>
  </div>
</template>
