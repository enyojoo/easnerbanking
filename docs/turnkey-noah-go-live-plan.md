# Turnkey + Noah Go-Live Plan (Business + Mobile + Office)

## Document purpose
This runbook consolidates:
- Turnkey integration steps for both `/mobile` (individual) and `/business` (business clients)
- Noah workflow wiring (onramp/offramp)
- Pricing and monetization operating model
- Production hardening priorities
- Office UX/UI improvement sequence

Use this as the implementation checklist for go-live.

## Turnkey MCP validation
This plan was validated against Turnkey documentation via the configured Turnkey MCP server (search + docs filesystem query).

Reviewed sources:
- https://docs.turnkey.com/production-checklist/embedded-wallet
- https://docs.turnkey.com/products/embedded-business-wallets/overview
- https://docs.turnkey.com/concepts/policies/delegated-access-overview
- https://docs.turnkey.com/concepts/policies/delegated-access-backend
- https://docs.turnkey.com/getting-started/embedded-wallet-quickstart

---

## 1) Target architecture (high level)

- **Wallet infra:** Turnkey (non-custodial embedded wallets)
- **Rails/orchestration:** Noah (already integrated)
- **Backend:** source of truth for identity, KYC/KYB status, wallet mapping, pricing, and transfer lifecycle
- **Clients:**
  - `/mobile`: individual wallets
  - `/business`: organization wallets + approval workflows

### Core integration rule
- Noah onramp uses `DestinationAddress` (wallet receive address)
- Noah offramp uses `SourceAddress` (wallet send/source address)

### UX scope guardrail (product model)
- Crypto complexity remains backend-only; users get a banking-like product experience.
- Phase 1 integration does not require UI changes in `/mobile` or `/business`.
- Expected UX/UI changes for this rollout are in `office` (ops/commercial controls).
- Future exception: if business approvals/signature prompts are exposed directly in-product, `/business` UI changes will be required at that time.

---

## 2) Pre-requisites and decisions (do first)

## 2.1 Product and custody decisions
- Confirm custody model for launch:
  - Individuals: delegated or user-controlled (recommended: delegated for smoother UX)
  - Businesses: role-based approvals (maker/checker), threshold approvals (e.g., >$5k = 2 approvals)
- Lock v1 chains/currencies (example: Polygon + USDC)
- Define owner mapping rules: who gets wallet(s), when, and on what chain(s)

## 2.2 Turnkey setup decisions
- Create production Turnkey org
- Define auth methods (email/passkey/OAuth) by app
- Define policy templates:
  - Individual low-risk transfer policy
  - Business approval policy tiers
- Decide signing mode per flow:
  - Client-initiated signing for user actions
  - Backend delegated signing only when policy allows

## 2.3 Noah setup alignment
- Keep existing Noah customer lifecycle
- Ensure workflow endpoints are available for both:
  - `bank-deposit-to-onchain-address` (onramp)
  - `onchain-deposit-to-payment-method` (offramp)
- Confirm webhook subscriptions and signature verification

---

## 3) Data model to add

Create/normalize these tables:

## 3.1 `wallet_owners`
- `id`
- `owner_type` (`individual` | `business`)
- `owner_ref` (user id or business id)
- `kyc_status`
- `noah_customer_id`
- `created_at`, `updated_at`

## 3.2 `wallet_accounts`
- `id`
- `wallet_owner_id`
- `provider` (`turnkey`)
- `turnkey_suborg_id`
- `turnkey_wallet_id` (or account id)
- `chain`
- `address`
- `status` (`pending` | `active` | `failed`)
- `is_primary` (bool, one active primary address per owner+chain)
- `activated_at`
- `retired_at` (nullable, for wallet rotation history)
- `created_at`, `updated_at`

## 3.3 `wallet_provisioning_jobs`
- `id`
- `idempotency_key`
- `wallet_owner_id`
- `state`
- `error`
- `attempt_count`
- `next_retry_at`
- `created_at`, `updated_at`

## 3.4 `payment_intents` (or extend existing)
- `id`
- `wallet_owner_id`
- `quote_id`
- `flow_type` (`onramp` | `offramp`)
- `source_currency`, `destination_currency`, `amount`
- `network`, `chain`
- `noah_workflow_id` / `noah_transaction_id`
- `intent_snapshot` (locked request parameters including source/destination addresses, amount guardrails, expiry)
- `status`
- `tx_hash` (if applicable)
- `created_at`, `updated_at`

## 3.5 `event_inbox` (provider webhook dedupe)
- `id`
- `provider` (`noah` | `turnkey`)
- `event_id` (provider-native unique id)
- `event_type`
- `payload_hash`
- `received_at`
- `processed_at` (nullable)
- `status` (`received` | `processed` | `failed`)
- unique key: `(provider, event_id)`

---

## 4) API surface (backend)

Add/normalize:

- `POST /wallets/provision`
- `GET /wallets/:ownerType/:ownerRef`
- `POST /onramp/intents`
- `POST /offramp/intents`
- `POST /webhooks/noah`
- `POST /webhooks/turnkey` (if used)

Rules:
- Never expose Turnkey secrets to clients
- All wallet operations go through backend authorization and policy checks
- Idempotency key required on create/provision/execute operations

---

## 5) Step-by-step Turnkey integration guide

## Step 1: Configure Turnkey org and environments
1. Create Turnkey orgs for `sandbox` and `production`.
2. Set environment secrets in backend:
   - Turnkey API credentials
   - Turnkey org identifiers
3. Configure auth and policy defaults per environment.
4. Add environment validation on service startup.

## Step 2: Build wallet service module in backend
1. Create `walletService` abstraction:
   - `ensureWalletOwner()`
   - `createOrGetSubOrg()`
   - `createOrGetWallet(chain)`
   - `getActiveAddress(owner, chain)`
2. Ensure methods are idempotent.
3. Record full audit trail per wallet action.
4. Add wallet lifecycle methods:
   - `rotateWallet(owner, chain, reason)`
   - `retireWallet(walletId)`
   - `setPrimaryWallet(walletId)`

## Step 3: Wire provisioning trigger to KYC/KYB approval
1. In existing KYC/KYB webhook handler, detect approved status.
2. Upsert `wallet_owner`.
3. Enqueue provisioning job per required chain.
4. Return fast from webhook (async processing only).

## Step 4: Implement provisioning worker
1. Dequeue pending job.
2. Acquire lock by `wallet_owner_id + chain`.
3. If active wallet exists, mark job done.
4. Else:
   - create/get Turnkey sub-org
   - create wallet/account for chain
   - read derived address
5. Save `wallet_accounts` row and set `status=active`.
6. Emit `WALLET_READY` internal event.
7. On failure, apply backoff and retry; dead-letter after max attempts.

## Step 5: Integrate onramp with Noah using wallet destination
1. User starts onramp.
2. Backend resolves active wallet address by owner + chain.
3. Call Noah bank onramp workflow with:
   - `CustomerID`
   - `FiatCurrency`
   - `CryptoCurrency`
   - `Network`
   - `DestinationAddress = wallet address`
4. Save intent and return deposit instructions to client.
5. Process Noah `FiatDeposit` and `Transaction` webhooks.
6. Mark intent complete when destination settlement confirms.

## Step 6: Integrate offramp with Noah using wallet source
1. User requests offramp payout.
2. Backend creates quote/form session through existing Noah flow.
3. Set `SourceAddress = wallet address`.
4. Receive Noah destination deposit instructions.
5. Execute onchain send from Turnkey wallet (client or backend per policy).
6. Noah detects deposit and executes fiat payout.
7. Reconcile webhook statuses to intent status.
8. On Noah session/quote expiry, regenerate session and re-bind intent snapshot idempotently.

## Step 7: Add business approval workflows (`/business`)
1. Map business roles to policy tags.
2. Define approval thresholds:
   - small tx: single approver
   - high value: multi-approver
3. Require policy evaluation result before signing.
4. Store approver identities and timestamps for audit.

## Step 8: Add reliability + reconciliation jobs
1. Retry failed provisioning jobs.
2. Reconcile pending intents with Noah webhook outcomes.
3. Reconcile tx hash/chain status with internal status.
4. Alert on stale states and repeated failures.
5. Add webhook replay worker that reads `event_inbox` failures and retries side effects safely.

## Step 9: Define signing ownership and replay protection
1. Publish a signing matrix per endpoint:
   - client-signed (user present)
   - backend delegated-sign (policy constrained)
2. Require nonce + idempotency key for all sign requests.
3. Persist signing request hashes and reject replays.
4. Store signer identity and policy decision id in audit logs.

---

## 6) Pricing and monetization operating model

Keep pricing in Office/backend as source of truth.

- **Turnkey:** wallet/signing infra
- **Noah:** execution rail
- **Pricing Office:** quote, spread, fees, strategy, guardrails, margin analytics

## Quote lifecycle (required)
1. Get executable partner quote/input (Noah).
2. Apply internal pricing policy:
   - corridor spread
   - segment tier (retail/business)
   - amount-band adjustments
   - payout method premium
3. Add explicit platform fees.
4. Return:
   - customer rate
   - fee breakdown
   - TTL/expiry
   - guaranteed vs indicative flag
5. Lock quote via `quote_id + nonce`.

## Monetization framework
- FX spread (primary)
- fixed fee floors
- payout method premiums
- business plan discounts + optional SaaS fees
- realized vs expected margin tracking

---

## 6.1) Ledger vs wallet vs rail operating model

For this product, user-facing balances remain banking-style account balances while crypto infra stays backend-only.

### Source of truth
- Displayed USD/EUR balances (`/mobile` and `/business/accounts`) are ledger/account balances.
- Turnkey wallets are wallet identity/signing infrastructure.
- Noah is orchestration for conversion and fiat payout rails.

### Post-KYC/KYB expected behavior
1. Wallets are provisioned/activated in backend (Solana USDC for USD rail, Solana EURC for EUR rail).
2. UI shape does not change; balances continue to read from ledger.
3. Onramp/offramp execution references Turnkey addresses behind the scenes.
4. Ledger is reconciled against Noah webhook state and onchain tx state.

### Action matrix
| Action | Ledger change | Turnkey call | Noah call |
| --- | --- | --- | --- |
| Easetag -> Easetag (same platform) | Yes (atomic debit/credit) | No | No |
| Send to external crypto address | Yes (reserve/debit + settlement posting) | Yes (sign/broadcast) | Optional |
| Fiat deposit -> stablecoin rail (onramp) | Yes (credit on settlement) | Yes (`DestinationAddress`) | Yes |
| Crypto -> fiat payout (offramp) | Yes (debit/reserve + finalization) | Yes (`SourceAddress`) | Yes |

### Internal transfer clarification (critical)
- Easetag P2P is ledger-first, not wallet-to-wallet onchain.
- Implementation is an atomic journal transfer (`debit A`, `credit B`) with idempotency and risk checks.
- Turnkey is not invoked for each internal Easetag transfer.

### Receive flow clarification
- Noah provisions virtual account instructions for fiat deposit flows.
- Turnkey provides per-user wallet deposit addresses in BYOW model.
- Noah does not replace Turnkey as wallet-address source-of-truth.

### Backend posting requirements
- Every Noah/Turnkey lifecycle event posts deterministic ledger entries:
  - pending
  - settled
  - failed/reversed
- `payment_intents` must reference:
  - `wallet_owner_id`
  - Noah workflow/transaction ids
  - resulting ledger journal ids

### Crypto balance display policy
- For current banking UX, crypto balances are not required as a user-facing primitive.
- Crypto remains transport rail; account balances remain ledger-native.

### Hybrid provisioning model (agreed)
- At auth/signup: create Turnkey shell/sub-org and wallet mapping row (`shell`/`inactive`).
- At KYC/KYB approved: activate rails by binding Noah customer/workflows and setting `rails_enabled=true`.
- Turnkey provisioning lifecycle is independent from Noah orchestration lifecycle, with backend policy gates.

---

## 7) Office hardening: must-fix before/at go-live

Current engine is strong, but apply these 5 critical fixes:

1. **Provider FX normalization**
   - `business/lib/pricing/provider-costs.ts`
   - `normalizeFeeToReporting()` must convert cross-currency fee amounts, not pass through unchanged.

2. **Route preference enforcement**
   - `route_preference` exists in rules/UI; enforce in route selector logic.

3. **Guardrail enforcement scope**
   - margin floors are currently canary-gated.
   - separate hard guardrails from experimental logic so critical controls always enforce in prod.

4. **Provider schedule drift validation**
   - enable and enforce provider schedule/version drift checks in production.

5. **Quote snapshot immutability**
   - prevent post-apply mutation of `quote_payload`, `provider_costs`, and `pricing_totals`.

---

## 8) Office UX/UI improvement roadmap

## Phase 1 (fast, high impact)
- Add review+confirm modal for sensitive create/update actions
- Replace free-text enums with controlled selects
- Add dashboard quick actions and attention queue

## Phase 2 (workflow redesign)
- Convert pricing/provider forms to stepper flow:
  - Scope -> Rate model -> Guardrails -> Review
- Improve information architecture labels/grouping by operator jobs

## Phase 3 (operational polish)
- Add before/after config diffs and change-impact previews
- Standardize visual tokens and spacing
- Add global quick actions in top bar

---

## 9) Security and compliance guardrails

- No plaintext private key storage
- Minimal wallet metadata in DB
- strict policy-scoped signing (allowed chains/contracts, limits)
- Idempotency keys on all mutating calls
- webhook signature verification (Noah and Turnkey)
- immutable audit log for initiator/approver/action/policy
- log redaction for secrets and key material
- dual-control for production policy edits (2-person approval)

No second KYC journey should be required if wallet layer stays infrastructure-only and Noah reliance/compliance rules are followed.

---

## 10) Reliability requirements (must-have)

- queue-based provisioning
- retries + dead-letter queue
- reconciliation cron jobs
- operational dashboards:
  - wallet provisioning success rate
  - onramp/offramp completion SLA
  - failed webhook/retry trends
- safe-mode kill switch: pause new intents while continuing webhook ingestion/reconciliation

---

## 11) Launch plan (phased)

## Phase 1: Fast go-live
- mobile individuals first
- single chain + stablecoin pair
- delegated signing policy
- Noah flows using Turnkey addresses
- pricing hardening P0 fixes complete

## Phase 2: Business and scale
- business approval workflows enabled
- additional corridors/chains
- route optimization and fallback provider logic
- Office UX phase 1 + 2 complete

---

## 12) Acceptance checklist (production readiness)

- [ ] Wallet auto-provision on KYC/KYB approval (idempotent)
- [ ] Onramp always sends correct `DestinationAddress`
- [ ] Offramp always sends correct `SourceAddress`
- [ ] Duplicate webhook delivery handled safely
- [ ] `event_inbox` dedupe and replay processing verified
- [ ] Failed provisioning retries and alerts working
- [ ] Business approval policies enforced on high-value tx
- [ ] Pricing hardening 5/5 fixes done
- [ ] End-to-end sandbox matrix passed (mobile + business)
- [ ] Reconciliation and ops dashboards live
- [ ] Signing matrix documented and replay protection verified
- [ ] Safe-mode runbook tested

---

## 13) Execution backlog (recommended order)

1. Finalize custody/policy decisions
2. Add DB schema and wallet service abstraction
3. Implement KYC-triggered provisioning worker
4. Wire onramp/offramp to wallet addresses
5. Add reconciliation + ops alerting
6. Ship pricing hardening fixes
7. Ship Office UX phase 1
8. Pilot with limited traffic
9. Expand to business approvals and more corridors

## 14) Migration and rollback runbook

1. **Schema migration:** add wallet/event tables and indexes.
2. **Dual-write phase:** continue existing flows while writing new wallet mappings.
3. **Read switch:** route onramp/offramp source/destination address resolution through `walletService`.
4. **Cutover:** disable Noah wallet row reads as source-of-truth.
5. **Rollback plan:** feature flag reverts reads to previous path while preserving dual-write data.
6. **Post-cutover verification:** compare production intent address resolution vs expected wallet mapping.

---

## Appendix: Go-live defaults

- Quote TTL: 60-90s
- Retries: exponential backoff, cap at 5 attempts then dead-letter
- Alert thresholds:
  - provisioning failures >2% in 15m
  - webhook failures >1% in 15m
  - negative-margin trades >0
- Rollout: canary by segment/corridor before full rollout
