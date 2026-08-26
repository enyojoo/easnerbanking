import { toast } from "sonner"
import { fetchWithSession } from "@/lib/fetch-with-session"

declare global {
  interface Window {
    EasnerCheckout?: {
      openOverlay: (options: {
        publishableKey: string
        clientSecret: string
        onSuccess?: () => void
      }) => Promise<unknown>
    }
  }
}

async function loadCheckoutJs(): Promise<void> {
  if (window.EasnerCheckout?.openOverlay) return
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "/checkout.js"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Could not load Easner Checkout"))
    document.head.appendChild(script)
  })
}

export async function openTestCheckout(options: {
  fallbackPublishableKey: string
  onSuccess: () => void
}): Promise<void> {
  const res = await fetchWithSession("/api/checkout/try-test", { method: "POST" })
  const body = (await res.json().catch(() => ({}))) as {
    client_secret?: string
    publishable_key?: string
    error?: string
  }
  if (!res.ok || !body.client_secret) {
    toast.error(body.error || "Could not start a test checkout")
    return
  }
  await loadCheckoutJs()
  if (!window.EasnerCheckout?.openOverlay) {
    toast.error("Checkout script did not load")
    return
  }
  await window.EasnerCheckout.openOverlay({
    publishableKey: body.publishable_key || options.fallbackPublishableKey,
    clientSecret: body.client_secret,
    onSuccess: () => {
      toast.success("Test payment received.")
      options.onSuccess()
    },
  })
}
