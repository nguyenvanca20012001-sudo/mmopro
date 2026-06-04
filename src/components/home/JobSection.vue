<script setup lang="ts">
import { ref } from 'vue';
import { jobsData } from '@/data/jobs';
import Logo from '@/components/Logo.vue';

defineProps<{
  username: string;
  isLoggedIn: boolean;
}>();

const emit = defineEmits(['receiveJob', 'contactSupport', 'routerPush']);

const handleJobClick = (id: string) => {
  const job = jobsData[id];
  if (!job || (job as any).paused) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(50);
  }
  emit('receiveJob', id);
};

const formatReward = (val: any) => {
  if (!val) return '0';
  return String(val).replace(/\D/g, '');
};


const VIP_JOBS = ['liobank', 'app-chung-khoan', 'app-chung-khoan-2', 'app-chung-khoan-3', 'app-chung-khoan-4', 'msb-bank', 'vpbank'];

const isVip = (id: string) => VIP_JOBS.includes(id);

const getJobIcon = (id: string) => {
  const config: Record<string, { t: string, c: string }> = {
    'follow-cgv':     { t: '🎬', c: 'text-white' },
    'review-cinema':  { t: '⭐', c: 'text-white' },
    'checkin-cinema': { t: '📸', c: 'text-white' },
    'survey-cinema':  { t: '📋', c: 'text-white' },
    'post-threads': { t: '🧵', c: 'text-white' },
    'join-zalo': { t: 'ZALO', c: 'text-white' },
    'app-chung-khoan': { t: '📈', c: 'text-white' },
    'app-chung-khoan-2': { t: '📈', c: 'text-white' },
    'app-chung-khoan-3': { t: '📈', c: 'text-white' },
    'msb-bank': { t: 'MSB', c: 'text-white' },
    'vpbank': { t: 'VPB', c: 'text-white' },
    'app-chung-khoan-4': { t: '📈', c: 'text-white' },
    'liobank': { t: 'LIO', c: 'text-white' },
  };
  const res = config[id] || { t: 'JOB', c: 'text-slate-400' };
  return { type: 'text', content: res.t, colorClass: res.c };
};

const getSocialProof = (id: string) => {
  const seeds: Record<string, string> = {
    'follow-cgv':        '1.847',
    'review-cinema':     '923',
    'checkin-cinema':    '654',
    'survey-cinema':     '2.103',
    'post-threads':      '812',
    'join-zalo':         '1.432',
    'app-chung-khoan':   '312',
    'app-chung-khoan-2': '287',
    'app-chung-khoan-3': '241',
    'msb-bank':          '198',
    'vpbank':            '176',
    'app-chung-khoan-4': '163',
    'liobank':           '120',
  };
  return seeds[id] || '500';
};

const highlights = [
  'KHÔNG THU PHÍ, CỌC PHÍ',
  'KHÔNG NẠP TIỀN',
  'RÚT TIỀN 24/7 MINH BẠCH',
]

const getShortDesc = (id: string) => {
  const desc: Record<string, string> = {
    'follow-cgv':     'Follow fanpage + like & share trailer mới',
    'review-cinema':  'Đánh giá 5 sao rạp phim trên Google Maps',
    'checkin-cinema': 'Check-in tại rạp, đăng Facebook/Instagram',
    'survey-cinema':  'Trả lời 5 câu hỏi, xu vào ví ngay lập tức',
    'post-threads': 'Đăng bài tuyển CTV lên Threads nhận thưởng',
    'join-zalo': 'Vào nhóm cộng đồng nhận thông báo',
    'app-chung-khoan': 'Đăng ký tài khoản Kafi X',
    'app-chung-khoan-2': 'Đăng ký tài khoản DNSE',
    'app-chung-khoan-3': 'Đăng ký tài khoản KIS',
    'vpbank': 'Mở tài khoản số đẹp VPBank',
    'app-chung-khoan-4': 'Đăng ký tài khoản chứng khoán',
    'msb-bank': 'Nhận quà tặng khi mở thẻ MSB',
    'liobank':  'Mở tài khoản LioBank thẻ 2 in 1'
  };
  return desc[id] || 'Làm nhiệm vụ ngay';
}
</script>

<template>
  <div class="space-y-4 animate-in fade-in duration-150 text-left">
    <svg width="0" height="0" class="absolute">
      <defs>
        <linearGradient id="goldCoinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#fde047" />
          <stop offset="50%" style="stop-color:#eab308" />
          <stop offset="100%" style="stop-color:#854d0e" />
        </linearGradient>
        <linearGradient id="vipGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#fbbf24" />
          <stop offset="100%" style="stop-color:#f59e0b" />
        </linearGradient>
      </defs>
    </svg>

    <!-- HERO SECTION -->
    <div class="flex flex-col lg:flex-row gap-3">
      <section class="lg:w-2/3 relative bg-[#111726] border border-slate-800/60 rounded-[28px] overflow-hidden flex items-center p-5 md:p-8 shadow-sm">

        <!-- LEFT SIDE — không đổi logic -->
        <div class="relative z-10 space-y-3 w-full md:w-[55%]">
          <div class="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 text-[9px] md:text-[10px] px-3 py-1 rounded-full border border-emerald-500/20 font-bold uppercase tracking-wider">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ONLINE
          </div>

          <!-- Heading + circular buttons -->
          <div class="flex items-start justify-between gap-2">
            <h1 class="text-xl md:text-4xl text-white leading-tight tracking-tighter uppercase font-black italic">
              CHÀO MỪNG,<br/>
              <span class="text-blue-400 text-2xl md:text-5xl">
                {{ username.toUpperCase() }}
              </span>
            </h1>

            <!-- Nút tròn FB + Zalo (chỉ khi logged in) -->
            <div v-if="isLoggedIn" class="flex flex-col gap-2 flex-shrink-0 mt-1">
              <button @click="emit('contactSupport', 'facebook')"
                      class="w-11 h-11 rounded-full bg-[#1877F2] hover:bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-900/50 active:scale-90 transition-all hover:scale-110 border border-white/10"
                      title="Facebook Fanpage">
                <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </button>
              <button @click="emit('contactSupport', 'zalo')"
                      class="w-11 h-11 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center shadow-lg active:scale-90 transition-all hover:scale-110 border border-slate-200"
                      title="Nhóm Zalo">
                <img src="https://upload.wikimedia.org/wikipedia/commons/9/91/Icon_of_Zalo.svg" class="w-6 h-6" />
              </button>
            </div>
          </div>

          <!-- Nút đăng nhập (khi chưa login) -->
          <button v-if="!isLoggedIn" @click="emit('routerPush', '/login')"
                  class="bg-blue-600 hover:bg-blue-500 text-white w-full md:w-auto px-8 py-3.5 rounded-xl text-[10px] md:text-[12px] shadow-xl shadow-blue-900/40 uppercase font-black italic transition-all active:scale-95">
            ĐĂNG KÝ / ĐĂNG NHẬP NGAY
          </button>

          <div class="border-l-4 border-blue-500 pl-4 max-w-2xl space-y-2">
            <p class="text-blue-100 text-[12px] md:text-[15px] font-medium leading-relaxed">
              Nền tảng kiếm tiền Online minh bạch. Rút xu nhanh gọn 24/7 về mọi ngân hàng.
            </p>
            <p class="text-yellow-300 text-[10px] md:text-[13px] font-bold tracking-wide">
              ⚠️ CẢNH BÁO: Nghiêm cấm gian lận hoặc gửi bằng chứng giả. Khóa vĩnh viễn nếu vi phạm.
            </p>
          </div>

          <!-- Trust badge pills -->
          <div class="flex flex-wrap gap-1.5">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black tracking-wide">
              ✅ Không thu phí
            </span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black tracking-wide">
              ✅ Không nạp tiền
            </span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black tracking-wide">
              ✅ Công việc miễn phí
            </span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/40 text-indigo-300 text-[10px] font-black tracking-wide">
              ⚡ Rút tiền trong 24h
            </span>
          </div>
        </div>

        <!-- RIGHT SIDE — Rocket -->
        <div class="absolute right-0 top-0 bottom-0 w-[42%] flex items-center justify-center pointer-events-none opacity-70 md:opacity-100 overflow-hidden">
          <!-- Glow behind rocket -->
          <div class="absolute w-32 h-32 bg-indigo-500/20 rounded-full blur-[60px]"></div>

          <!-- Rocket SVG -->
          <svg viewBox="0 0 120 200" class="rocket-float w-24 md:w-32 lg:w-40 relative z-10" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 0 20px rgba(99,102,241,0.6)); transform: rotate(-15deg)">
            <!-- Flame outer -->
            <ellipse cx="60" cy="178" rx="18" ry="26" fill="#f97316" opacity="0.9"/>
            <!-- Flame inner -->
            <ellipse cx="60" cy="182" rx="10" ry="18" fill="#fde047" opacity="0.95"/>
            <!-- Flame core -->
            <ellipse cx="60" cy="186" rx="5" ry="10" fill="white" opacity="0.8"/>

            <!-- Rocket body -->
            <rect x="38" y="80" width="44" height="90" rx="8" fill="#e2e8f0"/>
            <!-- Body highlight -->
            <rect x="44" y="85" width="12" height="78" rx="4" fill="white" opacity="0.3"/>

            <!-- Nose cone -->
            <path d="M38 80 Q60 20 82 80 Z" fill="#6366f1"/>
            <!-- Nose highlight -->
            <path d="M44 76 Q56 32 65 72" stroke="white" stroke-width="2" fill="none" opacity="0.4" stroke-linecap="round"/>

            <!-- Window -->
            <circle cx="60" cy="110" r="13" fill="#1e1b4b" stroke="#a5b4fc" stroke-width="2.5"/>
            <circle cx="60" cy="110" r="8" fill="#312e81"/>
            <circle cx="56" cy="106" r="3" fill="#a5b4fc" opacity="0.7"/>

            <!-- Left fin -->
            <path d="M38 140 L18 170 L38 160 Z" fill="#6366f1"/>
            <!-- Right fin -->
            <path d="M82 140 L102 170 L82 160 Z" fill="#6366f1"/>

            <!-- Stars / sparkles -->
            <circle cx="20" cy="50" r="2" fill="white" opacity="0.8"/>
            <circle cx="100" cy="70" r="1.5" fill="white" opacity="0.6"/>
            <circle cx="14" cy="100" r="1" fill="white" opacity="0.5"/>
            <circle cx="108" cy="40" r="2" fill="white" opacity="0.7"/>
          </svg>
        </div>

      </section>
    </div>

    <!-- JOB LIST — hidden on mobile, shown via CÔNG VIỆC bottom sheet -->
    <section class="hidden lg:block space-y-4 pt-2">
      <div class="flex items-center gap-3 px-1">
        <div class="w-1.5 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.6)]"></div>
        <h3 class="text-lg md:text-3xl text-white tracking-tighter italic font-black uppercase">CÔNG VIỆC <span class="text-emerald-400">HOT</span></h3>
      </div>

      <div class="bg-[#111726]/80 border border-slate-800/60 rounded-[30px] p-3 md:p-8 shadow-inner space-y-6">

        <!-- TIER CƠ BẢN -->
        <div>
          <div class="flex items-center gap-2 mb-4 px-1">
            <span class="text-[10px] md:text-xs font-black uppercase tracking-widest text-blue-400 border border-blue-500/30 bg-blue-600/10 px-3 py-1 rounded-full">⚡ CƠ BẢN — NHANH & DỄ</span>
          </div>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            <template v-for="(j, id) in jobsData" :key="id">
              <div v-if="!isVip(id as string)"
                @click="handleJobClick(id as string)"
                class="relative p-5 md:p-7 rounded-[28px] border-[2px] transition-all duration-500 flex flex-col group cursor-pointer active:scale-95 hover:-translate-y-1 shadow-2xl overflow-hidden"
                :class="[
                  id === 'follow-cgv'     ? 'bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/60 shadow-[0_4px_20px_rgba(37,99,235,0.2)]'
                  : id === 'review-cinema'  ? 'bg-gradient-to-br from-sky-900/40 to-sky-800/20 border-sky-500/60 shadow-[0_4px_20px_rgba(14,165,233,0.2)]'
                  : id === 'checkin-cinema' ? 'bg-gradient-to-br from-indigo-900/40 to-indigo-800/20 border-indigo-500/60 shadow-[0_4px_20px_rgba(99,102,241,0.2)]'
                  : id === 'survey-cinema'  ? 'bg-gradient-to-br from-violet-900/40 to-violet-800/20 border-violet-500/60 shadow-[0_4px_20px_rgba(124,58,237,0.2)]'
                  : id === 'google-map'   ? 'bg-gradient-to-br from-blue-900/40 to-cyan-900/20 border-blue-500/60 shadow-[0_4px_20px_rgba(59,130,246,0.2)]'
                  : id === 'join-zalo'    ? 'bg-gradient-to-br from-sky-900/40 to-blue-900/20 border-sky-500/60 shadow-[0_4px_20px_rgba(14,165,233,0.2)]'
                  : 'bg-slate-800/60 border-slate-600/60'
                ]">
                <div class="absolute inset-0 bg-gradient-to-t from-transparent to-white/5 pointer-events-none rounded-[26px]"></div>

                <!-- BADGE -->
                <div class="absolute -top-0 -right-0 z-20 flex items-center gap-1 text-[9px] md:text-[10px] tracking-widest px-3 py-1.5 rounded-bl-2xl rounded-tr-[26px] font-black italic uppercase border-b border-l border-white/20 shadow-lg"
                     :class="[
                       id === 'follow-cgv'    ? 'bg-blue-600 text-white' :
                       id === 'review-cinema' ? 'bg-sky-600 text-white' :
                       id === 'checkin-cinema'? 'bg-indigo-600 text-white' :
                       id === 'survey-cinema' ? 'bg-violet-600 text-white' :
                       id === 'google-map'    ? 'bg-blue-600 text-white' :
                       'bg-sky-600 text-white'
                     ]">
                  {{ j.badge || 'CƠ BẢN' }}
                </div>

                <div class="flex justify-between items-start mb-4 relative z-10">
                  <div class="w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center shadow-lg border-[1.5px] border-white/20 transition-transform group-hover:scale-110"
                       :class="[
                         id === 'follow-cgv'    ? 'bg-blue-600/30 text-blue-300' :
                         id === 'review-cinema' ? 'bg-sky-600/30 text-sky-300' :
                         id === 'checkin-cinema'? 'bg-indigo-600/30 text-indigo-300' :
                         id === 'survey-cinema' ? 'bg-violet-600/30 text-violet-300' :
                         id === 'google-map'    ? 'bg-blue-600/30 text-blue-300' :
                         id === 'join-zalo'     ? 'bg-sky-600/30 text-sky-300' :
                         'bg-slate-700/60'
                       ]">
                    <template v-if="getJobIcon(id as string).content === '📈'">
                      <svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 md:w-8 md:h-8">
                        <rect x="2" y="14" width="4" height="8" rx="1"/>
                        <rect x="9" y="9" width="4" height="13" rx="1"/>
                        <rect x="16" y="4" width="4" height="18" rx="1"/>
                        <polyline points="2,10 9,5 16,2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                    </template>
                    <span v-else class="font-black text-sm md:text-xl italic">{{ getJobIcon(id as string).content }}</span>
                  </div>
                </div>

                <h4 class="text-[13px] md:text-lg font-black italic uppercase leading-tight mb-1"
                    :class="{
                      'text-blue-300':   id === 'follow-cgv',
                      'text-sky-300':    id === 'review-cinema',
                      'text-indigo-300': id === 'checkin-cinema',
                      'text-violet-300': id === 'survey-cinema',
                      'text-blue-300':   id === 'google-map',
                      'text-sky-300':    id === 'join-zalo',
                      'text-white':      !['follow-cgv','review-cinema','checkin-cinema','survey-cinema','google-map','join-zalo'].includes(id as string)
                    }">
                  {{ j.title }}
                </h4>

                <p class="text-[10px] md:text-[13px] text-slate-400 font-medium line-clamp-2 leading-relaxed mb-4 mt-1">
                  {{ getShortDesc(id as string) }}
                </p>

                <div class="flex flex-col mt-auto relative z-10">
                  <p class="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Thưởng ngay:</p>
                  <div class="flex items-center gap-1.5">
                    <p class="font-black text-xl md:text-3xl tracking-tighter italic leading-none" :class="j.color">
                      {{ formatReward(j.reward).toLocaleString() }}
                    </p>
                    <div class="flex flex-col items-start translate-y-[-2px]">
                      <svg class="w-4 h-4 md:w-5 md:h-5 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="url(#goldCoinGradient)" />
                        <path d="M12 7v10M9 10h6M9 14h6" stroke="#854d0e" stroke-width="2" stroke-linecap="round" />
                      </svg>
                      <span class="text-[7px] md:text-[9px] text-yellow-500 font-black not-italic tracking-tighter leading-none uppercase">Xu</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-1 text-[9px] text-slate-500 mb-2 mt-3">
                  <span>👥</span>
                  <span>{{ getSocialProof(id as string) }} người đã nhận</span>
                </div>
                <button @click.stop="handleJobClick(id as string)"
                  class="w-full py-3 md:py-4 rounded-xl text-[10px] md:text-[11px] font-black italic uppercase transition-all shadow-md relative z-10"
                  :class="[
                    id === 'follow-cgv'    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white' :
                    id === 'review-cinema' ? 'bg-gradient-to-r from-sky-600 to-sky-400 text-white' :
                    id === 'checkin-cinema'? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white' :
                    id === 'survey-cinema' ? 'bg-gradient-to-r from-violet-600 to-purple-500 text-white' :
                    id === 'google-map'    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white' :
                    id === 'join-zalo'     ? 'bg-gradient-to-r from-sky-600 to-blue-500 text-white' :
                    'bg-blue-600 text-white'
                  ]">
                  BẮT ĐẦU ⚡
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- DIVIDER VIP -->
        <div id="vip-section" class="relative flex items-center gap-4 py-2">
          <div class="flex-1 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent"></div>
          <div class="flex items-center gap-2 bg-gradient-to-r from-sky-500/20 to-blue-500/10 border border-sky-500/40 px-5 py-2 rounded-full shadow-[0_0_20px_rgba(14,165,233,0.2)]">
            <span class="text-sky-400 text-sm">👑</span>
            <span class="text-[10px] md:text-xs font-black uppercase tracking-[3px] text-sky-400">VIP — THU NHẬP CAO</span>
            <span class="text-sky-400 text-sm">👑</span>
          </div>
          <div class="flex-1 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent"></div>
        </div>

        <!-- TIER VIP -->
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          <template v-for="(j, id) in jobsData" :key="id">
            <div v-if="isVip(id as string)"
              @click="handleJobClick(id as string)"
              class="vip-card relative p-5 md:p-7 rounded-[28px] border-[2px] border-amber-500/60 bg-gradient-to-br from-amber-900/30 to-yellow-900/20 transition-all duration-500 flex flex-col group cursor-pointer active:scale-95 overflow-hidden">

              <!-- Glow nền VIP -->
              <div class="absolute inset-0 bg-gradient-to-t from-amber-500/5 to-yellow-300/5 pointer-events-none rounded-[26px]"></div>
              <div class="absolute -right-10 -bottom-10 w-40 h-40 bg-amber-400/10 rounded-full blur-[60px] pointer-events-none"></div>

              <!-- Watermark số thứ tự mờ -->
              <div class="absolute bottom-3 right-4 text-[60px] md:text-[80px] font-black text-amber-300/10 pointer-events-none select-none leading-none">
                {{ ['msb-bank','vpbank','tpbank','liobank'].includes(id as string) ? '🏦' : '📊' }}
              </div>

              <!-- BADGE VIP -->
              <div class="absolute -top-0 -right-0 z-20 flex items-center gap-1 text-[9px] md:text-[10px] tracking-widest px-3 py-1.5 rounded-bl-2xl rounded-tr-[26px] font-black italic uppercase border-b border-l border-amber-300/40 shadow-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-900">
                VIP 💎
              </div>

              <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center shadow-lg border-[1.5px] border-amber-500/40 bg-amber-600/20 text-amber-400 transition-transform group-hover:scale-110 group-hover:border-amber-500/60">
                  <template v-if="getJobIcon(id as string).content === '📈'">
                    <svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 md:w-8 md:h-8">
                      <rect x="2" y="14" width="4" height="8" rx="1"/>
                      <rect x="9" y="9" width="4" height="13" rx="1"/>
                      <rect x="16" y="4" width="4" height="18" rx="1"/>
                      <polyline points="2,10 9,5 16,2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                  </template>
                  <span v-else class="font-black text-sm md:text-xl italic">{{ getJobIcon(id as string).content }}</span>
                </div>
              </div>

              <h4 class="text-[13px] md:text-lg text-amber-300 font-black italic uppercase leading-tight mb-1">
                {{ j.title }}
              </h4>

              <p class="text-[10px] md:text-[13px] text-slate-600 font-medium line-clamp-2 leading-relaxed mb-4 mt-1">
                {{ getShortDesc(id as string) }}
              </p>

              <div class="flex flex-col mt-auto relative z-10">
                <p class="text-[9px] md:text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Thưởng ngay:</p>
                <div class="flex items-center gap-1.5">
                  <p class="font-black text-2xl md:text-4xl tracking-tighter italic leading-none text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-yellow-600">
                    {{ formatReward(j.reward).toLocaleString() }}
                  </p>
                  <div class="flex flex-col items-start translate-y-[-2px]">
                    <svg class="w-5 h-5 md:w-6 md:h-6 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="url(#goldCoinGradient)" />
                      <path d="M12 7v10M9 10h6M9 14h6" stroke="#854d0e" stroke-width="2" stroke-linecap="round" />
                    </svg>
                    <span class="text-[7px] md:text-[9px] text-yellow-500 font-black not-italic tracking-tighter leading-none uppercase">Xu</span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-1.5 text-[9px] text-amber-600 mt-3 mb-2">
                <span class="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                <span>Đang mở đăng ký — {{ getSocialProof(id as string) }} người đã nhận</span>
              </div>
              <button @click.stop="handleJobClick(id as string)"
                class="vip-btn w-full py-3.5 md:py-4 rounded-xl text-[11px] md:text-[13px] font-black italic uppercase transition-all relative z-10 border border-amber-400/60 bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_35px_rgba(245,158,11,0.5)] hover:from-amber-400 hover:to-yellow-400 active:scale-95">
                NHẬN NGAY 💰
              </button>
            </div>
          </template>
        </div>

      </div>
    </section>
  </div>

</template>

<style scoped>
.animate-jump-cycle {
  animation: jump-cycle 3s ease-in-out infinite;
}
@keyframes jump-cycle {
  0%, 100% { transform: translateY(0) rotate(12deg); }
  50% { transform: translateY(-20px) rotate(15deg); }
}

/* === ROCKET FLOAT === */
.rocket-float {
  animation: rocketFloat 3s ease-in-out infinite;
}
@keyframes rocketFloat {
  0%, 100% { transform: rotate(-15deg) translateY(0); }
  50%       { transform: rotate(-15deg) translateY(-12px); }
}

/* === RẠP JOB NEON BLUE === */
.neon-gold-text {
  color: #7dd3fc;
  text-shadow:
    0 0 8px rgba(56,189,248,0.9),
    0 0 20px rgba(56,189,248,0.6),
    0 0 40px rgba(56,189,248,0.3);
  animation: bluePulse 2.5s ease-in-out infinite;
}
@keyframes bluePulse {
  0%, 100% { text-shadow: 0 0 8px rgba(56,189,248,0.9), 0 0 20px rgba(56,189,248,0.6), 0 0 40px rgba(56,189,248,0.3); }
  50%       { text-shadow: 0 0 14px rgba(56,189,248,1),  0 0 35px rgba(56,189,248,0.8), 0 0 60px rgba(56,189,248,0.4); }
}

/* VIP card: border glow nhấp nháy */
@keyframes vip-border-pulse {
  0%, 100% { box-shadow: 0 4px 16px rgba(245,158,11,0.15), 0 0 0px rgba(245,158,11,0); }
  50%       { box-shadow: 0 8px 32px rgba(245,158,11,0.3), 0 0 40px rgba(245,158,11,0.08); }
}
.vip-card {
  animation: vip-border-pulse 2.8s ease-in-out infinite;
}

/* VIP button: glow pulse */
@keyframes vip-btn-pulse {
  0%, 100% { box-shadow: 0 0 15px rgba(245,158,11,0.35); }
  50%       { box-shadow: 0 0 30px rgba(245,158,11,0.75), 0 0 50px rgba(245,158,11,0.2); }
}
.vip-btn {
  animation: vip-btn-pulse 1.8s ease-in-out infinite;
}

/* Hide scrollbar for stats carousel */
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }

/* Hero shimmer sweep */
@keyframes hero-shimmer-sweep {
  0%   { transform: translateX(-100%) skewX(-15deg); }
  100% { transform: translateX(250%) skewX(-15deg); }
}
.hero-shimmer {
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.035) 50%, transparent 100%);
  animation: hero-shimmer-sweep 6s ease-in-out infinite;
}

/* === HIGHLIGHT DOT PULSE === */
@keyframes dotRing {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52,211,153,0.7); }
  50%       { transform: scale(1.3); box-shadow: 0 0 0 7px rgba(52,211,153,0); }
}
.dot-ring {
  animation: dotRing 2s ease-in-out infinite;
}

/* === HIGHLIGHT ROW SLIDE IN === */
@keyframes textSlideIn {
  from { opacity: 0; transform: translateX(-14px); }
  to   { opacity: 1; transform: translateX(0); }
}
.highlight-row {
  animation: textSlideIn 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
}

/* === HIGHLIGHT TEXT SHIMMER === */
@keyframes textShimmer {
  0%, 100% { opacity: 0.85; }
  50%       { opacity: 1; text-shadow: 0 0 10px rgba(255,255,255,0.2); }
}
.highlight-text {
  animation: textShimmer 2.8s ease-in-out infinite;
}
</style>
