import React from 'react'
import type { ComponentType } from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import { useScreenTransitionOptions } from './useScreenTransitionOptions'
import type { ScreenRouteName } from './screenTransitionRegistry'

const Stack = createStackNavigator()

type StackScreenWithTransitionProps = {
  name: ScreenRouteName
  component?: ComponentType<any>
  getComponent?: () => ComponentType<any>
  initialParams?: Record<string, unknown>
}

/** Stack.Screen wired to the transition resolver (one hook per screen). */
export function StackScreenWithTransition({
  name,
  component,
  getComponent,
  initialParams,
}: StackScreenWithTransitionProps) {
  const options = useScreenTransitionOptions(name)
  return (
    <Stack.Screen
      name={name}
      component={component}
      getComponent={getComponent}
      options={options}
      initialParams={initialParams}
    />
  )
}

export { Stack }
