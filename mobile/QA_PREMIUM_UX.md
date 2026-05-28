# Premium UX — Manual QA Gates

Run on **iOS and Android** before merging each phase PR.

## Gate 0 (Phase 0)

- [ ] All 4 tabs load: Home, Cards, Transactions, More
- [ ] Empty-state CTAs: Dashboard → send, Transactions → send, Recipients → add recipient
- [ ] Tab switch haptic (device with haptics)
- [ ] Copy haptic (Easetag on More)
- [ ] Pull-to-refresh on Transactions completes
- [ ] Fast PIN entry: no spinner flash

## Gate 1 (Phase 1)

- [ ] Auth login/signup + OTP: footer visible above keyboard
- [ ] Forgot/Reset password: submit not obscured
- [ ] Auth, Dashboard, More enter animation; Reduce Motion → instant
- [ ] PremiumModalSheet (logout/MFA) opens and dismisses
- [ ] PIN/MFA/send hub regression check

## Gate 2 (Phase 2)

- [ ] Tab navigation + back from pushed screens
- [ ] Transactions/Dashboard list scroll + tap
- [ ] Filter chips toggle cleanly
- [ ] More settings rows navigate correctly
- [ ] Send flow: SelectRecentRecipient → SendAmount → Confirm
- [ ] Dev client rebuilt after Reanimated/Pressto/Pulsar

## Gate 3 (Phase 3)

- [ ] Recipients: add form, dropdown, keyboard
- [ ] SendAmount: numpad + bottom CTA reachable with keyboard
- [ ] PIN setup/entry/send-pin/change-pin
- [ ] ReceiveMoney + deposit details
- [ ] Send confirm success haptic + navigation
- [ ] Reduce Motion: no stuck modals
