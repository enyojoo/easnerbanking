# Mobile design system (Easner)

This app aligns with the business web app’s **semantic roles** and **8px form radius** (`business/app/globals.css`).

## Tokens

- **Import** from `src/theme` or `src/theme/authScreen` for auth-specific stacks.
- **Primary brand**: `#007ACC` (`colors.primary.main`).
- **Semantic surfaces** (light): `colors.semantic` — `background`, `foreground`, `muted`, `mutedForeground`, `border`, `input`, `card`, `destructive`, `ring`.
- **Default control radius**: `borderRadius.md` (8px). Use larger radii (`lg`, `3xl`) for marketing/onboarding only.

## UI primitives

Prefer `src/components/ui`:

- `Button` — variants: `default`, `outline`, `ghost`, `destructive`; sizes `sm` | `md`.
- `TextField` — label + input + optional error; semantic borders.
- `Surface` — optional card-like panel with border (use for **in-app** grouped content; **not** for wrapping the main auth login/sign-up form — those sit **flush on the page** background for parity with a simpler mobile layout).

## Conventions

- Avoid raw **hex** in new screen code; use `colors.*` / `semantic` / `frame`.
- Typography: use `textStyles` and `fontSize` from `src/theme/typography.ts`.
- **Optional check**: search for hardcoded colors when touching a file:  
  `rg '#[0-9A-Fa-f]{6}' src/screens --glob '*.tsx'`

## Fonts

**Outfit** is the mobile UI family (loaded in app shell). Business web uses Geist; hierarchy is matched via the shared scale, not necessarily the same font files.
