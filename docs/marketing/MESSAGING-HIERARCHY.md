# Messaging Hierarchy

Last updated: June 8, 2026

Headlines, pillars, audiences, and CTAs aligned with the **live website** ([`lib/marketing/content/`](../lib/marketing/content/)). When this file and the site differ, the site wins.

---

## Company

**One-liner:** Stablecoin Banking Infrastructure for Global Businesses

**Home title (live):** Easner – Stablecoin Banking for Global Businesses

**Home description (live):** Stablecoin-powered accounts, payouts, collections, cards, and partner programs. Familiar banking screens with compliance built in.

**Elevator (2 sentences):** Easner gives businesses and individuals compliant, banking-simple tools for global money movement. Stablecoin infrastructure powers settlement behind the scenes — users get familiar accounts, payouts, and collections without crypto complexity.

**Deck anchor:** Stablecoins solved settlement; Easner solves UX, friction, and compliance.

---

## Four pillars (homepage)

Live source: `whyEasnerPillars` in [`home.ts`](../lib/marketing/content/home.ts). Section headline: **Why teams choose Easner**

| Pillar | Headline | Body |
|--------|----------|------|
| **Banking-simple UX** | No crypto complexity | Send, receive, invoice, and manage money in screens that feel like banking – not a trading app. |
| **Lower-cost rails** | Move more, spend less | Modern settlement can reduce cross-border cost vs legacy paths – up to ~60% in supported flows. |
| **Compliance-ready** | Built in from day one | KYC/KYB, AML screening, limits, and transaction controls are built in from day one. |
| **Invisible infrastructure** | Speed without the noise | Stablecoin speed and global reach sit behind fiat-native screens. |

---

## Four audiences

Live source: `solutionsPersonas` in [`home.ts`](../lib/marketing/content/home.ts). Section headline: **Built for how you move money**

| Audience | One-liner | Primary product | Page |
|----------|-----------|-----------------|------|
| **Freelancers, remote workers, diaspora** | Get paid globally. Keep more locally. | Easner Personal Banking · Easner Mobile | `/personal` |
| **Cross-border SMEs and trade** | Run global operations from one dashboard. | Easner Business Banking · Easner Business | `/business` |
| **OTC and money transfer agents** | Compliance-ready transfers under your brand. | Easner for Partners · Agency Model | `/partners` |
| **Developers and platforms** | Embed global rails without building compliance. | Easner for Partners · Developer Model | `/developers` |

---

## Product messages (live hero headlines)

| Product | Route | Hero headline (live) |
|---------|-------|----------------------|
| Home | `/` | Global banking, Simplified. |
| Personal Banking | `/personal` | Global banking in your pocket |
| Business Banking | `/business` | Global banking for business |
| Stablecoin Payments | `/stablecoin` | Stablecoin speed |
| Invoicing | `/invoicing` | Invoice globally and get paid |
| Cards | `/cards` | Cards for payment |
| Partners | `/partners` | Branded cross-border products on Easner |
| Developers | `/developers` | Compliant rails in your product |

---

## CTA matrix (live)

| Page / audience | Primary CTA | Destination |
|-----------------|-------------|-------------|
| Home | Open Account | `#` (open-account action) |
| Home (secondary) | Explore products | `#products` |
| Personal | App Store / Google Play | `{APP_STORE_URL}` / `{PLAY_STORE_URL}` |
| Business | Open Business account | `{BUSINESS_SIGNUP_URL}` (external) |
| Business (secondary) | See invoicing | `/invoicing` |
| Stablecoin | Open Business account | `{BUSINESS_SIGNUP_URL}` (external) |
| Invoicing | Start invoicing | `{BUSINESS_SIGNUP_URL}` (external) |
| Cards | Open Account | `#` (open-account action) |
| Partners | Talk to our team | `/contact` |
| Partners (secondary) | Developer Model | `/developers` |
| Developers | Talk to our team | `/contact` |
| Developers (secondary) | Agency Model | `/partners` |
| OTC / money transfer agents (homepage) | Talk to our team | `/partners` |
| Developers and platforms (homepage) | Explore developers | `/developers` |

---

## Corridor narrative (homepage)

**Headline (live):** Expanding where global business meets emerging markets  
**Body (live):** Hold USD, EUR, and GBP from global markets, then pay out locally across Africa and the region – for salaries, supplier payments, and cross-border trade.

Always pair corridor claims with: *Availability depends on verification, jurisdiction, and partner enablement.*

---

## SEO keywords (live metadata)

| Route | Primary keywords |
|-------|------------------|
| `/` | stablecoin banking infrastructure, cross-border payments, global business banking |
| `/personal` | personal international transfers, diaspora banking app, global mobile banking |
| `/business` | business banking cross-border, SME global payments, multi-currency business account |
| `/stablecoin` | stablecoin payments infrastructure, USDC business payments, invisible stablecoin |
| `/invoicing` | international invoicing, invoice stablecoin pay-in, global B2B collections |
| `/cards` | corporate cards global business, virtual cards SME, spend controls, business expense cards |
| `/partners` | white-label remittance, OTC money transfer, branded cross-border payments, agency banking infrastructure |
| `/developers` | stablecoin API, embedded payments API, fintech infrastructure API |

**Redirect:** `/apis` → 301 → `/developers`

---

## Title tag convention

Match existing product pages (`Business Banking — Easner`, `Invoicing — Easner`): short product name + `— Easner`. Model names belong in meta descriptions and on-page copy, not in `<title>` tags.

| Page | `<title>` | Marketing program name |
|------|-----------|------------------------|
| `/partners` | Partners — Easner | Easner for Partners |
| `/developers` | Developers — Easner | Easner for Partners |

---

## Problem stats (deck — use with care)

| Stat | Source | Guardrail |
|------|--------|-----------|
| $205B+ on-chain crypto value to Africa (2025) | Deck | Market context only; not Easner volume |
| 43% stablecoins share of Africa crypto txns | Deck | Market context |
| 12%+ remittance fees in expensive corridors | Deck | Pair with Easner value prop; no competitor naming |
| 5+ days traditional transfer delays | Deck | Contrast with fast settlement; not "instant" |

**Do not publish** Easner processed volume (~$980K) unless leadership re-approves.
