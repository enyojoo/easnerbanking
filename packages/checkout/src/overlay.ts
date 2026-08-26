import type { EasnerCheckoutOverlayOptions, MountedCheckout } from "./types"
import { mountInline } from "./inline"

const STYLE_ID = "easner-checkout-overlay-style"

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    .easner-checkout-overlay {
      position: fixed; inset: 0; z-index: 2147483000;
      background: rgba(18, 21, 24, 0.48);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
    }
    .easner-checkout-overlay__panel {
      width: min(440px, 100%);
      max-height: min(90vh, 760px);
      overflow: auto;
      background: #faf9f6;
      border-radius: 24px;
      padding: 24px;
      box-shadow: 0 16px 48px rgba(18, 21, 24, 0.18);
    }
    .easner-checkout-overlay__header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin-bottom: 16px;
    }
    .easner-checkout-overlay__title {
      margin: 0; font-size: 18px; font-weight: 600; color: #121518;
    }
    .easner-checkout-overlay__close {
      border: 0; background: transparent; font-size: 22px; line-height: 1;
      cursor: pointer; color: #6F756F;
    }
  `
  document.head.appendChild(style)
}

export async function openOverlay(
  options: EasnerCheckoutOverlayOptions,
  runtime: { platformKey: string; platformTestKey: string; validateUrl: string },
): Promise<MountedCheckout> {
  ensureStyles()
  const backdrop = document.createElement("div")
  backdrop.className = "easner-checkout-overlay"
  backdrop.setAttribute("role", "dialog")
  backdrop.setAttribute("aria-modal", "true")

  const panel = document.createElement("div")
  panel.className = "easner-checkout-overlay__panel"

  const header = document.createElement("div")
  header.className = "easner-checkout-overlay__header"
  const title = document.createElement("p")
  title.className = "easner-checkout-overlay__title"
  title.textContent = options.title || "Checkout"
  const close = document.createElement("button")
  close.type = "button"
  close.className = "easner-checkout-overlay__close"
  close.setAttribute("aria-label", "Close checkout")
  close.textContent = "×"
  header.append(title, close)

  const mountPoint = document.createElement("div")
  panel.append(header, mountPoint)
  backdrop.appendChild(panel)
  document.body.appendChild(backdrop)

  let inner: MountedCheckout | null = null
  const destroy = () => {
    inner?.destroy()
    backdrop.remove()
  }
  close.addEventListener("click", destroy)
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) destroy()
  })

  inner = await mountInline(
    mountPoint,
    {
      ...options,
      onSuccess: (result) => {
        options.onSuccess?.(result)
        destroy()
      },
    },
    runtime,
  )
  return { destroy }
}
