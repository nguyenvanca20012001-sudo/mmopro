<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth, db, storage } from '@/firebase'
import { onAuthStateChanged, signInAnonymously } from "firebase/auth"
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { collection, doc, setDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore"
import Swal from 'sweetalert2'
import exifr from 'exifr'
import { getJobStatus, proofSelectableJobs } from '@/composables/useVipJobs'
import type { ProofJob } from '@/composables/useVipJobs'
import { currentUserProfile, fetchUserProfileOnce } from '@/composables/useCurrentUser'

interface ProofImage {
  url: string
  path: string
  size: number
  contentType: string
}

const router = useRouter()
const route = useRoute()
const isLoggedIn = ref(false)
const userUid = ref('')
const showSuccessModal = ref(false)
const baseUrl = import.meta.env.BASE_URL

// Upload / compress state
const isCompressing = ref(false)
const submitPhase = ref<'' | 'validating' | 'uploading' | 'writing'>('')
const uploadDone = ref(0)
const uploadTotal = ref(0)
const isBusy = computed(() => isCompressing.value || submitPhase.value !== '')
const buttonText = computed(() => {
  if (isCompressing.value) return 'ĐANG XỬ LÝ ẢNH...'
  if (submitPhase.value === 'uploading') return `ĐANG TẢI ẢNH ${uploadDone.value}/${uploadTotal.value}...`
  if (submitPhase.value === 'writing') return 'ĐANG GỬI BẰNG CHỨNG...'
  if (submitPhase.value === 'validating') return 'ĐANG XỬ LÝ...'
  return 'XÁC NHẬN GỬI ĐƠN'
})

const selectedImage = ref<string | null>(null)
const openImage = (img: string) => { selectedImage.value = img }
const closeImage = () => { selectedImage.value = null }

const jobOptions = proofSelectableJobs

const jobSamples: Record<string, string[]> = {
  'mbbank': ['images/anh-abbank1.jpg', 'images/anh-abbank2.jpg', 'images/anh-abbank3.jpg'],
  'app-chung-khoan-4': ['images/anh-maybank2.jpg', 'images/anh-maybank3.jpg', 'images/anh-maybank4.jpg'],
  'vpbank': ['images/anh-vpbank2.jpg', 'images/anh-vpbank3.jpg', 'images/anh-vpbank6.jpg'],
  'msb-bank': ['images/anh-msb2.jpg', 'images/anh-msb3.jpg', 'images/anh-msb10.jpg'],
  'app-chung-khoan-2': ['images/anh-dnse2.jpg', 'images/anh-dnse3.jpg', 'images/anh-dnse10.jpg'],
  'app-chung-khoan-3': ['images/anh-kis1.jpg', 'images/anh-kis2.jpg', 'images/anh-kis10.jpg'],
  'liobank': ['images/anh-liobank3a.jpg', 'images/anh-liobank3b.jpg', 'images/anh-liobank4.jpg'],
  'lpbank-plus': ['anh-lpbank3.jpg', 'anh-lpbank2.jpg']
}

const selectedJob = ref<ProofJob | undefined>(jobOptions.value[0])
const fullName = ref('')
const phoneNumber = ref('')
const birthYear = ref('')
const birthMonth = ref('')
const exifData = ref<any>({ hasExif: false, suspicious: false })
const imageBlobs = ref<Blob[]>([])
const imagePreviews = ref<string[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

onUnmounted(() => {
  imagePreviews.value.forEach(url => URL.revokeObjectURL(url))
})

// Pre-warm anonymous auth so it's ready before user hits submit
const ensureAuth = async () => {
  if (!auth.currentUser) {
    try { await signInAnonymously(auth) } catch {}
  }
}

const applyUrlJob = () => {
  const jobId = route.query.job as string
  if (!jobId || selectedJob.value?.id === jobId) return
  const found = jobOptions.value.find(j => j.id === jobId)
  if (found) selectedJob.value = found
}

const prefilled = ref(false)

const prefillFromProfile = () => {
  if (prefilled.value) return
  const p = currentUserProfile.value
  if (!p) return
  if (!fullName.value && p.fullName) fullName.value = p.fullName
  if (!phoneNumber.value && p.phone) phoneNumber.value = p.phone
  if (!birthYear.value && p.dob) birthYear.value = p.dob
  prefilled.value = true
}

onMounted(() => {
  applyUrlJob()
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      isLoggedIn.value = true
      userUid.value = user.uid
      ensureAuth()
      await fetchUserProfileOnce(user.uid)
      prefillFromProfile()
    } else {
      router.push('/login')
    }
  })
})

// Fallback: profile may arrive via App.vue snapshot after auth resolves
const stopProfileWatch = watch(currentUserProfile, () => {
  if (!prefilled.value) {
    prefillFromProfile()
    stopProfileWatch()
  }
})

watch(() => route.query.job, applyUrlJob)

// Re-apply URL job after Firestore loads (VIP job may not be in vipJobConfigs at mount time)
watch(jobOptions, applyUrlJob)

// Reset selection if the selected job disappears from the list (e.g., admin pauses mid-session)
watch(jobOptions, (newOptions) => {
  if (selectedJob.value && !newOptions.find(j => j.id === selectedJob.value!.id)) {
    selectedJob.value = newOptions[0]
  }
})

const isFanpageTask = computed(() =>
  ['vpbank', 'msb-bank', 'app-chung-khoan', 'app-chung-khoan-2', 'app-chung-khoan-3', 'app-chung-khoan-4', 'liobank', 'mbbank'].includes(selectedJob.value.id)
)

const fourImageJobs: string[] = []
const threeImageJobs = ['vpbank', 'msb-bank', 'app-chung-khoan', 'app-chung-khoan-2', 'app-chung-khoan-3', 'app-chung-khoan-4', 'liobank', 'mbbank']
const twoImageJobs = ['lpbank-plus']

const imageRequirementText = computed(() => {
  const jobId = selectedJob.value.id
  if (fourImageJobs.includes(jobId)) return "YÊU CẦU BẮT BUỘC NỘP TỪ 4 ẢNH TRỞ LÊN (XEM MẪU BÊN DƯỚI)"
  if (threeImageJobs.includes(jobId)) return "YÊU CẦU BẮT BUỘC NỘP TỪ 3 ẢNH TRỞ LÊN (XEM MẪU BÊN DƯỚI)"
  if (twoImageJobs.includes(jobId)) return "YÊU CẦU BẮT BUỘC NỘP TỪ 2 ẢNH TRỞ LÊN (XEM MẪU BÊN DƯỚI)"
  return "TẢI LÊN ẢNH CHỤP MÀN HÌNH BẰNG CHỨNG XÁC THỰC"
})

const triggerFileInput = () => {
  if (!isBusy.value) fileInput.value?.click()
}

// Returns a webp Blob. Targets ~300-600KB; hard rejects if still >1MB after two passes.
// Quality 0.72 first pass: good balance for screenshots with text/QR at 1280px.
// Quality 0.55 second pass: emergency fallback for very large photos.
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
          // Second pass at lower quality if still over 1MB
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
    alert('⚠️ Bạn chỉ có thể gửi tối đa 6 ảnh bằng chứng.')
    target.value = ''
    return
  }

  isCompressing.value = true
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
      alert(`⚠️ LỖI ĐỊNH DẠNG: Bức ảnh "${file.name}" là ảnh HEIC của iPhone nên hệ thống không nhận diện được. Vui lòng CHỤP MÀN HÌNH lại bức ảnh đó rồi tải lên!`)
      continue
    }
    if (!file.type.startsWith('image/')) continue
    try {
      const blob = await compressImage(file)
      if (imageBlobs.value.length === 0) await readExif(file)
      imagePreviews.value.push(URL.createObjectURL(blob))
      imageBlobs.value.push(blob)
    } catch (err: any) {
      alert('⚠️ ' + (err.message || 'Lỗi khi xử lý ảnh'))
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

const readExif = async (file: File) => {
  try {
    const out = await exifr.parse(file, { pick: ['Make','Model','DateTimeOriginal','Software'] })
    if (!out) return
    const sw = out.Software || null
    exifData.value = {
      hasExif: true,
      device: [out.Make, out.Model].filter(Boolean).join(' ') || null,
      dateTaken: out.DateTimeOriginal ? String(out.DateTimeOriginal) : null,
      software: sw,
      suspicious: sw ? ['photoshop','gimp','lightroom','snapseed','picsart','ai','editor'].some(k => sw.toLowerCase().includes(k)) : false
    }
  } catch { exifData.value = { hasExif: false, suspicious: false } }
}

// Upload blobs in parallel batches of CONCURRENCY.
// Uses Promise.allSettled per batch so cleanup captures everything that completed
// even if one upload in the batch failed.
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
        // All uploads in this batch have settled — safe to cleanup everything uploaded so far
        await Promise.allSettled(uploadedPaths.map(p => deleteObject(storageRef(storage, p))))
        throw (failed as PromiseRejectedResult).reason
      }
    }
    return results
  } catch (err) {
    // Catch any error that escaped the batch loop (e.g. getDownloadURL failure)
    await Promise.allSettled(uploadedPaths.map(p => deleteObject(storageRef(storage, p))))
    throw err
  }
}

const submitReport = async () => {
  const jobStatus = getJobStatus(selectedJob.value.id)
  if (jobStatus === 'paused') {
    await Swal.fire({ icon: 'warning', title: 'TẠM DỪNG', text: 'Công việc đang tạm dừng, vui lòng quay lại sau.', confirmButtonColor: '#7c3aed' })
    return
  }
  if (jobStatus === 'soldout') {
    await Swal.fire({ icon: 'warning', title: 'HẾT LƯỢT', text: 'Công việc đã hết lượt hôm nay.', confirmButtonColor: '#7c3aed' })
    return
  }
  if (jobStatus === 'hidden') {
    await Swal.fire({ icon: 'error', title: 'KHÔNG KHẢ DỤNG', text: 'Công việc này không khả dụng.', confirmButtonColor: '#7c3aed' })
    return
  }

  if (!fullName.value || !phoneNumber.value || !birthYear.value || !birthMonth.value || imageBlobs.value.length === 0) {
    alert('⚠️ VUI LÒNG NHẬP ĐỦ THÔNG TIN VÀ TẢI ẢNH XÁC THỰC!')
    return
  }

  if (birthYear.value.toString().length !== 4) {
    alert('⚠️ VUI LÒNG NHẬP ĐÚNG NĂM SINH 4 SỐ (VD: 2000)!')
    return
  }

  if (fourImageJobs.includes(selectedJob.value.id) && imageBlobs.value.length < 4) {
    alert('⚠️ CHIẾN DỊCH NGÂN HÀNG TPBANK BẮT BUỘC PHẢI TẢI LÊN ÍT NHẤT 4 ẢNH MẪU!')
    return
  }

  if (threeImageJobs.includes(selectedJob.value.id) && imageBlobs.value.length < 3) {
    alert('⚠️ CHIẾN DỊCH NÀY BẮT BUỘC PHẢI TẢI LÊN ÍT NHẤT 3 ẢNH MẪU ĐỂ ĐỐI SOÁT!')
    return
  }

  if (twoImageJobs.includes(selectedJob.value.id) && imageBlobs.value.length < 2) {
    alert('⚠️ CHIẾN DỊCH NÀY BẮT BUỘC PHẢI TẢI LÊN ÍT NHẤT 2 ẢNH MẪU ĐỂ ĐỐI SOÁT!')
    return
  }

  submitPhase.value = 'validating'
  let uploadedPaths: string[] = []
  try {
    // Chặn spam: tối đa 3 đơn pending cùng lúc
    const qSpam = query(
      collection(db, "reports"),
      where("uid", "==", userUid.value),
      where("status", "==", "pending")
    )
    const snapshotSpam = await getDocs(qSpam)
    if (snapshotSpam.docs.length >= 3) {
      alert("⚠️ HỆ THỐNG TẠM KHÓA: Bạn đang có 3 đơn chờ duyệt. Vui lòng chờ Admin xử lý trước khi gửi thêm!")
      submitPhase.value = ''
      return
    }

    // Chặn làm lại: các job tương tác chỉ được làm 1 lần duy nhất
    const oneTimeJobs = ['view-tiktok', 'view-youtube', 'post-threads', 'seeding-vinfast', 'google-map', 'join-zalo']

    if (oneTimeJobs.includes(selectedJob.value.id)) {
      const [snapById, snapByName] = await Promise.all([
        getDocs(query(collection(db, "reports"), where("uid", "==", userUid.value), where("jobId", "==", selectedJob.value.id))),
        getDocs(query(collection(db, "reports"), where("uid", "==", userUid.value), where("jobName", "==", selectedJob.value!.title)))
      ])

      const seenIds = new Set<string>()
      const allDocs = [...snapById.docs, ...snapByName.docs].filter(doc => {
        if (seenIds.has(doc.id)) return false
        seenIds.add(doc.id)
        return true
      })

      const isPending = allDocs.some(doc => doc.data().status === 'pending')
      const isDone    = allDocs.some(doc => ['approved', 'collected'].includes(doc.data().status))

      if (isDone) {
        Swal.fire({
          icon: 'error',
          title: 'ĐÃ NHẬN THƯỞNG!',
          text: 'Mỗi tài khoản chỉ được phép làm công việc này 1 lần duy nhất! Đơn của bạn đã hoàn thành trước đó.',
          confirmButtonColor: '#3b82f6'
        })
        submitPhase.value = ''
        return
      }

      if (isPending) {
        Swal.fire({
          icon: 'warning',
          title: 'ĐANG CHỜ DUYỆT!',
          text: `Bạn đang có 1 đơn "${selectedJob.value!.title}" chờ duyệt rồi. Không thể nộp thêm!`,
          confirmButtonColor: '#f59e0b'
        })
        submitPhase.value = ''
        return
      }
    }

    // Ensure authenticated before uploading to Storage
    await ensureAuth()
    const uid = auth.currentUser!.uid

    // Pre-generate the Firestore doc ref so proofId matches the Storage path
    const reportRef = doc(collection(db, "reports"))

    uploadDone.value = 0
    uploadTotal.value = imageBlobs.value.length
    submitPhase.value = 'uploading'

    const proofImages = await uploadImagesToStorage(uid, reportRef.id, imageBlobs.value, (done, total) => {
      uploadDone.value = done
      uploadTotal.value = total
    })
    uploadedPaths = proofImages.map(p => p.path)

    submitPhase.value = 'writing'

    await setDoc(reportRef, {
      uid: userUid.value,
      jobId: selectedJob.value!.id,
      jobName: selectedJob.value!.title,
      jobTitleSnapshot: selectedJob.value!.title,
      reward: selectedJob.value!.reward,
      rewardSnapshot: selectedJob.value!.reward,
      fullName: fullName.value.toUpperCase(),
      phoneRef: phoneNumber.value,
      birthYear: birthYear.value,
      birthMonth: birthMonth.value,
      exif: exifData.value,
      proofImages,
      status: 'pending',
      createdAt: serverTimestamp()
    })

    imagePreviews.value.forEach(url => URL.revokeObjectURL(url))
    imageBlobs.value = []
    imagePreviews.value = []
    showSuccessModal.value = true
  } catch (error: any) {
    // If setDoc failed after upload succeeded, clean up orphaned Storage files
    if (uploadedPaths.length && !showSuccessModal.value) {
      await Promise.allSettled(uploadedPaths.map(p => deleteObject(storageRef(storage, p))))
    }
    alert('❌ LỖI HỆ THỐNG: ' + error.message)
  } finally {
    submitPhase.value = ''
    uploadDone.value = 0
    uploadTotal.value = 0
  }
}

const closeAndGoHome = () => {
  showSuccessModal.value = false
  router.push('/')
}

const goToVipSection = () => {
  showSuccessModal.value = false
  router.push({ path: '/', query: { section: 'vip' } })
}

const openFanpage = () => {
  window.open('https://www.facebook.com/mmopro123', '_blank')
  closeAndGoHome()
}
</script>

<template>
  <div class="min-h-screen bg-transparent py-10 px-4 md:px-0 flex flex-col items-center font-black italic uppercase relative text-left">

    <!-- ZOOM ẢNH -->
    <Transition name="fade">
      <div class="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out" v-if="selectedImage" @click="closeImage">
        <button class="absolute top-6 right-6 md:top-10 md:right-10 w-12 h-12 bg-blue-900 border border-blue-700 hover:bg-blue-700 rounded-full flex items-center justify-center text-white transition-colors z-[6010] shadow-2xl" @click.stop="closeImage">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
        <img class="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-[6005] cursor-default" :src="selectedImage" @click.stop />
      </div>
    </Transition>

    <div class="w-full max-w-xl relative animate-in fade-in slide-in-from-bottom-4 duration-700">
      <button @click="router.back()" class="text-slate-500 hover:text-blue-700 flex items-center gap-2 text-[10px] md:text-xs tracking-[3px] transition-colors mb-8">
        <span class="font-sans not-italic">✕</span> TRỞ LẠI
      </button>

      <h1 class="text-4xl md:text-6xl text-white tracking-tighter leading-none mb-10 drop-shadow-xl">
        NỘP <span class="text-blue-500">BẰNG CHỨNG</span>
      </h1>

      <div class="space-y-6 bg-[#111726] p-6 md:p-10 rounded-[30px] border border-slate-700/60 shadow-2xl">

        <div class="space-y-2 text-left relative z-10">
          <label class="text-blue-400 text-[11px] tracking-widest ml-1 font-black">CÔNG VIỆC HOÀN THÀNH</label>
          <div class="relative">
            <select
              v-model="selectedJob"
              :disabled="!!route.query.job"
              :class="['w-full bg-slate-800/60 border rounded-[20px] py-4 px-5 text-white outline-none appearance-none font-sans font-bold text-[14px] md:text-[15px] not-italic transition-all', !!route.query.job ? 'border-slate-700/80 text-emerald-400 bg-slate-800/60 cursor-not-allowed shadow-inner' : 'border-slate-700/60 focus:border-blue-500 cursor-pointer']"
            >
              <option v-for="job in jobOptions" :key="job.id" :value="job">{{ job.title }}</option>
            </select>
            <span v-if="!route.query.job" class="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs font-sans not-italic">⌄</span>
            <span v-else class="absolute right-5 top-1/2 -translate-y-1/2 text-emerald-500 text-lg font-sans not-italic font-black">✓</span>
          </div>
        </div>

        <div class="space-y-2 text-left mt-4">
          <label class="text-blue-400 text-[11px] tracking-widest ml-1 font-black">HỌ VÀ TÊN XÁC THỰC</label>
          <input
            v-model="fullName"
            type="text"
            placeholder="Nhập họ tên chính xác của bạn..."
            class="w-full bg-slate-800/60 border border-slate-700/60 focus:border-blue-500 rounded-[20px] py-4 px-5 text-white outline-none placeholder:text-slate-500 placeholder:normal-case font-sans not-italic font-semibold text-[15px] shadow-inner transition-colors"
          />
        </div>

        <div class="space-y-2 text-left">
          <label class="text-blue-400 text-[11px] tracking-widest ml-1 font-black">{{ selectedJob.id === 'app-chung-khoan-4' ? 'SĐT CỦA NGƯỜI ĐĂNG KÝ APP' : 'SĐT ĐỐI SOÁT' }}</label>
          <input
            v-model="phoneNumber"
            type="text"
            placeholder="Số điện thoại đăng ký / làm việc..."
            class="w-full bg-slate-800/60 border border-slate-700/60 focus:border-blue-500 rounded-[20px] py-4 px-5 text-white outline-none placeholder:text-slate-500 placeholder:normal-case font-sans not-italic font-semibold text-[15px] shadow-inner transition-colors"
          />
        </div>

        <div class="space-y-2 text-left">
          <label class="text-blue-400 text-[11px] tracking-widest ml-1 font-black">NĂM SINH NGƯỜI ĐĂNG KÝ</label>
          <input
            v-model="birthYear"
            type="number"
            placeholder="Năm sinh (VD: 2000)"
            class="w-full bg-slate-800/60 border border-slate-700/60 focus:border-blue-500 rounded-[20px] py-4 px-5 text-white outline-none placeholder:text-slate-500 placeholder:normal-case font-sans not-italic font-semibold text-[15px] shadow-inner transition-colors"
            @input="birthYear = birthYear ? String(birthYear).slice(0,4) : ''"
          />
        </div>

        <div class="space-y-1.5 text-left">
          <label class="text-blue-400 text-[10px] tracking-widest ml-1 font-black">THÁNG SINH</label>
          <select
            v-model="birthMonth"
            class="w-1/2 bg-slate-800/60 border border-slate-700/60 focus:border-blue-500 rounded-[18px] py-3 px-4 text-white outline-none font-sans not-italic font-semibold text-[13px] shadow-inner transition-colors appearance-none"
          >
            <option value="" disabled>Chọn tháng...</option>
            <option v-for="m in 12" :key="m" :value="String(m)">Tháng {{ m }}</option>
          </select>
        </div>

        <div class="space-y-2 text-left mt-2">
          <label class="text-blue-400 text-[11px] tracking-widest ml-1 font-black">HÌNH ẢNH XÁC THỰC VÀ ĐỐI CHIẾU MẪU</label>
          <div
            @click="triggerFileInput"
            class="w-full border-2 border-dashed border-slate-700/60 hover:border-blue-500/50 bg-slate-800/30 rounded-[30px] py-12 px-6 flex flex-col items-center justify-center cursor-pointer transition-all group"
          >
            <div class="text-4xl group-hover:scale-110 transition-transform mb-3">📸</div>
            <p :class="[
                 'text-[11px] md:text-[12px] tracking-widest transition-colors uppercase text-center leading-relaxed font-black',
                 fourImageJobs.includes(selectedJob.id) || threeImageJobs.includes(selectedJob.id) || twoImageJobs.includes(selectedJob.id)
                   ? 'text-rose-400'
                   : 'text-slate-400 group-hover:text-blue-700'
               ]">
              {{ isCompressing ? 'ĐANG XỬ LÝ ẢNH...' : imageRequirementText }}
            </p>
          </div>
          <input type="file" ref="fileInput" @change="handleFileUpload" multiple accept="image/jpeg, image/png, image/jpg" class="hidden" />

          <div v-if="jobSamples[selectedJob.id]" class="mt-4 p-4 bg-slate-800/40 border border-slate-700/60 rounded-2xl shadow-inner">
            <p class="text-[10px] md:text-[11px] text-yellow-400 font-black tracking-widest mb-3 uppercase italic leading-relaxed">
              ⚠️ Bạn phải gửi đủ {{ jobSamples[selectedJob.id].length }} ảnh mẫu này (Chạm để zoom to):
            </p>
            <div :class="['grid gap-2', jobSamples[selectedJob.id].length >= 4 ? 'grid-cols-4' : jobSamples[selectedJob.id].length === 2 ? 'grid-cols-2' : 'grid-cols-3']">
              <div v-for="(img, idx) in jobSamples[selectedJob.id]" :key="idx"
                   @click="openImage(baseUrl + img)"
                   class="relative rounded-xl overflow-hidden border border-slate-700/60 bg-slate-900 aspect-[3/4] cursor-zoom-in group hover:border-blue-500 transition-colors">
                <img class="w-full h-full object-cover group-hover:scale-105 transition-transform" :src="baseUrl + img" />
                <div class="absolute bottom-1 left-1 bg-black/70 backdrop-blur-sm text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">MẪU {{ idx + 1 }}</div>
              </div>
            </div>
          </div>

          <div v-if="imagePreviews.length > 0" class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <div v-for="(img, index) in imagePreviews" :key="index"
                 @click="openImage(img)"
                 class="relative group rounded-[18px] overflow-hidden border border-slate-700/60 bg-slate-800/40 aspect-square cursor-zoom-in">
              <img class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity bg-white" :src="img" />
              <button class="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500/80 hover:bg-red-600 rounded-full flex items-center justify-center text-white text-[10px] font-sans not-italic z-10 shadow-lg" @click.stop="removeImage(index)">✕</button>
            </div>
          </div>
        </div>

        <button
          @click="submitReport"
          :disabled="isBusy"
          class="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-[20px] text-xl font-black italic shadow-[0_10px_30px_rgba(37,99,235,0.3)] transition-all active:scale-95 disabled:opacity-50"
        >
          {{ buttonText }}
        </button>

      </div>
    </div>

    <!-- POPUP THÀNH CÔNG -->
    <Transition name="fade">
      <div class="fixed inset-0 z-[1000] flex items-center justify-center p-4 backdrop-blur-md" v-if="showSuccessModal">
        <div class="absolute inset-0 bg-black/80"></div>
        <div class="relative bg-white border border-blue-500/30 w-full max-w-sm rounded-[40px] p-8 text-center shadow-[0_0_50px_rgba(37,99,235,0.2)] animate-in zoom-in duration-300">
          <div class="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <span class="text-4xl">✅</span>
          </div>
          <h2 class="text-2xl text-slate-800 font-black italic tracking-tighter mb-2 uppercase">{{ isFanpageTask ? 'Gửi đơn thành công!' : 'Đã gửi bằng chứng' }}</h2>

          <div v-if="isFanpageTask">
            <p class="text-slate-400 text-[10px] normal-case font-bold leading-relaxed mb-6 italic uppercase">
              Bằng chứng đã được ghi nhận.<br/>
              Vui lòng <span class="text-[#1877F2] font-black">Nhắn tin Fanpage</span> để Admin duyệt đơn ngay nhé!
            </p>
            <button class="w-full bg-[#1877F2] flex items-center justify-center gap-2 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-[2px] hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-blue-900/40 mb-3" @click="openFanpage">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              NHẮN TIN FANPAGE
            </button>
            <button class="w-full bg-transparent text-slate-500 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[2px] hover:text-slate-700 transition-all" @click="closeAndGoHome">
              ĐỂ SAU
            </button>
          </div>

          <div v-else>
            <p class="text-slate-600 text-sm font-bold leading-relaxed mb-2">
              Bằng chứng của bạn đã được gửi thành công.<br/>
              Vui lòng chờ admin xét duyệt.
            </p>
            <div class="relative rounded-2xl border border-blue-400/30 bg-gradient-to-b from-blue-900/10 to-blue-900/5 p-4 mb-5">
              <p class="text-blue-500 text-[10px] font-black uppercase tracking-widest text-center mb-2">
                ⚡ Tham gia công việc VIP hôm nay
              </p>
              <p class="neon-blue text-center text-[22px] font-black leading-tight">
                Nhận thu nhập<br/>65.000 – 100.000 xu
              </p>
            </div>
            <button class="w-full bg-blue-600 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-[2px] hover:bg-blue-500 transition-all active:scale-95 shadow-lg shadow-blue-900/40 mb-3" @click="goToVipSection">
              👑 Tham khảo ngay
            </button>
            <button class="w-full bg-transparent text-slate-400 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[2px] hover:text-slate-600 transition-all" @click="closeAndGoHome">
              Đóng
            </button>
          </div>

        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

select {
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 1.5rem center;
  background-size: 0.8rem;
}
select:disabled { background-image: none; }

.neon-blue {
  color: #3b82f6;
  text-shadow: 0 0 8px rgba(59, 130, 246, 0.7), 0 0 20px rgba(59, 130, 246, 0.4);
}

input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
