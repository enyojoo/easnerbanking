# Direct Local Transfer

**Category · Product description · Competitive positioning**

| | |
|---|---|
| **Product name (customer-facing)** | Direct Local Transfer |
| **UI label** | Local Transfer |
| **Internal codename** | Through Local Currency (TLC) |
| **Status** | Shipped in Easner app; API productization planned |
| **Primary markets** | Africa, Asia, Latin America (emerging-market corridors) |
| **Last updated** | July 2026 |

---

## Category definition

**Direct Local Transfer** is cross-border money movement where the sender pays from **local money in country A** and the recipient receives **local money in country B** — in **one user action**, without funding a USD, EUR, GBP, or stablecoin wallet first.

**One-line category:**

> **Direct Local Transfer** — send from your local money, recipient gets their local money, one action. No wallet, no USD balance, no crypto.

Stablecoin settlement (USDC) powers the transfer behind the scenes. It is **not** part of the product story we sell externally.

```
Local fiat A in  →  stablecoin (invisible)  →  Local fiat B out
         ↑                                              ↑
    one user action                              one transaction ID
```

This is a **different product category** from wallet-first cross-border payout — not a feature variant of the same thing.

---

## Cross-border send models: Bucket A vs Bucket B

Cross-border products fall into two distinct models. The industry defaults to **Bucket A**. Easner **Direct Local Transfer** is **Bucket B**.

### Bucket A — Wallet-first (fund, then pay out)

The sender (or platform operator) holds a balance in hard currency or stablecoin **before** sending cross-border. Value is pre-funded; payout is a debit from that balance.

```
Fund USD/EUR/stablecoin wallet  →  debit balance  →  stablecoin settlement  →  local fiat out
```

| | |
|---|---|
| **Sender pays with** | USD, EUR, GBP, or stablecoin already on platform |
| **Typical flow** | Open account → onboard → fund wallet → wait for settlement → add recipient → create payout |
| **Capital required** | Yes — float sitting in wallet or treasury |
| **Mental model** | Treasury, payroll, "pay from balance" |
| **Who it fits** | Operators with hard-currency float, crypto-native businesses, Global North treasuries |
| **Examples** | Noah balance payout, BlindPay (stablecoin in → local out), Bridge virtual accounts, Conduit/Due treasury flows |

Most cross-border infrastructure — Noah, BlindPay, Bridge, Conduit treasury flows, Due balance flows — is optimized for Bucket A.

### Bucket B — Direct local-to-local (pay once, done)

The sender pays from **local money in country A** in a single action. Easner orchestrates settlement; the recipient receives **local money in country B**. No wallet pre-funding on the sender side.

```
Local fiat A in  →  stablecoin (invisible)  →  Local fiat B out
         ↑                                              ↑
    one user action                              one transaction ID
```

| | |
|---|---|
| **Sender pays with** | Local bank or mobile money (KES, NGN, GHS, etc.) |
| **Typical flow** | Recipient → amount → pay local → done |
| **Capital required** | **None** on sender side — no pre-funded USD/stablecoin wallet |
| **Mental model** | Remittance, "send home," pay the way you already pay |
| **Who it fits** | Emerging-market senders who earn and spend in local currency |
| **Easner product** | **Direct Local Transfer** (Local Transfer in UI) |

Bucket B is rarer as a productized consumer experience — especially with mobile money pay-in on the sender side in Africa and Asia. That is Easner's moat.

---

## Problem

Cross-border payment infrastructure is built for **Bucket A** — operators who already hold hard-currency float:

1. Open an account
2. Onboard to USD/EUR/stablecoin
3. Fund a wallet and wait for settlement
4. Add a recipient
5. Create a payout

That model fits treasuries, payroll platforms, and crypto-native businesses. It does **not** fit the majority of senders in emerging markets, who earn and spend in local currency (KES, NGN, GHS, UGX, etc.) and expect to send money the way they already pay — from a local bank account or mobile money wallet.

Those senders need **Bucket B**. Easner built Direct Local Transfer for them.

---

## Solution

Easner **Direct Local Transfer** lets a sender:

1. Choose a recipient in another country
2. Enter the amount the recipient should receive
3. Pay once from their local bank or mobile money
4. See one transaction, one price, one receipt until completion

The recipient receives local currency via bank transfer or mobile money on the destination side. The sender never sees or holds stablecoins.

### What the user experiences

| Step | Action |
|------|--------|
| 1 | Select recipient |
| 2 | Enter receive amount (destination currency) |
| 3 | Review locked rate, fees, and total to pay |
| 4 | Pay from local bank VA or authorize MoMo |
| 5 | Recipient receives local fiat |

**Transfer method shown in product:** `Local Transfer`

---

## Product hierarchy

```text
Easner Cross-Border
├── Direct Local Transfer          ← hero product for EM senders
│   └── Through Local Currency     ← internal / engineering name (TLC)
└── Balance Payout                 ← operator mode
    └── USD/EUR/GBP wallet → local payout via Noah or Yellowcard
```

| Mode | Customer label | Best for |
|------|----------------|----------|
| **Direct Local Transfer** | Local Transfer | Remittance, diaspora, EM senders without hard-currency float |
| **Balance Payout** | Balance payout | Operators, treasuries, users with USD/EUR/GBP on Easner |

Lead with **Direct Local Transfer** in positioning. **Balance Payout** remains the power-user path for float holders and Global North operators.

---

## Two Easner send modes

| | **Direct Local Transfer (TLC)** | **Balance Payout** (Noah / YC) |
|---|---|---|
| **Who it's for** | Emerging-market senders living in local currency | Operators with USD/EUR/GBP float |
| **Sender action** | Pay local fiat once (bank / MoMo) | Fund wallet → pick balance → pay out |
| **Steps** | Recipient → amount → pay local → done | Deposit → wait → recipient → debit balance → pay out |
| **Capital required** | **None** — no pre-funded wallet | Yes — balance sitting idle |
| **Mental model** | Remittance / "send home" | Treasury / "pay from float" |
| **Stablecoin role** | Invisible bridge between two local legs | Settlement after wallet debit |
| **Eligibility API field** | `throughLocalCurrency` | `balancePayout` |

Both modes share recipients, KYC, ledger, and transaction lifecycle — but serve **different sender behaviors**.

---

## How it works (technical summary)

Direct Local Transfer is a **dual-leg orchestrator** built on licensed local payment rails. The customer sees one transfer; Easner coordinates two settlement legs and an internal USDC bridge.

```text
Sender (country A)          Easner                         Recipient (country B)
      │                       │                                    │
      │  Pay local fiat         │                                    │
      ├──────────────────────►  │  Leg 1: local pay-in (YC receive)  │
      │  (bank / MoMo)          │         ↓                          │
      │                       │  USDC → omnibus (Turnkey / Solana)   │
      │                       │         ↓                          │
      │                       │  Leg 2: local payout (YC send)       │
      │                       ├───────────────────────────────────►  │
      │                       │                                    │  Receives local fiat
      │  One ETID, one lifecycle, webhooks through completion      │
```

### Lifecycle

| Phase | Description |
|-------|-------------|
| **Quote (preview)** | Pricing only — no rail submission, no ledger lock |
| **Confirm (lock)** | Both YC legs quoted and locked; transaction + pay-in instructions created |
| **Leg 1 pay-in** | Sender deposits local fiat; YC converts to USDC → Easner omnibus |
| **Leg 1 settled** | Omnibus inbound triggers leg 2 automatically |
| **Leg 2 payout** | USDC sent to YC send wallet; recipient receives local fiat |
| **Complete** | Ledger settled, fees swept, customer notified |

### Key engineering capabilities

- **Locked dual-leg pricing** — customer cross-rate fixed; pay-in amount solved to cover leg 2 + fees before sender pays
- **Zero YC USD wallet float** — value flows through Easner omnibus, not a pre-funded partner wallet
- **Single transaction ID (ETID)** — one lifecycle from quote through completion
- **Corridor eligibility engine** — residence, cross-rate, pay-in rail, and recipient payout channel gating
- **Failure handling** — leg 1 vs leg 2 failure paths, refund routing, ops alerts

### Supported pay-in currencies (sender residence)

NGN, KES, GHS, ZAR, UGX, TZS, RWF, MXN, BRL, ARS, COP, CLP — subject to corridor enablement and active cross-rates.

### Pay-in rails

- Bank transfer (virtual account / bank deposit instructions)
- Mobile money (network + phone authorization)

### Internal references

- Orchestrator: `business/lib/yellowcard/cross-border-orchestrator.ts`
- Eligibility: `business/lib/yellowcard/cross-border-eligibility.ts`
- Pricing: `packages/shared/src/yc-pricing.ts` (`computeYcCrossBorderPricing`)

---

## Competitive moat

Direct Local Transfer is defensible across five layers: orchestration, UX, EM-native corridors, zero float, and embedded banking.

### 1. UX moat — one action vs wallet-first

**Wallet-first (industry default):** fund → wait → recipient → payout.

**Direct Local Transfer:** recipient → amount → pay local → done.

> **Claim:** We built remittance UX for people who earn and spend in local currency — not for people who already hold hard-currency float.

### 2. Capital moat — no float, no pre-funding

Yellowcard's documented cross-border integration is two-step: receive local fiat → credit partner USD wallet → send local fiat. Wallet-first APIs typically require treasury or stablecoin balance before payout.

Easner locks leg 2 at confirm, collects leg 1 local pay-in, bridges via omnibus USDC, and triggers leg 2 automatically. The sender never holds USD; Easner does not require YC USD wallet float for this flow.

> **Claim:** Zero-balance cross-border — we move value through the corridor, not from your wallet.

### 3. Pricing moat — locked dual-leg quote

Both YC legs are locked at confirm. One ETID. One lifecycle. What the customer sees at quote is what the recipient gets.

Raw rail integrations leave leg risk between receive and send. Wallet-first APIs leave FX risk between fund and payout.

> **Claim:** What you see at quote is what the recipient gets — both legs locked before the sender pays.

### 4. Corridor moat — EM-native rails, both sides

Not USD ACH in → PIX out. **MoMo in Kenya → bank in Nigeria.** Bank in Ghana → MoMo in Uganda.

Operational IP includes corridor matrix, pay-in limits, cross-rate management, leg failure handling, and refund routing — not available from a single rail API call.

> **Claim:** Cross-border over mobile money and local banks — built for corridors where Wise and Bridge don't start.

### 5. Platform moat — banking + orchestration

Direct Local Transfer lives inside Easner's ledger, recipients, KYC, transaction detail, and notification lifecycle — not as a bolt-on payout API.

The dual-mode stack (Direct Local Transfer + Balance Payout) serves both EM remittance senders and hard-currency operators on one platform.

> **Claim:** One platform: operate in hard currency when you have float; send from local money when you don't.

---

## Market reality

### Who already does Bucket B

**Consumer remittance apps** — Wise, Remitly, WorldRemit, Sendwave, Lemfi, Chipper, and others — offer local pay-in and local payout in one sender action.

**B2B infrastructure** — [Conduit](https://conduitpay.com/send), [Due](https://www.opendue.com/), [Merge](https://www.merge.money/products/stablecoin-api), and similar providers offer fiat A → fiat B with stablecoin settlement behind a single API or workflow.

**Raw rail providers** — Yellowcard, Onafriq, and others expose pay-in and payout primitives separately; partners integrate both legs themselves.

### Easner's position

| Claim | |
|-------|---|
| First banking platform with Bucket B as the core send flow | Strong |
| Productized Bucket B on YC rails without partner USD wallet float | Strong |
| Dual-mode platform: Bucket B + Bucket A in one product | Strong |
| Early in EM MoMo/bank pay-in → cross-border local payout as operator banking | Reasonable |

Easner is early in **operator-grade Direct Local Transfer for emerging markets** — embedded in banking, zero sender float, locked dual-leg pricing, MoMo + bank on both sides.

### Positioning

> Bucket B exists in remittance apps and B2B infra. Easner productizes it for emerging-market senders inside a banking platform — without requiring a dollar wallet. One local payment, one locked price, one receipt.

> Easner makes Bucket B the core of a neobank for emerging markets: zero sender float, locked dual-leg pricing, MoMo + bank on both sides.

### Positioning matrix

| Segment | What they sell | Easner's angle |
|---------|----------------|----------------|
| Remittance apps (Wise, Remitly, Lemfi) | Standalone send-home UX | Banking + send — accounts, recipients, ledger, Bucket A and B |
| B2B infra (Conduit, Due, Merge) | API for developers to embed | Productized operator experience |
| Wallet-first APIs (Noah, BlindPay, Bridge) | Fund balance → pay out | No balance required — pay from local money at send time |
| Raw rails (Yellowcard) | Leg 1 + leg 2 separately | One orchestrated flow — dual-leg lock, omnibus bridge, single ETID |

### External messaging guardrails

- Lead with **Direct Local Transfer**, not stablecoin orchestration or rail provider names.
- Position as **banking-native Bucket B for EM**, not as the only local-to-local product in the market.

---

## Competitive landscape

| | **Easner Direct Local Transfer** | **Wallet-first (Noah, BlindPay, Bridge, Conduit treasury)** | **Raw Yellowcard** |
|---|---|---|---|
| Sender pays with | Local bank / MoMo | USD/EUR/stablecoin balance | Local (leg 1 only) |
| Recipient gets | Local fiat | Local fiat | Local fiat (leg 2 only) |
| User steps | **One transfer** | Fund → pay out | Partner builds 2-step integration |
| Pre-funding | **None** | Required | YC USD wallet between legs |
| Rate lock | Both legs at confirm | At payout time | Per leg |
| Best for | EM remittance, diaspora without USD | Treasury, payroll, crypto-native | Rail partners building own product |

**Closest global comp:** [Conduit](https://conduitpay.com/send) and [Due](https://www.opendue.com/) — unified fiat-to-fiat infra APIs. Easner differentiates with operator banking UX, zero sender float, and EM MoMo + bank pay-in as the hero flow.

---

## Messaging

### Primary tagline

**Send local. Receive local. One transfer.**

### Alternative taglines

- Cross-border without a dollar wallet.
- Remittance for emerging markets — not expat banking.
- Direct Local Transfer — the way people actually send money home.

### Messaging pillars

1. **One action** — not fund-then-send
2. **Local in, local out** — not dollar in, local out
3. **Zero float** — not pre-funded wallet
4. **Locked price** — not leg-by-leg FX risk
5. **Emerging-market native** — MoMo + local banks, both sides

### Elevator pitch (30 seconds)

> Easner lets people in Africa and emerging markets send money cross-border the way they already pay — from local bank or mobile money — and recipients get local currency on the other side. One action, one price, one receipt. No USD wallet, no stablecoin, no pre-funding. We orchestrate licensed local rails and stablecoin settlement behind the scenes. Everyone else makes you fund a balance first. We built the product for people who earn in shillings and naira, not dollars.

### Investor framing

| | |
|---|---|
| **Category** | Direct Local Transfer infrastructure for emerging markets |
| **Problem** | Cross-border infra assumes hard-currency float; most EM senders don't operate that way |
| **Solution** | Single-transaction local A → local B with invisible stablecoin bridge, zero sender float |
| **Defensibility** | Dual-leg orchestration + pricing engine + corridor ops + embedded banking UX |
| **TAM wedge** | Africa / LatAm / Asia corridors where wallet-first APIs don't match sender behavior |

### Developer / B2B API pitch (productization)

> **Direct Local Transfer API** — quote → confirm → pay-in instructions → status webhooks → completed.
>
> Unlike payout APIs that require a funded balance, Easner collects from the sender's local rail and delivers to the recipient's local rail in one orchestrated flow. Built for NGN→KES, GHS→UGX, and emerging-market corridors.

Planned surface (not yet public):

```text
POST /v1/transfers/direct-local/quote      Preview pricing
POST /v1/transfers/direct-local/confirm    Lock legs, return pay-in instructions
GET  /v1/transfers/direct-local/{id}       Transfer status
POST /v1/webhooks/direct-local             Lifecycle events
```

Current internal endpoints (session-scoped, pre-productization):

```text
GET  /api/yellowcard/eligibility
POST /api/yellowcard/cross-border/quote
POST /api/yellowcard/cross-border/confirm
```

---

## One-slide summary

**Easner Direct Local Transfer**

- **What:** Cross-border send from local money → recipient's local money, one transaction
- **Who:** Senders in Africa, Asia, and LatAm who don't hold USD/EUR wallets
- **How:** Licensed local pay-in + invisible USDC bridge + licensed local payout — orchestrated by Easner
- **Why us:** No wallet pre-funding · locked dual-leg price · MoMo + bank both sides · banking + remittance in one product
- **Vs industry:** Others make you fund a balance first. We built for people who send from M-Pesa, not from a dollar account.

---

## Naming conventions

| Context | Use |
|---------|-----|
| Marketing, sales, investor materials | **Direct Local Transfer** |
| Customer-facing UI | **Local Transfer** |
| Engineering, runbooks, code, metadata | **Through Local Currency (TLC)**, `cross_border_send`, `yc_mode: cross_border_send` |
| Avoid in external copy | "Stablecoin orchestration," "YC cross-border," "TLC" |

---

## Productization roadmap

Direct Local Transfer is **shipped** in the Easner consumer/business app. The following items define the path from internal capability to external product:

| Phase | Deliverable |
|-------|-------------|
| **Now** | In-app Local Transfer across enabled corridors; internal orchestrator + eligibility + pricing |
| **Next** | Public API (`/v1/transfers/direct-local/*`) with API keys, webhooks, and developer docs |
| **Next** | Corridor matrix published externally (countries, rails, limits, SLAs) |
| **Future** | White-label / partner embedding for remittance apps and diaspora neobanks |
| **Future** | Sandbox environment mirroring production corridor behavior |
