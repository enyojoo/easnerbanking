# App Store — iOS (Easner)

Last updated: June 8, 2026

Source of truth for **Easner** on the Apple App Store. Paste fields into App Store Connect; keep aligned with [`personal.md`](personal.md), [`VOICE-AND-GUARDRAILS.md`](VOICE-AND-GUARDRAILS.md), and [`docs/legal/`](../legal/).

Same workflow as website marketing docs: draft here, paste into App Store Connect, update `{APP_STORE_URL}` in [`README.md`](README.md) after approval.

---

## Naming

See [`NAMING.md`](NAMING.md) for the full product naming ladder.

| Context | Name |
|---------|------|
| **App Store / home screen** | **Easner** |
| **Consumer product (marketing)** | **Easner Personal Banking** |
| **Consumer app** | **Easner Mobile** |
| **Business product (marketing)** | **Easner Business Banking** |
| **Business web dashboard** | **Easner Business** |
| **P2P handle** | **EASETAG** — not "Easner tag" |

**Rule for App Store listing copy:** Use **Easner** as the public App Store name. In notes or internal refs, say **Easner Mobile** delivers **Easner Personal Banking**. Do not use retired name **Easner Personal**.

---

## App metadata

| Field | Value |
|-------|-------|
| **App Name** | Easner |
| **Subtitle** (30 chars max) | Global banking in your pocket. |
| **Bundle ID** | `com.easner.mobile` |
| **SKU** | `easner-ios` |
| **Version** | `1.0.1` (see [`mobile/app.json`](../../mobile/app.json)) |
| **Primary Category** | Finance |
| **Secondary Category** | Business |
| **Content Rights** | Does not contain third-party content |
| **Price** | Free |
| **Copyright** | © 2026 Easner Group, Inc. |

### URLs

| Field | URL |
|-------|-----|
| **Privacy Policy** | `https://www.easner.com/privacy` |
| **Terms of Use (EULA)** | Apple Standard EULA, or `https://www.easner.com/terms` if using custom EULA |
| **Support URL** | `https://www.easner.com/personal` |
| **Marketing URL** | `https://www.easner.com/personal` |

### Placeholders to replace before publish

| Placeholder | Value |
|-------------|-------|
| `{APP_STORE_URL}` | Apple App Store link after approval |
| `{REVIEW_EMAIL}` | App Review contact email |
| `{REVIEW_PASSWORD}` | Demo account password |
| `{REVIEW_PIN}` | Demo account PIN (if enabled) |

---

## Promotional text

Editable anytime in App Store Connect without a new build. **170 characters max.**

```
Send and receive money across global corridors. USD and EUR accounts, bank and stablecoin pay-in and pay-out — fees and rates shown before you confirm.
```

*(147 characters)*

---

## Description

**4000 characters max.** Paste into App Store Connect → App Information → Description.

```
Easner is your mobile app for sending, receiving, and managing money across global and African corridors — bank transfers and stablecoin, with compliance built in.

GLOBAL BANKING IN YOUR POCKET
Manage multi-currency balances, send to saved recipients, receive by virtual account details or stablecoin deposit address, and track every transaction in one place.

SEND MONEY YOUR WAY
Send by bank transfer, stablecoin, open banking, or mobile money. See fees, FX, and delivery estimates before you confirm.

RECEIVE WITH CLARITY
Get paid using virtual account details or a stablecoin deposit address — choose Bank or Stablecoin on the Receive tab. No external crypto wallet setup required.

RECIPIENTS & EASETAG
Save recipients, send by EASETAG (@handle), and move money between people you trust.

SECURITY YOU CAN USE
Multi-factor authentication, PIN, and biometric unlock on supported devices.

PRODUCT TIERS
• Tier 1 — Global banking: USD and EUR accounts, pay-in and pay-out, and stablecoin flows.
• Tier 2 — African banking: NGN and regional pay-in and pay-out.
• Tier 3 — Cards: Personal debit/credit cards when approved.

COMPLIANCE BUILT IN
Hosted identity verification through licensed partners. AML and sanctions screening on customers and transactions.

WHO IT'S FOR
Individuals 18 or older — freelancers, remote workers, diaspora, students, and families managing cross-border money.

IMPORTANT
Easner Group, Inc. is a financial technology company, not a bank or investment adviser. Banking, payment, verification, and card services available through the Easner mobile app are provided by licensed partners. Easner does not provide investment, legal, tax, or financial advice.

Easner is not FDIC-insured and does not hold customer deposits. Banking services are provided by third-party banking partners, not by Easner.

Stablecoin and wallet features are supported through infrastructure partners and may operate on public blockchains. Digital assets are not legal tender, are not backed by a government, and are not FDIC-insured or protected by SIPC. Blockchain transactions may be public and irreversible.

Corporate and personal card products are issued by a third-party issuer and are subject to credit approval.

Fees and FX may apply. Processing times vary by corridor, partner, and compliance review — often minutes to hours, not guaranteed. Some features depend on your verification status, jurisdiction, and product tier.

Questions? support@easner.com
Legal: easner.com/terms · easner.com/privacy · easner.com/kyc-policy
```

---

## Keywords

**100 characters max.** Comma-separated, no spaces after commas.

```
send money,remittance,banking,transfer,USD,EUR,global,diaspora,receive,payments,multi-currency
```

*(94 characters)*

---

## What's New

For version **1.0.1** (first public App Store release):

```
Welcome to Easner.

• Send and receive money across global corridors
• USD and EUR accounts with fees and rates shown before you confirm
• Bank and stablecoin receive options
• Save recipients and send by EASETAG
• Identity verification, PIN, MFA, and biometric unlock
• Transaction history and in-app support
```

---

## Screenshots

### Required sizes

| Device | Size (px) | Notes |
|--------|-----------|-------|
| **iPhone 6.7"** (required) | 1290 × 2796 | iPhone 15 Pro Max, 14 Pro Max |
| iPhone 6.5" (optional) | 1284 × 2778 | Broader device coverage |

App is iPhone-only (`supportsTablet: false` in app.json). No iPad screenshots required.

### Recommended screens (in order)

| # | Screen | Visual reference |
|---|--------|------------------|
| 1 | Dashboard — balances, Send / Receive | `mkt-ui-personal-receive` tone |
| 2 | Send Money — amount, corridor, fees visible | `mkt-ui-personal-send` |
| 3 | Receive — Bank \| Stablecoin tabs | `mkt-ui-personal-receive` |
| 4 | Recipients — saved list + EASETAG | `mkt-ui-personal-recipients` |
| 5 | Transaction history | — |
| 6 | Security / Profile — MFA, PIN, or verification status | `mkt-icon-security` |

**Design rules:** Light theme, no crypto coin imagery, no "zero fees" or "instant" overlay text. See [`VISUAL-SPEC.md`](VISUAL-SPEC.md).

**Demo account vs screenshots:** The App Review demo account (`review+ios@easner.com`) has **KYC not verified**, so Send/Receive will show verification gates — that is correct for review. For **App Store screenshots**, capture from a **separate KYC-approved internal account** (or staging) so marketing images show balances, Receive details, and Send confirm with fees. Do not misrepresent features the unverified demo cannot access.

Use realistic (non-sensitive) data for captures.

---

## App Review Information

| Field | Value |
|-------|-------|
| **Sign-in required** | Yes |
| **Demo username** | `review+ios@easner.com` |
| **Demo password** | `{REVIEW_PASSWORD}` |
| **Demo KYC status** | **Not verified** — intentional; reflects a new user before identity approval |
| **Contact email** | `{REVIEW_EMAIL}` |
| **Contact phone** | Your App Review contact |

### Notes for reviewer

Paste into App Store Connect → App Review Information → Notes:

```
Easner is a financial technology app for individuals 18+ in supported jurisdictions. Easner is not a bank — regulated banking, payment, and verification services are provided by licensed partners.

DEMO ACCOUNT (KYC NOT VERIFIED)
Email: review+ios@easner.com
Password: {REVIEW_PASSWORD}
PIN (if prompted): {REVIEW_PIN}

This demo account is registered and can sign in, but identity verification (KYC) is intentionally NOT completed. This matches the experience of a new user before Tier 1 approval. Please sign in with email and password.

WHAT YOU CAN TEST WITHOUT KYC
1. Sign in → complete or skip PIN setup if prompted.
2. Dashboard → “Verify identity to unlock banking” banner is expected.
3. More → Account verification → Tier 1 screen, status, and “Start” to open the hosted verification flow (Noah). You do not need to submit real government ID — closing the flow is fine.
4. More → Profile, Security (MFA/PIN), Legal (Privacy, Terms), Support (live chat or support@easner.com).
5. Receive → gated state prompting verification (no virtual account or deposit address until KYC is approved).
6. Send → verification notice when attempting regulated send paths; gating is expected.
7. Recipients, transaction list, and app navigation.

WHAT REQUIRES KYC (NOT AVAILABLE ON THIS DEMO ACCOUNT)
• Live send/settlement on bank, stablecoin, open banking, or mobile money rails
• Virtual account details and stablecoin deposit addresses on Receive
• Partner-provisioned balances and payout quotes

KYC IN PRODUCTION
New users complete hosted identity verification with a licensed partner (Noah). Approval typically takes 1–3 business days. Regulated features unlock after noah_kyc_status is approved.

If you need a KYC-approved account to test live money movement, contact us before or during review and we will provide separate credentials within one business day.

STABLECOIN
After KYC approval, stablecoin receive uses partner-managed infrastructure. Users do not need an external crypto wallet. Digital assets are not legal tender and are not FDIC-insured.

GEOGRAPHIC AVAILABILITY
Onboarding is limited to supported jurisdictions per our KYC policy. Prohibited jurisdictions are blocked at registration.

CONTACT
Review questions: {REVIEW_EMAIL}
Support: support@easner.com
```

---

## App Privacy (Nutrition Labels)

Complete in **App Store Connect → Apps → Easner → App Privacy**. Cross-check [`privacy-policy.md`](../legal/privacy-policy.md). Apple shows answers on the public App Store page as your **Privacy Nutrition Label**.

Last reviewed against App Store Connect privacy categories (2026).

### How to fill the questionnaire

1. **App Privacy → Get Started** (or **Edit** if already started).
2. **Do you or your third-party partners collect data from this app?** → **Yes**.
3. For **each data type below marked Collect = Yes**, click **Edit**, select the subtype, then answer:
   - **Is this data linked to the user’s identity?** → use **Linked** column below.
   - **Do you or your third-party partners use this data for tracking?** → **No** for all types (no IDFA, no cross-app ad tracking).
   - **Purposes** → check only the purposes listed in the **Purposes** column (Apple’s exact labels).
4. When Apple asks whether data is collected by **you**, **third-party partners**, or **both** → use **Collected by** column.
5. After all types are set, click **Publish** on the App Privacy page.

**Tracking (app level):** **No** — Easner does not track users across apps or websites owned by other companies for advertising. PostHog and Intercom are first-party service providers, not “tracking” under Apple’s definition when not used for cross-context ads.

**Privacy Nutrition Label URL (after publish):** shown on the App Store listing under App Privacy.

---

### Master matrix — all Apple data types

Use this table row-by-row in App Store Connect. **Collect = No** → skip that subtype in the wizard (do not add it).

| Category | Apple subtype | Collect | Linked | Tracking | Purposes (Apple labels) | Collected by | What Easner collects |
|----------|---------------|---------|--------|----------|-------------------------|--------------|----------------------|
| **Contact Info** | Name | **Yes** | Yes | No | App Functionality | You + Partners | Full legal name at signup, profile, KYC (Noah) |
| **Contact Info** | Email Address | **Yes** | Yes | No | App Functionality | You + Partners | Account email, Apple/Google sign-in email, support |
| **Contact Info** | Phone Number | **Yes** | Yes | No | App Functionality | You + Partners | Profile phone, verification/SMS where used |
| **Contact Info** | Physical Address | **Yes** | Yes | No | App Functionality | You + Partners | Residential address from KYC / profile |
| **Contact Info** | Other User Contact Info | **Yes** | Yes | No | App Functionality | You | Country of residence, EASETAG (@handle) |
| **Health & Fitness** | Health | No | — | — | — | — | Not collected |
| **Health & Fitness** | Fitness | No | — | — | — | — | Not collected |
| **Financial Info** | Payment Info | **Yes** | Yes | No | App Functionality | You + Partners | Bank details, payment instructions, virtual account numbers, payout rails |
| **Financial Info** | Credit Info | No | — | — | — | — | No credit scores or credit reports collected at launch |
| **Financial Info** | Other Financial Info | **Yes** | Yes | No | App Functionality | You + Partners | Balances, amounts, currencies, FX, fees, wallet/deposit addresses, transaction hashes, counterparties, source-of-funds answers |
| **Location** | Precise Location | No | — | — | — | — | App does not request GPS / precise location |
| **Location** | Coarse Location | **Yes** | Yes | No | App Functionality | You | Approximate location derived from IP or device region for security, fraud, and compliance |
| **Sensitive Info** | Sensitive Info | **Yes** | Yes | No | App Functionality | You + Partners | Government ID numbers, date of birth, nationality, tax identifiers, occupation/source-of-funds, liveness/selfie verification data, sanctions/PEP screening results |
| **Contacts** | Contacts | No | — | — | — | — | App does not read the device address book |
| **User Content** | Emails or Text Messages | No | — | — | — | — | App does not read user email or SMS inboxes |
| **User Content** | Photos or Videos | **Yes** | Yes | No | App Functionality | You + Partners | Profile avatar (photo library), KYC ID/selfie (camera), manual send receipt uploads (document picker) |
| **User Content** | Audio Data | **Yes** | Yes | No | App Functionality | Third-party partner | Voice messages in Intercom live chat when user records audio |
| **User Content** | Gameplay Content | No | — | — | — | — | Not applicable |
| **User Content** | Customer Support | **Yes** | Yes | No | App Functionality | You + Third-party partner | Support tickets, live chat messages, email to support@easner.com linked to account |
| **User Content** | Other User Content | **Yes** | Yes | No | App Functionality | You | Payment notes, recipient labels, uploaded compliance documents |
| **Browsing History** | Browsing History | No | — | — | — | — | Not collected (in-app legal links only; no browsing history stored) |
| **Search History** | Search History | No | — | — | — | — | In-app recipient/transaction search is not retained as “search history” for ads |
| **Identifiers** | User ID | **Yes** | Yes | No | App Functionality, Analytics | You + Third-party partners | Supabase user UUID, PostHog distinct ID, Intercom user ID |
| **Identifiers** | Device ID | **Yes** | Yes | No | App Functionality | You + Third-party partners | Expo/APNs push token, device model/OS in logs and analytics |
| **Purchases** | Purchase History | No | — | — | — | — | No App Store IAP; retail purchase history not applicable (transactions are **Financial Info**) |
| **Usage Data** | Product Interaction | **Yes** | Yes | No | Analytics, App Functionality | You + Third-party partner | Screen views, taps, feature usage, auth events (PostHog) |
| **Usage Data** | Advertising Data | No | — | — | — | — | Not collected |
| **Usage Data** | Other Usage Data | **Yes** | Yes | No | Analytics, App Functionality | You + Third-party partner | IP address, session timestamps, deep-link opens, app lifecycle events |
| **Diagnostics** | Crash Data | **Yes** | Yes | No | App Functionality | You + Third-party partner | Crash and error events (PostHog `error_occurred`, platform logs) |
| **Diagnostics** | Performance Data | **Yes** | Yes | No | App Functionality, Analytics | You + Third-party partner | Load timing, API latency signals where logged |
| **Diagnostics** | Other Diagnostic Data | **Yes** | Yes | No | App Functionality | You | Security/fraud signals, authentication failure metadata |
| **Surroundings** | Environment Scanning | No | — | — | — | — | Not collected |
| **Body** | Hands | No | — | — | — | — | Not collected |
| **Body** | Head | No | — | — | — | — | Not collected |
| **Other Data** | Other Data | **Yes** | Yes | No | App Functionality | You + Partners | App version, locale, verification tier, jurisdiction eligibility flags |

---

### Data not collected (summary)

Mark **No** in App Store Connect for every subtype not listed as **Collect = Yes** above. Easner mobile does **not** collect:

- Health, fitness, contacts, address book, precise GPS, browsing history, search history, advertising data, credit reports, App Store purchase history, gameplay content, environment/body sensors, or cross-app tracking data.

---

### Third-party partners (disclose on label)

When Apple asks which partners receive data, include categories that apply:

| Partner / SDK | Data categories typically shared | Role |
|---------------|----------------------------------|------|
| **Supabase** | Contact Info, Identifiers, Usage (auth logs) | Authentication, database, session storage |
| **PostHog** | Identifiers, Usage Data, Diagnostics, Product Interaction | Product analytics, error events |
| **Intercom** | Contact Info, Identifiers, User Content (Customer Support, Audio) | In-app support and live chat |
| **Noah** (and regulated payout/KYC partners) | Contact Info, Sensitive Info, Financial Info, Photos, Location (coarse) | Hosted KYC/KYB, accounts, fiat pay-in/pay-out |
| **Turnkey** / wallet infrastructure | Financial Info, Identifiers | Deposit addresses, wallet settlement where used |
| **Apple** (Sign in with Apple) | Contact Info (name, email) | Authentication — data governed by Apple’s SIWA terms |
| **Google** (Sign in with Google) | Contact Info (name, email) | Authentication — data governed by Google’s terms |

Partner list may change as products launch; update this table and App Store Connect when material partners change (see Privacy Policy §5).

---

### Purposes reference (Apple’s labels)

When the wizard shows purpose checkboxes, use only these for Easner:

| Purpose | Use for Easner |
|---------|----------------|
| **App Functionality** | Account, payments, KYC, support, security, push notifications, compliance |
| **Analytics** | PostHog product analytics (screens, funnels, errors) — not ads |
| **Product Personalization** | **Do not select** — no personalized ads or content feeds |
| **Developer’s Advertising or Marketing** | **Do not select** — no in-app ad network |
| **Third-Party Advertising** | **Do not select** |
| **Other Purposes** | **Do not select** unless counsel advises otherwise |

Fraud prevention, AML, and sanctions screening → **App Functionality** (not a separate Apple checkbox).

---

### Linked vs not linked

Easner **does not** declare a separate “Data Not Linked to You” section for the mobile app at launch — analytics and diagnostics are tied to authenticated user IDs or device tokens. If you later ship fully anonymous crash-only telemetry with no user/device ID, revisit **Crash Data** / **Performance Data** for a not-linked declaration.

---

### Required Reason API (Privacy Manifest)

[`mobile/ios/Easner/PrivacyInfo.xcprivacy`](../../mobile/ios/Easner/PrivacyInfo.xcprivacy) declares accessed APIs (file timestamps, UserDefaults, boot time, disk space) with Apple reason codes. **NSPrivacyTracking** is `false`. **NSPrivacyCollectedDataTypes** is empty in the manifest — collection is disclosed via App Store Connect (this section), not only the plist.

---

### Device permissions (on-device prompts)

From [`mobile/ios/Easner/Info.plist`](../../mobile/ios/Easner/Info.plist):

| Permission | Usage string | Maps to privacy data |
|------------|--------------|----------------------|
| Camera | Easner uses the camera when you take or attach photos. | Photos or Videos, Sensitive Info (KYC) |
| Face ID | Allow Easner to access your Face ID biometric data. | **Not sent to servers** — unlock only; do not add “Body” or biometric collection on the label |
| Photo Library | Allow Easner to access your photos | Photos or Videos (avatar) |
| Microphone | Easner uses the microphone when you record or send audio. | Audio Data (Intercom) |
| Push Notifications | (system prompt) | Identifiers (Device ID / push token) |

---

### App Privacy publish checklist

- [ ] Every **Collect = Yes** subtype added with correct Linked / Tracking / Purposes
- [ ] Every **Collect = No** subtype omitted (not listed on label)
- [ ] Third-party partners selected where data leaves Easner’s direct control
- [ ] **Tracking** set to **No** at app level
- [ ] Answers match [`privacy-policy.md`](../legal/privacy-policy.md) and actual SDK behavior
- [ ] **Publish** clicked — label visible on TestFlight / App Store listing

---

## Age rating

Complete Apple's questionnaire honestly. Guidance:

| Question area | Answer |
|---------------|--------|
| Unrestricted web access | No (in-app browser for legal links only) |
| Gambling / contests | No |
| Mature themes | No |
| Cryptocurrency / digital assets | Yes — if prompted, declare stablecoin facilitation |

Expect **17+** if crypto/stablecoin is declared; otherwise likely **4+** with no mature content.

---

## Export compliance

[`mobile/app.json`](../../mobile/app.json) sets `ITSAppUsesNonExemptEncryption: false`.

In App Store Connect after upload:

- Uses encryption: **Yes** (HTTPS)
- Qualifies for exemption: **Yes** — standard encryption only

---

## Pricing and availability

**Price:** Free

**Launch countries:** Align with [`kyc-kyb-policy.md`](../legal/kyc-kyb-policy.md). Do not launch worldwide on day one.

**Include (examples):** United States, United Kingdom, Canada, Nigeria, EU member states where partner onboarding is supported.

**Exclude — prohibited jurisdictions:**

Cuba, Iran, Myanmar, North Korea, Syria, Crimea, Sevastopol, Donetsk, Kherson, Luhansk, Zaporizhzhia.

**Exclude — controlled jurisdictions** (not generally available):

Afghanistan, Algeria, Bangladesh, Belarus, China, DRC, Gaza/West Bank, Haiti, Iraq, Lebanon, Libya, Morocco, Mozambique, Nepal, Nicaragua, North Macedonia, Qatar, Pakistan, Russia, Somalia, South Sudan, Sudan, Venezuela, Yemen — and others per KYC policy.

Expand availability as partner coverage grows.

---

## Submission checklist

### One-time setup

- [ ] Apple Developer Program enrolled under Easner Group, Inc.
- [ ] App ID `com.easner.mobile` registered with Push Notifications and Associated Domains (`applinks:easner.com`)
- [ ] App created in App Store Connect (name: Easner, SKU: `easner-ios`)

### Pre-submit (code / product)

- [ ] Demo account created — profile complete, **KYC not verified** (matches App Review credentials)
- [ ] Optional: separate KYC-approved internal account for App Store screenshots only
- [ ] EAS production env vars set: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`, PostHog, Intercom keys
- [ ] `easner.com` apple-app-site-association valid for Universal Links

### Build and upload

From [`mobile/`](../../mobile/):

```bash
npx eas build --platform ios --profile production
npx eas submit --platform ios --profile production
```

See [`mobile/eas.json`](../../mobile/eas.json) — production profile uses `autoIncrement: true` for iOS.

### App Store Connect listing

- [ ] Paste metadata, description, keywords, promotional text from this doc
- [ ] Upload 6.7" screenshots (5–6 screens)
- [ ] Complete App Privacy questionnaire
- [ ] Complete age rating questionnaire
- [ ] Add App Review demo account and notes
- [ ] Select uploaded build on version 1.0.1
- [ ] Submit for review

### After approval

- [ ] Copy `{APP_STORE_URL}` into [`README.md`](README.md) placeholders and website CTAs
- [ ] Choose manual or automatic release

**Typical review time:** 24–48 hours for fintech; may be longer if Apple requests licensing documentation.

---

## QA checklist (before submit)

### Voice and legal

- [ ] No banned words: instant, zero fee, free transfers (see [`VOICE-AND-GUARDRAILS.md`](VOICE-AND-GUARDRAILS.md))
- [ ] Fees, timing, and availability disclaimers live in the IMPORTANT block — not repeated in feature bullets
- [ ] Listing uses **Easner** (App Store name); product refs use **Easner Mobile** / **Easner Personal Banking** per [`NAMING.md`](NAMING.md)
- [ ] P2P handle branded as **EASETAG**, not "Easner tag"
- [ ] Regulatory disclaimer included in description
- [ ] Cross-check against [`docs/legal/`](../legal/)

### App Store Connect

- [ ] All URLs live and correct
- [ ] Screenshots match current app UI
- [ ] Demo account tested — sign-in, verification screen, gated Send/Receive, Legal, Support
- [ ] Screenshot source account (if different) tested for balances and Receive UI
- [ ] App Privacy matches actual SDK and data collection (see [App Privacy](#app-privacy-nutrition-labels) master matrix)
- [ ] Country availability matches KYC policy

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-08 | Initial App Store iOS content pack — branded as Easner, aligned with personal.md and legal docs |
| 2026-06-08 | EASETAG naming; removed repetitive "where enabled" from listing copy |
| 2026-06-08 | Removed pre-submit blockers section (resolved in app) |
| 2026-06-08 | Product naming pass — [`NAMING.md`](NAMING.md); retire Easner Personal; EASETAG standard |
| 2026-06-08 | Expanded App Privacy section — full Apple data-type matrix and Connect walkthrough |
| 2026-06-08 | App Review demo account documented as KYC-not-verified; screenshot vs review account split |

---

## Out of scope

- Google Play listing (separate doc)
- EAS build execution
