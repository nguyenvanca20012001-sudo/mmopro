import { ref, computed } from 'vue'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase'
import { jobsData } from '@/data/jobs'

// Canonical VIP job IDs — single source of truth cho toàn app
export const VIP_JOB_IDS = ['liobank', 'app-chung-khoan', 'app-chung-khoan-2', 'app-chung-khoan-3', 'app-chung-khoan-4', 'msb-bank', 'vpbank', 'mbbank', 'lpbank-plus', 'referral-hub']

export type ProofJob = { id: string; title: string; reward: string }

// Module-scope — một instance duy nhất cho toàn app
export const vipJobConfigs = ref<Record<string, any>>({})
export const vipJobsLoading = ref(true)
export const vipJobsLoaded = ref(false)
let _unsub: (() => void) | null = null

// Danh sách job cho dropdown Nộp bằng chứng — reactive theo Firestore
// Trả về rỗng cho VIP phần cho tới khi Firestore snapshot đầu tiên hoàn tất
export const proofSelectableJobs = computed<ProofJob[]>(() => {
  const items: ProofJob[] = []

  // Regular jobs — always open, from jobs.ts
  // daily_threads có form nộp bằng chứng riêng (DailyThreadProofModal → daily_thread_reports), không qua dropdown này
  // noProofSubmit: job không có form nộp bằng chứng trên web (VD: zalo-kokomi — gửi bằng chứng qua Fanpage)
  for (const id of Object.keys(jobsData)) {
    if (VIP_JOB_IDS.includes(id) || id === 'daily_threads') continue
    const j = jobsData[id] as any
    if (j.noProofSubmit) continue
    items.push({ id, title: j.title as string, reward: j.reward as string })
  }

  // VIP jobs — chỉ sau khi Firestore đã load xong, merged config+jobs.ts, chỉ open
  if (!vipJobsLoaded.value) return items

  const vipItems = VIP_JOB_IDS
    .map(id => {
      const config = vipJobConfigs.value[id] || {}
      const staticJob = (jobsData[id] || {}) as any
      return {
        id,
        title: (config.title || staticJob.title || id) as string,
        reward: (config.reward || staticJob.reward || '') as string,
        status: (config.status as string) ?? 'open',
        order: (config.order as number) ?? 999,
      }
    })
    .filter(j => j.status === 'open' && j.id !== 'referral-hub')
    .sort((a, b) => a.order - b.order)

  for (const j of vipItems) items.push({ id: j.id, title: j.title, reward: j.reward })
  return items
})

export function useVipJobs() {
  return { vipJobConfigs, vipJobsLoading, vipJobsLoaded }
}

// referral-hub luôn hiển thị đầu danh sách VIP, bất kể order admin cấu hình trong Firestore
export function getVipJobOrder(id: string, config: any): number {
  if (id === 'referral-hub') return -1
  return config?.order ?? 999
}

// Trả về chuỗi hiển thị reward ngoài card VIP. Ưu tiên rewardText (đã có sẵn text/đơn vị,
// không strip số) — nếu không có thì strip reward về số thuần như cách hiển thị cũ.
export function getVipJobRewardLabel(job: { id: string; reward?: any; rewardText?: string }): string {
  if (job.rewardText) return job.rewardText
  return String(job.reward ?? '').replace(/\D/g, '')
}

export function getJobStatus(jobId: string): 'open' | 'paused' | 'hidden' | 'soldout' {
  return (vipJobConfigs.value[jobId]?.status as 'open' | 'paused' | 'hidden' | 'soldout') ?? 'open'
}
export const isJobOpen    = (jobId: string) => getJobStatus(jobId) === 'open'
export const isJobPaused  = (jobId: string) => getJobStatus(jobId) === 'paused'
export const isJobHidden  = (jobId: string) => getJobStatus(jobId) === 'hidden'
export const isJobSoldout = (jobId: string) => getJobStatus(jobId) === 'soldout'
export const canOpenJob     = (jobId: string) => getJobStatus(jobId) === 'open'
export const canSubmitProof = (jobId: string) => getJobStatus(jobId) === 'open'

/**
 * Khởi động onSnapshot cho collection vip_jobs.
 * Nếu listener đã chạy (_unsub != null) thì return ngay — không tạo listener thứ 2.
 * Gọi từ nhiều component cũng an toàn (idempotent).
 */
export function startVipJobsListener() {
  if (_unsub) return
  _unsub = onSnapshot(collection(db, 'vip_jobs'), (snap) => {
    const configs: Record<string, any> = {}
    snap.forEach(d => { configs[d.id] = d.data() })
    vipJobConfigs.value = configs
    vipJobsLoading.value = false
    vipJobsLoaded.value = true
  })
}

// Dev-only test hook — cho phép Playwright inject mock data trực tiếp vào module-level ref
if (import.meta.env.DEV) {
  ;(window as any).__setVipJobConfigs__ = (d: Record<string, any>) => {
    vipJobConfigs.value = d
    vipJobsLoading.value = false
    vipJobsLoaded.value = true
  }
}
