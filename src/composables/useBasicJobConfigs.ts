import { ref } from 'vue'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase'

export const basicJobConfigs = ref<Record<string, any>>({})
export const basicJobConfigsLoaded = ref(false)
let _unsub: (() => void) | null = null

export function startBasicJobConfigsListener() {
  if (_unsub) return
  _unsub = onSnapshot(collection(db, 'basic_job_configs'), (snap) => {
    const data: Record<string, any> = {}
    snap.forEach(d => { data[d.id] = d.data() })
    basicJobConfigs.value = data
    basicJobConfigsLoaded.value = true
  })
}
