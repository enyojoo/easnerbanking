import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Building2,
  Landmark,
  UsersRound,
  Receipt,
  HandCoins,
  LineChart,
  PanelsTopLeft,
  TrendingUp,
} from "lucide-react"

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
}

export type NavCollapsibleSection = {
  id: "business" | "revenue"
  label: string
  icon: LucideIcon
  items: NavItem[]
}

/** Top-level links (flat, no section header). */
export const officeNavPrimaryLinks: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Transactions", href: "/transactions", icon: CreditCard },
  { name: "Users", href: "/users", icon: Users },
]

export const officeNavCollapsibleSections: NavCollapsibleSection[] = [
  {
    id: "business",
    label: "Merchant",
    icon: Building2,
    items: [
      { name: "Businesses", href: "/businesses", icon: Landmark },
      { name: "Customers", href: "/customers", icon: UsersRound },
      { name: "Invoices", href: "/invoices", icon: Receipt },
    ],
  },
  {
    id: "revenue",
    label: "Revenue",
    icon: TrendingUp,
    items: [
      { name: "Monetization", href: "/monetization", icon: HandCoins },
      { name: "Pricing & FX", href: "/pricing-fx", icon: LineChart },
    ],
  },
]

export const officeNavPlatformLink: NavItem = {
  name: "Platform Control",
  href: "/platform-control",
  icon: PanelsTopLeft,
}

const hubExactOnly = ["/monetization", "/pricing-fx", "/platform-control"] as const

/** Match pathname to active nav item (including prefix routes). */
export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (pathname === href || pathname === `${href}/`) return true
  if ((hubExactOnly as readonly string[]).includes(href)) {
    return pathname === href || pathname === `${href}/`
  }
  return pathname.startsWith(`${href}/`)
}

/** True if any item in a collapsible section matches the current route. */
export function isCollapsibleSectionActive(sectionId: NavCollapsibleSection["id"], pathname: string | null): boolean {
  if (!pathname) return false
  if (sectionId === "business") {
    return (
      pathname === "/businesses" ||
      pathname.startsWith("/businesses/") ||
      pathname === "/customers" ||
      pathname.startsWith("/customers/") ||
      pathname === "/invoices" ||
      pathname.startsWith("/invoices/")
    )
  }
  if (sectionId === "revenue") {
    return (
      pathname === "/monetization" ||
      pathname.startsWith("/monetization/") ||
      pathname === "/pricing-fx" ||
      pathname.startsWith("/pricing-fx/")
    )
  }
  return false
}
