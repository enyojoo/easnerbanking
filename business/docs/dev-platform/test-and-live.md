# Test and live

Livemode is the key prefix. There is no `livemode` body flag.

| | Test (`easner_sk_test_`) | Live (`easner_sk_live_`) |
|---|---|---|
| Objects | Isolated test book | Isolated live book |
| Quote | Completes. Send/receive 1:1 | May price wallet destinations |
| Transfer | Completes. Debits the **test** platform book. No live rails | Debits the **live** platform book |
| Checkout | Test card `4242…`. Nothing charged | Real collect. Credits the live platform book |
| Webhooks | Your test URL | Your live URL |

Test never moves live partner money. Live never writes the test book.

## What you must do before live

1. Console: mint a test key. Add a test webhook. Tick the events you handle.
2. [Quickstart](./quickstart.md) a customer → destination → quote → transfer. Confirm `transfer.completed` on the test URL.
3. Checkout: register the website, create a test session, pay with `4242`, confirm `checkout.completed` and a platform `in` transaction.
4. Console Logs should show the `v1` calls. Errors should be gone.
5. Mint a live key. Set a live webhook URL. Tick the same events.
6. Open live accounts (`USD` / `EUR`) before you send.

## What you should not do

- Reuse a test key in production.
- Fulfil from the browser `onSuccess` without the webhook.
- Expect Banking Transactions to show API money.
- Call Banking Send, invoices, cards, or payroll through `v1`.

## Restriction

If Office restricts send or deposit, live (and test) writes that match the restriction fail with `permission`. The API does not bypass the Banking lock.

## Not in these docs

Host split, Office **Enable Dev Platform**, Front Door, and env tables live in [`../platform-api-split.md`](../platform-api-split.md).
