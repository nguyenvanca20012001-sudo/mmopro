import { ref } from 'vue'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'

export const SUPPORT_FANPAGE_URL = 'https://www.facebook.com/mmoprovn'

const SUPPORT_COL = 'support_config'
const SUPPORT_DOC = 'overall'

export interface SupportConfig {
  enabled: boolean
  autoPopupEnabled: boolean
  announcementVersion: number
  title: string
  message: string
}

const DEFAULT_CONFIG: SupportConfig = {
  enabled: true,
  autoPopupEnabled: false,
  announcementVersion: 1,
  title: 'Trung tâm hỗ trợ',
  message: 'Cần hỗ trợ? Vui lòng nhắn tin Fanpage để được xử lý.',
}

// Module-scope — một instance duy nhất cho toàn browser tab
export const supportConfig = ref<SupportConfig>({ ...DEFAULT_CONFIG })

let _unsub: (() => void) | null = null

/**
 * Khởi động onSnapshot cho document support_config/overall.
 * Idempotent — gọi nhiều lần chỉ tạo 1 listener duy nhất.
 * Nếu document chưa tồn tại → giữ DEFAULT_CONFIG, web vẫn chạy bình thường.
 */
export function startSupportConfigListener() {
  if (_unsub) return
  _unsub = onSnapshot(
    doc(db, SUPPORT_COL, SUPPORT_DOC),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        supportConfig.value = {
          enabled: Boolean(d.enabled ?? DEFAULT_CONFIG.enabled),
          autoPopupEnabled: Boolean(d.autoPopupEnabled ?? false),
          announcementVersion: Number(d.announcementVersion) || 1,
          title: String(d.title || DEFAULT_CONFIG.title),
          message: String(d.message || DEFAULT_CONFIG.message),
        }
      }
      // Nếu document không tồn tại → giữ nguyên DEFAULT_CONFIG
    },
    (err) => { console.error('[useSupportConfig]', err) }
  )
}

export function stopSupportConfigListener() {
  if (_unsub) { _unsub(); _unsub = null }
}

/**
 * Ghi một phần hoặc toàn bộ config lên Firestore (merge: true).
 * Tự tạo document nếu chưa tồn tại.
 */
export async function updateSupportConfig(data: Partial<SupportConfig>) {
  await setDoc(
    doc(db, SUPPORT_COL, SUPPORT_DOC),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  )
}
