<script setup lang="ts">
import { ref, computed, watch } from 'vue'
// @ts-ignore
import { db, auth } from '@/firebase'
import {
  collection, query, where,
  getDocs, runTransaction, doc, serverTimestamp, increment
} from 'firebase/firestore'
import Swal from 'sweetalert2'
import { normalizeThreadUrl, getDateKey } from '@/utils/threadUtils'

// ─── Types ───────────────────────────────────────────────────────────────────

type WarningCode =
  | 'dup_url'        // cùng link, cùng user
  | 'dup_url_multi'  // cùng link, nhiều user
  | 'dup_nick'       // cùng nick trong ngày
  | 'dup_nick_multi' // cùng nick, nhiều user
  | 'invalid_url'    // link không chứa threads.net
  | 'low_views'      // view QR < 100
  | 'over_limit'     // uid có > 5 đơn hợp lệ/ngày

interface ThreadReport {
  id: string
  uid: string
  fullName: string
  phoneRef: string
  threadNick: string
  threadNickLower?: string
  postUrl: string
  postUrlNormalized?: string
  qrViewCount: number
  note: string
  reward: number
  status: 'pending' | 'paid' | 'rejected'
  site: string
  dateKey?: string
  createdAt: any
  paidAt: any
  paidBy: string | null
  rejectedAt?: any
  rejectedBy?: string | null
  rejectReason?: string
  rejectNote?: string
}

interface UserGroup {
  uid: string
  fullName: string
  phoneRef: string
  reports: ThreadReport[]
  pendingCount: number
  paidCount: number
  rejectedCount: number
  totalXu: number
  hasWarning: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_VALID_PER_DAY = 5

const WARNING_LABEL: Record<WarningCode, string> = {
  dup_url:        '⚠ Link trùng',
  dup_url_multi:  '⚠ Link nhiều user',
  dup_nick:       '⚠ Nick trùng',
  dup_nick_multi: '⚠ Nick nhiều user',
  invalid_url:    '⚠ Link không chuẩn',
  low_views:      '⚠ View thấp',
  over_limit:     '⚠ Quá 5 đơn hợp lệ',
}

const REJECT_REASON_LABEL: Record<string, string> = {
  link_sai:      'Link sai',
  khong_thay_qr: 'Không thấy QR',
  view_thap:     'View không đạt',
  trung_bai:     'Trùng bài',
  sai_nick:      'Sai nick Thread',
  spam:          'Spam / nộp sai',
  khac:          'Khác',
}

function isHeavyWarning(code: WarningCode) {
  return code === 'dup_url_multi' || code === 'dup_nick_multi' || code === 'over_limit'
}

// ─── Props & Emits ───────────────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  globalSearchResults?: any[]
  isGlobalSearch?: boolean
}>(), {
  globalSearchResults: () => [],
  isGlobalSearch: false
})
const emit = defineEmits<{ (e: 'clearSearch'): void }>()

// ─── State ───────────────────────────────────────────────────────────────────

const selectedDate  = ref(getDateKey())
const statusFilter  = ref<'pending' | 'paid' | 'rejected' | 'all'>('pending')
const warningFilter = ref<'all' | 'has_warning' | 'dup_url' | 'dup_nick'>('all')
const searchText    = ref('')
const viewMode      = ref<'grouped' | 'flat'>('grouped')

const reports        = ref<ThreadReport[]>([])
const lastDoc        = ref<any>(null)
const hasMore        = ref(false)
const isLoading      = ref(false)
const isLoadingMore  = ref(false)
const isScanAllDone  = ref(false)
const isBulkPaying   = ref(false)
const isBulkRejecting = ref(false)

const selectedDailyThreadReportIds = ref<string[]>([])
const expandedUids = ref<string[]>([])

interface DupDetail { type: 'url' | 'nick'; key: string }
const activeDupDetail = ref<DupDetail | null>(null)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function urlKey(r: ThreadReport)  { return r.postUrlNormalized  || normalizeThreadUrl(r.postUrl) }
function nickKey(r: ThreadReport) { return r.threadNickLower    || r.threadNick.trim().toLowerCase() }

function formatTime(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function rejectReasonLabel(r: ThreadReport): string {
  if (!r.rejectReason) return ''
  const label = REJECT_REASON_LABEL[r.rejectReason] || r.rejectReason
  return r.rejectNote ? `${label} — ${r.rejectNote}` : label
}

// ─── Computed: dup maps ───────────────────────────────────────────────────────

const urlMap = computed(() => {
  const m: Record<string, ThreadReport[]> = {}
  for (const r of reports.value) {
    const k = urlKey(r); if (!m[k]) m[k] = []; m[k].push(r)
  }
  return m
})

const nickMap = computed(() => {
  const m: Record<string, ThreadReport[]> = {}
  for (const r of reports.value) {
    const k = nickKey(r); if (!m[k]) m[k] = []; m[k].push(r)
  }
  return m
})

// Đếm đơn hợp lệ (pending + paid) mỗi uid — rejected không tính
const uidValidCountMap = computed(() => {
  const m: Record<string, number> = {}
  for (const r of reports.value) {
    if (r.status === 'pending' || r.status === 'paid')
      m[r.uid] = (m[r.uid] || 0) + 1
  }
  return m
})

function getWarnings(r: ThreadReport): WarningCode[] {
  if (r.status === 'rejected') return []  // đơn rejected không hiện warning

  const codes: WarningCode[] = []

  const ug = urlMap.value[urlKey(r)] || []
  const ugActive = ug.filter(x => x.status !== 'rejected')
  if (ugActive.length > 1) {
    const uids = new Set(ugActive.map(x => x.uid))
    codes.push(uids.size > 1 ? 'dup_url_multi' : 'dup_url')
  }

  const ng = nickMap.value[nickKey(r)] || []
  const ngActive = ng.filter(x => x.status !== 'rejected')
  if (ngActive.length > 1) {
    const uids = new Set(ngActive.map(x => x.uid))
    codes.push(uids.size > 1 ? 'dup_nick_multi' : 'dup_nick')
  }

  if (!r.postUrl.includes('threads.net') && !r.postUrl.includes('threads.com'))
    codes.push('invalid_url')

  if (r.qrViewCount < 100) codes.push('low_views')
  if ((uidValidCountMap.value[r.uid] || 0) > MAX_VALID_PER_DAY) codes.push('over_limit')

  return codes
}

// ─── Computed: filtered list + grouped ───────────────────────────────────────

const filteredReports = computed(() => {
  // Chế độ tìm kiếm toàn cục: dùng globalSearchResults làm nguồn dữ liệu
  if (props.isGlobalSearch) {
    let list = (props.globalSearchResults || []) as ThreadReport[]
    if (searchText.value.trim()) {
      const s = searchText.value.trim().toLowerCase()
      list = list.filter(r =>
        (r.fullName || '').toLowerCase().includes(s) ||
        (r.phoneRef || '').includes(s) ||
        (r.threadNick || '').toLowerCase().includes(s) ||
        (r.postUrl || '').toLowerCase().includes(s)
      )
    }
    return list
  }

  // Chế độ bình thường: lọc theo ngày/status/warning
  let list = reports.value

  if (statusFilter.value !== 'all')
    list = list.filter(r => r.status === statusFilter.value)

  if (warningFilter.value !== 'all') {
    list = list.filter(r => {
      const w = getWarnings(r)
      if (warningFilter.value === 'has_warning') return w.length > 0
      if (warningFilter.value === 'dup_url')  return w.includes('dup_url')  || w.includes('dup_url_multi')
      if (warningFilter.value === 'dup_nick') return w.includes('dup_nick') || w.includes('dup_nick_multi')
      return true
    })
  }

  if (searchText.value.trim()) {
    const s = searchText.value.trim().toLowerCase()
    list = list.filter(r =>
      (r.fullName || '').toLowerCase().includes(s) ||
      (r.phoneRef || '').includes(s) ||
      (r.threadNick || '').toLowerCase().includes(s) ||
      (r.postUrl || '').toLowerCase().includes(s)
    )
  }

  return list
})

const groupedByUser = computed((): UserGroup[] => {
  const map: Record<string, UserGroup> = {}
  for (const r of filteredReports.value) {
    if (!map[r.uid]) map[r.uid] = {
      uid: r.uid, fullName: r.fullName, phoneRef: r.phoneRef, reports: [],
      pendingCount: 0, paidCount: 0, rejectedCount: 0, totalXu: 0, hasWarning: false
    }
    const g = map[r.uid] as UserGroup
    g.reports.push(r)
    if (r.status === 'pending')  { g.pendingCount++ }
    if (r.status === 'paid')     { g.paidCount++;     g.totalXu += r.reward || 0 }
    if (r.status === 'rejected') { g.rejectedCount++ }
    if (getWarnings(r).length > 0) g.hasWarning = true
  }
  return Object.values(map).sort((a, b) => b.pendingCount - a.pendingCount)
})

const totalPending   = computed(() => reports.value.filter(r => r.status === 'pending').length)
const totalPaid      = computed(() => reports.value.filter(r => r.status === 'paid').length)
const totalRejected  = computed(() => reports.value.filter(r => r.status === 'rejected').length)
const totalXuPending = computed(() => reports.value.filter(r => r.status === 'pending').reduce((s, r) => s + (r.reward || 0), 0))
const selectedPending = computed(() => selectedDailyThreadReportIds.value.filter(id => reports.value.find(r => r.id === id)?.status === 'pending'))
const visiblePendingReports = computed(() => filteredReports.value.filter(r => r.status === 'pending'))
const isProcessingBulk = computed(() => isBulkPaying.value || isBulkRejecting.value)

// ─── Load data ────────────────────────────────────────────────────────────────

function sortByCreatedAt(list: ThreadReport[]): ThreadReport[] {
  return list.slice().sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? 0
    const tb = b.createdAt?.toMillis?.() ?? 0
    return tb - ta
  })
}

async function loadReports() {
  isLoading.value     = true
  reports.value       = []
  lastDoc.value       = null
  hasMore.value       = false
  isScanAllDone.value = false
  selectedDailyThreadReportIds.value   = []
  activeDupDetail.value = null

  const c: any[] = []
  if (statusFilter.value !== 'all') c.push(where('status', '==', statusFilter.value))
  c.push(where('dateKey', '==', selectedDate.value))

  console.log('[Thread Admin] loadReports:', {
    dateKey: selectedDate.value,
    status: statusFilter.value === 'all' ? '(no filter)' : statusFilter.value,
  })

  try {
    const snap = await getDocs(query(collection(db, 'daily_thread_reports'), ...c))
    console.log('[Thread Admin] result count:', snap.size)
    if (snap.size > 0 && snap.docs[0])
      console.log('[Thread Admin] sample doc:', { id: snap.docs[0].id, ...snap.docs[0].data() })
    reports.value = sortByCreatedAt(snap.docs.map(d => ({ id: d.id, ...d.data() } as ThreadReport)))
    hasMore.value = false
  } catch (e) {
    console.error('[Thread Admin] loadReports ERROR:', e)
  } finally {
    isLoading.value = false
  }
}

async function loadMore() { /* không dùng — xem scanAllForDay */ }

async function scanAllForDay() {
  isLoading.value = true
  selectedDailyThreadReportIds.value = []
  activeDupDetail.value = null
  console.log('[Thread Admin] scanAllForDay:', { dateKey: selectedDate.value })
  try {
    const snap = await getDocs(query(
      collection(db, 'daily_thread_reports'),
      where('dateKey', '==', selectedDate.value)
    ))
    console.log('[Thread Admin] scan count:', snap.size)
    reports.value     = sortByCreatedAt(snap.docs.map(d => ({ id: d.id, ...d.data() } as ThreadReport)))
    lastDoc.value     = null
    hasMore.value     = false
    isScanAllDone.value = true
  } catch (e) {
    console.error('[Thread Admin] scanAllForDay ERROR:', e)
  } finally {
    isLoading.value = false
  }
}

watch([selectedDate, statusFilter], loadReports, { immediate: true })

// Đổi warning-filter/search cũng làm thay đổi danh sách đang hiển thị — clear selected
// để tránh xử lý nhầm đơn không còn hiển thị (date/status đã tự clear qua loadReports ở trên).
watch([warningFilter, searchText], () => {
  selectedDailyThreadReportIds.value = []
})

// ─── Actions ─────────────────────────────────────────────────────────────────

function removeFromSelection(id: string) {
  const i = selectedDailyThreadReportIds.value.indexOf(id)
  if (i !== -1) selectedDailyThreadReportIds.value.splice(i, 1)
}

async function payReport(report: ThreadReport) {
  if (report.status !== 'pending') return
  const { isConfirmed, value } = await Swal.fire({
    title: 'Cộng xu cho user',
    html: `<div style="text-align:left;font-size:14px;line-height:1.9">
      <b>${report.fullName}</b><br/>
      Nick: <b>${report.threadNick}</b><br/>
      View QR: <b>${report.qrViewCount.toLocaleString('vi-VN')}</b>
    </div>`,
    input: 'number',
    inputLabel: 'Số xu muốn cộng',
    inputValue: report.reward || 0,
    inputAttributes: { min: '0', step: '1000' },
    showCancelButton: true,
    confirmButtonText: 'Cộng xu ✅',
    cancelButtonText: 'Huỷ',
    confirmButtonColor: '#7c3aed',
    background: '#111726',
    color: '#e2e8f0',
    inputValidator: (v) => { if (!v || isNaN(Number(v)) || Number(v) <= 0) return 'Nhập số xu hợp lệ' }
  })
  if (!isConfirmed || !value) return

  const xuAmount = parseInt(value)
  const adminUid = auth.currentUser?.uid || ''
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'daily_thread_reports', report.id)
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error('Đơn không tồn tại')
      if (snap.data().status !== 'pending') throw new Error('Đơn này không còn ở trạng thái chờ')
      tx.update(doc(db, 'users', report.uid), { balance: increment(xuAmount) })
      tx.update(ref, { status: 'paid', reward: xuAmount, paidAt: serverTimestamp(), paidBy: adminUid })
    })
    const idx = reports.value.findIndex(r => r.id === report.id)
    if (idx !== -1) reports.value[idx] = { ...reports.value[idx], status: 'paid', reward: xuAmount } as ThreadReport
    removeFromSelection(report.id)
    Swal.fire({ title: 'Đã cộng xu!', text: `Đã cộng ${xuAmount.toLocaleString('vi-VN')} xu cho ${report.fullName}.`, icon: 'success', background: '#111726', color: '#e2e8f0', confirmButtonColor: '#7c3aed', timer: 2000, showConfirmButton: false })
  } catch (err: any) {
    Swal.fire({ title: 'Lỗi', text: err?.message || 'Có lỗi xảy ra.', icon: 'error', background: '#111726', color: '#e2e8f0', confirmButtonColor: '#7c3aed' })
  }
}

async function rejectReport(report: ThreadReport) {
  if (report.status !== 'pending') return

  const result = await Swal.fire({
    title: 'Từ chối đơn',
    html: `<div style="text-align:left">
      <p style="color:#94a3b8;font-size:12px;margin-bottom:6px"><b>${report.fullName}</b> — ${report.threadNick}</p>
      <p style="color:#94a3b8;font-size:11px;margin-bottom:6px">Lý do từ chối:</p>
      <select id="swal-reject-reason" style="width:100%;padding:8px 10px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:8px;margin-bottom:10px;font-size:13px">
        <option value="link_sai">Link sai</option>
        <option value="khong_thay_qr">Không thấy QR</option>
        <option value="view_thap">View không đạt</option>
        <option value="trung_bai">Trùng bài</option>
        <option value="sai_nick">Sai nick Thread</option>
        <option value="spam">Spam / nộp sai</option>
        <option value="khac">Khác</option>
      </select>
      <p style="color:#94a3b8;font-size:11px;margin-bottom:6px">Ghi chú thêm (tuỳ chọn):</p>
      <textarea id="swal-reject-note" rows="2" placeholder="Nhập ghi chú nếu cần..." style="width:100%;padding:8px 10px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:8px;resize:none;font-size:13px"></textarea>
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Xác nhận từ chối',
    cancelButtonText: 'Huỷ',
    confirmButtonColor: '#dc2626',
    background: '#111726',
    color: '#e2e8f0',
    preConfirm: () => {
      const reason = (document.getElementById('swal-reject-reason') as HTMLSelectElement)?.value || 'khac'
      const note   = (document.getElementById('swal-reject-note')   as HTMLTextAreaElement)?.value?.trim() || ''
      return { reason, note }
    }
  })

  if (!result.isConfirmed) return
  const { reason, note } = result.value as { reason: string; note: string }
  const adminUid = auth.currentUser?.uid || ''

  console.log('[Thread Admin] rejectReport:', { reportId: report.id, beforeStatus: report.status, rejectReason: reason, rejectNote: note })

  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'daily_thread_reports', report.id)
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error('Đơn không tồn tại')
      if (snap.data().status !== 'pending') throw new Error('Đơn này đã được xử lý trước đó')
      tx.update(ref, {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: adminUid,
        rejectReason: reason,
        rejectNote: note,
      })
    })
    const idx = reports.value.findIndex(r => r.id === report.id)
    if (idx !== -1) reports.value[idx] = { ...reports.value[idx], status: 'rejected', rejectReason: reason, rejectNote: note } as ThreadReport
    removeFromSelection(report.id)
    console.log('[Thread Admin] Rejected successfully:', report.id)
    Swal.fire({ title: 'Đã từ chối!', text: `Đã từ chối đơn của ${report.fullName}.`, icon: 'info', background: '#111726', color: '#e2e8f0', confirmButtonColor: '#7c3aed', timer: 2000, showConfirmButton: false })
  } catch (err: any) {
    console.error('[Thread Admin] Reject failed:', err)
    Swal.fire({ title: 'Lỗi', text: err?.message || 'Có lỗi xảy ra.', icon: 'error', background: '#111726', color: '#e2e8f0', confirmButtonColor: '#7c3aed' })
  }
}

// Popup progress không cho đóng/tương tác trong lúc xử lý hàng loạt — dùng chung cho bulkPay/bulkReject.
async function runBulkWithProgress(
  title: string,
  list: ThreadReport[],
  processOne: (report: ThreadReport) => Promise<'success' | 'skip' | 'error'>
): Promise<{ success: number; skip: number; error: number }> {
  let success = 0, skip = 0, error = 0
  const total = list.length

  const renderHtml = (current: number) => `
    <div style="text-align:left;font-size:13px;line-height:1.9">
      <p style="color:#e2e8f0">Đang xử lý ${current}/${total} đơn...</p>
      <p>Thành công: <b style="color:#34d399">${success}</b></p>
      <p>Bỏ qua: <b style="color:#fbbf24">${skip}</b></p>
      <p>Lỗi: <b style="color:#f87171">${error}</b></p>
    </div>`

  Swal.fire({
    title,
    html: renderHtml(0),
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    background: '#111726',
    color: '#e2e8f0',
  })

  for (let i = 0; i < list.length; i++) {
    const report = list[i] as ThreadReport
    let outcome: 'success' | 'skip' | 'error'
    try {
      outcome = await processOne(report)
    } catch (e) {
      console.error(`[Thread Admin] bulk process failed ${report.id}:`, e)
      outcome = 'error'
    }
    if (outcome === 'success') success++
    else if (outcome === 'skip') skip++
    else error++
    Swal.update({ html: renderHtml(i + 1) })
  }

  Swal.close()
  return { success, skip, error }
}

async function bulkPay() {
  if (isProcessingBulk.value) return
  const pendingList = reports.value.filter(r => selectedDailyThreadReportIds.value.includes(r.id) && r.status === 'pending')
  if (!pendingList.length) return

  const totalXu = pendingList.reduce((s, r) => s + (r.reward || 0), 0)
  const { isConfirmed } = await Swal.fire({
    title: `Bạn sắp cộng xu cho ${pendingList.length} đơn đã chọn. Tiếp tục?`,
    html: `Tổng xu sẽ cộng: <b>${totalXu.toLocaleString('vi-VN')} xu</b><br/><span style="font-size:12px;color:#94a3b8">Hệ thống tự kiểm tra chống cộng trùng.</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Xác nhận cộng xu',
    cancelButtonText: 'Huỷ',
    confirmButtonColor: '#7c3aed',
    background: '#111726',
    color: '#e2e8f0',
  })
  if (!isConfirmed) return

  isBulkPaying.value = true
  const adminUid = auth.currentUser?.uid || ''

  const { success, skip, error } = await runBulkWithProgress('Đang cộng xu...', pendingList, async (report) => {
    let wasSkipped = false
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'daily_thread_reports', report.id)
      const snap = await tx.get(ref)
      wasSkipped = !snap.exists() || snap.data().status !== 'pending'
      if (wasSkipped) return
      tx.update(doc(db, 'users', report.uid), { balance: increment(report.reward || 0) })
      tx.update(ref, { status: 'paid', paidAt: serverTimestamp(), paidBy: adminUid })
    })
    if (wasSkipped) return 'skip'
    const idx = reports.value.findIndex(r => r.id === report.id)
    if (idx !== -1) reports.value[idx] = { ...reports.value[idx], status: 'paid' } as ThreadReport
    return 'success'
  })

  isBulkPaying.value = false
  selectedDailyThreadReportIds.value = []
  Swal.fire({
    title: 'Hoàn tất!',
    html: `Thành công: <b style="color:#34d399">${success}</b><br/>Bỏ qua: <b style="color:#fbbf24">${skip}</b>${error > 0 ? `<br/>Lỗi: <b style="color:#f87171">${error}</b>` : ''}`,
    icon: error > 0 ? 'warning' : 'success', background: '#111726', color: '#e2e8f0', confirmButtonColor: '#7c3aed', timer: error > 0 ? undefined : 3000, showConfirmButton: error > 0
  })
}

// Lõi dùng chung cho luồng "từ chối hàng loạt" (chọn tay qua checkbox)
async function confirmAndRejectMany(pendingList: ThreadReport[], opts: { title: string; infoHtml: string }) {
  if (isProcessingBulk.value) return
  if (!pendingList.length) return

  const result = await Swal.fire({
    title: opts.title,
    html: `<div style="text-align:left">
      <p style="color:#94a3b8;font-size:12px;margin-bottom:10px">${opts.infoHtml}</p>
      <p style="color:#94a3b8;font-size:11px;margin-bottom:6px">Lý do từ chối (áp dụng cho tất cả):</p>
      <select id="swal-bulk-reject-reason" style="width:100%;padding:8px 10px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:8px;margin-bottom:10px;font-size:13px">
        <option value="link_sai">Link sai</option>
        <option value="khong_thay_qr">Không thấy QR</option>
        <option value="view_thap">View không đạt</option>
        <option value="trung_bai">Trùng bài</option>
        <option value="sai_nick">Sai nick Thread</option>
        <option value="spam">Spam / nộp sai</option>
        <option value="khac">Khác</option>
      </select>
      <p style="color:#94a3b8;font-size:11px;margin-bottom:6px">Ghi chú thêm (tuỳ chọn):</p>
      <textarea id="swal-bulk-reject-note" rows="2" placeholder="Nhập ghi chú nếu cần..." style="width:100%;padding:8px 10px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:8px;resize:none;font-size:13px"></textarea>
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Xác nhận từ chối',
    cancelButtonText: 'Huỷ',
    confirmButtonColor: '#dc2626',
    background: '#111726',
    color: '#e2e8f0',
    preConfirm: () => {
      const reason = (document.getElementById('swal-bulk-reject-reason') as HTMLSelectElement)?.value || 'khac'
      const note   = (document.getElementById('swal-bulk-reject-note')   as HTMLTextAreaElement)?.value?.trim() || ''
      return { reason, note }
    }
  })
  if (!result.isConfirmed) return
  const { reason, note } = result.value as { reason: string; note: string }

  console.log('Bulk reject daily thread reports:', {
    count: pendingList.length,
    reportIds: pendingList.map(r => r.id),
    rejectReason: reason,
  })

  isBulkRejecting.value = true
  const adminUid = auth.currentUser?.uid || ''

  const { success, skip, error } = await runBulkWithProgress('Đang từ chối...', pendingList, async (report) => {
    let wasSkipped = false
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'daily_thread_reports', report.id)
      const snap = await tx.get(ref)
      wasSkipped = !snap.exists() || snap.data().status !== 'pending'
      if (wasSkipped) return
      tx.update(ref, {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: adminUid,
        rejectReason: reason,
        rejectNote: note,
      })
    })
    if (wasSkipped) return 'skip'
    const idx = reports.value.findIndex(r => r.id === report.id)
    if (idx !== -1) reports.value[idx] = { ...reports.value[idx], status: 'rejected', rejectReason: reason, rejectNote: note } as ThreadReport
    return 'success'
  })

  isBulkRejecting.value = false
  selectedDailyThreadReportIds.value = []
  Swal.fire({
    title: 'Hoàn tất!',
    html: `Thành công: <b style="color:#34d399">${success}</b><br/>Bỏ qua: <b style="color:#fbbf24">${skip}</b>${error > 0 ? `<br/>Lỗi: <b style="color:#f87171">${error}</b>` : ''}`,
    icon: error > 0 ? 'warning' : 'info', background: '#111726', color: '#e2e8f0', confirmButtonColor: '#7c3aed', timer: error > 0 ? undefined : 3000, showConfirmButton: error > 0
  })
}

async function bulkReject() {
  const pendingList = reports.value.filter(r => selectedDailyThreadReportIds.value.includes(r.id) && r.status === 'pending')
  await confirmAndRejectMany(pendingList, {
    title: `Từ chối ${pendingList.length} đơn?`,
    infoHtml: `Sẽ từ chối <b>${pendingList.length}</b> đơn đang chọn (chỉ áp dụng đơn còn <b>chờ</b>).`,
  })
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function toggleExpand(uid: string) {
  const i = expandedUids.value.indexOf(uid)
  if (i !== -1) expandedUids.value.splice(i, 1)
  else expandedUids.value.push(uid)
}

// Debug tạm thời — xem YÊU CẦU 9: kiểm tra state selected khi tick có đổi đúng không.
function logSelected() {
  console.log('Selected daily thread reports:', Array.from(selectedDailyThreadReportIds.value))
}

function toggleSelect(id: string) {
  const i = selectedDailyThreadReportIds.value.indexOf(id)
  if (i !== -1) selectedDailyThreadReportIds.value.splice(i, 1)
  else selectedDailyThreadReportIds.value.push(id)
  logSelected()
}

function selectAllPending() {
  const ids = filteredReports.value.filter(r => r.status === 'pending').map(r => r.id)
  selectedDailyThreadReportIds.value = [...new Set([...selectedDailyThreadReportIds.value, ...ids])]
  logSelected()
}

function clearSelection() { selectedDailyThreadReportIds.value = []; logSelected() }

function setDateToday()     { selectedDate.value = getDateKey() }
function setDateYesterday() { const d = new Date(); d.setDate(d.getDate() - 1); selectedDate.value = getDateKey(d) }

function toggleGroupSelect(groupReports: ThreadReport[], checked: boolean) {
  const allPending = groupReports.filter(r => r.status === 'pending').map(r => r.id)
  if (checked) selectedDailyThreadReportIds.value = [...new Set([...selectedDailyThreadReportIds.value, ...allPending])]
  else selectedDailyThreadReportIds.value = selectedDailyThreadReportIds.value.filter((id: string) => !allPending.includes(id))
  logSelected()
}

function openDupDetail(type: 'url' | 'nick', key: string) {
  if (activeDupDetail.value?.type === type && activeDupDetail.value?.key === key)
    activeDupDetail.value = null
  else
    activeDupDetail.value = { type, key }
}

const yesterdayKey = computed(() => {
  const d = new Date(); d.setDate(d.getDate() - 1); return getDateKey(d)
})
</script>

<template>
  <div class="space-y-4">

    <!-- Banner: chế độ tìm kiếm toàn cục -->
    <div v-if="props.isGlobalSearch"
         class="flex items-center justify-between bg-purple-900/20 border border-purple-500/30 rounded-xl px-4 py-3 text-xs">
      <span class="text-purple-300">
        🔍 Kết quả tìm kiếm toàn cục —
        <b class="text-white">{{ props.globalSearchResults?.length || 0 }}</b> đơn Thread
      </span>
      <button class="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1 rounded-lg transition-all active:scale-95"
              @click="emit('clearSearch')">
        ✕ Xóa tìm kiếm
      </button>
    </div>

    <!-- ── Filter bar ─────────────────────────────────────────── -->
    <div class="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 space-y-3">

      <!-- Row 1: Date -->
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[10px] text-slate-500 uppercase tracking-widest font-semibold w-12 shrink-0">Ngày</span>
        <button @click="setDateToday"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          :class="selectedDate === getDateKey() ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'">
          Hôm nay
        </button>
        <button @click="setDateYesterday"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          :class="selectedDate === yesterdayKey ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'">
          Hôm qua
        </button>
        <input v-model="selectedDate" type="date"
          class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/60 [color-scheme:dark]" />
      </div>

      <!-- Row 2: Status -->
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[10px] text-slate-500 uppercase tracking-widest font-semibold w-12 shrink-0">Status</span>
        <button
          v-for="opt in [
            { v: 'pending',  label: 'Chờ cộng xu' },
            { v: 'paid',     label: 'Đã cộng xu' },
            { v: 'rejected', label: 'Đã từ chối' },
            { v: 'all',      label: 'Tất cả' },
          ]"
          :key="opt.v"
          @click="statusFilter = opt.v as any"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          :class="statusFilter === opt.v ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'">
          {{ opt.label }}
        </button>
      </div>

      <!-- Row 3: Warning filter -->
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[10px] text-slate-500 uppercase tracking-widest font-semibold w-12 shrink-0">Cảnh báo</span>
        <button
          v-for="opt in [{ v: 'all', label: 'Tất cả' }, { v: 'has_warning', label: 'Có cảnh báo' }, { v: 'dup_url', label: 'Link trùng' }, { v: 'dup_nick', label: 'Nick trùng' }]"
          :key="opt.v"
          @click="warningFilter = opt.v as any"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          :class="warningFilter === opt.v ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'">
          {{ opt.label }}
        </button>
      </div>

      <!-- Row 4: Search + controls -->
      <div class="flex items-center gap-2 flex-wrap">
        <input v-model="searchText" type="text" placeholder="Tìm họ tên, SĐT, nick, link..."
          class="flex-1 min-w-[180px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60" />
        <button @click="viewMode = viewMode === 'grouped' ? 'flat' : 'grouped'"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all whitespace-nowrap">
          {{ viewMode === 'grouped' ? '👤 Theo người' : '📋 Danh sách' }}
        </button>
        <button @click="scanAllForDay" :disabled="isScanAllDone || isLoading"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
          :class="isScanAllDone ? 'bg-emerald-500/10 text-emerald-400 cursor-default' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'">
          {{ isScanAllDone ? '✅ Đã quét trùng' : '🔍 Quét trùng ngày' }}
        </button>
      </div>
    </div>

    <!-- ── Stats row ──────────────────────────────────────────── -->
    <div class="grid grid-cols-4 gap-2 text-center">
      <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-2.5 px-2">
        <p class="text-[9px] text-yellow-400/70 uppercase tracking-wide font-semibold">Chờ cộng</p>
        <p class="text-yellow-300 font-black text-lg leading-tight">{{ totalPending }}</p>
        <p class="text-[9px] text-yellow-400/50">{{ totalXuPending.toLocaleString('vi-VN') }} xu</p>
      </div>
      <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-2.5 px-2">
        <p class="text-[9px] text-emerald-400/70 uppercase tracking-wide font-semibold">Đã cộng</p>
        <p class="text-emerald-300 font-black text-lg leading-tight">{{ totalPaid }}</p>
      </div>
      <div class="bg-red-500/10 border border-red-500/20 rounded-xl py-2.5 px-2">
        <p class="text-[9px] text-red-400/70 uppercase tracking-wide font-semibold">Từ chối</p>
        <p class="text-red-300 font-black text-lg leading-tight">{{ totalRejected }}</p>
      </div>
      <div class="bg-slate-800/60 border border-slate-700/40 rounded-xl py-2.5 px-2">
        <p class="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Tổng đơn</p>
        <p class="text-white font-black text-lg leading-tight">{{ reports.length }}</p>
        <p v-if="isScanAllDone" class="text-[9px] text-emerald-400/60">toàn bộ ngày</p>
      </div>
    </div>

    <!-- ── Chọn tất cả đơn chờ đang hiển thị ──────────────────── -->
    <div v-if="visiblePendingReports.length > 0"
      class="flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-4 py-2.5">
      <input type="checkbox"
        class="w-5 h-5 rounded border-2 border-slate-400 bg-slate-900 appearance-none checked:bg-purple-600 checked:border-purple-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        :disabled="isProcessingBulk"
        :checked="visiblePendingReports.every(r => selectedDailyThreadReportIds.includes(r.id))"
        @change="(e) => (e.target as HTMLInputElement).checked ? selectAllPending() : clearSelection()" />
      <span class="text-xs text-slate-400 font-semibold">
        Chọn tất cả đơn chờ đang hiển thị ({{ visiblePendingReports.length }})
      </span>
    </div>

    <!-- ── Bulk action bar ────────────────────────────────────── -->
    <div v-if="selectedDailyThreadReportIds.length > 0"
      class="flex items-center justify-between gap-3 bg-purple-900/30 border border-purple-500/30 rounded-xl px-4 py-2.5 flex-wrap">
      <span class="text-sm text-purple-200 font-semibold">
        Đã chọn: <b>{{ selectedPending.length }}</b> đơn
      </span>
      <div class="flex gap-2">
        <button @click="clearSelection" :disabled="isProcessingBulk"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          Bỏ chọn
        </button>
        <button @click="bulkPay" :disabled="isProcessingBulk || selectedPending.length === 0"
          class="px-4 py-1.5 rounded-lg text-xs font-black transition-all"
          :class="isProcessingBulk || selectedPending.length === 0
            ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white hover:opacity-90'">
          {{ isBulkPaying ? 'Đang xử lý...' : `✅ Cộng xu đơn đã chọn (${selectedPending.length})` }}
        </button>
        <button @click="bulkReject" :disabled="isProcessingBulk || selectedPending.length === 0"
          class="px-4 py-1.5 rounded-lg text-xs font-black transition-all"
          :class="isProcessingBulk || selectedPending.length === 0
            ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
            : 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30'">
          {{ isBulkRejecting ? 'Đang xử lý...' : `❌ Từ chối đơn đã chọn (${selectedPending.length})` }}
        </button>
      </div>
    </div>

    <!-- ── Loading ────────────────────────────────────────────── -->
    <div v-if="isLoading" class="text-center py-16 text-slate-500 text-sm">Đang tải...</div>

    <!-- ── Empty ──────────────────────────────────────────────── -->
    <div v-else-if="!filteredReports.length" class="text-center py-16 text-slate-500 text-sm">
      Không có đơn nào phù hợp.
    </div>

    <!-- ── GROUPED VIEW ───────────────────────────────────────── -->
    <div v-else-if="viewMode === 'grouped'" class="space-y-3">
      <div v-for="group in groupedByUser" :key="group.uid"
        class="bg-[#111726] border rounded-2xl overflow-hidden transition-all"
        :class="group.hasWarning ? 'border-orange-500/30' : 'border-slate-800'">

        <!-- Group header -->
        <div @click="toggleExpand(group.uid)"
          class="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left flex-wrap cursor-pointer">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-white font-black text-sm uppercase tracking-tight truncate">{{ group.fullName }}</span>
            <span class="text-slate-500 text-[11px] not-italic normal-case font-medium shrink-0">{{ group.phoneRef }}</span>
            <span class="text-slate-600 text-[10px] shrink-0">{{ group.uid.slice(0, 8) }}…</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap shrink-0">
            <span class="text-[10px] font-semibold" :class="group.pendingCount > MAX_VALID_PER_DAY ? 'text-red-400' : 'text-slate-400'">
              Chờ kiểm tra: {{ group.pendingCount }}/{{ MAX_VALID_PER_DAY }}
            </span>
            <span v-if="group.pendingCount > MAX_VALID_PER_DAY" class="text-[10px] font-black bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
              ⚠ Vượt giới hạn pending
            </span>
            <span v-if="group.pendingCount > 0" class="text-[10px] font-black bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full">
              Chờ: {{ group.pendingCount }}
            </span>
            <span v-if="group.paidCount > 0" class="text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              Trả: {{ group.paidCount }}
            </span>
            <span v-if="group.rejectedCount > 0" class="text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
              Từ chối: {{ group.rejectedCount }}
            </span>
            <span v-if="group.paidCount > 0" class="text-[10px] text-slate-500 font-semibold">
              {{ group.totalXu.toLocaleString('vi-VN') }} xu
            </span>
            <span v-if="group.hasWarning" class="text-[10px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/25 px-2 py-0.5 rounded-full">
              ⚠ Nghi vấn
            </span>
            <span class="text-slate-500 text-xs">{{ expandedUids.includes(group.uid) ? '▲' : '▼' }}</span>
          </div>
        </div>

        <!-- Group detail -->
        <div v-if="expandedUids.includes(group.uid)" class="border-t border-slate-800">

          <!-- Desktop table -->
          <div class="hidden md:block overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-slate-800">
                  <th class="px-3 py-2 text-left w-8">
                    <input type="checkbox"
                      class="w-5 h-5 rounded border-2 border-slate-400 bg-slate-900 appearance-none checked:bg-purple-600 checked:border-purple-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      :disabled="isProcessingBulk"
                      :checked="group.reports.filter(r => r.status === 'pending').length > 0 && group.reports.filter(r => r.status === 'pending').every(r => selectedDailyThreadReportIds.includes(r.id))"
                      @change="(e) => toggleGroupSelect(group.reports, (e.target as HTMLInputElement).checked)" />
                  </th>
                  <th class="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Nick Thread</th>
                  <th class="px-3 py-2 text-right text-[10px] text-slate-500 uppercase tracking-wide font-semibold">View QR</th>
                  <th class="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Link</th>
                  <th class="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Giờ gửi</th>
                  <th class="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Cảnh báo</th>
                  <th class="px-3 py-2 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Status</th>
                  <th class="px-3 py-2 text-right text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Hành động</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in group.reports" :key="r.id"
                  class="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
                  :class="r.status !== 'pending' ? 'opacity-70' : ''">
                  <td class="px-3 py-2">
                    <input v-if="r.status === 'pending'" type="checkbox"
                      class="w-5 h-5 rounded border-2 border-slate-400 bg-slate-900 appearance-none checked:bg-purple-600 checked:border-purple-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      :disabled="isProcessingBulk"
                      :checked="selectedDailyThreadReportIds.includes(r.id)" @change="toggleSelect(r.id)" />
                  </td>
                  <td class="px-3 py-2 text-purple-300 font-semibold not-italic normal-case">{{ r.threadNick }}</td>
                  <td class="px-3 py-2 text-right font-black text-white">{{ r.qrViewCount.toLocaleString('vi-VN') }}</td>
                  <td class="px-3 py-2">
                    <a :href="r.postUrl" target="_blank" rel="noopener"
                      class="text-blue-400 hover:text-blue-300 underline underline-offset-2 not-italic normal-case">Mở ↗</a>
                  </td>
                  <td class="px-3 py-2 text-slate-400 not-italic normal-case whitespace-nowrap">{{ formatTime(r.createdAt) }}</td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap gap-1">
                      <button v-for="code in getWarnings(r)" :key="code"
                        @click="openDupDetail(code.startsWith('dup_url') ? 'url' : code.startsWith('dup_nick') ? 'nick' : 'url', code.startsWith('dup_url') ? urlKey(r) : nickKey(r))"
                        class="text-[9px] font-black px-1.5 py-0.5 rounded border transition-all"
                        :class="isHeavyWarning(code)
                          ? 'bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/25'
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20'">
                        {{ WARNING_LABEL[code] }}
                      </button>
                    </div>
                  </td>
                  <td class="px-3 py-2">
                    <span class="text-[10px] font-black px-2 py-0.5 rounded-full border"
                      :class="r.status === 'paid'     ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : r.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'">
                      {{ r.status === 'paid' ? '✅ Đã trả' : r.status === 'rejected' ? '❌ Từ chối' : '⏳ Chờ' }}
                    </span>
                    <p v-if="r.status === 'rejected' && r.rejectReason" class="text-[9px] text-red-400/70 mt-0.5 not-italic normal-case">
                      {{ rejectReasonLabel(r) }}
                    </p>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <div v-if="r.status === 'pending'" class="flex gap-1 justify-end">
                      <button @click="payReport(r)" :disabled="isProcessingBulk"
                        class="px-2.5 py-1 rounded-lg text-[10px] font-black bg-purple-600/80 text-white hover:bg-purple-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                        Cộng xu
                      </button>
                      <button @click="rejectReport(r)" :disabled="isProcessingBulk"
                        class="px-2.5 py-1 rounded-lg text-[10px] font-black bg-red-600/20 text-red-400 hover:bg-red-600/30 active:scale-95 transition-all border border-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
                        Từ chối
                      </button>
                    </div>
                    <span v-else-if="r.status === 'paid'" class="text-[10px] text-slate-600">Đã trả</span>
                    <span v-else class="text-[10px] text-slate-600">Đã từ chối</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile: compact cards -->
          <div class="md:hidden divide-y divide-slate-800/60">
            <div v-for="r in group.reports" :key="r.id" class="px-4 py-3 space-y-2"
              :class="r.status !== 'pending' ? 'opacity-70' : ''">
              <div class="flex items-center gap-2">
                <input v-if="r.status === 'pending'" type="checkbox"
                  class="w-5 h-5 rounded border-2 border-slate-400 bg-slate-900 appearance-none checked:bg-purple-600 checked:border-purple-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  :disabled="isProcessingBulk"
                  :checked="selectedDailyThreadReportIds.includes(r.id)" @change="toggleSelect(r.id)" />
                <span class="text-purple-300 font-semibold text-sm not-italic normal-case flex-1 truncate">{{ r.threadNick }}</span>
                <span class="text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0"
                  :class="r.status === 'paid'     ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : r.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'">
                  {{ r.status === 'paid' ? '✅ Đã trả' : r.status === 'rejected' ? '❌ Từ chối' : '⏳ Chờ' }}
                </span>
              </div>
              <div class="flex items-center gap-3 text-xs not-italic normal-case">
                <span class="text-white font-black">{{ r.qrViewCount.toLocaleString('vi-VN') }} view</span>
                <a :href="r.postUrl" target="_blank" rel="noopener" class="text-blue-400 hover:text-blue-300 underline">Mở ↗</a>
                <span class="text-slate-500 ml-auto">{{ formatTime(r.createdAt) }}</span>
              </div>
              <p v-if="r.status === 'rejected' && r.rejectReason" class="text-[10px] text-red-400/80 not-italic normal-case">
                Từ chối: {{ rejectReasonLabel(r) }}
              </p>
              <div v-if="getWarnings(r).length > 0" class="flex flex-wrap gap-1">
                <span v-for="code in getWarnings(r)" :key="code"
                  class="text-[9px] font-black px-1.5 py-0.5 rounded border"
                  :class="isHeavyWarning(code) ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'">
                  {{ WARNING_LABEL[code] }}
                </span>
              </div>
              <div v-if="r.status === 'pending'" class="flex gap-2 justify-end">
                <button @click="rejectReport(r)" :disabled="isProcessingBulk"
                  class="px-3 py-1.5 rounded-lg text-[10px] font-black bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  Từ chối
                </button>
                <button @click="payReport(r)" :disabled="isProcessingBulk"
                  class="px-4 py-1.5 rounded-lg text-[10px] font-black bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  💰 Cộng xu
                </button>
              </div>
              <p v-if="r.note" class="text-slate-400 text-[11px] not-italic normal-case">{{ r.note }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── FLAT VIEW ──────────────────────────────────────────── -->
    <div v-else class="bg-[#111726] border border-slate-800 rounded-2xl overflow-hidden">

      <!-- Desktop table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-slate-800">
              <th class="px-3 py-2.5 w-8"></th>
              <th class="px-3 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">User</th>
              <th class="px-3 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Nick Thread</th>
              <th class="px-3 py-2.5 text-right text-[10px] text-slate-500 uppercase tracking-wide font-semibold">View QR</th>
              <th class="px-3 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Link</th>
              <th class="px-3 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Giờ gửi</th>
              <th class="px-3 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Cảnh báo</th>
              <th class="px-3 py-2.5 text-left text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Status</th>
              <th class="px-3 py-2.5 text-right text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Hành động</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredReports" :key="r.id"
              class="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
              :class="r.status !== 'pending' ? 'opacity-70' : ''">
              <td class="px-3 py-2">
                <input v-if="r.status === 'pending'" type="checkbox"
                  class="w-5 h-5 rounded border-2 border-slate-400 bg-slate-900 appearance-none checked:bg-purple-600 checked:border-purple-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  :disabled="isProcessingBulk"
                  :checked="selectedDailyThreadReportIds.includes(r.id)" @change="toggleSelect(r.id)" />
              </td>
              <td class="px-3 py-2">
                <p class="text-white font-semibold uppercase text-[11px] leading-tight">{{ r.fullName }}</p>
                <p class="text-slate-500 text-[10px] not-italic normal-case">{{ r.phoneRef }}</p>
              </td>
              <td class="px-3 py-2 text-purple-300 font-semibold not-italic normal-case">{{ r.threadNick }}</td>
              <td class="px-3 py-2 text-right font-black text-white">{{ r.qrViewCount.toLocaleString('vi-VN') }}</td>
              <td class="px-3 py-2">
                <a :href="r.postUrl" target="_blank" rel="noopener"
                  class="text-blue-400 hover:text-blue-300 underline underline-offset-2 not-italic normal-case">Mở ↗</a>
              </td>
              <td class="px-3 py-2 text-slate-400 not-italic normal-case whitespace-nowrap">{{ formatTime(r.createdAt) }}</td>
              <td class="px-3 py-2">
                <div class="flex flex-wrap gap-1">
                  <button v-for="code in getWarnings(r)" :key="code"
                    @click="openDupDetail(code.startsWith('dup_url') ? 'url' : code.startsWith('dup_nick') ? 'nick' : 'url', code.startsWith('dup_url') ? urlKey(r) : nickKey(r))"
                    class="text-[9px] font-black px-1.5 py-0.5 rounded border transition-all"
                    :class="isHeavyWarning(code)
                      ? 'bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/25'
                      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20'">
                    {{ WARNING_LABEL[code] }}
                  </button>
                </div>
              </td>
              <td class="px-3 py-2">
                <span class="text-[10px] font-black px-2 py-0.5 rounded-full border"
                  :class="r.status === 'paid'     ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : r.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'">
                  {{ r.status === 'paid' ? '✅ Đã trả' : r.status === 'rejected' ? '❌ Từ chối' : '⏳ Chờ' }}
                </span>
                <p v-if="r.status === 'rejected' && r.rejectReason" class="text-[9px] text-red-400/70 mt-0.5 not-italic normal-case">
                  {{ rejectReasonLabel(r) }}
                </p>
              </td>
              <td class="px-3 py-2 text-right">
                <div v-if="r.status === 'pending'" class="flex gap-1 justify-end">
                  <button @click="payReport(r)" :disabled="isProcessingBulk"
                    class="px-2.5 py-1 rounded-lg text-[10px] font-black bg-purple-600/80 text-white hover:bg-purple-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    Cộng xu
                  </button>
                  <button @click="rejectReport(r)" :disabled="isProcessingBulk"
                    class="px-2.5 py-1 rounded-lg text-[10px] font-black bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    Từ chối
                  </button>
                </div>
                <span v-else-if="r.status === 'paid'" class="text-[10px] text-slate-600">Đã trả</span>
                <span v-else class="text-[10px] text-slate-600">Đã từ chối</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="md:hidden divide-y divide-slate-800/60">
        <div v-for="r in filteredReports" :key="r.id" class="px-4 py-3 space-y-2"
          :class="r.status !== 'pending' ? 'opacity-70' : ''">
          <div class="flex items-start gap-2">
            <input v-if="r.status === 'pending'" type="checkbox"
              class="w-5 h-5 rounded border-2 border-slate-400 bg-slate-900 appearance-none checked:bg-purple-600 checked:border-purple-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-0.5 shrink-0"
              :disabled="isProcessingBulk"
              :checked="selectedDailyThreadReportIds.includes(r.id)" @change="toggleSelect(r.id)" />
            <div class="flex-1 min-w-0">
              <p class="text-white font-black text-sm uppercase tracking-tight truncate">{{ r.fullName }}</p>
              <p class="text-slate-400 text-[11px] not-italic normal-case">{{ r.phoneRef }}</p>
            </div>
            <span class="text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0"
              :class="r.status === 'paid'     ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : r.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'">
              {{ r.status === 'paid' ? '✅ Đã trả' : r.status === 'rejected' ? '❌ Từ chối' : '⏳ Chờ' }}
            </span>
          </div>
          <div class="flex items-center gap-3 text-xs not-italic normal-case">
            <span class="text-purple-300 font-semibold truncate">{{ r.threadNick }}</span>
            <span class="text-white font-black shrink-0">{{ r.qrViewCount.toLocaleString('vi-VN') }}v</span>
            <a :href="r.postUrl" target="_blank" rel="noopener" class="text-blue-400 hover:text-blue-300 underline shrink-0">Mở ↗</a>
            <span class="text-slate-500 ml-auto shrink-0">{{ formatTime(r.createdAt) }}</span>
          </div>
          <p v-if="r.status === 'rejected' && r.rejectReason" class="text-[10px] text-red-400/80 not-italic normal-case">
            Từ chối: {{ rejectReasonLabel(r) }}
          </p>
          <div v-if="getWarnings(r).length > 0" class="flex flex-wrap gap-1">
            <span v-for="code in getWarnings(r)" :key="code"
              class="text-[9px] font-black px-1.5 py-0.5 rounded border"
              :class="isHeavyWarning(code) ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'">
              {{ WARNING_LABEL[code] }}
            </span>
          </div>
          <div v-if="r.status === 'pending'" class="flex gap-2 justify-end">
            <button @click="rejectReport(r)" :disabled="isProcessingBulk"
              class="px-3 py-1.5 rounded-lg text-[10px] font-black bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              Từ chối
            </button>
            <button @click="payReport(r)" :disabled="isProcessingBulk"
              class="px-4 py-1.5 rounded-lg text-[10px] font-black bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              💰 Cộng xu
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Dup detail panel ───────────────────────────────────── -->
    <div v-if="activeDupDetail" class="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4 space-y-2">
      <p class="text-[10px] text-orange-400 uppercase tracking-widest font-black">
        {{ activeDupDetail.type === 'url' ? '🔗 Các đơn cùng link bài viết' : '👤 Các đơn cùng nick Thread' }}
      </p>
      <div class="space-y-1.5">
        <div v-for="r in (activeDupDetail.type === 'url' ? urlMap[activeDupDetail.key] : nickMap[activeDupDetail.key]) || []"
          :key="r.id" class="flex items-center gap-3 text-xs not-italic normal-case">
          <span class="text-white font-semibold uppercase w-32 truncate shrink-0">{{ r.fullName }}</span>
          <span class="text-slate-500 shrink-0">{{ r.uid.slice(0, 8) }}…</span>
          <span class="text-purple-300 shrink-0">{{ r.threadNick }}</span>
          <span class="text-slate-500 shrink-0">{{ formatTime(r.createdAt) }}</span>
          <span class="text-[10px] font-black px-2 py-0.5 rounded-full border ml-auto shrink-0"
            :class="r.status === 'paid'     ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : r.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'">
            {{ r.status === 'paid' ? '✅ Đã trả' : r.status === 'rejected' ? '❌ Từ chối' : '⏳ Chờ' }}
          </span>
        </div>
      </div>
      <button @click="activeDupDetail = null" class="text-[10px] text-slate-500 hover:text-slate-400 mt-1">Đóng ✕</button>
    </div>

    <!-- ── Load more (dự phòng) ───────────────────────────────── -->
    <div v-if="hasMore && !isScanAllDone" class="text-center">
      <button @click="loadMore" :disabled="isLoadingMore"
        class="px-6 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
        :class="isLoadingMore ? 'opacity-50 cursor-not-allowed' : ''">
        {{ isLoadingMore ? 'Đang tải...' : `Tải thêm (${reports.length} đơn)` }}
      </button>
    </div>

  </div>
</template>
