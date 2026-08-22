import { EXPRESS_NATIVE_AUTH_REQUIRED, type ExpressOnrampSdk } from './express-onramp-types'
import { EXPRESS_DEPOSITS_COPY } from '@easner/shared'

export { EXPRESS_NATIVE_AUTH_REQUIRED }
export type { ExpressOnrampSdk }

const CHANNEL = 'easner-express'
const FRAME_ID = 'easner-express-onramp-frame'

let cached: ExpressOnrampSdk | null = null
let inflight: Promise<ExpressOnrampSdk> | null = null
let callSeq = 0
let frameReady = false
let listening = false
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const callbacks = new Map<string, (payload: never) => void>()
let secretProvider: ((sessionId: string) => Promise<string>) | null = null

function frameUrl(): string {
  const origin = window.location.origin
  return `${origin}/express-onramp-frame.html?origin=${encodeURIComponent(origin)}`
}

function styleFrame(frame: HTMLIFrameElement, open: boolean) {
  frame.style.cssText = open
    ? 'position:fixed;inset:0;z-index:2147483000;width:100%;height:100%;border:0;background:#fff'
    : 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;border:0'
}

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('message', onMessage)
}

function ensureFrame(): HTMLIFrameElement {
  listen()
  let frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null
  if (frame) return frame
  frameReady = false
  frame = document.createElement('iframe')
  frame.id = FRAME_ID
  frame.title = 'Easner'
  frame.setAttribute('allow', 'payment; camera; microphone; clipboard-write')
  styleFrame(frame, false)
  document.body.appendChild(frame)
  frame.src = frameUrl()
  return frame
}

function onMessage(event: MessageEvent) {
  const frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null
  if (!frame || event.source !== frame.contentWindow) return
  const data = event.data as {
    channel?: string
    type?: string
    id?: string
    method?: string
    payload?: unknown
    message?: string
    sessionId?: string
    value?: unknown
  }
  if (!data || data.channel !== CHANNEL) return
  if (data.type === 'ready') {
    frameReady = true
    return
  }
  if (data.type === 'ui') {
    styleFrame(frame, Boolean((data as { open?: boolean }).open))
    return
  }
  if (data.type === 'cb' && data.method) {
    const cb = callbacks.get(data.method)
    cb?.(data.payload as never)
    return
  }
  if (data.type === 'secret' && data.id && data.sessionId) {
    void (async () => {
      try {
        if (!secretProvider) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
        const value = await secretProvider(data.sessionId as string)
        frame.contentWindow?.postMessage({ channel: CHANNEL, type: 'secret', id: data.id, value }, window.location.origin)
      } catch (e) {
        frame.contentWindow?.postMessage(
          {
            channel: CHANNEL,
            type: 'secret',
            id: data.id,
            error: e instanceof Error ? e.message : EXPRESS_DEPOSITS_COPY.somethingWentWrong,
          },
          window.location.origin,
        )
      }
    })()
    return
  }
  if (data.type === 'ok' && data.id) {
    pending.get(data.id)?.resolve(data.value)
    pending.delete(data.id)
    return
  }
  if (data.type === 'err' && data.id) {
    pending.get(data.id)?.reject(new Error(data.message || EXPRESS_DEPOSITS_COPY.somethingWentWrong))
    pending.delete(data.id)
  }
}

function waitForReady(frame: HTMLIFrameElement): Promise<void> {
  if (frameReady) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.clearInterval(ping)
      reject(new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong))
    }, 20000)
    const ping = window.setInterval(() => {
      if (frameReady) {
        window.clearTimeout(timer)
        window.clearInterval(ping)
        resolve()
        return
      }
      frame.contentWindow?.postMessage({ channel: CHANNEL, type: 'ping' }, window.location.origin)
    }, 100)
  })
}

function showFrame() {
  styleFrame(ensureFrame(), true)
}

function rpc(method: string, args: unknown[] = [], opts?: { show?: boolean }): Promise<unknown> {
  const frame = ensureFrame()
  if (opts?.show) styleFrame(frame, true)
  const id = `${++callSeq}`
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    frame.contentWindow?.postMessage({ channel: CHANNEL, type: 'call', id, method, args }, window.location.origin)
  })
}

function createProxy(): ExpressOnrampSdk {
  return {
    registerLinkUser: (email, phone, country, fullName) => rpc('registerLinkUser', [email, phone, country, fullName]),
    authenticate: async (id, cb) => {
      callbacks.set('authenticate', cb)
      showFrame()
      await rpc('authenticate', [id], { show: true })
    },
    submitKycInfo: (info) => rpc('submitKycInfo', [info]),
    getMissingIdentifiers: () => rpc('getMissingIdentifiers') as Promise<{ identifiers?: Array<{ type?: string }> }>,
    updateKycInfo: (info) => rpc('updateKycInfo', [info]) as Promise<{ completed?: boolean }>,
    promptUserAttestation: async (cb) => {
      callbacks.set('promptUserAttestation', cb)
      showFrame()
      await rpc('promptUserAttestation', [], { show: true })
    },
    verifyDocuments: async (cb) => {
      if (cb) callbacks.set('verifyDocuments', cb)
      showFrame()
      await rpc('verifyDocuments', [], { show: true })
    },
    verifyIdentity: async (cb) => {
      if (cb) callbacks.set('verifyIdentity', cb)
      showFrame()
      await rpc('verifyIdentity', [], { show: true })
    },
    collectPaymentMethod: async (opts, cb) => {
      callbacks.set('collectPaymentMethod', cb)
      showFrame()
      await rpc('collectPaymentMethod', [opts], { show: true })
    },
    performCheckout: async (sessionId, provideSecret) => {
      secretProvider = provideSecret
      const result = (await rpc('performCheckout', [sessionId])) as { success?: boolean } | null
      return result || { success: true }
    },
  }
}

export function prefetchMobileExpressOnramp(): void {
  if (typeof document === 'undefined') return
  ensureFrame()
}

export async function loadMobileExpressOnramp(publishableKey: string): Promise<ExpressOnrampSdk> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    const frame = ensureFrame()
    await waitForReady(frame)
    await rpc('init', [publishableKey, { theme: 'stripe' }])
    cached = createProxy()
    return cached
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}
