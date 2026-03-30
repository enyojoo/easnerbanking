import React, { useState } from 'react'
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'
import { authScreenStyles } from '../theme/authScreen'

interface PasswordInputProps {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  style?: any
  containerStyle?: any
}

export default function PasswordInput({
  value,
  onChangeText,
  placeholder = 'Enter password',
  style,
  containerStyle,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <View style={[authScreenStyles.passwordOuter, containerStyle]}>
      <TextInput
        style={[authScreenStyles.passwordInner, style]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        passwordRules="minlength: 6;"
        importantForAutofill="yes"
        underlineColorAndroid="transparent"
        selectionColor={colors.primary.main}
        placeholderTextColor={colors.text.secondary}
        returnKeyType="done"
      />
      <TouchableOpacity
        style={styles.eyeButton}
        onPress={() => setShowPassword(!showPassword)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={showPassword ? 'eye-off' : 'eye'}
          size={20}
          color={colors.text.secondary}
        />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  eyeButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
