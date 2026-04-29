import React, { useState } from 'react'
import { View, TextInput, Pressable, Platform, StyleSheet } from 'react-native'
import { Eye, EyeOff } from 'lucide-react-native'
import { colors } from '../theme'
import { ripple } from '../lib/androidRipple'
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
      <Pressable
        style={({ pressed }) => [
          styles.eyeButton,
          pressed && Platform.OS === 'ios' && styles.eyePressedIOS,
        ]}
        onPress={() => setShowPassword(!showPassword)}
        android_ripple={ripple.neutral}
      >
        {showPassword ? (
          <EyeOff size={20} color={colors.text.secondary} strokeWidth={2} />
        ) : (
          <Eye size={20} color={colors.text.secondary} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  eyeButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyePressedIOS: {
    opacity: 0.7,
  },
})
