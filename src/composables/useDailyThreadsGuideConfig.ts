import { ref } from 'vue'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'

const CONFIG_COL = 'app_config'
const CONFIG_DOC = 'daily_threads_guide'

export interface DailyThreadsGuideConfig {
  contents: string[]
  postImages: string[]
  qrImage: string
}

const DEFAULT_CONTENTS: string[] = [
  "Góc khuất học sinh THPT, thức đêm đăng bài thread , đánh giá google map , seeding =))) ít nhưng vẫn cố a",
  "dm đời cuối cùng t cũng kiếm đc job online nghỉ hè rồi , chi tiết phần bình luận",
  "flex ngày hôm nay  : nhận lương từ đăng bài thread , đánh giá google Map , seeding",
  "cần 10 bạn seeding , đăng bài thread , seeding , nếu sợ đảo lửa sẽ bank trước lương",
  "hôm nay rảnh đăng bài thread kiếm thêm vài chục k , ai cần việc bình luận hỏi thêm",
  "nghỉ hè mà ngồi nhà đăng thread làm google map cũng ra tiền , không phải scam nha mn",
  "t vừa rút 200k từ job đăng bài thread + map , ai muốn làm cùng nhắn t",
  "không cần vốn không cần kinh nghiệm , chỉ cần điện thoại là làm được , thread + map + seeding",
  "job sinh viên mùa hè : đăng bài thread , seeding fb , review map , nhận tiền momo hằng ngày",
  "thức đêm làm thêm job online , thread + google map + seeding , mệt mà vui vì có tiền",
]

const DEFAULT_POST_IMAGES: string[] = [
  '/images/thread-post-1.jpg',
  '/images/thread-post-2.jpg',
  '/images/thread-post-3.jpg',
  '/images/thread-post-4.jpg',
  '/images/thread-post-5.jpg',
  '/images/thread-post-6.jpg',
  '/images/thread-post-7.jpg',
  '/images/thread-post-8.jpg',
  '/images/thread-post-9.jpg',
  '/images/thread-post-10.jpg',
]

const DEFAULT_QR_IMAGE = '/images/qr-zalo-nhom17.jpg'

export const DEFAULT_DAILY_THREADS_GUIDE_CONFIG: DailyThreadsGuideConfig = {
  contents: DEFAULT_CONTENTS,
  postImages: DEFAULT_POST_IMAGES,
  qrImage: DEFAULT_QR_IMAGE,
}

// Module-scope — một instance duy nhất cho toàn browser tab
export const dailyThreadsGuideConfig = ref<DailyThreadsGuideConfig>({ ...DEFAULT_DAILY_THREADS_GUIDE_CONFIG })

let _unsub: (() => void) | null = null

/**
 * Khởi động onSnapshot cho document app_config/daily_threads_guide.
 * Idempotent — gọi nhiều lần chỉ tạo 1 listener duy nhất.
 * Nếu document chưa tồn tại → giữ DEFAULT config, web vẫn chạy bình thường.
 */
export function startDailyThreadsGuideListener() {
  if (_unsub) return
  _unsub = onSnapshot(
    doc(db, CONFIG_COL, CONFIG_DOC),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        const contents = (Array.isArray(d.contents) ? d.contents : []).filter((c: any) => String(c || '').trim())
        const postImages = (Array.isArray(d.postImages) ? d.postImages : []).filter((c: any) => String(c || '').trim())
        dailyThreadsGuideConfig.value = {
          contents: contents.length ? contents : DEFAULT_CONTENTS,
          postImages: postImages.length ? postImages : DEFAULT_POST_IMAGES,
          qrImage: String(d.qrImage || '').trim() || DEFAULT_QR_IMAGE,
        }
      }
      // Nếu document không tồn tại → giữ nguyên DEFAULT config
    },
    (err) => { console.error('[useDailyThreadsGuideConfig]', err) }
  )
}

export function stopDailyThreadsGuideListener() {
  if (_unsub) { _unsub(); _unsub = null }
}

/**
 * Ghi một phần hoặc toàn bộ config lên Firestore (merge: true).
 * Tự tạo document nếu chưa tồn tại.
 */
export async function updateDailyThreadsGuideConfig(data: Partial<DailyThreadsGuideConfig>) {
  await setDoc(
    doc(db, CONFIG_COL, CONFIG_DOC),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  )
}

/** Random 1 phần tử không rỗng trong danh sách. Trả về '' nếu không có phần tử hợp lệ. */
export function pickRandomNonEmpty(items: string[]): string {
  const validItems = items.filter(item => String(item || '').trim())
  if (!validItems.length) return ''
  return validItems[Math.floor(Math.random() * validItems.length)] ?? ''
}
