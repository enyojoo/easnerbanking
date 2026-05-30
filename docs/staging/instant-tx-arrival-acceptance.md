# Instant transaction arrival — staging acceptance

Run automated checks first, then complete the manual checklist on staging.

## Automated checks (local / CI)

```bash
# Shared realtime + mapper invariants
cd packages/shared && npx vitest run \
  src/query/realtime.test.ts \
  src/transactions/map-ledger-list-row.test.ts

# Business list mapper parity
cd business && npx vitest run lib/transactions/map-row-to-business.test.ts

# One-shot wrapper
./scripts/verify-instant-tx-arrival.sh
```

All tests must pass before staging sign-off.

---

## Manual checklist (staging)

### Prerequisites

- [ ] Migration `20250530120000_transactions_hidden_from_feed.sql` applied
- [ ] `backfill-hidden-from-feed.ts` completed
- [ ] Business web + Mobile app pointed at staging
- [ ] DevTools Network tab open (filter: `/api/transactions`)

### 1. Instant arrival — Business web

1. Log in to Business web; open **Transactions** (list must load once).
2. Trigger an inbound event (bank pay-in, easetag receive, or test webhook).
3. **Expect:** New row appears at top within ~100ms (debounced 50ms) **without** full-list loading spinner.
4. **Expect:** No new `GET /api/transactions` request when the list cache was warm before the event.

### 2. Instant arrival — Mobile

1. Open **Transactions** tab (or Home recent activity).
2. Trigger the same inbound event.
3. **Expect:** Row appears instantly; no pull-to-refresh required.
4. Switch to another tab and back while realtime is healthy.
5. **Expect:** No redundant `/api/transactions` call on focus (check Metro/network log).

### 3. Status updates

1. With an existing **pending** transaction visible, trigger settlement (or wait for webhook UPDATE).
2. **Expect:** Status badge updates in place; no full list flash.

### 4. Balance updates (unchanged)

1. Trigger a balance-affecting event without a new visible transaction.
2. **Expect:** Balance updates instantly.
3. **Expect:** No `/api/transactions` refetch triggered solely by balance tick.

### 5. Office admin (reduced egress)

1. Open Office **Transactions** (50-row page).
2. Trigger transaction status UPDATE on a row already in the list.
3. **Expect:** Status updates without full 200-row refetch when row is in cache.
4. **Expect:** New INSERT still refetches the active list (enrichment requires server).

### 6. Fallback when realtime unhealthy

1. Disable network briefly or block Supabase websocket.
2. Focus Transactions screen / switch tabs.
3. **Expect:** List refetches via polling or focus fallback.
4. Re-enable network; **Expect:** Realtime reconnects, prepend resumes.

---

## Sign-off

| Check | Business | Mobile | Office |
|-------|----------|--------|--------|
| Warm INSERT → no list API call | | | N/A (INSERT refetches) |
| Instant row render | | | |
| UPDATE in-place | | | |
| Balance instant, no tx refetch | | | |
| Focus skip when healthy (mobile) | N/A | | N/A |

**Tester:** _______________  
**Date:** _______________  
**Environment:** staging  
