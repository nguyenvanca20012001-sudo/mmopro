import { ref } from 'vue'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/firebase'

export interface UserProfile {
  fullName: string
  phone: string
  dob: string
}

export const currentUserProfile = ref<UserProfile | null>(null)

let _fetchPromise: Promise<void> | null = null

export function setCurrentUserProfile(data: Record<string, any>) {
  currentUserProfile.value = {
    fullName: data.fullName || '',
    phone: data.phone || '',
    dob: data.dob || '',
  }
}

// Single getDoc call — no-op if profile already loaded or fetch in progress
export async function fetchUserProfileOnce(uid: string): Promise<void> {
  if (currentUserProfile.value !== null) return
  if (_fetchPromise) return _fetchPromise
  _fetchPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'users', uid))
      if (snap.exists()) {
        setCurrentUserProfile(snap.data())
      } else {
        currentUserProfile.value = { fullName: '', phone: '', dob: '' }
      }
    } catch {
      currentUserProfile.value = { fullName: '', phone: '', dob: '' }
    }
  })()
  return _fetchPromise
}

export function clearCurrentUserProfile() {
  currentUserProfile.value = null
  _fetchPromise = null
}
