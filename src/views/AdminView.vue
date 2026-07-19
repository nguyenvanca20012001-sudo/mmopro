<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { auth, db } from '@/firebase' 
import { onAuthStateChanged, signOut } from "firebase/auth" 
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDoc, documentId, increment, limit, startAfter, where, getDocs, addDoc, serverTimestamp, Timestamp, setDoc, runTransaction } from "firebase/firestore"
import Swal from 'sweetalert2'
import { jobsData } from '@/data/jobs'
import { useVipJobs, startVipJobsListener, VIP_JOB_IDS } from '@/composables/useVipJobs'
import { appConfig, startAppConfigListener, updateAppConfig } from '@/composables/useAppConfig'
import type { AppConfig } from '@/composables/useAppConfig'
import { supportConfig, startSupportConfigListener, updateSupportConfig } from '@/composables/useSupportConfig'
import type { SupportConfig } from '@/composables/useSupportConfig'
import { basicJobConfigs, startBasicJobConfigsListener } from '@/composables/useBasicJobConfigs'
import { dailyThreadsGuideConfig, startDailyThreadsGuideListener, updateDailyThreadsGuideConfig } from '@/composables/useDailyThreadsGuideConfig'
import { storage } from '@/firebase'
import { ref as storageRef, deleteObject } from 'firebase/storage'
import { normalizePhone } from '@/utils/phoneUtils'
import { getLpbankReferralRewardByCount } from '@/utils/lpbankReferral'
// @ts-ignore
import AdminDailyThreads from '@/components/AdminDailyThreads.vue'

const reports = ref<any[]>([])
const withdrawals = ref<any[]>([])
const dailyNotes = ref<any[]>([])
const usersMap = ref<Record<string, any>>({})

// Lazy-load user docs only for UIDs present in the current report/withdrawal batch.
// Avoids reading the entire users collection (was the biggest read offender).
// Firestore SDK v9+ supports up to 30 values per `in` query.
const USERS_BATCH_SIZE = 30
const ensureUsers = async (uids: string[]) => {
  const missing = [...new Set(uids)].filter(uid => !!uid && !usersMap.value[uid])
  if (!missing.length) return
  for (let i = 0; i < missing.length; i += USERS_BATCH_SIZE) {
    const batch = missing.slice(i, i + USERS_BATCH_SIZE)
    if (!batch.length) continue
    try {
      const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', batch)))
      if (import.meta.env.DEV) console.log('[Firestore] users batch docs:', snap.size)
      snap.docs.forEach(d => { usersMap.value[d.id] = d.data() })
    } catch {}
  }
}

// users/{report.uid} có thể không tồn tại nhưng user vẫn có ví thật dưới UID khác
// (VD: đăng ký lại, đổi thiết bị...). Trước khi coi là "chưa có hồ sơ", thử tìm theo
// SĐT để tránh admin tạo trùng ví cho user đã có sẵn.
const USER_PHONE_FIELDS = ['phoneRef', 'phone', 'phoneNormalized', 'submittedPhone']
const phoneMatchCache = ref<Record<string, { uid: string; data: any } | null>>({})

const findUserByPhone = async (normalizedPhone: string): Promise<{ uid: string; data: any } | null> => {
  if (!normalizedPhone) return null
  for (const field of USER_PHONE_FIELDS) {
    try {
      const snap = await getDocs(query(collection(db, 'users'), where(field, '==', normalizedPhone), limit(1)))
      const d = snap.docs[0]
      if (d) {
        return { uid: d.id, data: d.data() }
      }
    } catch { /* field có thể chưa được index/tồn tại — thử field kế tiếp */ }
  }
  return null
}

// Chạy nền cho danh sách report đang hiển thị: report nào thiếu users/{uid} thì tra
// trước theo SĐT và cache theo SĐT đã chuẩn hoá, để template hiển thị ngay khi có kết quả.
const ensurePhoneFallback = async (reportList: any[]) => {
  const candidates = reportList.filter(r => r.uid && !usersMap.value[r.uid] && !r.repairedUserUid)
  for (const rp of candidates) {
    const normalized = normalizePhone(rp.phoneRef || rp.phone || rp.submittedPhone)
    if (!normalized || phoneMatchCache.value[normalized] !== undefined) continue
    phoneMatchCache.value[normalized] = await findUserByPhone(normalized)
  }
}
const isLoading = ref(true)
const isCheckingAuth = ref(true)
const withdrawalsError = ref('')
const router = useRouter()

const activeTab = ref('app_jobs') // 'app_jobs' | 'other_jobs' | 'withdrawals' | 'vip_jobs_config' | 'web_config' | 'support_config' | 'basic_jobs_config'
const statusFilter = ref('pending')

// ============================================================================
// VIP JOBS CONFIG — Quản lý metadata VIP jobs realtime từ Firestore
// Listener là singleton (module-scope) — không tạo listener mới nếu đã chạy
// ============================================================================
const { vipJobConfigs } = useVipJobs()
const vipJobEdits = ref<Record<string, any>>({})

const initVipJobEdit = (id: string, firestoreData: Record<string, any>) => {
  const config = firestoreData[id] || {}
  const staticJob = jobsData[id] || {}
  vipJobEdits.value[id] = {
    title:          config.title          !== undefined ? config.title          : (staticJob.title   || ''),
    reward:         config.reward         !== undefined ? config.reward         : (staticJob.reward  || ''),
    badge:          config.badge          !== undefined ? config.badge          : (staticJob.badge   || ''),
    warning:        config.warning        !== undefined ? config.warning        : (staticJob.warning || ''),
    order:          config.order          !== undefined ? config.order          : 0,
    status:         config.status         !== undefined ? config.status         : 'open',
    ageRequirement: config.ageRequirement !== undefined ? config.ageRequirement : (staticJob.ageRequirement ?? null),
  }
}

// Đồng bộ form edits khi composable nhận data từ Firestore
watch(vipJobConfigs, (configs) => {
  VIP_JOB_IDS.forEach(id => initVipJobEdit(id, configs))
}, { immediate: true })

const saveVipJobConfig = async (id: string) => {
  const edit = vipJobEdits.value[id]
  if (!edit) return
  try {
    await setDoc(doc(db, 'vip_jobs', id), {
      title:          edit.title,
      reward:         edit.reward,
      badge:          edit.badge,
      warning:        edit.warning,
      order:          Number(edit.order) || 0,
      status:         edit.status,
      ageRequirement: (edit.ageRequirement !== null && edit.ageRequirement !== '') ? Number(edit.ageRequirement) : null,
      updatedAt:      serverTimestamp(),
    }, { merge: true })
    await Swal.fire({ icon: 'success', title: 'ĐÃ LƯU!', text: `Cấu hình "${id}" đã cập nhật realtime.`, timer: 1500, showConfirmButton: false })
  } catch (e) {
    Swal.fire('Lỗi!', String(e), 'error')
  }
}

const seedMissingVipJobs = async () => {
  const missing = VIP_JOB_IDS.filter(id => !vipJobConfigs.value[id])
  if (missing.length === 0) {
    await Swal.fire({ icon: 'info', title: 'Không có job thiếu', text: 'Tất cả job VIP đã có trong Firestore.', timer: 2000, showConfirmButton: false })
    return
  }
  try {
    for (const id of missing) {
      const staticJob = (jobsData[id] || {}) as any
      await setDoc(doc(db, 'vip_jobs', id), {
        title:          staticJob.title  || id,
        reward:         staticJob.reward || '',
        badge:          staticJob.badge  || '',
        warning:        staticJob.warning || '',
        order:          99,
        status:         'hidden',
        ageRequirement: staticJob.ageRequirement ?? null,
        updatedAt:      serverTimestamp(),
      }, { merge: true })
    }
    await Swal.fire({ icon: 'success', title: 'ĐÃ SEED!', text: `Đã tạo ${missing.length} job: ${missing.join(', ')}`, timer: 3000, showConfirmButton: false })
  } catch (e) {
    Swal.fire('Lỗi!', String(e), 'error')
  }
}

// ============================================================================
// WEB CONFIG — Quản lý app_config/overall realtime
// webConfigEdit là bản local của form; watch(appConfig) sync khi Firestore cập nhật
// ============================================================================
const webConfigEdit = ref<AppConfig>({ ...appConfig.value, appVersion: Number(appConfig.value.appVersion) || 1 })
const isSavingWebConfig = ref(false)

// immediate: true đảm bảo sync ngay khi component mount, không bị trống nếu snapshot đã fired trước
watch(appConfig, (cfg) => {
  webConfigEdit.value = { ...cfg, appVersion: Number(cfg.appVersion) || 1 }
}, { deep: true, immediate: true })

const saveWebConfig = async () => {
  isSavingWebConfig.value = true
  try {
    await updateAppConfig({ ...webConfigEdit.value })
    await Swal.fire({ icon: 'success', title: 'ĐÃ LƯU!', text: 'Cấu hình web đã cập nhật realtime.', timer: 1500, showConfirmButton: false })
  } catch (e) {
    Swal.fire('Lỗi!', String(e), 'error')
  } finally {
    isSavingWebConfig.value = false
  }
}

const incrementVersion = () => {
  webConfigEdit.value.appVersion = (webConfigEdit.value.appVersion || 1) + 1
}

// ============================================================================
// SUPPORT CONFIG — Quản lý support_config/overall realtime
// ============================================================================
const supportConfigEdit = ref<SupportConfig>({ ...supportConfig.value })
const isSavingSupportConfig = ref(false)

watch(supportConfig, (cfg) => {
  supportConfigEdit.value = { ...cfg }
}, { deep: true, immediate: true })

const incrementSupportVersion = () => {
  supportConfigEdit.value.announcementVersion = (supportConfigEdit.value.announcementVersion || 1) + 1
}

const saveSupportConfig = async () => {
  isSavingSupportConfig.value = true
  try {
    await updateSupportConfig({ ...supportConfigEdit.value })
    await Swal.fire({ icon: 'success', title: 'ĐÃ LƯU!', text: 'Cấu hình hỗ trợ đã cập nhật realtime.', timer: 1500, showConfirmButton: false })
  } catch (e: any) {
    const msg = e?.code === 'permission-denied'
      ? 'Lỗi: Không có quyền ghi. Kiểm tra Firestore Rules.'
      : String(e)
    Swal.fire('Lỗi!', msg, 'error')
  } finally {
    isSavingSupportConfig.value = false
  }
}

// ============================================================================
// BASIC JOB CONFIGS — Cấu hình nội dung bài đăng Threads
// ============================================================================
const basicPostContents = ref<string[]>(Array(10).fill(''))
const isSavingBasicContents = ref(false)

// ============================================================================
// DAILY THREADS GUIDE CONFIG — popup "XEM HƯỚNG DẪN" của job Đăng Bài Threads Hằng Ngày
// Doc: app_config/daily_threads_guide — { contents[10], postImages[10], qrImage }
// ============================================================================
const guideContents = ref<string[]>(Array(10).fill(''))
const guideImages = ref<string[]>(Array(10).fill(''))
const guideQrImage = ref('')
const isSavingGuideConfig = ref(false)

watch(activeTab, (tab) => {
  if (tab === 'basic_jobs_config') {
    const cfg = basicJobConfigs.value['post-threads']
    if (cfg?.postContents?.length) {
      const padded = [...cfg.postContents, ...Array(10).fill('')].slice(0, 10)
      basicPostContents.value = padded
    } else {
      basicPostContents.value = Array(10).fill('')
    }

    const guideCfg = dailyThreadsGuideConfig.value
    guideContents.value = [...guideCfg.contents, ...Array(10).fill('')].slice(0, 10)
    guideImages.value = [...guideCfg.postImages, ...Array(10).fill('')].slice(0, 10)
    guideQrImage.value = guideCfg.qrImage || ''
  }
}, { immediate: false })

const saveBasicPostContents = async () => {
  isSavingBasicContents.value = true
  try {
    await setDoc(doc(db, 'basic_job_configs', 'post-threads'), {
      jobId: 'post-threads',
      postContents: basicPostContents.value,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    await Swal.fire({ icon: 'success', title: 'ĐÃ LƯU!', text: 'Nội dung bài đăng đã được cập nhật.', timer: 1500, showConfirmButton: false })
  } catch (e: any) {
    Swal.fire('Lỗi!', String(e), 'error')
  } finally {
    isSavingBasicContents.value = false
  }
}

const saveDailyThreadsGuideConfig = async () => {
  if (!guideContents.value.some(c => c?.trim())) {
    Swal.fire('Chú ý', 'Cần ít nhất 1 nội dung bài đăng không rỗng.', 'warning')
    return
  }
  isSavingGuideConfig.value = true
  try {
    await updateDailyThreadsGuideConfig({
      contents: guideContents.value,
      postImages: guideImages.value,
      qrImage: guideQrImage.value.trim(),
    })
    await Swal.fire({ icon: 'success', title: 'ĐÃ LƯU!', text: 'Cấu hình hướng dẫn Threads hằng ngày đã cập nhật realtime.', timer: 1500, showConfirmButton: false })
  } catch (e: any) {
    Swal.fire('Lỗi!', String(e), 'error')
  } finally {
    isSavingGuideConfig.value = false
  }
}


const statusLabels: Record<string, string> = {
  open:    '✅ Mở',
  paused:  '⏸ Tạm dừng',
  hidden:  '🚫 Ẩn',
  soldout: '❌ Hết lượt',
}

const selectedImage = ref<string | null>(null)
const openImage = (img: string) => { selectedImage.value = img }
const closeImage = () => { selectedImage.value = null }

const getImageUrls = (rp: any): string[] => {
  if (rp.proofImages?.length) return rp.proofImages.map((p: any) => p.url)
  return rp.images ?? []
}

// ============================================================================
// STORAGE CLEANUP — quét theo lô nhỏ (30 đơn/lô), có chế độ tự động
// ============================================================================
const STORAGE_SCAN_BATCH_SIZE = 30
const STORAGE_SCAN_TIMEOUT_MS = 15000
const NORMALIZE_BATCH_SIZE = 30
const STORAGE_CLEANUP_PROGRESS_KEY = 'storage_cleanup_progress'

interface StorageCandidate {
  reportId: string
  type: 'basic' | 'vip'
  imagePaths: string[]
  report: any
}

interface StorageCleanupProgress {
  mode: 'normalize' | 'clean'
  scanned: number
  normalized: number
  cleanedReports: number
  deletedFiles: number
  skippedNoImages: number
  skippedAlreadyNormalized: number
  skippedPending: number
  skippedVipNotOldEnough: number
  errors: number
  batchNumber: number
  lastDocId: string | null
  lastCreatedAt: number | null
  isPaused: boolean
  isDone: boolean
  updatedAt: number
}

interface StorageCleanResult {
  checkedReports: number
  pendingSkipped: number
  basicReportCount: number
  vipReportCount: number
  vipTooNewSkipped: number
  totalImageCount: number
  hasMore: boolean
}

type CleanVerdict =
  | { eligible: false; reason: 'already-cleaned' | 'no-images' | 'pending' | 'unprocessed' | 'vip-too-new' }
  | { eligible: true; type: 'basic' | 'vip'; imagePaths: string[] }

const storageCleanupCandidates = ref<StorageCandidate[]>([])
const storageCleanupResult = ref<StorageCleanResult | null>(null)
const lastCleanupDocId = ref<string | null>(null)
const isCheckingStorageCleanup = ref(false)
const isDeletingStorage = ref(false)
const storageCleanupError = ref('')
const storageCleanupProgress = ref('')

// Mặc định BẬT chạy thử để tránh xoá nhầm — admin phải chủ động tắt + xác nhận mới xoá thật.
const isDryRun = ref(true)
const isAutoRunning = ref(false)
const isAutoPaused = ref(false)
const autoStopRequested = ref(false)
const autoRoundCount = ref(0)
const autoStats = ref({ checked: 0, deletedImages: 0, cleanedReports: 0, pendingSkipped: 0, vipNotOldEnough: 0, errors: 0 })
const autoLogs = ref<string[]>([])
const AUTO_LOG_LIMIT = 100

const normalizeLastDocId = ref<string | null>(null)
const isNormalizing = ref(false)
const isNormalizePaused = ref(false)
const normalizeStopRequested = ref(false)
const normalizeBatchCount = ref(0)
const normalizeProgress = ref('')
const normalizeStats = ref({ scanned: 0, normalized: 0, skippedNoImages: 0, skippedAlreadyNormalized: 0, errors: 0 })

// ---- localStorage progress (chống mất tiến trình khi tab crash/reload) ----
const saveCleanupProgress = (progress: StorageCleanupProgress) => {
  try {
    localStorage.setItem(STORAGE_CLEANUP_PROGRESS_KEY, JSON.stringify(progress))
  } catch (e) {
    console.warn('Save cleanup progress failed:', e)
  }
}

const loadCleanupProgress = (): StorageCleanupProgress | null => {
  try {
    const raw = localStorage.getItem(STORAGE_CLEANUP_PROGRESS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const clearCleanupProgress = () => {
  try { localStorage.removeItem(STORAGE_CLEANUP_PROGRESS_KEY) } catch {}
}

const persistCleanProgress = (isDone: boolean) => {
  saveCleanupProgress({
    mode: 'clean',
    scanned: autoStats.value.checked,
    normalized: 0,
    cleanedReports: autoStats.value.cleanedReports,
    deletedFiles: autoStats.value.deletedImages,
    skippedNoImages: 0,
    skippedAlreadyNormalized: 0,
    skippedPending: autoStats.value.pendingSkipped,
    skippedVipNotOldEnough: autoStats.value.vipNotOldEnough,
    errors: autoStats.value.errors,
    batchNumber: autoRoundCount.value,
    lastDocId: lastCleanupDocId.value,
    lastCreatedAt: null,
    isPaused: isAutoPaused.value,
    isDone,
    updatedAt: Date.now(),
  })
}

const persistNormalizeProgress = (isDone: boolean) => {
  saveCleanupProgress({
    mode: 'normalize',
    scanned: normalizeStats.value.scanned,
    normalized: normalizeStats.value.normalized,
    cleanedReports: 0,
    deletedFiles: 0,
    skippedNoImages: normalizeStats.value.skippedNoImages,
    skippedAlreadyNormalized: normalizeStats.value.skippedAlreadyNormalized,
    skippedPending: 0,
    skippedVipNotOldEnough: 0,
    errors: normalizeStats.value.errors,
    batchNumber: normalizeBatchCount.value,
    lastDocId: normalizeLastDocId.value,
    lastCreatedAt: null,
    isPaused: isNormalizePaused.value,
    isDone,
    updatedAt: Date.now(),
  })
}

const initialSavedCleanupProgress = loadCleanupProgress()
const resumeBanner = ref<StorageCleanupProgress | null>(
  initialSavedCleanupProgress && !initialSavedCleanupProgress.isDone ? initialSavedCleanupProgress : null
)

const resumeCleanupFromSaved = () => {
  const p = resumeBanner.value
  if (!p) return
  if (p.mode === 'clean') {
    lastCleanupDocId.value = p.lastDocId
    autoRoundCount.value = p.batchNumber
    autoStats.value = {
      checked: p.scanned,
      deletedImages: p.deletedFiles,
      cleanedReports: p.cleanedReports,
      pendingSkipped: p.skippedPending,
      vipNotOldEnough: p.skippedVipNotOldEnough,
      errors: p.errors,
    }
    resumeBanner.value = null
    startAutoCleanup()
  } else {
    normalizeLastDocId.value = p.lastDocId
    normalizeBatchCount.value = p.batchNumber
    normalizeStats.value = {
      scanned: p.scanned,
      normalized: p.normalized,
      skippedNoImages: p.skippedNoImages,
      skippedAlreadyNormalized: p.skippedAlreadyNormalized,
      errors: p.errors,
    }
    resumeBanner.value = null
    startNormalizeAuto()
  }
}

const restartCleanupFromScratch = () => {
  const mode = resumeBanner.value?.mode
  if (mode === 'clean') {
    lastCleanupDocId.value = null
    autoRoundCount.value = 0
    autoStats.value = { checked: 0, deletedImages: 0, cleanedReports: 0, pendingSkipped: 0, vipNotOldEnough: 0, errors: 0 }
  } else if (mode === 'normalize') {
    normalizeLastDocId.value = null
    normalizeBatchCount.value = 0
    normalizeStats.value = { scanned: 0, normalized: 0, skippedNoImages: 0, skippedAlreadyNormalized: 0, errors: 0 }
    normalizeProgress.value = ''
  }
  clearCleanupProgress()
  resumeBanner.value = null
}

const discardSavedCleanupProgress = () => {
  clearCleanupProgress()
  resumeBanner.value = null
}

const isOlderThan7Days = (createdAt: any): boolean => {
  const createdMs: number = createdAt?.toMillis?.() ?? 0
  return Date.now() - createdMs > 7 * 24 * 60 * 60 * 1000
}

const getAgeDays = (createdAt: any): number | null => {
  const createdMs: number = createdAt?.toMillis?.() ?? 0
  if (!createdMs) return null
  return Math.floor((Date.now() - createdMs) / (24 * 60 * 60 * 1000))
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const randomDelay = () => 500 + Math.random() * 500

const appendAutoLog = (msg: string) => {
  const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  autoLogs.value.unshift(`[${time}] ${msg}`)
  if (autoLogs.value.length > AUTO_LOG_LIMIT) autoLogs.value.length = AUTO_LOG_LIMIT
}

const clearAutoLogs = () => { autoLogs.value = [] }

const resetStorageCleanup = () => {
  lastCleanupDocId.value = null
  storageCleanupCandidates.value = []
  storageCleanupResult.value = null
  storageCleanupError.value = ''
  storageCleanupProgress.value = ''
  autoRoundCount.value = 0
  autoStats.value = { checked: 0, deletedImages: 0, cleanedReports: 0, pendingSkipped: 0, vipNotOldEnough: 0, errors: 0 }
  if (loadCleanupProgress()?.mode === 'clean') clearCleanupProgress()
}

// Quyết định 1 report có được dọn ảnh hay không, và thuộc loại nào.
// pending => không xoá; job cơ bản đã xử lý => xoá được; VIP đã xử lý & > 7 ngày => xoá được.
const canCleanReport = (report: any): CleanVerdict => {
  if (report.imagesDeleted === true || report.storageCleaned === true) return { eligible: false, reason: 'already-cleaned' }

  const proofImages = Array.isArray(report.proofImages)
    ? report.proofImages.filter((img: any) => img && img.path)
    : []
  if (!proofImages.length) return { eligible: false, reason: 'no-images' }

  const status = String(report.status || '').toLowerCase()
  const isPending = status === 'pending' || status === 'waiting' || status === 'submitted' || status.includes('chờ')
  if (isPending) return { eligible: false, reason: 'pending' }

  const isProcessed = status === 'approved' || status === 'rejected' || status === 'collected' || status === 'paid'
  if (!isProcessed) return { eligible: false, reason: 'unprocessed' }

  const imagePaths = proofImages.map((img: any) => img.path)
  if (isAppJob(report.jobName)) {
    if (!isOlderThan7Days(report.createdAt)) return { eligible: false, reason: 'vip-too-new' }
    return { eligible: true, type: 'vip', imagePaths }
  }
  return { eligible: true, type: 'basic', imagePaths }
}

// Quét 1 lô (tối đa STORAGE_SCAN_BATCH_SIZE đơn) bắt đầu từ lastCleanupDocId, có timeout riêng.
// Cursor là document ID (string) thay vì DocumentSnapshot — phục vụ lưu/khôi phục qua localStorage.
const scanNextBatch = async (): Promise<StorageCleanResult & { candidates: StorageCandidate[] }> => {
  const q = lastCleanupDocId.value
    ? query(collection(db, 'reports'), where('storageCleaned', '==', false), orderBy(documentId()), startAfter(lastCleanupDocId.value), limit(STORAGE_SCAN_BATCH_SIZE))
    : query(collection(db, 'reports'), where('storageCleaned', '==', false), orderBy(documentId()), limit(STORAGE_SCAN_BATCH_SIZE))

  let snap
  try {
    snap = await Promise.race([
      getDocs(q),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Firestore query quá ${STORAGE_SCAN_TIMEOUT_MS / 1000} giây, vui lòng thử lại.`)), STORAGE_SCAN_TIMEOUT_MS)
      )
    ])
  } catch (e: any) {
    if (e?.code === 'failed-precondition' || /requires an index/i.test(e?.message || '')) {
      throw new Error('Firestore cần tạo composite index cho truy vấn này. Mở Console (F12) để lấy link tạo index tự động, hoặc bấm "🧮 Chuẩn hoá dữ liệu cũ" trước nếu chưa chạy.')
    }
    throw e
  }

  const candidates: StorageCandidate[] = []
  let checkedReports = 0
  let pendingSkipped = 0
  let basicReportCount = 0
  let vipReportCount = 0
  let vipTooNewSkipped = 0
  let totalImageCount = 0

  for (const docSnap of snap.docs) {
    checkedReports++
    const report: any = { id: docSnap.id, ...docSnap.data() }
    const verdict = canCleanReport(report)

    if (!verdict.eligible) {
      if (verdict.reason === 'pending') pendingSkipped++
      if (verdict.reason === 'vip-too-new') vipTooNewSkipped++
      continue
    }

    candidates.push({ reportId: report.id, type: verdict.type, imagePaths: verdict.imagePaths, report })
    if (verdict.type === 'vip') vipReportCount++
    else basicReportCount++
    totalImageCount += verdict.imagePaths.length
  }

  const lastDocSnap = snap.docs[snap.docs.length - 1]
  if (lastDocSnap) {
    lastCleanupDocId.value = lastDocSnap.id
  }

  return {
    candidates,
    checkedReports,
    pendingSkipped,
    basicReportCount,
    vipReportCount,
    vipTooNewSkipped,
    totalImageCount,
    hasMore: snap.size === STORAGE_SCAN_BATCH_SIZE,
  }
}

// Xoá ảnh Storage cho danh sách candidates rồi đánh dấu report đã dọn.
// Lỗi từng file không làm dừng cả batch; object-not-found coi như đã xoá.
// An toàn: kiểm tra lại canCleanReport(report) ngay trước khi xoá (không chỉ tin candidates đã lọc sẵn ở scanNextBatch).
const deleteCandidatesBatch = async (candidates: StorageCandidate[], dryRun: boolean) => {
  let deletedImages = 0
  let cleanedReports = 0
  let errors = 0

  for (const candidate of candidates) {
    const report = candidate.report
    const verdict = canCleanReport(report)
    const canClean = verdict.eligible
    const isVipJob = isAppJob(report.jobName)
    const ageDays = getAgeDays(report.createdAt)

    console.log('Cleaning report:', {
      id: report.id,
      status: report.status,
      jobId: report.jobId,
      jobName: report.jobName,
      isVipJob,
      ageDays,
      canClean,
    })

    const status = String(report.status || '').toLowerCase()
    const isPendingStatus = status === 'pending' || status === 'waiting' || status === 'submitted' || status.includes('chờ')
    if (isPendingStatus && canClean) {
      throw new Error(`AN TOÀN: report ${report.id} đang ở status pending nhưng canCleanReport() báo có thể xoá — dừng dọn ngay lập tức để kiểm tra lại logic, không xoá bất kỳ ảnh nào thêm.`)
    }

    if (!canClean) {
      console.warn('Skip cleaning (canCleanReport=false):', report.id, verdict.reason)
      continue
    }

    if (dryRun) {
      deletedImages += candidate.imagePaths.length
      cleanedReports++
      continue
    }

    let deletedCount = 0
    for (const path of candidate.imagePaths) {
      try {
        await deleteObject(storageRef(storage, path))
        deletedCount++
      } catch (e: any) {
        if (e?.code === 'storage/object-not-found') {
          deletedCount++
        } else {
          errors++
          console.warn('Storage delete warn:', candidate.reportId, path, e)
        }
      }
    }
    deletedImages += deletedCount

    try {
      await updateDoc(doc(db, 'reports', candidate.reportId), {
        imagesDeleted: true,
        imagesDeletedAt: serverTimestamp(),
        storageCleaned: true,
        proofImagesCleaned: true,
        proofImagesDeletedCount: deletedCount,
        proofImageCountBeforeClean: candidate.imagePaths.length,
      })
      cleanedReports++
    } catch (e) {
      errors++
      console.warn('Update report failed:', candidate.reportId, e)
    }
  }

  return { deletedImages, cleanedReports, errors }
}

const scanStorageImages = async () => {
  isCheckingStorageCleanup.value = true
  storageCleanupCandidates.value = []
  storageCleanupResult.value = null
  storageCleanupError.value = ''
  storageCleanupProgress.value = 'Đang kiểm tra...'

  try {
    const batch = await scanNextBatch()
    autoRoundCount.value++
    autoStats.value.checked += batch.checkedReports
    autoStats.value.pendingSkipped += batch.pendingSkipped
    autoStats.value.vipNotOldEnough += batch.vipTooNewSkipped
    storageCleanupCandidates.value = batch.candidates
    storageCleanupResult.value = {
      checkedReports: batch.checkedReports,
      pendingSkipped: batch.pendingSkipped,
      basicReportCount: batch.basicReportCount,
      vipReportCount: batch.vipReportCount,
      vipTooNewSkipped: batch.vipTooNewSkipped,
      totalImageCount: batch.totalImageCount,
      hasMore: batch.hasMore,
    }
    storageCleanupProgress.value = `Đã kiểm tra ${batch.checkedReports} đơn trong lô này.`
    persistCleanProgress(!batch.hasMore)
  } catch (e: any) {
    console.error('Scan storage images failed:', e)
    storageCleanupError.value = e?.message || 'Kiểm tra thất bại.'
    storageCleanupProgress.value = ''
  } finally {
    isCheckingStorageCleanup.value = false
  }
}

const confirmDeleteImages = async () => {
  if (!storageCleanupResult.value || storageCleanupCandidates.value.length === 0) return
  const { isConfirmed } = await Swal.fire({
    title: isDryRun.value ? 'Chạy thử xoá ảnh lô này?' : 'Xác nhận XOÁ THẬT ảnh?',
    text: isDryRun.value
      ? `Chế độ chạy thử — sẽ không xoá ảnh thật, chỉ thống kê ${storageCleanupResult.value.totalImageCount} ảnh.`
      : `Bạn đang chuẩn bị XOÁ THẬT ${storageCleanupResult.value.totalImageCount} ảnh trong Firebase Storage. Ảnh đã xoá sẽ không khôi phục được. Tiếp tục?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: isDryRun.value ? 'Chạy thử' : 'Xoá ảnh',
    cancelButtonText: 'Huỷ',
    confirmButtonColor: '#dc2626',
  })
  if (!isConfirmed) return

  const wasLastBatch = !storageCleanupResult.value.hasMore
  isDeletingStorage.value = true
  try {
    const result = await deleteCandidatesBatch(storageCleanupCandidates.value, isDryRun.value)
    autoStats.value.deletedImages += result.deletedImages
    autoStats.value.cleanedReports += result.cleanedReports
    autoStats.value.errors += result.errors
    persistCleanProgress(wasLastBatch)
    await Swal.fire('Xong!', `${isDryRun.value ? 'Chạy thử: sẽ xoá' : 'Đã xoá'} ${result.deletedImages} ảnh khỏi Storage.`, 'success')
    storageCleanupCandidates.value = []
    storageCleanupResult.value = null
    storageCleanupProgress.value = ''
  } catch (e) {
    Swal.fire('Lỗi khi xoá', String(e), 'error')
  } finally {
    isDeletingStorage.value = false
  }
}

// ============================================================================
// CHUẨN HOÁ DỮ LIỆU CŨ — set storageCleaned=false cho đơn có ảnh nhưng chưa có field
// (chạy theo lô nhỏ 30 đơn, cursor bền vững qua các lần gọi để timeout không mất tiến trình)
// ============================================================================
const normalizeNextBatch = async () => {
  normalizeBatchCount.value++
  console.log('Normalize batch start:', { batchNumber: normalizeBatchCount.value, lastDocId: normalizeLastDocId.value, batchSize: NORMALIZE_BATCH_SIZE })

  const q = normalizeLastDocId.value
    ? query(collection(db, 'reports'), orderBy(documentId()), startAfter(normalizeLastDocId.value), limit(NORMALIZE_BATCH_SIZE))
    : query(collection(db, 'reports'), orderBy(documentId()), limit(NORMALIZE_BATCH_SIZE))

  const snap = await Promise.race([
    getDocs(q),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Firestore query quá ${STORAGE_SCAN_TIMEOUT_MS / 1000} giây, vui lòng thử lại.`)), STORAGE_SCAN_TIMEOUT_MS)
    )
  ])

  let scanned = 0
  let normalized = 0
  let skippedNoImages = 0
  let skippedAlreadyNormalized = 0
  let errors = 0

  const updates: Promise<void>[] = []

  for (const docSnap of snap.docs) {
    scanned++
    const data: any = docSnap.data()
    const proofImages = Array.isArray(data.proofImages) ? data.proofImages : []

    if (!proofImages.length) { skippedNoImages++; continue }
    if (typeof data.storageCleaned !== 'undefined') { skippedAlreadyNormalized++; continue }

    const fields = data.imagesDeleted === true
      ? { storageCleaned: true, proofImagesCleaned: true }
      : {
          storageCleaned: false,
          proofImagesCleaned: false,
          proofImageCountBeforeClean: proofImages.length,
          normalizedForStorageCleanAt: serverTimestamp(),
        }

    updates.push(
      updateDoc(docSnap.ref, fields)
        .then(() => { normalized++ })
        .catch((e) => {
          errors++
          console.warn('Normalize document failed:', docSnap.id, e)
        })
    )
  }

  await Promise.allSettled(updates)

  const lastNormalizeDocSnap = snap.docs[snap.docs.length - 1]
  if (lastNormalizeDocSnap) {
    normalizeLastDocId.value = lastNormalizeDocSnap.id
  }

  const result = { scanned, normalized, skippedNoImages, skippedAlreadyNormalized, errors, hasMore: snap.size === NORMALIZE_BATCH_SIZE }
  console.log('Normalize batch result:', result)
  return result
}

const startNormalizeAuto = async () => {
  if (isNormalizing.value) return

  const { isConfirmed } = await Swal.fire({
    title: 'Chuẩn hoá dữ liệu cũ?',
    text: 'Sẽ tự động quét toàn bộ đơn theo từng lô nhỏ và thêm field storageCleaned cho đơn có ảnh nhưng chưa có field này. Không xoá gì cả — an toàn chạy lại nhiều lần.',
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: 'Bắt đầu',
    cancelButtonText: 'Huỷ',
  })
  if (!isConfirmed) return

  isNormalizing.value = true
  isNormalizePaused.value = false
  normalizeStopRequested.value = false
  storageCleanupError.value = ''
  appendAutoLog('[Chuẩn hoá] Bắt đầu chuẩn hoá dữ liệu cũ')

  while (!normalizeStopRequested.value) {
    if (isNormalizePaused.value) {
      await sleep(400)
      continue
    }

    try {
      const batch = await normalizeNextBatch()
      normalizeStats.value.scanned += batch.scanned
      normalizeStats.value.normalized += batch.normalized
      normalizeStats.value.skippedNoImages += batch.skippedNoImages
      normalizeStats.value.skippedAlreadyNormalized += batch.skippedAlreadyNormalized
      normalizeStats.value.errors += batch.errors
      normalizeProgress.value = `Đã quét ${normalizeStats.value.scanned} đơn, chuẩn hoá ${normalizeStats.value.normalized} đơn...`
      appendAutoLog(`[Chuẩn hoá] Batch ${normalizeBatchCount.value}: quét ${batch.scanned}, chuẩn hoá ${batch.normalized}, bỏ qua ${batch.skippedNoImages + batch.skippedAlreadyNormalized}${batch.errors ? `, lỗi ${batch.errors}` : ''}`)

      if (!batch.hasMore) {
        normalizeProgress.value = `✅ Hoàn tất: quét ${normalizeStats.value.scanned} đơn, chuẩn hoá ${normalizeStats.value.normalized} đơn.`
        appendAutoLog('[Chuẩn hoá] ✅ Đã quét hết collection.')
        persistNormalizeProgress(true)
        break
      }
      persistNormalizeProgress(false)
    } catch (e: any) {
      console.error('Normalize batch failed:', e)
      storageCleanupError.value = e?.message || 'Chuẩn hoá thất bại.'
      appendAutoLog(`[Chuẩn hoá] ⚠️ Lỗi batch ${normalizeBatchCount.value}: ${storageCleanupError.value}`)
      persistNormalizeProgress(false)
      break
    }

    await sleep(randomDelay())
  }

  isNormalizing.value = false
}

const pauseNormalizeAuto = () => {
  isNormalizePaused.value = true
  appendAutoLog('[Chuẩn hoá] ⏸ Tạm dừng')
  persistNormalizeProgress(false)
}

const resumeNormalizeAuto = () => {
  isNormalizePaused.value = false
  appendAutoLog('[Chuẩn hoá] ▶ Tiếp tục')
}

// ============================================================================
// DỌN TỰ ĐỘNG — lặp nhiều vòng, mỗi vòng quét 30 đơn rồi xoá ngay, có pause/resume
// ============================================================================
const startAutoCleanup = async () => {
  if (isAutoRunning.value) return

  const { isConfirmed } = await Swal.fire({
    title: isDryRun.value ? 'Chạy thử Dọn tự động?' : 'Xác nhận XOÁ THẬT?',
    text: isDryRun.value
      ? 'Chế độ chạy thử — sẽ không xoá ảnh thật, chỉ thống kê.'
      : 'Bạn đang chuẩn bị XOÁ THẬT ảnh trong Firebase Storage. Ảnh đã xoá sẽ không khôi phục được. Hệ thống KHÔNG xoá document Firestore, chỉ xoá file ảnh Storage. Tiếp tục?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Bắt đầu',
    cancelButtonText: 'Huỷ',
    confirmButtonColor: '#dc2626',
  })
  if (!isConfirmed) return

  isAutoRunning.value = true
  isAutoPaused.value = false
  autoStopRequested.value = false
  storageCleanupError.value = ''
  appendAutoLog(isDryRun.value ? 'Bắt đầu chạy thử (không xoá thật)' : 'Bắt đầu dọn tự động')

  while (!autoStopRequested.value) {
    if (isAutoPaused.value) {
      await sleep(400)
      continue
    }

    autoRoundCount.value++
    try {
      const batch = await scanNextBatch()
      autoStats.value.checked += batch.checkedReports
      autoStats.value.pendingSkipped += batch.pendingSkipped
      autoStats.value.vipNotOldEnough += batch.vipTooNewSkipped
      appendAutoLog(`Vòng ${autoRoundCount.value}: kiểm tra ${batch.checkedReports} đơn, bỏ qua ${batch.pendingSkipped} pending`)

      if (batch.candidates.length) {
        const result = await deleteCandidatesBatch(batch.candidates, isDryRun.value)
        autoStats.value.deletedImages += result.deletedImages
        autoStats.value.cleanedReports += result.cleanedReports
        autoStats.value.errors += result.errors
        appendAutoLog(`Vòng ${autoRoundCount.value}: ${isDryRun.value ? 'sẽ xoá' : 'đã xoá'} ${result.deletedImages} ảnh, đánh dấu ${result.cleanedReports} đơn${result.errors ? `, lỗi ${result.errors}` : ''}`)
      }

      if (!batch.hasMore) {
        appendAutoLog('✅ Đã quét hết — không còn đơn cần dọn.')
        persistCleanProgress(true)
        break
      }
      persistCleanProgress(false)
    } catch (e: any) {
      console.error('Auto cleanup round failed:', e)
      storageCleanupError.value = e?.message || 'Lỗi không xác định.'
      appendAutoLog(`⚠️ Lỗi vòng ${autoRoundCount.value}: ${storageCleanupError.value}`)
      persistCleanProgress(false)
      break
    }

    await sleep(randomDelay())
  }

  isAutoRunning.value = false
}

const pauseAutoCleanup = () => {
  isAutoPaused.value = true
  appendAutoLog(`⏸ Tạm dừng (${isDryRun.value ? 'chạy thử' : 'xoá thật'})`)
  persistCleanProgress(false)
}

const resumeAutoCleanup = () => {
  isAutoPaused.value = false
  appendAutoLog(`▶ Tiếp tục (${isDryRun.value ? 'chạy thử' : 'xoá thật'})`)
}

// Kết thúc phiên chạy thử — dừng loop, không xoá gì, đặt lại UI về trạng thái ban đầu.
const endDryRunSession = () => {
  autoStopRequested.value = true
  isAutoPaused.value = false
  appendAutoLog('⛔ Đã kết thúc phiên chạy thử — không xoá ảnh, không cập nhật Firestore.')
  resetStorageCleanup()
}

// Bắt buộc xác nhận khi admin tắt "Chạy thử" để chuyển sang xoá ảnh thật.
watch(isDryRun, async (newVal, oldVal) => {
  if (oldVal === true && newVal === false) {
    const { isConfirmed } = await Swal.fire({
      title: 'Tắt chế độ chạy thử?',
      text: 'Bạn đang chuẩn bị XOÁ THẬT ảnh trong Firebase Storage. Ảnh đã xoá sẽ không khôi phục được. Hệ thống không xoá document Firestore, chỉ xoá file ảnh Storage. Tiếp tục?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Xoá thật',
      cancelButtonText: 'Giữ chạy thử',
      confirmButtonColor: '#dc2626',
    })
    if (!isConfirmed) isDryRun.value = true
  }
})

const selectedReportId = ref<string | null>(null)
const showRejectPopup = ref(false)
const rejectReason = ref('')

// ============================================================================
// 1. DASHBOARD THỐNG KÊ
// ============================================================================
const statsTodayTotal = ref(0)
const statsTodayAppTotal = ref(0)

const VIP_JOB_STATS = [
  { id: 'mbbank',            label: 'APP ABBANK',      group: 'bank'  },
  { id: 'msb-bank',          label: 'MSB BANK',        group: 'bank'  },
  { id: 'vpbank',            label: 'VP BANK',         group: 'bank'  },
  { id: 'liobank',           label: 'LIOBANK',         group: 'bank'  },
  { id: 'lpbank-plus',      label: 'APP LPBank Plus', group: 'bank'  },
  { id: 'tpbank',            label: 'TP BANK',         group: 'bank'  },
  { id: 'app-chung-khoan',   label: 'CK SỐ 1 / KAFI', group: 'stock' },
  { id: 'app-chung-khoan-2', label: 'CK SỐ 2 / DNSE', group: 'stock' },
  { id: 'app-chung-khoan-3', label: 'CK SỐ 3 / KIS',  group: 'stock' },
  { id: 'app-chung-khoan-4', label: 'CK SỐ 4',        group: 'stock' },
] as const

const statsAppBreakdown = ref<Record<string, { label: string; group: string; today: number }>>(
  Object.fromEntries(VIP_JOB_STATS.map(j => [j.id, { label: j.label, group: j.group, today: 0 }]))
)
const isStatsLoading = ref(false)

// Ưu tiên jobId (reports mới), fallback jobTitleSnapshot → jobName (reports cũ)
// Trả về null cho job cơ bản (tiktok, youtube, zalo...)
const matchJobToId = (data: any): string | null => {
  if (data.jobId && statsAppBreakdown.value[data.jobId]) return data.jobId
  const snap = (data.jobTitleSnapshot || data.jobName || '').toLowerCase()
  if (!snap) return null
  if (snap.includes('abbank'))                                      return 'mbbank'
  if (snap.includes('lpbank'))                                      return 'lpbank-plus'
  if (snap.includes('msb'))                                         return 'msb-bank'
  if (snap.includes('vpbank') || snap.includes('vp bank'))          return 'vpbank'
  if (snap.includes('liobank') || snap.includes('lio bank'))        return 'liobank'
  if (snap.includes('tpbank') || snap.includes('tp bank'))          return 'tpbank'
  if (snap.includes('kafi') || snap.includes('chứng khoán số 1'))   return 'app-chung-khoan'
  if (snap.includes('dnse') || snap.includes('chứng khoán số 2'))   return 'app-chung-khoan-2'
  if (snap.includes('kis')  || snap.includes('chứng khoán số 3'))   return 'app-chung-khoan-3'
  if (snap.includes('chứng khoán số 4'))                            return 'app-chung-khoan-4'
  return null
}

const loadDashboardStats = async () => {
  isStatsLoading.value = true
  // Không reset refs ngay — giữ số cũ hiển thị trong khi load
  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Tính toán vào local vars, gán một lần khi xong
    let newTotal = 0
    let newAppTotal = 0
    const newBreakdown: Record<string, number> = {}
    Object.keys(statsAppBreakdown.value).forEach(k => { newBreakdown[k] = 0 })

    const qStats = query(
      collection(db, "reports"),
      where("approvedAt", ">=", Timestamp.fromDate(startOfDay)),
      orderBy("approvedAt", "desc"),
      limit(2000)
    )
    const snap = await getDocs(qStats)

    snap.forEach(docSnap => {
      const data = docSnap.data()
      // Đếm cả approved VÀ collected (collected = đã duyệt, user đã thu về ví)
      if (data.status === 'approved' || data.status === 'collected') {
        newTotal++
        const jid = matchJobToId(data)
        if (jid) {
          const grp = VIP_JOB_STATS.find(j => j.id === jid)?.group
          if (grp === 'bank') newAppTotal++
          if (newBreakdown[jid] !== undefined) newBreakdown[jid]++
        }
      }
    })

    // Gán tất cả cùng lúc khi đã có đủ dữ liệu
    statsTodayTotal.value = newTotal
    statsTodayAppTotal.value = newAppTotal
    for (const k of Object.keys(statsAppBreakdown.value)) {
      const entry = statsAppBreakdown.value[k]
      if (entry) entry.today = newBreakdown[k] ?? 0
    }
  } catch (err) {
    console.error("Lỗi tải thống kê: ", err)
    // Không reset — giữ số cũ nếu có lỗi
  } finally {
    isStatsLoading.value = false
  }
}

// Tăng số ngay khi admin duyệt (không đợi F5)
const updateLocalStatsOnApprove = (report: any) => {
  statsTodayTotal.value++
  const jid = matchJobToId(report)
  if (jid) {
    const grp = VIP_JOB_STATS.find(j => j.id === jid)?.group
    if (grp === 'bank') statsTodayAppTotal.value++
    const entry = statsAppBreakdown.value[jid]
    if (entry) entry.today++
  }
}

// ============================================================================
// 2. SỔ TAY ĐỐI SOÁT HÀNG NGÀY (NOTE BÁO CÁO)
// ============================================================================
const saveDailyNote = async () => {
  const now = new Date();
  const dateStr = `Ngày ${now.getDate()}/${now.getMonth() + 1}`;
  
  let detailArr: string[] = [];
  for (const [, val] of Object.entries(statsAppBreakdown.value)) {
    if (val.today > 0) detailArr.push(`${val.today} ${val.label}`);
  }
  
  const finalContent = detailArr.length > 0 ? detailArr.join(' - ') : "Chưa có đơn app nào.";

  const { isConfirmed } = await Swal.fire({
    title: 'CHỐT SỔ HÔM NAY?',
    text: `${dateStr}: ${finalContent}`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'LƯU VÀO SỔ TAY',
    confirmButtonColor: '#10b981'
  });

  if (isConfirmed) {
    try {
      await addDoc(collection(db, "admin_notes"), {
        dateLabel: dateStr,
        content: finalContent,
        totalToday: statsTodayTotal.value,
        createdAt: serverTimestamp()
      });
      await loadNotes();
      Swal.fire('Đã Lưu!', 'Dữ liệu đã được cất vào sổ tay bên dưới.', 'success');
    } catch (e) { alert("Lỗi lưu note: " + e); }
  }
}

const loadNotes = async () => {
  const snapshot = await getDocs(query(collection(db, "admin_notes"), limit(50)));
  let notesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const getTime = (t: any) => t?.toDate ? t.toDate().getTime() : new Date(t || 0).getTime();
  notesData.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
  dailyNotes.value = notesData;
}

const deleteNote = async (id: string) => {
  if (confirm("Xóa dòng note này?")) {
    await deleteDoc(doc(db, "admin_notes", id));
    await loadNotes();
  }
}

// ============================================================================
// 3. TÍNH NĂNG TÌM KIẾM THEO USERNAME / SĐT
// ============================================================================
const searchQuery = ref('')
const searchThreadResults = ref<any[]>([])
const isThreadSearchMode = ref(false)
const lastSearchedKeywordLower = ref('')

function parseSearchInput(rawText: string) {
  const trimmed = rawText.trim()
  const idPrefixMatch = /^id:\s*(.*)$/i.exec(trimmed)
  const idPrefixValue = (idPrefixMatch?.[1] || '').trim()
  const isIdMode = !!idPrefixMatch && idPrefixValue.length > 0
  const effectiveText = isIdMode ? idPrefixValue : trimmed
  const keywordLower = effectiveText.toLowerCase()
  const normalizedPhoneKeyword = normalizePhone(effectiveText)
  const isPhoneSearch = !isIdMode && normalizedPhoneKeyword.length >= 6
  return { trimmed, effectiveText, keywordLower, normalizedPhoneKeyword, isPhoneSearch, isIdMode }
}

// Điểm liên quan username/fullName/uid + jobName/jobId/friendName/bankType
function getSearchScore(report: any, keyword: string): number {
  const keywordLower = keyword.trim().toLowerCase()
  const usernameLower = String(report.username || report.fullName || "").toLowerCase()
  const uidLower = String(report.uid || "").toLowerCase()
  const fullNameLower = String(report.fullName || "").toLowerCase()
  const friendNameLower = String(report.friendName || "").toLowerCase()
  const jobNameLower = String(report.jobName || "").toLowerCase()
  const jobIdLower = String(report.jobId || "").toLowerCase()
  const bankTypeLower = String(report.bankType || "").toLowerCase()

  if (usernameLower === keywordLower) return 100
  if (uidLower === keywordLower) return 95
  if (usernameLower.startsWith(keywordLower)) return 80
  if (fullNameLower === keywordLower) return 75
  if (friendNameLower === keywordLower) return 70
  if (fullNameLower.startsWith(keywordLower)) return 60
  if (friendNameLower.startsWith(keywordLower)) return 55
  if (usernameLower.includes(keywordLower)) return 40
  if (fullNameLower.includes(keywordLower)) return 30
  if (friendNameLower.includes(keywordLower)) return 28
  if (uidLower.includes(keywordLower)) return 20
  if (jobNameLower.includes(keywordLower) || jobIdLower.includes(keywordLower)) return 15
  if (bankTypeLower.includes(keywordLower)) return 12
  return 0
}

// Chế độ "id:" — CHỈ so username/uid, không lẫn fullName/jobName
function getIdModeScore(entity: { uid?: string; username?: string }, keyword: string): number {
  const keywordLower = keyword.trim().toLowerCase()
  const usernameLower = String(entity.username || "").toLowerCase()
  const uidLower = String(entity.uid || "").toLowerCase()
  if (usernameLower === keywordLower) return 100
  if (uidLower === keywordLower) return 95
  if (usernameLower.startsWith(keywordLower)) return 80
  if (uidLower.startsWith(keywordLower)) return 70
  if (usernameLower.includes(keywordLower)) return 40
  if (uidLower.includes(keywordLower)) return 20
  return 0
}

// Bọc lại đúng các phép so khớp SĐT hiện có thành điểm số thay vì boolean
function getPhoneMatchScore(report: any, normalizedPhoneKeyword: string): number {
  if (!normalizedPhoneKeyword) return 0
  const phoneRefN = normalizePhone(report.phoneRef)
  const friendPhoneN = normalizePhone(report.friendPhone)
  const friendPhoneNormN = normalizePhone(report.friendPhoneNormalized)
  if (phoneRefN === normalizedPhoneKeyword) return 100
  if (friendPhoneNormN === normalizedPhoneKeyword) return 100
  if (friendPhoneN === normalizedPhoneKeyword) return 90
  if (phoneRefN.includes(normalizedPhoneKeyword)) return 40
  if (friendPhoneNormN.includes(normalizedPhoneKeyword)) return 40
  if (friendPhoneN.includes(normalizedPhoneKeyword)) return 30
  return 0
}

// Điểm cho daily_thread_reports — cùng tầng bậc, khác field. Ưu tiên: username web
// (resolve qua users/uid, gắn vào report trước khi tính điểm) > uid > threadNick > fullName > postUrl.
function getThreadSearchScore(threadReport: any, keyword: string): number {
  const keywordLower = keyword.trim().toLowerCase()
  const usernameLower = String(threadReport.username || "").toLowerCase()
  const nickLower = String(threadReport.threadNickLower || threadReport.threadNick || "").toLowerCase()
  const uidLower = String(threadReport.uid || "").toLowerCase()
  const fullNameLower = String(threadReport.fullName || "").toLowerCase()
  const postUrlLower = String(threadReport.postUrlNormalized || threadReport.postUrl || "").toLowerCase()
  if (usernameLower && usernameLower === keywordLower) return 100
  if (uidLower === keywordLower) return 95
  if (nickLower === keywordLower) return 90
  if (nickLower.startsWith(keywordLower)) return 80
  if (fullNameLower === keywordLower) return 75
  if (fullNameLower.startsWith(keywordLower)) return 60
  if (nickLower.includes(keywordLower)) return 40
  if (fullNameLower.includes(keywordLower)) return 30
  if (uidLower.includes(keywordLower)) return 20
  if (postUrlLower.includes(keywordLower)) return 15
  return 0
}

const handleSearch = async () => {
  const rawText = searchQuery.value
  const { trimmed: text, effectiveText, keywordLower, normalizedPhoneKeyword, isPhoneSearch, isIdMode } =
    parseSearchInput(rawText)

  if (!text) {
    searchThreadResults.value = []
    isThreadSearchMode.value = false
    lastSearchedKeywordLower.value = ''
    loadData(statusFilter.value);
    return;
  }

  isLoading.value = true;
  if (unsubReports) unsubReports();
  if (unsubWithdrawals) unsubWithdrawals();

  let limitedUids: string[] = [];
  let data: any[] = [];

  try {
    // BƯỚC 1: Nếu không phải phone search, bổ sung 1-2 truy vấn exact-match nhỏ
    // thẳng vào `users` để đảm bảo user khớp tuyệt đối luôn được tìm thấy dù họ
    // không có report nào trong status filter hiện tại (usersMap chỉ là cache lười).
    if (!isPhoneSearch) {
      try {
        const exactCandidates = new Set([effectiveText, keywordLower].filter(Boolean))
        for (const candidateValue of exactCandidates) {
          const qExactUser = query(collection(db, "users"), where("username", "==", candidateValue), limit(5))
          const snapExactUser = await getDocs(qExactUser)
          snapExactUser.docs.forEach(d => { usersMap.value[d.id] = d.data() })
        }
      } catch (exactUserErr) {
        if (import.meta.env.DEV) console.warn("[Search] exact username lookup failed:", exactUserErr)
      }

      const scoreCandidate = (uid: string, user: any) =>
        isIdMode
          ? getIdModeScore({ uid, username: user?.username }, keywordLower)
          : getSearchScore({ uid, username: user?.username, fullName: user?.fullName }, keywordLower)

      limitedUids = Object.entries(usersMap.value)
        .map(([uid, user]) => ({ uid, score: scoreCandidate(uid, user) }))
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(c => c.uid)
    }

    // BƯỚC 2: Query reports chính.
    if (isPhoneSearch) {
      const qReports = query(collection(db, "reports"), where("phoneRef", "==", text), limit(50));
      const snapshot = await getDocs(qReports);
      data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else if (limitedUids.length > 0) {
      const qReports = query(collection(db, "reports"), where("uid", "in", limitedUids), limit(50));
      const snapshot = await getDocs(qReports);
      data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // BƯỚC 3: Gộp thêm ứng viên từ các nguồn quét bổ sung (KHÔNG lọc ở đây —
    // lọc/score/sort tập trung một chỗ duy nhất ở BƯỚC 4).
    try {
      const existingIds = new Set(data.map(r => r.id));
      const pushUnique = (docs: any[]) => {
        for (const r of docs) {
          if (!existingIds.has(r.id)) { data.push(r); existingIds.add(r.id); }
        }
      };

      // 3a. SĐT bạn bè referral — exact match, giữ NGUYÊN hành vi gốc.
      if (isPhoneSearch && normalizedPhoneKeyword.length >= 6) {
        const qFriendPhoneExact = query(
          collection(db, "reports"),
          where("friendPhoneNormalized", "==", normalizedPhoneKeyword),
          limit(50)
        );
        const snapFriendExact = await getDocs(qFriendPhoneExact);
        pushUnique(snapFriendExact.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      // 3b. Quét 500 đơn "Giới thiệu bạn bè" gần nhất — GIỮ NGUYÊN phạm vi/kích thước
      // truy vấn gốc (không được làm loãng độ sâu recall của SĐT bạn bè referral).
      const qReferralRecent = query(
        collection(db, "reports"),
        where("jobId", "in", ["referral_abbank", "referral_lpbank"]),
        limit(500)
      );
      const snapReferralRecent = await getDocs(qReferralRecent);
      pushUnique(snapReferralRecent.docs.map(d => ({ id: d.id, ...d.data() })));

      // 3c. Quét 300 đơn gần nhất (mọi loại job) để bắt jobName/jobId cho report thường.
      // Không chạy khi isPhoneSearch (phone search không cần và không có regression
      // vì bản gốc chưa từng hỗ trợ SĐT substring cho report thường).
      if (!isPhoneSearch) {
        const qRecentScan = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(300));
        const snapRecentScan = await getDocs(qRecentScan);
        pushUnique(snapRecentScan.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (scanErr) {
      console.error("Lỗi quét bổ sung report:", scanErr);
    }

    // BƯỚC 4: Gắn username đã resolve, tính điểm liên quan MỘT LẦN DUY NHẤT cho
    // toàn bộ candidate đã gộp, lọc score>0, sort desc + tie-break createdAt.
    data.forEach(r => { r.username = r.username || usersMap.value[r.uid]?.username || ""; });

    const scoreReport = (r: any) =>
      isPhoneSearch
        ? getPhoneMatchScore(r, normalizedPhoneKeyword)
        : isIdMode
          ? getIdModeScore({ uid: r.uid, username: r.username }, keywordLower)
          : getSearchScore(r, keywordLower);

    data.forEach(r => { r.searchScore = scoreReport(r); });
    data = data.filter(r => r.searchScore > 0);

    const getTime = (t: any) => t?.toDate ? t.toDate().getTime() : new Date(t || 0).getTime();
    data.sort((a, b) => (b.searchScore - a.searchScore) || (getTime(b.createdAt) - getTime(a.createdAt)));
    reports.value = data;
    lastSearchedKeywordLower.value = keywordLower;

    // Hydrate usersMap cho toàn bộ report vừa hiển thị — search trước đây bỏ qua bước
    // này (khác loadData()), khiến report có users/{uid} thật vẫn hiện "Chưa cập nhật".
    await ensureUsers(data.flatMap((r: any) => [r.uid, r.repairedUserUid]).filter(Boolean))
    ensurePhoneFallback(data)
    if (import.meta.env.DEV) {
      console.log('Hydrating admin search reports', {
        reportCount: data.length,
        uniqueUids: [...new Set(data.map((r: any) => r.uid).filter(Boolean))].length,
        missingUserUids: data.filter((r: any) => r.uid && !usersMap.value[r.uid] && !(r.repairedUserUid && usersMap.value[r.repairedUserUid])).map((r: any) => r.uid),
      })
    }

    // BƯỚC 5: withdrawals cùng bộ uid — giữ NGUYÊN logic fallback gốc.
    let uidsToSearchWith = isPhoneSearch ? [] : limitedUids;
    if (uidsToSearchWith.length === 0 && data.length > 0) {
      uidsToSearchWith = [data[0].uid];
    }

    if (uidsToSearchWith.length > 0) {
      const validUids = [...new Set(uidsToSearchWith)].slice(0, 10);
      const qWith = query(collection(db, "withdrawals"), where("uid", "in", validUids));
      const snapWith = await getDocs(qWith);
      let wData = snapWith.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      wData.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      await ensureUsers(wData.map((w: any) => w.uid).filter(Boolean))
      withdrawals.value = wData;
    } else {
      withdrawals.value = [];
    }

    // BƯỚC 6: daily_thread_reports — gộp nhiều nguồn truy vấn để không bỏ sót lịch sử cũ
    // của user. Trước đây chỉ quét 300 đơn gần nhất TOÀN HỆ THỐNG rồi lọc client-side —
    // user có đơn rải rác nhiều ngày rất dễ rớt khỏi cửa sổ 300 đơn này khi site đông user.
    let threadData: any[] = []
    const existingThreadIds = new Set<string>()
    const pushUniqueThread = (docs: any[]) => {
      for (const d of docs) {
        if (!existingThreadIds.has(d.id)) { threadData.push(d); existingThreadIds.add(d.id) }
      }
    }

    try {
      // 6a. Username/uid đã resolve từ BƯỚC 1 (users collection) — lấy TOÀN BỘ lịch sử
      // Thread của đúng (các) uid này, không giới hạn theo ngày/độ mới.
      if (!isPhoneSearch && limitedUids.length > 0) {
        const qThreadsByUid = query(
          collection(db, "daily_thread_reports"),
          where("uid", "in", limitedUids.slice(0, 10)),
          limit(200)
        )
        const snapByUid = await getDocs(qThreadsByUid)
        pushUniqueThread(snapByUid.docs.map(d => ({ id: d.id, ...d.data() })))
      }

      // 6b. SĐT chính xác — cùng field phoneRef như report thường.
      if (isPhoneSearch) {
        const qThreadsByPhone = query(collection(db, "daily_thread_reports"), where("phoneRef", "==", text), limit(100))
        const snapByPhone = await getDocs(qThreadsByPhone)
        pushUniqueThread(snapByPhone.docs.map(d => ({ id: d.id, ...d.data() })))
      }

      // 6c. Nick Thread chính xác — cho phép tìm ra đơn dù không biết username web.
      if (!isPhoneSearch && !isIdMode && keywordLower) {
        const qThreadsByNick = query(collection(db, "daily_thread_reports"), where("threadNickLower", "==", keywordLower), limit(100))
        const snapByNick = await getDocs(qThreadsByNick)
        pushUniqueThread(snapByNick.docs.map(d => ({ id: d.id, ...d.data() })))
      }

      // 6d. UID đầy đủ dán trực tiếp vào ô search (không qua resolve username).
      if (!isPhoneSearch && effectiveText) {
        const qThreadsByUidDirect = query(collection(db, "daily_thread_reports"), where("uid", "==", effectiveText), limit(50))
        const snapByUidDirect = await getDocs(qThreadsByUidDirect)
        pushUniqueThread(snapByUidDirect.docs.map(d => ({ id: d.id, ...d.data() })))
      }

      // 6e. Fallback: quét 300 đơn gần nhất toàn hệ thống — bắt các trường hợp fuzzy
      // (fullName/nick chứa từ khóa) mà 4 truy vấn exact ở trên không phủ tới.
      const qThreadsRecent = query(collection(db, "daily_thread_reports"), orderBy("createdAt", "desc"), limit(300))
      const snapThreadsRecent = await getDocs(qThreadsRecent)
      pushUniqueThread(snapThreadsRecent.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (threadScanErr) {
      console.error("Lỗi quét daily_thread_reports:", threadScanErr)
    }

    // Gắn username đã resolve (nếu có) để getThreadSearchScore nhận diện đúng theo
    // username web — không phải report Thread nào cũng tự có sẵn field username.
    threadData.forEach(r => { r.username = r.username || usersMap.value[r.uid]?.username || "" })

    threadData = threadData
      .map(r => {
        let score = 0;
        if (isPhoneSearch) {
          const phoneRefN = normalizePhone(r.phoneRef);
          if (phoneRefN === normalizedPhoneKeyword) score = 100;
          else if (r.phoneRef && String(r.phoneRef).includes(text)) score = 40; // giữ hành vi cũ (raw includes)
        } else if (isIdMode) {
          score = getIdModeScore({ uid: r.uid, username: r.username || r.threadNickLower || r.threadNick }, keywordLower);
        } else {
          score = getThreadSearchScore(r, keywordLower);
        }
        // Report lấy về nhờ khớp đúng uid đã resolve ở 6a luôn được coi là liên quan, dù
        // nick/fullName không chứa keyword theo nghĩa đen — đây chính là mục tiêu chính:
        // search username phải ra TOÀN BỘ lịch sử Thread, không phụ thuộc có chứa chữ hay không.
        if (!isPhoneSearch && limitedUids.includes(r.uid) && score === 0) score = 65;
        return { ...r, searchScore: score };
      })
      .filter(r => r.searchScore > 0)
      .sort((a, b) => (b.searchScore - a.searchScore) || (getTime(b.createdAt) - getTime(a.createdAt)));

    searchThreadResults.value = threadData
    isThreadSearchMode.value = threadData.length > 0

    // Auto-switch sang tab Thread nếu chỉ tìm thấy đơn Thread (không có reports/withdrawals)
    if (threadData.length > 0 && data.length === 0 && withdrawals.value.length === 0) {
      activeTab.value = 'daily_threads'
    }

    // Log debug tổng hợp — chỉ DEV.
    if (import.meta.env.DEV) {
      console.log("Admin search:", {
        keyword: text,
        keywordLower,
        normalizedPhoneKeyword,
        isPhoneSearch,
        isIdMode,
        results: data.map(r => ({ id: r.id, username: r.username, fullName: r.fullName, phoneRef: r.phoneRef, score: r.searchScore }))
      });
      console.log("Admin global search:", {
        keyword: text,
        resolvedUsers: limitedUids.map(uid => ({ uid, username: usersMap.value[uid]?.username || usersMap.value[uid]?.fullName || '' })),
        reportResultsCount: data.length,
        dailyThreadResultsCount: threadData.length,
        withdrawalResultsCount: withdrawals.value.length,
      });
      console.log("Daily thread search result:", {
        keyword: text,
        resolvedUids: limitedUids,
        dailyThreadReports: threadData.map(r => ({ id: r.id, uid: r.uid, threadNick: r.threadNick, dateKey: r.dateKey, status: r.status })),
      });
    }
  } catch (error: any) {
    alert("LỖI TÌM KIẾM: " + error.message);
  } finally {
    isLoading.value = false;
  }
}

function clearThreadSearch() {
  searchQuery.value = ''
  searchThreadResults.value = []
  isThreadSearchMode.value = false
  loadData(statusFilter.value)
}

// ============================================================================
// 4. TÍNH NĂNG DUYỆT HÀNG LOẠT (BULK APPROVE)
// ============================================================================
const selectedOtherJobs = ref<string[]>([])

watch(activeTab, () => {
  selectedOtherJobs.value = []
  if (activeTab.value === 'storage_clean') {
    if (unsubReports) { unsubReports(); unsubReports = null }
    if (unsubWithdrawals) { unsubWithdrawals(); unsubWithdrawals = null }
    isLoading.value = false
    return
  }
  if (!isCheckingAuth.value) loadData(statusFilter.value)
})

const isAllOtherJobsSelected = computed(() => {
  const pendingJobs = filteredOtherReports.value.filter(r => r.status === 'pending')
  return pendingJobs.length > 0 && selectedOtherJobs.value.length === pendingJobs.length
})

const toggleAllOtherJobs = (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    selectedOtherJobs.value = filteredOtherReports.value
      .filter(r => r.status === 'pending')
      .map(r => r.id)
  } else {
    selectedOtherJobs.value = []
  }
}

const isBulkProcessing = ref(false)
const bulkProgress = ref({ total: 0, current: 0, success: 0, skipped: 0, error: 0 })

// Duyệt 1 đơn trong transaction: đọc lại status mới nhất từ Firestore ngay trước khi ghi,
// nên nếu đơn đã được duyệt/hủy bởi thao tác khác (admin khác, hoặc click trùng) thì bỏ qua,
// tránh cộng XU 2 lần cho cùng 1 report.
// targetUid: ví cần cộng xu, mặc định là report.uid. Được truyền riêng khi admin đã xác
// nhận dùng hồ sơ tìm theo SĐT (report.uid không tồn tại nhưng có ví thật khác UID) — khi
// đó report được đánh dấu repairedUserUid/originalReportUid để lần sau nhận diện đúng ví.
const approveOneReportTx = async (reportId: string, targetUid?: string) => {
  const reportRef = doc(db, "reports", reportId)
  return await runTransaction(db, async (transaction) => {
    const reportSnap = await transaction.get(reportRef)
    if (!reportSnap.exists()) {
      return { outcome: 'error' as const, reason: 'not-found' }
    }

    const report: any = { id: reportId, ...reportSnap.data() }
    if (report.status !== 'pending') {
      return { outcome: 'skipped' as const, status: report.status }
    }
    if (!report.uid) {
      return { outcome: 'error' as const, reason: 'missing-uid' }
    }

    const effectiveTargetUid = targetUid || report.uid
    const cleanRewardString = String(report.reward || '0').replace(/\D/g, '')
    const rewardValue = Number(cleanRewardString) || 0

    const userRef = doc(db, "users", effectiveTargetUid)
    const userSnap = await transaction.get(userRef)

    // users/{uid} có thể chưa tồn tại (đơn cũ, hoặc user bị thiếu hồ sơ) — updateDoc sẽ
    // fail trên doc chưa tồn tại nên phải set(..., {merge:true}) để vừa tạo vừa cộng xu.
    const userExisted = userSnap.exists()
    if (!userExisted && !hasSubmitterIdentity(report)) {
      // Không có users/{uid} lẫn snapshot người nộp (fullName/phoneRef) trong report —
      // không đủ căn cứ để tạo ví mới, tránh cộng xu vào một hồ sơ ẩn danh.
      return { outcome: 'error' as const, reason: 'missing-profile-info' }
    }
    if (userExisted) {
      transaction.update(userRef, { balance: increment(rewardValue) })
    } else {
      warnMissingUserProfile(report)
      transaction.set(userRef, buildFallbackUserProfile({ ...report, uid: effectiveTargetUid }, rewardValue), { merge: true })
    }

    const reportUpdate: any = { status: 'approved', approvedAt: serverTimestamp() }
    if (effectiveTargetUid !== report.uid) {
      Object.assign(reportUpdate, markRepairedByPhone(report, effectiveTargetUid))
    }
    transaction.update(reportRef, reportUpdate)

    return { outcome: 'success' as const, report, userExists: true, repaired: !userExisted, rewardValue, targetUid: effectiveTargetUid }
  })
}

// Duyệt đơn referral_lpbank: thưởng tăng dần theo số lần user đã được duyệt thành công trước đó.
// Tách riêng khỏi approveOneReportTx để không ảnh hưởng logic duyệt của các job khác.
// targetUid: xem giải thích ở approveOneReportTx — dùng ví thật tìm theo SĐT khi cần.
const approveLpbankReferralReportTx = async (reportId: string, targetUid?: string) => {
  const reportRef = doc(db, "reports", reportId)

  // Firestore transaction không cho query tuỳ ý (chỉ get-by-reference), nên đọc trước
  // ngoài transaction để biết có cần fallback đếm đơn cũ đã duyệt hay không.
  const preReportSnap = await getDoc(reportRef)
  if (!preReportSnap.exists()) {
    return { outcome: 'error' as const, reason: 'not-found' }
  }
  const preReport: any = preReportSnap.data()
  if (preReport.status !== 'pending') {
    return { outcome: 'skipped' as const, status: preReport.status }
  }
  if (!preReport.uid) {
    return { outcome: 'error' as const, reason: 'missing-uid' }
  }

  const effectiveTargetUid = targetUid || preReport.uid
  const userRef = doc(db, "users", effectiveTargetUid)
  const preUserSnap = await getDoc(userRef)
  const preUserData: any = preUserSnap.exists() ? preUserSnap.data() : null

  let fallbackCount = 0
  if (preUserData && preUserData.lpbankReferralPaidCount === undefined) {
    // Đơn cũ chưa có counter — đếm lại từ report referral_lpbank đã duyệt/thu ví trước đó
    // của đúng ví đang được cộng (targetUid), không phải uid gốc trên report nếu 2 cái khác nhau.
    const historySnap = await getDocs(query(
      collection(db, 'reports'),
      where('uid', '==', effectiveTargetUid),
      where('jobId', '==', 'referral_lpbank'),
      where('status', 'in', ['approved', 'collected'])
    ))
    fallbackCount = historySnap.size
  }

  return await runTransaction(db, async (transaction) => {
    const reportSnap = await transaction.get(reportRef)
    if (!reportSnap.exists()) {
      return { outcome: 'error' as const, reason: 'not-found' }
    }

    const report: any = { id: reportId, ...reportSnap.data() }
    if (report.status !== 'pending') {
      return { outcome: 'skipped' as const, status: report.status }
    }

    const userSnap = await transaction.get(userRef)
    const userExisted = userSnap.exists()
    const userData: any = userExisted ? userSnap.data() : {}

    if (!userExisted && !hasSubmitterIdentity(report)) {
      // Không có users/{uid} lẫn snapshot người nộp (fullName/phoneRef) trong report —
      // không đủ căn cứ để tạo ví mới, tránh cộng xu vào một hồ sơ ẩn danh.
      return { outcome: 'error' as const, reason: 'missing-profile-info' }
    }

    const successCountBefore = Number(userData.lpbankReferralPaidCount ?? fallbackCount ?? 0)
    const nextNumber = successCountBefore + 1
    const actualReward = getLpbankReferralRewardByCount(successCountBefore)

    if (import.meta.env.DEV) {
      console.log('LPBANK referral reward calculation:', { reportId, uid: report.uid, successCountBefore, nextNumber, actualReward })
    }

    if (userExisted) {
      transaction.update(userRef, {
        balance: increment(actualReward),
        lpbankReferralPaidCount: successCountBefore + 1,
      })
    } else {
      warnMissingUserProfile(report)
      transaction.set(userRef, {
        ...buildFallbackUserProfile({ ...report, uid: effectiveTargetUid }, actualReward),
        lpbankReferralPaidCount: successCountBefore + 1,
      }, { merge: true })
    }

    const reportUpdate: any = {
      status: 'approved',
      approvedAt: serverTimestamp(),
      reward: actualReward,
      actualReward,
      referralSuccessNumber: nextNumber,
      referralProgram: 'lpbank',
    }
    if (effectiveTargetUid !== report.uid) {
      Object.assign(reportUpdate, markRepairedByPhone(report, effectiveTargetUid))
    }
    transaction.update(reportRef, reportUpdate)

    if (import.meta.env.DEV) {
      console.log('LPBANK referral approved:', { reportId, uid: report.uid, actualReward, referralSuccessNumber: nextNumber })
    }

    return { outcome: 'success' as const, report, userExists: true, repaired: !userExisted, rewardValue: actualReward, targetUid: effectiveTargetUid }
  })
}

const renderBulkProgressHtml = () => {
  const p = bulkProgress.value
  return `
    <div style="text-align:left;font-size:13px;line-height:1.9">
      <div>Đang duyệt đơn <b>${p.current}/${p.total}</b></div>
      <div style="color:#10b981">Thành công: ${p.success}</div>
      <div style="color:#f59e0b">Bỏ qua: ${p.skipped}</div>
      <div style="color:#ef4444">Lỗi: ${p.error}</div>
    </div>
  `
}

const bulkApproveOtherJobs = async () => {
  if (isBulkProcessing.value) return
  // Chốt danh sách id đã chọn ngay tại thời điểm bấm nút, không dùng selectedOtherJobs.value
  // trực tiếp trong lúc xử lý vì nó không được đụng tới nữa cho tới khi xong (UI bị khoá),
  // nhưng vẫn tách riêng để đảm bảo count hiển thị trong popup luôn đúng số ban đầu.
  const selectedIds = [...selectedOtherJobs.value]
  const totalSelected = selectedIds.length
  if (totalSelected === 0) return

  const { isConfirmed } = await Swal.fire({
    title: `DUYỆT ${totalSelected} ĐƠN?`,
    text: "Bạn có chắc chắn muốn duyệt và cộng tiền cho tất cả các đơn đã chọn?",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#3b82f6',
    cancelButtonText: 'HỦY',
    confirmButtonText: 'DUYỆT LUÔN 🚀'
  });

  if (!isConfirmed) return

  isBulkProcessing.value = true
  bulkProgress.value = { total: totalSelected, current: 0, success: 0, skipped: 0, error: 0 }
  const errors: Array<{ reportId: string; error: any }> = []

  Swal.fire({
    title: 'ĐANG XỬ LÝ...',
    html: renderBulkProgressHtml(),
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => { Swal.showLoading() }
  })

  // Xử lý theo chunk 4 đơn chạy song song/lần (không ồ ạt 40-50 transaction cùng lúc,
  // cũng không tuần tự từng đơn một quá chậm). Progress popup chỉ update 1 lần sau mỗi
  // chunk, không update theo từng đơn để tránh render lại quá dày.
  const BULK_CONCURRENCY = 4
  for (let i = 0; i < selectedIds.length; i += BULK_CONCURRENCY) {
    const chunk = selectedIds.slice(i, i + BULK_CONCURRENCY)
    await Promise.all(chunk.map(async (reportId) => {
      try {
        const outcome = await approveOneReportTx(reportId)
        if (outcome.outcome === 'success') {
          bulkProgress.value.success++
          updateLocalStatsOnApprove(outcome.report)
        } else if (outcome.outcome === 'skipped') {
          bulkProgress.value.skipped++
        } else {
          bulkProgress.value.error++
          errors.push({ reportId, error: outcome.reason })
          console.error('Bulk approve report failed:', reportId, outcome.reason)
        }
      } catch (err) {
        bulkProgress.value.error++
        errors.push({ reportId, error: err })
        console.error('Bulk approve report failed:', reportId, err)
      }
      bulkProgress.value.current++
    }))
    Swal.update({ html: renderBulkProgressHtml() })
  }

  isBulkProcessing.value = false

  await Swal.fire({
    icon: bulkProgress.value.error > 0 ? 'warning' : 'success',
    title: 'ĐÃ XỬ LÝ XONG',
    html: `
      <div style="text-align:left;font-size:13px;line-height:1.9">
        <div style="color:#10b981">Thành công: ${bulkProgress.value.success} đơn</div>
        <div style="color:#f59e0b">Bỏ qua: ${bulkProgress.value.skipped} đơn (đã được xử lý trước đó / không còn ở trạng thái chờ)</div>
        <div style="color:#ef4444">Lỗi: ${bulkProgress.value.error} đơn</div>
      </div>
    `,
    confirmButtonText: 'ĐÓNG',
    confirmButtonColor: '#3b82f6'
  })

  // Chỉ clear selected + để onSnapshot tự cập nhật list sau khi admin đã đóng popup kết quả.
  selectedOtherJobs.value = []
}

// ============================================================================
// 5. HÀM KÉO DỮ LIỆU TỪ FIREBASE (FIX TIME TRỄ HIỂN THỊ)
// ============================================================================
let unsubReports: any = null;
let unsubWithdrawals: any = null;

// Tab-aware: only start the listener that the active tab needs.
// Switching from reports tab → withdrawals tab unsubscribes the reports listener (and vice-versa).
const loadData = (newStatus: string) => {
  if (searchQuery.value.trim() !== '') return

  isLoading.value = true

  const needsReports = activeTab.value === 'app_jobs' || activeTab.value === 'other_jobs'
  const needsWithdrawals = activeTab.value === 'withdrawals'

  if (!needsReports && unsubReports) { unsubReports(); unsubReports = null }
  if (!needsWithdrawals && unsubWithdrawals) { unsubWithdrawals(); unsubWithdrawals = null }

  if (needsReports) {
    if (unsubReports) { unsubReports(); unsubReports = null }
    const qReports = newStatus === 'all'
      ? query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(100))
      : query(collection(db, "reports"), where("status", "==", newStatus), limit(100))

    unsubReports = onSnapshot(qReports, async (snapshot) => {
      if (import.meta.env.DEV) console.log('[Firestore Listener] reports docs:', snapshot.size)
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      const getTime = (t: any) => t?.toDate ? t.toDate().getTime() : (t ? new Date(t).getTime() : Date.now() + 15000)
      data.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt))
      reports.value = data
      isLoading.value = false
      await ensureUsers(data.flatMap((r: any) => [r.uid, r.repairedUserUid]).filter(Boolean))
      ensurePhoneFallback(data)
    }, (error) => {
      console.error("LỖI BẰNG CHỨNG:", error)
      isLoading.value = false
    })
  }

  if (needsWithdrawals) {
    withdrawalsError.value = ''
    if (unsubWithdrawals) { unsubWithdrawals(); unsubWithdrawals = null }
    const qWithdrawals = newStatus === 'all'
      ? query(collection(db, "withdrawals"), orderBy("createdAt", "desc"), limit(50))
      : query(collection(db, "withdrawals"), where("status", "==", newStatus), limit(50))

    unsubWithdrawals = onSnapshot(qWithdrawals, async (snapshot) => {
      if (import.meta.env.DEV) console.log('[Firestore Listener] withdrawals docs:', snapshot.size)
      let wData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      const getTime = (t: any) => t?.toDate ? t.toDate().getTime() : new Date(t || 0).getTime()
      wData.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt))
      withdrawals.value = wData
      withdrawalsError.value = ''
      isLoading.value = false
      await ensureUsers(wData.map((w: any) => w.uid).filter(Boolean))
    }, (error) => {
      console.error("LỖI RÚT TIỀN:", error)
      withdrawalsError.value = error.message || 'Lỗi tải dữ liệu rút tiền'
      isLoading.value = false
    })
  }

  if (!needsReports && !needsWithdrawals) isLoading.value = false

  loadNotes()
}

watch(statusFilter, (newVal) => {
  if (!isCheckingAuth.value) {
    searchQuery.value = '';
    searchThreadResults.value = []
    isThreadSearchMode.value = false
    loadData(newVal);
  }
})

// ============================================================================
// 6. CÁC HÀM XỬ LÝ LẺ
// ============================================================================
const openRejectPopup = (id: string) => {
  selectedReportId.value = id
  rejectReason.value = ''
  showRejectPopup.value = true
}

const closeRejectPopup = () => {
  showRejectPopup.value = false
  selectedReportId.value = null
  rejectReason.value = ''
}

const confirmReject = async () => {
  if (!selectedReportId.value) return
  try {
    await updateDoc(doc(db, "reports", selectedReportId.value), { 
      status: 'rejected',
      note: rejectReason.value || "Thông tin không chính xác"
    })
    closeRejectPopup()
  } catch(error) {
    alert("LỖI KHI HỦY: " + error)
  }
}

const showMessagePopup = ref(false)
const messageText = ref('')

const openMessagePopup = (id: string) => {
  selectedReportId.value = id
  messageText.value = ''
  showMessagePopup.value = true
}

const closeMessagePopup = () => {
  showMessagePopup.value = false
  selectedReportId.value = null
  messageText.value = ''
}

const confirmMessage = async () => {
  if (!selectedReportId.value) return
  try {
    await updateDoc(doc(db, "reports", selectedReportId.value), { 
      note: messageText.value || "Vui lòng liên hệ Admin để được hỗ trợ"
    })
    closeMessagePopup()
  } catch(error) {
    alert("LỖI KHI GỬI LỜI NHẮN: " + error)
  }
}

onMounted(() => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const isBoss = user.email === 'nguyenvanca20012001@gmail.com';
      const userDoc = await getDoc(doc(db, "users", user.uid))
      const userData = userDoc.data()

      if (!isBoss && userData?.role !== 'admin') {
        Swal.fire({
          icon: 'error',
          title: 'TRUY CẬP BỊ CHẶN!',
          text: 'Nàng không có quyền vào khu vực này!',
          confirmButtonColor: '#ED4E95'
        }).then(() => { router.push('/') })
        return
      }

      isCheckingAuth.value = false;

      loadData(statusFilter.value);
      loadDashboardStats();
      startVipJobsListener()          // idempotent — nếu listener đã chạy từ App.vue thì return ngay
      startAppConfigListener()        // idempotent — khởi động listener config web
      startSupportConfigListener()    // idempotent — khởi động listener hỗ trợ
      startBasicJobConfigsListener()  // idempotent — khởi động listener basic job configs
      startDailyThreadsGuideListener() // idempotent — khởi động listener config popup hướng dẫn Thread hằng ngày

    } else {
      router.push('/login')
    }
  })
})

onUnmounted(() => {
  if (unsubReports) unsubReports()
  if (unsubWithdrawals) unsubWithdrawals()
  autoStopRequested.value = true
  normalizeStopRequested.value = true
})

const isAppJob = (jobName: string) => {
  if (!jobName) return false;
  const name = jobName.toLowerCase();
  const keywords = ['app', 'ngân hàng', 'chứng khoán', 'vpbank', 'tpbank', 'mbbank', 'msb', 'cake', 'tnex', 'kafi', 'dnse', 'kis', 'liobank', 'lio', 'lpbank'];
  return keywords.some(kw => name.includes(kw));
}

const filteredAppReports = computed(() => {
  return reports.value.filter(r =>
    (searchQuery.value.trim() !== '' ? true : (statusFilter.value === 'all' || r.status === statusFilter.value)) &&
    isAppJob(r.jobName)
  )
})

const filteredOtherReports = computed(() => {
  return reports.value.filter(r =>
    (searchQuery.value.trim() !== '' ? true : (statusFilter.value === 'all' || r.status === statusFilter.value)) &&
    !isAppJob(r.jobName)
  )
})

const filteredWithdrawals = computed(() => {
  return withdrawals.value.filter(w =>
    searchQuery.value.trim() !== '' ? true : (statusFilter.value === 'all' || w.status === statusFilter.value)
  )
})

const getXuAmount = (wd: any) => {
  let xu = wd.amountXu || wd.amount || wd.xu || 0;
  if (typeof xu === 'string') xu = Number(xu.replace(/\D/g, ''));
  return Number(xu) || 0;
}

const getVndAmount = (wd: any) => {
  let vnd = wd.realMoney || wd.money || 0;
  if (typeof vnd === 'string') vnd = Number(vnd.replace(/\D/g, ''));
  
  let finalVnd = Number(vnd) || 0;
  let finalXu = getXuAmount(wd);

  if (finalVnd === 0 && finalXu > 0) {
    finalVnd = finalXu / 10;
  } else if (finalVnd === finalXu && finalXu > 0) {
    finalVnd = finalXu / 10;
  }
  return finalVnd;
}

const selectedQrImage = ref<string | null>(null)
const openQrModal = (url: string) => { selectedQrImage.value = url }
const closeQrModal = () => { selectedQrImage.value = null }

// Fallback profile dùng để tạo/vá users/{uid} khi doc chưa tồn tại — ưu tiên field
// gốc của report, khớp với những gì admin đã thấy trong đơn (không bịa dữ liệu mới).
const buildFallbackUserProfile = (rp: any, balance: number) => ({
  uid: rp.uid,
  fullName: rp.fullName || rp.name || rp.submittedName || rp.reportFullName || 'Chưa cập nhật',
  phoneRef: rp.phoneRef || rp.phone || rp.submittedPhone || '',
  birthYear: rp.birthYear || rp.yearOfBirth || '',
  balance,
  // Hồ sơ do admin tạo/vá là user ĐÃ TỒN TẠI (đã nộp đơn) — đánh dấu đã nhận quà chào mừng
  // để listener bên App.vue KHÔNG tự cộng thêm 10.000 xu khi user này đăng nhập lại (tránh
  // hiện tượng ví "nhảy về/chồng thêm" 10.000). Quà 10.000 chỉ dành cho user tự đăng ký mới.
  receivedWelcomeGift: true,
  createdAt: serverTimestamp(),
  repairedByAdmin: true,
  repairedAt: serverTimestamp()
})

const warnMissingUserProfile = (rp: any) => {
  console.warn('Report uid missing user profile', {
    reportId: rp.id, reportUid: rp.uid,
    effectiveUid: rp.repairedUserUid || rp.uid,
    jobId: rp.jobId, jobName: rp.jobName,
    reportFullName: rp.fullName,
    reportPhoneRef: rp.phoneRef || rp.phone || rp.submittedPhone,
    friendName: rp.friendName, friendPhone: rp.friendPhone,
    repairedUserUid: rp.repairedUserUid,
    foundUserByPhoneUid: rp.__foundUserByPhoneUid
  })
}

// Xác định report có snapshot đủ tin cậy của NGƯỜI NỘP (không phải bạn bè được giới
// thiệu) để cho phép tự động tạo hồ sơ ví khi duyệt/cộng xu — không dùng friendName/
// friendPhone ở đây vì đó là thông tin của người khác, không phải chủ ví nhận xu.
const hasSubmitterIdentity = (rp: any) => !!(rp.fullName || rp.phoneRef || rp.phone || rp.phoneNormalized)

// Trước khi ghi xu/sửa ví: nếu users/{report.uid} không tồn tại, thử tìm hồ sơ theo
// SĐT (phoneRef/phone/phoneNormalized/submittedPhone) trước khi coi là "chưa có hồ sơ".
// Tránh admin tạo trùng ví cho user đã có sẵn dưới UID khác (VD: đăng ký lại máy khác).
const resolveUserTarget = async (rp: any): Promise<{ targetUid: string; viaPhoneMatch: { uid: string; data: any } | null }> => {
  const uid = rp.uid
  if (rp.repairedUserUid && usersMap.value[rp.repairedUserUid]) {
    return { targetUid: rp.repairedUserUid, viaPhoneMatch: null }
  }
  if (usersMap.value[uid]) return { targetUid: uid, viaPhoneMatch: null }

  const userSnap = await getDoc(doc(db, 'users', uid))
  if (userSnap.exists()) {
    usersMap.value[uid] = userSnap.data()
    return { targetUid: uid, viaPhoneMatch: null }
  }

  const normalized = normalizePhone(rp.phoneRef || rp.phone || rp.submittedPhone)
  if (!normalized) return { targetUid: uid, viaPhoneMatch: null }

  const cached = phoneMatchCache.value[normalized]
  const found = cached !== undefined ? cached : await findUserByPhone(normalized)
  phoneMatchCache.value[normalized] = found ?? null
  if (!found) return { targetUid: uid, viaPhoneMatch: null }

  warnMissingUserProfile({ ...rp, __foundUserByPhoneUid: found.uid })
  usersMap.value[found.uid] = found.data
  return { targetUid: found.uid, viaPhoneMatch: found }
}

const confirmPhoneMatchUsage = (rp: any, found: { uid: string; data: any }) => {
  const phone = rp.phoneRef || rp.phone || rp.submittedPhone || ''
  return confirm(
    `Report UID khác hồ sơ ví. Cộng xu vào hồ sơ tìm theo SĐT này?\n\n` +
    `UID report: ${rp.uid}\nUID user tìm thấy: ${found.uid}\nSĐT: ${phone}\n` +
    `Ví hiện tại: ${(found.data?.balance || 0).toLocaleString('vi-VN')} XU`
  )
}

// Đánh dấu report đã được ghi vào ví tìm theo SĐT — để lần sau (hiển thị lẫn thao tác
// cộng xu tiếp theo) nhận diện đúng ví thật, không hỏi lại / không tạo trùng ví nữa.
const markRepairedByPhone = (rp: any, foundUid: string) => ({
  repairedUserUid: foundUid,
  originalReportUid: rp.uid,
  repairedByPhone: true,
  repairedAt: serverTimestamp()
})

const fixUserWallet = async (rp: any) => {
  const uid = rp?.uid
  if (!uid) { alert('Đơn này thiếu UID user, không thể sửa ví.'); return }

  const { targetUid, viaPhoneMatch } = await resolveUserTarget(rp)
  if (viaPhoneMatch && !confirmPhoneMatchUsage(rp, viaPhoneMatch)) return

  const currentVal = usersMap.value[targetUid]?.balance || 0;
  const newVal = prompt(`Khách đang có: ${currentVal} XU.\n\nNhập số tiền chuẩn để sửa ví (CHỈ NHẬP SỐ):`, "0");
  if (newVal !== null) {
    let cleanNum = Number(newVal.replace(/\D/g, '')) || 0;
    try {
      const userRef = doc(db, "users", targetUid)
      // Gộp exists-check + ghi vào cùng 1 transaction để không có khoảng hở giữa lúc kiểm
      // tra và lúc ghi (dù đây là ghi đè có chủ đích của admin, vẫn cần atomic để không bao
      // giờ đọc nhầm trạng thái "chưa tồn tại" của một ví vừa được tạo bởi thao tác khác).
      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef)
        if (userSnap.exists()) {
          tx.update(userRef, { balance: cleanNum })
        } else {
          warnMissingUserProfile(rp)
          tx.set(userRef, buildFallbackUserProfile({ ...rp, uid: targetUid }, cleanNum), { merge: true })
        }
      })
      if (viaPhoneMatch) {
        await updateDoc(doc(db, 'reports', rp.id), markRepairedByPhone(rp, targetUid)).catch(() => {})
      }
      usersMap.value[targetUid] = (await getDoc(userRef)).data()
      alert(`🎉 Đã sửa ví khách thành công: ${cleanNum} XU!`);
    } catch (e) { alert("Lỗi: " + e); }
  }
}

const congXu = async (rp: any) => {
  const uid = rp?.uid
  if (!uid) { Swal.fire({ icon: 'error', title: 'Thiếu UID', text: 'Đơn này thiếu UID user, không thể cộng xu tự động.' }); return }

  const { targetUid, viaPhoneMatch } = await resolveUserTarget(rp)
  if (viaPhoneMatch && !confirmPhoneMatchUsage(rp, viaPhoneMatch)) return

  const username = usersMap.value[targetUid]?.username || usersMap.value[targetUid]?.fullName || rp.fullName || targetUid
  const currentVal = usersMap.value[targetUid]?.balance || 0
  const { value: inputVal, isConfirmed } = await Swal.fire({
    title: 'Cộng xu cho tài khoản',
    html: `<div style="margin-bottom:8px;color:#aaa">User: <b style="color:#fff">${username}</b> — Hiện có: <b style="color:#facc15">${currentVal.toLocaleString('vi-VN')} XU</b></div>`,
    input: 'number',
    inputPlaceholder: 'Nhập số xu muốn cộng',
    inputAttributes: { min: '1', step: '1' },
    showCancelButton: true,
    cancelButtonText: 'Hủy',
    confirmButtonText: 'Xác nhận cộng xu',
    confirmButtonColor: '#10b981',
    inputValidator: (value) => {
      if (!value) return 'Vui lòng nhập số xu'
      const num = Number(value)
      if (!Number.isInteger(num) || num <= 0) return 'Chỉ nhập số nguyên dương lớn hơn 0'
    }
  })
  if (!isConfirmed || !inputVal) return
  const amount = Math.floor(Number(inputVal))
  try {
    const userRef = doc(db, 'users', targetUid)
    const preSnap = await getDoc(userRef)
    if (!preSnap.exists() && !hasSubmitterIdentity(rp)) {
      Swal.fire({ icon: 'error', title: 'Thiếu hồ sơ ví', text: 'Đơn này thiếu hồ sơ ví và thiếu thông tin người nộp. Vui lòng tạo/gắn hồ sơ ví trước khi cộng xu.' })
      return
    }
    // Gộp exists-check + ghi vào cùng 1 transaction: nếu ví vừa được tạo/cộng xu bởi thao
    // tác khác trong lúc admin đang xem dialog xác nhận, đọc lại ở đây sẽ thấy đã tồn tại
    // và dùng increment (an toàn) thay vì setDoc(balance:amount) đè mất dữ liệu vừa tạo.
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef)
      if (userSnap.exists()) {
        tx.update(userRef, { balance: increment(amount) })
      } else {
        warnMissingUserProfile(rp)
        tx.set(userRef, buildFallbackUserProfile({ ...rp, uid: targetUid }, amount), { merge: true })
      }
    })
    if (viaPhoneMatch) {
      await updateDoc(doc(db, 'reports', rp.id), markRepairedByPhone(rp, targetUid)).catch(() => {})
    }
    usersMap.value[targetUid] = (await getDoc(userRef)).data()
    addDoc(collection(db, 'admin_notes'), {
      dateLabel: new Date().toLocaleDateString('vi-VN'),
      content: `Admin cộng ${amount.toLocaleString('vi-VN')} xu cho ${username}`,
      totalToday: 0,
      createdAt: new Date()
    }).catch(() => {})
    // Ghi log biến động ví (best-effort — không được phép làm hỏng luồng cộng xu)
    addDoc(collection(db, 'coin_transactions'), {
      uid: targetUid,
      type: 'manual_add',
      delta: amount,
      beforeCoins: currentVal,
      afterCoins: currentVal + amount,
      reason: 'Admin cộng xu thủ công',
      createdBy: auth.currentUser?.uid || 'admin',
      createdAt: serverTimestamp()
    }).catch(() => {})
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã cộng xu thành công', showConfirmButton: false, timer: 2500 })
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Lỗi', text: String(e) })
  }
}

// Tạo hồ sơ ví thủ công cho report có uid nhưng chưa có users/{uid} — nút "TẠO HỒ SƠ VÍ".
// Chỉ tạo mới khi chắc chắn không có hồ sơ nào khớp SĐT (kiểm tra lại phòng khi cache nền
// chưa kịp chạy xong), để tránh tạo trùng ví.
const createWalletProfile = async (rp: any) => {
  const uid = rp?.uid
  if (!uid) { alert('Đơn này thiếu UID, không thể tạo hồ sơ ví.'); return }
  if (usersMap.value[uid]) { alert('User này đã có hồ sơ ví.'); return }

  // usersMap chỉ là cache lười (VD: vừa search xong, hydrate chưa kịp chạy) — phải
  // kiểm tra sống trước khi tạo mới, nếu không setDoc({merge:true}) bên dưới với
  // balance:0 tường minh sẽ ghi đè mất balance thật của user.
  const userRef = doc(db, 'users', uid)
  const liveSnap = await getDoc(userRef)
  if (liveSnap.exists()) {
    usersMap.value[uid] = liveSnap.data()
    alert('User này đã có hồ sơ ví (vừa đồng bộ lại, không tạo mới để tránh mất dữ liệu).')
    return
  }

  const normalized = normalizePhone(rp.phoneRef || rp.phone || rp.submittedPhone)
  const found = normalized ? await findUserByPhone(normalized) : null
  if (normalized) phoneMatchCache.value[normalized] = found ?? null
  if (found) {
    usersMap.value[found.uid] = found.data
    alert(`Đã tìm thấy hồ sơ ví theo SĐT (UID: ${found.uid}). Dùng nút "GẮN VÀO HỒ SƠ VÍ TÌM THẤY" thay vì tạo mới để tránh trùng ví.`)
    return
  }

  if (!confirm(`Tạo hồ sơ ví cho UID: ${uid}?`)) return
  try {
    warnMissingUserProfile(rp)
    // confirm() ở trên là dialog chờ người dùng bấm, có thể mất vài giây — trong lúc đó
    // ví có thể vừa được tạo/cộng xu bởi thao tác khác (VD: admin khác duyệt đơn này).
    // Đọc liveSnap ở trên không đủ vì không atomic với setDoc bên dưới, nên phải tự kiểm
    // tra lại NGAY TRƯỚC KHI GHI trong transaction — nếu doc đã tồn tại thì bỏ qua, không
    // ghi đè balance:0 lên ví vừa được tạo trong lúc chờ xác nhận.
    let created = false
    await runTransaction(db, async (tx) => {
      const freshSnap = await tx.get(userRef)
      if (freshSnap.exists()) return
      tx.set(userRef, buildFallbackUserProfile(rp, 0), { merge: true })
      created = true
    })
    const snap = await getDoc(userRef)
    if (snap.exists()) usersMap.value[uid] = snap.data()
    alert(created
      ? '🎉 Đã tạo hồ sơ ví cho user!'
      : 'User này vừa có hồ sơ ví (được tạo trong lúc chờ xác nhận) — không tạo mới để tránh mất dữ liệu.')
  } catch (e) { alert('Lỗi tạo hồ sơ ví: ' + e) }
}

// Gắn report vào hồ sơ ví thật tìm được theo SĐT — KHÔNG cộng xu, chỉ đánh dấu để các thao
// tác cộng xu/duyệt sau này (và hiển thị) tự nhận đúng ví, tránh phải hỏi lại/tạo trùng ví.
const linkReportToFoundUser = async (rp: any, found: { uid: string; data: any } | undefined) => {
  if (!found) return
  if (!confirm(`Gắn đơn này vào hồ sơ ví UID: ${found.uid}?`)) return
  try {
    await updateDoc(doc(db, 'reports', rp.id), markRepairedByPhone(rp, found.uid))
    warnMissingUserProfile({ ...rp, __foundUserByPhoneUid: found.uid })
    usersMap.value[found.uid] = found.data
    alert('🎉 Đã gắn đơn vào hồ sơ ví tìm thấy!')
  } catch (e) { alert('Lỗi: ' + e) }
}

// ============================================================================
// GẮN HỒ SƠ VÍ THỦ CÔNG — admin chủ động tìm user thật theo SĐT/tên/UID để gắn vào
// report cũ thiếu hồ sơ, thay vì chỉ trông chờ auto-detect theo SĐT ở trên.
// ============================================================================
const walletLinkModal = ref<{ open: boolean; report: any | null }>({ open: false, report: null })
const walletLinkQuery = ref('')
const walletLinkResults = ref<Array<{ uid: string; data: any }>>([])
const walletLinkLoading = ref(false)
const walletLinkError = ref('')

const openWalletLinkModal = (rp: any) => {
  walletLinkModal.value = { open: true, report: rp }
  walletLinkQuery.value = ''
  walletLinkResults.value = []
  walletLinkError.value = ''
}

const closeWalletLinkModal = () => {
  walletLinkModal.value = { open: false, report: null }
}

// Tìm user thật theo UID trực tiếp / SĐT / tên đăng nhập / họ tên — KHÔNG bao giờ dùng
// friendPhone/friendName vì đó là thông tin bạn bè được giới thiệu, không phải chủ ví.
const searchUsersToLink = async () => {
  const text = walletLinkQuery.value.trim()
  if (!text) return
  walletLinkLoading.value = true
  walletLinkError.value = ''
  const found: Record<string, { uid: string; data: any }> = {}
  try {
    try {
      const directSnap = await getDoc(doc(db, 'users', text))
      if (directSnap.exists()) found[directSnap.id] = { uid: directSnap.id, data: directSnap.data() }
    } catch {}

    const normalized = normalizePhone(text)
    if (normalized.length >= 6) {
      for (const field of ['phone', 'phoneRef', 'phoneNormalized']) {
        try {
          const snap = await getDocs(query(collection(db, 'users'), where(field, '==', normalized), limit(5)))
          snap.docs.forEach(d => { found[d.id] = { uid: d.id, data: d.data() } })
        } catch {}
      }
    }

    for (const field of ['username', 'fullName']) {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where(field, '==', text), limit(5)))
        snap.docs.forEach(d => { found[d.id] = { uid: d.id, data: d.data() } })
      } catch {}
    }

    walletLinkResults.value = Object.values(found)
    if (walletLinkResults.value.length === 0) walletLinkError.value = 'Không tìm thấy user nào khớp SĐT/tên/UID.'
  } catch (e) {
    walletLinkError.value = 'Lỗi tìm kiếm: ' + e
  } finally {
    walletLinkLoading.value = false
  }
}

const confirmWalletLink = async (candidate: { uid: string; data: any }) => {
  const rp = walletLinkModal.value.report
  if (!rp) return
  const candidateName = candidate.data?.fullName || candidate.data?.username || 'Chưa cập nhật'
  if (!confirm(`Gắn đơn này (UID gốc: ${rp.uid}) vào hồ sơ ví UID: ${candidate.uid} (${candidateName})?`)) return
  try {
    await updateDoc(doc(db, 'reports', rp.id), {
      repairedUserUid: candidate.uid,
      originalReportUid: rp.uid,
      repairedByAdmin: true,
      repairedAt: serverTimestamp(),
    })
    usersMap.value[candidate.uid] = candidate.data
    console.warn('Manual wallet link by admin', { reportId: rp.id, originalReportUid: rp.uid, repairedUserUid: candidate.uid })
    alert('🎉 Đã gắn hồ sơ ví thành công!')
    closeWalletLinkModal()
  } catch (e) { alert('Lỗi gắn hồ sơ ví: ' + e) }
}

const approveReport = async (report: any) => {
  const isLpbankReferral = report.jobId === 'referral_lpbank'

  if (!report.uid) { alert("Đơn này thiếu UID user, không thể cộng xu tự động."); return }

  const { targetUid, viaPhoneMatch } = await resolveUserTarget(report)
  if (viaPhoneMatch && !confirmPhoneMatchUsage(report, viaPhoneMatch)) return

  let rewardValue: number
  if (isLpbankReferral) {
    // Reward thật được tính trong transaction lúc duyệt — đây chỉ là số dự kiến cho dialog xác nhận.
    const successCountBefore = Number(usersMap.value[targetUid]?.lpbankReferralPaidCount || 0)
    rewardValue = getLpbankReferralRewardByCount(successCountBefore)
  } else {
    const cleanRewardString = String(report.reward || '0').replace(/\D/g, '');
    rewardValue = Number(cleanRewardString) || 0;
  }

  const currentBalance = usersMap.value[targetUid]?.balance || 0;
  const confirmLabel = isLpbankReferral ? 'dự kiến' : ''
  if (!confirm(`XÁC NHẬN DUYỆT ĐƠN NÀY?\n\n+ Tiền cộng${confirmLabel ? ' (' + confirmLabel + ')' : ''}: ${rewardValue.toLocaleString()} XU\n+ Ví cũ đang có: ${currentBalance.toLocaleString()} XU\n👉 TỔNG TIỀN MỚI${confirmLabel ? ' (' + confirmLabel + ')' : ''}: ${(currentBalance + rewardValue).toLocaleString()} XU`)) return;

  try {
    // Dùng chung transaction với bulk approve: đọc lại status mới nhất ngay trước khi ghi
    // (chống duyệt trùng nếu bấm 2 lần / admin khác duyệt cùng lúc), và không cần đọc lại
    // user doc riêng sau khi ghi — cập nhật usersMap tại chỗ từ kết quả transaction.
    const outcome = isLpbankReferral
      ? await approveLpbankReferralReportTx(report.id, targetUid)
      : await approveOneReportTx(report.id, targetUid)

    if (outcome.outcome === 'skipped') {
      alert("ĐƠN NÀY ĐÃ ĐƯỢC XỬ LÝ TRƯỚC ĐÓ, KHÔNG THỂ DUYỆT LẠI.");
      return
    }
    if (outcome.outcome === 'error') {
      if (outcome.reason === 'missing-uid') {
        alert("Đơn này thiếu UID user, không thể cộng xu tự động.");
      } else if (outcome.reason === 'missing-profile-info') {
        alert("Đơn này thiếu hồ sơ ví và thiếu thông tin người nộp. Vui lòng tạo/gắn hồ sơ ví trước khi cộng xu.");
      } else {
        alert("LỖI KHI DUYỆT: không tìm thấy đơn.");
      }
      return
    }

    if (outcome.repaired) {
      // users/{uid} chưa tồn tại trước đó — transaction đã tự tạo hồ sơ ví tối thiểu
      // kèm reward, nên cập nhật cache tại chỗ từ chính report thay vì đọc lại Firestore.
      usersMap.value[outcome.targetUid] = {
        ...buildFallbackUserProfile({ ...report, uid: outcome.targetUid }, outcome.rewardValue),
        ...(isLpbankReferral ? { lpbankReferralPaidCount: 1 } : {})
      }
      alert("ĐÃ DUYỆT VÀ CỘNG XU THÀNH CÔNG! (Đã tự động tạo hồ sơ ví vì user chưa có sẵn)");
    } else {
      usersMap.value[outcome.targetUid] = {
        ...(usersMap.value[outcome.targetUid] || {}),
        balance: (usersMap.value[outcome.targetUid]?.balance || 0) + outcome.rewardValue,
        ...(isLpbankReferral ? { lpbankReferralPaidCount: (usersMap.value[outcome.targetUid]?.lpbankReferralPaidCount || 0) + 1 } : {})
      }
      alert(outcome.targetUid !== report.uid
        ? "ĐÃ DUYỆT VÀ CỘNG XU THÀNH CÔNG VÀO HỒ SƠ VÍ TÌM THEO SĐT!"
        : "ĐÃ DUYỆT VÀ CỘNG XU THÀNH CÔNG!");
    }
    // Ghi log biến động ví (best-effort — không được phép làm hỏng luồng duyệt đơn)
    addDoc(collection(db, 'coin_transactions'), {
      uid: outcome.targetUid,
      type: 'admin_approve',
      delta: outcome.rewardValue,
      beforeCoins: currentBalance,
      afterCoins: currentBalance + outcome.rewardValue,
      reportId: report.id,
      reason: report.jobName || report.jobId || '',
      createdBy: auth.currentUser?.uid || 'admin',
      createdAt: serverTimestamp()
    }).catch(() => {})
    updateLocalStatsOnApprove(outcome.report);
  } catch (error) { alert("LỖI KHI DUYỆT: " + error) }
}

const deleteReport = async (id: string) => {
  if (confirm("BẠN CÓ CHẮC CHẮN MUỐN XÓA VĨNH VIỄN ĐƠN NÀY?")) {
    try { await deleteDoc(doc(db, "reports", id)) } catch(error) { alert("LỖI XÓA ĐƠN: " + error) }
  }
}

const approveWithdrawal = async (item: any) => {
  const displayAmount = getVndAmount(item);
  
  const { isConfirmed } = await Swal.fire({
    title: 'XÁC NHẬN ĐÃ CHUYỂN KHOẢN?',
    text: `Đã chuyển khoản ${displayAmount.toLocaleString('vi-VN')} VNĐ cho khách này?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ĐÃ CHUYỂN',
    confirmButtonColor: '#10b981',
    cancelButtonText: 'HỦY'
  });

  if (isConfirmed) {
    try {
      await updateDoc(doc(db, "withdrawals", item.id), { status: 'approved' });
      await updateDoc(doc(db, "users", item.uid), { hasPendingWithdraw: false });

      setTimeout(() => {
        Swal.fire({
          title: 'HOÀN TẤT CHUYỂN KHOẢN! 🎉',
          text: 'Chúc mừng bạn đã duyệt rút tiền thành công. Hãy nhắc khách kiểm tra nhé!',
          icon: 'success',
          confirmButtonText: 'TUYỆT VỜI',
          confirmButtonColor: '#10b981'
        });
      }, 200);

    } catch (error: any) {
      Swal.fire('Lỗi rùi!', error.message, 'error');
    }
  }
}

const rejectWithdrawal = async (item: any) => {
  const { value: note, isConfirmed } = await Swal.fire({
    title: 'TỪ CHỐI RÚT TIỀN',
    text: 'Nhập lý do từ chối. Hệ thống sẽ TỰ ĐỘNG HOÀN XU lại vào ví.',
    input: 'text',
    inputPlaceholder: 'VD: Sai thông tin ngân hàng...',
    showCancelButton: true,
    confirmButtonColor: '#ef4444'
  })

  if (isConfirmed) {
    try {
      await updateDoc(doc(db, "withdrawals", item.id), { status: 'rejected', adminNote: note || 'Quản trị viên từ chối' })
      const refundAmount = getXuAmount(item);

      await updateDoc(doc(db, "users", item.uid), {
        balance: increment(refundAmount),
        hasPendingWithdraw: false
      })
      // Ghi log biến động ví (best-effort)
      addDoc(collection(db, 'coin_transactions'), {
        uid: item.uid,
        type: 'withdraw_refund',
        delta: refundAmount,
        withdrawalId: item.id,
        reason: 'Hoàn xu do từ chối rút tiền',
        createdBy: auth.currentUser?.uid || 'admin',
        createdAt: serverTimestamp()
      }).catch(() => {})

      Swal.fire('Đã hủy & Hoàn xu!', `User đã nhận lại ${refundAmount.toLocaleString('vi-VN')} XU vào ví.`, 'success')
    } catch (error: any) { Swal.fire('Lỗi!', error.message, 'error') }
  }
}

const deleteWithdrawal = async (id: string) => {
  if (confirm("XÓA LỊCH SỬ RÚT TIỀN NÀY? LƯU Ý LÀ SẼ KHÔNG HOÀN TIỀN!")) {
    try { await deleteDoc(doc(db, "withdrawals", id)) } catch(error) { alert("LỖI XÓA ĐƠN: " + error) }
  }
}

const formatDate = (timestamp: any) => {
  if (!timestamp) return ''
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return `${d.getHours()}:${d.getMinutes()} - ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

const toMs = (t: any) => t?.toDate ? t.toDate().getTime() : new Date(t || 0).getTime()
const parseExifDate = (d: any) => { if (!d) return null; const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt }
const isOldPhoto = (dateTaken: any, createdAt: any) => { const shot = parseExifDate(dateTaken); if (!shot) return false; return (toMs(createdAt) - shot.getTime()) / 86400000 > 7 }
const fmtDate = (d: any) => { const dt = parseExifDate(d); if (!dt) return ''; return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
const hasOldPhoto = (arr: any[], createdAt: any) => Array.isArray(arr) && arr.some(e => isOldPhoto(e?.dateTaken, createdAt))

const shortUid = (uid: string | undefined | null) => uid ? `${uid.slice(0, 6)}...${uid.slice(-4)}` : ''

const describeUserDoc = (rp: any, userDoc: any) => ({
  state: 'direct' as const,
  fullName: userDoc?.username || userDoc?.fullName || rp?.fullName || 'Chưa cập nhật',
  birth: userDoc?.dateOfBirth || userDoc?.dob || userDoc?.ngaysinh || rp?.birthYear || rp?.yearOfBirth || 'Khách cũ',
  balanceLabel: `${(userDoc?.balance || 0).toLocaleString('vi-VN')} XU`,
})

// users/{uid} có thể chưa được tạo (report cũ, hoặc user thiếu hồ sơ) — không để ô
// "TÀI KHOẢN GỐC" hiện trống. Ưu tiên: đã gắn thủ công theo SĐT (repairedUserUid) → user
// doc đúng UID → tìm thấy khớp SĐT (đang chờ admin xác nhận gắn, hiện balance thật để
// admin đối chiếu nhưng KHÔNG tự nhận là tài khoản gốc) → fallback từ report.
type AccountDisplay = {
  state: 'direct' | 'no-match' | 'checking' | 'phone-match' | 'repaired'
  fullName: string
  birth: string
  balanceLabel: string
  match?: { uid: string; data: any }
}

const getAccountDisplay = (rp: any): AccountDisplay => {
  if (rp?.repairedUserUid && usersMap.value[rp.repairedUserUid]) {
    return {
      ...describeUserDoc(rp, usersMap.value[rp.repairedUserUid]),
      state: 'repaired',
      match: { uid: rp.repairedUserUid, data: usersMap.value[rp.repairedUserUid] },
    }
  }
  if (rp?.uid && usersMap.value[rp.uid]) {
    return describeUserDoc(rp, usersMap.value[rp.uid])
  }

  const fallbackName = rp?.fullName || rp?.name || rp?.reportFullName || 'Chưa cập nhật'
  const fallbackBirth = rp?.birthYear || rp?.yearOfBirth || 'Khách cũ'

  const normalized = normalizePhone(rp?.phoneRef || rp?.phone || rp?.submittedPhone)
  if (!normalized) {
    return { state: 'no-match', fullName: fallbackName, birth: fallbackBirth, balanceLabel: 'Chưa có hồ sơ ví' }
  }
  const cached = phoneMatchCache.value[normalized]
  if (cached === undefined) {
    return { state: 'checking', fullName: fallbackName, birth: fallbackBirth, balanceLabel: 'Đang kiểm tra hồ sơ theo SĐT...' }
  }
  if (cached) {
    return {
      state: 'phone-match',
      fullName: fallbackName,
      birth: fallbackBirth,
      balanceLabel: `${(cached.data?.balance || 0).toLocaleString('vi-VN')} XU (hồ sơ tìm theo SĐT)`,
      match: cached,
    }
  }
  return { state: 'no-match', fullName: fallbackName, birth: fallbackBirth, balanceLabel: 'Chưa có hồ sơ ví' }
}

const handleAdminLogout = async () => {
  if(confirm('XÁC NHẬN THOÁT ADMIN?')) { await signOut(auth); router.push('/login') }
}
</script>

<template>
  <div class="min-h-screen bg-[#090e17] flex flex-col items-center justify-center" v-if="isCheckingAuth">
      <div class="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="mt-4 text-blue-500 font-black italic uppercase tracking-widest text-sm">Đang xác minh Admin...</p>
  </div>

  <div class="min-h-screen bg-[#090e17] p-4 md:p-10 font-black italic uppercase text-left selection:bg-blue-500/30 relative" v-else>
    
    <Transition name="fade">
      <div class="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out" v-if="selectedImage" @click="closeImage">
        <button class="absolute top-6 right-6 md:top-10 md:right-10 w-12 h-12 bg-slate-800 border border-slate-700 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors z-[6010] shadow-2xl" @click.stop="closeImage">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
        <img class="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-[6005] cursor-default" :src="selectedImage" @click.stop />
      </div>
    </Transition>

    <Transition name="fade">
      <div class="fixed inset-0 z-[5000] flex items-center justify-center px-4" v-if="showRejectPopup">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="closeRejectPopup"></div>
        <div class="relative bg-[#111726] border border-red-500/30 w-full max-w-md p-6 rounded-2xl shadow-2xl text-center">
          <h3 class="text-xl text-red-500 mb-4 tracking-tight">TỪ CHỐI BẰNG CHỨNG</h3>
          <p class="text-slate-400 text-xs normal-case not-italic font-bold mb-4">Vui lòng nhập lý do từ chối để khách hàng biết.</p>
          <textarea class="w-full bg-[#0d121f] text-white border border-slate-700 rounded-xl p-3 mb-6 focus:outline-none focus:border-red-500 font-sans normal-case not-italic text-sm" v-model="rejectReason" rows="3" placeholder="Ví dụ: Ảnh mờ, Sai thông tin..."></textarea>
          <div class="flex gap-3 justify-end">
            <button class="px-5 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs transition-colors" @click="closeRejectPopup">HỦY BỎ</button>
            <button class="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs shadow-lg transition-colors" @click="confirmReject">XÁC NHẬN TỪ CHỐI</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div class="fixed inset-0 z-[5000] flex items-center justify-center px-4" v-if="showMessagePopup">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="closeMessagePopup"></div>
        <div class="relative bg-[#111726] border border-blue-500/30 w-full max-w-md p-6 rounded-2xl shadow-2xl text-center">
          <h3 class="text-xl text-blue-500 mb-4 tracking-tight">GỬI LỜI NHẮN (ĐƠN VẪN CHỜ)</h3>
          <p class="text-slate-400 text-xs normal-case not-italic font-bold mb-4">Lời nhắn sẽ hiển thị cho khách nhưng đơn không bị Hủy.</p>
          <textarea class="w-full bg-[#0d121f] text-white border border-slate-700 rounded-xl p-3 mb-6 focus:outline-none focus:border-blue-500 font-sans normal-case not-italic text-sm" v-model="messageText" rows="3" placeholder="Ví dụ: Bạn nhắn tin cho Admin để kiểm tra lại nhé..."></textarea>
          <div class="flex gap-3 justify-end">
            <button class="px-5 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs transition-colors" @click="closeMessagePopup">HỦY BỎ</button>
            <button class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs shadow-lg transition-colors" @click="confirmMessage">GỬI LỜI NHẮN</button>
          </div>
        </div>
      </div>
    </Transition>

    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <div>
        <h1 class="text-3xl md:text-5xl text-white tracking-tighter leading-none">HỆ THỐNG <span class="text-blue-500">ADMIN</span></h1>
      </div>
      
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1 bg-[#111726] p-1.5 rounded-xl border border-slate-800 focus-within:border-blue-500 transition-colors">
          <input class="bg-[#0d121f] text-white text-[10px] py-2 px-3 rounded-lg border border-slate-700 outline-none w-[170px] md:w-[200px] placeholder:text-slate-600 font-sans not-italic normal-case" v-model="searchQuery" @keyup.enter="handleSearch" type="text" placeholder="🔎 Username/SĐT... VD: id:min" />
          <button class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-[10px] font-black transition-colors" @click="handleSearch">TÌM</button>
          <button class="bg-slate-700 hover:bg-slate-600 text-white px-2 py-2 rounded-lg text-[10px] font-black transition-colors" v-if="searchQuery" @click="searchQuery = ''; handleSearch()">✕</button>
        </div>
        <span v-if="lastSearchedKeywordLower" class="text-[10px] text-slate-500 not-italic normal-case font-semibold">
          Đang tìm kiếm: <span class="text-blue-400 font-black">{{ searchQuery }}</span>
        </span>

        <div class="flex items-center gap-2 bg-[#111726] p-1.5 rounded-xl border border-slate-800">
          <span class="text-[10px] text-emerald-500 tracking-[2px] ml-2 hidden md:inline">TRẠNG THÁI:</span>
          <select class="bg-[#0d121f] text-white text-[10px] py-2 px-3 rounded-lg border border-slate-700 outline-none cursor-pointer" v-model="statusFilter">
            <option value="pending">⏳ ĐANG CHỜ DUYỆT</option>
            <option value="all">📚 TẤT CẢ LỊCH SỬ</option>
            <option value="approved">✅ ĐÃ DUYỆT</option>
            <option value="rejected">❌ BỊ HỦY</option>
          </select>
        </div>

        <button class="bg-slate-800 text-white px-6 py-2.5 rounded-xl text-[10px] hover:bg-red-600 transition-colors" @click="handleAdminLogout">THOÁT</button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-12 gap-4 mb-8">
      <div class="md:col-span-4 flex flex-col gap-4">
        <div class="flex-1 bg-gradient-to-br from-[#111726] to-[#0d121f] border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
          <div class="absolute -right-4 -top-4 text-7xl opacity-5 group-hover:scale-110 transition-transform">📊</div>
          <div class="flex justify-between items-start mb-2">
            <p class="text-slate-500 text-[10px] font-black tracking-widest uppercase">TỔNG DUYỆT HÔM NAY</p>
            <div class="flex gap-2">
               <button class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)] active:scale-95 flex items-center gap-1.5" @click="saveDailyNote">
                  📝 CHỐT SỔ
               </button>
               <button class="text-slate-400 hover:text-blue-500 active:scale-90 transition-transform bg-[#090e17] p-2 md:p-2.5 rounded-xl border border-slate-700/50 shadow-inner" @click="loadDashboardStats" title="Làm mới số liệu">
                 <svg :class="['w-4 h-4 md:w-5 md:h-5', isStatsLoading ? 'animate-spin text-blue-500' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
               </button>
            </div>
          </div>
          <div class="text-3xl md:text-4xl text-emerald-400 font-black drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
            {{ isStatsLoading ? '...' : statsTodayTotal }} <span class="text-sm text-slate-600 font-bold uppercase tracking-widest">Đơn</span>
          </div>
        </div>

        <div class="flex-1 bg-gradient-to-br from-[#111726] to-[#0d121f] border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
          <div class="absolute -right-4 -top-4 text-7xl opacity-5 group-hover:scale-110 transition-transform">📱</div>
          <p class="text-slate-500 text-[10px] font-black tracking-widest mb-2 uppercase">APP NGÂN HÀNG HÔM NAY</p>
          <div class="text-3xl md:text-4xl text-blue-400 font-black drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]">
            {{ isStatsLoading ? '...' : statsTodayAppTotal }} <span class="text-sm text-slate-600 font-bold uppercase tracking-widest">Đơn</span>
          </div>
        </div>
      </div>

      <div class="md:col-span-8 bg-gradient-to-br from-[#111726] to-[#0d121f] border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <p class="text-slate-500 text-[10px] font-black tracking-widest mb-4 uppercase flex items-center gap-2">
          <span>CHI TIẾT ĐỐI SOÁT CÁC CHIẾN DỊCH APP</span>
          <span class="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-[8px] border border-blue-500/30">LIVE</span>
        </p>
        
        <div class="flex justify-center items-center py-6" v-if="isStatsLoading">
          <div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3" v-else>
          <div class="bg-[#090e17] border border-slate-700/50 rounded-xl p-4 flex flex-col gap-2 shadow-inner" v-for="(data, jobId) in statsAppBreakdown" :key="jobId">
            <div :class="['text-[10px] md:text-xs font-black tracking-widest uppercase border-b border-slate-800 pb-2', data.group === 'bank' ? 'text-emerald-400' : 'text-blue-400']">{{ data.label }}</div>
            <div class="flex justify-between items-center mt-1">
              <span class="text-slate-500 text-[10px] uppercase font-bold">Hôm nay:</span>
              <span :class="['text-base font-black', data.today > 0 ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'text-slate-500']">{{ data.today }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mb-8">
      <p class="text-blue-500 text-[10px] font-black tracking-[3px] mb-3 ml-2 flex items-center gap-2">
        <span>📒 SỔ TAY ĐỐI SOÁT LỊCH SỬ</span>
        <span class="text-slate-500 text-[8px] normal-case not-italic font-bold">(Bấm "Chốt Sổ" ở bảng thống kê bên trên để lưu báo cáo ngày)</span>
      </p>
      <div class="bg-[#111726] border border-slate-800 rounded-3xl p-4 overflow-x-auto shadow-2xl relative">
        <table class="w-full text-left">
          <tbody class="divide-y divide-slate-800/50 italic">
            <tr class="group hover:bg-white/[0.02] transition-colors" v-for="note in dailyNotes" :key="note.id">
              <td class="py-3 px-4 whitespace-nowrap text-emerald-400 text-xs font-black">{{ note.dateLabel }}</td>
              <td class="py-3 px-4 text-slate-300 text-[11px] normal-case font-bold tracking-tight w-full">{{ note.content }}</td>
              <td class="py-3 px-4 text-right whitespace-nowrap text-slate-500 text-[10px] font-black uppercase">
                Tổng: <span class="text-white">{{ note.totalToday }}</span> đơn
              </td>
              <td class="py-3 px-4 text-right">
                <button class="text-red-900 group-hover:text-red-500 transition-colors text-lg" @click="deleteNote(note.id)" title="Xóa ghi chú này">✕</button>
              </td>
            </tr>
            <tr v-if="dailyNotes.length === 0">
              <td class="py-10 text-center text-slate-700 text-[10px] tracking-[2px]" colspan="4">CHƯA CÓ LỊCH SỬ ĐỐI SOÁT NÀO TRONG SỔ TAY.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="flex gap-4 mb-6 flex-wrap md:flex-nowrap">
      <button :class="['flex-1 py-4 rounded-xl tracking-widest transition-all text-xs md:text-sm', activeTab === 'app_jobs' ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]' : 'bg-[#111726] text-slate-500 hover:bg-[#1a2335]']" @click="activeTab = 'app_jobs'">
        APP NGÂN HÀNG/CHỨNG KHOÁN ({{ filteredAppReports.length }})
      </button>
      <button :class="['flex-1 py-4 rounded-xl tracking-widest transition-all text-xs md:text-sm', activeTab === 'other_jobs' ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]' : 'bg-[#111726] text-slate-500 hover:bg-[#1a2335]']" @click="activeTab = 'other_jobs'">
        CÁC JOB KHÁC ({{ filteredOtherReports.length }})
      </button>
      <button :class="['flex-1 py-4 rounded-xl tracking-widest transition-all text-xs md:text-sm', activeTab === 'daily_threads' ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.3)]' : 'bg-[#111726] text-slate-500 hover:bg-[#1a2335]']" @click="activeTab = 'daily_threads'">
        🧵 Thread hằng ngày{{ isThreadSearchMode ? ` (${searchThreadResults.length})` : '' }}
      </button>
      <button :class="['flex-1 py-4 rounded-xl tracking-widest transition-all text-xs md:text-sm', activeTab === 'withdrawals' ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-[#111726] text-slate-500 hover:bg-[#1a2335]']" @click="activeTab = 'withdrawals'">
        QUẢN LÝ RÚT TIỀN ({{ filteredWithdrawals.length }})
      </button>
      <button :class="['flex-1 py-4 rounded-xl tracking-widest transition-all text-xs md:text-sm', activeTab === 'vip_jobs_config' ? 'bg-amber-600 text-white shadow-[0_0_20px_rgba(217,119,6,0.3)]' : 'bg-[#111726] text-slate-500 hover:bg-[#1a2335]']" @click="activeTab = 'vip_jobs_config'">
        ⚙️ CẤU HÌNH JOB VIP
      </button>
      <button :class="['flex-1 py-4 rounded-xl tracking-widest transition-all text-xs md:text-sm', activeTab === 'web_config' ? 'bg-violet-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.3)]' : 'bg-[#111726] text-slate-500 hover:bg-[#1a2335]']" @click="activeTab = 'web_config'">
        🌐 CẤU HÌNH WEB
      </button>
      <button :class="['flex-1 py-4 rounded-xl tracking-widest transition-all text-xs md:text-sm', activeTab === 'support_config' ? 'bg-sky-600 text-white shadow-[0_0_20px_rgba(14,165,233,0.3)]' : 'bg-[#111726] text-slate-500 hover:bg-[#1a2335]']" @click="activeTab = 'support_config'">
        💬 HỖ TRỢ / THÔNG BÁO
      </button>
      <button :class="['flex-1 py-4 rounded-xl tracking-widest transition-all text-xs md:text-sm', activeTab === 'basic_jobs_config' ? 'bg-emerald-700 text-white shadow-[0_0_20px_rgba(4,120,87,0.3)]' : 'bg-[#111726] text-slate-500 hover:bg-[#1a2335]']" @click="activeTab = 'basic_jobs_config'">
        ⚙️ CẤU HÌNH JOB CƠ BẢN
      </button>
      <button :class="['flex-1 py-4 rounded-xl tracking-widest transition-all text-xs md:text-sm', activeTab === 'storage_clean' ? 'bg-rose-600 text-white shadow-[0_0_20px_rgba(225,29,72,0.3)]' : 'bg-[#111726] text-slate-500 hover:bg-[#1a2335]']" @click="activeTab = 'storage_clean'">
        🧹 Dọn ảnh Storage
      </button>
    </div>

    <!-- Chip: kết quả Thread khi đang xem tab khác -->
    <div v-if="isThreadSearchMode && activeTab !== 'daily_threads'"
         class="mb-4 flex items-center gap-3 bg-purple-900/20 border border-purple-500/30 rounded-xl px-4 py-2 text-xs">
      <span class="text-purple-300">🧵 Tìm thấy <b class="text-white">{{ searchThreadResults.length }}</b> đơn Thread hằng ngày</span>
      <button class="ml-auto bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-lg transition-all active:scale-95"
              @click="activeTab = 'daily_threads'">
        Xem đơn Thread →
      </button>
    </div>

    <div class="bg-[#111726] border border-slate-800 rounded-[30px] overflow-hidden shadow-2xl relative">
      <div class="p-20 text-center text-blue-500 animate-pulse tracking-widest" v-if="isLoading">ĐANG TẢI DỮ LIỆU BẢNG...</div>
      
      <div class="overflow-x-auto" v-else>
        <Transition name="fade">
          <div class="bg-blue-900/40 border-b border-blue-500/30 p-4 flex justify-between items-center px-6" v-if="activeTab === 'other_jobs' && selectedOtherJobs.length > 0">
            <span class="text-blue-400 font-bold text-sm tracking-widest">
              ĐÃ CHỌN: <span class="text-white text-lg">{{ selectedOtherJobs.length }}</span> ĐƠN
              <span class="text-amber-400 ml-2" v-if="isBulkProcessing">(ĐANG DUYỆT {{ bulkProgress.current }}/{{ bulkProgress.total }}...)</span>
            </span>
            <button class="bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-[10px] md:text-sm tracking-widest font-black transition-all active:scale-95 shadow-[0_0_20px_rgba(59,130,246,0.5)]" :disabled="isBulkProcessing" @click="bulkApproveOtherJobs">
              {{ isBulkProcessing ? 'ĐANG XỬ LÝ...' : 'DUYỆT TẤT CẢ ĐƠN ĐÃ CHỌN 🚀' }}
            </button>
          </div>
        </Transition>

        <table class="w-full text-left border-collapse" v-if="activeTab === 'app_jobs' || activeTab === 'other_jobs'">
          <thead>
            <tr class="bg-[#0d121f] text-blue-500 text-[10px] tracking-[2px] border-b border-slate-800">
              <th class="p-6 text-center w-12" v-if="activeTab === 'other_jobs'">
                <input class="w-5 h-5 cursor-pointer accent-blue-500 bg-[#111726] border-slate-700 rounded disabled:opacity-40 disabled:cursor-not-allowed" type="checkbox" :checked="isAllOtherJobsSelected" :disabled="isBulkProcessing" @change="toggleAllOtherJobs" />
              </th>
              <th class="p-6 min-w-[250px]">NGƯỜI NỘP / TÀI KHOẢN</th>
              <th class="p-6 min-w-[150px]">CÔNG VIỆC</th>
              <th class="p-6 text-center min-w-[150px]">BẰNG CHỨNG</th>
              <th class="p-6 text-center min-w-[120px]">TRẠNG THÁI</th>
              <th class="p-6 text-right min-w-[200px]">HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/50">
            <tr v-for="rp in (activeTab === 'app_jobs' ? filteredAppReports : filteredOtherReports)" :key="rp.id" :class="['hover:bg-white/[0.02] transition-colors group', selectedOtherJobs.includes(rp.id) ? 'bg-blue-900/10' : '']">
              
              <td class="p-6 text-center" v-if="activeTab === 'other_jobs'">
                <input class="w-5 h-5 cursor-pointer accent-blue-500 bg-[#111726] border-slate-700 rounded disabled:opacity-40 disabled:cursor-not-allowed" v-if="rp.status === 'pending'" type="checkbox" :value="rp.id" :disabled="isBulkProcessing" v-model="selectedOtherJobs" />
              </td>

              <td class="p-6">
                <div class="mb-2 pb-2 border-b border-slate-700/50 flex justify-between items-start">
                  <div>
                    <span class="text-[9px] text-emerald-400 tracking-widest block mb-0.5">TÀI KHOẢN GỐC:</span>
                    <div class="text-white text-sm md:text-base font-black truncate max-w-[200px] flex items-center gap-1.5">
                      {{ getAccountDisplay(rp).fullName }}
                      <span v-if="lastSearchedKeywordLower && String(usersMap[rp.uid]?.username || '').toLowerCase() === lastSearchedKeywordLower" class="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full tracking-wide shrink-0">✓ KHỚP CHÍNH XÁC</span>
                    </div>
                    <div class="text-slate-400 text-[10px] mt-0.5 font-sans not-italic tracking-normal">Ví hiện tại: <span class="text-yellow-400 font-black">{{ getAccountDisplay(rp).balanceLabel }}</span></div>
                    <div class="text-slate-400 text-[10px] mt-0.5 font-sans not-italic tracking-normal">
                      Ngày sinh:
                      <span class="text-emerald-400 font-bold uppercase" v-if="usersMap[rp.repairedUserUid || rp.uid]?.dateOfBirth || usersMap[rp.repairedUserUid || rp.uid]?.dob || usersMap[rp.repairedUserUid || rp.uid]?.ngaysinh">{{ usersMap[rp.repairedUserUid || rp.uid]?.dateOfBirth || usersMap[rp.repairedUserUid || rp.uid]?.dob || usersMap[rp.repairedUserUid || rp.uid]?.ngaysinh }}</span>
                      <span class="text-slate-600 italic bg-slate-800/50 px-1 py-0.5 rounded" v-else>{{ getAccountDisplay(rp).birth }}</span>
                    </div>
                    <div class="mt-1" v-if="getAccountDisplay(rp).state === 'repaired'">
                      <span class="text-[8px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded block leading-tight w-fit">
                        ✓ Đã gắn ví thủ công: {{ getAccountDisplay(rp).fullName }}
                      </span>
                      <div class="text-[8px] text-slate-400 mt-0.5 leading-tight">
                        UID gốc của đơn: {{ shortUid(rp.uid) }} · UID ví nhận xu: {{ shortUid(rp.repairedUserUid) }}
                      </div>
                    </div>
                    <div class="mt-1" v-else-if="getAccountDisplay(rp).state !== 'direct'">
                      <template v-if="getAccountDisplay(rp).state === 'phone-match'">
                        <span class="text-[8px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded block leading-tight w-fit">
                          ⚠️ Tìm thấy hồ sơ ví theo SĐT nhưng UID report khác UID user
                        </span>
                        <div class="text-[8px] text-slate-400 mt-0.5 leading-tight">
                          UID report: {{ shortUid(rp.uid) }} · UID user thật: {{ shortUid(getAccountDisplay(rp).match?.uid) }}<br />
                          SĐT: {{ rp.phoneRef || rp.phone || rp.submittedPhone || 'Không có' }} · Ví hiện tại: {{ (getAccountDisplay(rp).match?.data?.balance || 0).toLocaleString('vi-VN') }} XU
                        </div>
                        <button class="mt-1 bg-amber-600/20 text-amber-400 hover:bg-amber-500 hover:text-white border border-amber-600/50 px-2 py-1 rounded-lg text-[8px] transition-all" @click="linkReportToFoundUser(rp, getAccountDisplay(rp).match)">GẮN VÀO HỒ SƠ VÍ TÌM THẤY</button>
                      </template>
                      <template v-else-if="getAccountDisplay(rp).state === 'checking'">
                        <span class="text-[8px] text-slate-500 italic">Đang kiểm tra hồ sơ theo SĐT...</span>
                      </template>
                      <template v-else>
                        <span class="text-[8px] text-red-400 font-bold bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded block leading-tight w-fit">
                          ⚠️ Chưa có hồ sơ user (UID: {{ shortUid(rp.uid) }})
                        </span>
                        <div class="flex gap-1 mt-1">
                          <button class="bg-red-600/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-600/50 px-2 py-1 rounded-lg text-[8px] transition-all" @click="createWalletProfile(rp)">TẠO HỒ SƠ VÍ</button>
                          <button class="bg-blue-600/20 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-600/50 px-2 py-1 rounded-lg text-[8px] transition-all" @click="openWalletLinkModal(rp)">GẮN HỒ SƠ VÍ</button>
                        </div>
                      </template>
                    </div>
                  </div>
                  <div class="flex flex-col items-end gap-1">
                    <button class="bg-yellow-600/20 text-yellow-500 hover:bg-yellow-500 hover:text-white border border-yellow-600/50 px-2 py-1 rounded-lg text-[8px] transition-all" @click="fixUserWallet(rp)">SỬA VÍ</button>
                    <button class="bg-green-600/20 text-green-400 hover:bg-green-500 hover:text-white border border-green-600/50 px-2 py-1 rounded-lg text-[8px] transition-all" @click="congXu(rp)">+ CỘNG XU</button>
                  </div>
                </div>
                <div>
                  <span class="text-[9px] text-blue-400 tracking-widest block mb-0.5">NỘI DUNG ĐƠN NỘP ({{ formatDate(rp.createdAt) }}):</span>
                  <div class="text-slate-300 text-xs font-black truncate max-w-[200px]">{{ rp.fullName || 'N/A' }}</div>
                  <div class="text-slate-500 text-[10px] mt-0.5 font-sans not-italic tracking-normal">SĐT ĐƠN: {{ rp.phoneRef || 'Không có' }}</div>
                  
                  <div class="text-slate-400 text-[10px] mt-0.5 font-sans not-italic tracking-normal">
                    Sinh đơn nộp:
                    <span class="text-yellow-400 font-bold" v-if="rp.birthYear && rp.birthMonth">Tháng {{ rp.birthMonth }}/{{ rp.birthYear }}</span>
                    <span class="text-yellow-400 font-bold" v-else-if="rp.birthYear">{{ rp.birthYear }}</span>
                    <span class="text-slate-600 italic" v-else>Đơn cũ chưa nhập</span>
                  </div>
                  <div v-if="rp.type === 'friend_referral'" class="mt-2 pt-2 border-t border-slate-700/50">
                    <span class="text-[9px] text-fuchsia-400 tracking-widest block mb-0.5">GIỚI THIỆU BẠN BÈ ({{ rp.bankType === 'abbank' ? 'ABBANK' : 'LPBANK' }}):</span>
                    <div class="text-slate-300 text-xs font-black truncate max-w-[200px]">Bạn bè: {{ rp.friendName || 'N/A' }}</div>
                    <div class="text-slate-500 text-[10px] mt-0.5 font-sans not-italic tracking-normal">SĐT bạn bè: {{ rp.friendPhone || 'Không có' }}</div>
                    <div v-if="rp.referralCode" class="text-slate-500 text-[10px] mt-0.5 font-sans not-italic tracking-normal">Mã giới thiệu: {{ rp.referralCode }}</div>
                  </div>
                </div>
              </td>
              <td class="p-6">
                <div class="text-slate-300 text-[11px] leading-tight mb-1">{{ rp.jobName }}</div>
                <template v-if="rp.jobId === 'referral_lpbank' && rp.status === 'pending'">
                  <div class="text-amber-400 text-sm font-black">
                    Thưởng đề xuất: {{ getLpbankReferralRewardByCount(usersMap[rp.uid]?.lpbankReferralPaidCount || 0).toLocaleString('vi-VN') }} XU
                  </div>
                  <div class="text-slate-500 text-[10px] mt-0.5">
                    Lần giới thiệu dự kiến: #{{ (usersMap[rp.uid]?.lpbankReferralPaidCount || 0) + 1 }}
                  </div>
                </template>
                <template v-else-if="rp.jobId === 'referral_lpbank' && (rp.status === 'approved' || rp.status === 'collected')">
                  <div class="text-emerald-400 text-sm font-black">Đã cộng: {{ Number(rp.actualReward ?? rp.reward ?? 0).toLocaleString('vi-VN') }} XU</div>
                  <div v-if="rp.referralSuccessNumber" class="text-slate-500 text-[10px] mt-0.5">Lần giới thiệu: #{{ rp.referralSuccessNumber }}</div>
                </template>
                <template v-else>
                  <div class="text-emerald-400 text-sm font-black">+{{ String(rp.reward).replace(/\D/g, '') }} XU</div>
                </template>
              </td>
              <td class="p-6">
                <div class="flex flex-col items-center gap-2">
                  <div class="flex justify-center gap-2 flex-wrap">
                    <a class="bg-blue-600 text-[8px] text-white p-2 rounded" v-if="rp.taskLink" :href="rp.taskLink" target="_blank">LINK BÀI</a>
                    <div class="cursor-pointer" v-for="(img, idx) in getImageUrls(rp)" :key="idx" @click="openImage(img)">
                      <div class="w-12 h-12 rounded-lg border border-slate-700 overflow-hidden hover:scale-110 hover:border-blue-500 transition-all">
                        <img class="w-full h-full object-cover" :src="img" loading="lazy" decoding="async" />
                      </div>
                    </div>
                    <div class="text-slate-700 text-[9px]" v-if="!getImageUrls(rp).length && !rp.taskLink && !rp.imagesDeleted">KHÔNG CÓ ẢNH</div>
                    <div v-if="rp.imagesDeleted" class="text-slate-500 text-[9px] italic bg-slate-800/50 px-2 py-1 rounded text-center normal-case font-sans not-italic">Ảnh bằng chứng đã được dọn để tiết kiệm dung lượng.</div>
                  </div>
                  <!-- EXIF BADGE — array format -->
                  <template v-if="rp.exif && Array.isArray(rp.exif) && rp.exif.length">
                    <div class="w-full space-y-1">
                      <template v-if="rp.exif.some((e: any) => e.suspicious)">
                        <span class="inline-flex items-center gap-1 bg-red-500/20 border border-red-500/60 text-red-400 text-[8px] font-black px-2 py-1 rounded-full w-full justify-center">⚠️ CẢNH BÁO GIAN LẬN · {{ rp.exif.filter((e: any) => e.suspicious).length }}/{{ rp.exif.length }} ẢNH ĐÁNG NGỜ · {{ rp.exif.find((e: any) => e.suspicious)?.software }}</span>
                      </template>
                      <template v-else-if="rp.exif.some((e: any) => !e.hasExif)">
                        <span class="inline-flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/40 text-yellow-400 text-[8px] font-black px-2 py-1 rounded-full w-full justify-center">⚠️ KHÔNG CÓ EXIF · {{ rp.exif.filter((e: any) => !e.hasExif).length }}/{{ rp.exif.length }} ẢNH</span>
                      </template>
                      <template v-else>
                        <span class="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-black px-2 py-1 rounded-full w-full justify-center">✓ {{ rp.exif[0]?.device || 'Thiết bị thật' }}<template v-if="rp.exif[0]?.dateTaken"> · {{ fmtDate(rp.exif[0].dateTaken) }}</template></span>
                      </template>
                      <span v-if="hasOldPhoto(rp.exif, rp.createdAt)" class="inline-flex items-center gap-1 bg-orange-500/20 border border-orange-500/60 text-orange-400 text-[8px] font-black px-2 py-1 rounded-full w-full justify-center">⚠️ ẢNH CŨ · CHỤP {{ fmtDate(rp.exif.find((e: any) => isOldPhoto(e?.dateTaken, rp.createdAt))?.dateTaken) }}</span>
                    </div>
                  </template>
                  <!-- EXIF BADGE — object format -->
                  <template v-else-if="rp.exif && !Array.isArray(rp.exif)">
                    <div class="w-full space-y-1">
                      <span v-if="rp.exif.suspicious" class="inline-flex bg-red-500/20 border border-red-500/60 text-red-400 text-[8px] font-black px-2 py-1 rounded-full w-full justify-center">⚠️ CẢNH BÁO GIAN LẬN · {{ rp.exif.software }}</span>
                      <span v-else-if="!rp.exif.hasExif" class="inline-flex bg-yellow-500/10 border border-yellow-500/40 text-yellow-400 text-[8px] font-black px-2 py-1 rounded-full w-full justify-center">⚠️ KHÔNG CÓ EXIF</span>
                      <span v-else class="inline-flex bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-black px-2 py-1 rounded-full w-full justify-center">✓ {{ rp.exif.device || 'Thiết bị thật' }}<template v-if="rp.exif.dateTaken"> · {{ fmtDate(rp.exif.dateTaken) }}</template></span>
                      <span v-if="isOldPhoto(rp.exif.dateTaken, rp.createdAt)" class="inline-flex bg-orange-500/20 border border-orange-500/60 text-orange-400 text-[8px] font-black px-2 py-1 rounded-full w-full justify-center">⚠️ ẢNH CŨ · {{ fmtDate(rp.exif.dateTaken) }}</span>
                    </div>
                  </template>
                </div>
              </td>
              <td class="p-6 text-center text-[10px]">
                <span class="bg-yellow-500/10 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/20" v-if="rp.status === 'pending'">ĐANG CHỜ</span>
                <span class="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20" v-else-if="rp.status === 'approved'">ĐÃ DUYỆT</span>
                <span class="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full border border-blue-500/20" v-else-if="rp.status === 'collected'">ĐÃ THU VÍ</span>
                <span class="bg-red-500/10 text-red-500 px-3 py-1 rounded-full border border-red-500/20" v-else>BỊ HỦY</span>
                <div :class="['text-[8px] mt-2 normal-case leading-tight', rp.status === 'rejected' ? 'text-red-400 italic' : 'text-blue-400 font-bold']" v-if="rp.note">LỜI NHẮN: {{ rp.note }}</div>
              </td>
              <td class="p-6 text-right">
                <div class="flex flex-col md:flex-row justify-end gap-2">
                  <template v-if="rp.status === 'pending'">
                    <button class="bg-emerald-500 hover:bg-emerald-400 text-white text-[9px] px-4 py-2 rounded-lg transition-all active:scale-95" @click="approveReport(rp)">DUYỆT</button>
                    <button class="bg-blue-600 hover:bg-blue-500 text-white text-[9px] px-4 py-2 rounded-lg transition-all active:scale-95" @click="openMessagePopup(rp.id)">NHẮN</button>
                    <button class="bg-red-600 hover:bg-red-500 text-white text-[9px] px-4 py-2 rounded-lg transition-all active:scale-95" @click="openRejectPopup(rp.id)">HỦY</button>
                  </template>
                  <button class="bg-slate-800 text-slate-400 hover:text-white text-[9px] px-4 py-2 rounded-lg transition-all active:scale-95" @click="deleteReport(rp.id)">XÓA</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="withdrawalsError && activeTab === 'withdrawals' && !isLoading" class="p-6 text-center text-red-400 text-xs tracking-widest">
          ⚠️ LỖI: {{ withdrawalsError }}
        </div>

        <table class="w-full text-left border-collapse" v-else-if="activeTab === 'withdrawals'">
          <thead>
            <tr class="bg-[#0d121f] text-emerald-500 text-[10px] tracking-[2px] border-b border-slate-800">
              <th class="p-6 min-w-[200px]">NGƯỜI RÚT</th>
              <th class="p-6 min-w-[250px]">QR / NGÂN HÀNG</th>
              <th class="p-6 text-center min-w-[150px]">SỐ TIỀN</th>
              <th class="p-6 text-center min-w-[120px]">TRẠNG THÁI</th>
              <th class="p-6 text-right min-w-[200px]">HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/50">
            <tr class="hover:bg-white/[0.02] transition-colors group" v-for="wd in filteredWithdrawals" :key="wd.id">
              <td class="p-6">
                <div class="text-white text-sm md:text-base font-black flex items-center gap-1.5">
                  {{ usersMap[wd.uid]?.username || 'CHƯA CẬP NHẬT' }}
                  <span v-if="lastSearchedKeywordLower && String(usersMap[wd.uid]?.username || '').toLowerCase() === lastSearchedKeywordLower" class="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full tracking-wide shrink-0">✓ KHỚP CHÍNH XÁC</span>
                </div>
                
                <div class="text-slate-400 text-[10px] mt-0.5 font-sans not-italic tracking-normal">
                  Ngày sinh: 
                  <span class="text-emerald-400 font-bold uppercase" v-if="usersMap[wd.uid]?.dateOfBirth || usersMap[wd.uid]?.dob || usersMap[wd.uid]?.ngaysinh">{{ usersMap[wd.uid]?.dateOfBirth || usersMap[wd.uid]?.dob || usersMap[wd.uid]?.ngaysinh }}</span>
                  <span class="text-slate-600 italic bg-slate-800/50 px-1 py-0.5 rounded" v-else>Khách cũ</span>
                </div>

                <div class="text-slate-500 text-[10px] mt-0.5 font-sans not-italic">{{ formatDate(wd.createdAt) }}</div>
              </td>
              <td class="p-6">
                <div v-if="wd.qrImage?.url">
                  <img :src="wd.qrImage.url" alt="QR Ngân hàng"
                       class="w-24 h-24 object-cover rounded-xl border border-slate-700 cursor-pointer hover:border-blue-500 hover:scale-105 transition-all shadow-md"
                       @click="openQrModal(wd.qrImage.url)"
                       title="Click để xem lớn" />
                  <p class="text-slate-600 text-[9px] mt-1 normal-case font-medium not-italic">Nhấn để zoom</p>
                </div>
                <div v-else-if="wd.bankInfo" class="text-slate-300 text-[11px] font-sans not-italic leading-relaxed max-w-[250px] bg-[#0d121f] p-3 rounded-xl border border-slate-700">{{ wd.bankInfo }}</div>
                <div v-else class="text-slate-600 text-[10px] italic normal-case font-medium not-italic">Không có thông tin</div>
              </td>
              
              <td class="p-6 text-center">
                <div class="text-emerald-400 text-lg font-black">{{ getVndAmount(wd).toLocaleString('vi-VN') }} VNĐ</div>
                <div class="text-yellow-500 text-[9px] font-sans tracking-widest mt-1">(Đã trừ {{ getXuAmount(wd).toLocaleString('vi-VN') }} XU)</div>
              </td>

              <td class="p-6 text-center text-[10px]">
                <span class="bg-yellow-500/10 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/20" v-if="wd.status === 'pending'">ĐANG CHỜ</span>
                <span class="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20" v-else-if="wd.status === 'approved'">ĐÃ CHUYỂN</span>
                <span class="bg-red-500/10 text-red-500 px-3 py-1 rounded-full border border-red-500/20" v-else>HỦY & HOÀN</span>
              </td>
              <td class="p-6 text-right">
                <div class="flex flex-col md:flex-row justify-end gap-2">
                  <template v-if="wd.status === 'pending'">
                    <button class="bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] px-4 py-2 rounded-lg transition-all active:scale-95" @click="approveWithdrawal(wd)">ĐÃ CHUYỂN KHOẢN</button>
                    <button class="bg-red-600 hover:bg-red-500 text-white text-[9px] px-4 py-2 rounded-lg transition-all active:scale-95" @click="rejectWithdrawal(wd)">TỪ CHỐI & HOÀN XU</button>
                  </template>
                  <button class="bg-slate-800 text-slate-400 hover:text-white text-[9px] px-4 py-2 rounded-lg transition-all active:scale-95" @click="deleteWithdrawal(wd.id)">XÓA</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- ================================================================ -->
        <!-- TAB: CẤU HÌNH JOB VIP                                           -->
        <!-- ================================================================ -->
        <div v-else-if="activeTab === 'vip_jobs_config'" class="p-6 md:p-8 space-y-4">
          <div class="flex items-center gap-3 mb-2 flex-wrap">
            <div class="w-1.5 h-6 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.6)]"></div>
            <h3 class="text-base md:text-xl text-amber-400 tracking-tight">CẤU HÌNH JOB VIP REALTIME</h3>
            <span class="text-[9px] text-slate-500 normal-case not-italic font-normal border border-slate-700 px-2 py-0.5 rounded hidden md:inline">Thay đổi sẽ cập nhật ngay lập tức — không cần deploy</span>
            <button @click="seedMissingVipJobs"
              class="ml-auto bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
              🌱 SEED JOB VIP CÒN THIẾU
            </button>
          </div>

          <div class="grid grid-cols-1 gap-4">
            <div v-for="id in VIP_JOB_IDS" :key="id" class="bg-[#090e17] border border-slate-700/60 rounded-2xl p-5 space-y-4">

              <!-- Job header -->
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-amber-400 text-lg">💎</span>
                  <span class="text-amber-300 font-black uppercase tracking-wide text-sm">{{ id }}</span>
                  <span :class="[
                    'text-[9px] px-2 py-0.5 rounded-full font-black uppercase border',
                    vipJobEdits[id]?.status === 'open'    ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' :
                    vipJobEdits[id]?.status === 'paused'  ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10' :
                    vipJobEdits[id]?.status === 'hidden'  ? 'text-slate-400 border-slate-600/40 bg-slate-700/20' :
                    'text-red-400 border-red-500/40 bg-red-500/10'
                  ]">{{ statusLabels[vipJobEdits[id]?.status] || '...' }}</span>
                </div>
                <button
                  @click="saveVipJobConfig(id)"
                  class="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-[0_0_15px_rgba(217,119,6,0.3)]">
                  💾 LƯU
                </button>
              </div>

              <!-- Edit fields -->
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" v-if="vipJobEdits[id]">

                <!-- Status -->
                <div class="flex flex-col gap-1">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Trạng thái</label>
                  <select v-model="vipJobEdits[id].status"
                    class="bg-[#111726] text-white border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] font-black outline-none focus:border-amber-500 transition-colors cursor-pointer">
                    <option value="open">✅ Mở (open)</option>
                    <option value="paused">⏸ Tạm dừng (paused)</option>
                    <option value="hidden">🚫 Ẩn (hidden)</option>
                    <option value="soldout">❌ Hết lượt (soldout)</option>
                  </select>
                </div>

                <!-- Order -->
                <div class="flex flex-col gap-1">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Thứ tự hiển thị (nhỏ hơn = lên đầu)</label>
                  <input type="number" v-model.number="vipJobEdits[id].order" min="0" max="99"
                    class="bg-[#111726] text-white border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] font-black outline-none focus:border-amber-500 transition-colors font-sans not-italic normal-case" />
                </div>

                <!-- Badge -->
                <div class="flex flex-col gap-1">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Badge (VD: SIÊU HOT)</label>
                  <input type="text" v-model="vipJobEdits[id].badge"
                    class="bg-[#111726] text-white border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] outline-none focus:border-amber-500 transition-colors font-sans not-italic normal-case" />
                </div>

                <!-- Title -->
                <div class="flex flex-col gap-1 md:col-span-2">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Tiêu đề (title)</label>
                  <input type="text" v-model="vipJobEdits[id].title"
                    class="bg-[#111726] text-white border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] outline-none focus:border-amber-500 transition-colors font-sans not-italic normal-case" />
                </div>

                <!-- Reward -->
                <div class="flex flex-col gap-1">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Thưởng (VD: 100.000 xu)</label>
                  <input type="text" v-model="vipJobEdits[id].reward"
                    class="bg-[#111726] text-white border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] outline-none focus:border-amber-500 transition-colors font-sans not-italic normal-case" />
                </div>

                <!-- Warning -->
                <div class="flex flex-col gap-1 lg:col-span-2">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Cảnh báo tuổi (warning — để trống = không cảnh báo)</label>
                  <input type="text" v-model="vipJobEdits[id].warning"
                    class="bg-[#111726] text-white border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] outline-none focus:border-amber-500 transition-colors font-sans not-italic normal-case" />
                </div>

                <!-- Age Requirement -->
                <div class="flex flex-col gap-1">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Yêu cầu tuổi (để trống = không hiện badge)</label>
                  <input type="number" v-model.number="vipJobEdits[id].ageRequirement" min="0" max="99" placeholder="VD: 18"
                    class="bg-[#111726] text-white border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] font-black outline-none focus:border-amber-500 transition-colors font-sans not-italic normal-case" />
                </div>

              </div>
            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- TAB: CẤU HÌNH WEB REALTIME (app_config/overall)            -->
        <!-- ============================================================ -->
        <div v-else-if="activeTab === 'web_config'" class="p-6 md:p-8 space-y-6">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-1.5 h-6 bg-violet-500 rounded-full shadow-[0_0_10px_rgba(124,58,237,0.6)]"></div>
            <h3 class="text-base md:text-xl text-violet-400 tracking-tight">CẤU HÌNH WEB REALTIME</h3>
            <span class="hidden md:inline text-[9px] text-slate-500 normal-case not-italic font-normal border border-slate-700 px-2 py-0.5 rounded">Thay đổi cập nhật ngay — không cần deploy</span>
          </div>

          <div class="grid grid-cols-1 gap-5">

            <!-- FORCE REFRESH / APP VERSION -->
            <div class="bg-[#090e17] border border-slate-700/60 rounded-2xl p-5 space-y-4">
              <div class="flex items-center gap-2">
                <span class="text-amber-400 text-lg">🔄</span>
                <span class="text-amber-300 font-black uppercase tracking-wide text-sm">BẮT BUỘC TẢI LẠI / CẬP NHẬT PHIÊN BẢN</span>
              </div>
              <div class="flex items-center gap-4">
                <button
                  type="button"
                  role="switch"
                  :aria-checked="webConfigEdit.forceRefreshEnabled"
                  @click="webConfigEdit.forceRefreshEnabled = !webConfigEdit.forceRefreshEnabled"
                  :class="['relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out border-2 border-transparent focus:outline-none', webConfigEdit.forceRefreshEnabled ? 'bg-amber-500' : 'bg-slate-600']">
                  <span :class="['pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg transform transition duration-200 ease-in-out', webConfigEdit.forceRefreshEnabled ? 'translate-x-7' : 'translate-x-0']"></span>
                </button>
                <div class="flex flex-col gap-0.5">
                  <span class="text-slate-200 text-sm font-bold">Tự động reload sau 3s</span>
                  <span class="text-slate-500 text-[11px] normal-case not-italic font-normal">Nếu tắt → user thấy popup và tự bấm Tải lại ngay</span>
                  <span :class="webConfigEdit.forceRefreshEnabled ? 'text-amber-400' : 'text-slate-600'" class="text-[10px] font-black uppercase tracking-widest">
                    {{ webConfigEdit.forceRefreshEnabled ? '● BẬT' : '○ TẮT' }}
                  </span>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">App version hiện tại</label>
                  <div class="flex gap-2">
                    <input type="number" v-model.number="webConfigEdit.appVersion" min="1"
                      class="bg-[#111726] text-white border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] font-black outline-none focus:border-violet-500 transition-colors font-sans not-italic normal-case flex-1" />
                    <button @click="incrementVersion"
                      class="bg-amber-600 hover:bg-amber-500 text-white px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap">
                      +1
                    </button>
                  </div>
                </div>
                <div class="flex flex-col gap-1 md:col-span-2">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Thông báo tải lại (khi không auto)</label>
                  <input type="text" v-model="webConfigEdit.refreshMessage"
                    class="bg-[#111726] text-white border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] outline-none focus:border-violet-500 transition-colors font-sans not-italic normal-case" />
                </div>
              </div>
            </div>

          </div>

          <!-- SAVE BUTTON -->
          <div class="pt-2">
            <button @click="saveWebConfig" :disabled="isSavingWebConfig"
                    class="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all active:scale-95 shadow-[0_0_20px_rgba(124,58,237,0.3)]">
              {{ isSavingWebConfig ? '⏳ ĐANG LƯU...' : '💾 LƯU CẤU HÌNH' }}
            </button>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- TAB: HỖ TRỢ / THÔNG BÁO REALTIME (support_config/overall)  -->
        <!-- ============================================================ -->
        <div v-else-if="activeTab === 'support_config'" class="p-6 md:p-8 space-y-6 max-w-2xl mx-auto">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-1.5 h-6 bg-sky-500 rounded-full shadow-[0_0_10px_rgba(14,165,233,0.6)]"></div>
            <h3 class="text-base md:text-xl text-sky-400 tracking-tight">HỖ TRỢ / THÔNG BÁO REALTIME</h3>
          </div>

          <!-- Toggle: enabled -->
          <div class="flex items-center justify-between bg-[#090e17] rounded-xl p-4 border border-slate-700/60">
            <div>
              <p class="text-white font-bold text-sm">Bật/tắt thông báo hỗ trợ</p>
              <p class="text-slate-500 text-xs mt-0.5">Nếu tắt, nút Hỗ trợ sẽ ẩn trên web user</p>
            </div>
            <button type="button" @click="supportConfigEdit.enabled = !supportConfigEdit.enabled"
                    :class="['relative w-14 h-7 rounded-full transition-colors duration-200 border-2 border-transparent focus:outline-none', supportConfigEdit.enabled ? 'bg-sky-600' : 'bg-slate-600']">
              <span :class="['pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg transform transition duration-200 ease-in-out', supportConfigEdit.enabled ? 'translate-x-7' : 'translate-x-0']"></span>
            </button>
          </div>

          <!-- Toggle: autoPopupEnabled -->
          <div class="flex items-center justify-between bg-[#090e17] rounded-xl p-4 border border-slate-700/60">
            <div>
              <p class="text-white font-bold text-sm">Tự bật popup cho user</p>
              <p class="text-slate-500 text-xs mt-0.5">User đang online sẽ thấy popup ngay khi tăng version</p>
            </div>
            <button type="button" @click="supportConfigEdit.autoPopupEnabled = !supportConfigEdit.autoPopupEnabled"
                    :class="['relative w-14 h-7 rounded-full transition-colors duration-200 border-2 border-transparent focus:outline-none', supportConfigEdit.autoPopupEnabled ? 'bg-emerald-600' : 'bg-slate-600']">
              <span :class="['pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg transform transition duration-200 ease-in-out', supportConfigEdit.autoPopupEnabled ? 'translate-x-7' : 'translate-x-0']"></span>
            </button>
          </div>

          <!-- Announcement Version -->
          <div class="bg-[#090e17] rounded-xl p-4 border border-slate-700/60 space-y-3">
            <p class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Announcement Version</p>
            <div class="flex items-center gap-4">
              <span class="text-3xl font-black text-sky-400">{{ supportConfigEdit.announcementVersion }}</span>
              <button @click="incrementSupportVersion"
                      class="bg-sky-700 hover:bg-sky-600 text-white text-xs font-black px-4 py-2 rounded-lg transition-colors active:scale-95 uppercase tracking-widest">
                +1 Version
              </button>
            </div>
            <p class="text-slate-500 text-xs">Tăng version để trigger popup realtime cho tất cả user đang online</p>
          </div>

          <!-- Title -->
          <div class="space-y-2">
            <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Tiêu đề bảng hỗ trợ</label>
            <input v-model="supportConfigEdit.title" type="text"
                   class="w-full bg-[#090e17] border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 transition-colors font-sans not-italic normal-case" />
          </div>

          <!-- Message -->
          <div class="space-y-2">
            <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Nội dung thông báo</label>
            <textarea v-model="supportConfigEdit.message" rows="4"
                      class="w-full bg-[#090e17] border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-500 transition-colors resize-none font-sans not-italic normal-case"></textarea>
          </div>

          <!-- Save -->
          <button @click="saveSupportConfig" :disabled="isSavingSupportConfig"
                  class="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase shadow-[0_0_20px_rgba(14,165,233,0.3)]">
            {{ isSavingSupportConfig ? '⏳ ĐANG LƯU...' : '💾 LƯU THÔNG BÁO' }}
          </button>

          <p class="text-slate-600 text-xs text-center italic">
            Nút "Nhắn tin Fanpage" được cố định trong hệ thống — admin không thể chỉnh link.
          </p>
        </div>

        <!-- ============================================================ -->
        <!-- TAB: CẤU HÌNH JOB CƠ BẢN (basic_jobs_config)             -->
        <!-- ============================================================ -->
        <div v-else-if="activeTab === 'basic_jobs_config'" class="p-6 md:p-8 space-y-8 max-w-2xl mx-auto">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-1.5 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.6)]"></div>
            <h3 class="text-base md:text-xl text-emerald-400 tracking-tight">CẤU HÌNH JOB CƠ BẢN — ĐĂNG BÀI THREADS</h3>
          </div>

          <!-- Section 1: Nội dung bài đăng -->
          <div class="space-y-4">
            <div class="flex items-center gap-2">
              <span class="text-emerald-400 text-sm">🧵</span>
              <h4 class="text-white font-black text-sm uppercase tracking-widest">Nội dung bài đăng (10 mẫu)</h4>
            </div>
            <p class="text-slate-500 text-xs italic normal-case">Mỗi ô là 1 mẫu bài đăng. Ô rỗng sẽ bị bỏ qua khi random. User chỉ thấy 1 nút COPY NGẪU NHIÊN.</p>

            <div class="space-y-3">
              <div v-for="(_, idx) in basicPostContents" :key="idx" class="space-y-1">
                <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Bài đăng {{ idx + 1 }}</label>
                <textarea
                  v-model="basicPostContents[idx]"
                  rows="2"
                  :placeholder="`Mẫu bài đăng ${idx + 1}... (để trống để bỏ qua)`"
                  class="w-full bg-[#090e17] border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors resize-none font-sans not-italic normal-case placeholder-slate-700"
                ></textarea>
              </div>
            </div>

            <button @click="saveBasicPostContents" :disabled="isSavingBasicContents"
                    class="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              {{ isSavingBasicContents ? '⏳ ĐANG LƯU...' : '💾 LƯU NỘI DUNG BÀI ĐĂNG' }}
            </button>
          </div>

          <!-- Section 2: Cấu hình popup "XEM HƯỚNG DẪN" — job Đăng Bài Threads Hằng Ngày -->
          <div class="space-y-4 pt-6 border-t border-slate-800">
            <div class="flex items-center gap-3 mb-1">
              <div class="w-1.5 h-6 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.6)]"></div>
              <h3 class="text-base md:text-xl text-purple-400 tracking-tight">CẤU HÌNH HƯỚNG DẪN THREADS HẰNG NGÀY</h3>
            </div>
            <p class="text-slate-500 text-xs italic normal-case">
              Nội dung, ảnh mẫu và mã QR hiển thị trong popup "XEM HƯỚNG DẪN" của job Đăng Bài Threads Hằng Ngày — user đang mở web sẽ tự cập nhật realtime.
            </p>

            <!-- 10 nội dung bài đăng -->
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <span class="text-purple-400 text-sm">🧵</span>
                <h4 class="text-white font-black text-sm uppercase tracking-widest">10 nội dung bài đăng</h4>
              </div>
              <div class="space-y-3">
                <div v-for="(_, idx) in guideContents" :key="idx" class="space-y-1">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Content #{{ idx + 1 }}</label>
                  <textarea
                    v-model="guideContents[idx]"
                    rows="2"
                    :placeholder="`Nội dung bài đăng mẫu ${idx + 1}... (để trống để bỏ qua)`"
                    class="w-full bg-[#090e17] border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors resize-none font-sans not-italic normal-case placeholder-slate-700"
                  ></textarea>
                </div>
              </div>
            </div>

            <!-- 10 ảnh bài đăng -->
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <span class="text-purple-400 text-sm">🖼️</span>
                <h4 class="text-white font-black text-sm uppercase tracking-widest">10 ảnh bài đăng</h4>
              </div>
              <p class="text-slate-500 text-xs italic normal-case">Nhập link/path ảnh, ví dụ: /images/thread-post-1.jpg</p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div v-for="(_, idx) in guideImages" :key="idx" class="space-y-1">
                  <label class="text-[9px] text-slate-500 uppercase tracking-widest font-black">Image #{{ idx + 1 }}</label>
                  <input
                    v-model="guideImages[idx]"
                    type="text"
                    :placeholder="`/images/thread-post-${idx + 1}.jpg`"
                    class="w-full bg-[#090e17] border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors font-sans not-italic normal-case placeholder-slate-700"
                  />
                </div>
              </div>
            </div>

            <!-- Ảnh mã QR -->
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-purple-400 text-sm">📌</span>
                <h4 class="text-white font-black text-sm uppercase tracking-widest">Ảnh mã QR</h4>
              </div>
              <input
                v-model="guideQrImage"
                type="text"
                placeholder="/images/qr-zalo-nhom17.jpg"
                class="w-full bg-[#090e17] border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors font-sans not-italic normal-case placeholder-slate-700"
              />
            </div>

            <button @click="saveDailyThreadsGuideConfig" :disabled="isSavingGuideConfig"
                    class="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase shadow-[0_0_20px_rgba(168,85,247,0.3)]">
              {{ isSavingGuideConfig ? '⏳ ĐANG LƯU...' : '💾 LƯU CẤU HÌNH HƯỚNG DẪN' }}
            </button>
          </div>

        </div>

        <!-- TAB: DỌN ẢNH STORAGE -->
        <div v-if="activeTab === 'storage_clean'" class="p-8 space-y-6">
          <!-- Banner khôi phục tiến trình cũ (sau crash/reload) -->
          <div v-if="resumeBanner" class="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-5 space-y-3">
            <div class="text-amber-400 font-black text-xs uppercase tracking-widest">⚠️ Đã tìm thấy tiến trình cũ ({{ resumeBanner.mode === 'normalize' ? 'Chuẩn hoá' : 'Dọn ảnh' }})</div>
            <div class="text-slate-300 text-xs normal-case font-sans not-italic space-y-0.5">
              <div>Đã quét {{ resumeBanner.scanned }} đơn</div>
              <div v-if="resumeBanner.mode === 'normalize'">Đã chuẩn hoá {{ resumeBanner.normalized }} đơn</div>
              <div v-else>Đã đánh dấu dọn {{ resumeBanner.cleanedReports }} đơn, đã xoá {{ resumeBanner.deletedFiles }} ảnh</div>
              <div>Batch gần nhất: {{ resumeBanner.batchNumber }}</div>
            </div>
            <div class="text-slate-400 text-xs normal-case font-sans not-italic">Bạn muốn tiếp tục từ lần trước không?</div>
            <div class="flex gap-3 flex-wrap">
              <button @click="resumeCleanupFromSaved" class="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-5 py-3 rounded-xl transition-all active:scale-95 tracking-widest text-xs uppercase">
                ▶ Tiếp tục từ lần trước
              </button>
              <button @click="restartCleanupFromScratch" class="bg-slate-700 hover:bg-slate-600 text-white font-black px-5 py-3 rounded-xl transition-all active:scale-95 tracking-widest text-xs uppercase">
                🔄 Chạy lại từ đầu
              </button>
              <button @click="discardSavedCleanupProgress" class="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-black px-5 py-3 rounded-xl transition-all active:scale-95 tracking-widest text-xs uppercase border border-slate-700">
                🗑️ Xoá tiến trình cũ
              </button>
            </div>
          </div>

          <div>
            <h3 class="text-rose-400 font-black text-base uppercase tracking-widest mb-2">🧹 Dọn ảnh Storage</h3>
            <div class="text-slate-500 text-xs space-y-1 normal-case not-italic font-sans">
              <div>• Mỗi lần chỉ kiểm tra <span class="text-white font-bold">30 đơn</span> — không đọc toàn bộ collection một phát.</div>
              <div>• Job cơ bản (đã xử lý): xoá ảnh nếu status là approved / rejected / collected / paid.</div>
              <div>• Job VIP/ngân hàng/chứng khoán (đã xử lý &amp; &gt; 7 ngày): xoá ảnh.</div>
              <div>• Pending bất kỳ loại: <span class="text-emerald-400 font-bold">KHÔNG xoá</span>.</div>
              <div>• Firestore document giữ nguyên. Chỉ xoá file ảnh trên Storage.</div>
              <div>• Lần đầu dùng: bấm <span class="text-white font-bold">"🧮 Chuẩn hoá tự động"</span> trước để query lọc đúng các đơn cũ chưa dọn (chạy theo lô 30 đơn, có thể tạm dừng).</div>
            </div>
          </div>

          <!-- Toggle chế độ — LUÔN hiển thị (idle / đang chạy thử / đã tạm dừng), chỉ khoá khi đang chạy thật sự (chưa pause) -->
          <label class="flex items-center gap-2 text-xs text-slate-400 normal-case font-sans not-italic cursor-pointer w-fit">
            <input type="checkbox" v-model="isDryRun" :disabled="(isAutoRunning && !isAutoPaused) || isNormalizing" class="w-4 h-4 accent-rose-500" />
            ☑ Chạy thử, không xoá thật
          </label>

          <!-- Indicator chế độ hiện tại — luôn hiển thị để admin biết mình đang ở mode nào -->
          <div v-if="!isDryRun" class="flex items-center gap-2 bg-red-600/10 border border-red-500/50 rounded-xl px-4 py-3 w-fit">
            <span class="text-red-400 font-black text-xs uppercase tracking-widest">⚠️ CHẾ ĐỘ XOÁ THẬT</span>
            <span class="text-red-300 text-[11px] normal-case font-sans not-italic">— ảnh sẽ bị xoá vĩnh viễn khỏi Firebase Storage. Tích lại ô trên để quay về chạy thử.</span>
          </div>
          <div v-else class="flex items-center gap-2 text-emerald-500 text-[11px] normal-case font-sans not-italic">
            ✅ Đang ở chế độ chạy thử — không xoá ảnh thật, không cập nhật Firestore.
          </div>

          <!-- Nút chuyển mode riêng — chỉ cho phép khi KHÔNG đang chạy (hoặc đang tạm dừng) -->
          <button
            v-if="isDryRun && (!isAutoRunning || isAutoPaused)"
            @click="isDryRun = false"
            class="bg-red-900/40 hover:bg-red-900/60 text-red-300 hover:text-red-200 font-black px-5 py-3 rounded-xl transition-all active:scale-95 tracking-widest text-xs uppercase border border-red-700/50 w-fit"
          >
            🔥 Chuyển sang xoá thật
          </button>
          <div v-else-if="isDryRun && isAutoRunning && !isAutoPaused" class="text-slate-500 text-[11px] normal-case font-sans not-italic">
            Đang chạy thử — bấm "⏸ Tạm dừng" hoặc "⛔ Kết thúc phiên chạy thử" trước khi chuyển sang xoá thật.
          </div>

          <div class="flex gap-3 flex-wrap">
            <button
              @click="startNormalizeAuto"
              :disabled="isNormalizing || isAutoRunning"
              class="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-black px-6 py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase"
            >
              {{ isNormalizing ? '⏳ ĐANG CHUẨN HOÁ...' : (storageCleanupError && normalizeBatchCount > 0 ? '🔁 Thử lại batch này' : '🧮 Chuẩn hoá tự động') }}
            </button>

            <button
              v-if="isNormalizing && !isNormalizePaused"
              @click="pauseNormalizeAuto"
              class="bg-amber-600 hover:bg-amber-500 text-white font-black px-6 py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase"
            >
              ⏸ Tạm dừng
            </button>
            <button
              v-if="isNormalizing && isNormalizePaused"
              @click="resumeNormalizeAuto"
              class="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase"
            >
              ▶ Tiếp tục
            </button>

            <button
              @click="startAutoCleanup"
              :disabled="isAutoRunning || isNormalizing || isCheckingStorageCleanup || isDeletingStorage"
              class="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black px-8 py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase shadow-[0_0_20px_rgba(225,29,72,0.3)]"
            >
              {{ isAutoRunning
                  ? (isDryRun ? '⏳ ĐANG CHẠY THỬ...' : '⏳ ĐANG XOÁ THẬT...')
                  : (isDryRun ? '🚀 Dọn tự động — chạy thử' : '🔥 Dọn tự động — XOÁ THẬT') }}
            </button>

            <button
              v-if="isAutoRunning && !isAutoPaused"
              @click="pauseAutoCleanup"
              class="bg-amber-600 hover:bg-amber-500 text-white font-black px-6 py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase"
            >
              ⏸ Tạm dừng
            </button>
            <button
              v-if="isAutoRunning && isAutoPaused"
              @click="resumeAutoCleanup"
              class="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase"
            >
              {{ isDryRun ? '▶ Tiếp tục chạy thử' : '▶ Tiếp tục xoá thật' }}
            </button>
            <button
              v-if="isAutoRunning && isDryRun"
              @click="endDryRunSession"
              class="bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 font-black px-6 py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase border border-rose-800/50"
            >
              ⛔ Kết thúc phiên chạy thử
            </button>

            <button
              @click="scanStorageImages"
              :disabled="isCheckingStorageCleanup || isDeletingStorage || isAutoRunning || isNormalizing"
              class="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-black px-8 py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase"
            >
              {{ isCheckingStorageCleanup ? '⏳ ĐANG KIỂM TRA...' : (storageCleanupError ? '🔁 Thử lại' : (lastCleanupDocId ? '📦 Kiểm tra lô tiếp theo' : '🔍 Kiểm tra 30 đơn đầu tiên')) }}
            </button>

            <button
              v-if="lastCleanupDocId || storageCleanupResult"
              @click="resetStorageCleanup"
              :disabled="isCheckingStorageCleanup || isDeletingStorage || isAutoRunning || isNormalizing"
              class="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-400 hover:text-white font-black px-6 py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase border border-slate-700"
            >
              🔄 Quét lại từ đầu
            </button>
          </div>

          <!-- Panel tiến trình Chuẩn hoá tự động -->
          <div v-if="isNormalizing || normalizeBatchCount > 0" class="bg-[#0d121f] border border-indigo-800/40 rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-black uppercase tracking-widest" :class="isNormalizing ? (isNormalizePaused ? 'text-amber-400' : 'text-indigo-400') : 'text-slate-500'">
                {{ isNormalizing ? (isNormalizePaused ? '⏸ Tạm dừng' : '🧮 Đang chuẩn hoá...') : '⏹ Đã dừng' }}
              </span>
              <span class="text-slate-500 text-[10px] uppercase tracking-widest">Batch: <span class="text-white font-black">{{ normalizeBatchCount }}</span></span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-slate-300">{{ normalizeStats.scanned }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">Đã quét</div>
              </div>
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-indigo-400">{{ normalizeStats.normalized }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">Đã chuẩn hoá</div>
              </div>
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-slate-500">{{ normalizeStats.skippedNoImages }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">Bỏ qua không ảnh</div>
              </div>
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-slate-500">{{ normalizeStats.skippedAlreadyNormalized }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">Bỏ qua đã chuẩn hoá</div>
              </div>
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-red-500">{{ normalizeStats.errors }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">Lỗi</div>
              </div>
            </div>
          </div>

          <div v-if="normalizeProgress" class="text-indigo-400 text-sm font-sans normal-case not-italic tracking-normal">
            {{ normalizeProgress }}
          </div>

          <div v-if="storageCleanupProgress" class="text-blue-400 text-sm font-sans normal-case not-italic tracking-normal">
            {{ storageCleanupProgress }}
          </div>

          <div v-if="storageCleanupError" class="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl p-4 normal-case font-sans not-italic">
            ⚠️ {{ storageCleanupError }}
          </div>

          <!-- Panel tiến trình Dọn tự động -->
          <div v-if="isAutoRunning || autoRoundCount > 0" class="bg-[#0d121f] border border-rose-800/40 rounded-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-black uppercase tracking-widest" :class="isAutoRunning ? (isAutoPaused ? 'text-amber-400' : 'text-emerald-400') : 'text-slate-500'">
                {{ isAutoRunning
                    ? (isAutoPaused
                        ? (isDryRun ? '⏸ Tạm dừng (chạy thử)' : '⏸ Tạm dừng (xoá thật)')
                        : (isDryRun ? '🧪 ĐANG CHẠY THỬ — KHÔNG XOÁ ẢNH' : '🔥 ĐANG XOÁ THẬT'))
                    : '⏹ Đã dừng' }}
              </span>
              <span class="text-slate-500 text-[10px] uppercase tracking-widest">Vòng: <span class="text-white font-black">{{ autoRoundCount }}</span></span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-slate-300">{{ autoStats.checked }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">Đã kiểm tra</div>
              </div>
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-rose-400">{{ autoStats.deletedImages }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">{{ isDryRun ? 'Sẽ xoá ảnh' : 'Đã xoá ảnh' }}</div>
              </div>
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-blue-400">{{ autoStats.cleanedReports }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">{{ isDryRun ? 'Sẽ đánh dấu đơn' : 'Đã đánh dấu đơn' }}</div>
              </div>
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-slate-500">{{ autoStats.pendingSkipped }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">Bỏ qua pending</div>
              </div>
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-amber-400">{{ autoStats.vipNotOldEnough }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">VIP chưa đủ 7 ngày</div>
              </div>
              <div class="bg-[#111726] rounded-xl p-3 text-center">
                <div class="text-lg font-black text-red-500">{{ autoStats.errors }}</div>
                <div class="text-slate-500 text-[9px] tracking-widest mt-1 uppercase">Lỗi xoá ảnh</div>
              </div>
            </div>

            <div v-if="autoLogs.length" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-slate-500 text-[10px] uppercase tracking-widest">Log gần nhất</span>
                <button @click="clearAutoLogs" class="text-slate-500 hover:text-white text-[10px] uppercase tracking-widest font-bold">Xoá log</button>
              </div>
              <div class="bg-black/40 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1 font-mono">
                <div v-for="(line, idx) in autoLogs" :key="idx" class="text-slate-400 text-[10px] normal-case not-italic">{{ line }}</div>
              </div>
            </div>
          </div>

          <Transition name="fade">
            <div v-if="storageCleanupResult" class="space-y-6">
              <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div class="bg-[#0d121f] border border-slate-800 rounded-2xl p-4 text-center">
                  <div class="text-2xl font-black text-slate-300">{{ storageCleanupResult.checkedReports }}</div>
                  <div class="text-slate-500 text-[10px] tracking-widest mt-1 uppercase">Đã kiểm tra</div>
                </div>
                <div class="bg-[#0d121f] border border-slate-800 rounded-2xl p-4 text-center">
                  <div class="text-2xl font-black text-blue-400">{{ storageCleanupResult.basicReportCount }}</div>
                  <div class="text-slate-500 text-[10px] tracking-widest mt-1 uppercase">Job cơ bản</div>
                </div>
                <div class="bg-[#0d121f] border border-slate-800 rounded-2xl p-4 text-center">
                  <div class="text-2xl font-black text-amber-400">{{ storageCleanupResult.vipReportCount }}</div>
                  <div class="text-slate-500 text-[10px] tracking-widest mt-1 uppercase">VIP &gt; 7 ngày</div>
                </div>
                <div class="bg-[#0d121f] border border-slate-800 rounded-2xl p-4 text-center">
                  <div class="text-2xl font-black text-slate-500">{{ storageCleanupResult.pendingSkipped }}</div>
                  <div class="text-slate-500 text-[10px] tracking-widest mt-1 uppercase">Pending bỏ qua</div>
                </div>
                <div class="bg-[#0d121f] border border-rose-800/50 rounded-2xl p-4 text-center">
                  <div class="text-2xl font-black text-rose-400">{{ storageCleanupResult.totalImageCount }}</div>
                  <div class="text-slate-500 text-[10px] tracking-widest mt-1 uppercase">Ảnh sẽ xoá</div>
                </div>
              </div>

              <div v-if="storageCleanupResult.totalImageCount === 0" class="text-center text-slate-500 text-sm italic normal-case font-sans py-2">
                Không có ảnh nào cần xoá trong lô này.
                <span v-if="storageCleanupResult.hasMore" class="block mt-1 text-blue-400 not-italic font-bold">Bấm "Kiểm tra lô tiếp theo" để tiếp tục.</span>
                <span v-else class="block mt-1 text-emerald-400 not-italic font-bold">✅ Đã hết collection.</span>
              </div>

              <button
                v-if="storageCleanupResult.totalImageCount > 0"
                @click="confirmDeleteImages"
                :disabled="isDeletingStorage || isCheckingStorageCleanup"
                class="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-all active:scale-95 tracking-widest text-sm uppercase shadow-[0_0_20px_rgba(220,38,38,0.4)]"
              >
                {{ isDeletingStorage ? '⏳ ĐANG XOÁ ẢNH...' : `🗑️ Xác nhận xoá ảnh lô này (${storageCleanupResult.totalImageCount} ảnh)` }}
              </button>
            </div>
          </Transition>
        </div>

        <!-- Tab: Thread hằng ngày -->
        <div v-if="activeTab === 'daily_threads'" class="p-4 md:p-6">
          <AdminDailyThreads
            :globalSearchResults="searchThreadResults"
            :isGlobalSearch="isThreadSearchMode"
            :searchKeyword="searchQuery"
            @clearSearch="clearThreadSearch"
          />
        </div>

        <div class="p-20 text-center text-slate-700 tracking-widest text-xs" v-if="!isLoading && ((activeTab === 'app_jobs' && filteredAppReports.length === 0) || (activeTab === 'other_jobs' && filteredOtherReports.length === 0) || (activeTab === 'withdrawals' && filteredWithdrawals.length === 0))">
          HIỆN CHƯA CÓ YÊU CẦU NÀO TRONG MỤC NÀY.
        </div>
      </div>
    </div>
  </div>

  <!-- QR Zoom Modal -->
  <Transition name="fade">
    <div v-if="selectedQrImage" class="fixed inset-0 z-[9000] flex items-center justify-center px-4">
      <div class="absolute inset-0 bg-black/90 backdrop-blur-md" @click="closeQrModal"></div>
      <div class="relative z-10 bg-[#111827] border border-slate-700/60 rounded-[24px] p-6 max-w-sm w-full shadow-2xl text-center">
        <h3 class="text-white text-sm font-black tracking-widest mb-4 uppercase">QR NHẬN TIỀN</h3>
        <img :src="selectedQrImage" alt="QR Ngân hàng"
             class="w-full max-h-[60vh] object-contain rounded-2xl border border-slate-700 mb-5" />
        <div class="flex gap-3">
          <button @click="closeQrModal"
                  class="flex-1 py-3 bg-slate-700/60 border border-slate-600/40 text-slate-300 hover:text-white rounded-xl text-[10px] tracking-widest transition-all active:scale-95 uppercase font-black italic">
            ĐÓNG
          </button>
          <a :href="selectedQrImage" target="_blank" rel="noopener"
             class="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] tracking-widest transition-all active:scale-95 flex items-center justify-center uppercase font-black italic">
            MỞ ẢNH GỐC
          </a>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Gắn hồ sơ ví thủ công — tìm user thật theo SĐT/tên/UID -->
  <Transition name="fade">
    <div v-if="walletLinkModal.open" class="fixed inset-0 z-[9000] flex items-center justify-center px-4">
      <div class="absolute inset-0 bg-black/90 backdrop-blur-md" @click="closeWalletLinkModal"></div>
      <div class="relative z-10 bg-[#111827] border border-slate-700/60 rounded-[24px] p-6 max-w-md w-full shadow-2xl">
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-white text-sm font-black tracking-widest uppercase">Gắn hồ sơ ví thủ công</h3>
          <button @click="closeWalletLinkModal" class="text-slate-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <p class="text-slate-400 text-[11px] mb-3">Đơn UID gốc: {{ walletLinkModal.report?.uid }}</p>
        <div class="flex gap-2 mb-2">
          <input v-model="walletLinkQuery" @keyup.enter="searchUsersToLink" type="text" placeholder="SĐT / Tên đăng nhập / Họ tên / UID"
                 class="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60" />
          <button @click="searchUsersToLink" :disabled="walletLinkLoading"
                  class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-black uppercase transition-all active:scale-95">
            {{ walletLinkLoading ? '...' : 'Tìm' }}
          </button>
        </div>
        <p v-if="walletLinkError" class="text-red-400 text-[11px] mb-2">{{ walletLinkError }}</p>
        <div class="max-h-64 overflow-y-auto space-y-2">
          <div v-for="r in walletLinkResults" :key="r.uid" class="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 flex justify-between items-center gap-2">
            <div class="text-xs min-w-0">
              <div class="text-white font-bold truncate">{{ r.data?.fullName || r.data?.username || 'Chưa cập nhật' }}</div>
              <div class="text-slate-400 text-[10px] truncate">UID: {{ shortUid(r.uid) }} · SĐT: {{ r.data?.phone || r.data?.phoneRef || 'N/A' }} · Ví: {{ (r.data?.balance || 0).toLocaleString('vi-VN') }} XU</div>
            </div>
            <button @click="confirmWalletLink(r)"
                    class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all active:scale-95 shrink-0">
              Chọn
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>