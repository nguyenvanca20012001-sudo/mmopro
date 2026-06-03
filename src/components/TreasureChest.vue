<script setup lang="ts">
import { ref, computed } from 'vue'

interface Tier {
  name: string
  key: string
  rewardXu: number
  color: string
  bg: string
  border: string
  btnBg: string
  bar: string
  chest: string | null
  chestDesc: string | null
  icon: string
  min: number
}

const props = defineProps<{
  tier: Tier
  unlocked: boolean
  claimed: boolean
  count: number
}>()

const emit = defineEmits<{ toggle: [] }>()

const isShaking = ref(false)

const glowColor = computed(() => {
  const map: Record<string, string> = {
    bac: 'rgba(148,163,184,0.55)',
    vang: 'rgba(245,158,11,0.55)',
    kimcuong: 'rgba(6,182,212,0.55)',
  }
  return map[props.tier.key] || 'rgba(148,163,184,0.3)'
})

const boxGlow = computed(() => {
  const map: Record<string, string> = {
    bac:      'rgba(148,163,184,0.6)',
    vang:     'rgba(251,191,36,0.6)',
    kimcuong: 'rgba(34,211,238,0.6)',
  }
  return map[props.tier.key] || 'rgba(148,163,184,0.3)'
})

const chestFilter = computed(() => {
  if (!props.unlocked) return 'grayscale(0.85) brightness(0.65)'
  const map: Record<string, string> = {
    bac:      'grayscale(1) brightness(1.35) contrast(0.85)',
    vang:     'saturate(1.15) brightness(1.05)',
    kimcuong: 'hue-rotate(135deg) saturate(2.2) brightness(1.1)',
  }
  return map[props.tier.key] || 'none'
})

const cardGradient = computed(() => {
  const map: Record<string, string> = {
    bac:      'bg-gradient-to-br from-slate-300 to-slate-400',
    vang:     'bg-gradient-to-br from-amber-300 to-yellow-400',
    kimcuong: 'bg-gradient-to-br from-cyan-400 to-blue-500',
  }
  return map[props.tier.key] || 'bg-gradient-to-br from-slate-300 to-slate-400'
})

function handleClick() {
  if (!props.unlocked) {
    isShaking.value = true
    setTimeout(() => { isShaking.value = false }, 600)
    return
  }
  emit('toggle')
}
</script>

<template>
  <div
    class="chest-card relative flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-2xl border-[1.5px] cursor-pointer transition-all duration-200 select-none overflow-visible"
    :class="[
      isShaking ? 'is-shaking' : '',
      cardGradient,
      unlocked ? [tier.border, 'shadow-lg'] : ['border-white/30', 'opacity-75'],
    ]"
    :style="{ '--glow': glowColor, '--box-glow': boxGlow }"
    @click="handleClick"
  >
    <!-- Tooltip khi locked -->
    <div v-if="!unlocked"
         class="chest-tooltip absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#1a0f0c] border border-slate-700/60 text-slate-400 text-[8px] font-black rounded-lg whitespace-nowrap z-30 pointer-events-none opacity-0 transition-opacity duration-200 shadow-lg">
      🔒 Cần {{ tier.min }} việc
    </div>

    <!-- ===== CHEST IMAGE ===== -->
    <div class="chest-art relative flex items-center justify-center"
         :class="unlocked ? 'is-unlocked' : 'is-locked-chest'">

      <!-- Glow aura (chỉ khi unlocked) -->
      <div v-if="unlocked"
           class="absolute -inset-3 rounded-xl pointer-events-none"
           :style="{ background: `radial-gradient(circle at 50% 65%, ${glowColor} 0%, transparent 70%)`, opacity: 0.7 }"></div>

      <img src="/images/chest-gold.png"
           alt="chest"
           class="relative z-10 w-[88px] h-[88px] object-contain transition-all duration-300"
           :style="{ filter: chestFilter }" />

      <!-- Lock overlay khi locked -->
      <div v-if="!unlocked"
           class="absolute inset-0 flex items-center justify-center z-20 pb-2">
        <span class="text-[24px] leading-none" style="filter: drop-shadow(0 1px 3px rgba(0,0,0,0.9));">🔒</span>
      </div>
    </div><!-- /chest-art -->

    <!-- Tên hòm -->
    <p class="text-[9px] font-black italic uppercase text-center leading-tight relative z-10 text-slate-900">
      {{ tier.chest?.replace('🎁 ', '') }}
    </p>

    <!-- Badge trạng thái -->
    <span v-if="claimed"     class="text-[7px] font-black uppercase text-emerald-700 tracking-wide relative z-10">✅ ĐÃ NHẬN</span>
    <span v-else-if="unlocked" class="text-[7px] font-black uppercase text-emerald-700 tracking-wide relative z-10">✅ ĐÃ MỞ</span>

    <!-- Ghi chú range thưởng — nổi bật -->
    <div v-if="tier.chestDesc" class="relative z-10 w-full px-1">
      <div class="rounded-xl px-2 py-2 text-center"
           :class="unlocked
             ? 'bg-[#0d121f]/90 border border-lime-500/20'
             : 'bg-slate-900/60 border border-slate-700/30'">
        <!-- Title row -->
        <div class="flex items-center justify-center gap-1 mb-1">
          <span class="text-[11px] leading-none">🎁</span>
          <span class="text-[8px] font-black uppercase tracking-widest leading-none"
                style="color:#a3e635">NHẬN THƯỞNG NGẪU NHIÊN</span>
        </div>
        <!-- Range amount -->
        <p class="text-[10px] font-black italic leading-tight tabular-nums"
           :style="unlocked ? 'color:#a3e635; filter: drop-shadow(0 0 5px rgba(163,230,53,0.5))' : 'color:#a3e635'">
          {{ tier.chestDesc }}
        </p>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ===== CARD GLOW PULSE ===== */
@keyframes cardGlowPulse {
  0%, 100% { box-shadow: 0 0 20px var(--box-glow); }
  50%       { box-shadow: 0 0 38px var(--box-glow), 0 0 55px var(--box-glow); }
}
.chest-card {
  animation: cardGlowPulse 2.5s ease-in-out infinite;
}
.chest-card:hover {
  box-shadow: 0 0 50px var(--box-glow), 0 0 90px var(--box-glow) !important;
  animation: none;
}

/* ===== HOVER: bounce + glow (chỉ khi unlocked) ===== */
.chest-card:hover .is-unlocked {
  animation: chestBounce 0.75s ease infinite;
}
.chest-card:hover .is-unlocked img {
  filter: brightness(1.15) drop-shadow(0 0 8px var(--glow)) !important;
}

@keyframes chestBounce {
  0%, 100% { transform: translateY(0) scale(1.07); }
  50%       { transform: translateY(-4px) scale(1.07); }
}

/* ===== SHAKE khi click locked ===== */
@keyframes shakeLocked {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  15%      { transform: translateX(-6px) rotate(-2.5deg); }
  30%      { transform: translateX(6px) rotate(2.5deg); }
  45%      { transform: translateX(-4px) rotate(-1.5deg); }
  60%      { transform: translateX(4px) rotate(1.5deg); }
  80%      { transform: translateX(-2px); }
}
.is-shaking {
  animation: shakeLocked 0.55s ease !important;
}

/* ===== TOOLTIP hiện khi hover locked ===== */
.chest-card:hover .chest-tooltip {
  opacity: 1 !important;
}
</style>
