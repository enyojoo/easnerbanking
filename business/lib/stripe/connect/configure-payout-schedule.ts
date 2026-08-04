import { getStripe } from "../client"

/** Configure connected-account payout schedule (built-in: daily). */
export async function configureConnectedAccountPayoutSchedule(
  stripeAccountId: string,
): Promise<{ interval: string }> {
  const stripe = getStripe()
  await stripe.accounts.update(stripeAccountId, {
    settings: {
      payouts: {
        schedule: { interval: "daily" },
      },
    },
  })
  return { interval: "daily" }
}
