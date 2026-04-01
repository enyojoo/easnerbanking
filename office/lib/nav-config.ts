import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  CreditCard,
  Users,
  ShieldCheck,
  Building2,
  UsersRound,
  Receipt,
  TrendingUp,
  Settings,
  Activity,
  ClipboardCheck,
  Radio,
  ScrollText,
  HandCoins,
  FileCog,
  CircleDollarSign,
  BadgeDollarSign,
  Gift,
  SlidersHorizontal,
  BarChart3,
  RefreshCw,
  Gauge,
  Database,
} from "lucide-react"

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
}

export type NavGroup = {
  id: "mobile" | "business" | "platform" | "commercial"
  label: string
  items: NavItem[]
}

export const officeNavGroups: NavGroup[] = [
  {
    id: "mobile",
    label: "Mobile",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Transactions", href: "/transactions", icon: CreditCard },
      { name: "Users", href: "/users", icon: Users },
      { name: "KYC & Compliance", href: "/compliance", icon: ShieldCheck },
    ],
  },
  {
    id: "business",
    label: "Business",
    items: [
      { name: "Overview", href: "/business", icon: Building2 },
      { name: "Organizations", href: "/business/organizations", icon: Building2 },
      { name: "Customers", href: "/business/customers", icon: UsersRound },
      { name: "Invoices", href: "/business/invoices", icon: Receipt },
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    items: [
      { name: "Plans", href: "/commercial/plans", icon: HandCoins },
      { name: "Pricing Rules", href: "/commercial/rules", icon: FileCog },
      { name: "Limit Policies", href: "/commercial/limits", icon: CircleDollarSign },
      { name: "Subscriptions", href: "/commercial/subscriptions", icon: BadgeDollarSign },
      { name: "Promo", href: "/commercial/promo", icon: Gift },
      { name: "Rollout", href: "/commercial/rollout", icon: SlidersHorizontal },
      { name: "Metrics", href: "/commercial/metrics", icon: BarChart3 },
      { name: "Provider Fee Baselines", href: "/commercial/provider-fees", icon: Database },
      { name: "Pricing Engine Health", href: "/commercial/health", icon: Gauge },
      { name: "Webhook Replay Ops", href: "/commercial/ops", icon: RefreshCw },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    items: [
      { name: "Rates", href: "/rates", icon: TrendingUp },
      { name: "Settings", href: "/settings", icon: Settings },
      { name: "Integrations & health", href: "/platform/health", icon: Radio },
      { name: "Industry checklist", href: "/platform/industry-checklist", icon: ClipboardCheck },
      { name: "Audit log", href: "/platform/audit", icon: ScrollText },
      { name: "Noah operations", href: "/platform/noah", icon: Activity },
    ],
  },
]

/** Match pathname to active nav item (including prefix routes). */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname === `${href}/`) return true
  // "/business" overview must not stay active on deeper /business/* routes
  if (href === "/business") return false
  return pathname.startsWith(`${href}/`)
}
