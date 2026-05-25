function normalizeReceive(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 100) / 100
}

export type PrepareAttemptResult<TPrep extends { cryptoAuthorizedAmount: string } = {
  cryptoAuthorizedAmount: string
}> = {
  prep: TPrep
  channelId: string
}

/** Seed Noah prepare receive fiat from the user's send-side entry + corridor rate. */
export function seedQuoteReceiveForSendBudget(input: {
  sendBudget: number
  sourceCurrency: string
  receiveCurrency: string
  clientReceiveAmount: number
  dbRate?: number | null
}): number {
  const send = input.sourceCurrency.trim().toUpperCase()
  const receive = input.receiveCurrency.trim().toUpperCase()
  if (send === receive) {
    return normalizeReceive(input.sendBudget)
  }
  const rate = input.dbRate
  if (rate != null && Number.isFinite(rate) && rate > 0) {
    return normalizeReceive(input.sendBudget * rate)
  }
  return normalizeReceive(input.clientReceiveAmount)
}

/**
 * Prepare at the seeded receive amount. Bidirectional send uses the same Noah
 * prepare as receive-side entry — total debited (cryptoAuthorizedAmount) may
 * exceed the entered send principal because Noah fees sit on top.
 *
 * Only walks receive down when prepare fails at the seeded amount.
 */
export async function resolvePrepareForSendEntry<
  TPrep extends { cryptoAuthorizedAmount: string },
>(input: {
  initialReceive: number
  runPrepare: (receiveAmount: number) => Promise<PrepareAttemptResult<TPrep>>
  maxAttempts?: number
}): Promise<{ receiveAmount: number; prepared: PrepareAttemptResult<TPrep> }> {
  const maxAttempts = input.maxAttempts ?? 12
  let seed = normalizeReceive(input.initialReceive)
  if (!(seed > 0)) {
    throw new Error("Could not derive a payout amount for this send entry.")
  }

  let lastPrepareError: unknown = null

  const tryPrepare = async (amount: number): Promise<PrepareAttemptResult<TPrep> | null> => {
    const normalized = normalizeReceive(amount)
    if (!(normalized > 0)) return null
    try {
      return await input.runPrepare(normalized)
    } catch (e) {
      lastPrepareError = e
      return null
    }
  }

  let prepared = await tryPrepare(seed)
  let receive = seed

  if (!prepared) {
    let guess = seed
    for (let i = 0; i < maxAttempts && !prepared; i++) {
      guess = normalizeReceive(guess * 0.92)
      if (!(guess > 0)) break
      prepared = await tryPrepare(guess)
      if (prepared) receive = guess
    }
  }

  if (!prepared) {
    if (lastPrepareError instanceof Error && lastPrepareError.message.trim()) {
      throw lastPrepareError
    }
    throw new Error(
      "We couldn't price this payout. Check the recipient details, then go back and tap Continue again.",
    )
  }

  return { receiveAmount: receive, prepared }
}
