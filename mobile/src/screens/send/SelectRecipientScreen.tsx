import { useLayoutEffect } from 'react'
import { NavigationProps } from '../../types'

/**
 * Legacy stack route: immediately opens the unified send recipient hub.
 * Keeps old deep links and any stale navigation targets working.
 */
export default function SelectRecipientScreen({ navigation, route }: NavigationProps) {
  useLayoutEffect(() => {
    navigation.replace('SelectRecentRecipient' as never, (route.params ?? {}) as never)
  }, [navigation, route])

  return null
}
