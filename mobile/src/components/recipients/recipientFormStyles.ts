import { Platform, StyleSheet } from 'react-native'
import {
  borderRadius,
  colors,
  compactFormInputStyle,
  dropdownSearchInputStyle,
  dropdownSearchRowStyle,
  fontFamily,
  shadows,
  spacing,
  surfaceChromeCircleStyle,
  surfaceFrameStyle,
  textStyles,
} from '../../theme'

export const recipientFormStyles = StyleSheet.create({
  modalFormBody: {
    flex: 1,
    minHeight: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flowBackButton: {
    ...surfaceChromeCircleStyle(colors, 40),
    marginRight: spacing[3],
  },
  flowHeaderTitle: {
    flex: 1,
  },
  modalScrollView: {
    flex: 1,
    minHeight: 0,
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  modalContent: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    position: 'relative',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    ...compactFormInputStyle,
    color: colors.text.primary,
    marginBottom: spacing[4],
    backgroundColor: colors.frame.background,
  },
  modalInputFlush: {
    marginBottom: 0,
  },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing[2],
  },
  modalButtonsFooter: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  modalButton: {
    flex: 1,
    padding: spacing[3],
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  cancelButton: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
  },
  saveButton: {
    backgroundColor: colors.primary.main,
  },
  cancelButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  saveButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
  disabledButton: {
    opacity: 0.6,
  },
  walletAddressInputWrap: {
    marginBottom: spacing[4],
  },
  walletAddressInput: {
    marginBottom: 0,
  },
  walletNicknameInput: {
    paddingRight: spacing[4],
  },
  currencySelectorWrapper: {
    marginBottom: spacing[4],
    zIndex: 1000,
  },
  currencySelectorWrapperActive: {
    zIndex: 4000,
  },
  currencySelector: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    padding: spacing[3],
  },
  currencySelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySelectorText: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginLeft: spacing[2],
    fontFamily: fontFamily.regular,
  },
  currencyDropdownSearch: {
    ...dropdownSearchRowStyle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  currencyDropdownSearchInput: {
    ...dropdownSearchInputStyle,
    color: colors.text.primary,
  },
  currencyDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    gap: spacing[2],
  },
  currencyDropdownItemSelected: {
    backgroundColor: colors.primary.main + '10',
  },
  currencyFlag: {
    fontSize: 16,
  },
  currencyInfo: {
    flex: 1,
    marginLeft: spacing[2],
  },
  cryptoIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: spacing[2],
  },
  currencyCode: {
    ...textStyles.bodyMedium,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  currencyName: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing[0],
    fontFamily: fontFamily.regular,
  },
  recipientTypeModal: {
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
  },
  recipientTypeOptions: {
    padding: spacing[5],
    gap: spacing[3],
  },
  recipientTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
    padding: spacing[4],
    gap: spacing[3],
  },
  recipientTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipientTypeContent: {
    flex: 1,
  },
  recipientTypeTitle: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  recipientTypeSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing[1],
    fontFamily: fontFamily.regular,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    ...textStyles.textInputMedium,
    color: colors.text.primary,
    paddingVertical: spacing[3],
  },
  easenetHandleRowMargin: {
    marginBottom: spacing[2],
  },
  easenetAtPrefix: {
    ...textStyles.textInputMedium,
    color: colors.primary.main,
  },
  errorContainer: {
    backgroundColor: colors.error.background,
    borderColor: colors.error.light,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    textAlign: 'center',
  },
  infoBox: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.md }),
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  infoText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  halfInput: {
    flex: 1,
    marginBottom: 0,
  },
})

export function recipientFormModalTitle(type: string | null, showScanner: boolean): string {
  if (showScanner && type === 'wallet') return 'Scan wallet address'
  if (type === 'wallet') return 'Add Wallet Address'
  if (type === 'mobile') return 'Add Mobile Money'
  if (type === 'easenet') return 'Add Easetag recipient'
  return 'Add Bank Account'
}

export function recipientFormScreenTitle(type: string | null, editing: boolean): string {
  if (!editing) return recipientFormModalTitle(type, false)
  if (type === 'wallet') return 'Edit Wallet Address'
  if (type === 'mobile') return 'Edit Mobile Money'
  if (type === 'easenet') return 'Edit Easetag recipient'
  return 'Edit Bank Account'
}
