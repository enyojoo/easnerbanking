/**
 * Screen transition registry – maps every navigable route to a transition intent.
 * Used by resolveScreenTransitionOptions for intelligent stack motion.
 */

export type ScreenTransitionIntent =
  'tabRoot' | 'stackEntry' | 'flowStep' | 'flowHub' | 'modalSheet' | 'detail' | 'authGate' | 'settingsLeaf'

export type HubGroup = 'sendHub' | 'receiveLocalHub'

export type ScreenTransitionEntry = {
  intent: ScreenTransitionIntent
  /** Hub group for instant adjacent transitions */
  hubGroup?: HubGroup
  /** Force gesture off even when intent would allow swipe (MFA setup, mandatory PIN). */
  blockGesture?: boolean
  /** Allow swipe on Auth when coming from onboarding */
  allowAuthSwipe?: boolean
  /** Terminal flow step – enable Android swipe-back */
  flowStepTerminal?: boolean
}

export type ScreenRouteName =
  | 'Onboarding'
  | 'Auth'
  | 'ForgotPassword'
  | 'ResetPassword'
  | 'PinSetup'
  | 'PinEntry'
  | 'MfaVerify'
  | 'PinSetupGate'
  | 'PinEntryGate'
  | 'MainTabs'
  | 'Dashboard'
  | 'Card'
  | 'Transactions'
  | 'More'
  | 'SelectRecentRecipient'
  | 'SendAmount'
  | 'SelectRecipient'
  | 'ScanWalletAddress'
  | 'SendCrossBorderMomoSetup'
  | 'SendConfirm'
  | 'SendPin'
  | 'ReceiveMoney'
  | 'ReceiveBankDetails'
  | 'ReceiveStablecoinDetails'
  | 'ReceiveLocalRail'
  | 'ReceiveLocalAmount'
  | 'ExpressDepositAmount'
  | 'ExpressDepositPaymentSetup'
  | 'ExpressDepositReview'
  | 'ExpressDepositsSetup'
  | 'NgLocalVerificationSetup'
  | 'ReceiveLocalMomoSetup'
  | 'ReceiveLocalReview'
  | 'OpenCurrencyAccount'
  | 'TransactionDetails'
  | 'PayrollApproval'
  | 'PayrollConnections'
  | 'PayrollConnectionDetail'
  | 'PayrollInvitation'
  | 'PayrollReceivingMethod'
  | 'Recipients'
  | 'TransactionCard'
  | 'Support'
  | 'Legal'
  | 'AccountStatement'
  | 'ReceiveTransactionDetails'
  | 'AccountVerification'
  | 'Profile'
  | 'ChangePassword'
  | 'ChangePin'
  | 'MfaSetup'
  | 'Notifications'
  | 'InAppNotifications'

export const HUB_GROUPS: Record<HubGroup, readonly ScreenRouteName[]> = {
  sendHub: ['SelectRecentRecipient', 'SendAmount', 'SelectRecipient'],
  receiveLocalHub: ['ReceiveLocalRail'],
}

export const SCREEN_TRANSITION_MAP: Record<ScreenRouteName, ScreenTransitionEntry> = {
  // Onboarding / auth gates
  Onboarding: { intent: 'authGate', blockGesture: true },
  Auth: { intent: 'authGate', allowAuthSwipe: true },
  ForgotPassword: { intent: 'authGate' },
  ResetPassword: { intent: 'authGate' },
  PinSetup: { intent: 'authGate' },
  PinEntry: { intent: 'authGate' },
  MfaVerify: { intent: 'authGate', blockGesture: true },
  PinSetupGate: { intent: 'authGate', blockGesture: true },
  PinEntryGate: { intent: 'authGate', blockGesture: true },

  // Tab roots (inside MainTabs – stack options apply when pushed as stack screens)
  MainTabs: { intent: 'tabRoot', blockGesture: true },
  Dashboard: { intent: 'tabRoot' },
  Card: { intent: 'tabRoot' },
  Transactions: { intent: 'tabRoot' },
  More: { intent: 'tabRoot' },

  // Send flow
  SelectRecentRecipient: { intent: 'flowHub', hubGroup: 'sendHub' },
  SendAmount: { intent: 'flowHub', hubGroup: 'sendHub' },
  SelectRecipient: { intent: 'flowHub', hubGroup: 'sendHub' },
  ScanWalletAddress: { intent: 'modalSheet', blockGesture: true },
  SendCrossBorderMomoSetup: { intent: 'flowStep' },
  SendConfirm: { intent: 'flowStep', flowStepTerminal: true },
  SendPin: { intent: 'flowStep', flowStepTerminal: true },

  // Receive flow
  ReceiveMoney: { intent: 'stackEntry' },
  ReceiveBankDetails: { intent: 'flowStep' },
  ReceiveStablecoinDetails: { intent: 'flowStep' },
  ReceiveLocalRail: { intent: 'flowHub', hubGroup: 'receiveLocalHub' },
  ReceiveLocalAmount: { intent: 'flowStep' },
  ExpressDepositAmount: { intent: 'flowStep' },
  ExpressDepositPaymentSetup: { intent: 'flowStep' },
  ExpressDepositReview: { intent: 'flowStep', flowStepTerminal: true },
  ExpressDepositsSetup: { intent: 'flowStep' },
  NgLocalVerificationSetup: { intent: 'flowStep' },
  ReceiveLocalMomoSetup: { intent: 'flowStep' },
  ReceiveLocalReview: { intent: 'flowStep', flowStepTerminal: true },

  // Stack entry from tabs
  OpenCurrencyAccount: { intent: 'stackEntry' },
  Recipients: { intent: 'stackEntry' },
  Support: { intent: 'settingsLeaf' },
  Notifications: { intent: 'stackEntry' },
  AccountVerification: { intent: 'stackEntry' },
  Profile: { intent: 'stackEntry' },

  // Detail drill-down
  TransactionDetails: { intent: 'detail' },
  PayrollApproval: { intent: 'detail' },
  PayrollConnections: { intent: 'stackEntry' },
  PayrollConnectionDetail: { intent: 'detail' },
  PayrollInvitation: { intent: 'detail' },
  PayrollReceivingMethod: { intent: 'flowStep' },
  ReceiveTransactionDetails: { intent: 'detail' },
  TransactionCard: { intent: 'detail' },

  // Settings / profile leaf
  ChangePassword: { intent: 'settingsLeaf' },
  ChangePin: { intent: 'settingsLeaf' },
  MfaSetup: { intent: 'settingsLeaf', blockGesture: true },
  Legal: { intent: 'settingsLeaf' },
  AccountStatement: { intent: 'settingsLeaf' },
  InAppNotifications: { intent: 'settingsLeaf' },
}

export function getScreenTransitionEntry(routeName: string | undefined): ScreenTransitionEntry | undefined {
  if (!routeName) return undefined
  return SCREEN_TRANSITION_MAP[routeName as ScreenRouteName]
}

export function isHubRoute(routeName: string | undefined): boolean {
  const entry = getScreenTransitionEntry(routeName)
  return entry?.intent === 'flowHub' && !!entry.hubGroup
}

export function routesShareHubGroup(a: string | undefined, b: string | undefined): boolean {
  const entryA = getScreenTransitionEntry(a)
  const entryB = getScreenTransitionEntry(b)
  if (!entryA?.hubGroup || !entryB?.hubGroup) return false
  return entryA.hubGroup === entryB.hubGroup
}

export function isRouteInHubGroup(routeName: string | undefined, hubGroup: HubGroup): boolean {
  return HUB_GROUPS[hubGroup].includes(routeName as ScreenRouteName)
}

/** Send hub forward nav params that imply instant transition into SendAmount. */
export function sendHubForwardParams(params: Record<string, unknown> | undefined): boolean {
  if (!params) return false
  return params.fromSelectRecipient === true || params.fromSelectRecentRecipient === true
}

export function shouldUseFlowHubInstantTransition(_args: {
  routeName: string
  previousRouteName?: string
  routeParams?: Record<string, unknown>
}): boolean {
  // Hub instant transitions disable interactive swipe-back; use animated push instead.
  return false
}

export function resolveGestureEnabled(args: {
  routeName: string
  entry: ScreenTransitionEntry
  platform: 'ios' | 'android' | 'web'
}): boolean {
  const { entry, platform } = args
  if (platform === 'web') return false
  if (entry.blockGesture) return false

  switch (entry.intent) {
    case 'tabRoot':
    case 'modalSheet':
      return false
    case 'authGate':
      return entry.allowAuthSwipe === true
    case 'detail':
    case 'settingsLeaf':
    case 'stackEntry':
    case 'flowStep':
    case 'flowHub':
      return true
    default:
      return true
  }
}
