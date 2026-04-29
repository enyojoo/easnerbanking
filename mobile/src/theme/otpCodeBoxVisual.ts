import { Platform, StyleSheet } from 'react-native'
import { colors } from './colors'

/** Matches `spacing[2]` and `OtpCodeInput` / MFA six-digit layout. */
export const OTP_CODE_BOX_GAP = 8
export const OTP_CODE_BOX_W = 44
export const OTP_CODE_BOX_H = 48
/** Matches `borderRadius.xl` (16). */
const OTP_BOX_RADIUS = 16

/**
 * Shared six-digit code cell visuals (MFA `OtpCodeInput`, auth signup / forgot-password keypad flows).
 */
export const otpCodeBoxStyles = StyleSheet.create({
  boxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: OTP_CODE_BOX_GAP,
  },
  box: {
    width: OTP_CODE_BOX_W,
    height: OTP_CODE_BOX_H,
    borderRadius: OTP_BOX_RADIUS,
    /** Solid 1px so inactive cells read clearly (hairline was too faint on some surfaces). */
    borderWidth: 1,
    borderStyle: 'solid',
    backgroundColor: colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxIdle: {
    borderColor: colors.border.dark,
  },
  boxActive: {
    borderWidth: 1.5,
    borderColor: colors.primary.main,
  },
  digit: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 24,
    textAlign: 'center',
    minWidth: 12,
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  boxesLoadingOnly: {
    width: OTP_CODE_BOX_W * 6 + OTP_CODE_BOX_GAP * 5,
    height: OTP_CODE_BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
