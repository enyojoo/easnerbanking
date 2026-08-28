# Recipient form — manual QA matrix (TestFlight)

Run after any change to Send hub or Recipients add/edit flows.

## Preconditions

- PostHog session replay enabled (`enableSessionReplay: true` in `posthog.native.ts`)
- Send hub + Recipients eager-loaded in `screenRegistry.native.ts` (no first-tap lazy `require()`)

## Checklist

1. **Cold start → PIN → Dashboard → Send** — opens without crash; list renders.
2. **More → Recipients** — opens without crash; list renders.
3. **Send → Add US bank** — complete form → lands on SendAmount with draft recipient (no DB write).
4. **Send → Add EUR (SEPA tiles)** — complete form → SendAmount with draft.
5. **Recipients → Add / Edit / Delete** — persisted recipients update list correctly.
6. **Payroll receiving-method path** (if enabled) — type picker hides Easetag; attach after create works.
7. **PostHog** — events fire; session replay recording visible in dashboard.

## Corridor spot checks

- US bank: transfer type grid required when corridor offers rails.
- EUR bank: SEPA / SEPA Instant selection.
- YC/Grid corridors: extra metadata fields validate before save.
- Wallet: asset/network dropdowns; QR scan optional.
- Mobile money: provider allowlist.
- Easetag: debounced lookup; profile preview before save.
