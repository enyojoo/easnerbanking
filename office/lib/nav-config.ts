import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  CreditCard,
  Users,
  ShieldCheck,
  Building2,
  UsersRound,
  Receipt,
  HandCoins,
  LineChart,
  PanelsTopLeft,
} from "lucide-react"

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
}

export type NavGroup = {
  id: "mobile" | "business" | "revenue" | "platform"
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
    id: "revenue",
    label: "Revenue",
    items: [
      { name: "Monetization", href: "/monetization", icon: HandCoins },
      { name: "Pricing & FX", href: "/pricing-fx", icon: LineChart },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    items: [{ name: "Platform control", href: "/platform-control", icon: PanelsTopLeft }],
  },
]

/** Match pathname to active nav item (including prefix routes). */
export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (pathname === href || pathname === `${href}/`) return true
  // "/business" overview must not stay active on deeper /business/* routes
  if (href === "/business") return false
  // Hub routes: stay active for any tab query string
  if (href === "/monetization" || href === "/pricing-fx" || href === "/platform-control") {
    return pathname === href || pathname === `${href}/`
  }
  return pathname.startsWith(`${href}/`)
}
