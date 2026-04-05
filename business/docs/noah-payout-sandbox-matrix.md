# Noah payout sandbox checklist

Run against Noah Business sandbox with `NOAH_API_KEY` and `NOAH_SETTLEMENT_CRYPTO` set. Apply DB migration `20260405_000001_recipients_address_easetag.sql` so mobile recipients can store full US address and optional `payee_easetag`.

| Rail | Prepare API | Execute | Mobile balance send |
| --- | --- | --- | --- |
| US ACH | `POST /api/noah/payouts/prepare` with `transferType=ACH` (or omit; address required) | `POST /api/noah/transfers` form-session | US USD recipient + street/city/state/ZIP + `transfer_type` |
| US Fedwire | Same prepare with `transferType=Wire` (`BankFedwire` channel; Fedwire form omits `AccountType` in `BankDetails`) | Same | Recipient `transfer_type` = `Wire`; use wire routing if it differs from ACH |
| EUR SEPA | Same prepare with `currency=EUR`, `iban`, `countryCode` (no `transferType`; Noah picks SEPA Instant then SEPA) | Form-session sell with `currency=eur` | EUR recipient + IBAN + `country_code` |
| Mobile money | `POST /api/noah/payouts/prepare-mobile` | Form-session sell with destination fiat ISO (e.g. `kes`) | Mobile Money recipient + phone + country |
| Wallet-to-wallet | (none) | `POST /api/noah/transfers/w2w` | Recipient `payee_easetag` set; tune `NOAH_WALLET_TRANSFER_PATH` with Noah |

**Regression:** Flows that use `selectedPaymentMethod === 'otherCurrency'` (Open Banking, Virtual Bank, `MobileMoneyScreen`) are separate providers and should not call these Noah routes unless intentionally wired later.

**Note:** Identifier (mobile) channels must exist in your sandbox tenant (`GET /v1/channels/sell` with `Country` + `FiatCurrency`); if Noah returns no Identifier items, prepare-mobile returns 400 with a clear message.
