import { ref } from 'vue'
// @ts-ignore
import { auth, db } from '@/firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'

export const REJECT_REASON: Record<string, string> = {
  link_sai:      'Link sai',
  khong_thay_qr: 'Không thấy QR',
  view_thap:     'View không đạt',
  trung_bai:     'Trùng bài',
  sai_nick:      'Sai nick Thread',
  khac:          'Khác',
}

export type DailyThreadNotifReport = {
  id: string
  threadNick: string
  postUrl: string
  qrViewCount: number
  reward: number
  status: 'paid' | 'rejected'
  paidAt?: any
  rejectedAt?: any
  rejectReason?: string
  rejectNote?: string
}

function paidKey(id: string)     { return `daily_thread_seen_paid_${id}` }
function rejectedKey(id: string) { return `daily_thread_seen_rejected_${id}` }

// Singleton module-level state — shared across all callers
const paidQueue       = ref<DailyThreadNotifReport[]>([])
const rejectedQueue   = ref<DailyThreadNotifReport[]>([])
const currentPaid     = ref<DailyThreadNotifReport | null>(null)
const currentRejected = ref<DailyThreadNotifReport | null>(null)

let _unsubscribe: (() => void) | null = null

function advanceRejected() {
  currentRejected.value = rejectedQueue.value.shift() ?? null
}

function advancePaid() {
  const next = paidQueue.value.shift()
  if (next) {
    currentPaid.value = next
  } else {
    currentPaid.value = null
    advanceRejected()
  }
}

export function dismissPaid(id: string) {
  localStorage.setItem(paidKey(id), '1')
  advancePaid()
}

export function dismissRejected(id: string) {
  localStorage.setItem(rejectedKey(id), '1')
  advanceRejected()
}

/**
 * Bắt đầu nghe real-time thay đổi trạng thái đơn Thread hằng ngày.
 * Gọi sau khi user đăng nhập. Thay thế getDocs/setTimeout cũ.
 */
export function startDailyThreadListener(uid: string) {
  // Hủy listener cũ trước (nếu có)
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null }

  const q = query(
    collection(db, 'daily_thread_reports'),
    where('uid', '==', uid)
  )

  _unsubscribe = onSnapshot(q, (snap) => {
    console.log('[DailyThread] snapshot docs:', snap.size)

    const newPaid: DailyThreadNotifReport[] = []
    const newRejected: DailyThreadNotifReport[] = []

    for (const d of snap.docs) {
      const data = d.data()
      console.log('[DailyThread] doc', d.id, 'status:', data.status,
        '| paidSeen:', localStorage.getItem(paidKey(d.id)),
        '| rejectedSeen:', localStorage.getItem(rejectedKey(d.id)))

      if (data.status === 'paid' && !localStorage.getItem(paidKey(d.id))) {
        // Không thêm vào queue nếu đã đang hiện hoặc đã có trong queue
        const alreadyTracked =
          currentPaid.value?.id === d.id ||
          paidQueue.value.some(r => r.id === d.id)
        if (!alreadyTracked) {
          newPaid.push({
            id: d.id,
            threadNick: data.threadNick || '',
            postUrl: data.postUrl || '',
            qrViewCount: Number(data.qrViewCount) || 0,
            reward: Number(data.reward) || 0,
            status: 'paid',
            paidAt: data.paidAt,
          })
        }
      } else if (data.status === 'rejected' && !localStorage.getItem(rejectedKey(d.id))) {
        const alreadyTracked =
          currentRejected.value?.id === d.id ||
          rejectedQueue.value.some(r => r.id === d.id)
        if (!alreadyTracked) {
          newRejected.push({
            id: d.id,
            threadNick: data.threadNick || '',
            postUrl: data.postUrl || '',
            qrViewCount: Number(data.qrViewCount) || 0,
            reward: 0,
            status: 'rejected',
            rejectedAt: data.rejectedAt,
            rejectReason: data.rejectReason,
            rejectNote: data.rejectNote,
          })
        }
      }
    }

    // Sắp xếp theo thời gian tăng dần (cũ trước)
    const millis = (r: DailyThreadNotifReport) =>
      (r.paidAt ?? r.rejectedAt)?.toMillis?.() ?? 0
    newPaid.sort((a, b) => millis(a) - millis(b))
    newRejected.sort((a, b) => millis(a) - millis(b))

    console.log('[DailyThread] new paid to queue:', newPaid.length, '| new rejected to queue:', newRejected.length)

    // Thêm vào queue và kích hoạt hiện popup nếu chưa có gì đang hiện
    if (newPaid.length > 0) {
      paidQueue.value.push(...newPaid)
      if (!currentPaid.value) advancePaid()
    }
    if (newRejected.length > 0) {
      rejectedQueue.value.push(...newRejected)
      if (!currentPaid.value && !currentRejected.value) advanceRejected()
    }
  }, (err) => {
    console.error('[DailyThread] onSnapshot error:', err)
  })
}

/**
 * Hủy listener và reset toàn bộ state (gọi khi logout).
 */
export function stopDailyThreadListener() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null }
  paidQueue.value     = []
  rejectedQueue.value = []
  currentPaid.value     = null
  currentRejected.value = null
}

// Backward-compat: giữ lại để không vỡ import cũ nếu còn file nào dùng
export function checkDailyThreadNotifications() {}

export function useDailyThreadNotifications() {
  return { currentPaid, currentRejected, dismissPaid, dismissRejected }
}
