import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import OnboardingScreen from '../screens/onboarding/OnboardingScreen'
import { staticScreenTransitionOptions } from './useScreenTransitionOptions'
import { webStackScreenListeners } from './webStackScreenListeners'

const Stack = createStackNavigator()

const FLOW_STACK_SCREEN_OPTIONS = {
  headerShown: false,
} as const

export function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={FLOW_STACK_SCREEN_OPTIONS} screenListeners={webStackScreenListeners}>
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={staticScreenTransitionOptions('Onboarding')}
      />
    </Stack.Navigator>
  )
}
