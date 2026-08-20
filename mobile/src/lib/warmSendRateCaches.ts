import type { QueryClient } from '@tanstack/react-query'
import type { Recipient } from '../types'
import { prefetchCryptoSendExchangeRates } from '../hooks/queries/use-crypto-send-exchange-rates'
import { prefetchNoahSendExchangeRates } from '../hooks/queries/use-noah-send-exchange-rates'
import { prefetchProviderSendExchangeRates } from '../hooks/queries/use-provider-send-exchange-rates'
import { isWalletSendRecipient, resolveRecipientWalletNetwork } from './recipientWalletMeta'
import { getPayoutCorridorCache } from './sendDestinations'
import { resolveRecipientBalancePayoutProvider } from './resolveRecipientBalancePayoutProvider'

/** Prefetch send FX for one recipient using the active corridor provider only. */
export function prefetchSendRatesForRecipient(
  qc: QueryClient,
  recipient: Recipient,
): void {
  if (isWalletSendRecipient(recipient)) {
    const net = resolveRecipientWalletNetwork(recipient)
    if (net) void prefetchCryptoSendExchangeRates(qc, recipient.currency, net)
    return
  }

  const cur = String(recipient?.currency ?? '').trim().toUpperCase()
  if (cur.length !== 3) return

  const cache = getPayoutCorridorCache()
  const provider = resolveRecipientBalancePayoutProvider(recipient, cache) ?? 'noah'
  if (provider === 'noah') {
    void prefetchNoahSendExchangeRates(qc, cur)
    return
  }
  void prefetchProviderSendExchangeRates(qc, cur, provider)
}

/**
 * Prefetch send FX rows for currencies/networks the user actually sends to.
 * One provider per corridor – same DB rows used at quote time.
 */
export async function warmSendRateCachesFromRecipients(
  qc: QueryClient,
  recipients: Recipient[] | null | undefined,
): Promise<void> {
  const cache = getPayoutCorridorCache()
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

    if (cur.length !== 3) continue
    const provider = resolveRecipientBalancePayoutProvider(r, cache) ?? 'noah'
    const key = `${cur}:${provider}`
    if (seenFiat.has(key)) continue
    seenFiat.add(key)
    if (provider === 'noah') {
      tasks.push(prefetchNoahSendExchangeRates(qc, cur))
    } else {
      tasks.push(prefetchProviderSendExchangeRates(qc, cur, provider))
    }
  }

  await Promise.allSettled(tasks)
}
