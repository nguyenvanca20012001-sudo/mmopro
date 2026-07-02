<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { jobsData } from '@/data/jobs'
import { vipJobConfigs, VIP_JOB_IDS } from '@/composables/useVipJobs'
import { basicJobConfigs, startBasicJobConfigsListener } from '@/composables/useBasicJobConfigs'
import Swal from 'sweetalert2'

const route = useRoute()
const router = useRouter()
const showGuide = ref(true)
const baseUrl = import.meta.env.BASE_URL

const jobId = route.params.id as string
const _staticJob = (jobsData[jobId] || jobsData['app-chung-khoan']) as Record<string, any>

const currentJob = computed(() => {
  const f = (vipJobConfigs.value[jobId] || {}) as Record<string, any>
  return {
    ..._staticJob,
    title:   (f.title   !== undefined && f.title   !== '') ? f.title   : _staticJob.title,
    reward:  (f.reward  !== undefined && f.reward  !== '') ? f.reward  : _staticJob.reward,
    badge:   (f.badge   !== undefined && f.badge   !== '') ? f.badge   : _staticJob.badge,
    color:   (f.color   !== undefined && f.color   !== '') ? f.color   : _staticJob.color,
    warning: (f.warning !== undefined && f.warning !== '') ? f.warning : _staticJob.warning,
  }
})

const jobStatus = computed(() => (vipJobConfigs.value[jobId]?.status as string) ?? 'open')
const jobStatusMessage = computed(() => {
  if (jobStatus.value === 'paused')  return 'Công việc đang tạm dừng, vui lòng quay lại sau.'
  if (jobStatus.value === 'soldout') return 'Công việc đã hết lượt hôm nay.'
  return ''
})

watch(jobStatus, (status) => {
  if (status === 'hidden') router.push('/')
}, { immediate: true })

startBasicJobConfigsListener()

const basicConfig = computed(() => basicJobConfigs.value['post-threads'])

const effectiveRandomTemplates = computed<string[]>(() => {
  if (jobId !== 'post-threads') return []
  const contents = (basicConfig.value?.postContents as string[] | undefined)
    ?.filter((c: string) => c?.trim())
  return contents?.length ? contents : []
})

const effectiveSteps = computed<any[]>(() => _staticJob.steps || [])

const selectedImage = ref<string | null>(null)
const openImage = (img: string) => { selectedImage.value = img }
const closeImage = () => { selectedImage.value = null }

const handleCopy = (text: string) => {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    Swal.fire({
      title: 'ĐÃ SAO CHÉP!',
      text: 'Đã lưu nội dung vào khay nhớ tạm.',
      icon: 'success',
      timer: 1500,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    })
  }).catch(() => {
    const textArea = document.createElement("textarea")
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      Swal.fire({
        title: 'ĐÃ SAO CHÉP!',
        icon: 'success',
        timer: 1000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      })
    } catch (err) {
      alert('Lỗi sao chép, hãy copy thủ công nhé!')
    }
    document.body.removeChild(textArea)
  })
}

const handleRandomCopy = (stepTemplates: string[]) => {
  const pool = effectiveRandomTemplates.value.length
    ? effectiveRandomTemplates.value
    : stepTemplates.filter((t: string) => t?.trim())

  if (!pool.length) {
    Swal.fire({
      title: 'Chú ý',
      text: 'Admin chưa cấu hình nội dung bài đăng.',
      icon: 'warning',
      timer: 2000,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    })
    return
  }

  const item = pool[Math.floor(Math.random() * pool.length)] ?? ''
  if (!item) return
  navigator.clipboard.writeText(item)
    .then(() => {
      Swal.fire({
        title: 'Đã copy!',
        text: 'Đã copy 1 mẫu bài đăng ngẫu nhiên!',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      })
    })
    .catch(() => {
      Swal.fire({
        title: 'Nội dung bài đăng',
        html: `<textarea style="width:100%;height:120px;background:#1e293b;color:#e2e8f0;padding:10px;border-radius:8px;font-size:12px;border:1px solid #334155;" readonly>${item}</textarea>`,
        confirmButtonText: 'Đóng'
      })
    })
}

const handleRandomDownload = (links: string[]) => {
  const validLinks = links.filter(Boolean)
  if (!validLinks.length) {
    Swal.fire({
      title: 'Chú ý',
      text: 'Ảnh mẫu chưa được cấu hình.',
      icon: 'warning',
      timer: 2000,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    })
    return
  }

  const randomIndex = Math.floor(Math.random() * validLinks.length)
  const imageUrl = validLinks[randomIndex] ?? ''
  if (!imageUrl) return

  console.log("Random thread image selected:", imageUrl)

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  if (isMobile) {
    window.open(`${imageUrl}?v=${Date.now()}`, '_blank')
  } else {
    const fileName = `threads-bai-dang-${Date.now()}-${Math.floor(Math.random() * 100000)}.jpg`
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  Swal.fire({
    title: 'Đã tải!',
    text: 'Đã tải ngẫu nhiên 1 ảnh bài đăng!',
    icon: 'success',
    timer: 1500,
    showConfirmButton: false,
    toast: true,
    position: 'top-end'
  })
}
</script>

<template>
  <div class="min-h-screen bg-transparent text-gray-800 p-4 md:p-8 font-black italic uppercase text-left relative">

    <Transition name="fade">
      <div class="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out" v-if="selectedImage" @click="closeImage">
        <button class="absolute top-6 right-6 md:top-10 md:right-10 w-12 h-12 bg-slate-800 border border-slate-700 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors z-[6010] shadow-2xl" @click.stop="closeImage">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
        <img class="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-[6005] cursor-default" :src="selectedImage" @click.stop />
      </div>
    </Transition>

    <div class="flex justify-between items-center mb-8 max-w-4xl mx-auto border-b border-slate-800 pb-4">
      <button class="text-[10px] tracking-[3px] text-gray-600 hover:text-gray-900 transition-all flex items-center gap-1" @click="router.push('/')">
        <span class="text-base font-light not-italic font-sans">✕</span> QUAY LẠI
      </button>
      <span class="text-[10px] tracking-[4px] text-gray-600">HƯỚNG DẪN CHI TIẾT</span>
    </div>

    <div class="max-w-4xl mx-auto space-y-10">
      <div class="text-center">
        <h1 class="text-4xl md:text-5xl font-black text-blue-400 italic tracking-tighter leading-none mb-5 drop-shadow-xl">
          {{ currentJob.title }}
        </h1>
        <div class="bg-[#052e1f] border border-[#005c3c] rounded-full px-6 py-2.5 w-max mx-auto flex items-center gap-2 shadow-inner">
          <span class="text-[#f59e0b] text-xl">⚡</span>
          <span class="text-[#00df89] text-base md:text-lg font-black italic uppercase tracking-tighter">
            THƯỞNG: {{ currentJob.reward }}
          </span>
        </div>

        <div v-if="!['lpbank-plus', 'mbbank'].includes(route.params.id as string)"
             class="mt-6 max-w-xl mx-auto bg-[#1a0f14] border border-red-500/50 rounded-2xl overflow-hidden shadow-[0_0_24px_rgba(239,68,68,0.18)]">
          <div class="bg-red-500/20 border-b border-red-500/30 px-4 py-2.5 flex items-center gap-2">
            <span class="text-red-400 text-base">⚠️</span>
            <span class="text-red-400 text-[11px] md:text-xs font-black uppercase tracking-[2px]">Điều kiện bắt buộc</span>
          </div>
          <div class="px-4 py-3 text-left">
            <p v-if="currentJob.warning" class="text-red-400 text-[11px] md:text-xs font-bold uppercase italic tracking-[1px] leading-relaxed">
              {{ currentJob.warning }}
            </p>
            <ul v-else class="space-y-1.5">
              <li class="flex items-start gap-2 text-red-300 text-[11px] md:text-xs font-semibold leading-relaxed">
                <span class="text-red-500 mt-0.5 shrink-0">•</span>
                Không xóa bài đăng, hủy follow hoặc rời nhóm sau khi hoàn thành.
              </li>
              <li class="flex items-start gap-2 text-red-300 text-[11px] md:text-xs font-semibold leading-relaxed">
                <span class="text-red-500 mt-0.5 shrink-0">•</span>
                Chụp bằng chứng đúng theo hướng dẫn từng bước, ảnh phải rõ nét.
              </li>
              <li class="flex items-start gap-2 text-red-300 text-[11px] md:text-xs font-semibold leading-relaxed">
                <span class="text-red-500 mt-0.5 shrink-0">•</span>
                Tài khoản phải là tài khoản thật, không dùng tài khoản ảo/clone.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-if="VIP_JOB_IDS.includes(route.params.id as string)"
           class="max-w-xl mx-auto bg-gradient-to-r from-red-950/90 to-orange-950/70 border-2 border-orange-500/60 rounded-2xl px-4 md:px-5 py-3.5 md:py-4 flex items-start gap-3 shadow-[0_0_24px_rgba(249,115,22,0.25)]">
        <span class="text-2xl md:text-3xl shrink-0 leading-none drop-shadow-[0_0_10px_rgba(249,115,22,0.7)]">⚠️</span>
        <div class="text-left">
          <h4 class="text-orange-400 font-black uppercase text-[13px] md:text-sm tracking-wider mb-1 drop-shadow-md">
            Lưu ý quan trọng
          </h4>
          <p class="text-orange-50 text-[11px] md:text-[13px] font-semibold leading-relaxed normal-case">
            1 điện thoại chỉ được đăng ký 1 tài khoản cho mỗi APP. Không được đăng xuất ra rồi đăng ký tài khoản khác trên cùng điện thoại. Nếu vi phạm, đơn có thể bị từ chối.
          </p>
        </div>
      </div>

      <div v-if="currentJob.zaloGuideUrl" class="text-center">
        <a :href="currentJob.zaloGuideUrl" target="_blank"
           class="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-black uppercase transition-all active:scale-95 shadow-lg">
          💬 Vào nhóm Zalo xem hướng dẫn
        </a>
      </div>

      <div class="bg-[#111726] rounded-[45px] border border-slate-800/50 p-6 md:p-10 shadow-2xl relative">
        <div class="text-center space-y-5">

         <div class="mb-6 bg-gradient-to-r from-yellow-500/10 to-orange-500/5 border border-yellow-500/30 rounded-2xl p-4 md:p-5 flex items-start gap-3 md:gap-4 shadow-[0_0_20px_rgba(234,179,8,0.1)] relative overflow-hidden animate-in fade-in duration-150"
                v-if="VIP_JOB_IDS.includes(route.params.id as string)">

            <div class="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-yellow-400 to-orange-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]"></div>

            <div class="text-2xl md:text-3xl animate-bounce drop-shadow-[0_0_15px_rgba(234,179,8,0.8)] mt-1">🪝</div>

            <div class="text-left">
              <h4 class="text-yellow-400 font-black italic uppercase text-[12px] md:text-sm tracking-widest mb-1.5 drop-shadow-md">
                MẸO KIẾM TIỀN:
              </h4>
              <p class="text-white text-[11px] md:text-[13px] font-medium leading-relaxed normal-case">
                Nếu bạn đã đăng ký APP này rồi, có thể <span class="text-yellow-400 font-black italic text-[12px] md:text-[14px]">giới thiệu bạn bè / người thân đăng ký</span> và chụp lại ảnh bằng chứng gửi lên hệ thống, bạn <span class="text-yellow-400 font-black italic text-[12px] md:text-[14px]">vẫn được nhận hoa hồng</span> bình thường nhé! 🚀
              </p>
            </div>
          </div>
          <button
            class="group relative w-full flex items-center gap-4 p-5 rounded-3xl transition-all mt-4 overflow-hidden border-2 active:scale-[0.98]"
            :class="showGuide
              ? 'bg-gradient-to-r from-emerald-900/60 to-teal-900/40 border-emerald-500/60 shadow-[0_0_20px_rgba(0,223,137,0.15)]'
              : 'bg-gradient-to-r from-emerald-600/20 to-teal-600/10 border-emerald-400/80 shadow-[0_0_25px_rgba(0,223,137,0.35)] guide-pulse'"
            @click="showGuide = !showGuide">

            <!-- Glow overlay khi đóng -->
            <div v-if="!showGuide" class="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none"></div>

            <!-- Icon -->
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-all"
                 :class="showGuide ? 'bg-emerald-900/50' : 'bg-emerald-500/20 shadow-[0_0_15px_rgba(0,223,137,0.4)]'">
              {{ showGuide ? '📖' : '👆' }}
            </div>

            <!-- Text -->
            <div class="text-left flex-1 relative z-10">
              <h3 class="text-blue-400 font-black italic uppercase tracking-tight leading-tight mb-1.5"
                  :class="showGuide ? 'text-base' : 'text-lg'">
                {{ showGuide ? 'ĐANG XEM HƯỚNG DẪN' : 'HƯỚNG DẪN TỪNG BƯỚC' }}
              </h3>
              <!-- Step number pills -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <span
                  v-for="step in effectiveSteps" :key="step.id"
                  class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black"
                  :class="showGuide ? 'bg-emerald-800 text-emerald-300' : 'bg-emerald-400 text-[#090e17]'">
                  {{ step.id }}
                </span>
                <span class="text-[9px] font-black uppercase tracking-wider"
                      :class="showGuide ? 'text-emerald-600' : 'text-emerald-300'">
                  {{ effectiveSteps.length || 0 }} BƯỚC
                </span>
              </div>
            </div>

            <!-- Chevron -->
            <svg class="w-5 h-5 shrink-0 transition-transform duration-300 relative z-10"
                 :class="showGuide ? 'rotate-180 text-emerald-600' : 'text-emerald-400'"
                 fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
        </div>

        <div class="mt-8 pt-8 border-t border-slate-800/50 space-y-8 animate-in fade-in duration-500" v-if="showGuide">

          <div v-if="_staticJob.notice" class="flex items-center gap-3 bg-[#1c1200] border border-yellow-500/60 rounded-2xl px-5 py-4 shadow-[0_0_20px_rgba(234,179,8,0.15)]">
            <span class="text-yellow-400 text-xl shrink-0">📢</span>
            <p class="text-yellow-300 text-sm font-black uppercase tracking-wide leading-snug">{{ _staticJob.notice }}</p>
          </div>

          <div class="relative pl-10" v-for="step in effectiveSteps" :key="step.id">
            <div class="absolute left-4 top-0 bottom-0 w-[2px] bg-slate-700/30"></div>

            <div class="absolute left-0 top-1 w-8 h-8 rounded-full bg-[#00df89] text-[#090e17] flex items-center justify-center text-sm font-black shadow-lg shadow-emerald-500/20">
              {{ step.id }}
            </div>

            <div class="pb-8">
              <h4 class="text-[#3b82f6] text-base md:text-lg italic font-black mb-2 uppercase tracking-tight">
                {{ step.title }}
              </h4>
              <p v-if="step.contentHtml" class="text-xs italic normal-case leading-relaxed mb-5" v-html="step.contentHtml"></p>
              <p v-else class="text-slate-400 text-xs italic normal-case opacity-80 leading-relaxed mb-5">
                {{ step.content }}
              </p>

              <div class="mb-5" v-if="step.referralCode">
                <button
                  class="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-[11px] font-black transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
                  @click="handleCopy(step.referralCode)">
                  📋 SAO CHÉP MÃ: {{ step.referralCode }}
                </button>
              </div>

              <div class="mb-8 space-y-4" v-if="step.templates && step.templates.length > 0">
                <div class="bg-[#0d121f] p-5 rounded-2xl border border-slate-700/80 relative group shadow-inner" v-for="(temp, idx) in step.templates" :key="idx">
                  <p class="text-slate-300 text-[12px] normal-case italic opacity-90 whitespace-pre-wrap leading-relaxed pr-24 select-all">
                    {{ temp }}
                  </p>
                  <button class="absolute top-1/2 -translate-y-1/2 right-4 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-all flex items-center gap-1.5"
                    @click="handleCopy(temp)">
                    📋 COPY
                  </button>
                </div>
              </div>

              <div class="mb-8" v-if="step.randomTemplates && step.randomTemplates.length > 0">
                <p class="text-slate-300 text-[11px] font-black uppercase tracking-widest mb-1">Nội dung bài đăng Threads</p>
                <p class="text-slate-500 text-[11px] normal-case italic font-medium mb-3">Bấm COPY để nhận ngẫu nhiên 1 mẫu bài đăng.</p>
                <div class="bg-[#0d121f] p-5 rounded-2xl border border-slate-700/80 shadow-inner">
                  <p class="text-slate-500 text-[12px] normal-case italic opacity-80 mb-3">Hệ thống sẽ tự chọn ngẫu nhiên 1 bài đăng khi bạn bấm COPY.</p>
                  <button
                    class="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-[11px] font-black uppercase shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                    @click="handleRandomCopy(step.randomTemplates)">
                    📋 COPY NGẪU NHIÊN
                  </button>
                </div>
              </div>

              <div class="mb-8 space-y-4 max-w-lg" v-if="step.copyContents">
                <div class="bg-[#0d121f] border border-slate-700 rounded-2xl p-4 shadow-inner" v-for="(item, index) in step.copyContents" :key="index">
                  <p class="text-[10px] text-emerald-400 font-black mb-2 tracking-[2px] uppercase italic border-b border-slate-800 pb-2">⭐ {{ item.label }}</p>
                  <div class="text-slate-300 text-xs normal-case italic opacity-90 mb-4 whitespace-pre-wrap leading-relaxed select-all">
                    {{ item.text }}
                  </div>
                  <button class="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-[11px] font-black transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2" @click="handleCopy(item.text)">
                    📋 SAO CHÉP {{ item.label }}
                  </button>
                </div>
              </div>

              <div class="mb-6 max-w-md" v-if="step.referralLink">
                <div class="bg-[#0d121f] border border-slate-700 p-2 rounded-xl flex items-center gap-2 shadow-xl">
                  <input class="flex-1 bg-transparent border-none text-[10px] text-emerald-400 font-black italic px-2 outline-none overflow-hidden text-ellipsis whitespace-nowrap" readonly :value="step.referralLink" />
                  <button class="bg-emerald-500 hover:bg-emerald-600 text-[#090e17] px-4 py-2 rounded-lg text-[10px] font-black transition-all active:scale-95" @click="handleCopy(step.referralLink)">
                    SAO CHÉP LINK
                  </button>
                </div>
              </div>

              <div class="mb-6 flex flex-wrap items-center gap-3" v-if="step.downloadLink">
                <a class="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl text-[11px] font-black uppercase hover:shadow-lg hover:shadow-blue-500/30 transition-all active:scale-95" :href="step.downloadLink" target="_blank" :download="step.downloadLink.includes('.png') || step.downloadLink.includes('.jpg') ? 'Tai_Lieu_MMO_PRO' : false">
                  {{ step.buttonText || 'TẢI APP NGAY ➔' }}
                </a>

                <button class="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 px-5 py-3 rounded-xl text-[11px] font-black uppercase transition-all shadow-md border border-slate-700 active:scale-95"
                  v-if="!step.downloadLink.includes('.png') && !step.downloadLink.includes('.jpg') && !step.downloadLink.startsWith('https://')"
                  @click="handleCopy(step.downloadLink)">
                  📋 SAO CHÉP LINK
                </button>
              </div>

              <div class="mb-6 flex flex-wrap items-center gap-3" v-if="step.randomDownloadLinks && step.randomDownloadLinks.length > 0">
                <button
                  class="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl text-[11px] font-black uppercase hover:shadow-lg hover:shadow-blue-500/30 transition-all active:scale-95"
                  @click="handleRandomDownload(step.randomDownloadLinks)">
                  {{ step.buttonText || '📥 TẢI ẢNH BÀI ĐĂNG' }}
                </button>
              </div>

              <div class="mb-6 flex flex-wrap items-center gap-3" v-if="step.extraLinks">
                <a v-for="link in step.extraLinks" :key="link.url"
                   class="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl text-[11px] font-black uppercase hover:shadow-lg hover:shadow-blue-500/30 transition-all active:scale-95"
                   :href="link.url" target="_blank">
                  {{ link.text }}
                </a>
              </div>

              <div class="flex flex-col md:flex-row gap-6 items-start">
                <div class="w-full md:max-w-[400px] rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl bg-slate-900 cursor-zoom-in group relative"
                     v-if="step.img"
                     @click="openImage(step.img?.startsWith('http') ? step.img : (baseUrl + step.img))">
                  <img class="w-full h-auto object-contain hover:scale-105 transition-transform duration-500" :src="step.img?.startsWith('http') ? step.img : (baseUrl + step.img)" />
                  <div class="absolute bottom-2 right-2 bg-black/70 backdrop-blur text-white text-[8px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">🔍 CHẠM ĐỂ PHÓNG TO</div>
                </div>

                <div class="bg-[#0d121f] border-l-4 border-blue-500 p-6 rounded-2xl flex-1 shadow-lg" v-if="step.note">
                  <p class="text-blue-400 text-[10px] font-black tracking-[2px] mb-2 uppercase italic">Thông tin quan trọng</p>
                  <h5 class="text-white text-lg md:text-xl font-black italic leading-tight uppercase">{{ step.note }}</h5>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2 md:gap-4 mt-4" v-if="step.images">
                <div class="rounded-xl overflow-hidden border border-slate-700/50 shadow-lg relative group bg-slate-900 cursor-zoom-in"
                     v-for="(imgSrc, idx) in step.images" :key="idx"
                     @click="openImage(baseUrl + imgSrc)">
                  <img class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" :src="baseUrl + imgSrc" />
                  <div class="absolute top-1.5 left-1.5 bg-blue-600/90 backdrop-blur-sm text-white text-[8px] md:text-[10px] font-black px-2 py-0.5 rounded shadow-sm">ẢNH {{ (idx as number) + 1 }}</div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      <section class="bg-[#111726] rounded-[45px] border border-slate-800/50 p-8 md:p-10 text-center shadow-xl mb-20">
        <h2 class="text-lg text-slate-400 font-black italic mb-6 tracking-wide uppercase opacity-60">BẠN ĐÃ LÀM XONG?</h2>

        <!-- Job paused or soldout: disabled button + status message -->
        <div v-if="jobStatus === 'paused' || jobStatus === 'soldout'" class="space-y-4">
          <p class="text-slate-400 text-sm font-bold">{{ jobStatusMessage }}</p>
          <button disabled class="w-full bg-slate-700 text-slate-500 py-5 rounded-2xl text-xl font-black italic uppercase cursor-not-allowed opacity-50">
            NỘP BẰNG CHỨNG NGAY
          </button>
        </div>

        <!-- Job open: normal button -->
        <button v-else-if="jobStatus === 'open'"
          class="w-full bg-[#00df89] hover:bg-[#00c578] text-[#090e17] py-5 rounded-2xl text-xl font-black italic uppercase shadow-[0_10px_40px_rgba(0,223,137,0.25)] transition-all active:scale-95"
          @click="router.push(`/submit-report?job=${route.params.id}`)">
          NỘP BẰNG CHỨNG NGAY
        </button>

        <!-- Job hidden: no button -->
      </section>
    </div>
  </div>
</template>

<style scoped>
::-webkit-scrollbar { width: 0px; }
.animate-in { animation-duration: 0.15s; }
.zoom-in { animation: zoomIn 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
.guide-pulse {
  animation: guidePulse 2s ease-in-out infinite;
}
@keyframes guidePulse {
  0%, 100% { box-shadow: 0 0 20px rgba(0,223,137,0.25), 0 0 0 0 rgba(0,223,137,0.15); }
  50%       { box-shadow: 0 0 30px rgba(0,223,137,0.5), 0 0 12px 4px rgba(0,223,137,0.1); }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
