<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
// @ts-ignore
import { db, auth } from '@/firebase'
import {
  collection, addDoc, serverTimestamp, doc, getDoc,
  query, where, getDocs
} from 'firebase/firestore'
import { normalizeThreadUrl, getDateKey, calcReward } from '@/utils/threadUtils'

const emit = defineEmits<{
  (e: 'submitted'): void
  (e: 'close'): void
  (e: 'open-history'): void
}>()

// fullName auto-fill từ username, không nhập tay
const fullName     = ref('')
const threadNick   = ref('')
const postUrl      = ref('')
const qrViewCount  = ref<number | ''>('')
const note         = ref('')
const isSubmitting = ref(false)
const userSite     = ref('mmo')

// Lỗi inline — hiện ngay trong modal, không dùng Swal
const formError          = ref('')
// Trạng thái chờ xác nhận link không phải Threads
const linkWarningPending = ref(false)

// Giới hạn 5 đơn pending/ngày
const pendingCount   = ref(0)
const isCheckingLimit = ref(false)
const isPendingLimitReached = computed(() => pendingCount.value >= 5)

const submitSuccess = ref(false)
const submittedInfo = ref({ threadNick: '', qrViewCount: 0, reward: 0, sentAt: '' })

onMounted(async () => {
  const uid = auth.currentUser?.uid
  if (!uid) return
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (snap.exists()) {
      const data = snap.data()
      if (data.username) fullName.value = data.username
      if (data.site) userSite.value = data.site
    }
  } catch (_) {}
  await refreshPendingCount()
})

// true = đã đếm thành công, false = lỗi (phải chặn submit)
async function refreshPendingCount(): Promise<boolean> {
  const uid = auth.currentUser?.uid
  if (!uid) return false
  const dateKey = getDateKey()
  isCheckingLimit.value = true
  try {
    const snap = await getDocs(query(
      collection(db, 'daily_thread_reports'),
      where('uid', '==', uid),
      where('dateKey', '==', dateKey),
      where('status', '==', 'pending')
    ))
    pendingCount.value = snap.size
    console.log('Daily thread pending limit check:', { uid, todayDateKey: dateKey, pendingCount: pendingCount.value })
    return true
  } catch (err) {
    console.error('Pending limit check failed:', err)
    return false
  } finally {
    isCheckingLimit.value = false
  }
}

function clearError() {
  formError.value = ''
  linkWarningPending.value = false
}

function resetForm() {
  threadNick.value         = ''
  postUrl.value            = ''
  qrViewCount.value        = ''
  note.value               = ''
  formError.value          = ''
  linkWarningPending.value = false
  submitSuccess.value      = false
}

function handleClose() {
  resetForm()
  emit('close')
}

function handleOpenHistory() {
  resetForm()
  emit('open-history')
}

function isThreadsUrl(url: string): boolean {
  return url.includes('threads.net') || url.includes('threads.com')
}

// Phần submit thực sự (sau khi validate + xác nhận link xong)
async function doSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  linkWarningPending.value = false
  formError.value = ''

  try {
    const uid = auth.currentUser?.uid
    if (!uid) {
      formError.value = 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.'
      return
    }

    const ok = await refreshPendingCount()
    if (!ok) {
      formError.value = 'Không thể kiểm tra giới hạn đơn chờ. Vui lòng thử lại.'
      return
    }
    if (pendingCount.value >= 5) {
      console.warn('Blocked submit: pending limit reached', pendingCount.value)
      formError.value = 'Bạn đang có 5 đơn Thread chờ kiểm tra. Vui lòng chờ admin xử lý trước khi gửi thêm.'
      return
    }

    const views   = Number(qrViewCount.value)
    const reward  = calcReward(views)
    const dateKey = getDateKey()

    await addDoc(collection(db, 'daily_thread_reports'), {
      uid,
      fullName: fullName.value.trim().toUpperCase(),
      phoneRef: '',
      threadNick: threadNick.value.trim(),
      threadNickLower: threadNick.value.trim().toLowerCase(),
      postUrl: postUrl.value.trim(),
      postUrlNormalized: normalizeThreadUrl(postUrl.value.trim()),
      qrViewCount: views,
      note: note.value.trim(),
      jobId: 'daily_threads',
      jobName: 'Đăng bài Thread hằng ngày',
      reward,
      status: 'pending',
      site: userSite.value,
      dateKey,
      createdAt: serverTimestamp(),
      paidAt: null,
      paidBy: null,
    })

    pendingCount.value++

    submittedInfo.value = {
      threadNick: threadNick.value.trim(),
      qrViewCount: views,
      reward,
      sentAt: new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    }

    emit('submitted')
    submitSuccess.value = true
  } catch (err) {
    console.error(err)
    formError.value = 'Gửi bằng chứng thất bại. Vui lòng thử lại.'
  } finally {
    isSubmitting.value = false
  }
}

async function handleSubmit() {
  formError.value = ''
  linkWarningPending.value = false

  if (!threadNick.value.trim()) {
    formError.value = 'Vui lòng nhập tên nick Threads.'
    return
  }
  if (!postUrl.value.trim()) {
    formError.value = 'Vui lòng nhập link bài viết.'
    return
  }
  if (qrViewCount.value === '' || (qrViewCount.value as number) < 0) {
    formError.value = 'Vui lòng nhập số view QR hợp lệ.'
    return
  }

  // Link không phải Threads → hiện banner xác nhận inline thay vì Swal
  if (!isThreadsUrl(postUrl.value.trim())) {
    linkWarningPending.value = true
    return
  }

  await doSubmit()
}
</script>

<template>
  <div class="bg-[#111726]/80 border border-purple-500/30 rounded-[24px] p-5">

    <!-- ── Màn hình thành công ──────────────────────────────── -->
    <div v-if="submitSuccess" class="space-y-5 text-center py-2">

      <div class="text-5xl">✅</div>

      <div class="space-y-2">
        <h2 class="text-base font-black uppercase tracking-wide text-white">Đã gửi bằng chứng thành công!</h2>
        <p class="text-slate-400 text-sm not-italic normal-case font-medium leading-relaxed">
          Đơn Threads hằng ngày của bạn đã được gửi.<br/>
          Vui lòng chờ <span class="text-white font-black">22h – 23h</span> để được duyệt đơn và cộng xu.
        </p>
      </div>

      <div class="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-4 py-2">
        <span class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0"></span>
        <span class="text-yellow-400 text-xs font-black uppercase tracking-wider not-italic">Trạng thái: Chờ kiểm tra</span>
      </div>

      <div class="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 text-left space-y-3">
        <!-- Thời gian duyệt -->
        <p class="text-red-400 text-xs not-italic normal-case font-black text-center pb-1 border-b border-slate-700/60">
          Thời gian duyệt đơn dự kiến: 22h – 23h
        </p>
        <div class="flex items-center justify-between text-sm gap-3">
          <span class="text-slate-400 not-italic normal-case font-semibold shrink-0">Nick Thread</span>
          <span class="text-purple-300 font-black truncate">{{ submittedInfo.threadNick }}</span>
        </div>
        <div class="flex items-center justify-between text-sm gap-3">
          <span class="text-slate-400 not-italic normal-case font-semibold shrink-0">View QR</span>
          <span class="text-white font-black">{{ submittedInfo.qrViewCount.toLocaleString('vi-VN') }}</span>
        </div>
        <div class="flex items-center justify-between text-sm gap-3">
          <span class="text-slate-400 not-italic normal-case font-semibold shrink-0">Thưởng dự kiến</span>
          <span class="text-emerald-400 font-black">{{ submittedInfo.reward.toLocaleString('vi-VN') }} xu</span>
        </div>
        <div class="flex items-center justify-between text-sm gap-3">
          <span class="text-slate-400 not-italic normal-case font-semibold shrink-0">Thời gian gửi</span>
          <span class="text-slate-300 not-italic normal-case font-medium">{{ submittedInfo.sentAt }}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-1">
        <button
          @click="handleClose"
          class="py-3.5 rounded-2xl text-sm font-black italic uppercase tracking-wide transition-all active:scale-95
                 bg-slate-700/80 border border-slate-600/60 text-slate-200 hover:bg-slate-600/80">
          Đóng
        </button>
        <button
          @click="handleOpenHistory"
          class="py-3.5 rounded-2xl text-sm font-black italic uppercase tracking-wide transition-all active:scale-95
                 bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]">
          Xem lịch sử đơn
        </button>
      </div>

    </div>

    <!-- ── Form nhập liệu ───────────────────────────────────── -->
    <div v-else class="space-y-4">
      <p class="text-[10px] text-purple-300 tracking-widest font-black italic uppercase">NỘP BẰNG CHỨNG</p>

      <!-- Banner: đã đạt giới hạn 5 đơn pending -->
      <div
        v-if="isPendingLimitReached"
        class="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-3">
        <span class="text-red-400 text-base shrink-0 mt-0.5">⚠</span>
        <p class="text-red-300/90 text-sm not-italic normal-case font-medium leading-relaxed">
          Bạn đang có {{ pendingCount }} đơn Thread chờ kiểm tra. Vui lòng chờ admin xử lý trước khi gửi thêm.
        </p>
      </div>

      <!-- Tài khoản (auto-fill từ username, không nhập tay) -->
      <div class="flex items-center justify-between gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-4 py-2.5">
        <span class="text-[10px] text-slate-500 not-italic normal-case font-semibold uppercase tracking-wider shrink-0">Tài khoản</span>
        <span class="text-white text-sm font-black truncate">{{ fullName || '...' }}</span>
      </div>

      <!-- Nick Threads -->
      <div class="space-y-1.5">
        <label class="text-[10px] text-slate-400 tracking-widest not-italic normal-case font-semibold uppercase">Tên nick Threads *</label>
        <input
          v-model="threadNick"
          @input="clearError"
          type="text"
          placeholder="VD: @tennick hoặc tennick"
          class="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors not-italic normal-case font-medium"
        />
      </div>

      <!-- Link bài viết -->
      <div class="space-y-1.5">
        <label class="text-[10px] text-slate-400 tracking-widest not-italic normal-case font-semibold uppercase">Link bài viết Threads *</label>
        <input
          v-model="postUrl"
          @input="clearError"
          type="url"
          placeholder="https://www.threads.net/..."
          class="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors not-italic normal-case font-medium"
        />
      </div>

      <!-- Số view QR -->
      <div class="space-y-1.5">
        <label class="text-[10px] text-slate-400 tracking-widest not-italic normal-case font-semibold uppercase">Số view mã QR được ghim *</label>
        <input
          v-model.number="qrViewCount"
          @input="clearError"
          type="number"
          min="0"
          placeholder="VD: 350"
          class="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors not-italic normal-case font-medium"
        />
        <p v-if="qrViewCount !== '' && Number(qrViewCount) >= 0"
          class="text-[11px] not-italic normal-case"
          :class="calcReward(Number(qrViewCount)) > 0 ? 'text-emerald-400' : 'text-slate-500'">
          <span v-if="calcReward(Number(qrViewCount)) > 0">
            → Thưởng đề nghị: <strong>{{ calcReward(Number(qrViewCount)).toLocaleString('vi-VN') }} xu</strong>
          </span>
          <span v-else>Cần tối thiểu 50 view QR để nhận thưởng.</span>
        </p>
      </div>

      <!-- Ghi chú -->
      <div class="space-y-1.5">
        <label class="text-[10px] text-slate-400 tracking-widest not-italic normal-case font-semibold uppercase">Ghi chú thêm (tuỳ chọn)</label>
        <textarea
          v-model="note"
          rows="2"
          placeholder="Ghi chú nếu cần..."
          class="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors resize-none not-italic normal-case font-medium"
        />
      </div>

      <!-- ── Banner xác nhận link không đúng (thay Swal confirm) ── -->
      <div
        v-if="linkWarningPending"
        class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
        <div class="flex items-start gap-2.5">
          <span class="text-amber-400 text-base shrink-0 mt-0.5">⚠</span>
          <div class="space-y-0.5">
            <p class="text-amber-400 text-sm font-black not-italic normal-case">Link có vẻ không đúng</p>
            <p class="text-amber-300/80 text-xs not-italic normal-case font-medium leading-relaxed">
              Link bạn nhập có vẻ không phải link Threads. Bạn vẫn muốn gửi để admin kiểm tra?
            </p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            @click="linkWarningPending = false"
            class="py-2.5 rounded-xl text-xs font-black italic uppercase tracking-wide transition-all active:scale-95
                   bg-slate-700/80 border border-slate-600/60 text-slate-300 hover:bg-slate-600/80">
            Sửa lại
          </button>
          <button
            @click="doSubmit"
            :disabled="isSubmitting || isCheckingLimit || isPendingLimitReached"
            class="py-2.5 rounded-xl text-xs font-black italic uppercase tracking-wide transition-all active:scale-95
                   bg-amber-600/80 border border-amber-500/40 text-white hover:bg-amber-600"
            :class="isSubmitting || isCheckingLimit || isPendingLimitReached ? 'opacity-50 cursor-not-allowed' : ''">
            {{ isSubmitting ? 'Đang gửi...' : 'Vẫn gửi' }}
          </button>
        </div>
      </div>

      <!-- ── Lỗi inline ── -->
      <div
        v-if="formError"
        class="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-3">
        <span class="text-red-400 text-base shrink-0 mt-0.5">⚠</span>
        <div>
          <p class="text-red-400 text-[11px] font-black uppercase tracking-wide not-italic">Thiếu thông tin</p>
          <p class="text-red-300/90 text-sm not-italic normal-case font-medium mt-0.5">{{ formError }}</p>
        </div>
      </div>

      <!-- Submit -->
      <button
        @click="handleSubmit"
        :disabled="isSubmitting || isCheckingLimit || isPendingLimitReached"
        class="w-full py-4 rounded-2xl text-sm tracking-widest font-black italic uppercase transition-all active:scale-95"
        :class="isSubmitting || isCheckingLimit || isPendingLimitReached
          ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
          : 'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.35)]'"
      >
        {{ isSubmitting ? 'ĐANG GỬI...' : 'GỬI BẰNG CHỨNG 🧵' }}
      </button>
    </div>

  </div>
</template>
