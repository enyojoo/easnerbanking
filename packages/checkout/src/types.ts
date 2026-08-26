export type CheckoutMode = "payment" | "subscription"

export type EasnerCheckoutMountOptions = {
  publishableKey: string
  clientSecret: string
  customerEmail?: string
  customerName?: string
  onSuccess?: (result: unknown) => void
  onError?: (error: Error) => void
}

export type EasnerCheckoutOverlayOptions = EasnerCheckoutMountOptions & {
  title?: string
}

export type MountedCheckout = {
  destroy: () => void
}

export type EasnerCheckoutApi = {
  mount: (
    target: string | Element,
    options: EasnerCheckoutMountOptions,
  ) => Promise<MountedCheckout>
  openOverlay: (options: EasnerCheckoutOverlayOptions) => Promise<MountedCheckout>
  destroy: (target?: string | Element | MountedCheckout) => void
}

declare global {
  interface Window {
    Stripe?: (key: string) => StripeLike
    EasnerCheckout?: EasnerCheckoutApi
    __easnerSdkPromise?: Promise<StripeLike>
    __easnerStripeByKey?: Record<string, Promise<StripeLike>>
  }
}

export type StripeLike = {
  initCheckout: (options: Record<string, unknown>) => Promise<CheckoutSessionLike>
}

export type CheckoutSessionLike = {
  session?: () => {
    total?: { total?: { amount?: string } }
    customerEmail?: string
    customerDetails?: { email?: string }
    email?: string
  }
  email?: string
  updateEmail?: (email: string) => Promise<unknown>
  createPaymentElement: (options?: Record<string, unknown>) => MountableElement
  createExpressCheckoutElement?: (options?: Record<string, unknown>) => ExpressElement
  confirm: (options?: Record<string, unknown>) => Promise<{ type?: string; error?: { message?: string } }>
}

export type MountableElement = {
  mount: (el: Element) => void
  unmount?: () => void
  on?: (event: string, handler: (event: Record<string, unknown>) => void) => void
}

export type ExpressElement = MountableElement & {
  on: (event: string, handler: (event: Record<string, unknown>) => void) => void
}
