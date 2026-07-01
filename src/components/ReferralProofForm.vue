<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
// @ts-ignore
import { db, auth, storage } from '@/firebase'
import { doc, getDoc, collection, setDoc, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'

const props = defineProps<{ bankType: 'abbank' | 'lpbank' }>()

const emit = defineEmits<{
  (e: 'submitted'): void
  (e: 'close'): void
  (e: 'open-history'): void
}>()

const bankLabel = computed(() => (props.bankType === 'abbank' ? 'ABBANK' : 'LPBANK'))
const baseUrl = import.meta.env.BASE_URL

const username = ref('')
const userSite = ref('mmo')
const friendName = ref('')
const friendPhone = ref('')

const imageBlobs = ref<Blob[]>([])
const imagePreviews = ref<string[]>([])
const isCompressing = ref(false)
const isSubmitting = ref(false)
const uploadDone = ref(0)
const uploadTotal = ref(0)
const isBusy = computed(() => isCompressing.value || isSubmitting.value)

const formError = ref('')

const submitSuccess = ref(false)
const submittedInfo = ref({ friendName: '', friendPhone: '', sentAt: '' })

const sampleImages = [
  { src: baseUrl + 'images/anh-abbank1.jpg', label: 'Ảnh mẫu 1' },
  { src: baseUrl + 'images/anh-abbank2.jpg', label: 'Ảnh mẫu 2' },
  { src: baseUrl + 'images/anh-abbank3.jpg', label: 'Ảnh mẫu 3' },
]

const zoomImage = ref<string | null>(null)
const openZoom = (img: string) => { zoomImage.value = img }
const closeZoom = () => { zoomImage.value = null }

onMounted(async () => {
  const uid = auth.currentUser?.uid
  if (!uid) return
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (snap.exists()) {
      const data = snap.data()
      if (data.username) username.value = data.username
      if (data.site) userSite.value = data.site
    }
  } catch (_) {}
})

function clearError() {
  formError.value = ''
}

// Returns a webp Blob. Targets ~300-600KB; hard rejects if still >1MB after two passes.
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.src = e.target?.result as string
      img.onload = () => {
        const MAX_DIM = 1280
        let { width, height } = img
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width >= height) {
            height = Math.round((height * MAX_DIM) / width)
            width = MAX_DIM
          } else {
            width = Math.round((width * MAX_DIM) / height)
            height = MAX_DIM
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas không khả dụng')); return }
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob1) => {
          if (!blob1) { reject(new Error('Không thể nén ảnh')); return }
          if (blob1.size < 1 * 1024 * 1024) { resolve(blob1); return }
          canvas.toBlob((blob2) => {
            if (!blob2) { reject(new Error('Không thể nén ảnh')); return }
            if (blob2.size >= 1 * 1024 * 1024) {
              reject(new Error('Ảnh quá lớn, vui lòng chọn ảnh khác hoặc chụp lại rõ hơn.'))
              return
            }
            resolve(blob2)
          }, 'image/webp', 0.55)
        }, 'image/webp', 0.72)
      }
      img.onerror = () => reject(new Error('Không thể đọc ảnh'))
    }
    reader.onerror = () => reject(new Error('Không thể đọc file'))
  })
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files?.length) return
  const files = Array.from(target.files)

  if (imageBlobs.value.length + files.length > 6) {
    formError.value = 'Bạn chỉ có thể gửi tối đa 6 ảnh bằng chứng.'
    target.value = ''
    return
  }

  isCompressing.value = true
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
      formError.value = `Ảnh "${file.name}" là ảnh HEIC của iPhone nên hệ thống không nhận diện được. Vui lòng chụp màn hình lại ảnh đó rồi tải lên.`
      continue
    }
    if (!file.type.startsWith('image/')) continue
    try {
      const blob = await compressImage(file)
      imagePreviews.value.push(URL.createObjectURL(blob))
      imageBlobs.value.push(blob)
    } catch (err: any) {
      formError.value = err.message || 'Lỗi khi xử lý ảnh'
    }
  }
  isCompressing.value = false
  target.value = ''
}

const removeImage = (index: number) => {
  const preview = imagePreviews.value[index]
  if (preview) URL.revokeObjectURL(preview)
  imageBlobs.value.splice(index, 1)
  imagePreviews.value.splice(index, 1)
}

interface ProofImage { url: string; path: string; size: number; contentType: string }

// Upload blobs in parallel batches of CONCURRENCY, cleaning up partial uploads on failure.
const uploadImagesToStorage = async (
  uid: string,
  proofId: string,
  blobs: Blob[],
  onProgress: (done: number, total: number) => void
): Promise<ProofImage[]> => {
  const CONCURRENCY = 3
  const total = blobs.length
  const results: ProofImage[] = new Array(total)
  const uploadedPaths: string[] = []
  let doneCount = 0

  const uploadOne = async (i: number) => {
    const blob = blobs[i] as Blob
    const path = `proofs/${uid}/${proofId}/image_${i}.webp`
    const sRef = storageRef(storage, path)
    await uploadBytes(sRef, blob, { contentType: 'image/webp' })
    uploadedPaths.push(path)
    const url = await getDownloadURL(sRef)
    results[i] = { url, path, size: blob.size, contentType: 'image/webp' }
    doneCount++
    onProgress(doneCount, total)
  }

  try {
    for (let i = 0; i < total; i += CONCURRENCY) {
      const batchIndices = Array.from(
        { length: Math.min(CONCURRENCY, total - i) },
        (_, k) => i + k
      )
      const batchResults = await Promise.allSettled(batchIndices.map(uploadOne))
      const failed = batchResults.find(r => r.status === 'rejected')
      if (failed) {
        await Promise.allSettled(uploadedPaths.map(p => deleteObject(storageRef(storage, p))))
        throw (failed as PromiseRejectedResult).reason
      }
    }
    return results
  } catch (err) {
    await Promise.allSettled(uploadedPaths.map(p => deleteObject(storageRef(storage, p))))
    throw err
  }
}

function resetForm() {
  friendName.value = ''
  friendPhone.value = ''
  imagePreviews.value.forEach(p => URL.revokeObjectURL(p))
  imageBlobs.value = []
  imagePreviews.value = []
  formError.value = ''
  submitSuccess.value = false
}

function handleClose() {
  resetForm()
  emit('close')
}

function handleOpenHistory() {
  resetForm()
  emit('open-history')
}

async function handleSubmit() {
  formError.value = ''

  if (!friendName.value.trim() || !friendPhone.value.trim()) {
    formError.value = 'Vui lòng nhập đầy đủ thông tin bắt buộc.'
    return
  }
  if (imageBlobs.value.length < 3) {
    formError.value = `Vui lòng tải lên đủ 3 ảnh bằng chứng ${bankLabel.value}.`
    return
  }

  if (isSubmitting.value) return
  isSubmitting.value = true

  try {
    const uid = auth.currentUser?.uid
    if (!uid) {
      formError.value = 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.'
      return
    }

    const reportRef = doc(collection(db, 'reports'))

    uploadDone.value = 0
    uploadTotal.value = imageBlobs.value.length
    const proofImages = await uploadImagesToStorage(uid, reportRef.id, imageBlobs.value, (done, total) => {
      uploadDone.value = done
      uploadTotal.value = total
    })

    await setDoc(reportRef, {
      uid,
      username: username.value,
      jobId: props.bankType === 'abbank' ? 'referral_abbank' : 'referral_lpbank',
      jobName: props.bankType === 'abbank'
        ? 'Giới thiệu bạn bè đăng ký APP ABBANK'
        : 'Giới thiệu bạn bè đăng ký APP LPBANK',
      reward: props.bankType === 'abbank' ? '85.000 xu' : '100.000 xu',
      status: 'pending',
      friendName: friendName.value.trim(),
      friendPhone: friendPhone.value.trim(),
      bankType: props.bankType,
      category: 'vip',
      type: 'friend_referral',
      site: userSite.value,
      proofImages,
      imageCount: proofImages.length,
      createdAt: serverTimestamp(),
    })

    submittedInfo.value = {
      friendName: friendName.value.trim(),
      friendPhone: friendPhone.value.trim(),
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
</script>

<template>
  <div class="bg-[#111726]/80 border border-amber-500/30 rounded-[24px] p-5">

    <!-- ── Màn hình thành công ──────────────────────────────── -->
    <div v-if="submitSuccess" class="space-y-5 text-center py-2">
      <div class="text-5xl">✅</div>

      <div class="space-y-2">
        <h2 class="text-base font-black uppercase tracking-wide text-white">Đã gửi bằng chứng {{ bankLabel }}</h2>
        <p class="text-slate-400 text-sm not-italic normal-case font-medium leading-relaxed">
          Bằng chứng giới thiệu bạn bè APP {{ bankLabel }} đã được gửi.<br/>
          Vui lòng chờ admin kiểm tra và cộng xu.
        </p>
      </div>

      <div class="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 text-left space-y-3">
        <div class="flex items-center justify-between text-sm gap-3">
          <span class="text-slate-400 not-italic normal-case font-semibold shrink-0">Bạn bè</span>
          <span class="text-amber-300 font-black truncate">{{ submittedInfo.friendName }}</span>
        </div>
        <div class="flex items-center justify-between text-sm gap-3">
          <span class="text-slate-400 not-italic normal-case font-semibold shrink-0">SĐT bạn bè</span>
          <span class="text-white font-black">{{ submittedInfo.friendPhone }}</span>
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
                 bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          Xem lịch sử
        </button>
      </div>
    </div>

    <!-- ── Form nhập liệu ───────────────────────────────────── -->
    <div v-else class="space-y-4">
      <p class="text-[10px] text-amber-300 tracking-widest font-black italic uppercase">GỬI BẰNG CHỨNG {{ bankLabel }}</p>

      <div class="space-y-1.5">
        <label class="text-[10px] text-slate-400 tracking-widest not-italic normal-case font-semibold uppercase">Tên người bạn đã giới thiệu *</label>
        <input v-model="friendName" @input="clearError" type="text" placeholder="Tên bạn bè"
          class="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors not-italic normal-case font-medium" />
      </div>

      <div class="space-y-1.5">
        <label class="text-[10px] text-slate-400 tracking-widest not-italic normal-case font-semibold uppercase">Số điện thoại người bạn đã giới thiệu *</label>
        <input v-model="friendPhone" @input="clearError" type="tel" placeholder="VD: 0987654321"
          class="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors not-italic normal-case font-medium" />
      </div>

      <!-- Upload ảnh -->
      <div class="space-y-1.5">
        <label class="text-[10px] text-slate-400 tracking-widest not-italic normal-case font-semibold uppercase">Ảnh bằng chứng * (tối thiểu 3, tối đa 6 ảnh)</label>
        <p class="text-[11px] text-amber-400 not-italic normal-case font-medium">Vui lòng upload đủ 3 ảnh theo mẫu trong hướng dẫn.</p>

        <!-- Ảnh mẫu tham khảo -->
        <div class="grid grid-cols-3 gap-2 pt-1">
          <div v-for="(img, idx) in sampleImages" :key="idx" class="space-y-1">
            <div
              class="w-full aspect-[3/4] rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900 cursor-zoom-in group relative"
              @click="openZoom(img.src)">
              <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" :src="img.src" />
              <div class="absolute bottom-1 right-1 bg-black/70 backdrop-blur text-white text-[7px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">🔍 PHÓNG TO</div>
            </div>
            <p class="text-slate-500 text-[9px] not-italic normal-case text-center">{{ img.label }}</p>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div v-for="(preview, idx) in imagePreviews" :key="idx" class="relative aspect-square rounded-xl overflow-hidden border border-slate-700/60">
            <img :src="preview" class="w-full h-full object-cover" />
            <button @click="removeImage(idx)" type="button"
              class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center text-[10px]">✕</button>
          </div>
          <label v-if="imagePreviews.length < 6"
            class="aspect-square rounded-xl border-2 border-dashed border-slate-700/60 flex flex-col items-center justify-center cursor-pointer hover:border-amber-500/60 transition-colors">
            <span class="text-2xl text-slate-500">+</span>
            <span class="text-[9px] text-slate-500 not-italic normal-case">Thêm ảnh</span>
            <input type="file" accept="image/*" multiple class="hidden" @change="handleFileUpload" />
          </label>
        </div>
        <p v-if="isCompressing" class="text-[11px] text-amber-400 not-italic normal-case">Đang xử lý ảnh...</p>
      </div>

      <!-- Lỗi inline -->
      <div v-if="formError" class="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-3">
        <span class="text-red-400 text-base shrink-0 mt-0.5">⚠</span>
        <div>
          <p class="text-red-400 text-[11px] font-black uppercase tracking-wide not-italic">Thiếu thông tin</p>
          <p class="text-red-300/90 text-sm not-italic normal-case font-medium mt-0.5">{{ formError }}</p>
        </div>
      </div>

      <button
        @click="handleSubmit"
        :disabled="isBusy"
        class="w-full py-4 rounded-2xl text-sm tracking-widest font-black italic uppercase transition-all active:scale-95"
        :class="isBusy
          ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
          : 'bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-900 shadow-[0_0_20px_rgba(245,158,11,0.35)]'">
        {{ isCompressing ? 'ĐANG XỬ LÝ ẢNH...' : isSubmitting ? `ĐANG TẢI ẢNH ${uploadDone}/${uploadTotal}...` : `GỬI BẰNG CHỨNG ${bankLabel} 📤` }}
      </button>
    </div>

  </div>

  <!-- Xem ảnh mẫu lớn — z cao hơn ReferralProofModal (z-[99990]) để không bị che -->
  <Transition name="fade">
    <div class="fixed inset-0 z-[99995] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out" v-if="zoomImage" @click="closeZoom">
      <button class="absolute top-6 right-6 md:top-10 md:right-10 w-12 h-12 bg-slate-800 border border-slate-700 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors z-[99996] shadow-2xl" @click.stop="closeZoom">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
      <img class="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-[99996] cursor-default" :src="zoomImage" @click.stop />
    </div>
  </Transition>
</template>
