import { AccessibilityInfo } from 'react-native'

/**
 * When false, skip decorative entrance animations (opacity / translateY).
 * Functional motion (PIN shake, success scale) may still run.
 */
export async function shouldPlayDecorativeMotionEnter(): Promise<boolean> {
  try {
    const reduce = await AccessibilityInfo.isReduceMotionEnabled()
    return !reduce
  } catch {
    return true
  }
}
