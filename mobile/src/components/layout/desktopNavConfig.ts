import type { LucideIcon } from 'lucide-react-native'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CreditCard,
  FileText,
  HelpCircle,
  House,
  Key,
  Receipt,
  Shield,
  User,
  Users,
} from 'lucide-react-native'

export type DesktopNavItem = {
  id: string
  label: string
  icon: LucideIcon
  /** Main stack route name */
  route: string
  /** Tab screen when route is MainTabs */
  tabScreen?: string
  section: 'primary' | 'footer'
}

export const DESKTOP_PRIMARY_NAV: DesktopNavItem[] = [
  { id: 'home', label: 'Home', icon: House, route: 'MainTabs', tabScreen: 'Dashboard', section: 'primary' },
  { id: 'cards', label: 'Cards', icon: CreditCard, route: 'MainTabs', tabScreen: 'Card', section: 'primary' },
  { id: 'transactions', label: 'Transactions', icon: Receipt, route: 'MainTabs', tabScreen: 'Transactions', section: 'primary' },
  { id: 'send', label: 'Send', icon: ArrowUpRight, route: 'SendAmount', section: 'primary' },
  { id: 'receive', label: 'Receive', icon: ArrowDownLeft, route: 'ReceiveMoney', section: 'primary' },
  { id: 'recipients', label: 'Recipients', icon: Users, route: 'Recipients', section: 'primary' },
  { id: 'notifications', label: 'Notifications', icon: Bell, route: 'Notifications', section: 'primary' },
]

export const DESKTOP_FOOTER_NAV: DesktopNavItem[] = [
  { id: 'profile', label: 'Profile', icon: User, route: 'Profile', section: 'footer' },
  { id: 'support', label: 'Support', icon: HelpCircle, route: 'Support', section: 'footer' },
  { id: 'security', label: 'Security', icon: Shield, route: 'MfaSetup', section: 'footer' },
  { id: 'legal', label: 'Legal', icon: FileText, route: 'Legal', section: 'footer' },
]

export const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  ...DESKTOP_PRIMARY_NAV,
  ...DESKTOP_FOOTER_NAV,
]
