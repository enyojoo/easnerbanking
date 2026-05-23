import { routeManualPayInScreen, type ManualPayInScreenRoute } from '@easner/shared'

export function manualPayInScreenName(route: ManualPayInScreenRoute): string {
  switch (route) {
    case 'bank':
      return 'VirtualBankAccount'
    case 'mobile_money':
      return 'MobileMoney'
    case 'open_banking':
      return 'OpenBanking'
    case 'stablecoin':
      return 'Stablecoin'
    case 'qr':
      return 'VirtualBankAccount'
    default:
      return 'VirtualBankAccount'
  }
}

export function resolveManualPayInNavigation(pmType: string): string {
  return manualPayInScreenName(routeManualPayInScreen(pmType))
}
