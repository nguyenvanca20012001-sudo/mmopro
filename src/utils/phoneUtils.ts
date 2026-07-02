export function normalizePhone(phone: unknown): string {
  return String(phone || "")
    .replace(/\s+/g, "")
    .replace(/[^\d]/g, "")
    .trim()
}
