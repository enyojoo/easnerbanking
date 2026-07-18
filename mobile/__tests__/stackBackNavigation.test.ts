import {
  exitSendFlowFromHub,
  exitToMainTabs,
  hasDuplicateStackTop,
  navigateStackBack,
} from '../src/navigation/stackBackNavigation'

describe('stackBackNavigation', () => {
  it('detects duplicate consecutive routes', () => {
    expect(
      hasDuplicateStackTop({
        index: 2,
        routes: [{ name: 'MainTabs' }, { name: 'ReceiveLocalAmount' }, { name: 'ReceiveLocalAmount' }],
      }),
    ).toBe(true)
    expect(
      hasDuplicateStackTop({
        index: 1,
        routes: [{ name: 'MainTabs' }, { name: 'Profile' }],
      }),
    ).toBe(false)
  })

  it('pops duplicate route on navigateStackBack', () => {
    const dispatch = jest.fn()
    const goBack = jest.fn()
    const navigation = {
      canGoBack: () => true,
      goBack,
      getState: () => ({
        index: 2,
        routes: [{ name: 'MainTabs' }, { name: 'ReceiveLocalAmount' }, { name: 'ReceiveLocalAmount' }],
      }),
      dispatch,
      navigate: jest.fn(),
    }
    navigateStackBack(navigation)
    expect(dispatch).toHaveBeenCalled()
    expect(goBack).not.toHaveBeenCalled()
  })

  it('goBack when stack is normal', () => {
    const goBack = jest.fn()
    const navigation = {
      canGoBack: () => true,
      goBack,
      getState: () => ({
        index: 1,
        routes: [{ name: 'MainTabs' }, { name: 'Profile' }],
      }),
      dispatch: jest.fn(),
      navigate: jest.fn(),
    }
    navigateStackBack(navigation)
    expect(goBack).toHaveBeenCalled()
  })

  it('exitSendFlowFromHub resets to Dashboard from recipient hub', () => {
    const dispatch = jest.fn()
    const navigation = {
      canGoBack: () => true,
      goBack: jest.fn(),
      getState: () => ({
        index: 1,
        routes: [{ name: 'MainTabs' }, { name: 'SelectRecentRecipient' }],
      }),
      dispatch,
      navigate: jest.fn(),
    }
    exitSendFlowFromHub(navigation)
    expect(dispatch).toHaveBeenCalled()
  })

  it('exitToMainTabs resets stack', () => {
    const dispatch = jest.fn()
    exitToMainTabs(
      {
        canGoBack: () => false,
        goBack: jest.fn(),
        getState: () => ({ index: 0, routes: [{ name: 'MainTabs' }] }),
        dispatch,
        navigate: jest.fn(),
      },
      'More',
    )
    expect(dispatch).toHaveBeenCalled()
  })
})
