/**
 * Warm recipient add screens off the navigation animation.
 *
 * Call type-screen preload from Add `onPressIn`. Call rails after the type
 * sheet has settled (`InteractionManager.runAfterInteractions`). Do not
 * `require()` these from App boot or Dashboard idle.
 */
let didType = false
let didRails = false

export function preloadRecipientTypeScreen(): void {
  if (didType) return
  didType = true
  try {
    require('../screens/recipients/AddRecipientTypeScreen')
  } catch (error) {
    didType = false
    console.warn('preloadRecipientTypeScreen', error)
  }
}

export function preloadRecipientFormRails(): void {
  if (didRails) return
  didRails = true
  try {
    require('../screens/recipients/AddBankRecipientScreen')
    require('../screens/recipients/AddMobileRecipientScreen')
    require('../screens/recipients/AddWalletRecipientScreen')
    require('../screens/recipients/AddEasenetRecipientScreen')
  } catch (error) {
    didRails = false
    console.warn('preloadRecipientFormRails', error)
  }
}
