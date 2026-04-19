# Easner Design System

> Modern private banking for global operators — one design system across web
> (Easner Business), admin (Easner Office), and mobile (Easner Personal).

This document is the single source of truth for **tokens**, **primitives**,
**components**, and **usage patterns** across the monorepo. The canonical
token file is `packages/shared/src/design/tokens.ts`; this doc mirrors it and
describes how to consume the tokens across the three apps. **§2.0** defines the
**premium banking palette** (canonical hex + roles); implement new named
keys and CSS variables from that table when extending the codebase.

---

## 1. Design principles

1. **Premium private banking, not generic SaaS.** The product should feel
   **trustworthy, global, calm, and executive** — serious money movement with
   **high clarity**. Restraint over exuberance: no rainbow gradients, no neon
   greens, no glassmorphism.
2. **Black + ivory foundation; blue for intent.** Default UI lives on **soft
   ivory** (`#F6F3EB`) and **graphite** (`#0F1110`) neutrals. **Easner blue**
   (`#007ACC`) is for **actions, links, focus, active states, and chart
   accents** — not for filling large surfaces. Avoid “SaaS blue overload”
   (screens that read as a blue product rather than a bank).
3. **Editorial typography.** Serif (Playfair Display) for balances, headlines,
   and brand moments. Sans (Geist on web, Inter on mobile) for everything
   else. Tabular numerals for every monetary figure.
4. **Monochrome by default; primary blue for brand actions; emerald for
   success.** `primary` / `#007ACC` drives CTAs, links, and focus rings.
   **Hover** uses the dedicated hover blue (`#0062A3`) — not a random darker
   blue. Emerald stays for **success** (completed, verified, positive
   outcomes). Red (“oxblood”) is used sparingly for destructive intent —
   never decorative.
5. **Spacious, tactile surfaces.** Generous padding, soft 16–28px radii,
   thin low-contrast borders (`border/60`), layered graphite shadows.
6. **One tokenized truth.** Raw palette in `packages/shared`, re-exported
   through Tailwind CSS variables on web and React Native palette objects on
   mobile. Named constants in `tokens.ts` may grow over time; the **canonical
   hex table** in §2.0 is the north star for brand color roles.

---

## 2. Palette

### 2.0 Core banking palette (canonical hex)

These seven roles define the **premium Easner look**: private-bank restraint
plus clear digital affordances. Use them consistently across web, office,
mobile, email, and PDF.

| Role | Hex | Usage |
| ---- | --- | ----- |
| **Primary blue** | `#007ACC` | Primary buttons, text links, focus rings, key chart series, active nav — **sparingly** on large areas. |
| **Hover blue** | `#0062A3` | Hover states for primary controls and links (paired with primary blue). |
| **Deep navy** | `#0A2540` | Executive emphasis: hero bands, headers, marketing moments, “institutional” contrast — **not** default body text on ivory (use `ink` / foreground tokens). |
| **Graphite black** | `#0F1110` | Dark mode canvas, premium cards, primary text on light surfaces when paired with ivory. |
| **Soft ivory** | `#F6F3EB` | Default light canvas; warm, calm base. |
| **Light tint** | `#EAF5FD` | Sparse cool highlights: selected rows, info callouts, subtle “blue air” behind content — **not** a second background for whole screens. |
| **Dark mode accent** | `#3AA6F8` | Dark theme primary accent (links, key CTAs, focus) — reads brighter than `#007ACC` on dark graphite; keep usage aligned with primary semantics. |

**Discipline:** If the UI feels “like a blue app,” you’ve used primary/tint
too broadly. Reset to ivory/graphite chrome and reserve blue for actions and
meaning.

### 2.1 Raw brand tokens (`packages/shared/src/design/tokens.ts`)

The shared `easnerBrand` object holds the **implementable** named constants;
web uses `--primary-hover`, `--surface-tint`, `--brand-navy` in
`globals.css` (and `@theme` as `primary-hover`, `surface-tint`, `brand-navy`).
Mobile mirrors these in `mobile/src/theme/colors.ts` (`brand`).

| Token             | Hex       | Role                                  |
| ----------------- | --------- | ------------------------------------- |
| `graphite`        | `#0F1110` | Primary dark canvas / inverse surface |
| `carbon`          | `#151817` | Elevated dark surface                 |
| `ink`             | `#1C201E` | Deepest text on light canvas          |
| `ivory`           | `#F6F3EB` | Canvas in light mode                  |
| `cloud`           | `#F8F6F0` | Off-white plates / secondary canvas   |
| `mist`            | `#E9E4D8` | Hairline dividers                     |
| `stone`           | `#D9D4C7` | Inactive input borders                |
| `slate`           | `#6F756F` | Secondary text / muted icons          |
| `primary`         | `#007ACC` | **Brand primary** (CTAs, links, ring) |
| `primaryHover`    | `#0062A3` | Hover for primary controls (§2.0)     |
| `primaryDeep`     | `#005A9E` | Pressed / dark end of primary ramp    |
| `navy`            | `#0A2540` | Deep navy — executive emphasis (§2.0) |
| `tintBlue`        | `#EAF5FD` | Light tint — sparse selection/info (§2.0) |
| `darkAccent`      | `#3AA6F8` | Dark theme primary accent (§2.0)      |
| `darkPrimaryHover`| `#2B8FDC` | Dark pressed / gradient on dark canvas (mobile) |
| `emerald`         | `#0F8A5F` | **Success** / verified / positive     |
| `emeraldDeep`     | `#0A6E4C` | Success emphasis / dark success text  |
| `amber`           | `#A8792A` | Warning (never a highlight)           |
| `oxblood`         | `#7A2E2E` | Destructive (never decorative)        |

### 2.2 Semantic map (web)

These are the Tailwind CSS variables exposed by `business/app/globals.css`
and mirrored in `office/app/globals.css`:

| CSS variable        | Light (HSL)       | Dark (HSL)        | Tailwind class                  |
| ------------------- | ----------------- | ----------------- | ------------------------------- |
| `--background`      | `42 38% 97%`      | `120 6% 8%`       | `bg-background`                 |
| `--foreground`      | `135 7% 12%`      | `42 33% 95%`      | `text-foreground`               |
| `--card`            | `0 0% 100%`       | `120 7% 9%`       | `bg-card`                       |
| `--muted`           | `42 33% 92%`      | `135 5% 14%`      | `bg-muted`                      |
| `--muted-foreground`| `120 3% 45%`      | `42 15% 70%`      | `text-muted-foreground`         |
| `--border`          | `42 28% 85%`      | `135 5% 18%`      | `border-border`                 |
| `--primary`         | `204 100% 40%`    | `204 100% 52%`    | `bg-primary`, `text-primary`    |
| `--destructive`     | `0 45% 33%`       | `0 45% 45%`       | `bg-destructive`                |
| `--warning`         | `37 61% 41%`      | `37 61% 50%`      | `bg-warning`                    |
| `--success`         | `156 80% 30%`     | `156 80% 34%`     | `bg-success` (emerald)          |
| `--sidebar`         | `42 33% 95%`      | `120 6% 8%`       | `bg-sidebar`                    |
| `--sidebar-border`  | `42 28% 85%`      | `135 5% 16%`      | `border-sidebar-border`         |

**Rules for semantic usage:**

* `primary` (blue): primary action on a surface, links, and focus ring;
  active nav indicator. Do not use for generic “success” — use `success` /
  emerald. Do not paint whole cards or page backgrounds primary blue; use
  ivory/graphite and **light tint** (`#EAF5FD`) only where a cool highlight is
  needed.
* **Hover:** interactive hover for primary should track **hover blue**
  (`#0062A3`) once exposed as `--primary-hover` or equivalent — not an
  arbitrary `primary/90`.
* **Deep navy** (`#0A2540`): reserved for high-contrast brand moments, not
  default `text-foreground` on ivory (that remains ink/graphite via tokens).
* **Dark mode:** primary accent on dark surfaces should align with **dark mode
  accent** (`#3AA6F8`) for legibility; light mode stays on `#007ACC`.
* `destructive` / oxblood: only for destructive confirmations and failed
  status — **never** for debit amounts or expense categories.
* `warning` / amber: pending states, soft warnings. Never a success or
  "in progress".
* Neutrals (`muted`, `border`) carry all non-accent chrome.

### 2.3 Mobile palette (`mobile/src/theme/colors.ts`)

The mobile palette mirrors the web semantic map and exposes a React-native
object through `useThemeColors()`:

```ts
const palette = useThemeColors()

palette.primary.main      // Easner blue #007ACC
palette.semantic.card     // card bg (ivory / carbon)
palette.text.primary      // foreground (graphite / ivory)
palette.text.secondary    // slate on light, muted on dark
palette.semantic.border   // mist / ink border
palette.success.main      // emerald
palette.warning.main      // amber
palette.error.main        // oxblood
palette.cardGradients.premium // graphite→carbon wallet card
```

Always consume the palette via `useThemeColors()` — do **not** import
`lightColors` / `darkColors` directly from components.

---

## 3. Typography

### 3.1 Font families

| Family                 | Role                                 | Web module                | Mobile module                       |
| ---------------------- | ------------------------------------ | ------------------------- | ----------------------------------- |
| **Playfair Display**   | Display / balances / editorial       | `next/font/google`        | `@expo-google-fonts/playfair-display` |
| **Geist Sans**         | UI sans on web                       | `geist/font/sans`         | —                                   |
| **Geist Mono**         | Monospace (code, wallet addresses)   | `geist/font/mono`         | —                                   |
| **Inter**              | UI sans on mobile                    | —                         | `@expo-google-fonts/inter`          |

On mobile, load via `useFonts({ Inter_400Regular, …, PlayfairDisplay_700Bold })`
in `App.tsx`. Tailwind exposes `font-serif` for Playfair Display and `font-sans`
(default) for Geist Sans.

### 3.2 Web scale

| Utility / token | Family              | Weight | Size / line-height | Use                           |
| --------------- | ------------------- | ------ | ------------------ | ----------------------------- |
| `font-serif text-[44px] leading-[52px]` | Playfair Display | 500 | 44 / 52 | Hero balance                  |
| `font-serif text-[32px]`                | Playfair Display | 500 | 32 / 40 | Section title                 |
| `text-3xl font-semibold tracking-tight` | Geist Sans       | 600 | 28–32 / 36 | Page header                   |
| `text-lg font-semibold`                 | Geist Sans       | 600 | 18 / 28 | Card title                    |
| `text-sm`                               | Geist Sans       | 400–500 | 14 / 20 | Body                          |
| `text-xs text-muted-foreground`         | Geist Sans       | 400–500 | 12 / 16 | Meta                          |
| `text-[11px] uppercase tracking-[0.12em]` | Geist Sans     | 600    | 11 / 16 | Eyebrows / label caps         |

All monetary numbers use `tabular-nums` (wired through
`font-feature-settings: "tnum"` in `globals.css`).

### 3.3 Mobile scale (`mobile/src/theme/typography.ts`)

| Token              | Family           | Size | Weight | Use                      |
| ------------------ | ---------------- | ---- | ------ | ------------------------ |
| `balanceDisplay`   | Playfair Display | 48   | 700    | Dashboard hero balance   |
| `displaySerifXl`   | Playfair Display | 48   | 600    | Send-amount hero         |
| `displaySerifLg`   | Playfair Display | 36   | 600    | Wallet card balance      |
| `displaySerifMd`   | Playfair Display | 28   | 600    | FX "you receive" editorial |
| `headlineLarge`    | Inter            | 28   | 700    | Screen header            |
| `titleMedium`      | Inter            | 17   | 600    | Card title               |
| `bodyMedium`       | Inter            | 15   | 400    | Body                     |
| `labelSmall`       | Inter            | 11   | 600    | Eyebrows (uppercase)     |
| `currencyLarge`    | Inter            | 24   | 700    | Transaction row amount   |

---

## 4. Spacing, radius, shadows

### 4.1 Spacing (4 px grid)

`0, 1 (4), 2 (8), 3 (12), 4 (16), 5 (20), 6 (24), 7 (28), 8 (32), 10 (40), 12 (48), 16 (64), 20 (80), 24 (96)`

Premium surfaces prefer `p-6` / `p-8` (24–32 px) over the tighter defaults of
stock Shadcn. On mobile, cards typically use `spacing[5]` / `spacing[6]`.

### 4.2 Radius

| Token     | Value  | Use                                |
| --------- | ------ | ---------------------------------- |
| `sm`      | 8 px   | Dense chips / inline controls      |
| `md`      | 12 px  | Inputs, small cards                |
| `lg`      | 16 px  | Buttons                            |
| `xl`      | 20 px  | Inputs on web, form surfaces       |
| `2xl`     | 22 px  | Popovers, tooltips                 |
| `3xl`     | 28 px  | Dialogs, cards, panels             |
| `full`    | 9999   | Pills, avatars                     |

Web buttons use `rounded-xl` or `rounded-2xl`. Cards on web use
`rounded-3xl`. Mobile cards use `borderRadius['2xl']` (20 px) to feel
native-appropriate.

### 4.3 Shadows

Every shadow is pure graphite, no color bloom:

| Token          | Web class / CSS var          | Use                          |
| -------------- | ---------------------------- | ---------------------------- |
| `shadow-soft`  | `--shadow-card`              | Default card elevation       |
| `shadow-lift`  | `--shadow-lift`              | Hovered button / modal       |
| `shadow-inset` | `--shadow-inset`             | Subtle inner highlight       |

Mobile: `shadows.sm` (4 px), `shadows.md` (12 px), `shadows.lg` (24 px) from
`mobile/src/theme/shadows.ts`. Mobile tokens keep the API names
(`xs/sm/md/lg/xl/primary/success/glow/inner`) but are all graphite-based, and
`primary`/`success`/`glow` now resolve to the same soft graphite drop-shadow
(no colored glow).

---

## 5. Motion

| Token    | Value                      | Use                                      |
| -------- | -------------------------- | ---------------------------------------- |
| `instant`| 0 ms                       | No transition (intentional static)        |
| `fast`   | 150 ms ease-out            | Hover, focus                              |
| `normal` | 250 ms ease-out            | Button press, tooltip, dropdown           |
| `slow`   | 400 ms cubic-bezier        | Dialog enter/exit, sheet                  |
| `slower` | 600 ms cubic-bezier        | Page transition, hero reveal              |

Buttons nudge by `0.5px` on press (`active:translate-y-[0.5px]`) — the
only "physical" motion allowed on click.

---

## 6. Components

### 6.1 Web primitives (business + office)

All ship from `components/ui` on each app:

| Primitive      | Variants                                                                   | Notes |
| -------------- | -------------------------------------------------------------------------- | ----- |
| `Button`       | `default`, `primary`, `secondary`, `destructive`, `outline`, `ghost`, `link` | `primary` = Easner blue; `default` = graphite. Sizes `sm / default / lg / icon / icon-sm`. |
| `Card`         | `elevation: flat | soft | card | lift`                                     | Default `rounded-3xl border border-border/60 bg-card shadow-soft` |
| `Input`        | —                                                                          | `h-12 rounded-2xl border-border/70` with subtle inset highlight |
| `Badge`        | `neutral | emerald | amber | oxblood | slate | outline | solid`            | Emerald = success; amber = pending; oxblood = failed; slate = cancelled. |
| `Alert`        | `default | info | success | warning | destructive`                        | Soft background + hairline border |
| `Dialog`       | —                                                                          | `bg-graphite/60 backdrop-blur` overlay, `rounded-3xl` content |
| `AlertDialog`  | —                                                                          | Matches Dialog |
| `Table`        | —                                                                          | `h-12` rows, tabular figures, `hover:bg-muted/60` |
| `Tooltip` / `Popover` (office) | —                                                          | `rounded-2xl border-border/60 shadow-card` |
| `Avatar`       | —                                                                          | `rounded-full bg-muted ring-1 ring-border/60` |
| `sonner`       | —                                                                          | Card-like toast: `rounded-2xl bg-card`; success styling uses emerald / `success` |

### 6.2 Mobile primitives (`mobile/src/components/*`)

* `ui/Button.tsx` — primary blue, graphite secondary, ghost/outline.
* `ui/Surface.tsx` — themed card surface with border and radius.
* `ui/TextField.tsx` — 52 px tall, `borderRadius.xl`, mist/ink border.
* `ui/OtpCodeInput.tsx` — 6-cell input, focused ring matches `primary`.
* `BottomButton.tsx` — full-width primary CTA (primary intent).

### 6.3 Example patterns

Reference components live in:

* `business/components/examples/` — `BalanceCard`, `TransactionRow`,
  `TreasuryStatCard`, `FxConversionPanel`.
* `mobile/src/components/examples/` — `PremiumWalletCard`, `BalanceCard`,
  `TransactionRow`, `TreasuryStatCard`, `FxConversionPanel`.

They demonstrate:

* **Hero balance** — serif, tabular, 44 px web / 48 px mobile.
* **Positive delta** — typically success / emerald tone; no bright red for
  negative deltas.
* **Wallet card** — graphite gradient only; accent color on wordmark only.
  Physical vs virtual variant.

---

## 7. Charts

Use `business/components/charts/chart-primitives.tsx` which wraps `recharts`:

* `easnerChartColors` — monochrome palette; first series uses `chart-1`
  (primary blue) for the lead metric (balance, inflow).
* `easnerChartAxisProps` — graphite axis, `tabular-nums` tick label.
* `EasnerChartTooltip` — card-styled tooltip with hairline border.
* `BalanceSparkline` — tone-aware sparkline (positive = emerald, flat/negative
  = graphite).

Do not import colors directly — always pass the `easnerChart*` helpers.

---

## 8. Emails & PDFs

### 8.1 Transactional emails (`packages/server/lib`)

* `generateBaseEmailTemplate` — ivory canvas, white card, Playfair Display
  title, primary blue CTA button (pill shape), graphite body copy.
* Status badges are brand-mapped:
  * `status-pending`   → amber (`#FAF1DB`/`#8A6221`)
  * `status-processing`→ stone (`#EFECE2`/`#3D403D`)
  * `status-completed` → emerald (`#E6F4EC`/`#0A6E4C`)
  * `status-failed`    → oxblood (`#F4E5E5`/`#5F2424`)
  * `status-cancelled` → slate (`#EFECE2`/`#6F756F`)
* Dark-mode variant keeps primary blue CTA, graphite surfaces.

### 8.2 PDF documents (`business/components/*-pdf-document.tsx`)

Most `@react-pdf/renderer` stylesheets use graphite `#0F1110`, slate
`#6F756F`, ivory `#F6F3EB`, primary `#007ACC` for brand bars/accents;
success copy may still use emerald `#0F8A5F` where semantic. The autopay placard card
(`render-placard-pdf.tsx` / `render-placard-hd-png.ts`) uses a graphite
linear gradient (`#0F1110` → `#151817` → `#1C201E`) instead of the old
purple/indigo one.

---

## 9. How to consume

### 9.1 Web (business / office)

```tsx
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

<Card elevation="card">
  <h3 className="font-serif text-2xl font-medium tracking-tight">
    Total balance
  </h3>
  <p className="font-serif text-[44px] leading-[52px] tabular-nums">
    $248,190.32
  </p>
  <Badge variant="emerald">+2.14%</Badge>
  <Button variant="primary">Deposit</Button>
</Card>
```

### 9.2 Mobile

```tsx
import { BalanceCard, TransactionRow } from "@/components/examples"
import { useThemeColors, textStyles } from "@/theme"

const palette = useThemeColors()

<BalanceCard
  label="Total balance"
  amount={248190.32}
  deltaPct={2.14}
  primaryAction={{ label: "Deposit", onPress: handleDeposit }}
/>

<Text style={[textStyles.balanceDisplay, { color: palette.text.primary }]}>
  $248,190.32
</Text>
```

### 9.3 Dark mode

* **Web** uses `class="dark"` on `<html>` (managed by `next-themes`).
* **Mobile** uses `useColorScheme` + `AsyncStorage` via
  `ThemePaletteProvider` (`mobile/src/contexts/ThemePaletteContext.tsx`).
  Users can override the system preference (`system | light | dark`) —
  the choice is persisted. Native status bar, Android splash, and
  `NavigationContainer` theme all react to the resolved scheme.

---

## 10. Anti-patterns

* ❌ **SaaS blue overload** — full-width blue sections, blue page backgrounds,
  or blue-heavy marketing chrome. Reset to ivory/graphite; use primary blue
  and light tint sparingly.
* ❌ Off-palette blues, indigo, or purple gradients — use tokenized primary
  (`#007ACC`), hover (`#0062A3`), and §2.0 accents only.
* ❌ Neon/spring green (`#00D632`, `#34D399`) — emerald `#0F8A5F` only.
* ❌ `text-red-600` / bright `#EF4444` — use `text-destructive` or oxblood
  `#7A2E2E`.
* ❌ Hardcoded hex values in components — always go through tokens,
  Tailwind CSS variables, or `useThemeColors()`.
* ❌ Glassmorphism / frosted glass backgrounds.
* ❌ Colored shadows (`shadowColor: primary`) on mobile — shadows are always
  graphite.
* ❌ Mixing sans families — Geist on web, Inter on mobile, never both.

---

## 11. Source of truth

| File                                                         | Purpose                                |
| ------------------------------------------------------------ | -------------------------------------- |
| `packages/shared/src/design/tokens.ts`                       | Raw palette + HSL tuples + scales      |
| `business/app/globals.css` / `office/app/globals.css`        | Web CSS variables & Tailwind theme     |
| `business/components/ui/*` / `office/components/ui/*`        | Web component primitives               |
| `business/components/charts/chart-primitives.tsx`            | Chart wrappers                         |
| `business/components/examples/*` / `mobile/src/components/examples/*` | Reference compositions        |
| `mobile/src/theme/colors.ts`                                 | Mobile light + dark palettes           |
| `mobile/src/theme/typography.ts`                             | Mobile type scale                      |
| `mobile/src/theme/shadows.ts`                                | Mobile shadow scale                    |
| `mobile/src/contexts/ThemePaletteContext.tsx`                | Mobile theme provider / hooks          |
| `packages/server/lib/email-generator.ts`                     | Email CSS + template frame             |
| `business/lib/invoice-email-template.ts`                     | B2B invoice email (primary CTA)        |

When in doubt, read the example components in each app first — they show
the intended composition of tokens.
