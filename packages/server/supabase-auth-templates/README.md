# Supabase Auth email templates

HTML for **Supabase Dashboard → Authentication → Email Templates**, generated from the same design system as SendGrid mail (`packages/server/lib/email-generator.ts`).

## Regenerate

```bash
npx tsx packages/server/scripts/render-supabase-auth-templates.ts
```

## Paste into Supabase

| File | Supabase template |
|------|-------------------|
| `password-reset.html` | **Reset password** / Recovery (OTP flow) |
| `signup-verify.html` | **Confirm signup** (email verification OTP) |

Both templates use the Go template variable **`{{ .Token }}`** for the 6-digit code. Do not edit that placeholder in Supabase.

## Subject lines (set in Supabase, not in these files)

Suggested subjects:

- Reset password: `Reset your password – Easner`
- Confirm signup: `Verify your email – Easner`

## Notes

- Footer matches SendGrid: Easner Group, Inc., Castro address, “You received this email because you have an Easner account.”
- No “Manage email preferences” link (auth mail is account-required, not marketing).
- Logo: **dual wordmark** – `Easner Logo.png` (light mode) + `Easner LogoW.png` (dark mode), swapped when the client honors `prefers-color-scheme: dark`.
