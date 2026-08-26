import { EASNER_ELEMENTS_APPEARANCE } from "./appearance"
import { isNarrowCheckoutViewport, mountExpressCheckout } from "./express-checkout"
import { createPoweredByEasner } from "./powered-by"
import type { CheckoutSessionLike, EasnerCheckoutMountOptions, MountedCheckout, StripeLike } from "./types"
import { isPublishableKey, isTestPublishableKey, isValidEmail, resolveElement } from "./validation"

export const PLATFORM_KEY_PLACEHOLDER = "__EASNER_STRIPE_PK__"
export const PLATFORM_TEST_KEY_PLACEHOLDER = "__EASNER_STRIPE_TEST_PK__"
export const VALIDATE_URL_PLACEHOLDER = "__EASNER_VALIDATE_URL__"

export type CheckoutJsRuntime = {
  platformKey: string
  platformTestKey: string
  validateUrl: string
}

const STRIPE_SDK_URL = "https://js.stripe.com/basil/stripe.js"
const METHODS_HINT = "Pay with card, bank debit, or other methods available."
const EMAIL_REQUIRED = "Enter your email to continue"
/** Hide Stripe’s test-mode sandbox assistant on merchant sites. */
const STRIPE_DEVELOPER_TOOLS = { assistant: { enabled: false } } as const
const FIT_STYLE_ID = "easner-checkout-fit"

const FIT_BOX: Partial<CSSStyleDeclaration> = {
  width: "100%",
  maxWidth: "100%",
  minWidth: "0",
  boxSizing: "border-box",
  overflowX: "clip",
}

function ensureFitStyles() {
  if (document.getElementById(FIT_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = FIT_STYLE_ID
  style.textContent = `
    [data-easner-checkout] {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      overflow-x: clip;
    }
    [data-easner-checkout] iframe {
      display: block;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }
  `
  document.head.appendChild(style)
}

function stripeCache(): Record<string, Promise<StripeLike>> {
  window.__easnerStripeByKey ??= {}
  return window.__easnerStripeByKey
}

function loadStripe(platformKey: string): Promise<StripeLike> {
  const cache = stripeCache()
  if (cache[platformKey]) return cache[platformKey]
  cache[platformKey] = new Promise((resolve, reject) => {
    const start = () => {
      if (!window.Stripe) {
        reject(new Error("Easner Checkout failed to load"))
        return
      }
      resolve(window.Stripe(platformKey, { developerTools: STRIPE_DEVELOPER_TOOLS }))
    }
    if (window.Stripe) {
      start()
      return
    }
    const script = document.createElement("script")
    script.src = STRIPE_SDK_URL
    script.async = true
    script.onload = start
    script.onerror = () => reject(new Error("Easner Checkout failed to load"))
    document.head.appendChild(script)
  })
  return cache[platformKey]
}

function platformStripeKey(
  merchantKey: string,
  runtime: CheckoutJsRuntime,
  validatedKey: string,
): string {
  const test = isTestPublishableKey(merchantKey)
  const candidate = validatedKey || (test ? runtime.platformTestKey : runtime.platformKey)
  if (
    test &&
    (!candidate || candidate.includes("EASNER_STRIPE") || /pk_live_/i.test(candidate))
  ) {
    throw new Error("Easner Checkout: test payments are not configured")
  }
  if (!candidate || candidate.includes("EASNER_STRIPE")) {
    throw new Error("Easner Checkout failed to load")
  }
  return candidate
}

async function assertPublishableKey(
  publishableKey: string,
  validateUrl: string,
): Promise<string> {
  if (!isPublishableKey(publishableKey)) {
    throw new Error("Easner Checkout: publishableKey is required")
  }
  if (!validateUrl || validateUrl.includes("EASNER_VALIDATE")) return ""
  const url = `${validateUrl}${validateUrl.includes("?") ? "&" : "?"}key=${encodeURIComponent(publishableKey)}`
  const response = await fetch(url, { method: "GET" })
  const body = (await response.json().catch(() => null)) as {
    stripe_publishable_key?: string
    error?: { message?: string }
  } | null
  if (response.status === 401 || response.status === 403) {
    throw new Error(body?.error?.message || "Easner Checkout: this publishable key is not valid")
  }
  if (!response.ok) {
    throw new Error(body?.error?.message || "Easner Checkout: could not verify publishable key")
  }
  return String(body?.stripe_publishable_key || "").trim()
}

function applyBaseStyles(el: HTMLElement, extra?: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, extra)
}

function renderSkeleton(host: HTMLElement) {
  host.replaceChildren()
  const wrap = document.createElement("div")
  wrap.setAttribute("aria-busy", "true")
  wrap.setAttribute("aria-label", "Loading payment methods")
  applyBaseStyles(wrap, { display: "flex", flexDirection: "column", gap: "12px", ...FIT_BOX })
  for (const height of ["44px", "44px", "48px", "48px", "44px"]) {
    const bar = document.createElement("div")
    applyBaseStyles(bar, {
      height,
      borderRadius: "12px",
      background: "#ecebe7",
    })
    wrap.appendChild(bar)
  }
  host.appendChild(wrap)
}

export async function mountInline(
  target: string | Element,
  options: EasnerCheckoutMountOptions,
  runtime: CheckoutJsRuntime,
): Promise<MountedCheckout> {
  const el = resolveElement(target)
  if (!el) throw new Error("Easner Checkout: mount target not found")
  if (!options.clientSecret) throw new Error("Easner Checkout: clientSecret is required")

  ensureFitStyles()
  el.setAttribute("data-easner-checkout", "")
  applyBaseStyles(el, FIT_BOX)

  const validatedKey = await assertPublishableKey(options.publishableKey, runtime.validateUrl)
  renderSkeleton(el as HTMLElement)
  const sdk = await loadStripe(platformStripeKey(options.publishableKey, runtime, validatedKey))
  const mountEmail = String(options.customerEmail || "").trim()
  const mountName = String(options.customerName || "").trim()
  const initOptions: Record<string, unknown> = {
    fetchClientSecret: () => Promise.resolve(options.clientSecret),
    elementsOptions: {
      appearance: EASNER_ELEMENTS_APPEARANCE,
    },
  }
  if (mountName) {
    initOptions.defaultValues = { billingAddress: { name: mountName } }
  }

  const checkout = await sdk.initCheckout(initOptions)
  const session = typeof checkout.session === "function" ? checkout.session() : {}
  const sessionEmail = String(
    session?.customerEmail || session?.customerDetails?.email || checkout.email || "",
  ).trim()
  const knownEmail = mountEmail || sessionEmail

  const root = document.createElement("form")
  root.setAttribute("novalidate", "novalidate")
  applyBaseStyles(root, {
    ...FIT_BOX,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    margin: "0",
  })

  const hint = document.createElement("p")
  hint.textContent = METHODS_HINT
  applyBaseStyles(hint, { margin: "0", fontSize: "14px", lineHeight: "1.45", color: "#6F756F" })

  const emailLabel = document.createElement("label")
  emailLabel.textContent = "Email"
  emailLabel.setAttribute("for", "easner-payer-email")
  applyBaseStyles(emailLabel, { display: "block", fontSize: "14px", fontWeight: "500" })

  const emailInput = document.createElement("input")
  emailInput.id = "easner-payer-email"
  emailInput.type = "email"
  emailInput.autocomplete = "email"
  emailInput.placeholder = "you@example.com"
  emailInput.required = true
  applyBaseStyles(emailInput, {
    width: "100%",
    boxSizing: "border-box",
    height: "48px",
    padding: "0 16px",
    border: "1px solid #D6D9D6",
    borderRadius: "100px",
    fontSize: "15px",
  })

  const expressHost = document.createElement("div")
  applyBaseStyles(expressHost, FIT_BOX)
  const divider = document.createElement("p")
  divider.textContent = "Or pay with"
  applyBaseStyles(divider, {
    margin: "0",
    textAlign: "center",
    fontSize: "13px",
    color: "#6F756F",
    display: "none",
  })
  const paymentHost = document.createElement("div")
  applyBaseStyles(paymentHost, FIT_BOX)
  const message = document.createElement("p")
  message.setAttribute("role", "alert")
  applyBaseStyles(message, { display: "none", margin: "0", fontSize: "14px", color: "#7a2e2e" })

  const button = document.createElement("button")
  button.type = "submit"
  const total = session?.total?.total?.amount || "Pay"
  button.textContent = String(total).startsWith("Pay") ? String(total) : `Pay ${total}`
  applyBaseStyles(button, {
    width: "100%",
    boxSizing: "border-box",
    height: "44px",
    border: "0",
    borderRadius: "9999px",
    background: "#0080cc",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "500",
    cursor: "pointer",
  })

  root.appendChild(hint)
  if (!knownEmail) {
    root.appendChild(emailLabel)
    root.appendChild(emailInput)
  }
  root.appendChild(expressHost)
  root.appendChild(divider)
  root.appendChild(paymentHost)
  root.appendChild(message)
  root.appendChild(button)
  el.replaceChildren(root, createPoweredByEasner())

  const express = mountExpressCheckout(checkout, expressHost, divider, (walletEmail) =>
    confirmCheckout(checkout, options, knownEmail || walletEmail || emailInput.value, button, message),
  )

  const payment = checkout.createPaymentElement({
    layout: {
      type: "accordion",
      radios: isNarrowCheckoutViewport() ? "never" : "always",
      spacedAccordionItems: true,
    },
    fields: {
      billingDetails: { name: "always", email: "never" },
      card: { billingDetails: { name: "always", email: "never" } },
    },
  })
  payment.mount(paymentHost)

  const onSubmit = (event: Event) => {
    event.preventDefault()
    const email = knownEmail || String(emailInput.value || "").trim()
    if (!isValidEmail(email)) {
      message.textContent = EMAIL_REQUIRED
      message.style.display = "block"
      return
    }
    void confirmCheckout(checkout, options, email, button, message)
  }
  root.addEventListener("submit", onSubmit)

  return {
    destroy() {
      root.removeEventListener("submit", onSubmit)
      payment.unmount?.()
      express?.unmount?.()
      el.replaceChildren()
    },
  }
}

async function confirmCheckout(
  checkout: CheckoutSessionLike,
  options: EasnerCheckoutMountOptions,
  email: string,
  button: HTMLButtonElement,
  message: HTMLElement,
): Promise<void> {
  if (!isValidEmail(email)) {
    message.textContent = EMAIL_REQUIRED
    message.style.display = "block"
    throw new Error(EMAIL_REQUIRED)
  }
  button.disabled = true
  message.style.display = "none"
  const sessionEmail = String(
    (typeof checkout.session === "function" && checkout.session()?.email) || checkout.email || "",
  ).trim()
  try {
    if (!sessionEmail && typeof checkout.updateEmail === "function") {
      await checkout.updateEmail(email).catch(() => undefined)
    }
    const result = await checkout.confirm({
      redirect: "if_required",
      ...(sessionEmail ? {} : { email }),
    })
    if (result.type === "error") {
      throw new Error(result.error?.message || "Payment failed")
    }
    options.onSuccess?.(result)
  } catch (error) {
    button.disabled = false
    const err = error instanceof Error ? error : new Error("Payment failed")
    message.textContent = err.message
    message.style.display = "block"
    options.onError?.(err)
    throw err
  }
}
