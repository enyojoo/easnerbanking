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
} from "lucide-react"

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
}

export type NavGroup = {
  id: "mobile" | "business" | "platform"
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
