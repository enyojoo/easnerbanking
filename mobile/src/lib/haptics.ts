import * as ExpoHaptics from 'expo-haptics'
import { Presets } from 'react-native-pulsar'

type FallbackKind = 'tap' | 'medium' | 'heavy' | 'select' | 'success' | 'error'

function expoFallback(kind: FallbackKind) {
  const map: Record<FallbackKind, () => Promise<void>> = {
    tap: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light),
    medium: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium),
    heavy: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy),
    select: () => ExpoHaptics.selectionAsync(),
    success: () => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success),
    error: () => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error),
  }
  void map[kind]().catch(() => {})
}

function runPulsar(fn: () => void, fallback: FallbackKind) {
  try {
    fn()
  } catch {
    expoFallback(fallback)
  }
}

/** Semantic haptic feedback — Pulsar with expo-haptics fallback. */
export const haptics = {
  tap: () => runPulsar(() => Presets.System.impactLight(), 'tap'),
  medium: () => runPulsar(() => Presets.System.impactMedium(), 'medium'),
  heavy: () => runPulsar(() => Presets.System.impactHeavy(), 'heavy'),
  select: () => runPulsar(() => Presets.System.selection(), 'select'),
  success: () => runPulsar(() => Presets.System.notificationSuccess(), 'success'),
  error: () => runPulsar(() => Presets.System.notificationError(), 'error'),
  /** Money movement / strong confirm */
  confirm: () => runPulsar(() => Presets.coinDrop(), 'medium'),
}
