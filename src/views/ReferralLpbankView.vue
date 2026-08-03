<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goToAbbank() {
  router.push('/job/referral-abbank')
}
</script>

<template>
  <div class="min-h-screen bg-transparent text-white p-4 md:p-8 font-black italic uppercase text-left relative">

    <button @click="router.back()"
      class="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 active:scale-95 not-italic normal-case">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
      </svg>
      <span class="text-sm font-black uppercase tracking-wide">Quay lại</span>
    </button>

    <div class="max-w-lg mx-auto">
      <div class="bg-[#111726]/80 border border-amber-500/30 rounded-[28px] p-8 text-center space-y-4">
        <div class="text-5xl">⏸️</div>
        <h2 class="text-white text-lg leading-tight">Công việc giới thiệu bạn bè LPBANK<br/>hiện đã tạm dừng</h2>
        <p class="text-slate-300 text-sm font-medium not-italic normal-case leading-relaxed">
          Vui lòng chọn APP ABBANK để tiếp tục.
        </p>
        <button @click="goToAbbank"
          class="w-full py-4 rounded-2xl text-sm tracking-widest transition-all active:scale-95 shadow-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900 shadow-[0_0_30px_rgba(245,158,11,0.4)]">
          Xem hướng dẫn ABBANK
        </button>
      </div>
    </div>

  </div>
</template>
