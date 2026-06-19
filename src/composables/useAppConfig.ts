import { ref } from 'vue'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'

export const APP_CONFIG_COLLECTION = 'app_config'
export const APP_CONFIG_DOC_ID = 'overall'

export interface AppConfig {
  forceRefreshEnabled: boolean
  appVersion: number
  refreshMessage: string
}

const DEFAULT_CONFIG: AppConfig = {
  forceRefreshEnabled: false,
  appVersion: 1,
  refreshMessage: 'Có bản cập nhật mới. Vui lòng tải lại trang.',
}

// Module-scope — một instance duy nhất cho toàn browser tab
export const appConfig = ref<AppConfig>({ ...DEFAULT_CONFIG })

let _unsub: (() => void) | null = null

export function useAppConfig() {
  return { appConfig, startAppConfigListener, stopAppConfigListener, updateAppConfig }
}

/**
 * Khởi động onSnapshot cho document app_config/overall.
 * Idempotent — gọi nhiều lần chỉ tạo 1 listener duy nhất.
 * Nếu document chưa tồn tại → giữ DEFAULT_CONFIG, web vẫn chạy bình thường.
 */
export function startAppConfigListener() {
  if (_unsub) return
  _unsub = onSnapshot(doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID), (snap) => {
    if (snap.exists()) {
      const data = snap.data()
      appConfig.value = {
        ...DEFAULT_CONFIG,
        appVersion: Number(data.appVersion) || 1,
        forceRefreshEnabled: Boolean(data.forceRefreshEnabled),
        refreshMessage: String(data.refreshMessage || DEFAULT_CONFIG.refreshMessage),
      }
    }
    // Nếu document không tồn tại → giữ nguyên DEFAULT_CONFIG
  })
}

export function stopAppConfigListener() {
  if (_unsub) { _unsub(); _unsub = null }
}

/**
 * Ghi một phần hoặc toàn bộ config lên Firestore (merge: true).
 * Tự tạo document nếu chưa tồn tại.
 */
export async function updateAppConfig(data: Partial<AppConfig>) {
  await setDoc(doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID), { ...data, updatedAt: serverTimestamp() }, { merge: true })
}

// Dev-only test hook
if (import.meta.env.DEV) {
  ;(window as any).__setAppConfig__ = (d: Partial<AppConfig>) => { appConfig.value = { ...DEFAULT_CONFIG, ...d } }
}
