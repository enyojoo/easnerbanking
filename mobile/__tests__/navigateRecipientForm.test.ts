import { getScreenTransitionEntry } from '../src/navigation/screenTransitionRegistry'
import {
  applyScannedWalletAddressToForm,
  collapseRecipientFormToSendAmount,
  consumePendingSendAmountParams,
  navigateToRecipientFormRail,
  popRecipientFormToList,
  recipientFormRouteForType,
} from '../src/lib/navigateRecipientForm'

afterEach(() => {
  consumePendingSendAmountParams()
})

describe('navigateRecipientForm', () => {
  it('maps recipient types to rail routes', () => {
    expect(recipientFormRouteForType('bank')).toBe('AddBankRecipient')
    expect(recipientFormRouteForType('mobile')).toBe('AddMobileRecipient')
    expect(recipientFormRouteForType('wallet')).toBe('AddWalletRecipient')
    expect(recipientFormRouteForType('easenet')).toBe('AddEasenetRecipient')
  })

  it('drops type and form routes so back from SendAmount returns to the hub', () => {
    const dispatch = jest.fn()
    const navigation = {
      getState: () => ({
        index: 3,
        routes: [
          { name: 'MainTabs', key: 'tabs' },
          { name: 'SelectRecentRecipient', key: 'hub' },
          { name: 'AddRecipientType', key: 'type' },
          { name: 'AddBankRecipient', key: 'form' },
        ],
      }),
      dispatch,
      navigate: jest.fn(),
    }

    collapseRecipientFormToSendAmount(navigation, { recipient: { id: 'draft-1' } })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(dispatch.mock.calls[0][0])).toContain('POP')
    expect(navigation.navigate).toHaveBeenCalledWith(
      'SendAmount',
      expect.objectContaining({ recipient: { id: 'draft-1' } }),
    )
  })

  it('writes the scanned address onto AddWalletRecipient then pops', () => {
    const dispatch = jest.fn()
    const goBack = jest.fn()
    applyScannedWalletAddressToForm(
      {
        getState: () => ({
          index: 2,
          routes: [
            { name: 'SelectRecentRecipient', key: 'hub' },
            { name: 'AddWalletRecipient', key: 'wallet' },
            { name: 'ScanWalletAddress', key: 'scan' },
          ],
        }),
        dispatch,
        navigate: jest.fn(),
        goBack,
      },
      '0xabc',
    )

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(dispatch.mock.calls[0][0])).toContain('0xabc')
    expect(JSON.stringify(dispatch.mock.calls[0][0])).toContain('wallet')
    expect(goBack).toHaveBeenCalled()
  })

  it('pushes a fresh rail from the type picker', () => {
    const dispatch = jest.fn()
    navigateToRecipientFormRail(
      {
        getState: () => ({ index: 0, routes: [] }),
        dispatch,
        navigate: jest.fn(),
      },
      'bank',
      { mode: 'draft' },
    )
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(dispatch.mock.calls[0][0])).toContain('AddBankRecipient')
    expect(JSON.stringify(dispatch.mock.calls[0][0])).toContain('PUSH')
  })

  it('pops type and form back to the list', () => {
    const dispatch = jest.fn()
    popRecipientFormToList({
      getState: () => ({
        index: 2,
        routes: [
          { name: 'Recipients', key: 'list' },
          { name: 'AddRecipientType', key: 'type' },
          { name: 'AddBankRecipient', key: 'form' },
        ],
      }),
      dispatch,
      navigate: jest.fn(),
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(dispatch.mock.calls[0][0])).toContain('POP')
  })
})

describe('recipient form screen transitions', () => {
  it('presents the type picker as a sheet and rails as flow steps', () => {
    expect(getScreenTransitionEntry('AddRecipientType')?.intent).toBe('modalSheet')
    expect(getScreenTransitionEntry('AddBankRecipient')?.intent).toBe('flowStep')
    expect(getScreenTransitionEntry('AddMobileRecipient')?.intent).toBe('flowStep')
    expect(getScreenTransitionEntry('AddWalletRecipient')?.intent).toBe('flowStep')
    expect(getScreenTransitionEntry('AddEasenetRecipient')?.intent).toBe('flowStep')
  })
})
