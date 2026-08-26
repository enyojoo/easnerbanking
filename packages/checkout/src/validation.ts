export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function isPublishableKey(value: string): boolean {
  return /^easner_pk_(test|live)_[0-9a-f]+$/i.test(value.trim())
}

export function resolveElement(target: string | Element | null | undefined): Element | null {
  if (!target) return null
  if (typeof target === "string") return document.querySelector(target)
  return target
}
