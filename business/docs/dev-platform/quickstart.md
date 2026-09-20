# Quickstart

Move money from a customer's issued account in test. Nothing hits live rails.

You need:

- Dev Platform enabled on the business
- A test secret key from Console → Keys (`easner_sk_test_…`)
- `EASNER_SECRET_KEY` set in your shell

```bash
export EASNER_SECRET_KEY=easner_sk_test_…
```

## 1. Create a customer

A customer is your end user. Creating one creates their wallet and issues a USD virtual account.

```bash
curl https://api.easner.com/v1/customers \
  -H "Authorization: Bearer $EASNER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"email":"ada@example.com","name":"Ada","external_id":"user_42"}'
```

Save `id` (`cus_…`) and the issued account id (`acct_…` in `accounts[0]`).

## 2. Their account

The USD account is already issued. List it, or open another currency on the same customer.

```bash
curl "https://api.easner.com/v1/accounts?customer=cus_…" \
  -H "Authorization: Bearer $EASNER_SECRET_KEY"
```

```bash
curl https://api.easner.com/v1/accounts \
  -H "Authorization: Bearer $EASNER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"currency":"EUR","customer":"cus_…"}'
```

`available` is in cents on that issued account. It is not a balance Easner holds.

## 3. Add a destination

Where the transfer should land. Easetag is the simplest test destination.

```bash
curl https://api.easner.com/v1/destinations \
  -H "Authorization: Bearer $EASNER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"easetag","customer":"cus_…","details":{"easetag":"ada"}}'
```

Save `id` (`dest_…`).

## 4. Quote

Lock send and receive. Amounts are cents. Quotes expire in 15 minutes. `source` is the issued account.

```bash
curl https://api.easner.com/v1/quotes \
  -H "Authorization: Bearer $EASNER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount":4900,"currency":"usd","source":"acct_…","destination":"dest_…"}'
```

Save `id` (`qt_…`). In test, send and receive are 1:1 unless a live wallet destination is priced.

## 5. Transfer

Execute the quote. Always send `Idempotency-Key` so a retry does not send twice.

```bash
curl https://api.easner.com/v1/transfers \
  -H "Authorization: Bearer $EASNER_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"quote":"qt_…"}'
```

Expected: `status` moves to `completed` (test) or stays `created` then completes. The issued account is debited. A `txn_` row is written on that customer.

Listen for `transfer.completed` and `transaction.created` on your webhook.

## 6. Read the book

```bash
curl https://api.easner.com/v1/transactions \
  -H "Authorization: Bearer $EASNER_SECRET_KEY"
```

This list is the platform book only. Banking Send will never appear here.

In Console, open the customer. Their issued accounts and activity are on that profile. **Accounts** is the directory of every issued VA.

## Collect instead of send

To take a payment on your website, go to [Checkout](./checkout.md). A merchant-key session credits the platform book.

## Next

[Console](./console.md) — mint keys and tick webhook events before you go further.
