import { createWebLazyScreen } from './createWebLazyScreen'

import SendAmountScreenNative from '../screens/send/SendAmountScreen'
import SelectRecentRecipientScreenNative from '../screens/send/SelectRecentRecipientScreen'
import ScanWalletAddressScreenNative from '../screens/recipients/ScanWalletAddressScreen'
import SelectRecipientScreenNative from '../screens/send/SelectRecipientScreen'
import SendConfirmScreenNative from '../screens/send/SendConfirmScreen'
import SendCrossBorderMomoSetupScreenNative from '../screens/send/SendCrossBorderMomoSetupScreen'
import SendPinScreenNative from '../screens/send/SendPinScreen'
import CardScreenNative from '../screens/main/CardScreen'
import ReceiveMoneyScreenNative from '../screens/receive/ReceiveMoneyScreen'
import ReceiveBankDetailsScreenNative from '../screens/receive/ReceiveBankDetailsScreen'
import ReceiveStablecoinDetailsScreenNative from '../screens/receive/ReceiveStablecoinDetailsScreen'
import ReceiveLocalRailScreenNative from '../screens/receive/ReceiveLocalRailScreen'
import ReceiveLocalAmountScreenNative from '../screens/receive/ReceiveLocalAmountScreen'
import ReceiveLocalReviewScreenNative from '../screens/receive/ReceiveLocalReviewScreen'
import ReceiveLocalMomoSetupScreenNative from '../screens/receive/ReceiveLocalMomoSetupScreen'
import ReceiveTransactionDetailsScreenNative from '../screens/receive/ReceiveTransactionDetailsScreen'
import AccountVerificationScreenNative from '../screens/verification/AccountVerificationScreen'
import RecipientsScreenNative from '../screens/main/RecipientsScreen'

export const SendAmountScreen = createWebLazyScreen(
  () => import('../screens/send/SendAmountScreen'),
  SendAmountScreenNative,
)
export const SelectRecentRecipientScreen = createWebLazyScreen(
  () => import('../screens/send/SelectRecentRecipientScreen'),
  SelectRecentRecipientScreenNative,
)
export const ScanWalletAddressScreen = createWebLazyScreen(
  () => import('../screens/recipients/ScanWalletAddressScreen'),
  ScanWalletAddressScreenNative,
)
export const SelectRecipientScreen = createWebLazyScreen(
  () => import('../screens/send/SelectRecipientScreen'),
  SelectRecipientScreenNative,
)
export const SendConfirmScreen = createWebLazyScreen(
  () => import('../screens/send/SendConfirmScreen'),
  SendConfirmScreenNative,
)
export const SendCrossBorderMomoSetupScreen = createWebLazyScreen(
  () => import('../screens/send/SendCrossBorderMomoSetupScreen'),
  SendCrossBorderMomoSetupScreenNative,
)
export const SendPinScreen = createWebLazyScreen(
  () => import('../screens/send/SendPinScreen'),
  SendPinScreenNative,
)
export const CardScreen = createWebLazyScreen(
  () => import('../screens/main/CardScreen'),
  CardScreenNative,
)
export const ReceiveMoneyScreen = createWebLazyScreen(
  () => import('../screens/receive/ReceiveMoneyScreen'),
  ReceiveMoneyScreenNative,
)
export const ReceiveBankDetailsScreen = createWebLazyScreen(
  () => import('../screens/receive/ReceiveBankDetailsScreen'),
  ReceiveBankDetailsScreenNative,
)
export const ReceiveStablecoinDetailsScreen = createWebLazyScreen(
  () => import('../screens/receive/ReceiveStablecoinDetailsScreen'),
  ReceiveStablecoinDetailsScreenNative,
)
export const ReceiveLocalRailScreen = createWebLazyScreen(
  () => import('../screens/receive/ReceiveLocalRailScreen'),
  ReceiveLocalRailScreenNative,
)
export const ReceiveLocalAmountScreen = createWebLazyScreen(
  () => import('../screens/receive/ReceiveLocalAmountScreen'),
  ReceiveLocalAmountScreenNative,
)
export const ReceiveLocalReviewScreen = createWebLazyScreen(
  () => import('../screens/receive/ReceiveLocalReviewScreen'),
  ReceiveLocalReviewScreenNative,
)
export const ReceiveLocalMomoSetupScreen = createWebLazyScreen(
  () => import('../screens/receive/ReceiveLocalMomoSetupScreen'),
  ReceiveLocalMomoSetupScreenNative,
)
export const ReceiveTransactionDetailsScreen = createWebLazyScreen(
  () => import('../screens/receive/ReceiveTransactionDetailsScreen'),
  ReceiveTransactionDetailsScreenNative,
)
export const AccountVerificationScreen = createWebLazyScreen(
  () => import('../screens/verification/AccountVerificationScreen'),
  AccountVerificationScreenNative,
)
export const RecipientsScreen = createWebLazyScreen(
  () => import('../screens/main/RecipientsScreen'),
  RecipientsScreenNative,
)
