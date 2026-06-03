<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth, db } from '@/firebase'
import { createUserWithEmailAndPassword } from "firebase/auth"
import { doc, setDoc, collection, query, where, getDocs } from "firebase/firestore"
import Swal from 'sweetalert2'

const router = useRouter()
const fullName = ref('')
const email = ref('')
const phone = ref('')
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)

const handleRegister = async () => {
  if (!fullName.value || !email.value || !phone.value || !username.value || !password.value) {
    Swal.fire({
      title: 'THIẾU THÔNG TIN!',
      text: 'Vui lòng điền đầy đủ các trường để tiếp tục.',
      icon: 'warning',
      background: '#ffffff',
      color: '#1e293b',
      confirmButtonText: 'ĐÃ HIỂU',
      confirmButtonColor: '#f59e0b',
      customClass: {
        popup: 'rounded-[30px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-slate-100',
        title: 'font-black italic uppercase text-2xl text-slate-800',
        htmlContainer: 'font-bold text-sm text-slate-500 normal-case',
        confirmButton: 'font-black uppercase italic rounded-xl px-8 py-3 shadow-lg active:scale-95 transition-all text-sm'
      }
    })
    return
  }

  loading.value = true
  try {
    const usernameToCheck = username.value.toLowerCase().trim()
    const usersRef = collection(db, "users")
    const q = query(usersRef, where("username", "==", usernameToCheck))
    const querySnapshot = await getDocs(q)

    if (!querySnapshot.empty) {
      Swal.fire({
        title: 'TRÙNG TÊN ĐĂNG NHẬP!',
        text: 'Tên đăng nhập này đã có người sử dụng. Vui lòng chọn tên khác!',
        icon: 'error',
        background: '#ffffff',
        color: '#1e293b',
        confirmButtonText: 'THỬ LẠI',
        confirmButtonColor: '#ef4444',
        customClass: {
          popup: 'rounded-[30px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-slate-100',
          title: 'font-black italic uppercase text-2xl text-slate-800',
          htmlContainer: 'font-bold text-sm text-slate-500 normal-case',
          confirmButton: 'font-black uppercase italic rounded-xl px-8 py-3 shadow-lg active:scale-95 transition-all text-sm'
        }
      })
      loading.value = false
      return
    }

    const currentYear = new Date().getFullYear();
    const { value: birthYearInput, isConfirmed } = await Swal.fire({
      title: '🎂 BẠN SINH NĂM NÀO?',
      text: 'Vui lòng nhập năm sinh (VD: 2000) để hoàn tất hồ sơ',
      input: 'number',
      inputAttributes: {
        placeholder: 'Ví dụ: 2000',
        min: '1950',
        max: currentYear.toString()
      },
      background: '#ffffff',
      color: '#1e293b',
      allowOutsideClick: false,
      showCancelButton: true,
      cancelButtonText: 'HỦY BỎ',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'HOÀN TẤT ĐĂNG KÝ 🚀',
      confirmButtonColor: '#2563eb',
      customClass: {
        popup: 'rounded-[30px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 p-6',
        title: 'font-black italic uppercase text-2xl md:text-3xl text-slate-800 mb-2',
        htmlContainer: 'font-bold text-xs text-slate-500 normal-case',
        input: 'font-black text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-center outline-none focus:border-blue-500 w-4/5 mx-auto shadow-inner tracking-[5px] text-2xl',
        confirmButton: 'font-black uppercase italic rounded-[15px] px-6 py-3 shadow-lg active:scale-95 transition-all text-[11px] md:text-xs',
        cancelButton: 'font-black uppercase italic rounded-[15px] px-6 py-3 shadow-lg active:scale-95 transition-all text-[11px] md:text-xs text-white'
      },
      preConfirm: (val) => {
        if (!val) {
          Swal.showValidationMessage('Bạn chưa nhập năm sinh kìa!');
          return false;
        }
        if (val.toString().length !== 4) {
          Swal.showValidationMessage('Vui lòng nhập đúng 4 số (VD: 2000)!');
          return false;
        }
        const y = parseInt(val);
        if (y < 1950 || y > currentYear) {
          Swal.showValidationMessage('Năm sinh không hợp lệ!');
          return false;
        }
        return val;
      }
    });

    if (!isConfirmed || !birthYearInput) {
      loading.value = false;
      return;
    }

    const calculatedAge = currentYear - parseInt(birthYearInput);

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email.value.toLowerCase().trim(),
      password.value
    )

    const user = userCredential.user

    await setDoc(doc(db, "users", user.uid), {
      username: username.value,
      fullName: fullName.value,
      phone: phone.value,
      email: email.value,
      dob: birthYearInput.toString(),
      age: calculatedAge,
      balance: 0,
      site: 'rapjob',
      role: 'user',
      createdAt: new Date()
    });

    Swal.fire({
      title: 'ĐĂNG KÝ THÀNH CÔNG!',
      text: 'Chào mừng bạn gia nhập hệ thống MMO PRO!',
      icon: 'success',
      background: '#ffffff',
      color: '#1e293b',
      confirmButtonText: 'VÀO COI CÔNG VIỆC 🚀',
      confirmButtonColor: '#2563eb',
      customClass: {
        popup: 'rounded-[30px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-slate-100',
        title: 'font-black italic uppercase text-2xl text-slate-800',
        htmlContainer: 'font-bold text-sm text-slate-500 normal-case',
        confirmButton: 'font-black uppercase italic rounded-xl px-8 py-3 shadow-lg active:scale-95 transition-all text-sm'
      }
    }).then(() => {
      router.push('/')
    })

  } catch (error: any) {
    let msg = error.message
    if (error.code === 'auth/email-already-in-use') msg = 'Email này đã được đăng ký trên hệ thống!'
    if (error.code === 'auth/weak-password') msg = 'Mật khẩu quá yếu, phải từ 6 ký tự trở lên!'

    Swal.fire({
      title: 'LỖI ĐĂNG KÝ!',
      text: msg,
      icon: 'error',
      background: '#ffffff',
      color: '#1e293b',
      confirmButtonText: 'ĐÓNG',
      confirmButtonColor: '#ef4444',
      customClass: {
        popup: 'rounded-[30px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-slate-100',
        title: 'font-black italic uppercase text-2xl text-slate-800',
        htmlContainer: 'font-bold text-sm text-slate-500 normal-case',
        confirmButton: 'font-black uppercase italic rounded-xl px-8 py-3 shadow-lg active:scale-95 transition-all text-sm'
      }
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f172a] lg:bg-[#eff6ff] flex items-center justify-center p-4 md:p-8 font-sans relative overflow-hidden">

    <!-- Background glows -->
    <div class="absolute -top-32 -left-32 w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-[120px] pointer-events-none"></div>
    <div class="absolute -bottom-32 -right-32 w-[400px] h-[400px] bg-sky-200/20 rounded-full blur-[100px] pointer-events-none"></div>

    <div class="max-w-5xl w-full flex flex-col lg:flex-row overflow-hidden rounded-[32px] border border-blue-200/60 shadow-[0_30px_80px_rgba(37,99,235,0.15)] relative z-10">

      <!-- ===== LEFT PANEL ===== -->
      <div class="w-full lg:w-[42%] bg-gradient-to-br from-[#0a1628] to-[#060e1e] p-8 md:p-12 flex flex-col justify-between relative overflow-hidden text-left order-last lg:order-first border-r border-blue-900/20">

        <!-- Decorative glows -->
        <div class="absolute -top-20 -left-20 w-64 h-64 bg-blue-800/15 rounded-full blur-[80px] pointer-events-none"></div>
        <div class="absolute bottom-10 right-0 w-48 h-48 bg-sky-800/10 rounded-full blur-[70px] pointer-events-none"></div>

        <div class="relative z-10">
          <!-- Logo -->
          <div class="mb-10">
            <img src="/images/mmo-logo.png" alt="MMO PRO" class="h-10 object-contain" />
          </div>

          <!-- Heading -->
          <p class="text-sky-400/70 font-black tracking-[3px] text-[9px] mb-3 uppercase">Đã có tài khoản?</p>
          <h2 class="text-2xl md:text-4xl font-black tracking-tighter mb-4 leading-tight uppercase italic text-white drop-shadow-md">
            Kiếm tiền<br/>online cùng<br/><span class="text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-blue-400">MMO PRO</span>
          </h2>
          <p class="text-slate-500 text-sm font-medium leading-relaxed mb-8 hidden md:block">
            Đăng nhập để xem số dư, lịch sử và toàn bộ dịch vụ đang sử dụng.
          </p>

          <!-- Highlight pills -->
          <div class="hidden md:flex flex-col gap-3 mb-10">
            <div class="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3">
              <span class="text-lg">🎁</span>
              <p class="text-emerald-400 text-[11px] font-black uppercase italic tracking-wide">Miễn phí hoàn toàn, nhận hoa hồng</p>
            </div>
            <div class="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-4 py-3">
              <span class="text-lg">⛔</span>
              <p class="text-blue-300 text-[11px] font-black uppercase italic tracking-wide">Không nạp tiền, không thu phí</p>
            </div>
            <div class="flex items-center gap-3 bg-sky-500/10 border border-sky-500/20 rounded-2xl px-4 py-3">
              <span class="text-lg">💳</span>
              <p class="text-sky-300 text-[11px] font-black uppercase italic tracking-wide">Rút tiền 24/7 minh bạch</p>
            </div>
          </div>
        </div>

        <!-- Login CTA -->
        <button @click="router.push('/login')"
                class="relative z-10 w-full bg-white/5 hover:bg-white/10 border border-blue-700 hover:border-sky-400/60 text-white py-4 rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all text-sm italic shadow-inner">
          ĐĂNG NHẬP NGAY →
        </button>
      </div>

      <!-- ===== RIGHT PANEL (form) ===== -->
      <div class="w-full lg:w-[58%] bg-white p-8 md:p-12 flex flex-col justify-center text-left order-first lg:order-last">

        <!-- Top bar -->
        <div class="flex items-center justify-between mb-8">
          <div>
            <p class="text-slate-400 font-black tracking-[2px] text-[9px] uppercase mb-0.5">Mở tài khoản mới</p>
            <h2 class="text-2xl md:text-3xl font-black text-slate-800 tracking-tighter uppercase italic leading-none">
              Tạo tài khoản
            </h2>
          </div>
          <button @click="router.push('/')"
                  class="text-[10px] font-black text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors uppercase bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl border border-blue-200">
            🏠 Trang chủ
          </button>
        </div>

        <!-- Form fields -->
        <div class="space-y-3.5 font-black italic text-xs">

          <!-- Họ tên -->
          <div class="space-y-1">
            <label class="text-[9px] text-slate-400 tracking-widest ml-1">Họ và tên</label>
            <input v-model="fullName" type="text" placeholder="HỌ VÀ TÊN..."
                   class="w-full bg-blue-50 border border-blue-100 rounded-2xl py-3.5 px-5 text-slate-800 placeholder-slate-300 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm"/>
          </div>

          <!-- Username + Email grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div class="space-y-1">
              <label class="text-[9px] text-slate-400 tracking-widest ml-1">Tên đăng nhập</label>
              <input v-model="username" type="text" placeholder="USERNAME..."
                     class="w-full bg-blue-50 border border-blue-100 rounded-2xl py-3.5 px-5 text-slate-800 placeholder-slate-300 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm"/>
            </div>
            <div class="space-y-1">
              <label class="text-[9px] text-slate-400 tracking-widest ml-1">Địa chỉ Email</label>
              <input v-model="email" type="email" placeholder="EMAIL..."
                     class="w-full bg-blue-50 border border-blue-100 rounded-2xl py-3.5 px-5 text-slate-800 placeholder-slate-300 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm"/>
            </div>
          </div>

          <!-- Số điện thoại -->
          <div class="space-y-1">
            <label class="text-[9px] text-slate-400 tracking-widest ml-1">Số điện thoại</label>
            <input v-model="phone" type="tel" placeholder="0912345678..."
                   class="w-full bg-blue-50 border border-blue-100 rounded-2xl py-3.5 px-5 text-slate-800 placeholder-slate-300 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm"/>
            <p class="text-[9px] text-rose-500/80 italic uppercase mt-1 ml-1 tracking-wide font-black">
              ⚠️ Nhập đúng SĐT. Gian lận sẽ bị khóa vĩnh viễn.
            </p>
          </div>

          <!-- Mật khẩu -->
          <div class="space-y-1 relative">
            <label class="text-[9px] text-slate-400 tracking-widest ml-1">Mật khẩu</label>
            <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="••••••••"
                   class="w-full bg-blue-50 border border-blue-100 rounded-2xl py-3.5 px-5 pr-16 text-slate-800 placeholder-slate-300 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm"/>
            <button @click="showPassword = !showPassword"
                    class="absolute right-5 top-[26px] text-[9px] text-blue-500 font-black hover:text-blue-400 tracking-widest z-10">
              {{ showPassword ? 'ẨN' : 'HIỆN' }}
            </button>
          </div>

        </div>

        <!-- Terms -->
        <div class="mt-5 flex items-start gap-3">
          <input type="checkbox" id="terms" :checked="true"
                 class="mt-0.5 w-4 h-4 rounded accent-blue-600 border-blue-200 flex-shrink-0"/>
          <label for="terms" class="text-[11px] text-slate-500 font-medium leading-relaxed cursor-pointer normal-case not-italic">
            Tôi đồng ý với các
            <span class="text-blue-600 font-bold hover:underline">Điều khoản</span> và
            <span class="text-blue-600 font-bold hover:underline">Chính sách bảo mật</span>
            của MMO PRO.
          </label>
        </div>

        <!-- Submit button -->
        <button @click="handleRegister" :disabled="loading"
                class="w-full mt-5 bg-gradient-to-r from-blue-700 to-blue-500 hover:from-blue-600 hover:to-blue-400 py-4 rounded-2xl text-white font-black uppercase italic shadow-[0_0_30px_rgba(37,99,235,0.35)] hover:shadow-[0_0_40px_rgba(37,99,235,0.5)] transition-all active:scale-95 disabled:opacity-50 text-sm tracking-wider">
          {{ loading ? '⏳ ĐANG TẠO TÀI KHOẢN...' : 'TẠO TÀI KHOẢN →' }}
        </button>

        <!-- Divider + mobile login link -->
        <div class="mt-6 pt-6 border-t border-blue-100 flex items-center justify-center gap-2 lg:hidden">
          <span class="text-slate-400 text-[11px] font-bold normal-case not-italic">Đã có tài khoản?</span>
          <button @click="router.push('/login')" class="text-blue-600 text-[11px] font-black italic uppercase hover:text-blue-500 transition-colors">
            ĐĂNG NHẬP NGAY →
          </button>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
::-webkit-scrollbar { width: 0px; display: none; }
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
</style>
