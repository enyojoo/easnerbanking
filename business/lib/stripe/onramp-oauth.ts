import { decryptCheckoutSecret, encryptCheckoutSecret } from "@/lib/checkout/secrets"

export function encryptLinkOAuthToken(token: string): string {
  return encryptCheckoutSecret(token).ciphertext
}

export function decryptLinkOAuthToken(ciphertext: string | null | undefined): string {
  return decryptCheckoutSecret(ciphertext)
}
