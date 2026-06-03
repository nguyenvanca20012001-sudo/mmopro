<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()

// FAQ accordion
const openFaq = ref<number | null>(null)
const toggleFaq = (i: number) => { openFaq.value = openFaq.value === i ? null : i }
const faqs = [
  { q: 'Làm thế nào để rút tiền?', a: 'Vào mục "Rút Tiền" → Nhập số tài khoản ngân hàng, số tiền muốn rút → Gửi yêu cầu. Admin xét duyệt và chuyển khoản trong vòng 24h làm việc.' },
  { q: 'Mỗi công việc làm được mấy lần?', a: 'Công việc CƠ BẢN (TikTok, YouTube, Google Map...) chỉ làm 1 lần duy nhất. Công việc VIP (App ngân hàng, chứng khoán) cho phép nhiều thành viên trong gia đình cùng đăng ký.' },
  { q: 'Rút tiền tối thiểu bao nhiêu?', a: 'Tối thiểu 200.000 XU. Không có giới hạn tối đa — bạn rút bao nhiêu tùy ý!' },
  { q: 'Bao lâu thì admin duyệt đơn?', a: 'Thông thường từ 1-24 giờ trong ngày làm việc (thứ 2 - thứ 7). Sau khi duyệt, hệ thống tự động thông báo và cộng XU vào ví của bạn ngay lập tức.' },
  { q: 'Tôi có thể làm nhiều việc cùng lúc không?', a: 'Có! Bạn có thể làm đồng thời nhiều công việc. Tuy nhiên, mỗi công việc CƠ BẢN chỉ được gửi bằng chứng 1 lần. Hãy đảm bảo làm đúng hướng dẫn để được duyệt.' },
]

// About us stats
const aboutStats = [
  { label: 'Năm thành lập',   value: '2026',     icon: '🏢' },
  { label: 'Thành viên',      value: '2.000+',   icon: '👥' },
  { label: 'Tổng chi trả',    value: '20TR+ XU', icon: '💰' },
  { label: 'Đối tác NH',      value: '8+',       icon: '🏦' },
]

// USPs
const usps = [
  { icon: '✅', title: 'MINH BẠCH 100%',  desc: 'Xem lịch sử rút tiền và thu nhập rõ ràng, không phí ẩn.', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { icon: '⚡', title: 'DUYỆT NHANH 24H', desc: 'Admin duyệt đơn trong ngày, không phải chờ đợi lâu.', color: 'text-yellow-400',  bg: 'bg-yellow-500/10  border-yellow-500/20'  },
  { icon: '🔒', title: 'BẢO MẬT CAO',    desc: 'Dữ liệu tài khoản được mã hóa, không lộ thông tin cá nhân.', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  { icon: '💰', title: 'RÚT TIỀN DỄ',    desc: 'Hỗ trợ mọi ngân hàng, MoMo, VNPay. Rút tối thiểu 200.000 XU.', color: 'text-rose-400',  bg: 'bg-rose-500/10  border-rose-500/20'  },
]

// Detailed workflow steps
const workflowSteps = [
  { num: '01', icon: '👤', title: 'ĐĂNG KÝ TÀI KHOẢN',      desc: 'Điền email, mật khẩu, tên hiển thị. Nhận ngay 10.000 XU chào mừng vào ví!' },
  { num: '02', icon: '🔍', title: 'CHỌN CÔNG VIỆC PHÙ HỢP', desc: 'Duyệt danh sách: CƠ BẢN (10k-30k XU) hoặc VIP (85k-100k XU). Chọn việc bạn muốn làm.' },
  { num: '03', icon: '📋', title: 'LÀM THEO HƯỚNG DẪN',     desc: 'Đọc hướng dẫn chi tiết từng bước. Thực hiện đúng yêu cầu để đảm bảo được duyệt.' },
  { num: '04', icon: '📸', title: 'GỬI BẰNG CHỨNG',         desc: 'Chụp màn hình kết quả, upload lên hệ thống, gửi đơn và chờ admin xem xét.' },
  { num: '05', icon: '💸', title: 'NHẬN XU & RÚT TIỀN',     desc: 'Admin duyệt → XU tự động vào ví → Rút về ngân hàng, MoMo bất kỳ lúc nào.' },
]

const featuredJobs = [
  { id: 'tiktok',    title: 'Cày View TikTok',    reward: '30.000', badge: 'HOT 🔥',  bg: 'from-[#3B1731] to-[#1F0A1A]', border: 'border-pink-500/70',    icon: 'TT',   iconBg: 'bg-pink-500/20 text-pink-400',    btn: 'from-pink-600 to-rose-500',    badgeBg: 'bg-pink-600',    count: '2.841' },
  { id: 'youtube',   title: 'Cày View YouTube',   reward: '30.000', badge: 'HOT 🔥',  bg: 'from-[#4A1612] to-[#260505]', border: 'border-red-500/70',     icon: 'YT',   iconBg: 'bg-red-500/20 text-red-400',      btn: 'from-red-600 to-rose-500',     badgeBg: 'bg-red-600',     count: '1.963' },
  { id: 'threads',   title: 'Đăng Bài Threads',   reward: '30.000', badge: 'TREND 📝', bg: 'from-[#2D3748] to-[#0F172A]', border: 'border-slate-300/70',  icon: '@',    iconBg: 'bg-slate-300/20 text-slate-300',  btn: 'from-slate-400 to-slate-200',  badgeBg: 'bg-slate-500',   count: '1.127' },
  { id: 'vinfast',   title: 'Seeding VinFast',    reward: '30.000', badge: 'VIP 🌟',  bg: 'from-[#083344] to-[#082F49]', border: 'border-cyan-500/70',    icon: 'VF',   iconBg: 'bg-cyan-500/20 text-cyan-400',    btn: 'from-cyan-600 to-blue-500',    badgeBg: 'bg-cyan-600',    count: '873'   },
  { id: 'googlemap', title: 'Đánh Giá Google Map', reward: '25.000', badge: 'CƠ BẢN', bg: 'from-[#3B1731] to-[#240A1A]', border: 'border-fuchsia-500/70', icon: '📍',   iconBg: 'bg-fuchsia-500/20 text-fuchsia-400', btn: 'from-fuchsia-600 to-pink-500', badgeBg: 'bg-fuchsia-600', count: '654'   },
]

const testimonials = [
  { name: 'Nguyễn Văn An', avatar: 'A', color: 'bg-blue-600',    text: '"Rút 500k chỉ sau 2 ngày làm việc. Nền tảng uy tín, admin duyệt nhanh!"',  stars: 5 },
  { name: 'Trần Thị Bình',  avatar: 'B', color: 'bg-emerald-600', text: '"Làm lúc rảnh mỗi tuần thêm 300k. Công việc dễ, chỉ cần chụp màn hình gửi."', stars: 5 },
  { name: 'Lê Minh Cường',  avatar: 'C', color: 'bg-purple-600',  text: '"Đăng ký app ngân hàng nhận 100k XU ngay. Rút tiền về tài khoản cực nhanh."', stars: 5 },
]

const banks = ['MB BANK', 'MOMO', 'VNPAY', 'TECHCOMBANK', 'VIETCOMBANK', 'TPBANK', 'ACB', 'VPBANK']

const steps = [
  { num: '01', icon: '👤', title: 'ĐĂNG KÝ MIỄN PHÍ',   desc: 'Tạo tài khoản trong 1 phút, không cần xác minh phức tạp.' },
  { num: '02', icon: '⚡', title: 'NHẬN CÔNG VIỆC',       desc: 'Chọn nhiệm vụ phù hợp, làm theo hướng dẫn, chụp màn hình.' },
  { num: '03', icon: '💰', title: 'RÚT TIỀN 24/7',        desc: 'Chuyển XU thành tiền mặt, rút về mọi ngân hàng bất kỳ.' },
]
</script>

<template>
  <div class="min-h-screen bg-[#090e17] text-white font-sans overflow-x-hidden">

    <!-- ===== STICKY HEADER ===== -->
    <header class="fixed top-0 left-0 right-0 z-[999] bg-[#090e17]/90 backdrop-blur-lg border-b border-slate-800/60 px-5 py-3.5 flex justify-between items-center">
      <span class="font-black italic text-white text-xl tracking-tighter">MMO <span class="text-blue-400">PRO</span></span>
      <div class="flex gap-2">
        <button @click="router.push('/login')"
                class="px-4 py-2 text-[11px] font-black italic uppercase text-slate-300 border border-slate-700/80 rounded-xl hover:border-slate-500 transition-all active:scale-95">
          ĐĂNG NHẬP
        </button>
        <button @click="router.push('/register')"
                class="px-4 py-2 text-[11px] font-black italic uppercase bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-900/40">
          ĐĂNG KÝ
        </button>
      </div>
    </header>

    <!-- ===== HERO SECTION ===== -->
    <section class="relative pt-28 pb-16 px-5 lg:px-16 xl:px-28 overflow-hidden min-h-screen flex flex-col justify-center">
      <!-- Background blobs -->
      <div class="absolute -top-20 -left-20 w-[500px] h-[500px] bg-blue-700/15 rounded-full blur-[120px] pointer-events-none"></div>
      <div class="absolute -bottom-20 right-0 w-[400px] h-[400px] bg-indigo-700/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-900/10 rounded-full blur-[80px] pointer-events-none"></div>
      <!-- Dot grid -->
      <div class="absolute inset-0 landing-dot-grid pointer-events-none opacity-40"></div>

      <div class="relative z-10 max-w-4xl mx-auto text-center lg:text-left lg:max-w-none lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">
        <!-- Text side -->
        <div class="space-y-7">
          <!-- Badge online -->
          <div class="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            ĐANG HOẠT ĐỘNG — MỞ ĐĂNG KÝ
          </div>

          <h1 class="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black italic uppercase leading-[0.9] tracking-tighter text-white">
            KIẾM TIỀN THẬT<br/>
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500">
              RÚT VỀ NGAY
            </span>
          </h1>

          <p class="text-slate-400 text-base lg:text-lg font-medium leading-relaxed max-w-lg mx-auto lg:mx-0 not-italic normal-case">
            Hoàn thành công việc đơn giản, nhận <span class="text-white font-bold">XU</span>, rút tiền <span class="text-emerald-400 font-bold">24/7</span> về mọi ngân hàng. Không cần kinh nghiệm, không phí tham gia.
          </p>

          <div class="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <button @click="router.push('/register')"
                    class="relative overflow-hidden px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black italic uppercase text-sm rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all active:scale-95">
              <div class="absolute inset-0 bg-white/10 animate-[shimmer_3s_infinite]"></div>
              <span class="relative z-10">THAM GIA MIỄN PHÍ ▶</span>
            </button>
            <button @click="router.push('/login')"
                    class="px-8 py-4 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-black italic uppercase text-sm rounded-2xl transition-all active:scale-95">
              ĐÃ CÓ TÀI KHOẢN →
            </button>
          </div>

          <!-- App Mockup — MOBILE ONLY (hiện dưới 2 nút, ẩn trên desktop) -->
          <div class="lg:hidden relative w-full max-w-sm mx-auto mt-2">
            <div class="bg-[#111726] border border-slate-800/80 rounded-[28px] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <div class="flex items-center gap-2 mb-4">
                <span class="font-black italic text-white">MMO <span class="text-blue-400">PRO</span></span>
                <span class="ml-auto flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest">
                  <span class="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></span> TRỰC TUYẾN
                </span>
              </div>
              <div class="bg-gradient-to-br from-blue-600/20 to-indigo-600/10 border border-blue-500/20 rounded-xl p-4 mb-3">
                <p class="text-slate-400 text-[9px] uppercase tracking-widest font-bold mb-1">SỐ DƯ KHẢ DỤNG</p>
                <p class="text-2xl font-black italic text-white">1.250.000 <span class="text-yellow-400 text-sm">XU</span></p>
                <button class="mt-2.5 w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black italic uppercase rounded-xl">
                  RÚT TIỀN NGAY →
                </button>
              </div>
              <div class="space-y-2">
                <div class="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3 py-2.5">
                  <span class="text-pink-400 font-black text-xs w-8 text-center">TT</span>
                  <span class="flex-1 text-white text-[11px] font-bold">Cày View TikTok</span>
                  <span class="text-emerald-400 text-[11px] font-black">+30k XU</span>
                </div>
                <div class="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3 py-2.5">
                  <span class="text-red-400 font-black text-xs w-8 text-center">YT</span>
                  <span class="flex-1 text-white text-[11px] font-bold">Cày View YouTube</span>
                  <span class="text-emerald-400 text-[11px] font-black">+30k XU</span>
                </div>
                <div class="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3 py-2.5">
                  <span class="text-fuchsia-400 font-black text-xs w-8 text-center">📍</span>
                  <span class="flex-1 text-white text-[11px] font-bold">Đánh Giá Google Map</span>
                  <span class="text-emerald-400 text-[11px] font-black">+25k XU</span>
                </div>
              </div>
            </div>
            <div class="absolute -top-3 -right-3 bg-emerald-500 text-white text-[9px] font-black uppercase px-2.5 py-1.5 rounded-xl shadow-lg rotate-6">✅ DUYỆT NGAY</div>
            <div class="absolute -bottom-3 -left-3 bg-amber-500 text-amber-900 text-[9px] font-black uppercase px-2.5 py-1.5 rounded-xl shadow-lg -rotate-3">💰 +30.000 XU</div>
          </div>

          <!-- Stats row -->
          <div class="grid grid-cols-3 gap-3 pt-2 max-w-lg mx-auto lg:mx-0">
            <div class="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 text-center">
              <p class="text-white text-xl sm:text-2xl font-black italic tracking-tighter">2.000<span class="text-blue-400">+</span></p>
              <p class="text-slate-500 text-[9px] font-bold uppercase tracking-widest mt-1">THÀNH VIÊN</p>
            </div>
            <div class="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 text-center">
              <p class="text-white text-xl sm:text-2xl font-black italic tracking-tighter">20TR<span class="text-emerald-400">+ XU</span></p>
              <p class="text-slate-500 text-[9px] font-bold uppercase tracking-widest mt-1">ĐÃ CHI TRẢ</p>
            </div>
            <div class="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 text-center">
              <p class="text-white text-xl sm:text-2xl font-black italic tracking-tighter">5.000<span class="text-amber-400">+</span></p>
              <p class="text-slate-500 text-[9px] font-bold uppercase tracking-widest mt-1">ĐƠN DUYỆT</p>
            </div>
          </div>
        </div>

        <!-- Visual side (desktop only) -->
        <div class="hidden lg:flex items-center justify-center">
          <div class="relative w-full max-w-md">
            <!-- Fake app mockup card -->
            <div class="bg-[#111726] border border-slate-800/80 rounded-[32px] p-8 shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
              <div class="flex items-center gap-2 mb-6">
                <span class="font-black italic text-white text-lg">MMO <span class="text-blue-400">PRO</span></span>
                <span class="ml-auto flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest">
                  <span class="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></span> TRỰC TUYẾN
                </span>
              </div>
              <!-- Balance -->
              <div class="bg-gradient-to-br from-blue-600/20 to-indigo-600/10 border border-blue-500/20 rounded-2xl p-5 mb-4">
                <p class="text-slate-400 text-[9px] uppercase tracking-widest font-bold mb-1">SỐ DƯ KHẢ DỤNG</p>
                <p class="text-3xl font-black italic text-white">1.250.000 <span class="text-yellow-400 text-lg">XU</span></p>
                <button class="mt-3 w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black italic uppercase rounded-xl">
                  RÚT TIỀN NGAY →
                </button>
              </div>
              <!-- Mini jobs -->
              <div class="space-y-2">
                <div class="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3 py-2.5">
                  <span class="text-pink-400 font-black text-xs w-8 text-center">TT</span>
                  <span class="flex-1 text-white text-[11px] font-bold">Cày View TikTok</span>
                  <span class="text-emerald-400 text-[11px] font-black">+30k XU</span>
                </div>
                <div class="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3 py-2.5">
                  <span class="text-red-400 font-black text-xs w-8 text-center">YT</span>
                  <span class="flex-1 text-white text-[11px] font-bold">Cày View YouTube</span>
                  <span class="text-emerald-400 text-[11px] font-black">+30k XU</span>
                </div>
                <div class="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3 py-2.5">
                  <span class="text-fuchsia-400 font-black text-xs w-8 text-center">📍</span>
                  <span class="flex-1 text-white text-[11px] font-bold">Đánh Giá Google Map</span>
                  <span class="text-emerald-400 text-[11px] font-black">+25k XU</span>
                </div>
              </div>
            </div>
            <!-- Floating badge -->
            <div class="absolute -top-4 -right-4 bg-emerald-500 text-white text-[10px] font-black uppercase px-3 py-2 rounded-xl shadow-lg shadow-emerald-900/50 rotate-6">
              ✅ DUYỆT NGAY
            </div>
            <div class="absolute -bottom-4 -left-4 bg-amber-500 text-amber-900 text-[10px] font-black uppercase px-3 py-2 rounded-xl shadow-lg shadow-amber-900/50 -rotate-3">
              💰 +30.000 XU
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== CÁCH HOẠT ĐỘNG ===== -->
    <section class="py-16 px-5 lg:px-16 xl:px-28 bg-[#0d121f]">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-12">
          <span class="text-[10px] font-black uppercase tracking-[3px] text-blue-400 border border-blue-500/30 px-4 py-1.5 rounded-full">HƯỚNG DẪN</span>
          <h2 class="text-3xl lg:text-4xl font-black italic uppercase tracking-tighter text-white mt-4">
            CHỈ 3 BƯỚC ĐƠN GIẢN
          </h2>
          <p class="text-slate-500 text-sm font-medium mt-2 not-italic normal-case">Bắt đầu kiếm tiền ngay hôm nay</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          <!-- Connector lines (desktop) -->
          <div class="hidden md:block absolute top-12 left-[calc(33.33%+1rem)] right-[calc(33.33%+1rem)] h-px bg-gradient-to-r from-blue-500/50 via-indigo-500/50 to-blue-500/50"></div>

          <div v-for="(step, i) in steps" :key="i"
               class="relative bg-gradient-to-b from-[#111726] to-[#0d121f] border border-slate-800/60 rounded-[24px] p-7 text-center group hover:-translate-y-1 transition-all duration-300">
            <!-- Step number background -->
            <div class="absolute top-5 right-5 text-[60px] font-black text-white/3 leading-none pointer-events-none select-none">{{ step.num }}</div>
            <!-- Icon -->
            <div class="w-16 h-16 rounded-2xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center text-3xl mx-auto mb-5 group-hover:scale-110 transition-transform">{{ step.icon }}</div>
            <!-- Content -->
            <p class="text-[10px] font-black uppercase tracking-[2px] text-blue-400 mb-2">BƯỚC {{ step.num }}</p>
            <h3 class="text-white font-black italic uppercase text-base tracking-tight mb-3">{{ step.title }}</h3>
            <p class="text-slate-400 text-sm font-medium leading-relaxed not-italic normal-case">{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== CÔNG VIỆC NỔI BẬT ===== -->
    <section class="py-16 px-5 lg:px-16 xl:px-28">
      <div class="max-w-5xl mx-auto">
        <div class="flex items-center justify-between mb-8">
          <div>
            <span class="text-[10px] font-black uppercase tracking-[3px] text-emerald-400 border border-emerald-500/30 px-4 py-1.5 rounded-full">CÔNG VIỆC</span>
            <h2 class="text-3xl lg:text-4xl font-black italic uppercase tracking-tighter text-white mt-4">
              VIỆC LÀM <span class="text-emerald-400">HOT NHẤT</span>
            </h2>
          </div>
          <button @click="router.push('/register')"
                  class="hidden sm:block px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-black italic uppercase text-[11px] rounded-xl transition-all active:scale-95">
            XEM TẤT CẢ →
          </button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div v-for="job in featuredJobs" :key="job.id"
               @click="router.push('/login')"
               :class="['relative bg-gradient-to-br border-2 rounded-[24px] p-5 flex flex-col cursor-pointer transition-all active:scale-95 hover:-translate-y-1 duration-300 overflow-hidden', job.bg, job.border]">
            <!-- Badge -->
            <div :class="['absolute top-0 right-0 text-[9px] tracking-widest px-3 py-1.5 rounded-bl-2xl rounded-tr-[22px] font-black italic uppercase text-white', job.badgeBg]">
              {{ job.badge }}
            </div>
            <!-- Icon -->
            <div :class="['w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border border-white/10 mb-4', job.iconBg]">
              {{ job.icon }}
            </div>
            <!-- Info -->
            <h4 class="text-white font-black italic uppercase text-[12px] leading-tight mb-1">{{ job.title }}</h4>
            <p class="text-slate-400 text-[9px] mb-3 not-italic normal-case">{{ job.count }} người đã nhận</p>
            <!-- Reward -->
            <div class="mt-auto">
              <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">Thưởng ngay:</p>
              <p class="text-white font-black italic text-xl tracking-tighter">{{ job.reward }} <span class="text-yellow-400 text-sm">XU</span></p>
            </div>
            <!-- CTA -->
            <button :class="['mt-3 w-full py-2.5 rounded-xl text-[10px] font-black italic uppercase text-white bg-gradient-to-r', job.btn]">
              NHẬN NGAY ⚡
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== ĐÁNH GIÁ THÀNH VIÊN ===== -->
    <section class="py-16 px-5 lg:px-16 xl:px-28 bg-[#0d121f]">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-12">
          <span class="text-[10px] font-black uppercase tracking-[3px] text-amber-400 border border-amber-500/30 px-4 py-1.5 rounded-full">CỘNG ĐỒNG</span>
          <h2 class="text-3xl lg:text-4xl font-black italic uppercase tracking-tighter text-white mt-4">
            THÀNH VIÊN NÓI GÌ?
          </h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div v-for="t in testimonials" :key="t.name"
               class="bg-gradient-to-b from-[#111726] to-[#0d121f] border border-slate-800/60 rounded-[24px] p-6 space-y-4">
            <!-- Stars -->
            <div class="flex gap-1">
              <span v-for="i in t.stars" :key="i" class="text-amber-400 text-sm">★</span>
            </div>
            <!-- Quote -->
            <p class="text-slate-300 text-sm font-medium leading-relaxed not-italic normal-case">{{ t.text }}</p>
            <!-- Author -->
            <div class="flex items-center gap-3 pt-2 border-t border-slate-800/60">
              <div :class="['w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0', t.color]">{{ t.avatar }}</div>
              <p class="text-white text-[11px] font-black uppercase tracking-tight">{{ t.name }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== TẠI SAO CHỌN CHÚNG TÔI ===== -->
    <section class="py-16 px-5 lg:px-16 xl:px-28">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-12">
          <span class="text-[10px] font-black uppercase tracking-[3px] text-blue-400 border border-blue-500/30 px-4 py-1.5 rounded-full">LỢI ÍCH</span>
          <h2 class="text-3xl lg:text-4xl font-black italic uppercase tracking-tighter text-white mt-4">
            TẠI SAO CHỌN <span class="text-blue-400">CHÚNG TÔI?</span>
          </h2>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div v-for="u in usps" :key="u.title"
               :class="['border rounded-[24px] p-6 flex flex-col items-center text-center gap-3 hover:-translate-y-1 transition-all duration-300', u.bg]">
            <span class="text-3xl">{{ u.icon }}</span>
            <h3 :class="['text-sm font-black italic uppercase tracking-tight', u.color]">{{ u.title }}</h3>
            <p class="text-slate-400 text-[11px] font-medium leading-relaxed not-italic normal-case">{{ u.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== QUY TRÌNH LÀM VIỆC CHI TIẾT ===== -->
    <section class="py-16 px-5 lg:px-16 xl:px-28 bg-[#0d121f]">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-12">
          <span class="text-[10px] font-black uppercase tracking-[3px] text-emerald-400 border border-emerald-500/30 px-4 py-1.5 rounded-full">QUY TRÌNH</span>
          <h2 class="text-3xl lg:text-4xl font-black italic uppercase tracking-tighter text-white mt-4">
            LÀM VIỆC <span class="text-emerald-400">CHI TIẾT</span>
          </h2>
          <p class="text-slate-500 text-sm font-medium mt-2 not-italic normal-case">5 bước đơn giản từ đăng ký đến rút tiền</p>
        </div>
        <div class="relative">
          <!-- Vertical connector line (mobile) -->
          <div class="absolute left-7 top-8 bottom-8 w-px bg-gradient-to-b from-emerald-500/30 via-blue-500/30 to-emerald-500/30 lg:hidden"></div>
          <div class="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-5 lg:gap-4">
            <div v-for="(s, i) in workflowSteps" :key="s.num"
                 class="relative flex lg:flex-col items-start lg:items-center gap-5 lg:gap-3 lg:text-center">
              <!-- Icon circle -->
              <div class="relative flex-shrink-0 w-14 h-14 lg:w-16 lg:h-16 rounded-2xl bg-gradient-to-br from-[#111726] to-[#0d121f] border border-slate-700/60 flex items-center justify-center text-2xl z-10 shadow-lg">
                {{ s.icon }}
                <!-- Step number badge -->
                <span class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-600 rounded-full text-[9px] font-black text-white flex items-center justify-center">{{ i+1 }}</span>
              </div>
              <!-- Connector arrow (desktop between items) -->
              <div v-if="i < workflowSteps.length - 1" class="hidden lg:flex absolute top-7 left-[calc(100%-8px)] w-4 items-center justify-center text-slate-600 z-20">›</div>
              <!-- Content -->
              <div class="flex-1 lg:flex-none">
                <p class="text-emerald-400 text-[9px] font-black uppercase tracking-widest mb-1">BƯỚC {{ s.num }}</p>
                <h4 class="text-white font-black italic uppercase text-[12px] tracking-tight leading-tight mb-1.5">{{ s.title }}</h4>
                <p class="text-slate-400 text-[11px] font-medium leading-relaxed not-italic normal-case">{{ s.desc }}</p>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-10 text-center">
          <button @click="router.push('/register')"
                  class="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black italic uppercase text-sm rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all active:scale-95">
            BẮT ĐẦU NGAY ▶
          </button>
        </div>
      </div>
    </section>

    <!-- ===== GIỚI THIỆU VỀ CHÚNG TÔI ===== -->
    <section class="py-16 px-5 lg:px-16 xl:px-28 relative overflow-hidden">
      <div class="absolute -left-20 top-0 w-[400px] h-[400px] bg-indigo-700/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div class="max-w-5xl mx-auto relative z-10">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <!-- Text side -->
          <div class="space-y-6">
            <span class="text-[10px] font-black uppercase tracking-[3px] text-indigo-400 border border-indigo-500/30 px-4 py-1.5 rounded-full">VỀ CHÚNG TÔI</span>
            <h2 class="text-3xl lg:text-4xl font-black italic uppercase tracking-tighter text-white mt-4 leading-tight">
              NỀN TẢNG KIẾM TIỀN<br/><span class="text-indigo-400">UY TÍN SỐ 1</span>
            </h2>
            <p class="text-slate-400 text-sm font-medium leading-relaxed not-italic normal-case">
              MMO PRO là nền tảng kết nối giữa doanh nghiệp cần quảng bá sản phẩm và người dùng muốn kiếm thêm thu nhập. Chúng tôi trả thưởng minh bạch, nhanh chóng và uy tín từ năm 2021.
            </p>
            <p class="text-slate-400 text-sm font-medium leading-relaxed not-italic normal-case">
              Với hơn <span class="text-white font-bold">2.000 thành viên</span> và tổng giá trị chi trả vượt <span class="text-emerald-400 font-bold">20 triệu XU</span>, MMO PRO khẳng định vị trí là nền tảng kiếm tiền online tin cậy nhất Việt Nam.
            </p>
            <button @click="router.push('/register')"
                    class="inline-flex items-center gap-2 px-6 py-3 border border-indigo-500/50 hover:border-indigo-400 text-indigo-400 hover:text-white font-black italic uppercase text-[11px] rounded-xl transition-all active:scale-95">
              THAM GIA CỘNG ĐỒNG →
            </button>
          </div>
          <!-- Stats side -->
          <div class="grid grid-cols-2 gap-4">
            <div v-for="s in aboutStats" :key="s.label"
                 class="bg-gradient-to-b from-[#111726] to-[#0d121f] border border-slate-800/60 rounded-[24px] p-6 text-center hover:-translate-y-1 transition-all duration-300">
              <div class="text-3xl mb-3">{{ s.icon }}</div>
              <p class="text-white text-2xl font-black italic tracking-tighter">{{ s.value }}</p>
              <p class="text-slate-500 text-[9px] font-bold uppercase tracking-[1.5px] mt-1">{{ s.label }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== CÂU HỎI THƯỜNG GẶP ===== -->
    <section class="py-16 px-5 lg:px-16 xl:px-28 bg-[#0d121f]">
      <div class="max-w-3xl mx-auto">
        <div class="text-center mb-12">
          <span class="text-[10px] font-black uppercase tracking-[3px] text-amber-400 border border-amber-500/30 px-4 py-1.5 rounded-full">FAQ</span>
          <h2 class="text-3xl lg:text-4xl font-black italic uppercase tracking-tighter text-white mt-4">
            CÂU HỎI <span class="text-amber-400">THƯỜNG GẶP</span>
          </h2>
        </div>
        <div class="space-y-3">
          <div v-for="(f, i) in faqs" :key="i"
               class="bg-gradient-to-b from-[#111726] to-[#0d121f] border border-slate-800/60 rounded-[20px] overflow-hidden">
            <!-- Question row -->
            <button @click="toggleFaq(i)"
                    class="w-full flex items-center justify-between gap-4 px-6 py-4 text-left">
              <span class="text-white text-[13px] font-black uppercase tracking-tight">{{ f.q }}</span>
              <span :class="['flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-300',
                             openFaq === i ? 'bg-amber-500/20 text-amber-400 rotate-45' : 'bg-slate-800 text-slate-400']">+</span>
            </button>
            <!-- Answer (collapsible) -->
            <div v-if="openFaq === i" class="px-6 pb-5">
              <div class="border-t border-slate-800/60 pt-4">
                <p class="text-slate-400 text-sm font-medium leading-relaxed not-italic normal-case">{{ f.a }}</p>
              </div>
            </div>
          </div>
        </div>
        <p class="text-center text-slate-600 text-[10px] font-bold uppercase tracking-widest mt-8 not-italic">
          Còn thắc mắc? Liên hệ admin qua Fanpage hoặc Zalo nhóm kín.
        </p>
      </div>
    </section>


    <!-- ===== FOOTER CTA ===== -->
    <section class="py-20 px-5 lg:px-16 text-center bg-gradient-to-b from-[#090e17] to-[#111726] relative overflow-hidden">
      <div class="absolute inset-0 landing-dot-grid opacity-20 pointer-events-none"></div>
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-blue-700/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div class="relative z-10 max-w-2xl mx-auto space-y-6">
        <h2 class="text-3xl lg:text-5xl font-black italic uppercase tracking-tighter text-white leading-tight">
          SẴN SÀNG<br/><span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">KIẾM TIỀN?</span>
        </h2>
        <p class="text-slate-400 text-sm font-medium not-italic normal-case">Tham gia miễn phí — nhận ngay 10.000 XU chào mừng!</p>
        <button @click="router.push('/register')"
                class="relative overflow-hidden inline-flex items-center gap-2 px-10 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black italic uppercase text-sm rounded-2xl shadow-[0_0_40px_rgba(37,99,235,0.4)] transition-all active:scale-95">
          <div class="absolute inset-0 bg-white/10 animate-[shimmer_3s_infinite]"></div>
          <span class="relative z-10">ĐĂNG KÝ NGAY — MIỄN PHÍ 100%</span>
          <svg class="relative z-10 w-5 h-5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </button>
        <p class="text-slate-600 text-[10px] font-bold uppercase tracking-widest not-italic">© 2026 MMO PRO SYSTEM. ALL RIGHTS RESERVED.</p>
      </div>
    </section>

  </div>
</template>

<style scoped>
.landing-dot-grid {
  background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 28px 28px;
}
</style>
