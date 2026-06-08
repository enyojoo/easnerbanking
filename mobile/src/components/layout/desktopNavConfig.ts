import type { LucideIcon } from 'lucide-react-native'
import { Activity, CreditCard, Grip, House } from 'lucide-react-native'

export type DesktopNavItem = {
  id: string
  label: string
  icon: LucideIcon
  /** Main stack route name */
  route: string
  /** Tab screen when route is MainTabs */
  tabScreen?: string
}

/** Mirrors mobile bottom tabs: Home, Cards, Transactions, More. */
export const DESKTOP_TAB_NAV: DesktopNavItem[] = [
  { id: 'home', label: 'Home', icon: House, route: 'MainTabs', tabScreen: 'Dashboard' },
  { id: 'cards', label: 'Cards', icon: CreditCard, route: 'MainTabs', tabScreen: 'Card' },
  { id: 'transactions', label: 'Transactions', icon: Activity, route: 'MainTabs', tabScreen: 'Transactions' },
  { id: 'more', label: 'More', icon: Grip, route: 'MainTabs', tabScreen: 'More' },
]
