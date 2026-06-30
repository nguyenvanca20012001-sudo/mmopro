<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { auth, db } from '@/firebase' 
import { onAuthStateChanged, signOut } from "firebase/auth" 
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDoc, documentId, increment, limit, startAfter, where, getDocs, addDoc, serverTimestamp, Timestamp, setDoc } from "firebase/firestore"
import Swal from 'sweetalert2'
import { jobsData } from '@/data/jobs'
import { useVipJobs, startVipJobsListener, VIP_JOB_IDS } from '@/composables/useVipJobs'
import { appConfig, startAppConfigListener, updateAppConfig } from '@/composables/useAppConfig'
import type { AppConfig } from '@/composables/useAppConfig'
import { supportConfig, startSupportConfigListener, updateSupportConfig } from '@/composables/useSupportConfig'
import type { SupportConfig } from '@/composables/useSupportConfig'
import { basicJobConfigs, startBasicJobConfigsListener } from '@/composables/useBasicJobConfigs'
import { storage } from '@/firebase'
import { ref as storageRef, deleteObject } from 'firebase/storage'
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

watch(activeTab, (tab) => {
  if (tab === 'basic_jobs_config') {
    const cfg = basicJobConfigs.value['post-threads']
    if (cfg?.postContents?.length) {
      const padded = [...cfg.postContents, ...Array(10).fill('')].slice(0, 10)
      basicPostContents.value = padded
    } else {
      basicPostContents.value = Array(10).fill('')
    }
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

const handleSearch = async () => {
  const text = searchQuery.value.trim();

  if (!text) {
    searchThreadResults.value = []
    isThreadSearchMode.value = false
    loadData(statusFilter.value);
    return;
  }

  isLoading.value = true;
  if (unsubReports) unsubReports();
  if (unsubWithdrawals) unsubWithdrawals();

  let matchedUids: string[] = [];
  const lowerText = text.toLowerCase();

  for (const uid in usersMap.value) {
    const user = usersMap.value[uid];
    const uname = user.username ? String(user.username).toLowerCase() : '';
    const fname = user.fullName ? String(user.fullName).toLowerCase() : '';
    if (uname.includes(lowerText) || fname.includes(lowerText)) {
      matchedUids.push(uid);
    }
  }

  const limitedUids = matchedUids.slice(0, 10);
  const qReports = limitedUids.length > 0
    ? query(collection(db, "reports"), where("uid", "in", limitedUids), limit(50))
    : query(collection(db, "reports"), where("phoneRef", "==", text), limit(50));

  try {
    const snapshot = await getDocs(qReports);
    let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const getTime = (t: any) => t?.toDate ? t.toDate().getTime() : new Date(t || 0).getTime();
    data.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
    reports.value = data;

    let uidsToSearchWith = limitedUids;
    if (uidsToSearchWith.length === 0 && data.length > 0) {
      uidsToSearchWith = [data[0].uid];
    }

    if (uidsToSearchWith.length > 0) {
      const validUids = uidsToSearchWith.slice(0, 10);
      const qWith = query(collection(db, "withdrawals"), where("uid", "in", validUids));
      const snapWith = await getDocs(qWith);
      let wData = snapWith.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      wData.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      withdrawals.value = wData;
    } else {
      withdrawals.value = [];
    }

    // Tìm kiếm trong daily_thread_reports (300 đơn gần nhất, filter client-side)
    const qThreads = query(
      collection(db, "daily_thread_reports"),
      orderBy("createdAt", "desc"),
      limit(300)
    )
    const snapThreads = await getDocs(qThreads)
    let threadData: any[] = snapThreads.docs.map(d => ({ id: d.id, ...d.data() }))
    threadData = threadData.filter(r =>
      (r.fullName && r.fullName.toLowerCase().includes(lowerText)) ||
      (r.phoneRef && r.phoneRef.includes(text)) ||
      (r.uid && r.uid.toLowerCase().includes(lowerText)) ||
      (r.threadNick && r.threadNick.toLowerCase().includes(lowerText)) ||
      (r.threadNickLower && r.threadNickLower.includes(lowerText)) ||
      (r.postUrl && r.postUrl.toLowerCase().includes(lowerText)) ||
      (r.postUrlNormalized && r.postUrlNormalized.toLowerCase().includes(lowerText))
    )
    searchThreadResults.value = threadData
    isThreadSearchMode.value = threadData.length > 0

    // Auto-switch sang tab Thread nếu chỉ tìm thấy đơn Thread (không có reports/withdrawals)
    if (threadData.length > 0 && data.length === 0 && withdrawals.value.length === 0) {
      activeTab.value = 'daily_threads'
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

const bulkApproveOtherJobs = async () => {
  if (selectedOtherJobs.value.length === 0) return
  
  const { isConfirmed } = await Swal.fire({
    title: `DUYỆT ${selectedOtherJobs.value.length} ĐƠN?`,
    text: "Bạn có chắc chắn muốn duyệt và cộng tiền cho tất cả các đơn đã chọn?",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#3b82f6',
    cancelButtonText: 'HỦY',
    confirmButtonText: 'DUYỆT LUÔN 🚀'
  });

  if (isConfirmed) {
    try {
      Swal.fire({
        title: 'ĐANG XỬ LÝ...',
        text: 'Vui lòng không đóng trang lúc này!',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading() }
      })

      for (const reportId of selectedOtherJobs.value) {
        const report = reports.value.find(r => r.id === reportId)
        if (!report || report.status !== 'pending') continue

        const cleanRewardString = String(report.reward || '0').replace(/\D/g, '')
        const rewardValue = Number(cleanRewardString) || 0

        try {
          await updateDoc(doc(db, "users", report.uid), { balance: increment(rewardValue) });
        } catch (balanceErr: any) {
          if (balanceErr?.code !== 'not-found') throw balanceErr;
        }
        await updateDoc(doc(db, "reports", report.id), {
          status: 'approved',
          approvedAt: serverTimestamp()
        })
        
        updateLocalStatsOnApprove(report);
      }

      selectedOtherJobs.value = []
      Swal.fire('THÀNH CÔNG!', 'Đã quét sạch các đơn được chọn!', 'success')
      
    } catch (error) {
      Swal.fire('LỖI!', 'Có lỗi xảy ra: ' + error, 'error')
    }
  }
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
      await ensureUsers(data.map((r: any) => r.uid).filter(Boolean))
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

const fixUserWallet = async (uid: string) => {
  const currentVal = usersMap.value[uid]?.balance || 0;
  const newVal = prompt(`Khách đang có: ${currentVal} XU.\n\nNhập số tiền chuẩn để sửa ví (CHỈ NHẬP SỐ):`, "0");
  if (newVal !== null) {
    let cleanNum = Number(newVal.replace(/\D/g, '')) || 0;
    try {
      await updateDoc(doc(db, "users", uid), { balance: cleanNum });
      alert(`🎉 Đã sửa ví khách thành công: ${cleanNum} XU!`);
    } catch (e) { alert("Lỗi: " + e); }
  }
}

const congXu = async (uid: string) => {
  const username = usersMap.value[uid]?.username || uid
  const currentVal = usersMap.value[uid]?.balance || 0
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
    await updateDoc(doc(db, 'users', uid), { balance: increment(amount) })
    addDoc(collection(db, 'admin_notes'), {
      dateLabel: new Date().toLocaleDateString('vi-VN'),
      content: `Admin cộng ${amount.toLocaleString('vi-VN')} xu cho ${username}`,
      totalToday: 0,
      createdAt: new Date()
    }).catch(() => {})
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã cộng xu thành công', showConfirmButton: false, timer: 2500 })
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Lỗi', text: String(e) })
  }
}

const approveReport = async (report: any) => {
  const cleanRewardString = String(report.reward || '0').replace(/\D/g, '');
  const rewardValue = Number(cleanRewardString) || 0;

  const currentBalance = usersMap.value[report.uid]?.balance || 0;
  if (!confirm(`XÁC NHẬN DUYỆT ĐƠN NÀY?\n\n+ Tiền cộng: ${rewardValue.toLocaleString()} XU\n+ Ví cũ đang có: ${currentBalance.toLocaleString()} XU\n👉 TỔNG TIỀN MỚI: ${(currentBalance + rewardValue).toLocaleString()} XU`)) return;

  try {
    let balanceUpdated = true;
    try {
      await updateDoc(doc(db, "users", report.uid), { balance: increment(rewardValue) });
    } catch (balanceErr: any) {
      if (balanceErr?.code === 'not-found') {
        balanceUpdated = false;
      } else {
        throw balanceErr;
      }
    }
    await updateDoc(doc(db, "reports", report.id), {
      status: 'approved',
      approvedAt: serverTimestamp()
    });
    if (balanceUpdated) {
      alert("ĐÃ DUYỆT VÀ CỘNG XU THÀNH CÔNG!");
      // Refresh usersMap entry so next approve shows the updated balance
      try {
        const freshUser = await getDoc(doc(db, 'users', report.uid))
        if (freshUser.exists()) usersMap.value[report.uid] = freshUser.data()
      } catch {}
    } else {
      alert("ĐÃ DUYỆT ĐƠN! (Tài khoản user không tồn tại nên XU không được cộng)");
    }
    updateLocalStatsOnApprove(report);
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
          <input class="bg-[#0d121f] text-white text-[10px] py-2 px-3 rounded-lg border border-slate-700 outline-none w-[170px] md:w-[200px] placeholder:text-slate-600 font-sans not-italic normal-case" v-model="searchQuery" @keyup.enter="handleSearch" type="text" placeholder="🔎 Tìm Username hoặc SĐT..." />
          <button class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-[10px] font-black transition-colors" @click="handleSearch">TÌM</button>
          <button class="bg-slate-700 hover:bg-slate-600 text-white px-2 py-2 rounded-lg text-[10px] font-black transition-colors" v-if="searchQuery" @click="searchQuery = ''; handleSearch()">✕</button>
        </div>

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
        🧵 Thread hằng ngày
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
            <span class="text-blue-400 font-bold text-sm tracking-widest">ĐÃ CHỌN: <span class="text-white text-lg">{{ selectedOtherJobs.length }}</span> ĐƠN</span>
            <button class="bg-blue-500 hover:bg-blue-400 text-white px-6 py-3 rounded-xl text-[10px] md:text-sm tracking-widest font-black transition-all active:scale-95 shadow-[0_0_20px_rgba(59,130,246,0.5)]" @click="bulkApproveOtherJobs">
              DUYỆT TẤT CẢ ĐƠN ĐÃ CHỌN 🚀
            </button>
          </div>
        </Transition>

        <table class="w-full text-left border-collapse" v-if="activeTab === 'app_jobs' || activeTab === 'other_jobs'">
          <thead>
            <tr class="bg-[#0d121f] text-blue-500 text-[10px] tracking-[2px] border-b border-slate-800">
              <th class="p-6 text-center w-12" v-if="activeTab === 'other_jobs'">
                <input class="w-5 h-5 cursor-pointer accent-blue-500 bg-[#111726] border-slate-700 rounded" type="checkbox" :checked="isAllOtherJobsSelected" @change="toggleAllOtherJobs" />
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
                <input class="w-5 h-5 cursor-pointer accent-blue-500 bg-[#111726] border-slate-700 rounded" v-if="rp.status === 'pending'" type="checkbox" :value="rp.id" v-model="selectedOtherJobs" />
              </td>

              <td class="p-6">
                <div class="mb-2 pb-2 border-b border-slate-700/50 flex justify-between items-start">
                  <div>
                    <span class="text-[9px] text-emerald-400 tracking-widest block mb-0.5">TÀI KHOẢN GỐC:</span>
                    <div class="text-white text-sm md:text-base font-black truncate max-w-[200px]">{{ usersMap[rp.uid]?.username || usersMap[rp.uid]?.fullName || 'CHƯA CẬP NHẬT' }}</div>
                    <div class="text-slate-400 text-[10px] mt-0.5 font-sans not-italic tracking-normal">Ví hiện tại: <span class="text-yellow-400 font-black">{{ usersMap[rp.uid]?.balance }} XU</span></div>
                    <div class="text-slate-400 text-[10px] mt-0.5 font-sans not-italic tracking-normal">
                      Ngày sinh: 
                      <span class="text-emerald-400 font-bold uppercase" v-if="usersMap[rp.uid]?.dateOfBirth || usersMap[rp.uid]?.dob || usersMap[rp.uid]?.ngaysinh">{{ usersMap[rp.uid]?.dateOfBirth || usersMap[rp.uid]?.dob || usersMap[rp.uid]?.ngaysinh }}</span>
                      <span class="text-slate-600 italic bg-slate-800/50 px-1 py-0.5 rounded" v-else>Khách cũ</span>
                    </div>
                  </div>
                  <div class="flex flex-col items-end gap-1">
                    <button class="bg-yellow-600/20 text-yellow-500 hover:bg-yellow-500 hover:text-white border border-yellow-600/50 px-2 py-1 rounded-lg text-[8px] transition-all" @click="fixUserWallet(rp.uid)">SỬA VÍ</button>
                    <button class="bg-green-600/20 text-green-400 hover:bg-green-500 hover:text-white border border-green-600/50 px-2 py-1 rounded-lg text-[8px] transition-all" @click="congXu(rp.uid)">+ CỘNG XU</button>
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
                </div>
              </td>
              <td class="p-6">
                <div class="text-slate-300 text-[11px] leading-tight mb-1">{{ rp.jobName }}</div>
                <div class="text-emerald-400 text-sm font-black">+{{ String(rp.reward).replace(/\D/g, '') }} XU</div>
              </td>
              <td class="p-6">
                <div class="flex flex-col items-center gap-2">
                  <div class="flex justify-center gap-2 flex-wrap">
                    <a class="bg-blue-600 text-[8px] text-white p-2 rounded" v-if="rp.taskLink" :href="rp.taskLink" target="_blank">LINK BÀI</a>
                    <div class="cursor-pointer" v-for="(img, idx) in getImageUrls(rp)" :key="idx" @click="openImage(img)">
                      <div class="w-12 h-12 rounded-lg border border-slate-700 overflow-hidden hover:scale-110 hover:border-blue-500 transition-all">
                        <img class="w-full h-full object-cover" :src="img" />
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
                <div class="text-white text-sm md:text-base font-black">{{ usersMap[wd.uid]?.username || 'CHƯA CẬP NHẬT' }}</div>
                
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
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>