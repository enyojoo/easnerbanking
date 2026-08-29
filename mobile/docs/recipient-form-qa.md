# Recipient form — manual QA matrix

Run after any change to Send hub or Recipients add/edit flows.

Add starts as a **navigation sheet** over the list (tap outside, X, swipe down, or Escape on web). The form is a **full screen** (keyboard + pinned footer). Not a React Native Modal over FlashList.

## Checklist

1. **Cold start → PIN → Dashboard → Send** — opens without crash; list renders.
2. **More → Recipients** — opens without crash; list renders.
3. **Send → Add** — type sheet over the list; pick a rail; form is full screen. Keyboard scrolls the focused field; footer Cancel / Add stays pinned. Back on the form (or Android back) returns to the type sheet; Cancel returns to the list. Open dropdowns close on the first back before leaving the form.
4. **Send → Add US bank** — complete form → lands on SendAmount with draft recipient (no DB write). Same on Expo web (no full page reload; amount screen shows the recipient). Back from amount returns to the send hub (not the form).
5. **Send → Add EUR (SEPA tiles)** — complete form → SendAmount with draft.
6. **Recipients → Add / Edit / Delete** — persisted recipients update list correctly. Edit skips the type sheet and uses an Edit title for that rail.
7. **Wallet QR** — iOS/Android: scan button opens ScanWalletAddress and writes `scannedWalletAddress` back onto AddWalletRecipient. Web: no scan button; paste in the address field (same asset/network inference).

Payroll receiving methods stay on PayrollReceivingMethod. They do not go through this flow or the recipients table.

## Corridor spot checks

- US bank: transfer type grid required when corridor offers rails.
- EUR bank: SEPA / SEPA Instant selection.
- YC/Grid corridors: extra metadata fields validate before save.
- Wallet: asset/network dropdowns; QR scan optional.
- Mobile money: provider allowlist.
- Easetag: debounced lookup; profile preview before save.
