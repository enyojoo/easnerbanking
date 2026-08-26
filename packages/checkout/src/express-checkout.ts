import type { CheckoutSessionLike } from "./types"

/** Phone-width mounts: stack wallets and drop accordion radios so Stripe does not overflow. */
export function isNarrowCheckoutViewport(): boolean {
  return window.matchMedia("(max-width: 480px)").matches
}

/** Wallet row: never use overflow `auto` (that is the mobile scroller). Extra methods use Stripe’s menu. */
export function expressCheckoutLayout(): { maxColumns: number; overflow: "never" } {
  return {
    maxColumns: isNarrowCheckoutViewport() ? 1 : 2,
    overflow: "never",
  }
}

export function hasReadyExpressMethods(available: unknown): boolean {
  if (!available || typeof available !== "object") return false
  return Object.values(available as Record<string, unknown>).some((value) => {
    if (value === true) return true
    return Boolean(value && typeof value === "object" && (value as { available?: boolean }).available)
  })
}

export function mountExpressCheckout(
  checkout: CheckoutSessionLike,
  host: HTMLElement,
  divider: HTMLElement,
  onConfirm: (walletEmail: string) => Promise<void>,
): { unmount?: () => void } | null {
  if (typeof checkout.createExpressCheckoutElement !== "function") return null
  const express = checkout.createExpressCheckoutElement({ layout: expressCheckoutLayout() })
  const showDivider = (available?: unknown) => {
    divider.style.display = hasReadyExpressMethods(available) ? "block" : "none"
  }
  express.on?.("ready", (event) => showDivider(event.availablePaymentMethods))
  express.on?.("availablepaymentmethodschange", (event) => showDivider(event.paymentMethods))
  express.on?.("confirm", (event) => {
    const details = event.billingDetails as { email?: string } | undefined
    void onConfirm(String(details?.email ?? "").trim()).catch((error) => {
      const fail = event.paymentFailed as ((input: { reason: string; message: string }) => void) | undefined
      fail?.({ reason: "fail", message: error instanceof Error ? error.message : "Payment failed" })
    })
  })
  express.mount(host)
  return express
}
