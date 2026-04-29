import React, { useMemo } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { ripple } from '../../lib/androidRipple'
import { NavigationProps } from '../../types'
import { useThemeColors } from '../../theme'
import type { Colors } from '../../theme'

function createSendMoneyStyles(palette: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: palette.background.primary,
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 20,
      color: palette.text.primary,
    },
    button: {
      backgroundColor: palette.primary.main,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
    },
    buttonText: {
      color: palette.neutral.white,
      fontSize: 16,
      fontWeight: '600',
    },
  })
}

export default function SendMoneyScreen({ navigation }: NavigationProps) {
  const palette = useThemeColors()
  const styles = useMemo(() => createSendMoneyStyles(palette), [palette])
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send Money</Text>
      <Pressable
       android_ripple={ripple.neutral}
        style={styles.button}
        onPress={() => navigation.navigate('Send')}
      >
        <Text style={styles.buttonText}>Start New Transfer</Text>
      </Pressable>
    </View>
  )
}
