import React from 'react'
import { Platform, View, TextInput, Pressable, StyleSheet } from 'react-native'
import { ScanLine } from 'lucide-react-native'
import { colors, spacing, borderRadius, compactFormInputStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'

type WalletAddressFieldProps = {
  value: string
  onChangeText: (text: string) => void
  onScanPress?: () => void
  placeholder?: string
  editable?: boolean
}

export function WalletAddressField({
  value,
  onChangeText,
  onScanPress,
  placeholder = 'Wallet Address',
  editable = true,
}: WalletAddressFieldProps) {
  const showScan = Platform.OS !== 'web' && Boolean(onScanPress)

  return (
    <View style={styles.wrap}>
      <TextInput
        style={[styles.input, showScan ? styles.inputWithScan : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.secondary}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {showScan ? (
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.scanButton}
          onPress={onScanPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Scan wallet address QR code"
        >
          <ScanLine size={20} color={colors.primary.main} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginBottom: spacing[4],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    ...compactFormInputStyle,
    color: colors.text.primary,
    backgroundColor: colors.frame.background,
  },
  inputWithScan: {
    paddingRight: spacing[12],
  },
  scanButton: {
    position: 'absolute',
    right: spacing[3],
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
  },
})
