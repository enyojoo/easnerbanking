# Noah Production Rollout Checklist

This checklist covers Vercel environment variables and Noah dashboard configuration needed for automatic KYC/KYB post-approval provisioning (bank accounts + stablecoin addresses).

## 1) Vercel Environment Variables (Business app)

Set these in Vercel for the `business` deployment (Production and Preview as needed):

- `NOAH_API_BASE_URL=https://api.noah.com/v1`
- `NOAH_API_KEY=<live_noah_api_key>`
- `NOAH_SIGNING_PRIVATE_KEY=<pem_es384_private_key>`
- `NOAH_ONBOARDING_RETURN_URL=https://<business-domain>/auth/noah-return`
- `NOAH_BUSINESS_ONBOARDING_RETURN_URL=https://<business-domain>/auth/noah-kyb-return`
- `NOAH_WEBHOOK_NOAH_ENV=production`
- `NEXT_PUBLIC_MOBILE_APP_HOME_URL=https://easner.com/user/dashboard`

Notes:
- Return URLs must be full `https://` URLs.
- After updating env vars, redeploy the application.

## 2) Noah Dashboard Configuration

- Configure webhook URL:
  - `https://<business-domain>/api/noah/webhooks`
- Subscribe webhook to customer verification lifecycle events (customer/KYC/KYB status changes).
- Confirm hosted onboarding return URLs match the same values configured in Vercel.
- Confirm the API key belongs to the same Noah environment as `NOAH_API_BASE_URL`.
- Confirm GBP payment methods are enabled for your Noah account before enabling GBP in app flags.

## 3) Office Global Currency Controls

Office Settings now controls platform-wide currency policy via `system_settings` keys:

- `currency_available_<CODE>` and `currency_active_<CODE>` (e.g. `USD`, `EUR`, `GBP`, `NGN`)
- USD/EUR remain visible across apps even when deactivated; actions are blocked by API.
- Non-default currencies (GBP/others) require both:
  - `available=true` ("make available"),
  - `active=true` (feature can be used).

## 4) Expected Runtime Behavior

After KYC (individual) or KYB (business) is approved:

- Webhook or sync fallback updates `users.noah_kyc_status` / `users.noah_kyb_status`.
- Provisioning runs and upserts:
  - virtual account details (`noah_virtual_accounts` + user pointers),
  - wallet details + liquidation addresses (`noah_wallets` + `users.noah_wallet_id`).
- Business and mobile account/receive screens should display bank account + stablecoin address data without manual setup.
- Currency-disabled responses are enforced at API level for open-currency and deposit/address flows.

## 5) Smoke Test

1. Complete hosted KYC/KYB flow.
2. Confirm webhook delivery returns `200` from `/api/noah/webhooks`.
3. Confirm user record is `approved`.
4. Confirm account/wallet tables are populated.
5. Confirm:
   - Business `Accounts` page shows deposit details.
   - Mobile `Receive Money` screen shows bank + stablecoin details.
6. Toggle GBP to available+active in Office and confirm GBP appears in available-currency APIs.
7. Toggle USD or EUR to inactive in Office and confirm related account/deposit actions return disabled messaging.

