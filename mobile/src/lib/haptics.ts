import * as ExpoHaptics from 'expo-haptics'

type HapticKind = 'tap' | 'medium' | 'heavy' | 'select' | 'success' | 'error'

function trigger(kind: HapticKind) {
  const map: Record<HapticKind, () => Promise<void>> = {
    tap: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light),
    medium: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium),
    heavy: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy),
    select: () => ExpoHaptics.selectionAsync(),
    success: () => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success),
    error: () => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error),
  }
  void map[kind]().catch(() => {})
}

/** Cross-platform haptic feedback via expo-haptics (iOS + Android). */
export const haptics = {
  tap: () => trigger('tap'),
  medium: () => trigger('medium'),
  heavy: () => trigger('heavy'),
  select: () => trigger('select'),
  success: () => trigger('success'),
  error: () => trigger('error'),
  /** Money movement / strong confirm */
  confirm: () => trigger('medium'),
}
