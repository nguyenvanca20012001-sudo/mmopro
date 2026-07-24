<script setup lang="ts">
import { ref, inject, computed } from 'vue'
import { useRouter } from 'vue-router'
// @ts-ignore
import DailyThreadProofModal from '@/components/DailyThreadProofModal.vue'
// @ts-ignore
import DailyThreadHistoryModal from '@/components/DailyThreadHistoryModal.vue'
// @ts-ignore
import DailyThreadsGuideModal from '@/components/DailyThreadsGuideModal.vue'
import { startDailyThreadsGuideListener } from '@/composables/useDailyThreadsGuideConfig'

const router = useRouter()

// Khởi động sớm để config (10 content/ảnh mẫu + QR) đã sẵn sàng khi mở popup hướng dẫn
startDailyThreadsGuideListener()

// Chặn truy cập trực tiếp route hướng dẫn khi chưa hoàn thành job "Đăng bài Threads" cũ
const dailyThreadsUnlock = inject<{ hasCompletedOldThreadsJob: any; isChecking: any } | null>('dailyThreadsUnlock', null)
const isCheckingUnlock = computed(() => dailyThreadsUnlock ? !!dailyThreadsUnlock.isChecking.value : true)
const isUnlocked = computed(() => dailyThreadsUnlock ? !!dailyThreadsUnlock.hasCompletedOldThreadsJob.value : false)

function goToOldThreadsJob() {
  router.push('/job/post-threads')
}

const showProofModal   = ref(false)
const showHistoryModal = ref(false)
const showGuideModal   = ref(false)
const historyModalRef  = ref<InstanceType<typeof DailyThreadHistoryModal> | null>(null)

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
  { views: '1.000 lượt xem',      reward: '20.000 xu',  highlight: false },
  { views: '2.000 lượt xem',      reward: '35.000 xu',  highlight: false },
  { views: '5.000 lượt xem',      reward: '80.000 xu',  highlight: false },
  { views: 'Trên 5.000 lượt xem', reward: '100.000 xu', highlight: true  },
]

const strictNotice = 'Bấm nút "Xem hướng dẫn" và làm bài đăng 100% giống y hệt hướng dẫn — sai bất kỳ 1 chi tiết nhỏ nào cũng sẽ bị từ chối.'

const notices = [
  'Bài đăng bắt buộc phải đủ: ảnh bài đăng + mã QR ghim dưới bình luận.',
  '1 nick Threads được đăng tối đa 3 bài, có thể tạo nhiều nick Threads không giới hạn.',
]

const viewExamples = [
  {
    label: 'Ví dụ 1 — 1 nick đăng 3 bài',
    parts: ['Bài 1: 300 lượt xem', 'Bài 2: 400 lượt xem', 'Bài 3: 300 lượt xem'],
    total: '1.000 lượt xem',
    reward: '20.000 xu',
  },
  {
    label: 'Ví dụ 2 — 2 nick, tổng 6 bài (mỗi bài 200 lượt xem)',
    parts: ['6 bài × 200 lượt xem'],
    total: '1.200 lượt xem',
    reward: '20.000 xu',
  },
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

        <!-- ── 3 action buttons ───────────────────────────────── -->
        <div class="relative z-10 grid grid-cols-2 gap-3 mb-3">
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
        <button
          @click="showGuideModal = true"
          class="relative z-10 w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-black italic uppercase tracking-wide transition-all active:scale-95 bg-slate-800/80 border border-purple-500/40 text-purple-200 shadow-lg">
          <span class="text-base not-italic">👉</span>
          <span>Xem hướng dẫn</span>
        </button>

      </div>

      <!-- ── Lưu ý ───────────────────────────────────────────── -->
      <div class="bg-indigo-950/60 border border-purple-500/20 rounded-2xl px-4 py-3 space-y-3">
        <div class="bg-red-500/10 border border-red-500/30 rounded-xl px-3.5 py-2.5">
          <p class="text-red-400 text-[11px] font-black not-italic normal-case leading-relaxed">
            ⚠️ {{ strictNotice }}
          </p>
        </div>
        <div class="space-y-2">
          <div v-for="(notice, i) in notices" :key="i" class="flex items-start gap-2">
            <span class="text-purple-400 text-xs shrink-0 mt-0.5">●</span>
            <p class="text-slate-300 text-xs font-medium not-italic normal-case leading-relaxed">{{ notice }}</p>
          </div>
        </div>
      </div>

      <!-- ── Cách tính lượt xem ───────────────────────────────── -->
      <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[24px] p-5 space-y-4">
        <div>
          <p class="text-[10px] text-purple-300 tracking-widest mb-2">CÁCH TÍNH LƯỢT XEM</p>
          <p class="text-slate-300 text-xs font-medium not-italic normal-case leading-relaxed">
            Lượt xem được <span class="text-yellow-400 font-black">cộng dồn</span> từ tất cả bài đăng, không giới hạn số nick Threads — tổng lượt xem đủ mốc là nhận thưởng.
          </p>
        </div>

        <div class="space-y-3">
          <div v-for="(ex, i) in viewExamples" :key="i" class="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3.5 space-y-2">
            <p class="text-[10px] text-slate-400 not-italic normal-case tracking-wide">{{ ex.label }}</p>
            <div class="flex flex-wrap items-center gap-1.5">
              <template v-for="(part, j) in ex.parts" :key="j">
                <span class="bg-slate-900/80 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-[11px] not-italic normal-case font-black">{{ part }}</span>
                <span v-if="j < ex.parts.length - 1" class="text-slate-500 text-[11px]">+</span>
              </template>
            </div>
            <p class="text-[11px] not-italic normal-case flex items-center flex-wrap gap-1">
              <span class="text-slate-400">Tổng =</span>
              <span class="text-purple-300 font-black">{{ ex.total }}</span>
              <span class="text-slate-400">→</span>
              <span class="text-emerald-400 font-black">{{ ex.reward }}</span>
            </p>
          </div>
        </div>

        <div class="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3">
          <p class="text-amber-400 text-[11px] font-medium not-italic normal-case leading-relaxed">
            ⚠️ Chỉ cộng dồn lượt xem tối đa 6 bài đăng, tức 2 nick Threads. Từ nick Threads thứ 3, 4, 5... trở đi sẽ tính lại từ đầu.
          </p>
        </div>
      </div>

      <!-- ── Bảng mức thưởng ────────────────────────────────── -->
      <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[24px] p-5">
        <p class="text-[10px] text-purple-300 tracking-widest mb-4">BẢNG MỨC THƯỞNG</p>
        <div class="space-y-2">
          <div class="grid grid-cols-2 gap-2 px-2 mb-1">
            <p class="text-[9px] text-slate-500 not-italic normal-case tracking-wide">Tổng lượt xem bài viết</p>
            <p class="text-[9px] text-slate-500 not-italic normal-case tracking-wide text-right">Thưởng</p>
          </div>
          <div v-for="tier in rewardTiers" :key="tier.reward"
            class="grid grid-cols-2 gap-2 items-center bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2.5"
            :class="tier.highlight ? 'border-purple-500/40 bg-purple-900/20' : ''">
            <p class="text-white text-[11px] not-italic normal-case font-black">{{ tier.views }}</p>
            <p class="text-right font-black text-[12px] not-italic"
               :class="tier.highlight ? 'text-yellow-400' : 'text-emerald-400'">
              {{ tier.reward }}
            </p>
          </div>
        </div>
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

    <Transition name="fade">
      <DailyThreadsGuideModal
        v-if="showGuideModal"
        @close="showGuideModal = false"
      />
    </Transition>

  </div>
</template>
