import React, { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { CommonActions } from '@react-navigation/native'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles } from '../../theme'
import { extractWalletAddress } from '../../lib/extract-wallet-address'
import { useToast } from '../../components/ToastProvider'
import { haptics } from '../../lib/haptics'

/** Web fallback when camera QR scan is unavailable. */
export default function ScanWalletAddressScreen({ navigation }: NavigationProps) {
  const { showWarning } = useToast()
  const [value, setValue] = useState('')

  const handleClose = useCallback(() => {
    navigation.goBack()
  }, [navigation])

  const applyAddress = useCallback(
    (raw: string) => {
      const address = extractWalletAddress(raw.trim())
      if (!address) {
        showWarning('Paste a valid wallet address or QR payload.')
        return
      }
      const state = navigation.getState()
      const routes = state?.routes
      if (!routes || routes.length < 2) {
        navigation.goBack()
        return
      }
      const prevRoute = routes[routes.length - 2]
      navigation.dispatch(
        CommonActions.setParams({
          key: prevRoute.key,
          params: { scannedWalletAddress: address },
        }),
      )
      navigation.goBack()
    },
    [navigation, showWarning],
  )

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Paste wallet address</Text>
      <Text style={styles.subtitle}>
        Camera scanning is not available on web. Paste an address or QR code text instead.
      </Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="0x… or wallet address"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        multiline
      />
      <Pressable
        style={styles.primary}
        onPress={() => {
          haptics.tap()
          applyAddress(value)
        }}
      >
        <Text style={styles.primaryText}>Use address</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={handleClose}>
        <Text style={styles.secondaryText}>Cancel</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing[6],
    justifyContent: 'center',
    gap: spacing[4],
  },
  title: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: spacing[3],
    padding: spacing[4],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    backgroundColor: colors.semantic.card,
  },
  primary: {
    backgroundColor: colors.primary.main,
    borderRadius: spacing[4],
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  primaryText: {
    ...textStyles.titleMedium,
    color: colors.text.inverse,
    fontWeight: '600',
  },
  secondary: {
    alignItems: 'center',
    paddingVertical: spacing[3],
  },
  secondaryText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
})
