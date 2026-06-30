<script setup lang="ts">
import { ref, onMounted } from 'vue'
// @ts-ignore
import { auth, db } from '@/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { REJECT_REASON } from '@/composables/useDailyThreadNotifications'
import { useThreadModalLock } from '@/composables/useThreadModalLock'

useThreadModalLock()

defineEmits<{ (e: 'close'): void }>()

type HistoryReport = {
  id: string
  threadNick: string
  postUrl: string
  qrViewCount: number
  reward: number
  status: 'pending' | 'paid' | 'rejected'
  createdAt: any
  paidAt: any
  rejectedAt?: any
  rejectReason?: string
  rejectNote?: string
}

const list      = ref<HistoryReport[]>([])
const isLoading = ref(false)
const hasLoaded = ref(false)

function formatTime(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function rejectLabel(r: HistoryReport): string {
  if (!r.rejectReason) return ''
  const label = REJECT_REASON[r.rejectReason] || r.rejectReason
  return r.rejectNote ? `${label} — ${r.rejectNote}` : label
}

async function loadHistory() {
  const uid = auth.currentUser?.uid
  if (!uid) { hasLoaded.value = true; return }
  isLoading.value = true
  try {
    const snap = await getDocs(query(
      collection(db, 'daily_thread_reports'),
      where('uid', '==', uid)
    ))
    const arr = snap.docs.map(d => ({ id: d.id, ...d.data() } as HistoryReport))
    arr.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    list.value = arr.slice(0, 30)
  } catch (e) {
    console.error('[ThreadHistory] load error:', e)
  } finally {
    isLoading.value = false
    hasLoaded.value = true
  }
}

onMounted(loadHistory)
defineExpose({ loadHistory })
</script>

<template>
  <!-- z-[99990]: trên cosmic-nav (z-4000) -->
  <div class="fixed inset-0 z-[99990] flex items-end md:items-center justify-center">

    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="$emit('close')"></div>

    <!-- Modal sheet -->
    <div
      class="relative w-full md:max-w-lg md:rounded-[28px] rounded-t-[28px]
             bg-[#0f172a] border border-blue-500/20
             shadow-[0_0_50px_rgba(59,130,246,0.15)]
             flex flex-col overflow-hidden"
      style="max-height: calc(100dvh - 24px);">

      <!-- Header — fixed, không scroll -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 shrink-0">
        <p class="text-sm font-black italic uppercase tracking-widest text-white">📋 Lịch sử đơn</p>
        <div class="flex items-center gap-2">
          <button
            @click="loadHistory"
            :disabled="isLoading"
            class="text-[10px] text-slate-500 hover:text-slate-300 transition-colors
                   not-italic normal-case font-semibold flex items-center gap-1
                   disabled:opacity-40 px-2 py-1 rounded-lg hover:bg-slate-800">
            <svg class="w-3 h-3" :class="isLoading ? 'animate-spin' : ''" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Làm mới
          </button>
          <button
            @click="$emit('close')"
            class="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700/60
                   flex items-center justify-center text-slate-400
                   hover:text-white hover:bg-slate-700 transition-all active:scale-90">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Scrollable list -->
      <div
        class="overflow-y-auto flex-1"
        style="padding-bottom: max(2rem, env(safe-area-inset-bottom, 0px));">

        <!-- Loading -->
        <div v-if="isLoading" class="py-16 text-center text-slate-500 text-sm not-italic normal-case">
          Đang tải lịch sử...
        </div>

        <!-- Empty -->
        <div v-else-if="hasLoaded && list.length === 0" class="py-16 text-center space-y-2">
          <p class="text-4xl">🧵</p>
          <p class="text-slate-500 text-sm not-italic normal-case font-medium">Bạn chưa nộp bài Thread nào.</p>
        </div>

        <!-- List -->
        <div v-else class="divide-y divide-slate-800/60">
          <div v-for="r in list" :key="r.id" class="px-4 py-3.5 space-y-1.5">

            <!-- Row 1: nick + status badge -->
            <div class="flex items-center justify-between gap-3">
              <span class="text-purple-300 font-black text-sm not-italic normal-case truncate">{{ r.threadNick }}</span>
              <span
                class="text-[10px] font-black px-2.5 py-0.5 rounded-full border shrink-0 not-italic normal-case"
                :class="r.status === 'paid'     ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : r.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'">
                {{ r.status === 'paid' ? '✅ Đã cộng xu' : r.status === 'rejected' ? '❌ Bị từ chối' : '⏳ Chờ kiểm tra' }}
              </span>
            </div>

            <!-- Row 2: views + link + time -->
            <div class="flex items-center gap-3 text-xs not-italic normal-case">
              <span class="text-white font-black shrink-0">{{ r.qrViewCount.toLocaleString('vi-VN') }} view QR</span>
              <a :href="r.postUrl" target="_blank" rel="noopener"
                class="text-blue-400 hover:text-blue-300 underline underline-offset-2 shrink-0">
                Mở bài ↗
              </a>
              <span class="text-slate-500 ml-auto shrink-0 text-[10px]">{{ formatTime(r.createdAt) }}</span>
            </div>

            <!-- paid: xu + giờ cộng -->
            <div v-if="r.status === 'paid'" class="flex items-center justify-between text-xs not-italic normal-case pt-0.5">
              <span class="text-yellow-400 font-black">+{{ (r.reward || 0).toLocaleString('vi-VN') }} xu</span>
              <span v-if="r.paidAt" class="text-slate-500 text-[10px]">Cộng lúc {{ formatTime(r.paidAt) }}</span>
            </div>

            <!-- rejected: lý do -->
            <p v-if="r.status === 'rejected' && rejectLabel(r)"
              class="text-[11px] text-red-400/80 not-italic normal-case pt-0.5">
              Lý do: {{ rejectLabel(r) }}
            </p>

          </div>
        </div>

      </div>
    </div>
  </div>
</template>
