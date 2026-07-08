<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
// @ts-ignore
import ReferralProofModal from '@/components/ReferralProofModal.vue'
// @ts-ignore
import ReferralHistoryModal from '@/components/ReferralHistoryModal.vue'
import { LPBANK_REFERRAL_TIER_REWARDS, LPBANK_REFERRAL_MAX_TIER_REWARD } from '@/utils/lpbankReferral'

const rewardTiers = [
  { label: 'Lần 1', amount: LPBANK_REFERRAL_TIER_REWARDS[0] },
  { label: 'Lần 2', amount: LPBANK_REFERRAL_TIER_REWARDS[1] },
  { label: 'Lần 3', amount: LPBANK_REFERRAL_TIER_REWARDS[2] },
  { label: 'Từ lần 4', amount: LPBANK_REFERRAL_MAX_TIER_REWARD },
]

const router = useRouter()
const baseUrl = import.meta.env.BASE_URL

const showProofModal = ref(false)
const showHistoryModal = ref(false)
const historyModalRef = ref<InstanceType<typeof ReferralHistoryModal> | null>(null)

function onProofSubmitted() {
  historyModalRef.value?.loadHistory()
}

function onOpenHistory() {
  showProofModal.value = false
  showHistoryModal.value = true
  historyModalRef.value?.loadHistory()
}

const REFERRAL_CODE = '0366045803'
const codeCopied = ref(false)

async function copyReferralCode() {
  try {
    await navigator.clipboard.writeText(REFERRAL_CODE)
  } catch (_) {}
  codeCopied.value = true
  setTimeout(() => { codeCopied.value = false }, 2000)
}

const steps = [
  'Hướng dẫn bạn bè tải APP LPBANK PLUS, đăng ký tài khoản và nhập mã giới thiệu như ảnh mẫu bên dưới.',
  'Làm theo 2 ảnh mẫu bên dưới, sau đó chụp lại và gửi bằng chứng.',
]

const sampleImages = [
  { src: baseUrl + 'images/anh-lpbank1.jpg', label: 'Ảnh 1' },
  { src: baseUrl + 'images/anh-lpbank2.jpg', label: 'Ảnh 2' },
]

const selectedImage = ref<string | null>(null)
const openImage = (img: string) => { selectedImage.value = img }
const closeImage = () => { selectedImage.value = null }
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

    <div class="max-w-lg mx-auto space-y-5">

      <!-- ── Header card ─────────────────────────────────────── -->
      <div class="relative bg-gradient-to-br from-amber-900/40 to-yellow-800/20 border-[2px] border-amber-500/60 rounded-[28px] p-6 md:p-8 overflow-hidden shadow-[0_4px_30px_rgba(245,158,11,0.25)]">
        <div class="absolute inset-0 bg-gradient-to-t from-transparent to-white/5 pointer-events-none rounded-[26px]"></div>

        <div class="absolute -top-0 -right-0 z-10 text-[10px] tracking-widest px-4 py-1.5 rounded-bl-2xl rounded-tr-[26px] font-black italic uppercase border-b border-l border-amber-300/40 shadow-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-900">
          VIP 💎
        </div>

        <div class="flex items-center gap-4 mb-4 relative z-10">
          <div class="w-14 h-14 rounded-2xl bg-amber-600/30 border border-amber-400/30 flex items-center justify-center text-3xl shadow-lg shrink-0">
            👥
          </div>
          <div>
            <p class="text-[10px] text-amber-300 tracking-widest mb-1">GIỚI THIỆU BẠN BÈ</p>
            <h1 class="text-lg md:text-xl text-white leading-tight tracking-tight">
              GIỚI THIỆU BẠN BÈ<br/>
              <span class="text-amber-300">ĐĂNG KÝ APP LPBANK PLUS</span>
            </h1>
          </div>
        </div>

        <div class="relative z-10 flex items-center gap-2 bg-amber-900/30 border border-amber-500/30 rounded-2xl px-4 py-3 mb-5">
          <svg class="w-7 h-7 shrink-0 drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="lpGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#fde047"/>
                <stop offset="50%" style="stop-color:#eab308"/>
                <stop offset="100%" style="stop-color:#854d0e"/>
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#lpGold)"/>
            <path d="M12 7v10M9 10h6M9 14h6" stroke="#854d0e" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <div>
            <p class="text-[9px] text-slate-400 not-italic normal-case tracking-widest">Thưởng mỗi lượt giới thiệu (tăng dần)</p>
            <p class="text-xl text-yellow-400 leading-none tracking-tighter">100.000 - 150.000 <span class="text-sm text-yellow-500">XU</span></p>
          </div>
        </div>

        <div class="relative z-10 bg-amber-900/20 border border-amber-500/25 rounded-2xl px-4 py-3 mb-5">
          <p class="text-[10px] text-amber-300 tracking-widest font-black not-italic normal-case mb-2">🎁 Thưởng tăng dần</p>
          <div class="grid grid-cols-4 gap-1.5">
            <div v-for="tier in rewardTiers" :key="tier.label" class="text-center">
              <p class="text-[8px] text-slate-400 not-italic normal-case tracking-wide">{{ tier.label }}</p>
              <p class="text-[11px] md:text-xs text-yellow-400 font-black not-italic">{{ tier.amount.toLocaleString('vi-VN') }}</p>
            </div>
          </div>
          <p class="text-[10px] text-slate-400 not-italic normal-case font-medium leading-relaxed mt-2.5 pt-2.5 border-t border-amber-500/15">
            Chỉ tính những đơn đã được admin duyệt thành công. Đơn chờ duyệt hoặc bị từ chối không được tính.
          </p>
        </div>

        <p class="relative z-10 text-slate-300 text-sm font-medium not-italic normal-case leading-relaxed mb-5">
          Mời bạn bè đăng ký APP LPBANK PLUS theo hướng dẫn để nhận thưởng.
        </p>

        <div class="relative z-10 grid grid-cols-2 gap-3">
          <button
            @click="showProofModal = true"
            class="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-black italic uppercase tracking-wide transition-all active:scale-95 bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900 shadow-[0_0_20px_rgba(245,158,11,0.4)]">
            <span class="text-base not-italic">📤</span>
            <span>Gửi bằng chứng LPBANK</span>
          </button>
          <button
            @click="showHistoryModal = true"
            class="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-black italic uppercase tracking-wide transition-all active:scale-95 bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <span class="text-base not-italic">📋</span>
            <span>Lịch sử đơn LPBANK</span>
          </button>
        </div>
      </div>

      <!-- ── Mã giới thiệu ───────────────────────────────────── -->
      <div class="bg-[#111726]/80 border border-amber-500/30 rounded-2xl p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-[9px] text-amber-300 tracking-widest mb-1">MÃ GIỚI THIỆU</p>
            <p class="text-lg text-white tracking-[3px] font-black not-italic">{{ REFERRAL_CODE }}</p>
          </div>
          <button
            @click="copyReferralCode"
            class="shrink-0 px-4 py-2 rounded-xl text-xs font-black italic uppercase tracking-wide transition-all active:scale-95 bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
            📋 Sao chép
          </button>
        </div>
        <p v-if="codeCopied" class="text-emerald-400 text-[11px] not-italic normal-case font-bold mt-2">Đã sao chép mã giới thiệu</p>
      </div>

      <!-- ── Cảnh báo 1 SĐT chỉ đăng ký 1 tài khoản LPBANK ───── -->
      <div class="bg-red-950/40 border border-red-500/40 rounded-2xl px-4 py-3 space-y-1.5">
        <p class="flex items-start gap-2 text-red-300 text-[12px] md:text-sm font-bold not-italic normal-case leading-snug">
          <span class="shrink-0">⚠️</span>
          <span>1 điện thoại chỉ đăng ký được 1 tài khoản LPBANK.</span>
        </p>
        <p class="flex items-start gap-2 text-red-300 text-[12px] md:text-sm font-bold not-italic normal-case leading-snug">
          <span class="shrink-0">⚠️</span>
          <span>Không được đăng ký 2 tài khoản LPBANK trên cùng 1 điện thoại.</span>
        </p>
      </div>

      <!-- ── Hướng dẫn ───────────────────────────────────────── -->
      <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[24px] p-5 space-y-4">
        <p class="text-[10px] text-amber-300 tracking-widest mb-1">HƯỚNG DẪN</p>
        <div v-for="(step, i) in steps" :key="i" class="flex items-start gap-3">
          <div class="w-6 h-6 rounded-full bg-amber-600/30 border border-amber-500/40 flex items-center justify-center text-amber-300 text-[10px] font-black shrink-0 mt-0.5">
            {{ i + 1 }}
          </div>
          <p class="text-slate-300 text-sm font-medium not-italic normal-case leading-relaxed">{{ step }}</p>
        </div>
      </div>

      <!-- ── Ảnh mẫu hướng dẫn ────────────────────────────────── -->
      <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[24px] p-4">
        <p class="text-[10px] text-amber-300 tracking-widest mb-3">ẢNH MẪU HƯỚNG DẪN</p>
        <div class="grid grid-cols-2 gap-2">
          <div v-for="(img, idx) in sampleImages" :key="idx" class="space-y-1">
            <div
              class="w-full aspect-[3/4] rounded-xl overflow-hidden border border-slate-700/50 shadow-lg bg-slate-900 cursor-zoom-in group relative"
              @click="openImage(img.src)">
              <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" :src="img.src" />
              <div class="absolute bottom-1 right-1 bg-black/70 backdrop-blur text-white text-[7px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">🔍 PHÓNG TO</div>
            </div>
            <p class="text-slate-400 text-[10px] not-italic normal-case font-semibold text-center">{{ img.label }}</p>
          </div>
        </div>
      </div>

      <div class="pb-8"/>
    </div>

    <!-- ── Xem ảnh lớn ─────────────────────────────────────────── -->
    <Transition name="fade">
      <div class="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out" v-if="selectedImage" @click="closeImage">
        <button class="absolute top-6 right-6 md:top-10 md:right-10 w-12 h-12 bg-slate-800 border border-slate-700 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors z-[6010] shadow-2xl" @click.stop="closeImage">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
        <img class="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-[6005] cursor-default" :src="selectedImage" @click.stop />
      </div>
    </Transition>

    <!-- ── Modals ─────────────────────────────────────────────── -->
    <Transition name="fade">
      <ReferralProofModal
        v-if="showProofModal"
        bank-type="lpbank"
        @close="showProofModal = false"
        @submitted="onProofSubmitted"
        @open-history="onOpenHistory"
      />
    </Transition>

    <Transition name="fade">
      <ReferralHistoryModal
        v-if="showHistoryModal"
        ref="historyModalRef"
        bank-type="lpbank"
        @close="showHistoryModal = false"
      />
    </Transition>

  </div>
</template>
