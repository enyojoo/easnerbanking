function normalizeReceive(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 100) / 100
}

export const SEND_BUDGET_EPSILON = 0.01

export type PrepareAttemptResult<TPrep extends { cryptoAuthorizedAmount: string } = {
  cryptoAuthorizedAmount: string
}> = {
  prep: TPrep
  channelId: string
}

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

function authorizedAmount(prep: { cryptoAuthorizedAmount: string }): number {
  return Number.parseFloat(String(prep.cryptoAuthorizedAmount || ""))
}

function fitsSendBudget(authorized: number, sendBudget: number): boolean {
  return (
    Number.isFinite(authorized) &&
    authorized > 0 &&
    authorized <= sendBudget + SEND_BUDGET_EPSILON
  )
}

/**
 * Find the largest receive fiat amount whose Noah prepare succeeds and whose
 * crypto authorization fits the user's send-side budget.
 */
export async function resolvePrepareWithinSendBudget<
  TPrep extends { cryptoAuthorizedAmount: string },
>(input: {
  sendBudget: number
  initialReceive: number
  runPrepare: (receiveAmount: number) => Promise<PrepareAttemptResult<TPrep>>
  maxAttempts?: number
}): Promise<{ receiveAmount: number; prepared: PrepareAttemptResult<TPrep> }> {
  const sendBudget = input.sendBudget
  const maxAttempts = input.maxAttempts ?? 12
  let seed = normalizeReceive(input.initialReceive)
  if (!(seed > 0)) {
    throw new Error("Could not derive a payout amount for this send budget.")
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
    for (let i = 0; i < maxAttempts && !(prepared && guess > 0); i++) {
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

  let authorized = authorizedAmount(prepared.prep)
  if (fitsSendBudget(authorized, sendBudget)) {
    return { receiveAmount: receive, prepared }
  }

  let lo = 0
  let hi = receive
  let best: { receiveAmount: number; prepared: PrepareAttemptResult } = {
    receiveAmount: receive,
    prepared,
  }

  for (let i = 0; i < maxAttempts; i++) {
    const mid = normalizeReceive((lo + hi) / 2)
    if (!(mid > lo) || mid >= hi) break

    const attempt = await tryPrepare(mid)
    if (!attempt) {
      hi = mid
      continue
    }

    authorized = authorizedAmount(attempt.prep)
    if (fitsSendBudget(authorized, sendBudget)) {
      best = { receiveAmount: mid, prepared: attempt }
      lo = mid
    } else {
      hi = mid
    }
  }

  authorized = authorizedAmount(best.prepared.prep)
  if (!fitsSendBudget(authorized, sendBudget)) {
    throw new Error(
      "This send amount is too low to cover payout fees. Try sending a slightly higher amount.",
    )
  }

  return best
}
