import React from 'react'
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native'
import { ripple } from '../../lib/androidRipple'
import { NavigationProps } from '../../types'

export default function SendMoneyScreen({ navigation }: NavigationProps) {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
})
