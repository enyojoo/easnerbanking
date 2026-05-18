import { hide, onHide, show } from "@intercom/messenger-js-sdk"

const SUPPORT_MAILTO = "mailto:support@easner.com"

let hideListenerRegistered = false
let intercomReady = false
let readyWaiters: Array<() => void> = []

export function isIntercomAppConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_INTERCOM_APP_ID?.trim() ||
      process.env.NEXT_PUBLIC_INTERCOM_APPID?.trim(),
  )
}

export function markIntercomMessengerReady(): void {
  intercomReady = true
  for (const resolve of readyWaiters) resolve()
  readyWaiters = []
}

export function markIntercomMessengerShutdown(): void {
  intercomReady = false
}

function whenIntercomReady(timeoutMs = 8_000): Promise<boolean> {
  if (intercomReady) return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = () => resolve(intercomReady)
    readyWaiters.push(done)
    window.setTimeout(() => {
      readyWaiters = readyWaiters.filter((fn) => fn !== done)
      resolve(intercomReady)
    }, timeoutMs)
  })
}

/** Keep messenger closed after the user dismisses it; launcher stays hidden via boot settings. */
export function registerIntercomHideOnClose(): void {
  if (hideListenerRegistered || typeof window === "undefined") return
  hideListenerRegistered = true
  onHide(() => {
    hide()
  })
}

export function resetIntercomHideOnCloseRegistration(): void {
  hideListenerRegistered = false
}

export async function openBusinessIntercomMessenger(): Promise<boolean> {
  if (!isIntercomAppConfigured()) return false
  const ready = await whenIntercomReady()
  if (!ready) return false
  show()
  return true
}

export async function openBusinessSupport(): Promise<void> {
  const opened = await openBusinessIntercomMessenger()
  if (!opened) {
    window.location.href = SUPPORT_MAILTO
  }
}
