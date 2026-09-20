# Console

Console is Dev Home. It is the same role as Banking Home, for the platform book.

Open Dev on `business.easner.com` (Switch to Dev Platform). You land on `/console`.

## What you see

| Path | Expected |
|---|---|
| `/console` | Test / live switch. **Total Volume** (completed platform throughput, USD and EUR). Money in / money out. Recent platform activity. Last webhook and last API error. |
| `/console/keys` | One test key and one live key. Reveal the secret once. New keys include checkout, accounts, and transfers. |
| `/console/webhooks` | One endpoint URL per mode. Event ticks. Signing secret. Deliveries and redeliver. |
| `/console/logs` | Recent `v1` requests for this business and mode. |
| `/console/events` | The webhook catalog. Tick the same events as Webhooks. |

Nav: **Console, Customers, Accounts, Transactions, Checkout**. Settings stays in both modes.

Customers, Accounts, and Transactions in this nav are the **platform** objects. Invoice customers and Banking balances stay in Banking.

**Customers** is the people. Open a customer to see the virtual accounts issued to them. **Accounts** is the directory of those issued accounts — not a balance Easner holds.

## Keys

- One test key (`easner_sk_test_…` / `easner_pk_test_…`).
- One live key (`easner_sk_live_…` / `easner_pk_live_…`).
- Secret key: server only. Publishable key: browser, Checkout only.
- **New** keys include `checkout`, `accounts.read`, `accounts.write`, `transfers.write`.
- Existing checkout-only keys stay checkout-only until you mint a new key.

If a call returns `key_forbidden`, the key is missing that scope. Mint a new key from Console.

## Webhooks

- One URL per mode (test and live may differ).
- Tick which events to receive. Unticked events are not delivered.
- Verify every request with `easner-signature`. See [Webhooks](./webhooks.md).
- Failed deliveries retry: 1m, 5m, 30m, 2h, 24h. After five attempts the delivery is failed. Redeliver from Console.

## Expected operator path

1. Switch to Dev.
2. Mint a test key. Store the secret in your server env.
3. Add a webhook URL. Tick `transfer.completed`, `transaction.created`, and the checkout events you need.
4. Use test until quotes, transfers, and checkout.completed land on your endpoint.
5. Mint a live key. Point the live webhook URL at production.

## Next

[Authentication](./authentication.md)
