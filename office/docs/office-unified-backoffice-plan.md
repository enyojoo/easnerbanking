# Unified Office back office plan

Single plan combining: **dashboard rebuild**, **one-database / entity-based model**, and **Users + Organizations** behavior. No “Mobile vs Business” product lanes in the UI; drill-down is by **entity** (person vs organization).

---

## 1. Product model (source of truth)

| Concept | Meaning |
|--------|--------|
| **User** | One identity in Supabase (`auth` + profile). Includes **consumer-only** people and **business owners** (anyone who created or owns a workspace). |
| **Organization** | A **business workspace** in the business app: created by / owned by a **user**. Linked via DB (`owner_user_id`, `created_by`, or membership/roles table—confirm in schema). |
| **Office** | One admin surface: **global** metrics where useful; **detail** screens explain entity type (person vs org), not “which app.” |

**Routes**

- **`/users`** — Directory of **all people**; badges/filters for **Consumer**, **Business owner**, **Both**; detail shows profile, consumer activity, and **linked organization(s)**.
- **`/organizations`** — **All businesses**; each row shows **owner/creator** (name/email/id) with link to **`/users?…`** when applicable.
- **`/customers`**, **`/invoices`**, **`/transactions`**, etc. — Stay entity-scoped; link users ↔ orgs where FKs exist.

---

## 2. Dashboard principles

1. **Unified home** — One KPI strip and one hierarchy: no competing “Mobile” / “Business” sections with equal visual weight.
2. **One overview contract** — Prefer **`GET /api/admin/office/overview`** (or one store initializer) returning a **stable JSON schema**: `window`, `kpis`, optional **dimensional** breakdowns (e.g. consumer transfer count vs B2B invoice count) as **fields**, not separate “products.”
3. **Time range first** — Default **7d** (or agreed default); show **range + as-of** on the page; plumb `since` / `until` through the API.
4. **Remove redundancy** — Drop duplicate Platform link strip (sidebar suffices) or reduce to **one** health shortcut; collapse three B2B headline cards into **one** summary row/table with links to `/organizations`, `/customers`, `/invoices`.
5. **Limit heavy widgets** — Start with **at most two** of: recent activity, top currencies/corridors, processing buckets—prioritize what ops uses daily.

---

## 3. Suggested `OfficeOverview` snapshot (v1)

Shape is illustrative; names can match existing `officeDataStore` fields where possible.

```ts
// Conceptual — implement in shared types + API
{
  window: { preset: "7d", since: "ISO", until: "ISO" },
  kpis: {
    totalUsers: number,
    newUsersInWindow: number,
    totalOrganizations: number,
    newOrganizationsInWindow: number,
    transactionCount: number,
    transactionVolumeUsd: number, // or reporting_currency + amount
    pendingTransactions: number,
    successRate?: number,
    b2bCustomerCount: number,
    invoiceCount: number,
    // optional: pendingKycCount, webhookFailureRate, etc.
  },
  breakdown?: {
    // dimensional, not “mobile” vs “business” labels in UI
    consumerTransferCount?: number,
    b2bInvoiceCountInWindow?: number,
  },
  topCurrencies?: Array<{ code: string; count: number; totalAmount: number }>,
  processingBuckets?: Array<{ label: string; count: number }>,
  recentActivity?: Array<{ id: string; type: string; message: string; time: string; user?: string; amount?: string }>,
  alerts?: Array<{ severity: string; message: string }>,
  links?: { platformHealth: string, currencies: string }
}
```

**Implementation choice:** merge current **`officeDataStore` queries** + **`/api/admin/business/summary`** (and any small extra counts) **server-side** in the business app behind **`/api/admin/office/overview`**, Office calls **one** endpoint (or one store method that hits it). Avoid many parallel ad hoc fetches on the dashboard page.

---

## 4. Phased delivery

| Phase | Scope |
|-------|--------|
| **A — Schema & org ↔ user** | Confirm `organizations` (and related) **owner/creator** column or join. Migration if missing. |
| **B — APIs** | Add **`GET /api/admin/office/overview`** (auth: office admin). Extend organizations list payload with **`owner_user_id`** + display fields (join `profiles` / `auth.users` as allowed). Optional: **`GET /api/admin/office/users`** enrichment with **`org_count`**, **`is_business_owner`**. |
| **C — `/organizations` UI** | New columns: **Owner** (link to user). |
| **D — `/users` UI** | Badges/columns: **Consumer** / **Business owner** / **Both**; **Organizations** column or detail subsection. |
| **E — Dashboard** | Replace current page with **unified** layout: KPI row, compact B2B summary strip, **one** deep-dive block (pick activity vs currencies vs latency v1), **time range** control; remove “Mobile”/“Business” headers and redundant Platform row. |
| **F — Polish** | Skeletons, empty states, drill-down links to Transactions / Compliance / Pricing where metrics imply it. |

Phases **A–D** can run partially in parallel with **E** once overview API returns org/user counts without owner UI.

---

## 5. Explicit non-goals (for v1)

- Separate “Mobile dashboard” and “Business dashboard” pages.
- Labeling top-level KPIs as “from mobile app” vs “from business app” (use **entity** language in drill-down only if needed).
- Duplicating full **Platform control** on the home page.

---

## 6. Verification checklist

- [ ] One overview response powers `/dashboard`; time window visible and respected.
- [ ] `/users` lists all people; business owners identifiable; link to orgs where applicable.
- [ ] `/organizations` shows owner/creator and links to the right user.
- [ ] No redundant Platform button row (or single compact shortcut only).
- [ ] B2B counts not repeated across three large duplicate cards.

---

## 7. Implementation reference (v1)

| Area | What shipped |
|------|----------------|
| **Org ↔ owner** | `business/lib/admin/org-owner-batch.ts` — `batchResolveOrgOwners`: prefers **Owner** on `organization_memberships` (non-invited), else earliest `users` row with `easner_organization_id = org.id`. No `organizations.owner_user_id` column in v1. |
| **Overview API** | `GET /api/admin/office/overview` — `business/app/api/admin/office/overview/route.ts`. Query: `preset=24h\|7d\|30d` and/or `since` / `until` ISO. Response type: `office/lib/types/office-overview.ts` (`OfficeOverviewResponse`). |
| **Organizations API** | `GET /api/admin/business/organizations` — `business/app/api/admin/business/organizations/route.ts`; each row includes `owner_user_id`, `owner_email`, `owner_name`. |
| **Office proxy** | Unchanged: `officeFetch` → `office/app/api/proxy/[...path]/route.ts` to the business app. |
| **Dashboard** | `office/app/dashboard/page.tsx` — single `officeFetch('/api/admin/office/overview?preset=…')`, unified KPI strip, compact B2B/workspace row, **two** widgets (recent activity + top currencies), one platform health shortcut. |
| **Organizations UI** | `office/app/organizations/page.tsx` — owner column with link to `/users?highlight=<userId>`; optional `?highlight=<orgId>` pins row. |
| **Users UI** | `office/app/users/page.tsx` — account type badges (Consumer / Business owner / Both), `?highlight=<userId>` opens detail + scrolls row; linked org block with `/organizations?highlight=<orgId>`. |
| **Polish** | `office/components/ui/skeleton.tsx` uses `bg-muted`; `office/components/loading-spinner.tsx` mirrors business full-page patterns. |
| **Other data** | `office/lib/office-data-store.ts` still powers non-dashboard pages; overview is dashboard-only in v1. |

This document is the **single** reference for the unified back office effort.
