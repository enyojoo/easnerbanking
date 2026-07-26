import { BRAND } from '@easner/shared'

/** Browser tab title suffix — business web uses "Easner Business Banking". */
export const WEB_APP_TITLE = `${BRAND.name} Banking`

const ROUTE_TITLES: Record<string, string> = {
  Dashboard: 'Home',
  Card: 'Cards',
  Transactions: 'Transactions',
  More: 'More',
  MainTabs: 'Home',
  SendAmount: 'Send Money',
  SelectRecentRecipient: 'Send Money',
  SelectRecipient: 'Send Money',
  SendConfirm: 'Confirm Send',
  SendCrossBorderMomoSetup: 'Mobile Money',
  SendPin: 'Confirm Send',
  Recipients: 'Recipients',
  Profile: 'Profile',
  ProfileEdit: 'Profile',
  Support: 'Support',
  TransactionDetails: 'Transaction',
  ReceiveMoney: 'Receive',
  ReceiveBankDetails: 'Bank Account',
  ReceiveTransactionDetails: 'Receive',
  AccountVerification: 'Verification',
  Notifications: 'Notifications',
  InAppNotifications: 'Notifications',
  Legal: 'Legal',
  ChangePassword: 'Security',
  ChangePin: 'Security',
  MfaSetup: 'Security',
  Auth: 'Sign In',
  Login: 'Sign In',
  Register: 'Sign Up',
  ForgotPassword: 'Reset Password',
  ResetPassword: 'Reset Password',
  PinEntryGate: 'Unlock',
  PinSetupGate: 'Set PIN',
  MfaVerify: 'Verify',
  Onboarding: 'Welcome',
  OpenCurrencyAccount: 'Open Account',
  TransactionCard: 'Card Transactions',
  ScanWalletAddress: 'Scan Address',
  PayrollApproval: 'Payroll Connections',
  PayrollConnections: 'Payroll Connections',
  PayrollConnectionDetail: 'Payroll Connection',
  PayrollInvitation: 'Payroll Request',
  PayrollReceivingMethod: 'Receiving Method',
}

function humanizeRouteName(name: string): string {
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/Gate$/i, '')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function resolvePageTitle(
  options: { title?: string } | undefined,
  route: { name?: string } | undefined,
): string | null {
  const raw = options?.title ?? route?.name
  if (typeof raw !== 'string' || raw.length === 0) return null
  return ROUTE_TITLES[raw] ?? humanizeRouteName(raw)
}

/** Never emit "undefined" — RN Web calls this while navigation state is settling. */
export function formatWebDocumentTitle(
  options: { title?: string } | undefined,
  route: { name?: string } | undefined,
): string {
  const page = resolvePageTitle(options, route)
  return page ? `${page} | ${WEB_APP_TITLE}` : WEB_APP_TITLE
}

export function setWebDocumentTitle(pageTitle?: string | null): void {
  if (typeof document === 'undefined') return
  document.title = pageTitle ? `${pageTitle} | ${WEB_APP_TITLE}` : WEB_APP_TITLE
}
