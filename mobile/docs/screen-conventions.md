# Mobile screen conventions

Short reference for building screens that match the premium banking UI.

## Surfaces and background

- Use **`semantic.background`** from `useThemeColors()` for full-screen canvas under scroll content.
- Cards and elevated panels: **`PremiumSurface`** or **`Surface`** primitives from `components/premium/` / `components/ui/` as appropriate.
- Avoid large full-screen blur plates; blur is for **chrome** (tab bar, headers, modal scrims) per the design system section 4.

## Errors and empty states

- Inline errors on forms: **`InlineCardError`** (`components/data/`).
- Full-screen or section errors: existing **`ErrorState`** / **`EmptyState`** patterns.

## Lists

- Primary long lists: **`@shopify/flash-list`** with a realistic **`estimatedItemSize`**; memo row components when parents re-render often.
- Remote images: prefer **`expo-image`** for URLs.

## Typography

- Use **`textStyles`** and **`fontFamily`** from `theme/typography.ts` only (Geist). Do not add one-off `fontFamily` strings on screens.

## Theme literals

- Run `npm run lint:theme` in `mobile/` to catch disallowed legacy panel hex in `src/screens/`.

## E2E

- Maestro (or similar) flows for login/regression can live alongside app releases; no harness is wired in-repo by default.
