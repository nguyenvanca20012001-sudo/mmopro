import { onMounted, onUnmounted } from 'vue'

export function useThreadModalLock() {
  onMounted(() => {
    document.body.classList.add('thread-modal-open')
  })
  onUnmounted(() => {
    document.body.classList.remove('thread-modal-open')
  })
}
