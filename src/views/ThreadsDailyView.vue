<script setup lang="ts">
import { ref, inject, computed } from 'vue'
import { useRouter } from 'vue-router'
// @ts-ignore
import DailyThreadProofModal from '@/components/DailyThreadProofModal.vue'
// @ts-ignore
import DailyThreadHistoryModal from '@/components/DailyThreadHistoryModal.vue'

const router = useRouter()
const THREADS_DAILY_ZALO_URL = "https://zalo.me/g/27frut9sccdspshqrlk8"

// Chặn truy cập trực tiếp route hướng dẫn khi chưa hoàn thành job "Đăng bài Threads" cũ
const dailyThreadsUnlock = inject<{ hasCompletedOldThreadsJob: any; isChecking: any } | null>('dailyThreadsUnlock', null)
const isCheckingUnlock = computed(() => dailyThreadsUnlock ? !!dailyThreadsUnlock.isChecking.value : true)
const isUnlocked = computed(() => dailyThreadsUnlock ? !!dailyThreadsUnlock.hasCompletedOldThreadsJob.value : false)

function goToOldThreadsJob() {
  router.push('/job/post-threads')
}

const showProofModal   = ref(false)
const showHistoryModal = ref(false)
const historyModalRef  = ref<InstanceType<typeof DailyThreadHistoryModal> | null>(null)

function joinZalo() {
  if (THREADS_DAILY_ZALO_URL) window.open(THREADS_DAILY_ZALO_URL, '_blank')
}

function onProofSubmitted() {
  // Reload history count in background (modal stays open showing success screen)
  historyModalRef.value?.loadHistory()
}

function onOpenHistory() {
  showProofModal.value = false
  showHistoryModal.value = true
  // loadHistory() sẽ tự chạy qua onMounted của DailyThreadHistoryModal khi mount lần đầu,
  // hoặc gọi thủ công nếu modal đã được mount (ref tồn tại)
  historyModalRef.value?.loadHistory()
}

const rewardTiers = [
  { qr: '50 view',    threadView: '500 view', reward: '20.000 xu', highlight: false },
  { qr: '200 view',   threadView: '500 view', reward: '40.000 xu', highlight: false },
  { qr: '400 view',   threadView: '500 view', reward: '60.000 xu', highlight: false },
  { qr: '600 view',   threadView: '500 view', reward: '80.000 xu', highlight: false },
  { qr: '1.000 view', threadView: '500 view', reward: '100.000 xu', highlight: true  },
]

const steps = [
  'Tham gia nhóm Zalo để nhận nội dung đăng bài hằng ngày.',
  'Đọc hướng dẫn trong nhóm Zalo, nhận nội dung bài đăng được giao.',
  'Dùng tài khoản Threads để đăng bài theo nội dung được giao.',
  'Ghim mã QR trong bài viết và chụp ảnh màn hình số view.',
  'Bấm "Gửi bằng chứng" và điền đầy đủ thông tin để nhận xu.',
]

const rules = [
  'Tối đa 5 bài hợp lệ mỗi ngày (không tính bài bị từ chối).',
  'Mỗi bài phải có link Threads hợp lệ và nick Threads thực.',
  'Số view QR phải khớp với thực tế trong bài viết.',
  'Có thể dùng nhiều nick Threads khác nhau.',
  'Bài bị từ chối không tính vào giới hạn ngày — được nộp lại.',
]
</script>

<template>
  <div class="min-h-screen bg-transparent text-white p-4 md:p-8 font-black italic uppercase text-left relative">

    <!-- Back button -->
    <button @click="router.back()"
      class="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 active:scale-95 not-italic normal-case">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
      </svg>
      <span class="text-sm font-black uppercase tracking-wide">Quay lại</span>
    </button>

    <!-- Đang kiểm tra điều kiện mở khóa -->
    <div v-if="isCheckingUnlock" class="max-w-lg mx-auto flex flex-col items-center justify-center py-20 gap-4">
      <div class="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-purple-300 text-[11px] not-italic normal-case tracking-widest">Đang kiểm tra điều kiện mở khóa...</p>
    </div>

    <!-- Khóa: chưa hoàn thành job "Đăng bài Threads" cũ -->
    <div v-else-if="!isUnlocked" class="max-w-lg mx-auto">
      <div class="bg-[#111726]/80 border border-purple-500/30 rounded-[28px] p-8 text-center space-y-4">
        <div class="text-5xl">🔒</div>
        <h2 class="text-white text-lg leading-tight">Nhiệm vụ hằng ngày đang khóa</h2>
        <p class="text-slate-300 text-sm font-medium not-italic normal-case leading-relaxed">
          Bạn cần hoàn thành công việc <span class="text-yellow-400 font-black">Đăng bài Threads</span> trước khi mở khóa nhiệm vụ này.
        </p>
        <button @click="goToOldThreadsJob"
          class="w-full py-4 rounded-2xl text-sm tracking-widest transition-all active:scale-95 shadow-xl bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.4)]">
          Làm Đăng bài Threads trước
        </button>
      </div>
    </div>

    <div v-else class="max-w-lg mx-auto space-y-5">

      <!-- ── Header card ─────────────────────────────────────── -->
      <div class="relative bg-gradient-to-br from-purple-900/40 to-fuchsia-800/20 border-[2px] border-purple-500/60 rounded-[28px] p-6 md:p-8 overflow-hidden shadow-[0_4px_30px_rgba(168,85,247,0.25)]">
        <div class="absolute inset-0 bg-gradient-to-t from-transparent to-white/5 pointer-events-none rounded-[26px]"></div>

        <div class="absolute -top-0 -right-0 z-10 text-[10px] tracking-widest px-4 py-1.5 rounded-bl-2xl rounded-tr-[26px] font-black italic uppercase border-b border-l border-white/20 shadow-lg bg-purple-600 text-white">
          HẰNG NGÀY
        </div>

        <!-- Title row -->
        <div class="flex items-center gap-4 mb-4 relative z-10">
          <div class="w-14 h-14 rounded-2xl bg-purple-600/30 border border-purple-400/30 flex items-center justify-center text-3xl shadow-lg shrink-0">
            🧵
          </div>
          <div>
            <p class="text-[10px] text-purple-300 tracking-widest mb-1">CÔNG VIỆC ĐẶC BIỆT</p>
            <h1 class="text-lg md:text-xl text-white leading-tight tracking-tight">
              ĐĂNG BÀI THREADS<br/>
              <span class="text-purple-300">HẰNG NGÀY</span>
            </h1>
          </div>
        </div>

        <!-- Reward badge -->
        <div class="relative z-10 flex items-center gap-2 bg-purple-900/30 border border-purple-500/30 rounded-2xl px-4 py-3 mb-5">
          <svg class="w-7 h-7 shrink-0 drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="tGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#fde047"/>
                <stop offset="50%" style="stop-color:#eab308"/>
                <stop offset="100%" style="stop-color:#854d0e"/>
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#tGold)"/>
            <path d="M12 7v10M9 10h6M9 14h6" stroke="#854d0e" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <div>
            <p class="text-[9px] text-slate-400 not-italic normal-case tracking-widest">Thưởng mỗi lần đăng bài</p>
            <p class="text-xl text-yellow-400 leading-none tracking-tighter">20.000 – 100.000 <span class="text-sm text-yellow-500">XU</span></p>
          </div>
        </div>

        <!-- ── 2 action buttons ───────────────────────────────── -->
        <div class="relative z-10 grid grid-cols-2 gap-3">
          <button
            @click="showProofModal = true"
            class="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-black italic uppercase tracking-wide transition-all active:scale-95 bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]">
            <span class="text-base not-italic">📤</span>
            <span>Gửi bằng chứng</span>
          </button>
          <button
            @click="showHistoryModal = true"
            class="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-black italic uppercase tracking-wide transition-all active:scale-95 bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <span class="text-base not-italic">📋</span>
            <span>Lịch sử đơn</span>
          </button>
        </div>

      </div>

      <!-- ── Bảng mức thưởng ────────────────────────────────── -->
      <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[24px] p-5">
        <p class="text-[10px] text-purple-300 tracking-widest mb-4">BẢNG MỨC THƯỞNG</p>
        <div class="space-y-2">
          <div class="grid grid-cols-3 gap-2 px-2 mb-1">
            <p class="text-[9px] text-slate-500 not-italic normal-case tracking-wide">View bài Threads</p>
            <p class="text-[10.35px] text-yellow-400 not-italic normal-case tracking-wide text-center">Lượt xem mã QR ghim tại bình luận</p>
            <p class="text-[9px] text-slate-500 not-italic normal-case tracking-wide text-right">Thưởng</p>
          </div>
          <div v-for="tier in rewardTiers" :key="tier.reward"
            class="grid grid-cols-3 gap-2 items-center bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2.5"
            :class="tier.highlight ? 'border-purple-500/40 bg-purple-900/20' : ''">
            <p class="text-white text-[11px] not-italic normal-case font-black">{{ tier.threadView }}</p>
            <p class="text-center text-[11px] not-italic normal-case font-black text-purple-300">{{ tier.qr }}</p>
            <p class="text-right font-black text-[12px] not-italic"
               :class="tier.highlight ? 'text-yellow-400' : 'text-emerald-400'">
              {{ tier.reward }}
            </p>
          </div>
        </div>
      </div>

      <!-- ── Hướng dẫn ───────────────────────────────────────── -->
      <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[24px] p-5 space-y-3">
        <p class="text-[10px] text-purple-300 tracking-widest mb-3">HƯỚNG DẪN</p>
        <div v-for="(step, i) in steps" :key="i" class="flex items-start gap-3">
          <div class="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 text-[10px] font-black shrink-0 mt-0.5">
            {{ i + 1 }}
          </div>
          <p class="text-slate-300 text-sm font-medium not-italic normal-case leading-relaxed">{{ step }}</p>
        </div>
      </div>

      <!-- ── Quy định ────────────────────────────────────────── -->
      <div class="bg-[#111726]/80 border border-amber-500/20 rounded-[24px] p-5">
        <p class="text-[10px] text-amber-400 tracking-widest mb-3">QUY ĐỊNH</p>
        <ul class="space-y-2">
          <li v-for="(rule, i) in rules" :key="i" class="flex items-start gap-2.5">
            <span class="text-amber-500 text-xs shrink-0 mt-0.5">•</span>
            <p class="text-slate-300 text-sm font-medium not-italic normal-case leading-relaxed">{{ rule }}</p>
          </li>
        </ul>
      </div>

      <!-- ── Highlights ──────────────────────────────────────── -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-[#111726]/60 border border-slate-800/60 rounded-[20px] p-4 text-center">
          <div class="text-2xl mb-1">♾️</div>
          <p class="text-[9px] text-slate-300 not-italic normal-case leading-tight">Không giới hạn nick</p>
        </div>
        <div class="bg-[#111726]/60 border border-slate-800/60 rounded-[20px] p-4 text-center">
          <div class="text-2xl mb-1">📅</div>
          <p class="text-[9px] text-slate-300 not-italic normal-case leading-tight">Đăng mỗi ngày</p>
        </div>
        <div class="bg-[#111726]/60 border border-slate-800/60 rounded-[20px] p-4 text-center">
          <div class="text-2xl mb-1">🔄</div>
          <p class="text-[9px] text-slate-300 not-italic normal-case leading-tight">Nộp lại nếu bị từ chối</p>
        </div>
      </div>

      <!-- ── CTA Zalo ────────────────────────────────────────── -->
      <button
        @click="joinZalo"
        :disabled="!THREADS_DAILY_ZALO_URL"
        class="w-full py-5 rounded-2xl text-sm tracking-widest transition-all active:scale-95 shadow-xl"
        :class="THREADS_DAILY_ZALO_URL
          ? 'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.4)]'
          : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'">
        {{ THREADS_DAILY_ZALO_URL ? 'THAM GIA NHÓM NHẬN NỘI DUNG 🧵' : 'ADMIN CHƯA CẤU HÌNH LINK NHÓM.' }}
      </button>

      <div class="pb-8"/>
    </div>

    <!-- ── Modals ─────────────────────────────────────────────── -->
    <Transition name="fade">
      <DailyThreadProofModal
        v-if="showProofModal"
        @close="showProofModal = false"
        @submitted="onProofSubmitted"
        @open-history="onOpenHistory"
      />
    </Transition>

    <Transition name="fade">
      <DailyThreadHistoryModal
        v-if="showHistoryModal"
        ref="historyModalRef"
        @close="showHistoryModal = false"
      />
    </Transition>

  </div>
</template>
