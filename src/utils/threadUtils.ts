export function normalizeThreadUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  try {
    const u = new URL(trimmed)
    const hostname = u.hostname.replace(/^www\./, '').toLowerCase()
    const pathname = u.pathname.replace(/\/$/, '')
    return hostname + pathname
  } catch {
    return trimmed.toLowerCase()
  }
}

export function getDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function calcReward(views: number): number {
  if (views > 5000)  return 100000
  if (views >= 5000) return 80000
  if (views >= 2000) return 35000
  if (views >= 1000) return 20000
  return 0
}
