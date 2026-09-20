# Dev is Console + platform v1

Integrator guide for banks and fintechs building on Easner. This is the product contract. Host, Office, and deploy notes stay in [`platform-api-split.md`](./platform-api-split.md).

Base URL: `https://api.easner.com`

Auth: `Authorization: Bearer easner_sk_test_…` or `easner_sk_live_…`

Amounts are minor units (cents). Errors are `{ error: { type, code, message } }`. Writes that move money take `Idempotency-Key`.

## Pages

| Page | What you do |
|---|---|
| [Overview](./dev-platform/overview.md) | What Dev is, two books, what is out of scope |
| [Quickstart](./dev-platform/quickstart.md) | First transfer in test: customer → destination → quote → transfer |
| [Console](./dev-platform/console.md) | Keys, webhooks, logs, events, and the Dev dashboard |
| [Authentication](./dev-platform/authentication.md) | Bearer keys, livemode, scopes, idempotency |
| [Errors](./dev-platform/errors.md) | Envelope, status codes, common codes |
| [Customers](./dev-platform/customers.md) | Create and list API customers (each gets a wallet and a USD account) |
| [Accounts](./dev-platform/accounts.md) | Virtual accounts issued to customers |
| [Destinations](./dev-platform/destinations.md) | Where money can leave: bank, mobile money, wallet, Easetag |
| [Quotes](./dev-platform/quotes.md) | Lock send and receive amounts |
| [Transfers](./dev-platform/transfers.md) | Execute a quote or send from an issued account |
| [Transactions](./dev-platform/transactions.md) | Platform ledger only |
| [Checkout](./dev-platform/checkout.md) | Collect on your website; settlement credits the platform book |
| [Webhooks](./dev-platform/webhooks.md) | Catalog, `easner-signature`, retries |
| [Test and live](./dev-platform/test-and-live.md) | What test completes, what live moves |

## Expected flow

1. Office enables Dev Platform on the business. Switch to Dev on `business.easner.com`.
2. Open Console. Mint a test key. Add a webhook URL and tick events.
3. Create a customer (USD account is issued). Open EUR if you need it. Add a destination.
4. Quote, then transfer. Fulfil from `transfer.completed` and `transaction.created`.
5. For collect, add a website on Checkout, create sessions from your server, mount `checkout.js`, fulfil from `checkout.completed`.
6. Mint a live key only after test works. Live debits and credits the platform book.

Do not call Banking Send, invoices, cards, or payroll from this API. Those stay in the Banking product.
