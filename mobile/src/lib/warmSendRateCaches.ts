import type { QueryClient } from '@tanstack/react-query'
import type { Recipient } from '../types'
import { prefetchNoahSendExchangeRates } from '../hooks/queries/use-noah-send-exchange-rates'
import { prefetchCryptoSendExchangeRates } from '../hooks/queries/use-crypto-send-exchange-rates'
import { isWalletSendRecipient, resolveRecipientWalletNetwork } from './recipientWalletMeta'

/**
 * Prefetch `/api/fx/noah-rates` and `/api/fx/crypto-rates` for currencies/networks the user
 * actually sends to. Cached responses are the same DB rows used at quote time.
 */
export async function warmSendRateCachesFromRecipients(
  qc: QueryClient,
  recipients: Recipient[] | null | undefined,
): Promise<void> {
  const seenFiat = new Set<string>()
  const seenCrypto = new Set<string>()
  const tasks: Promise<unknown>[] = []

  for (const r of recipients ?? []) {
    const cur = String(r?.currency ?? '').trim().toUpperCase()
    if (!cur) continue

    if (isWalletSendRecipient(r)) {
      const net = resolveRecipientWalletNetwork(r)
      if (!net) continue
      const key = `${cur}:${net}`
      if (seenCrypto.has(key)) continue
      seenCrypto.add(key)
      tasks.push(prefetchCryptoSendExchangeRates(qc, cur, net))
      continue
    }

    if (cur.length !== 3 || seenFiat.has(cur)) continue
    seenFiat.add(cur)
    tasks.push(prefetchNoahSendExchangeRates(qc, cur))
  }

  await Promise.allSettled(tasks)
}
