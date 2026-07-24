<script setup lang="ts">
import { ref, computed } from 'vue'
import Swal from 'sweetalert2'
import { useThreadModalLock } from '@/composables/useThreadModalLock'
import {
  dailyThreadsGuideConfig,
  startDailyThreadsGuideListener,
  pickRandomNonEmpty,
} from '@/composables/useDailyThreadsGuideConfig'

useThreadModalLock()
startDailyThreadsGuideListener() // idempotent — nếu listener đã chạy từ trang cha thì return ngay

const emit = defineEmits<{ (e: 'close'): void }>()

const contentsPool = computed(() => dailyThreadsGuideConfig.value.contents)
const qrImage = computed(() => dailyThreadsGuideConfig.value.qrImage)

const hasContent = computed(() => contentsPool.value.some(c => String(c || '').trim()))

const demoContent = ref(pickRandomNonEmpty(contentsPool.value))
const postImage = '/images/anh-post-5.png'

function toast(text: string, icon: 'success' | 'warning' = 'success') {
  Swal.fire({ text, icon, timer: 1800, showConfirmButton: false, toast: true, position: 'top-end' })
}

async function handleCopyContent() {
  const item = pickRandomNonEmpty(contentsPool.value)
  if (!item) return
  demoContent.value = item
  try {
    await navigator.clipboard.writeText(item)
    toast('Đã sao chép bài đăng')
  } catch {
    toast('Không thể sao chép, vui lòng copy thủ công.', 'warning')
  }
}

function downloadOrOpenImage(url: string, fileName: string) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  if (isMobile) {
    window.open(`${url}?v=${Date.now()}`, '_blank')
  } else {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}

function handleDownloadImage() {
  downloadOrOpenImage(postImage, `threads-bai-dang-${Date.now()}.png`)
  toast('Đã tải ảnh bài đăng')
}

function handleDownloadQr() {
  if (!qrImage.value) return
  downloadOrOpenImage(qrImage.value, `threads-ma-qr-${Date.now()}.jpg`)
  toast('Đã tải ảnh mã QR')
}
</script>

<template>
  <!-- z-[99990]: trên cosmic-nav (z-4000) và tất cả UI thường, không che bottom nav -->
  <div class="fixed inset-0 z-[99990] flex items-end md:items-center justify-center">

    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="emit('close')"></div>

    <!-- Modal sheet -->
    <div
      class="relative w-full md:max-w-lg md:rounded-[28px] rounded-t-[28px]
             bg-[#0f172a] border border-purple-500/30
             shadow-[0_0_50px_rgba(168,85,247,0.2)]
             flex flex-col overflow-hidden font-black italic uppercase text-left"
      style="max-height: calc(100dvh - 24px);">

      <!-- Header — fixed, không scroll -->
      <div class="relative shrink-0 bg-gradient-to-br from-purple-900/60 to-fuchsia-800/30 border-b border-purple-500/20 px-5 py-4">
        <button
          @click="emit('close')"
          class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700/60
                 flex items-center justify-center text-slate-400
                 hover:text-white hover:bg-slate-700 transition-all active:scale-90">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <p class="text-sm md:text-base font-black italic uppercase tracking-wide text-white pr-10">📖 Hướng Dẫn Đăng Bài Threads</p>
        <p class="text-slate-300 text-[11px] font-medium not-italic normal-case mt-1.5 leading-relaxed pr-10">
          Làm theo 3 bước bên dưới rồi quay lại gửi bằng chứng.
        </p>
      </div>

      <!-- Scrollable body — flex-1 scroll riêng -->
      <div
        class="overflow-y-auto flex-1 p-4 space-y-4"
        style="padding-bottom: max(2rem, env(safe-area-inset-bottom, 0px));">

        <!-- Box lưu ý ngắn -->
        <div class="bg-indigo-950/60 border border-indigo-500/20 rounded-2xl px-4 py-3">
          <p class="text-slate-300 text-xs font-medium not-italic normal-case leading-relaxed">
            Làm đủ 3 bước: copy bài đăng → lưu ảnh → ghim QR dưới bình luận.
          </p>
        </div>

        <!-- ── Bước 1: Sao chép bài đăng ─────────────────────── -->
        <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[24px] p-4 space-y-3">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 text-xs font-black shrink-0">1</div>
            <p class="text-white text-xs tracking-wide">Bước 1: Sao Chép Bài Đăng</p>
          </div>
          <p class="text-slate-400 text-[11px] font-medium not-italic normal-case leading-relaxed">
            Bấm nút bên dưới để lấy ngẫu nhiên 1 mẫu nội dung đăng Threads.
          </p>

          <div v-if="hasContent" class="bg-[#0d121f] p-4 rounded-2xl border border-slate-700/80 shadow-inner">
            <p class="text-slate-300 text-[12px] normal-case italic opacity-90 whitespace-pre-wrap leading-relaxed select-all">
              {{ demoContent }}
            </p>
          </div>
          <div v-else class="bg-[#0d121f] p-4 rounded-2xl border border-slate-700/80 text-center">
            <p class="text-slate-500 text-[11px] font-medium not-italic normal-case">Chưa có nội dung mẫu, vui lòng liên hệ admin.</p>
          </div>

          <button
            :disabled="!hasContent"
            @click="handleCopyContent"
            class="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3.5 rounded-xl text-[11px] font-black uppercase shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
            📋 Sao Chép Bài Đăng
          </button>
        </div>

        <!-- ── Bước 2: Lưu ảnh bài đăng ──────────────────────── -->
        <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[24px] p-4 space-y-3">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 text-xs font-black shrink-0">2</div>
            <p class="text-white text-xs tracking-wide">Bước 2: Lưu Ảnh Bài Đăng</p>
          </div>
          <p class="text-slate-400 text-[11px] font-medium not-italic normal-case leading-relaxed">
            Bấm nút bên dưới để tải ảnh dùng kèm bài đăng.
          </p>

          <div class="rounded-2xl overflow-hidden border border-slate-700/50 shadow-lg bg-slate-900 max-h-[260px] flex items-center justify-center">
            <img class="w-full h-full max-h-[260px] object-contain" :src="postImage" />
          </div>

          <button
            @click="handleDownloadImage"
            class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3.5 rounded-xl text-[11px] font-black uppercase transition-all active:scale-95 flex items-center justify-center gap-2">
            ⬇️ Tải Ảnh Bài Đăng
          </button>
        </div>

        <!-- ── Bước 3: Ghim mã QR dưới bình luận ─────────────── -->
        <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[24px] p-4 space-y-3">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 text-xs font-black shrink-0">3</div>
            <p class="text-white text-xs tracking-wide">Bước 3: Ghim Mã QR Dưới Bình Luận</p>
          </div>
          <p class="text-yellow-400 text-[11px] font-medium not-italic normal-case leading-relaxed">
            Hãy bình luận: quét mã QR, tham gia nhóm để lụm lúa, nhận tiền + gửi ảnh mã QR và GHIM bình luận đó lại.
          </p>

          <div class="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3">
            <p class="text-red-400 text-[10px] font-black uppercase tracking-widest mb-1">⚠️ Bắt buộc</p>
            <p class="text-red-100 text-[11px] font-medium not-italic normal-case leading-relaxed">
              Kèm theo mã QR, hãy kêu gọi mọi người quét mã tham gia nhóm. Ví dụ: "Mọi người quét mã QR tham gia nhóm để lụm lúa nhé....."
            </p>
          </div>

          <div v-if="qrImage" class="rounded-2xl overflow-hidden border border-slate-700/50 shadow-lg bg-slate-900 max-h-[260px] flex items-center justify-center">
            <img class="w-full h-full max-h-[260px] object-contain" :src="qrImage" />
          </div>

          <button
            :disabled="!qrImage"
            @click="handleDownloadQr"
            class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3.5 rounded-xl text-[11px] font-black uppercase transition-all active:scale-95 flex items-center justify-center gap-2">
            ⬇️ Tải Ảnh Mã QR
          </button>
        </div>

        <!-- Nút cuối -->
        <button
          @click="emit('close')"
          class="w-full py-4 rounded-2xl text-sm tracking-widest transition-all active:scale-95 shadow-xl bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]">
          ✅ Đã Hiểu, Đóng Hướng Dẫn
        </button>

      </div>

    </div>
  </div>
</template>
