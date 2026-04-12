import { Platform } from 'react-native'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'

export const BACKGROUND_TASK_IDENTIFIER = 'background-task'

if (Platform.OS === 'ios' || Platform.OS === 'android') {
  TaskManager.defineTask(BACKGROUND_TASK_IDENTIFIER, async () => {
    try {
      const now = Date.now()
      console.log(`Got background task call at date: ${new Date(now).toISOString()}`)
      // TODO: Read-side refresh (balances, recent transactions, etc.) when product-ready
    } catch (error) {
      console.error('Failed to execute the background task:', error)
      return BackgroundTask.BackgroundTaskResult.Failed
    }
    return BackgroundTask.BackgroundTaskResult.Success
  })
}

export async function registerBackgroundTaskAsync() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return
  return BackgroundTask.registerTaskAsync(BACKGROUND_TASK_IDENTIFIER, {
    minimumInterval: 12 * 60,
  })
}

export async function unregisterBackgroundTaskAsync() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return
  return BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_IDENTIFIER)
}

/** Dev / debug only — no-op outside `__DEV__` or on web. */
export async function triggerBackgroundTaskWorkerForTestingAsync() {
  if (!__DEV__) return
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return
  await BackgroundTask.triggerTaskWorkerForTestingAsync()
}
