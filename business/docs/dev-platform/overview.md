# Overview

Easner is stablecoin-native banking and payment infrastructure. **Banking** is the operator product. **Dev** is the public API those operators build on.

Dev is not a second host. It is the same origin (`business.easner.com`) in Dev mode: **Console** (`/console`) plus **platform `v1`** on `https://api.easner.com`.

## Two books

| Book | Who uses it | What you see |
|---|---|---|
| Banking | Send, invoices, links, terminal in the Banking UI | Banking Home, Banking `/transactions` |
| Platform | Everything created with `easner_sk_*` | Console, Dev `/transactions`, `GET /v1/transactions` |

API money does not appear in Banking Transactions. Banking Send does not appear in Dev Transactions. Platform USD is not the Banking USD tile.

Checkout created with a merchant secret key credits the **platform** book. Transfers debit the **platform** book.

## Wallets

Each platform treasury and each API customer has an isolated wallet. The shape is the same as an Easner Business or Mobile user. Integrators never receive wallet keys. You call `v1`. Easner signs.

Creating a customer creates their wallet and issues a USD virtual account. Opening another account issues another currency on that same customer. Easner does not hold a platform float.

## Objects

| Object | Id | Job |
|---|---|---|
| Customer | `cus_` | Your end user on the platform |
| Account | `acct_` | A virtual account issued to a customer |
| Destination | `dest_` | Where a transfer can land |
| Quote | `qt_` | Locked send / receive amounts |
| Transfer | `tr_` | Money leaving an issued account |
| Transaction | `txn_` | A row on the platform ledger |
| Checkout session | `cs_` | A collect on your website |

## Out of scope

- Cards
- Payroll
- Banking Send
- Invoice and payment-link APIs
- Internal wallet-send or partner paths

If you need those, use the Banking product UI, not `v1`.

## Next

[Quickstart](./quickstart.md) — create a test customer and move money on the platform book.
