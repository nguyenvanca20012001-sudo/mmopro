<script setup lang="ts">
import { ref, onMounted, computed, watch, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth, db } from '@/firebase' 
import { onAuthStateChanged, signOut } from "firebase/auth" 
import { doc, onSnapshot, collection, query, where, updateDoc, increment, limit } from "firebase/firestore"

// --- IMPORT COMPONENT ---
import { jobsData } from '@/data/jobs'
import AppBrowserBlocker from '@/components/AppBrowserBlocker.vue'
import RewardPopup from '@/components/RewardPopup.vue'
import Sidebar from '@/components/home/Sidebar.vue'
import JobSection from '@/components/home/JobSection.vue'
import HistorySection from '@/components/home/HistorySection.vue'
import InfoSection from '@/components/home/InfoSection.vue'

// --- KHỞI TẠO BIẾN TRẠNG THÁI HỆ THỐNG ---
const router = useRouter()
const route = useRoute()

// Trạng thái ẩn/hiện số dư (Mặc định là hiện)
const isBalanceVisible = ref(localStorage.getItem('mmo_balance_hide') !== 'true');

const toggleBalance = () => {
  isBalanceVisible.value = !isBalanceVisible.value;
  localStorage.setItem('mmo_balance_hide', String(!isBalanceVisible.value));
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
};

const isLoggedIn = ref(false)
const isMenuOpen = ref(true) 
const isDataLoading = ref(true)
const windowWidth = ref(0) 
const showWelcomePopup = ref(false)
const showBankModal = ref(false)


const isAdminRoute = computed(() => route.path.includes('admin'))
const username = ref(localStorage.getItem('mmo_username') || 'Member')
const userBalance = ref(Number(localStorage.getItem('mmo_balance')) || 0)

const myReports = ref<any[]>([])
const myWithdrawals = ref<any[]>([])
const userData = ref<any>(null)

provide('userData', userData)
provide('myReports', myReports)
provide('myWithdrawals', myWithdrawals)
provide('isDataLoading', isDataLoading)

// ============================================================================
// LOGIC POPUP: KHÁCH ĐỌC THÔNG BÁO TỪ ADMIN
// ============================================================================
const dismissedRejections = ref<string[]>(JSON.parse(localStorage.getItem('mmo_dismissed_rejections') || '[]'))
const unreadRejectedReport = computed(() => {
  return myReports.value.find(rp => rp.status === 'rejected' && !dismissedRejections.value.includes(rp.id))
})
const dismissRejection = (id: string) => {
  dismissedRejections.value.push(id)
  localStorage.setItem('mmo_dismissed_rejections', JSON.stringify(dismissedRejections.value))
}

const dismissedMessages = ref<string[]>(JSON.parse(localStorage.getItem('mmo_dismissed_messages') || '[]'))
const unreadMessageReport = computed(() => {
  return myReports.value.find(rp => rp.status === 'pending' && rp.note && !dismissedMessages.value.includes(rp.id))
})
const dismissMessage = (id: string) => {
  dismissedMessages.value.push(id)
  localStorage.setItem('mmo_dismissed_messages', JSON.stringify(dismissedMessages.value))
}

// ============================================================================
// LOGIC THÔNG BÁO "NỔ HŨ" (ĐÃ CẬP NHẬT CÔNG VIỆC MỚI)
// ============================================================================
const randomNotice = ref<any>(null)
const names = ['TRUNG NGUYỄN', 'HOÀNG ANH', 'MINH TUẤN', 'THANH HẰNG', 'VĂN NAM', 'BÍCH PHƯỢNG', 'QUỐC BẢO', 'KHÁNH LINH', 'TRẦN TÂM', 'SƠN TÙNG', 'ANH VŨ', 'QUANG LÊ', 'MINH ĐỨC', 'HỮU PHÚC', 'TIẾN ĐẠT']
const banks = ['MB BANK', 'VPBANK', 'TPBANK', 'VIETCOMBANK', 'TECHCOMBANK', 'MOMO', 'MSB BANK']

// ĐÃ CẬP NHẬT DANH SÁCH CÔNG VIỆC THEO DATA MỚI
const jobList = [
  { name: 'Cày View TikTok', reward: '30.000' },
  { name: 'Cày View YouTube', reward: '30.000' },
  { name: 'Đăng Bài Threads', reward: '30.000' },
  { name: 'Seeding VinFast', reward: '30.000' },
  { name: 'Đánh giá Google Map', reward: '25.000' },
  { name: 'Tham gia nhóm Zalo', reward: '10.000' },
  { name: 'App Chứng Khoán', reward: '85.000' },
  { name: 'Ngân hàng MSB', reward: '100.000' },
  { name: 'Ngân hàng VPB', reward: '100.000' },
  { name: 'Ngân hàng TPB', reward: '100.000' }
]

const triggerNotice = (type: 'job' | 'withdraw') => {
  const name = names[Math.floor(Math.random() * names.length)]
  if (type === 'withdraw') {
    const bank = banks[Math.floor(Math.random() * banks.length)]
    
    // ĐÃ FIX: Mốc rút tiền ảo giờ bắt đầu từ 200k trở lên
    const withdrawAmounts = ['250.000', '300.000', '500.000', '650.000', '800.000', '1.000.000', '2.000.000', ]
    
    randomNotice.value = { 
      type: 'withdraw', name, title: 'Vừa rút thành công', 
      amount: withdrawAmounts[Math.floor(Math.random() * withdrawAmounts.length)], sub: `Về Ngân hàng ${bank}` 
    }
  } else {
    const job = jobList[Math.floor(Math.random() * jobList.length)]
    randomNotice.value = { 
      type: 'job', name, title: 'Vừa hoàn thành', 
      amount: job.reward, sub: `Công việc: ${job.name}` 
    }
  }
  setTimeout(() => { randomNotice.value = null }, 2000) 
}

const startToasting = () => {
  const jobLoop = () => {
    const nextJob = Math.floor(Math.random() * (5000 - 3000 + 1) + 3000)
    setTimeout(() => { 
      if (!randomNotice.value) triggerNotice('job'); 
      jobLoop() 
    }, nextJob)
  }
  const withdrawLoop = () => {
    const nextWithdraw = Math.floor(Math.random() * (5000 - 3000 + 1) + 3000)
    setTimeout(() => { 
      if (!randomNotice.value) triggerNotice('withdraw'); 
      withdrawLoop() 
    }, nextWithdraw)
  }
  jobLoop(); withdrawLoop()
}

const combinedHistory = computed(() => {
  const combined = [
    ...myReports.value.map(item => ({ ...item, type: 'task' })), 
    ...myWithdrawals.value.map(item => ({ ...item, type: 'withdraw' }))
  ]
  return combined.map(item => {
    let displayTime = 'VỪA XONG'; 
    let sortTime = Date.now()
    if (item.createdAt) {
      if (typeof item.createdAt === 'string') {
        displayTime = item.createdAt.split('T')[0]; sortTime = new Date(item.createdAt).getTime()
      } else if (item.createdAt.toDate) {
        const d = item.createdAt.toDate(); displayTime = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; sortTime = d.getTime()
      }
    }
    return { ...item, displayTime, sortTime }
  }).sort((a, b) => b.sortTime - a.sortTime)
})

onMounted(() => {
  windowWidth.value = window.innerWidth
  window.addEventListener('resize', () => { windowWidth.value = window.innerWidth })
  
  startToasting()
  
  let unsubUser: (() => void) | null = null
  let unsubReports: (() => void) | null = null
  let unsubWithdrawals: (() => void) | null = null

  onAuthStateChanged(auth, async (user) => {
    unsubUser?.(); unsubReports?.(); unsubWithdrawals?.()
    unsubUser = null; unsubReports = null; unsubWithdrawals = null

    if (user && !isAdminRoute.value) {
      isLoggedIn.value = true

      unsubUser = onSnapshot(doc(db, "users", user.uid), async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data()
          userData.value = data
          username.value = data.username || data.fullName || 'Member'
          const realBalance = data.balance ? Number(data.balance) : 0;
          userBalance.value = realBalance;

          // ==============================================================
          // ĐÃ FIX LỖI TẶNG LẠI 10K KHI KHÁCH RÚT TIỀN VỀ 0
          // ==============================================================
          if (data.receivedWelcomeGift !== true) {
             if (realBalance === 0) {
               try {
                 await updateDoc(doc(db, "users", user.uid), {
                   balance: increment(10000),
                   receivedWelcomeGift: true
                 })
                 showWelcomePopup.value = true
               } catch (e) { console.error("Lỗi cộng tiền:", e) }
             } else if (realBalance > 0) {
               updateDoc(doc(db, "users", user.uid), { receivedWelcomeGift: true }).catch(e => {})
             }
          }

          localStorage.setItem('mmo_username', username.value)
          localStorage.setItem('mmo_balance', String(realBalance))
        }
      })

      unsubReports = onSnapshot(query(collection(db, "reports"), where("uid", "==", user.uid), limit(50)), (snapshot) => {
        myReports.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        isDataLoading.value = false
      })

      unsubWithdrawals = onSnapshot(query(collection(db, "withdrawals"), where("uid", "==", user.uid)), (snapshot) => {
        myWithdrawals.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      })
    } else if (!isAdminRoute.value) {
      isLoggedIn.value = false; isDataLoading.value = false; username.value = 'Member'; userBalance.value = 0;
      myReports.value = []; myWithdrawals.value = []; userData.value = null; localStorage.clear()
    }
  })
})

const handleNav = (path: string) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);

  const targetPath = path === '/submit' ? '/submit-report' : path;
  const protectedRoutes = ['/submit', '/submit-report', '/withdraw', '/history'];

  if (!isLoggedIn.value && (protectedRoutes.includes(targetPath) || targetPath.startsWith('/job/'))) {
    alert('⚠️ ĐĂNG NHẬP ĐỂ TIẾP TỤC!'); router.push('/login'); return;
  }

  if (route.path === targetPath) {
    const mainScroll = document.querySelector('main');
    if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    router.push(targetPath);
  }

  if (windowWidth.value < 1024) isMenuOpen.value = false;
}

const handleReceiveJob = (jobId: string) => {
  if (!isLoggedIn.value) { router.push('/login'); return; }
  if (jobId === 'APP NGÂN HÀNG' || jobId === 'app-ngan-hang') {
    showBankModal.value = true
    return
  }
  router.push(`/job/${jobId}`)
}

const handleScrollToHistory = () => {
  if (route.path !== '/') {
    router.push('/')
    setTimeout(() => { document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' }) }, 500)
  } else {
    document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' })
  }
  if (windowWidth.value < 1024) isMenuOpen.value = false
}

const logout = async () => { 
  if(confirm('Xác nhận đăng xuất?')) { await signOut(auth); localStorage.clear(); router.push('/login') } 
}

const contactSupport = (t: string) => { 
  window.open(t === 'facebook' ? 'https://www.facebook.com/mmopro123/' : 'https://zalo.me/g/zbvsdm567', '_blank') 
}
</script>

<template>
  <div v-if="isAdminRoute" class="min-h-screen bg-[#090e17] text-slate-300 font-sans w-full">
    <router-view />
  </div>

  <div v-else class="min-h-screen bg-[#090e17] text-slate-300 font-sans flex overflow-x-hidden text-left relative">
    
    <svg width="0" height="0" class="absolute">
      <defs>
        <linearGradient id="finalGoldCoin" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#fde047" />
          <stop offset="50%" style="stop-color:#eab308" />
          <stop offset="100%" style="stop-color:#854d0e" />
        </linearGradient>
      </defs>
    </svg>

    <Transition name="fade">
      <div v-if="showWelcomePopup" class="fixed inset-0 z-[4000] flex items-center justify-center px-6">
        <div class="absolute inset-0 bg-black/90 backdrop-blur-md" @click="showWelcomePopup = false"></div>
        <div class="relative bg-[#111726] border border-blue-500/30 w-full max-w-md p-8 rounded-[40px] shadow-[0_0_50px_rgba(37,99,235,0.2)] text-center">
          <div class="relative z-10 space-y-6">
            <div class="w-20 h-20 bg-gradient-to-tr from-yellow-400 to-orange-500 rounded-3xl mx-auto flex items-center justify-center text-4xl animate-bounce">🎁</div>
            <h2 class="text-3xl text-white font-black italic uppercase tracking-tighter leading-none">Chào mừng <br/><span class="text-blue-500">Tân Thủ!</span></h2>
            <p class="text-slate-400 text-sm font-bold italic leading-relaxed uppercase">Hệ thống đã cộng 10,000 XU vào ví.</p>
            <button @click="showWelcomePopup = false" class="w-full py-5 bg-blue-600 text-white rounded-2xl font-black italic uppercase shadow-lg active:scale-95">Bắt đầu ngay</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="unreadRejectedReport" class="fixed inset-0 z-[99999] flex items-center justify-center px-6">
        <div class="absolute inset-0 bg-black/95 backdrop-blur-md"></div>
        <div class="relative bg-[#111726] border-2 border-red-500/50 w-full max-w-md p-8 rounded-[30px] shadow-[0_0_80px_rgba(239,68,68,0.4)] text-center">
          <div class="relative z-10 space-y-5">
            <div class="w-20 h-20 bg-gradient-to-tr from-red-500 to-rose-600 rounded-full mx-auto flex items-center justify-center text-4xl animate-bounce shadow-[0_0_30px_rgba(239,68,68,0.6)]">⚠️</div>
            <h2 class="text-2xl text-white font-black italic uppercase tracking-tighter leading-none">THÔNG BÁO TỪ <span class="text-red-500">ADMIN</span></h2>
            <div class="bg-[#0d121f] rounded-xl p-5 border border-slate-800 text-left">
              <p class="text-slate-500 text-[10px] uppercase tracking-widest font-black mb-1">CÔNG VIỆC BỊ TỪ CHỐI:</p>
              <p class="text-white text-sm font-black italic mb-4">{{ unreadRejectedReport.jobName || 'Nhiệm vụ MMO' }}</p>
              <p class="text-red-400 text-[10px] uppercase tracking-widest font-black mb-1">LÝ DO BỊ TỪ CHỐI:</p>
              <p class="text-white text-sm font-bold italic normal-case bg-red-500/10 border border-red-500/20 p-3 rounded-lg">{{ unreadRejectedReport.note || 'Thông tin cung cấp không hợp lệ. Vui lòng làm lại!' }}</p>
            </div>
            <button @click="dismissRejection(unreadRejectedReport.id)" class="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black italic uppercase shadow-lg active:scale-95 transition-all">TÔI ĐÃ HIỂU VÀ SẼ LÀM LẠI</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="unreadMessageReport && !unreadRejectedReport" class="fixed inset-0 z-[99998] flex items-center justify-center px-6">
        <div class="absolute inset-0 bg-black/95 backdrop-blur-md"></div>
        <div class="relative bg-[#111726] border-2 border-blue-500/50 w-full max-w-md p-8 rounded-[30px] shadow-[0_0_80px_rgba(59,130,246,0.4)] text-center">
          <div class="relative z-10 space-y-5">
            <div class="w-20 h-20 bg-gradient-to-tr from-blue-500 to-cyan-400 rounded-full mx-auto flex items-center justify-center text-4xl animate-bounce shadow-[0_0_30px_rgba(59,130,246,0.6)]">📩</div>
            <h2 class="text-2xl text-white font-black italic uppercase tracking-tighter leading-none">TIN NHẮN TỪ <span class="text-blue-500">ADMIN</span></h2>
            <div class="bg-[#0d121f] rounded-xl p-5 border border-slate-800 text-left">
              <p class="text-slate-500 text-[10px] uppercase tracking-widest font-black mb-1">ĐỐI VỚI CÔNG VIỆC ĐANG CHỜ:</p>
              <p class="text-white text-sm font-black italic mb-4">{{ unreadMessageReport.jobName || 'Nhiệm vụ MMO' }}</p>
              <p class="text-blue-400 text-[10px] uppercase tracking-widest font-black mb-1">LỜI NHẮN:</p>
              <p class="text-white text-sm font-bold italic normal-case bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg">{{ unreadMessageReport.note }}</p>
            </div>
            <button @click="dismissMessage(unreadMessageReport.id)" class="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black italic uppercase shadow-lg active:scale-95 transition-all">ĐÃ ĐỌC LỜI NHẮN VÀ TẮT</button>
          </div>
        </div>
      </div>
    </Transition>

    <div :class="['fixed lg:sticky top-0 left-0 h-screen z-[1500] transition-all duration-500 bg-[#111726] border-r border-slate-800 overflow-hidden flex-shrink-0', isMenuOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full']">
      <Sidebar
        v-if="isMenuOpen"
        :isLoggedIn="isLoggedIn"
        :isMenuOpen="isMenuOpen"
        :username="username"
        :userBalance="userBalance"
        @toggleMenu="isMenuOpen = !isMenuOpen"
        @logout="logout"
        @routerPush="handleNav"
        @requireAuth="handleNav"
        @scrollToHistory="handleScrollToHistory"
        @contactSupport="contactSupport"
        @receiveJob="handleReceiveJob"
      />
    </div>

    <div class="flex-1 flex flex-col transition-all duration-500 min-w-0 bg-[#090e17] w-full relative">
      
      <header class="h-16 md:h-20 flex items-center justify-between px-4 md:px-10 sticky top-0 bg-[#090e17]/90 backdrop-blur-xl z-[1100] border-b border-slate-800/50 shadow-sm">
        <div class="flex items-center gap-3">
          <button @click.stop="isMenuOpen = !isMenuOpen" class="p-2 md:p-3 bg-[#111726] border border-slate-800 rounded-xl md:rounded-2xl transition-all active:scale-95 hidden lg:block">
            <svg v-if="!isMenuOpen" class="w-5 h-5 md:w-6 md:h-6 text-blue-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            <svg v-else class="w-5 h-5 md:w-6 md:h-6 text-slate-400" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <span class="text-white font-black italic tracking-tighter text-lg lg:hidden">MMO <span class="text-blue-500">PRO</span></span>
        </div>
        
        <div class="flex items-center gap-2 md:gap-4 bg-[#111726] border border-slate-800 pl-3 md:pl-5 pr-1 py-1 md:py-1.5 rounded-full shadow-inner ml-auto">
          <div class="flex items-center gap-1 md:gap-2">
            <span class="text-slate-500 text-[8px] md:text-[9px] uppercase hidden sm:inline-block italic font-black">Ví:</span>
            <span class="text-white text-sm md:text-xl font-black italic tracking-tighter min-w-[60px] md:min-w-[90px] text-right">
              {{ isLoggedIn ? (isBalanceVisible ? userBalance.toLocaleString() : '******') : '0' }} 
            </span>
            <div class="flex flex-col items-center translate-y-[-1px]">
               <svg class="w-4 h-4 md:w-5 md:h-5 drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="url(#finalGoldCoin)" />
                  <circle cx="12" cy="12" r="7" stroke="#ffffff" stroke-width="1" stroke-dasharray="2 1" opacity="0.3" />
                  <path d="M12 7v10M9 10h6M9 14h6" stroke="#854d0e" stroke-width="2" stroke-linecap="round" />
               </svg>
               <span class="text-[7px] text-yellow-500 font-black not-italic leading-none">XU</span>
            </div>
            <button @click="toggleBalance" class="text-slate-500 hover:text-blue-400 px-1 active:scale-90">
              <svg v-if="isBalanceVisible" class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              <svg v-else class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L14.5 5.252M12 5c4.478 0 8.268 2.943 9.542 7a10.025 10.05 0 01-4.132 5.411m0 0L21 21M3 3l18 18" /></svg>
            </button>
          </div>
          <button @click="handleNav('/withdraw')" class="w-6 h-6 md:w-8 md:h-8 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)] active:scale-90 transition-transform"><svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 4.5v15m7.5-7.5h-15" /></svg></button>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto p-4 md:p-10 pb-32 md:pb-10 space-y-10 custom-scrollbar relative text-left">
        <template v-if="route.path === '/'">
           <JobSection 
             :username="username" 
             :isLoggedIn="isLoggedIn" 
             :userBalance="userBalance" 
             @receiveJob="handleReceiveJob" 
             @routerPush="handleNav" 
             @contactSupport="contactSupport" 
           />
           <HistorySection id="history-section" :isLoggedIn="isLoggedIn" :isDataLoading="isDataLoading" :myReports="combinedHistory" />
           <InfoSection @contactSupport="contactSupport" />
           
           <footer class="mt-20 border-t border-slate-800/50 bg-[#0d121f] pt-16 pb-40 md:pb-8 relative z-[100] italic uppercase font-black rounded-t-3xl overflow-hidden">
             <div class="max-w-7xl mx-auto px-6 text-left">
               <div class="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-16">
                 <div class="space-y-4">
                   <div class="flex items-center gap-4">
                     <img src="/images/mmo-logo.png" alt="MMO PRO" class="w-16 h-16 object-contain drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                     <div class="flex flex-col">
                       <h2 class="text-3xl text-white tracking-tighter leading-none uppercase">MMO PRO</h2>
                       <span class="text-blue-500 font-black text-xs tracking-[2px]">SYSTEM PRO</span>
                     </div>
                   </div>
                   <p class="text-slate-500 text-[11px] normal-case font-bold max-w-xs italic leading-relaxed">
                     Hệ thống kiếm tiền online uy tín số 1 Việt Nam. <br>
                     Thanh toán minh bạch, bảo mật tuyệt đối 24/7.
                   </p>
                 </div>
                 
                 <div class="space-y-6">
                   <h3 class="text-white text-sm tracking-[2px] border-l-4 border-blue-600 pl-4 uppercase font-black italic">Đối tác thanh toán</h3>
                   <div class="grid grid-cols-4 gap-y-6 gap-x-4 items-center">
                     <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/02/Logo-MB-Bank-Transparent-B.png" class="bank-logo" alt="MB Bank">
                     <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/10/Logo-MoMo-Transparent.png" class="bank-logo" alt="MoMo">
                     <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/10/Logo-VNPAY-QR.png" class="bank-logo" alt="VNPay">
                     <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/01/Logo-Techcombank.png" class="bank-logo" alt="Techcombank">
                     <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/02/Logo-Vietcombank.png" class="bank-logo" alt="Vietcombank">
                     <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/01/Logo-TPBank.png" class="bank-logo" alt="TP Bank">
                     <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/01/Logo-ACB.png" class="bank-logo" alt="ACB">
                     <img src="https://cdn.haitrieu.com/wp-content/uploads/2022/01/Logo-VPBank.png" class="bank-logo" alt="VP Bank">
                   </div>
                 </div>
                 
                 <div class="space-y-6">
                   <h3 class="text-white text-sm tracking-[2px] border-l-4 border-blue-600 pl-4 uppercase font-black italic">Hỗ trợ cộng đồng</h3>
                   <div class="flex flex-col gap-3 font-black italic uppercase">
                     <button @click="contactSupport('facebook')" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[11px] shadow-lg font-black italic uppercase transition-all active:scale-95">Fanpage Messenger</button>
                     <button @click="contactSupport('zalo')" class="w-full py-3 bg-[#1a2333] border border-white/5 text-white rounded-xl text-[11px] font-black italic uppercase transition-all active:scale-95">Nhóm Zalo Cộng Đồng</button>
                   </div>
                 </div>
               </div>
               <div class="pt-8 border-t border-slate-800/30 text-[9px] font-black text-slate-600 tracking-[1px] uppercase italic text-center md:text-left">
                 <p>COPYRIGHT © 2026 MMO PRO SYSTEM. ALL RIGHTS RESERVED.</p>
               </div>
             </div>
           </footer>
        </template>
        <router-view v-else />
      </main>
    </div>

    <div v-if="showBankModal" class="fixed inset-0 z-[5000] flex items-end lg:items-center justify-center">
      <div @click="showBankModal = false" class="absolute inset-0 bg-black/90 backdrop-blur-md transition-opacity"></div>
      
      <div class="relative w-full lg:max-w-md bg-[#111726] border-t lg:border border-slate-800 rounded-t-[40px] lg:rounded-[35px] p-8 md:p-10 shadow-[0_-20px_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom duration-300 lg:zoom-in lg:slide-in-from-bottom-0">
        <div class="w-12 h-1.5 bg-slate-800 rounded-full mx-auto mb-6 lg:hidden"></div>
        <h3 class="text-xl text-white border-l-4 border-blue-600 pl-4 mb-8 font-black uppercase italic tracking-tighter">Chọn Ngân Hàng</h3>
        
        <div class="space-y-4 font-bold uppercase italic font-black pb-10 lg:pb-0">
          <div v-for="bank in [{ id: 'msb-bank', name: 'MSB - CÁ NHÂN' }, { id: 'vpbank', name: 'VPBank NEO' }, { id: 'tpbank', name: 'TPBank MOBILE' }]" 
               :key="bank.id" 
               @click="() => { showBankModal = false; handleReceiveJob(bank.id) }"
               class="flex items-center justify-between p-6 bg-[#0d121f] border border-slate-800 rounded-2xl cursor-pointer hover:border-blue-500 transition-all active:scale-95 shadow-lg">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-blue-500 text-xs border border-slate-800">🏦</div>
              <span class="text-white text-sm tracking-tighter">{{ bank.name }}</span>
            </div>
            <span class="text-blue-500 font-black font-sans italic">➜</span>
          </div>
          <button @click="showBankModal = false" class="w-full py-4 mt-4 bg-slate-900 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest lg:hidden">ĐÓNG LẠI</button>
        </div>
      </div>
    </div>

   <nav class="premium-bottom-nav fixed bottom-0 left-0 w-full lg:hidden z-[4000] flex justify-between items-end px-1 pb-6 pt-3 shadow-[0_-15px_40px_rgba(0,0,0,0.9)]">
       
       <button @click="handleNav('/submit-report')" class="flex flex-col items-center gap-1.5 w-[20%] group relative">
         <div class="absolute -top-3 w-8 h-1.5 bg-emerald-500 rounded-b-full shadow-[0_0_12px_rgba(16,185,129,0.9)]" v-if="route.path.includes('submit')"></div>
         <svg class="w-6 h-6 transition-all duration-300 group-active:scale-90" :class="route.path.includes('submit') ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'text-slate-400 group-hover:text-emerald-400'" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
         <span class="text-[8px] font-black tracking-widest transition-colors duration-300 uppercase" :class="route.path.includes('submit') ? 'text-emerald-400' : 'text-slate-400 group-hover:text-emerald-400'">NỘP BÀI</span>
       </button>

       <button @click="handleScrollToHistory()" class="flex flex-col items-center gap-1.5 w-[20%] group relative">
         <svg class="w-6 h-6 text-slate-400 group-hover:text-blue-400 transition-all duration-300 group-active:scale-90" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
         <span class="text-[8px] font-black tracking-widest text-slate-400 group-hover:text-blue-400 transition-colors uppercase">LỊCH SỬ</span>
       </button>

      <button @click="handleNav('/withdraw')" class="relative -top-7 flex flex-col items-center justify-center w-[20%] group z-50">
         <div class="withdraw-btn-border relative w-16 h-16 bg-gradient-to-tr from-blue-600 via-blue-500 to-cyan-400 rounded-full flex items-center justify-center text-white border-[6px] shadow-[0_10px_25px_rgba(37,99,235,0.6)] group-active:scale-95 transition-transform duration-300">
           <svg class="w-7 h-7 drop-shadow-md" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" /></svg>
         </div>
         <span class="text-[10px] font-black text-blue-400 mt-2 tracking-widest uppercase">Rút Tiền</span>
       </button>

       <button @click="isMenuOpen = true" class="flex flex-col items-center gap-1.5 w-[20%] group relative">
         <svg class="w-6 h-6 text-slate-400 group-hover:text-blue-400 transition-all duration-300 group-active:scale-90" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
         <span class="text-[8px] font-black tracking-widest text-slate-400 group-hover:text-blue-400 transition-colors uppercase">Hồ Sơ</span>
       </button>

       <button @click="contactSupport('facebook')" class="flex flex-col items-center gap-1.5 w-[20%] group relative">
         <svg class="w-6 h-6 text-slate-400 group-hover:text-blue-400 transition-all duration-300 group-active:scale-90" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
         <span class="text-[8px] font-black tracking-widest text-slate-400 group-hover:text-blue-400 transition-colors uppercase">HỖ TRỢ</span>
       </button>

    </nav>

    <Transition name="slide-up">
      <div v-if="randomNotice" 
           :style="{ left: isMenuOpen && windowWidth >= 1024 ? '320px' : '20px' }"
           class="fixed bottom-[100px] lg:bottom-10 z-[5000] flex items-center gap-4 bg-[#111726]/95 backdrop-blur-xl border border-blue-500/40 p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[280px] transition-all duration-300 scale-90 md:scale-100">
        <div :class="['w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg', randomNotice.type === 'withdraw' ? 'bg-gradient-to-tr from-emerald-500 to-teal-500' : 'bg-gradient-to-tr from-orange-500 to-red-500']">
           <svg v-if="randomNotice.type === 'withdraw'" class="w-7 h-7 drop-shadow-md" viewBox="0 0 24 24" fill="none">
             <circle cx="12" cy="12" r="10" fill="url(#finalGoldCoin)" />
             <path d="M12 7v10M9 10h6M9 14h6" stroke="#854d0e" stroke-width="2" stroke-linecap="round" />
           </svg>
           <span v-else>🔥</span>
        </div>
        <div class="flex flex-col text-left leading-tight">
          <span class="text-white text-[11px] font-black italic tracking-tighter uppercase">{{ randomNotice.name }}</span>
         <span :class="['text-[13px] font-black italic', randomNotice.type === 'withdraw' ? 'text-emerald-400' : 'text-orange-400']">
  {{ randomNotice.title }} {{ randomNotice.amount }}{{ randomNotice.type === 'job' ? ' XU' : '' }}
</span>
          <span class="text-slate-500 text-[8px] font-bold uppercase mt-0.5 tracking-widest italic opacity-80">{{ randomNotice.sub }}</span>
        </div>
      </div>
    </Transition>

    <div class="fixed bottom-4 right-2 md:bottom-8 md:right-8 z-[999] hidden lg:flex flex-col gap-4 items-end scale-75 md:scale-100 origin-bottom-right">
      <div class="flex items-center group cursor-pointer" @click="contactSupport('facebook')">
        <div class="mr-4 text-right overflow-hidden italic uppercase hidden md:block whitespace-nowrap">
          <p class="text-[9px] text-indigo-400 font-black tracking-[2px] mb-1 opacity-80 animate-jump-delay">GIẢI ĐÁP THẮC MẮC</p>
          <p class="text-white text-sm font-black italic uppercase tracking-tighter">LIÊN HỆ FANPAGE</p>
        </div>
        <div class="w-16 h-16 bg-[#1877F2] rounded-full shadow-lg flex items-center justify-center text-white flex-shrink-0">
          <svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </div>
      </div>
      <div class="flex items-center group cursor-pointer" @click="contactSupport('zalo')">
        <div class="mr-4 text-right overflow-hidden italic uppercase hidden md:block whitespace-nowrap">
          <p class="text-[9px] text-blue-500 font-black tracking-[2px] mb-1 opacity-80 animate-jump-delay">CỘNG ĐỒNG MMO</p>
          <p class="text-white text-sm font-black italic uppercase tracking-tighter">THAM GIA NHÓM</p>
        </div>
        <div class="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center flex-shrink-0">
          <img src="https://upload.wikimedia.org/wikipedia/commons/9/91/Icon_of_Zalo.svg" class="w-10 h-10 object-contain" />
        </div>
      </div>
    </div>

    <div v-if="isMenuOpen && windowWidth < 1024" @click="isMenuOpen = false" class="fixed inset-0 bg-black/80 z-[1200] lg:hidden backdrop-blur-sm transition-opacity"></div>
    <button v-if="isMenuOpen && windowWidth < 1024" @click.stop="isMenuOpen = false" class="fixed top-4 left-4 z-[5000] p-3 bg-[#111726] border border-slate-800 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all active:scale-95 flex items-center justify-center">
      <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
    
    <AppBrowserBlocker />
    <RewardPopup />

  </div>

</template>

<style>
/* =======================================================
   CSS ÉP MÀU CHO THANH BOTTOM NAV (KHÔNG THỂ BỊ LỖI CACHE)
   ======================================================= */
.premium-bottom-nav {
  background-color: #1e2a40 !important; /* Màu xám xanh đậm siêu nổi */
  border-top: 2px solid #334563 !important; /* Kẻ viền trên màu xám bạc rõ nét */
}
.withdraw-btn-border {
  border-color: #1e2a40 !important; /* Ép màu viền nút Rút Tiền khớp với thanh Nav */
}


/* CSS CŨ CỦA WEB */
.custom-scrollbar::-webkit-scrollbar { width: 5px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.slide-up-enter-from { opacity: 0; transform: translateY(80px) scale(0.6); }
.slide-up-leave-to { opacity: 0; transform: translateX(-80px) scale(0.9); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@keyframes jump-cycle { 
  0%, 40%, 100% { transform: translateY(0); opacity: 1; } 
  5%, 15%, 25% { transform: translateY(-10px); } 
  10%, 20%, 30% { transform: translateY(0); } 
  45% { opacity: 0; transform: scale(0.5); } 
  55% { opacity: 1; transform: scale(1.1); } 
}

.animate-jump-cycle { animation: jump-cycle 4s infinite cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.animate-jump-delay { animation: jump-cycle 4s infinite cubic-bezier(0.175, 0.885, 0.32, 1.275); animation-delay: 0.1s; }

.bank-logo { 
  height: 25px; 
  width: auto; 
  object-fit: contain; 
  filter: brightness(0) invert(1) opacity(0.6); 
  transition: all 0.3s ease; 
  cursor: pointer; 
}
.bank-logo:hover {
  filter: brightness(0) invert(1) opacity(1);
  transform: scale(1.1);
}

</style>