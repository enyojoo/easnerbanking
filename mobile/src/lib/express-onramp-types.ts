export const EXPRESS_NATIVE_AUTH_REQUIRED = 'EXPRESS_NATIVE_AUTH_REQUIRED'

export type ExpressOnrampSdk = {
  registerLinkUser?: (
    email: string,
    phone: string,
    country: string,
    fullName?: string,
  ) => Promise<unknown>
  authenticate?: (id: string, cb: (r: Record<string, unknown>) => void) => Promise<unknown>
  submitKycInfo?: (info: Record<string, unknown>) => Promise<unknown>
  getMissingIdentifiers?: () => Promise<{ identifiers?: Array<{ type?: string }> }>
  updateKycInfo?: (info: Record<string, unknown>) => Promise<{ completed?: boolean }>
  promptUserAttestation?: (cb: (r: Record<string, unknown>) => void) => Promise<unknown>
  verifyDocuments?: (cb?: (r: unknown) => void) => Promise<unknown>
  verifyIdentity?: (cb?: (r: unknown) => void) => Promise<unknown>
  collectPaymentMethod?: (
    opts: Record<string, unknown>,
    cb: (r: { cryptoPaymentToken?: string; paymentMethodDetails?: Record<string, unknown> }) => void,
  ) => Promise<unknown>
  performCheckout?: (
    sessionId: string,
    cb: (id: string) => Promise<string>,
  ) => Promise<{ success?: boolean }>
}
