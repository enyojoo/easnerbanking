import { Platform } from 'react-native'

const SENSITIVE_UPDATE_ROUTES = new Set([
  'PinEntry',
  'PinEntryGate',
  'PinSetup',
  'PinSetupGate',
  'SendPin',
  'SendConfirm',
  'MfaVerify',
  'MfaSetup',
  'ChangePin',
  'ChangePassword',
  'ExpressDepositAmount',
  'ExpressDepositPaymentSetup',
  'ExpressDepositReview',
  'ExpressDepositsSetup',
  'ReceiveLocalReview',
  'ReceiveLocalAmount',
])

export function isSensitiveAppUpdateRoute(routeName: string | undefined | null): boolean {
  if (!routeName) return false
  return SENSITIVE_UPDATE_ROUTES.has(routeName)
}

type UpdatesModule = typeof import('expo-updates')

function getUpdates(): UpdatesModule | null {
  if (Platform.OS === 'web') return null
  try {
    return require('expo-updates') as UpdatesModule
  } catch {
    return null
  }
}

export function isAppUpdatesEnabled(): boolean {
  const Updates = getUpdates()
  return Boolean(Updates?.isEnabled)
}

export function getAppUpdateId(): string | null {
  const Updates = getUpdates()
  if (!Updates?.isEnabled) return null
  return Updates.updateId ?? null
}

/** Download a waiting EAS Update. Returns true when a new bundle is ready to reload. */
export async function checkAndFetchAppUpdate(): Promise<boolean> {
  const Updates = getUpdates()
  if (!Updates?.isEnabled) return false
  try {
    const result = await Updates.checkForUpdateAsync()
    if (!result.isAvailable) return false
    const fetched = await Updates.fetchUpdateAsync()
    return Boolean(fetched.isNew)
  } catch {
    return false
  }
}

export async function reloadAppWithUpdate(): Promise<void> {
  const Updates = getUpdates()
  if (!Updates?.isEnabled) return
  try {
    await Updates.reloadAsync()
  } catch {
    // Keep the current session if reload fails.
  }
}
