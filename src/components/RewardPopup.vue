<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth, db } from '@/firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'

const router = useRouter()
const unseenRewards = ref<any[]>([])
const currentReward = ref<any>(null)
const showPopup = ref(false)

// Cờ đánh dấu lần đầu tiên quét dữ liệu
let isFirstLoad = true 

onMounted(() => {
  auth.onAuthStateChanged((user) => {
    if (user) {
      // Lấy toàn bộ đơn của user này để nghe ngóng
      const q = query(
        collection(db, "reports"),
        where("uid", "==", user.uid)
      )
      
      onSnapshot(q, (snap) => {
        const seenIds = JSON.parse(localStorage.getItem('seenRewards') || '[]')
        const newRewards: any[] = []

        // Dùng docChanges() để chỉ bắt đúng những sự kiện VỪA XẢY RA
        snap.docChanges().forEach((change) => {
          const data = change.doc.data()
          const id = change.doc.id

          // Kiểm tra: Nếu đơn được Approved và chưa từng nổ popup
          if (data.status === 'approved' && !seenIds.includes(id)) {
            
            if (isFirstLoad) {
              // TRƯỜNG HỢP 1: Lần đầu quét data (Đơn đã duyệt từ lâu)
              seenIds.push(id)
            } else if (change.type === 'modified') {
              // TRƯỜNG HỢP 2: Đang dùng web mà Admin VỪA BẤM DUYỆT TỨC THÌ
              newRewards.push({ id, ...data })
            }
          }
        })

        // Cập nhật lại bộ nhớ ngay lần đầu để giấu hết đơn cũ
        if (isFirstLoad) {
          localStorage.setItem('seenRewards', JSON.stringify(seenIds))
          isFirstLoad = false
        }

        // Nếu có đơn MỚI VỪA DUYỆT thì kích nổ
        if (newRewards.length > 0) {
          unseenRewards.value.push(...newRewards)
          if (!showPopup.value) {
            showNextReward()
          }
        }
      })
    }
  })
})

// Chạy đơn tiếp theo nếu Admin duyệt 1 lúc nhiều đơn
const showNextReward = () => {
  if (unseenRewards.value.length > 0) {
    currentReward.value = unseenRewards.value[0]
    showPopup.value = true
  } else {
    showPopup.value = false
  }
}

// Bấm nút: Cất tiền và dọn sạch
const markAsSeenAndClose = () => {
  if (!currentReward.value) return

  const seenIds = JSON.parse(localStorage.getItem('seenRewards') || '[]')
  seenIds.push(currentReward.value.id)
  localStorage.setItem('seenRewards', JSON.stringify(seenIds))

  unseenRewards.value.shift()
  showPopup.value = false

  // Nghỉ 0.4s rồi nổ tiếp nếu còn đơn chờ
  setTimeout(() => {
    if (unseenRewards.value.length > 0) {
      showNextReward()
    }
  }, 400)
}

// Hàm Rút Tiền: Gọi Cất tiền xong thì chuyển hướng
const handleWithdraw = () => {
  markAsSeenAndClose();
  router.push('/withdraw');
}
</script>

<template>
  <Transition name="bounce">
    <div v-if="showPopup && currentReward" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <svg width="0" height="0" class="absolute">
        <defs>
          <linearGradient id="popupGoldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#fde047" />
            <stop offset="50%" style="stop-color:#eab308" />
            <stop offset="100%" style="stop-color:#854d0e" />
          </linearGradient>
        </defs>
      </svg>

      <div class="absolute inset-0 bg-black/80"></div>
      
      <div class="relative bg-[#0d121f] border-2 border-emerald-500 w-full max-w-md rounded-[35px] p-8 text-center shadow-[0_0_50px_rgba(16,185,129,0.4)] overflow-hidden">
        
        <div class="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/20 rounded-full blur-[60px] animate-pulse"></div>
        <div class="absolute -bottom-20 -left-20 w-48 h-48 bg-yellow-500/10 rounded-full blur-[60px]"></div>

        <div class="relative z-10">
          <div class="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(16,185,129,0.5)] border-4 border-[#0d121f]">
            <span class="text-5xl animate-bounce">💸</span>
          </div>
          
          <h2 class="text-xl md:text-2xl text-emerald-400 font-black italic tracking-tighter mb-1 uppercase drop-shadow-md">
            TING TING! TING TING!
          </h2>
          <p class="text-white text-[13px] font-black italic uppercase tracking-widest mb-6 opacity-90">
            ADMIN VỪA DUYỆT ĐƠN
          </p>

          <div class="bg-[#111726] border border-slate-800 rounded-2xl p-5 mb-8 shadow-inner">
            <p class="text-slate-400 text-[9px] tracking-[2px] uppercase mb-2">TỪ CÔNG VIỆC</p>
            <p class="text-white text-sm font-black italic uppercase leading-tight mb-4 text-emerald-300">
              {{ currentReward.jobName }}
            </p>
            <p class="text-slate-400 text-[9px] tracking-[2px] uppercase mb-2">BẠN NHẬN ĐƯỢC</p>
            
            <div class="flex items-center justify-center gap-2">
              <span class="text-emerald-400 text-4xl font-black italic tracking-tighter drop-shadow-lg">
                +{{ (currentReward.reward || 0).toLocaleString() }}
              </span>
              <div class="flex flex-col items-center translate-y-[-2px]">
                <svg class="w-7 h-7 drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="url(#popupGoldGradient)" />
                  <path d="M12 7v10M9 10h6M9 14h6" stroke="#854d0e" stroke-width="2" stroke-linecap="round" />
                </svg>
                <span class="text-[9px] text-yellow-500 font-black not-italic leading-none uppercase mt-1">Xu</span>
              </div>
            </div>
          </div>
          
          <div class="flex flex-col sm:flex-row gap-3">
            <button 
              @click="handleWithdraw"
              class="w-full sm:flex-1 bg-yellow-500 text-[#090d14] py-4 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-yellow-400 transition-all active:scale-95 shadow-[0_0_20px_rgba(234,179,8,0.3)] border border-yellow-400"
            >
              RÚT TIỀN NGAY 💸
            </button>

            <button 
              @click="markAsSeenAndClose"
              class="w-full sm:flex-1 bg-emerald-500 text-[#090d14] py-4 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              THU VỀ VÍ ⚡
            </button>
          </div>

          <p class="mt-5 text-[8px] text-slate-500 tracking-widest uppercase opacity-60 italic">
            *Nhấn để thu tiền và không hiển thị lại thông báo này
          </p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bounce-enter-active {
  animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.26, 1.55);
}
.bounce-leave-active {
  animation: bounce-in 0.3s reverse;
}
@keyframes bounce-in {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
</style>